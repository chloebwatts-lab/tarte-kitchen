import { test } from "node:test"
import assert from "node:assert/strict"
import { gapDaysLabel, overdueGap } from "./overdue-gap"

// trading-day offsets from this week's Wednesday, history negative
const WED = 0, THU = 1, FRI = 2, SAT = 3, SUN = 4, MON = 5, TUE = 6
const TUE_LAST = -1

/** $300 of bread every day of the week. */
const BREAD = [300, 300, 300, 300, 300, 300, 300]
const usual = new Map([["Pixel Bread", BREAD]])
const intervals = new Map([["Pixel Bread", 1]])
const steady = new Set(["Pixel Bread"])
const seen = (...days: number[]) => new Map([["Pixel Bread", new Set([-14, -13, -8, -7, -2, TUE_LAST, ...days])]])

test("25 Oct: Pixel has not invoiced since Wednesday, so Thursday to Saturday are overdue on Sunday", () => {
  const g = overdueGap({ usual, todayIdx: SUN, intervals, steady, invoicedOn: seen(WED), dateOf: (o) => `offset ${o}` })
  assert.equal(g.total, 900)
  assert.deepEqual(g.rows, [{ supplier: "Pixel Bread", amount: 900, days: ["Thu", "Fri", "Sat"], lastInvoiceDate: "offset 0" }])
  // Sunday itself is today: still to come, never overdue
  assert.ok(!g.rows[0].days.includes("Sun"))
})

test("the overdue rule of the coverage table: one or two quiet days are normal lag, three are overdue", () => {
  const at = (todayIdx: number) => overdueGap({ usual, todayIdx, intervals, steady, invoicedOn: seen(WED) }).total
  assert.equal(at(THU), 0) // 1 day since the last invoice
  assert.equal(at(FRI), 0) // 2 days: due soon, not overdue
  assert.equal(at(SAT), 600) // 3 days: Thu and Fri overdue
  assert.equal(at(TUE), 1500) // Thu to Mon
})

test("Pixel starts invoicing again without the missing days: they stay counted", () => {
  const g = overdueGap({ usual, todayIdx: MON, intervals, steady, invoicedOn: seen(WED, SUN) })
  assert.deepEqual(g.rows.map((r) => r.days), [["Thu", "Fri", "Sat"]])
  // and once they are sent (backfilled) they are in hand, not overdue
  assert.equal(overdueGap({ usual, todayIdx: MON, intervals, steady, invoicedOn: seen(WED, THU, FRI, SAT, SUN) }).total, 0)
})

test("a short hole between invoices is lag, not overdue", () => {
  // Thursday missing, Friday in: two days between invoices
  assert.equal(overdueGap({ usual, todayIdx: SUN, intervals, steady, invoicedOn: seen(WED, FRI, SAT) }).total, 0)
})

test("no gap for a supplier that is not steady, not on the expected list, or never seen", () => {
  assert.equal(overdueGap({ usual, todayIdx: SUN, intervals, steady: new Set(), invoicedOn: seen(WED) }).total, 0)
  assert.equal(overdueGap({ usual, todayIdx: SUN, intervals: new Map(), steady, invoicedOn: seen(WED) }).total, 0)
  assert.equal(overdueGap({ usual, todayIdx: SUN, intervals, steady, invoicedOn: new Map() }).total, 0)
  // first invoice in the window is this Friday: Wednesday and Thursday are not "late"
  const first = overdueGap({ usual, todayIdx: SUN, intervals, steady, invoicedOn: new Map([["Pixel Bread", new Set([FRI])]]) })
  assert.equal(first.total, 0)
})

test("only days it usually delivers count, priced at its usual for that day", () => {
  // Bidfood: Wed $1,000, Fri $2,000, Mon $1,800, nothing else
  const bid = new Map([["Bidfood", [1000, 0, 2000, 0, 0, 1800, 0]]])
  const g = overdueGap({
    usual: bid,
    todayIdx: TUE,
    intervals: new Map([["Bidfood", 3]]),
    steady: new Set(["Bidfood"]),
    invoicedOn: new Map([["Bidfood", new Set([-7, -5, -2])]]),
  })
  // last invoice last Monday (-2): 8 days to today, overdue; Wed, Fri and Mon missing
  assert.deepEqual(g.rows, [{ supplier: "Bidfood", amount: 4800, days: ["Wed", "Fri", "Mon"], lastInvoiceDate: null }])
})

test("rows add up to the total and run biggest first", () => {
  const u = new Map([["Pixel Bread", BREAD], ["The Fish Factory", [0, 150.333, 0, 200.333, 0, 0, 0]]])
  const g = overdueGap({
    usual: u,
    todayIdx: SUN,
    intervals: new Map([["Pixel Bread", 1], ["The Fish Factory", 2]]),
    steady: new Set(["Pixel Bread", "The Fish Factory"]),
    invoicedOn: new Map([["Pixel Bread", new Set([WED])], ["The Fish Factory", new Set([-2])]]),
  })
  assert.deepEqual(g.rows.map((r) => r.supplier), ["Pixel Bread", "The Fish Factory"])
  assert.equal(g.total, Math.round(g.rows.reduce((s, r) => s + r.amount, 0) * 100) / 100)
  assert.equal(g.rows[1].amount, 350.67)
})

test("gapDaysLabel: a run reads 'Thu to Sat', two days 'Thu and Fri', scattered days listed", () => {
  assert.equal(gapDaysLabel(["Thu", "Fri", "Sat"]), "Thu to Sat")
  assert.equal(gapDaysLabel(["Thu", "Fri"]), "Thu and Fri")
  assert.equal(gapDaysLabel(["Sat"]), "Sat")
  assert.equal(gapDaysLabel(["Wed", "Fri", "Mon"]), "Wed, Fri, Mon")
  assert.equal(gapDaysLabel([]), "")
})
