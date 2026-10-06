import { test } from "node:test"
import assert from "node:assert/strict"
import { parseCookieInput, hasSessionCookie, parseHomepageDaily, parseTodayMetrics } from "./client"

test("parseCookieInput: bare header value, cookie: line, and a Copy-as-cURL paste", () => {
  assert.equal(parseCookieInput("sid=abc; csid=def"), "sid=abc; csid=def")
  assert.equal(parseCookieInput("  sid=abc;csid=def;  "), "sid=abc; csid=def")
  assert.equal(parseCookieInput("Cookie: sid=abc; csid=def"), "sid=abc; csid=def")
  const curl = `curl 'https://merchants.ubereats.com/manager/api/getTodaySalesMetrics?localeCode=en-GB' \\
  -H 'accept: application/json' \\
  -H 'cookie: _ua=1; sid=QA.x.y; csid=1.2' \\
  -H 'x-csrf-token: x' \\
  --data-raw '{"a":1}'`
  assert.equal(parseCookieInput(curl), "_ua=1; sid=QA.x.y; csid=1.2")
  assert.equal(parseCookieInput("curl 'https://x' -b 'sid=1; csid=2' -H 'accept: */*'"), "sid=1; csid=2")
  assert.equal(parseCookieInput("curl 'https://x' -H $'cookie: sid=1; csid=2'"), "sid=1; csid=2")
  assert.equal(parseCookieInput(""), null)
  assert.equal(parseCookieInput("just some words"), null)
})

test("hasSessionCookie needs sid", () => {
  assert.equal(hasSessionCookie("sid=abc; csid=def"), true)
  assert.equal(hasSessionCookie("csid=def; _ua=1"), false)
  assert.equal(hasSessionCookie("csid=def; sid=1"), true)
})

test("parseHomepageDaily: one row per day, orders joined by date", () => {
  const rows = parseHomepageDaily({
    status: "success",
    data: { salesByMetric: {
      SALES: { current: [{ timestamp: "2026-10-05", value: 0 }, { timestamp: "2026-10-06", value: 522.75 }] },
      ORDER_VOLUME: { current: [{ timestamp: "2026-10-05", value: 0 }, { timestamp: "2026-10-06", value: 16 }] },
    } },
  })
  assert.deepEqual(rows, [{ date: "2026-10-05", sales: 0, orders: 0 }, { date: "2026-10-06", sales: 522.75, orders: 16 }])
  assert.throws(() => parseHomepageDaily({ status: "failure", data: { message: "nope" } }), /Uber: nope/)
})

test("parseTodayMetrics", () => {
  assert.deepEqual(parseTodayMetrics({ status: "success", data: { totalSales: 522.75, totalOrders: 16, avgTicketSize: 32.671875 } }), { sales: 522.75, orders: 16, avgTicket: 32.67 })
  assert.throws(() => parseTodayMetrics({}), /unexpected/)
})

// ---------------------------------------------------------------- test-guard additions
// Pastes Chloe is likely to produce beyond the three happy paths above, plus
// the response shapes that would silently show $0 on the Sales page.

import { uberErrorMessage } from "./client"

test("parseCookieInput: DevTools 'Copy request headers' block picks the cookie line", () => {
  const headers = `GET /manager/api/getTodaySalesMetrics?localeCode=en-GB HTTP/2
Host: merchants.ubereats.com
Accept: application/json
Cookie: _ua=1; sid=QA.abc==; csid=1.2
X-Csrf-Token: x`
  assert.equal(parseCookieInput(headers), "_ua=1; sid=QA.abc==; csid=1.2")
})

test("parseCookieInput: double-quoted -H and the long --cookie flag", () => {
  assert.equal(parseCookieInput(`curl "https://x" -H "cookie: sid=1; csid=2" -H "accept: */*"`), "sid=1; csid=2")
  assert.equal(parseCookieInput(`curl 'https://x' --cookie 'sid=1; csid=2'`), "sid=1; csid=2")
})

test("parseCookieInput: -b wins over a later -H cookie, and a cURL with no cookie at all is null", () => {
  assert.equal(parseCookieInput(`curl 'https://x' -b 'sid=fromB' -H 'cookie: sid=fromH'`), "sid=fromB")
  assert.equal(parseCookieInput(`curl 'https://merchants.ubereats.com/x' -H 'accept: application/json' --data-raw '{"a":1}'`), null)
})

test("parseCookieInput: bare cookie split over lines, base64 padding, trailing semicolon, whitespace only", () => {
  assert.equal(parseCookieInput("sid=QA.abc==;\ncsid=1.2;"), "sid=QA.abc==; csid=1.2")
  assert.equal(parseCookieInput("sid=abc;"), "sid=abc")
  assert.equal(parseCookieInput("   \n  "), null)
  // stray fragments without '=' are dropped, the rest kept
  assert.equal(parseCookieInput("cookie: sid=abc; junk; csid=def"), "sid=abc; csid=def")
})

test("hasSessionCookie: csid and _sid are not sid; no-space separators count", () => {
  assert.equal(hasSessionCookie("_sid=1; csid=2"), false)
  assert.equal(hasSessionCookie("csid=1;sid=2"), true)
  assert.equal(hasSessionCookie(""), false)
  assert.equal(hasSessionCookie("sid"), false)
})

test("parseHomepageDaily: hourly timestamps dropped, missing ORDER_VOLUME is 0 orders, null value is $0", () => {
  const rows = parseHomepageDaily({
    status: "success",
    data: { salesByMetric: {
      SALES: { current: [
        { timestamp: "2026-10-06T09:00:00", value: 99 },   // hourly bucket, not a day
        { timestamp: "2026-10-06", value: null },
        { timestamp: "2026-10-07", value: 33.333 },
      ] },
    } },
  })
  assert.deepEqual(rows, [{ date: "2026-10-06", sales: 0, orders: 0 }, { date: "2026-10-07", sales: 33.33, orders: 0 }])
})

test("parseHomepageDaily: SALES drives the rows; orders without a sales row are ignored; empty SALES is []", () => {
  const rows = parseHomepageDaily({
    status: "success",
    data: { salesByMetric: {
      SALES: { current: [{ timestamp: "2026-10-06", value: 522.745 }] },
      ORDER_VOLUME: { current: [{ timestamp: "2026-10-06", value: 16 }, { timestamp: "2026-10-05", value: 4 }] },
    } },
  })
  assert.deepEqual(rows, [{ date: "2026-10-06", sales: 522.75, orders: 16 }])
  assert.deepEqual(parseHomepageDaily({ status: "success", data: { salesByMetric: {} } }), [])
})

test("parseHomepageDaily: success without salesByMetric, null and a login-page-shaped object all throw", () => {
  assert.throws(() => parseHomepageDaily({ status: "success", data: {} }), /unexpected response/)
  assert.throws(() => parseHomepageDaily(null), /unexpected response/)
  assert.throws(() => parseHomepageDaily(undefined), /unexpected response/)
  assert.throws(() => parseHomepageDaily({ status: "failure", data: { message: "Unauthorized" } }), /^Error: Uber: Unauthorized$/)
})

test("parseTodayMetrics: empty data is all zeros, negative (refund-heavy) day survives, half-cent rounds up", () => {
  assert.deepEqual(parseTodayMetrics({ status: "success", data: {} }), { sales: 0, orders: 0, avgTicket: 0 })
  assert.deepEqual(parseTodayMetrics({ status: "success", data: { totalSales: -12.5, totalOrders: 0, avgTicketSize: 0 } }), { sales: -12.5, orders: 0, avgTicket: 0 })
  assert.deepEqual(parseTodayMetrics({ status: "success", data: { totalSales: 26.905, totalOrders: 1, avgTicketSize: 26.905 } }), { sales: 26.91, orders: 1, avgTicket: 26.91 })
  assert.throws(() => parseTodayMetrics({ status: "success", data: null }), /unexpected/)
  assert.throws(() => parseTodayMetrics(null), /unexpected/)
  assert.throws(() => parseTodayMetrics({ status: "failure", data: { message: "session expired" } }), /Uber: session expired/)
})

test("uberErrorMessage: uses Uber's message when present, generic otherwise", () => {
  assert.equal(uberErrorMessage({ status: "failure", data: { message: "nope" } }), "Uber: nope")
  assert.equal(uberErrorMessage({ status: "failure", data: {} }), "Uber returned an unexpected response")
  assert.equal(uberErrorMessage("<html>login</html>"), "Uber returned an unexpected response")
})
