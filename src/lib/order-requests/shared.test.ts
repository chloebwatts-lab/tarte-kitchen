import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  MAX_ORDER_REQUEST_LENGTH,
  cleanRequestText,
  matchCatalogue,
  orderRequestRecipients,
  productDetail,
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
      { id: "a", text: "Detergent", createdBy: "Michel", createdAt: "2026-10-14T05:10:00Z", done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null },
      { id: "b", text: "White wine vinegar for tomorrow", createdBy: "Michel", createdAt: "2026-10-15T03:30:00Z", done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null },
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
      open: [{ id: "a", text: "Detergent", createdBy: null, createdAt: "2026-10-10T05:10:00Z", done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null }],
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
    const row = (createdAt: string): OrderRequestRow => ({ id: createdAt, text: "Bridor croissants, carton of 60", createdBy: "Jose", createdAt, done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null })
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
      open: [{ id: "a", text: "Anchor butter 5kg <unsalted> & cream", createdBy: "Vini", createdAt: "2026-10-15T01:00:00Z", done: false, doneBy: null, doneAt: null, approvedItemId: null, supplier: null, packSize: null, note: null }],
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
    { id: "1", name: "Vinegar White Wine 5L", supplier: "Bidfood", packSize: "5L", category: "Pantry" },
    { id: "2", name: "White Wine Vinegar (Provedores)", supplier: "The Provedores", packSize: "2L", category: "Pantry" },
    { id: "3", name: "Detergent Dishwasher 20L", supplier: "Bidfood", packSize: "20L", category: "Cleaning" },
    { id: "4", name: "Wine Red Cooking 1L", supplier: "Bidfood", packSize: "1L", category: "Pantry" },
    { id: "5", name: "Butter Unsalted USA 25kg (Fermex)", supplier: "Fermex", packSize: "25kg", category: "Dairy" },
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
      { id: "a", text: "Vinegar White Wine 5L", approvedItemId: "1", supplier: "Bidfood", packSize: "5L", note: "for tomorrow", createdBy: "Michel", createdAt: "2026-10-15T03:30:00Z", done: false, doneBy: null, doneAt: null },
      { id: "b", text: "Blue roll", approvedItemId: null, supplier: null, packSize: null, note: null, createdBy: null, createdAt: "2026-10-14T03:30:00Z", done: false, doneBy: null, doneAt: null },
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
    { id: "bf-butter", name: "Anchor Butter Unsalted 5kg", supplier: "Bidfood", packSize: "5kg", category: "Dairy" },
    { id: "pfd-butter", name: "Anchor Butter Unsalted 5kg", supplier: "PFD", packSize: "5kg", category: "Dairy" },
    { id: "aa-butter", name: "Anchor Butter Unsalted 5kg", supplier: "AA Fresh", packSize: "5kg", category: "Dairy" },
    { id: "croissant", name: "Croissant Butter 90g (Bridor)", supplier: "Bridor", packSize: "carton of 60", category: "Bakery" },
    { id: "prov-vin", name: "White Wine Vinegar (Provedores)", supplier: "The Provedores", packSize: "2L", category: "Pantry" },
    { id: "blue-roll", name: "Blue Roll Centrefeed", supplier: "Bunzl", packSize: null, category: null },
    { id: "cream", name: "Cream Pure 35% 10L", supplier: "Bidfood", packSize: "10L", category: "Dairy" },
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
      { id: "contains", name: "Vinegar White Wine 5L", supplier: "Bidfood", packSize: "5L", category: "Pantry" },
      { id: "category", name: "Oil Olive Extra Virgin 4L", supplier: "Bidfood", packSize: "4L", category: "White Wine" },
      { id: "starts", name: "White Wine Vinegar (Provedores)", supplier: "The Provedores", packSize: "2L", category: "Pantry" },
      { id: "scattered", name: "Wine Cooking White 1L", supplier: "Bidfood", packSize: "1L", category: "Pantry" },
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
      open: [{ id: "x", text: "Blue Roll Centrefeed", approvedItemId: "blue-roll", supplier: "Bunzl", packSize: null, note: null, createdBy: null, createdAt: "2026-10-15T01:00:00Z", done: false, doneBy: null, doneAt: null }],
      now: new Date("2026-10-15T07:00:00Z"),
    })
    assert.match(mail.text, /- Blue Roll Centrefeed \[Bunzl\] \(/)
  })
})
