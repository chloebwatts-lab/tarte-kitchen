import { test } from "node:test"
import assert from "node:assert/strict"
import { renderDailyAccountability, accountabilityRecipients, type DailyAccountability } from "./daily"

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
