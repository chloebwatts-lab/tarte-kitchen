import { test } from "node:test"
import assert from "node:assert/strict"
import {
  renderDailyAccountability,
  accountabilityRecipients,
  uberEodLine,
  type DailyAccountability,
  type UberEodRow,
} from "./daily"

const empty = (venue: DailyAccountability["venues"][number]["venue"]) => ({
  venue,
  agenda: [],
  fixes: [],
  jobs: [],
  orders: [],
})

const busy: DailyAccountability = {
  date: "Sunday 27 September",
  venues: [
    {
      venue: "BURLEIGH",
      agenda: [{ text: "Sunday surcharge to 10%", who: "raised by Oliver", age: "3 days", flag: null }],
      fixes: [
        {
          text: "Meiko dishwasher — Takeaway: not draining",
          who: null,
          age: "2 days",
          flag: "nobody called yet",
        },
        { text: "Gas smell at the fryer", who: "reported by Vini", age: "today", flag: "SAFETY" },
      ],
      jobs: [{ text: "Replace till roll <stock>", who: null, age: "9 days", flag: "no owner" }],
      orders: [
        {
          text: "Kitchen order, 1 line, waiting for the department head to approve",
          who: "asked by Candy & Jose",
          age: "1 day",
          flag: "not approved for a day",
        },
      ],
    },
    empty("BEACH_HOUSE"),
    empty("TEA_GARDEN"),
  ],
  uber: null,
  groupAgenda: [{ text: "Christmas rosters", who: null, age: "today", flag: null }],
  totals: { agenda: 2, fixes: 2, jobs: 1, orders: 1, unowned: 2 },
}

test("subject counts everything open and how many have nobody on them", () => {
  const { subject } = renderDailyAccountability(busy)
  assert.equal(subject, "End of day Sunday 27 September: 6 open, 2 with nobody on them")
})

test("html escapes stored text and swaps long dashes for commas", () => {
  const { html } = renderDailyAccountability(busy)
  assert.ok(html.includes("Meiko dishwasher, Takeaway: not draining"))
  assert.ok(!html.includes("—"), "no em dashes in anything sent out")
  assert.ok(html.includes("Replace till roll &lt;stock&gt;"))
  assert.ok(html.includes("asked by Candy &amp; Jose"))
  assert.ok(html.includes("SAFETY"))
  assert.ok(html.includes("2 of these have nobody on them."))
  assert.ok(html.includes("/kitchen/fix?venue=BURLEIGH"))
  assert.ok(html.includes("Needs fixing &middot; 2"))
})

test("plain text lists each venue with its groups and flags", () => {
  const { text } = renderDailyAccountability(busy)
  const lines = text.split("\n")
  assert.equal(lines[0], "Tarte end of day, Sunday 27 September")
  assert.equal(lines[1], "2 to fix, 1 board jobs, 1 to order, 2 on the agenda. 2 with nobody on them.")
  assert.ok(lines.includes("BAKERY: 5 open"))
  assert.ok(lines.includes("BEACH HOUSE: nothing open"))
  assert.ok(lines.includes("TEA GARDEN: nothing open"))
  assert.ok(lines.includes("  Needs fixing (2)"))
  assert.ok(
    lines.includes("   - [NOBODY CALLED YET] Meiko dishwasher — Takeaway: not draining, 2 days"),
    "text body keeps the stored name as-is"
  )
  assert.ok(lines.includes("   - [SAFETY] Gas smell at the fryer (reported by Vini), today"))
  assert.ok(lines.includes("ALL VENUES"))
  assert.ok(lines.includes("   - Christmas rosters, today"))
})

test("a clean day says so instead of rendering empty cards", () => {
  const quiet: DailyAccountability = {
    date: "Monday 28 September",
    venues: [empty("BURLEIGH"), empty("BEACH_HOUSE"), empty("TEA_GARDEN")],
    uber: null,
    groupAgenda: [],
    totals: { agenda: 0, fixes: 0, jobs: 0, orders: 0, unowned: 0 },
  }
  const { subject, html, text } = renderDailyAccountability(quiet)
  assert.equal(subject, "End of day Monday 28 September: 0 open, 0 with nobody on them")
  assert.ok(html.includes("Nothing open anywhere. Good day."))
  assert.ok(html.includes("Everything open has a name on it."))
  assert.ok(!html.includes("Needs fixing"))
  assert.ok(text.includes("BAKERY: nothing open"))
  assert.ok(!text.includes("ALL VENUES"))
})

test("accountabilityRecipients: defaults, blank env, trimmed list", () => {
  const prev = process.env.ACCOUNTABILITY_TO
  try {
    delete process.env.ACCOUNTABILITY_TO
    assert.deepEqual(accountabilityRecipients(), ["chloe@tarte.com.au", "shawna@tarte.com.au", "hello@tarte.com.au"])
    process.env.ACCOUNTABILITY_TO = " , "
    assert.deepEqual(accountabilityRecipients(), ["chloe@tarte.com.au", "shawna@tarte.com.au", "hello@tarte.com.au"])
    process.env.ACCOUNTABILITY_TO = "chloe@tarte.com.au, oliver@tarte.com.au "
    assert.deepEqual(accountabilityRecipients(), ["chloe@tarte.com.au", "oliver@tarte.com.au"])
  } finally {
    if (prev === undefined) delete process.env.ACCOUNTABILITY_TO
    else process.env.ACCOUNTABILITY_TO = prev
  }
})

// Uber Eats card (added 7 Oct 2026)

const row = (o: Partial<UberEodRow> = {}): UberEodRow => ({
  venue: "BEACH_HOUSE",
  name: "Tarte Takeaway",
  sales: 638.05,
  orders: 20,
  lastWeek: 0,
  live: true,
  error: null,
  ...o,
})

test("uberEodLine: shop, venue, rounded dollars, orders, last same weekday", () => {
  assert.equal(uberEodLine(row(), "Tuesday"), "Tarte Takeaway (Beach House): $638, 20 orders (last Tuesday $0)")
  assert.equal(uberEodLine(row({ orders: 1, sales: 24.9, lastWeek: null }), "Tuesday"), "Tarte Takeaway (Beach House): $25, 1 order")
  assert.equal(
    uberEodLine(row({ venue: "BURLEIGH", name: "Tarte Bakery Burleigh", sales: 0, orders: 0, lastWeek: 1234.5 }), "Monday"),
    "Tarte Bakery Burleigh (Bakery): $0, 0 orders (last Monday $1,235)"
  )
})

test("uberEodLine: a dead session with nothing stored says so instead of $0", () => {
  assert.equal(
    uberEodLine(row({ sales: 0, orders: 0, live: false, lastWeek: null, error: "Uber Eats session has expired." }), "Tuesday"),
    "Tarte Takeaway (Beach House): no figure, Uber Eats session has expired."
  )
  // a stored figure with a stale session still shows the figure
  assert.equal(uberEodLine(row({ live: false, error: "expired", lastWeek: null }), "Tuesday"), "Tarte Takeaway (Beach House): $638, 20 orders")
  // a live session with a $0 day is a real $0, not "no figure"
  assert.equal(uberEodLine(row({ sales: 0, orders: 0, live: true, lastWeek: null }), "Tuesday"), "Tarte Takeaway (Beach House): $0, 0 orders")
})

test("uber card: rendered in html and text with the weekday from the date, outside the venue totals", () => {
  const withUber: DailyAccountability = {
    ...busy,
    uber: [
      row(),
      row({ venue: "BURLEIGH", name: "Tarte Bakery Burleigh", sales: 212.4, orders: 7, lastWeek: 198.75 }),
      row({ venue: "TEA_GARDEN", name: "Tarte Tea & Co", sales: 0, orders: 0, lastWeek: null, live: false, error: "Uber Eats session has expired." }),
    ],
  }
  const { subject, html, text } = renderDailyAccountability(withUber)

  // Uber never changes the open count
  assert.equal(subject, "End of day Sunday 27 September: 6 open, 2 with nobody on them")

  assert.ok(html.includes("Uber Eats today"))
  assert.ok(html.includes("On top of the venue totals, not in them."))
  assert.ok(html.includes("last Sunday $0"), "weekday comes from the first word of the date")
  assert.ok(html.includes("<strong>$638</strong>"))
  assert.ok(html.includes("<strong>$212</strong>"))
  assert.ok(html.includes("last Sunday $199"))
  assert.ok(html.includes("Tarte Tea &amp; Co"), "shop names are escaped")
  assert.ok(html.includes("Uber Eats session has expired."), "dead session shown in red under the shop")
  assert.ok(html.includes("7 orders"))
  assert.ok(!html.includes("—"), "no em dashes")

  const lines = text.split("\n")
  const header = lines.indexOf("UBER EATS TODAY (not in the venue totals)")
  assert.ok(header > 0)
  assert.equal(lines[header + 1], "   - Tarte Takeaway (Beach House): $638, 20 orders (last Sunday $0)")
  assert.equal(lines[header + 2], "   - Tarte Bakery Burleigh (Bakery): $212, 7 orders (last Sunday $199)")
  assert.equal(lines[header + 3], "   - Tarte Tea & Co (Tea Garden): no figure, Uber Eats session has expired.")
  assert.ok(lines.indexOf("ALL VENUES") < header, "uber block comes after the venue lists")
})

test("uber card: not connected (null) or connected with no mapped shops (empty) renders nothing", () => {
  for (const uber of [null, []] as const) {
    const { html, text } = renderDailyAccountability({ ...busy, uber: uber as DailyAccountability["uber"] })
    assert.ok(!html.includes("Uber Eats today"))
    assert.ok(!text.includes("UBER EATS TODAY"))
  }
})

test("uber card: weekday extraction tolerates a comma after the day name and a one-word date", () => {
  const comma = renderDailyAccountability({ ...busy, date: "Sunday, 27 September", uber: [row()] })
  assert.ok(comma.text.includes("(last Sunday $0)"))
  const oneWord = renderDailyAccountability({ ...busy, date: "Sunday", uber: [row()] })
  assert.ok(oneWord.text.includes("(last Sunday $0)"))
})
