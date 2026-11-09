// Uber Eats sales, the no-paste route (8 Nov 2026).
// Runs INSIDE Chloe's signed-in Uber Eats Manager tab (merchants.ubereats.com)
// through Claude in Chrome's javascript_tool. It asks Uber for the last 7
// Brisbane days of daily sales for both Tarte shops, using the same endpoint
// and body as Kitchen's own sync (src/lib/uber/client.ts fetchDailySales).
// The browser sends its own login; only the numbers come back.
// Result: a JSON string {"signedIn":true|false,"rows":[{date,venue,sales,orders}],"errors":[...]}
// Save that string to a file and run: npx tsx scripts/uber-chrome-ingest.ts <file>
await (async () => {
  const STORES = {
    "d6b633f2-1f41-52b2-b605-2c40d6128a83": "BURLEIGH",
    "e6b038aa-1239-5c30-a2b1-d0eb980fd851": "BEACH_HOUSE",
  }
  const A = "+10:00"
  const brisbane = (offsetDays) => new Date(Date.now() + 10 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10)
  const from = brisbane(-6)
  const to = brisbane(0)
  const out = { signedIn: true, from, to, rows: [], errors: [] }
  if (location.hostname !== "merchants.ubereats.com") {
    out.signedIn = false
    out.errors.push("not on Uber Eats Manager (signed out?)")
    return JSON.stringify(out)
  }
  for (const [uuid, venue] of Object.entries(STORES)) {
    const body = {
      userTimezoneOffset: -600,
      currPeriod: { start: `${from}T00:00:00.000${A}`, end: `${to}T23:59:59.999${A}`, timeUnit: "day" },
      prevPeriod: { start: `${from}T00:00:00.000${A}`, end: `${to}T23:59:59.999${A}`, timeUnit: "day" },
      restaurantUuids: [uuid], userUuid: null, dominantCurrencyCode: "AUD", isUMetricQueries: true,
      areAllLocationsChecked: false, showCustomersV2Card: false, areSelectedLocationsGroceryRetailOnly: false,
    }
    try {
      const r = await fetch("/manager/api/getHomepageDataV2?localeCode=en-GB", {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": "x" }, body: JSON.stringify(body),
      })
      if (r.status === 401 || r.status === 403 || (r.redirected && !r.url.includes("merchants.ubereats.com"))) {
        out.signedIn = false
        out.errors.push(`${venue}: Uber says signed out (HTTP ${r.status})`)
        continue
      }
      let j
      try { j = await r.json() } catch { out.signedIn = false; out.errors.push(`${venue}: Uber sent a login page, not data`); continue }
      if (j.status !== "success" || !j.data || !j.data.salesByMetric) { out.errors.push(`${venue}: ${String(j.data && j.data.message || "unexpected answer").slice(0, 120)}`); continue }
      const sales = (j.data.salesByMetric.SALES && j.data.salesByMetric.SALES.current) || []
      const orders = new Map(((j.data.salesByMetric.ORDER_VOLUME && j.data.salesByMetric.ORDER_VOLUME.current) || []).map((x) => [x.timestamp, x.value]))
      for (const x of sales) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.timestamp)) continue
        out.rows.push({ date: x.timestamp, venue, sales: Math.round((x.value || 0) * 100) / 100, orders: Math.round(orders.get(x.timestamp) || 0) })
      }
    } catch (e) {
      out.errors.push(`${venue}: ${String(e).slice(0, 120)}`)
    }
  }
  return JSON.stringify(out)
})()
