import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  MAX_ORDER_REQUEST_LENGTH,
  cleanRequestText,
  matchCatalogue,
  orderRequestRecipients,
  parseQty,
  productDetail,
  qtyLabel,
  renderOrderRequestEmail,
  type CatalogueChoice,
  type OrderRequestRow,
} from "./shared"

describe("order requests (Jose, 15 Oct 2026)", () => {
  test("request text is tidied and capped", () => {
    assert.equal(cleanRequestText("  white wine\n vinegar   for tomorrow "), "white wine vinegar for tomorrow")
    assert.equal(cleanRequestText("x".repeat(MAX_ORDER_REQUEST_LENGTH + 50)).length, MAX_ORDER_REQUEST_LENGTH)
    assert.equal(cleanRequestText("   "), "")
  })

  test("the end-of-day email goes to Jose for Beach House and nowhere else by default", () => {
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", {}), ["jseluis957@gmail.com"])
    assert.deepEqual(orderRequestRecipients("BURLEIGH", "KITCHEN", {}), [])
    assert.deepEqual(orderRequestRecipients("TEA_GARDEN", "KITCHEN", {}), [])
  })

  test("an environment override replaces the list, and an empty one switches it off", () => {
    assert.deepEqual(
      orderRequestRecipients("BEACH_HOUSE", "KITCHEN", { ORDER_REQUEST_TO_BEACH_HOUSE: "chef@tarte.com.au, chloe@tarte.com.au" }),
      ["chef@tarte.com.au", "chloe@tarte.com.au"]
    )
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", { ORDER_REQUEST_TO_BEACH_HOUSE: "" }), [])
    assert.deepEqual(orderRequestRecipients("BURLEIGH", "KITCHEN", { ORDER_REQUEST_TO_BURLEIGH: "vini@tarte.com.au" }), ["vini@tarte.com.au"])
  })

  test("the email lists open requests newest first and counts today's", () => {
    // 5pm Brisbane on 15 Oct 2026 = 07:00 UTC
    const now = new Date("2026-10-15T07:00:00Z")
    const open: OrderRequestRow[] = [
      { id: "a", text: "Detergent", createdBy: "Michel", createdAt: "2026-10-14T05:10:00Z", done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null, dept: "KITCHEN", qty: null },
      { id: "b", text: "White wine vinegar for tomorrow", createdBy: "Michel", createdAt: "2026-10-15T03:30:00Z", done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null, dept: "KITCHEN", qty: null },
    ]
    const mail = renderOrderRequestEmail({ venue: "BEACH_HOUSE", open, now })
    assert.equal(mail.subject, "Beach House order requests: 2 to order (1 new today)")
    const lines = mail.text.split("\n").filter((l) => l.startsWith("- "))
    assert.equal(lines.length, 2)
    assert.match(lines[0], /^- White wine vinegar for tomorrow \[not on the order list\] \(Michel, /)
    assert.match(lines[1], /^- Detergent \[not on the order list\] \(Michel, /)
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
      open: [{ id: "a", text: "Detergent", createdBy: null, createdAt: "2026-10-10T05:10:00Z", done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null, dept: "KITCHEN", qty: null }],
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
      orderRequestRecipients("BEACH_HOUSE", "KITCHEN", { ORDER_REQUEST_TO_BEACH_HOUSE: "  jose@tarte.com.au ,, chloe@tarte.com.au , " }),
      ["jose@tarte.com.au", "chloe@tarte.com.au"]
    )
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", { ORDER_REQUEST_TO_BEACH_HOUSE: "   " }), [], "whitespace-only override switches it off")
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", { ORDER_REQUEST_TO_BEACH_HOUSE: " , , " }), [])
  })

  test("one venue's override never leaks into another's, and BOTH gets nobody", () => {
    const env = { ORDER_REQUEST_TO_BURLEIGH: "vini@tarte.com.au" }
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", env), ["jseluis957@gmail.com"])
    assert.deepEqual(orderRequestRecipients("TEA_GARDEN", "KITCHEN", env), [])
    assert.deepEqual(orderRequestRecipients("BOTH", "KITCHEN", env), [])
    // undefined value (key present but unset) behaves like no override
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", { ORDER_REQUEST_TO_BEACH_HOUSE: undefined }), ["jseluis957@gmail.com"])
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
    const row = (createdAt: string): OrderRequestRow => ({ id: createdAt, text: "Bridor croissants, carton of 60", createdBy: "Jose", createdAt, done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null, dept: "KITCHEN", qty: null })
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
      open: [{ id: "a", text: "Anchor butter 5kg <unsalted> & cream", createdBy: "Vini", createdAt: "2026-10-15T01:00:00Z", done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null, dept: "KITCHEN", qty: null }],
      now: new Date("2026-10-15T07:00:00Z"),
    })
    assert.match(mail.html, /Anchor butter 5kg &lt;unsalted&gt; &amp; cream/)
    assert.doesNotMatch(mail.html, /<unsalted>/)
    assert.match(mail.text, /- Anchor butter 5kg <unsalted> & cream \[not on the order list\] \(Vini, /)
    assert.match(mail.text, /kitchen\/restock\/orders\?venue=BURLEIGH/)
  })

  test("an empty list renders without crashing and says zero (the caller is what skips sending)", () => {
    const mail = renderOrderRequestEmail({ venue: "TEA_GARDEN", open: [], now: new Date("2026-10-15T07:00:00Z") })
    assert.equal(mail.subject, "Tea Garden order requests: 0 to order")
    assert.match(mail.html, /0 things to order/)
    assert.equal(mail.text.split("\n").filter((l) => l.startsWith("- ")).length, 0)
  })
})

describe("picking the product from the order list (Chloe, 15 Oct 2026)", () => {
  const items: CatalogueChoice[] = [
    { id: "1", name: "Vinegar White Wine 5L", supplier: "Bidfood", packSize: "5L", category: "Pantry", dept: "KITCHEN" },
    { id: "2", name: "White Wine Vinegar (Provedores)", supplier: "The Provedores", packSize: "2L", category: "Pantry", dept: "KITCHEN" },
    { id: "3", name: "Detergent Dishwasher 20L", supplier: "Bidfood", packSize: "20L", category: "Cleaning", dept: "KITCHEN" },
    { id: "4", name: "Wine Red Cooking 1L", supplier: "Bidfood", packSize: "1L", category: "Pantry", dept: "KITCHEN" },
    { id: "5", name: "Butter Unsalted USA 25kg (Fermex)", supplier: "Fermex", packSize: "25kg", category: "Dairy", dept: "PASTRY" },
  ]

  test("needs two characters, then every word typed must appear", () => {
    assert.deepEqual(matchCatalogue(items, "w"), [])
    assert.deepEqual(matchCatalogue(items, "white wine vinegar").map((i) => i.id), ["2", "1"])
    assert.deepEqual(matchCatalogue(items, "vinegar white").map((i) => i.id), ["1", "2"])
    assert.deepEqual(matchCatalogue(items, "wine").map((i) => i.id), ["4", "1", "2"])
  })

  test("a name that starts with the words leads, then contains, then supplier or category", () => {
    assert.deepEqual(matchCatalogue(items, "deter").map((i) => i.id), ["3"])
    assert.deepEqual(matchCatalogue(items, "bidfood").map((i) => i.id), ["3", "1", "4"])
    assert.deepEqual(matchCatalogue(items, "cleaning").map((i) => i.id), ["3"])
    assert.deepEqual(matchCatalogue(items, "fermex butter").map((i) => i.id), ["5"])
  })

  test("limit and nothing-matches", () => {
    assert.equal(matchCatalogue(items, "bidfood", 2).length, 2)
    assert.deepEqual(matchCatalogue(items, "piping bags"), [])
    assert.deepEqual(matchCatalogue([], "wine"), [])
  })

  test("product detail reads supplier and pack, or nothing for a typed request", () => {
    assert.equal(productDetail({ supplier: "Bidfood", packSize: "5L" }), "Bidfood · 5L")
    assert.equal(productDetail({ supplier: "Fermex", packSize: null }), "Fermex")
    assert.equal(productDetail({ supplier: null, packSize: null }), null)
  })

  test("the email says which supplier and pack, and marks typed requests", () => {
    const now = new Date("2026-10-15T07:00:00Z")
    const open: OrderRequestRow[] = [
      { id: "a", text: "Vinegar White Wine 5L", approvedItemId: "1", supplier: "Bidfood", packSize: "5L", note: "for tomorrow", dept: "KITCHEN", qty: null, createdBy: "Michel", createdAt: "2026-10-15T03:30:00Z", done: false, doneBy: null, doneAt: null },
      { id: "b", text: "Blue roll", approvedItemId: null, supplier: null, packSize: null, note: null, dept: "KITCHEN", qty: null, createdBy: null, createdAt: "2026-10-14T03:30:00Z", done: false, doneBy: null, doneAt: null },
    ]
    const mail = renderOrderRequestEmail({ venue: "BEACH_HOUSE", open, now })
    assert.match(mail.text, /- Vinegar White Wine 5L \[Bidfood · 5L\] "for tomorrow" \(Michel, /)
    assert.match(mail.text, /- Blue roll \[not on the order list\] \(/)
    assert.match(mail.html, /Bidfood · 5L/)
    assert.match(mail.html, /not on the order list, typed in/)
  })
})

// ─── Added by test-guard, 15 Oct 2026: catalogue matcher edges ──────────────

describe("catalogue matcher edges (test-guard, 15 Oct 2026)", () => {
  const items: CatalogueChoice[] = [
    { id: "bf-butter", name: "Anchor Butter Unsalted 5kg", supplier: "Bidfood", packSize: "5kg", category: "Dairy", dept: "PASTRY" },
    { id: "pfd-butter", name: "Anchor Butter Unsalted 5kg", supplier: "PFD", packSize: "5kg", category: "Dairy", dept: "PASTRY" },
    { id: "aa-butter", name: "Anchor Butter Unsalted 5kg", supplier: "AA Fresh", packSize: "5kg", category: "Dairy", dept: "PASTRY" },
    { dept: "KITCHEN", id: "croissant", name: "Croissant Butter 90g (Bridor)", supplier: "Bridor", packSize: "carton of 60", category: "Bakery" },
    { id: "prov-vin", name: "White Wine Vinegar (Provedores)", supplier: "The Provedores", packSize: "2L", category: "Pantry", dept: "KITCHEN" },
    { dept: "KITCHEN", id: "blue-roll", name: "Blue Roll Centrefeed", supplier: "Bunzl", packSize: null, category: null },
    { id: "cream", name: "Cream Pure 35% 10L", supplier: "Bidfood", packSize: "10L", category: "Dairy", dept: "PASTRY" },
  ]
  const ids = (q: string, limit?: number) => matchCatalogue(items, q, limit).map((i) => i.id)

  test("case does not matter, in the query or the catalogue", () => {
    assert.deepEqual(ids("ANCHOR BUTTER"), ["aa-butter", "bf-butter", "pfd-butter"])
    assert.deepEqual(ids("white wine vinegar"), ids("White Wine VINEGAR"))
    assert.deepEqual(ids("bUnZl"), ["blue-roll"])
  })

  test("punctuation in a name is matched literally, and the bare word matches too", () => {
    assert.deepEqual(ids("(provedores)"), ["prov-vin"])
    assert.deepEqual(ids("provedores"), ["prov-vin"])
    assert.deepEqual(ids("(bridor)"), ["croissant"])
    assert.deepEqual(ids("35%"), ["cream"])
    // a stray bracket that is in nobody's name matches nothing rather than crashing
    assert.deepEqual(ids("((("), [])
  })

  test("extra spaces, tabs and newlines in the query collapse to single words", () => {
    assert.deepEqual(ids("   white    wine   "), ids("white wine"))
    assert.deepEqual(ids("white\twine\nvinegar"), ["prov-vin"])
    // a query of only whitespace is nothing typed
    assert.deepEqual(ids("      "), [])
    // one real character padded with spaces is still under the two-character floor
    assert.deepEqual(ids("  b  "), [])
  })

  test("a two-character query is enough, and a two-word query where each word is one letter is not special", () => {
    // "an" starts the three Anchor butters (score 0), and also sits inside "Croissant" and the "Pantry" category
    assert.deepEqual(ids("an"), ["aa-butter", "bf-butter", "pfd-butter", "croissant", "prov-vin"])
    // "a b": the collapsed query is 3 chars so it runs; "a" and "b" appear in all butter names and the croissant
    assert.ok(ids("a b").length >= 4)
  })

  test("limit 0 returns nothing, limit 1 returns the best one, default is eight", () => {
    assert.deepEqual(ids("anchor", 0), [])
    assert.deepEqual(ids("anchor", 1), ["aa-butter"])
    const many: CatalogueChoice[] = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      name: `Flour Bakers ${String(i).padStart(2, "0")}kg`,
      supplier: "Manildra",
      packSize: null,
      category: "Dry",
      dept: "PASTRY" as const,
    }))
    assert.equal(matchCatalogue(many, "flour").length, 8)
    assert.equal(matchCatalogue(many, "flour", 20).length, 20)
    assert.equal(matchCatalogue(many, "flour", 100).length, 20)
  })

  test("the same product name across suppliers lists every supplier, alphabetically", () => {
    const out = matchCatalogue(items, "anchor butter unsalted 5kg")
    assert.deepEqual(
      out.map((i) => [i.id, i.supplier]),
      [
        ["aa-butter", "AA Fresh"],
        ["bf-butter", "Bidfood"],
        ["pfd-butter", "PFD"],
      ]
    )
    // naming the supplier narrows it to that one
    assert.deepEqual(ids("anchor pfd"), ["pfd-butter"])
    assert.deepEqual(ids("pfd"), ["pfd-butter"])
  })

  test("a word only found in the pack size or supplier still matches, behind name matches", () => {
    // "carton" is only in the croissant pack size
    assert.deepEqual(ids("carton"), ["croissant"])
    // "60" only in pack size, "croissant" in name: score 3 (not all words in name) but still the only hit
    assert.deepEqual(ids("croissant 60"), ["croissant"])
    // "butter" in every butter name and the croissant name; "bidfood" only in one supplier
    assert.deepEqual(ids("butter bidfood"), ["bf-butter"])
    // a name match outranks a supplier-only match for the same word
    assert.deepEqual(ids("bridor"), ["croissant"])
  })

  test("null pack size and null category never break matching or ranking", () => {
    assert.deepEqual(ids("blue roll"), ["blue-roll"])
    assert.deepEqual(ids("centrefeed"), ["blue-roll"])
    // the word "null" must not accidentally match items whose pack/category is missing
    assert.deepEqual(ids("null"), [])
  })

  test("ranking: starts-with beats contains beats all-words-in-name beats supplier-or-category", () => {
    const ranked: CatalogueChoice[] = [
      { id: "contains", name: "Vinegar White Wine 5L", supplier: "Bidfood", packSize: "5L", category: "Pantry", dept: "KITCHEN" },
      { dept: "KITCHEN", id: "category", name: "Oil Olive Extra Virgin 4L", supplier: "Bidfood", packSize: "4L", category: "White Wine" },
      { id: "starts", name: "White Wine Vinegar (Provedores)", supplier: "The Provedores", packSize: "2L", category: "Pantry", dept: "KITCHEN" },
      { id: "scattered", name: "Wine Cooking White 1L", supplier: "Bidfood", packSize: "1L", category: "Pantry", dept: "KITCHEN" },
    ]
    assert.deepEqual(
      matchCatalogue(ranked, "white wine").map((i) => i.id),
      ["starts", "contains", "scattered", "category"]
    )
  })
})

describe("email row for a picked product with a note", () => {
  test("a picked product shows supplier and pack, a note in quotes, and never the typed-in tag", () => {
    const row: OrderRequestRow = {
      id: "r1",
      dept: "KITCHEN",
      qty: null,
      text: "Anchor Butter Unsalted 5kg",
      approvedItemId: "bf-butter",
      supplier: "Bidfood",
      packSize: "5kg",
      note: "didn't arrive with Tuesday's delivery",
      createdBy: "Michel",
      createdAt: "2026-10-15T01:00:00Z",
      done: false,
      doneBy: null,
      doneAt: null,
    }
    const mail = renderOrderRequestEmail({ venue: "BURLEIGH", open: [row], now: new Date("2026-10-15T07:00:00Z") })
    assert.match(mail.text, /- Anchor Butter Unsalted 5kg \[Bidfood · 5kg\] "didn't arrive with Tuesday's delivery" \(Michel, /)
    assert.doesNotMatch(mail.text, /not on the order list/)
    assert.doesNotMatch(mail.html, /not on the order list/)
    assert.match(mail.html, /Bidfood · 5kg/)
    // the note is HTML-escaped (apostrophe is fine, but angle brackets must not pass through raw)
    const nasty = renderOrderRequestEmail({
      venue: "BURLEIGH",
      open: [{ ...row, note: "<b>urgent</b>" }],
      now: new Date("2026-10-15T07:00:00Z"),
    })
    assert.doesNotMatch(nasty.html, /<b>urgent<\/b>/)
    assert.match(nasty.html, /&lt;b&gt;urgent&lt;\/b&gt;/)
  })

  test("a supplier with no pack size reads as the supplier alone, in the email and the detail line", () => {
    assert.equal(productDetail({ supplier: "Bunzl", packSize: null }), "Bunzl")
    assert.equal(productDetail({ supplier: null, packSize: "5kg" }), "5kg")
    assert.equal(productDetail({ supplier: "", packSize: "" }), null)
    const mail = renderOrderRequestEmail({
      venue: "TEA_GARDEN",
      open: [{ dept: "KITCHEN", qty: null, id: "x", text: "Blue Roll Centrefeed", approvedItemId: "blue-roll", supplier: "Bunzl", packSize: null, note: null, createdBy: null, createdAt: "2026-10-15T01:00:00Z", done: false, doneBy: null, doneAt: null }],
      now: new Date("2026-10-15T07:00:00Z"),
    })
    assert.match(mail.text, /- Blue Roll Centrefeed \[Bunzl\] \(/)
  })
})

describe("quantity and department on a request (Chloe, 15 Oct 2026)", () => {
  test("parseQty takes whole or decimal packs and nothing else", () => {
    assert.equal(parseQty("2"), 2)
    assert.equal(parseQty(" 1,5 "), 1.5)
    assert.equal(parseQty("0.333"), 0.33)
    assert.equal(parseQty(""), null)
    assert.equal(parseQty("0"), null)
    assert.equal(parseQty("-2"), null)
    assert.equal(parseQty("two"), null)
    assert.equal(parseQty(null), null)
  })

  test("qtyLabel reads 2 ×, 1.5 ×, or nothing", () => {
    assert.equal(qtyLabel(2), "2 ×")
    assert.equal(qtyLabel(1.5), "1.5 ×")
    assert.equal(qtyLabel(null), "")
  })

  test("pastry's list leads with pastry's products at the same match strength, hides none", () => {
    const items: CatalogueChoice[] = [
      { id: "k", name: "Butter Salted Anchor 5kg", supplier: "Bidfood", packSize: "5kg", category: "Dairy", dept: "KITCHEN" },
      { id: "p", name: "Butter Unsalted USA 25kg (Fermex)", supplier: "Fermex", packSize: "25kg", category: "Dairy", dept: "PASTRY" },
    ]
    assert.deepEqual(matchCatalogue(items, "butter", 8, "PASTRY").map((i) => i.id), ["p", "k"])
    assert.deepEqual(matchCatalogue(items, "butter", 8, "KITCHEN").map((i) => i.id), ["k", "p"])
    assert.deepEqual(matchCatalogue(items, "butter").map((i) => i.id), ["k", "p"])
    // A stronger name match still beats the preferred department
    assert.deepEqual(matchCatalogue(items, "butter anchor", 8, "PASTRY").map((i) => i.id), ["k"])
  })

  test("pastry recipients are separate from the kitchen's, and empty until set", () => {
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "PASTRY", {}), [])
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "PASTRY", { ORDER_REQUEST_TO_PASTRY_BEACH_HOUSE: "jess@tarte.com.au" }), ["jess@tarte.com.au"])
    // The kitchen's venue override does not leak into pastry
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "PASTRY", { ORDER_REQUEST_TO_BEACH_HOUSE: "chef@tarte.com.au" }), [])
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", { ORDER_REQUEST_TO_BEACH_HOUSE: "chef@tarte.com.au" }), ["chef@tarte.com.au"])
  })

  test("the email carries the quantity and names the department", () => {
    const now = new Date("2026-10-15T07:00:00Z")
    const open: OrderRequestRow[] = [
      { id: "a", dept: "PASTRY", qty: 2, text: "Plain Flour (Manildra)", approvedItemId: "1", supplier: "Fermex", packSize: "12.5kg bag", note: null, createdBy: "Jess", createdAt: "2026-10-15T03:30:00Z", done: false, doneBy: null, doneAt: null },
    ]
    const mail = renderOrderRequestEmail({ venue: "BURLEIGH", dept: "PASTRY", open, now })
    assert.equal(mail.subject, "Bakery pastry order requests: 1 to order (1 new today)")
    assert.match(mail.text, /- 2 × Plain Flour \(Manildra\) \[Fermex · 12.5kg bag\] \(Jess, /)
    assert.match(mail.html, /orders\?venue=BURLEIGH&amp;dept=PASTRY|orders\?venue=BURLEIGH&dept=PASTRY/)
  })
})

// ─── Added by test-guard, 15 Oct 2026: quantity and recipient edges ─────────

describe("parseQty rounding and sizes", () => {
  test("rounds to two decimals, half up, and keeps float dust out", () => {
    assert.equal(parseQty("0.333"), 0.33)
    assert.equal(parseQty("0.335"), 0.34)
    assert.equal(parseQty("2.999"), 3)
    assert.equal(parseQty("1.005"), 1, "float 1.005 is just under, rounds down like a calculator")
    assert.equal(parseQty("12.5"), 12.5)
    assert.equal(parseQty(" 0.1 "), 0.1)
  })

  test("a quantity that rounds away to nothing is no quantity, not zero", () => {
    assert.equal(parseQty("0.004"), null)
    assert.equal(parseQty("0.001"), null)
    assert.equal(parseQty("0.005"), 0.01, "half a hundredth rounds up to the smallest quantity")
    assert.equal(parseQty("0.00"), null)
  })

  test("large values pass through whole: 60 cartons, 1000 packs, exponent notation", () => {
    assert.equal(parseQty("60"), 60)
    assert.equal(parseQty("1000"), 1000)
    assert.equal(parseQty("99999999"), 99999999)
    assert.equal(parseQty("1e3"), 1000)
    assert.equal(parseQty("Infinity"), null)
    assert.equal(parseQty("NaN"), null)
  })

  test("a comma is a decimal point (1,5 packs), so a thousands comma reads as a decimal", () => {
    assert.equal(parseQty("1,5"), 1.5)
    assert.equal(parseQty("1,000"), 1)
    assert.equal(parseQty("1,5,0"), null, "a second comma is not a number")
    assert.equal(parseQty("2 x"), null)
    assert.equal(parseQty("x2"), null)
    assert.equal(parseQty(undefined), null)
    assert.equal(parseQty("  "), null)
  })

  test("qtyLabel trims trailing zeros and shows big numbers whole", () => {
    assert.equal(qtyLabel(2.25), "2.25 ×")
    assert.equal(qtyLabel(0.1 + 0.2), "0.3 ×")
    assert.equal(qtyLabel(1000), "1000 ×")
    assert.equal(qtyLabel(0.5), "0.5 ×")
    assert.equal(qtyLabel(60), "60 ×")
  })
})

describe("recipients: the legacy ORDER_REQUEST_TO_<VENUE> is the kitchen's only", () => {
  const legacy = { ORDER_REQUEST_TO_BEACH_HOUSE: "chef@tarte.com.au", ORDER_REQUEST_TO_BURLEIGH: "vini@tarte.com.au" }

  test("the kitchen reads it; no other department does, and they get nobody by default", () => {
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", legacy), ["chef@tarte.com.au"])
    assert.deepEqual(orderRequestRecipients("BURLEIGH", "KITCHEN", legacy), ["vini@tarte.com.au"])
    for (const dept of ["PASTRY", "COFFEE_BAR", "FRONT_OF_HOUSE"] as const) {
      assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", dept, legacy), [], dept)
      assert.deepEqual(orderRequestRecipients("BURLEIGH", dept, legacy), [], dept)
      assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", dept, {}), [], `${dept} has no built-in default`)
    }
  })

  test("the department-specific key wins over the legacy one, even when empty", () => {
    const both = { ...legacy, ORDER_REQUEST_TO_KITCHEN_BEACH_HOUSE: "jose@tarte.com.au" }
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", both), ["jose@tarte.com.au"])
    const off = { ...legacy, ORDER_REQUEST_TO_KITCHEN_BEACH_HOUSE: "" }
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", off), [], "empty specific key switches it off despite the legacy value")
    // Specific key unset (undefined) falls through to legacy
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "KITCHEN", { ...legacy, ORDER_REQUEST_TO_KITCHEN_BEACH_HOUSE: undefined }), ["chef@tarte.com.au"])
  })

  test("the department defaults to the kitchen when not given, so the old cron call still reaches Jose", () => {
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", undefined, {}), ["jseluis957@gmail.com"])
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", undefined, legacy), ["chef@tarte.com.au"])
  })

  test("pastry's key for one venue never reaches another venue or the kitchen", () => {
    const env = { ORDER_REQUEST_TO_PASTRY_BURLEIGH: "jess@tarte.com.au" }
    assert.deepEqual(orderRequestRecipients("BURLEIGH", "PASTRY", env), ["jess@tarte.com.au"])
    assert.deepEqual(orderRequestRecipients("BEACH_HOUSE", "PASTRY", env), [])
    assert.deepEqual(orderRequestRecipients("BURLEIGH", "KITCHEN", env), [])
    assert.deepEqual(orderRequestRecipients("BOTH", "PASTRY", env), [])
  })
})

describe("the email with quantities and departments", () => {
  const now = new Date("2026-10-15T07:00:00Z")
  const row = (over: Partial<OrderRequestRow>): OrderRequestRow => ({
    id: "r",
    dept: "KITCHEN",
    qty: null,
    text: "Anchor Butter Unsalted 5kg",
    approvedItemId: "bf-butter",
    supplier: "Bidfood",
    packSize: "5kg",
    note: null,
    createdBy: "Michel",
    createdAt: "2026-10-15T01:00:00Z",
    done: false,
    doneBy: null,
    doneAt: null,
    ...over,
  })

  test("a fractional quantity and a missing one both read cleanly, text and html", () => {
    const mail = renderOrderRequestEmail({
      venue: "BEACH_HOUSE",
      open: [row({ id: "a", qty: 1.5 }), row({ id: "b", qty: null, text: "Bridor Croissant 90g carton of 60", createdAt: "2026-10-15T00:00:00Z" })],
      now,
    })
    assert.match(mail.text, /- 1\.5 × Anchor Butter Unsalted 5kg \[Bidfood · 5kg\] \(Michel, /)
    assert.match(mail.text, /- Bridor Croissant 90g carton of 60 \[Bidfood · 5kg\]/)
    assert.doesNotMatch(mail.text, /- {2}Bridor|null ×|undefined/)
    assert.match(mail.html, /1\.5 × Anchor Butter Unsalted 5kg/)
    // the kitchen's email keeps the plain venue name and the plain URL
    assert.equal(mail.subject, "Beach House order requests: 2 to order (2 new today)")
    assert.doesNotMatch(mail.html, /dept=/)
  })

  test("another department names itself in the subject and links to its own list", () => {
    const mail = renderOrderRequestEmail({ venue: "TEA_GARDEN", dept: "COFFEE_BAR", open: [row({ dept: "COFFEE_BAR", qty: 60 })], now })
    assert.equal(mail.subject, "Tea Garden coffee & bar order requests: 1 to order (1 new today)")
    assert.match(mail.text, /- 60 × Anchor Butter/)
    assert.match(mail.text, /orders\?venue=TEA_GARDEN&dept=COFFEE_BAR/)
  })
})

describe("catalogue preference by department", () => {
  const items: CatalogueChoice[] = [
    { id: "p-flour", name: "Flour Plain 12.5kg", supplier: "Manildra", packSize: "12.5kg", category: "Baking", dept: "PASTRY" },
    { id: "k-flour", name: "Flour Plain 12.5kg", supplier: "Bidfood", packSize: "12.5kg", category: "Pantry", dept: "KITCHEN" },
    { id: "k-corn", name: "Flour Corn 1kg", supplier: "Bidfood", packSize: "1kg", category: "Pantry", dept: "KITCHEN" },
    { id: "p-rice", name: "Rice Flour 1kg", supplier: "Manildra", packSize: "1kg", category: "Baking", dept: "PASTRY" },
  ]
  const ids = (q: string, dept?: CatalogueChoice["dept"] | null, limit?: number) => matchCatalogue(items, q, limit ?? 8, dept).map((i) => i.id)

  test("null or no preference ranks by match strength then name then supplier", () => {
    assert.deepEqual(ids("flour"), ["k-corn", "k-flour", "p-flour", "p-rice"])
    assert.deepEqual(ids("flour", null), ids("flour"))
  })

  test("own department first at equal strength; the other's identical product is still listed", () => {
    assert.deepEqual(ids("flour", "PASTRY"), ["p-flour", "k-corn", "k-flour", "p-rice"])
    assert.deepEqual(ids("flour", "KITCHEN"), ["k-corn", "k-flour", "p-flour", "p-rice"])
    // a department with nothing in the catalogue changes nothing
    assert.deepEqual(ids("flour", "FRONT_OF_HOUSE"), ids("flour"))
  })

  test("a small limit keeps the preferred department's product, not the alphabetical one", () => {
    assert.deepEqual(ids("flour plain", "PASTRY", 1), ["p-flour"])
    assert.deepEqual(ids("flour plain", "KITCHEN", 1), ["k-flour"])
  })
})
