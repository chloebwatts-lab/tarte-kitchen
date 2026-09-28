import { test } from "node:test"
import assert from "node:assert/strict"
import { beachHouseCogsRows, resolveTeaGardenRevenue } from "./cogs-rows"

// Week starting Wed 2026-09-16, the digest that dropped the combined row.
// Louise's Currumbin xlsx: BH revenue $63,000, total COGS $18,900 (30.0%).
// Tea Garden Lightspeed daily summaries summed to $7,613 that week.
const bhWeek = {
  label: "Beach House",
  xlsxRevenue: 63000,
  totalCogs: 18900,
  xlsxPct: 30,
  targetPct: 29,
  biggestCategory: { name: "Food", dollars: 15200 },
  nonFoodFoh: 3700,
}

// Seven Lightspeed EOD summaries, Wed -> Tue, ex GST.
const tgDaily = [1180.5, 1095, 1010.25, 1240, 1310.75, 990, 786.5] // 7613

// ------------------------------------------------- resolveTeaGardenRevenue

test("Tea Garden revenue prefers the Mge PDF (LabourWeekActual) when present", () => {
  const r = resolveTeaGardenRevenue({ labourRevenueExGst: 7900, dailySalesRevenueExGst: tgDaily })
  assert.deepEqual(r, { value: 7900, source: "labour" })
})

test("Tea Garden revenue falls back to summed daily sales when the PDF row is null", () => {
  const r = resolveTeaGardenRevenue({ labourRevenueExGst: null, dailySalesRevenueExGst: tgDaily })
  assert.equal(r.source, "sales")
  assert.ok(r.value != null && Math.abs(r.value - 7613) < 0.001)
})

test("Tea Garden revenue is unavailable (not $0) when neither source has the week", () => {
  const r = resolveTeaGardenRevenue({ labourRevenueExGst: null, dailySalesRevenueExGst: [] })
  assert.deepEqual(r, { value: null, source: null })
})

// ------------------------------------------------------ beachHouseCogsRows

test("combined row uses the Mge PDF revenue and keeps the as-reported row untouched", () => {
  const rows = beachHouseCogsRows({ ...bhWeek, teaGarden: { value: 7900, source: "labour" } })
  assert.equal(rows.length, 2)
  const [combined, asReported] = rows
  assert.equal(combined.venue, "Beach House + Tea Garden")
  assert.equal(combined.revenueExGst, 70900)
  assert.equal(combined.cogsPct, 26.7) // 18900 / 70900, one decimal
  assert.ok(combined.delta != null && Math.abs(combined.delta - -2.3) < 1e-9)
  assert.match(combined.note ?? "", /BH \$63,000 \+ TG \$7,900 = \$70,900 ex-GST/)
  assert.ok(!/Lightspeed/.test(combined.note ?? ""), "no fallback caveat when the PDF was used")

  assert.equal(asReported.venue, "Beach House (BH only, as-reported)")
  assert.equal(asReported.revenueExGst, 63000)
  assert.equal(asReported.cogsPct, 30)
  assert.equal(asReported.delta, 1)
  assert.match(asReported.note ?? "", /Reference only/)
})

test("combined row is still computed from the daily-sales fallback and says so", () => {
  const tg = resolveTeaGardenRevenue({ labourRevenueExGst: null, dailySalesRevenueExGst: tgDaily })
  const [combined, asReported] = beachHouseCogsRows({ ...bhWeek, teaGarden: tg })
  assert.equal(combined.venue, "Beach House + Tea Garden")
  assert.equal(combined.revenueExGst, 70613)
  assert.equal(combined.cogsPct, 26.8) // 18900 / 70613 = 26.77%
  assert.match(combined.note ?? "", /TG \$7,613/)
  assert.match(combined.note ?? "", /summed from Lightspeed daily sales/)
  // Louise's number is never touched by the fallback.
  assert.equal(asReported.cogsPct, 30)
  assert.equal(asReported.revenueExGst, 63000)
})

test("combined row is rendered with a visible note when Tea Garden revenue is unavailable", () => {
  const [combined, asReported] = beachHouseCogsRows({ ...bhWeek, teaGarden: { value: null, source: null } })
  assert.equal(combined.venue, "Beach House + Tea Garden")
  assert.equal(combined.cogsPct, null)
  assert.equal(combined.delta, null)
  assert.equal(combined.revenueExGst, null)
  assert.equal(combined.totalCogs, 18900)
  assert.equal(combined.targetPct, 29)
  assert.match(combined.note ?? "", /Tea Garden revenue was unavailable/)
  assert.equal(asReported.cogsPct, 30)
  assert.match(asReported.note ?? "", /Reference only/)
})

test("combined row names a missing Beach House xlsx revenue instead of dividing by Tea Garden alone", () => {
  const [combined] = beachHouseCogsRows({
    ...bhWeek,
    xlsxRevenue: null,
    xlsxPct: null,
    teaGarden: { value: 7613, source: "sales" },
  })
  assert.equal(combined.cogsPct, null)
  assert.match(combined.note ?? "", /Beach House revenue is missing/)
  assert.ok(!/Tea Garden revenue was unavailable/.test(combined.note ?? ""))
})
