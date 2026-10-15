import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  MAX_ORDER_REQUEST_LENGTH,
  cleanRequestText,
  orderRequestRecipients,
  renderOrderRequestEmail,
  type OrderRequestRow,
} from "./shared"

describe("order requests (Jose, 15 Oct 2026)", () => {
  test("request text is tidied and capped", () => {
    assert.equal(cleanRequestText("  white wine\n vinegar   for tomorrow "), "white wine vinegar for tomorrow")
    assert.equal(cleanRequestText("x".repeat(MAX_ORDER_REQUEST_LENGTH + 50)).length, MAX_ORDER_REQUEST_LENGTH)
    assert.equal(cleanRequestText("   "), "")
  })

  test("the end-of-day email goes to Jose for Beach House and nowhere else by default", () => {
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", {}), ["jseluis957@gmail.com"])
    assert.deepEqual(orderRequestRecipients("BURLEIGH", {}), [])
    assert.deepEqual(orderRequestRecipients("TEA_GARDEN", {}), [])
  })

  test("an environment override replaces the list, and an empty one switches it off", () => {
    assert.deepEqual(
      orderRequestRecipients("BEACH_HOUSE", { ORDER_REQUEST_TO_BEACH_HOUSE: "chef@tarte.com.au, chloe@tarte.com.au" }),
      ["chef@tarte.com.au", "chloe@tarte.com.au"]
    )
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", { ORDER_REQUEST_TO_BEACH_HOUSE: "" }), [])
    assert.deepEqual(orderRequestRecipients("BURLEIGH", { ORDER_REQUEST_TO_BURLEIGH: "vini@tarte.com.au" }), ["vini@tarte.com.au"])
  })

  test("the email lists open requests newest first and counts today's", () => {
    // 5pm Brisbane on 15 Oct 2026 = 07:00 UTC
    const now = new Date("2026-10-15T07:00:00Z")
    const open: OrderRequestRow[] = [
      { id: "a", text: "Detergent", createdBy: "Michel", createdAt: "2026-10-14T05:10:00Z", done: false, doneBy: null, doneAt: null },
      { id: "b", text: "White wine vinegar for tomorrow", createdBy: "Michel", createdAt: "2026-10-15T03:30:00Z", done: false, doneBy: null, doneAt: null },
    ]
    const mail = renderOrderRequestEmail({ venue: "BEACH_HOUSE", open, now })
    assert.equal(mail.subject, "Beach House order requests: 2 to order (1 new today)")
    const lines = mail.text.split("\n").filter((l) => l.startsWith("- "))
    assert.equal(lines.length, 2)
    assert.match(lines[0], /^- White wine vinegar for tomorrow \(Michel, /)
    assert.match(lines[1], /^- Detergent \(Michel, /)
    assert.match(mail.html, /White wine vinegar for tomorrow/)
    assert.match(mail.html, /kitchen\/restock\/orders\?venue=BEACH_HOUSE/)
    // Brisbane day boundary: 11pm UTC on the 14th is already the 15th in Brisbane
    const late = renderOrderRequestEmail({
      venue: "BEACH_HOUSE",
      open: [{ ...open[0], createdAt: "2026-10-14T23:00:00Z" }],
      now,
    })
    assert.equal(late.subject, "Beach House order requests: 1 to order (1 new today)")
  })

  test("one request reads singular", () => {
    const mail = renderOrderRequestEmail({
      venue: "BEACH_HOUSE",
      open: [{ id: "a", text: "Detergent", createdBy: null, createdAt: "2026-10-10T05:10:00Z", done: false, doneBy: null, doneAt: null }],
      now: new Date("2026-10-15T07:00:00Z"),
    })
    assert.equal(mail.subject, "Beach House order requests: 1 to order")
    assert.match(mail.html, /1 thing to order/)
  })
})

// ─── Added by test-guard, 15 Oct 2026 ───────────────────────────────────────

describe("order request recipients from the environment", () => {
  test("spaces, blank entries and trailing commas are tidied away", () => {
    assert.deepEqual(
      orderRequestRecipients("BEACH_HOUSE", { ORDER_REQUEST_TO_BEACH_HOUSE: "  jose@tarte.com.au ,, chloe@tarte.com.au , " }),
      ["jose@tarte.com.au", "chloe@tarte.com.au"]
    )
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", { ORDER_REQUEST_TO_BEACH_HOUSE: "   " }), [], "whitespace-only override switches it off")
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", { ORDER_REQUEST_TO_BEACH_HOUSE: " , , " }), [])
  })

  test("one venue's override never leaks into another's, and BOTH gets nobody", () => {
    const env = { ORDER_REQUEST_TO_BURLEIGH: "vini@tarte.com.au" }
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", env), ["jseluis957@gmail.com"])
    assert.deepEqual(orderRequestRecipients("TEA_GARDEN", env), [])
    assert.deepEqual(orderRequestRecipients("BOTH", env), [])
    // undefined value (key present but unset) behaves like no override
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", { ORDER_REQUEST_TO_BEACH_HOUSE: undefined }), ["jseluis957@gmail.com"])
  })
})

describe("order request text and email edges", () => {
  test("a cut at the cap never ends in a space, and tabs or newlines collapse", () => {
    const padded = "a".repeat(MAX_ORDER_REQUEST_LENGTH - 1) + " bbbbb"
    const out = cleanRequestText(padded)
    assert.ok(out.length < MAX_ORDER_REQUEST_LENGTH)
    assert.equal(out, "a".repeat(MAX_ORDER_REQUEST_LENGTH - 1))
    assert.equal(cleanRequestText("Anchor\tbutter\n5kg\r\n x2"), "Anchor butter 5kg x2")
  })

  test("Brisbane midnight decides what counts as today, not UTC midnight", () => {
    const now = new Date("2026-10-15T07:00:00Z") // 5pm Brisbane, 15 Oct
    const row = (createdAt: string): OrderRequestRow => ({ id: createdAt, text: "Bridor croissants, carton of 60", createdBy: "Jose", createdAt, done: false, doneBy: null, doneAt: null })
    // 14 Oct 14:00 UTC is 15 Oct 00:00 Brisbane: today
    const atMidnight = renderOrderRequestEmail({ venue: "BEACH_HOUSE", open: [row("2026-10-14T14:00:00Z")], now })
    assert.equal(atMidnight.subject, "Beach House order requests: 1 to order (1 new today)")
    // One second earlier is still the 14th in Brisbane
    const justBefore = renderOrderRequestEmail({ venue: "BEACH_HOUSE", open: [row("2026-10-14T13:59:59Z")], now })
    assert.equal(justBefore.subject, "Beach House order requests: 1 to order")
    // 15 Oct 23:30 UTC is already 16 Oct in Brisbane, and UTC-today would wrongly say "today"
    const tomorrowUtc = renderOrderRequestEmail({ venue: "BEACH_HOUSE", open: [row("2026-10-15T23:30:00Z")], now: new Date("2026-10-15T07:00:00Z") })
    assert.equal(tomorrowUtc.subject, "Beach House order requests: 1 to order")
  })

  test("request text is escaped in the HTML and kept raw in the plain text", () => {
    const mail = renderOrderRequestEmail({
      venue: "BURLEIGH",
      open: [{ id: "a", text: "Anchor butter 5kg <unsalted> & cream", createdBy: "Vini", createdAt: "2026-10-15T01:00:00Z", done: false, doneBy: null, doneAt: null }],
      now: new Date("2026-10-15T07:00:00Z"),
    })
    assert.match(mail.html, /Anchor butter 5kg &lt;unsalted&gt; &amp; cream/)
    assert.doesNotMatch(mail.html, /<unsalted>/)
    assert.match(mail.text, /- Anchor butter 5kg <unsalted> & cream \(Vini, /)
    assert.match(mail.text, /kitchen\/restock\/orders\?venue=BURLEIGH/)
  })

  test("an empty list renders without crashing and says zero (the caller is what skips sending)", () => {
    const mail = renderOrderRequestEmail({ venue: "TEA_GARDEN", open: [], now: new Date("2026-10-15T07:00:00Z") })
    assert.equal(mail.subject, "Tea Garden order requests: 0 to order")
    assert.match(mail.html, /0 things to order/)
    assert.equal(mail.text.split("\n").filter((l) => l.startsWith("- ")).length, 0)
  })
})
