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
