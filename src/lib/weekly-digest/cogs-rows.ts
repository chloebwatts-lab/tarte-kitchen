/**
 * Pure helpers for the COGS section of the Friday digest. Kept free of
 * Prisma so the Beach House + Tea Garden combine step can be unit tested
 * without a database (see cogs-rows.test.ts).
 *
 * Background: Tea Garden has no separate COGS report. Louise's
 * "Currumbin" xlsx covers Beach House + Tea Garden combined ingredient
 * and coffee costs but only carries Beach House revenue, so its own
 * cogs% overstates the picture. The digest adds Tea Garden weekly
 * revenue to the denominator and shows that combined % as the headline,
 * keeping Louise's as-reported number as a reference row underneath.
 */

export interface CogsVenueRow {
  venue: string
  revenueExGst: number | null
  totalCogs: number
  cogsPct: number | null
  targetPct: number | null
  delta: number | null
  biggestCategory: { name: string; dollars: number } | null
  /// Non-food (FOH) spend = Total COGS − Food cost. Null when the food
  /// line is missing for the week. Derived from the directly-read total
  /// so it also captures any FOH/sundries line outside the named cats.
  nonFoodFoh: number | null
  /// Optional human-readable note shown below the venue row. Used to
  /// flag combined accounting (Beach House row covers BH+TG, Tea
  /// Garden row points back at BH) and to say when a revenue input was
  /// unavailable so the reader can see why a % is blank.
  note?: string
}

/**
 * Where the Tea Garden weekly revenue used in the combine step came from.
 *   labour: Louise's Tea Garden Mge PDF (LabourWeekActual.revenueExGst),
 *           the preferred source because it includes online + events.
 *   sales:  DailySalesSummary.totalRevenueExGst summed over the Tarte
 *           week, the same fallback the SALES section uses when the PDF
 *           has not been uploaded yet.
 *   null:   neither source had anything for the week.
 */
export type TeaGardenRevenue =
  | { value: number; source: "labour" | "sales" }
  | { value: null; source: null }

/**
 * Pick the Tea Garden revenue for the COGS denominator. Mirrors
 * `buildSales`: the Mge PDF number wins when present, otherwise the
 * Lightspeed daily summaries are summed. An empty list of summaries
 * (no EOD imports for the week) is treated as unavailable rather than
 * $0 so a missing feed cannot silently produce a wildly inflated %.
 */
export function resolveTeaGardenRevenue(args: {
  labourRevenueExGst: number | null
  dailySalesRevenueExGst: number[]
}): TeaGardenRevenue {
  if (args.labourRevenueExGst != null)
    return { value: args.labourRevenueExGst, source: "labour" }
  if (args.dailySalesRevenueExGst.length > 0) {
    const total = args.dailySalesRevenueExGst.reduce((s, n) => s + n, 0)
    return { value: total, source: "sales" }
  }
  return { value: null, source: null }
}

export interface BeachHouseCogsInput {
  /// Venue label, "Beach House".
  label: string
  /// Beach House revenue as reported in Louise's Currumbin xlsx.
  xlsxRevenue: number | null
  totalCogs: number
  /// cogs% as reported in the xlsx (BH revenue only).
  xlsxPct: number | null
  targetPct: number | null
  biggestCategory: { name: string; dollars: number } | null
  nonFoodFoh: number | null
  teaGarden: TeaGardenRevenue
}

const money = (n: number) => `$${n.toLocaleString()}`

/**
 * Build the two Beach House rows for the COGS table, in display order:
 *   1. "Beach House + Tea Garden", primary, drives the headline %.
 *   2. "Beach House (BH only, as-reported)", Louise's number, untouched.
 *
 * The combined row is always emitted. When Tea Garden (or Beach House)
 * revenue is unavailable its % is null and the note says which input is
 * missing, so the gap is visible in the digest instead of the row
 * quietly disappearing.
 */
export function beachHouseCogsRows(input: BeachHouseCogsInput): CogsVenueRow[] {
  const {
    label,
    xlsxRevenue,
    totalCogs,
    xlsxPct,
    targetPct,
    biggestCategory,
    nonFoodFoh,
    teaGarden,
  } = input

  const combinedVenue = `${label} + Tea Garden`
  let combinedRow: CogsVenueRow

  if (xlsxRevenue != null && teaGarden.value != null) {
    const combined = xlsxRevenue + teaGarden.value
    const combinedPct = Math.round((totalCogs / combined) * 1000) / 10
    const tgSource =
      teaGarden.source === "sales"
        ? " TG revenue is summed from Lightspeed daily sales because the Tea Garden Mge PDF has not been uploaded for this week."
        : ""
    combinedRow = {
      venue: combinedVenue,
      revenueExGst: combined,
      totalCogs,
      cogsPct: combinedPct,
      targetPct,
      delta: targetPct != null ? combinedPct - targetPct : null,
      biggestCategory,
      nonFoodFoh,
      note: `BH ${money(xlsxRevenue)} + TG ${money(teaGarden.value)} = ${money(combined)} ex-GST. Kitchen shares stock across both venues, combined view is the operationally meaningful one.${tgSource}`,
    }
  } else {
    const missing: string[] = []
    if (xlsxRevenue == null) missing.push("Beach House revenue is missing from the Currumbin xlsx")
    if (teaGarden.value == null)
      missing.push(
        "Tea Garden revenue was unavailable for this week (no Tea Garden Mge PDF row and no Lightspeed daily sales)"
      )
    combinedRow = {
      venue: combinedVenue,
      revenueExGst: null,
      totalCogs,
      cogsPct: null,
      targetPct,
      delta: null,
      biggestCategory,
      nonFoodFoh,
      note: `Combined % not computed: ${missing.join("; ")}. The BH-only row below is Louise's as-reported number and overstates COGS % because it excludes Tea Garden sales.`,
    }
  }

  const asReportedRow: CogsVenueRow = {
    venue: `${label} (BH only, as-reported)`,
    revenueExGst: xlsxRevenue,
    totalCogs,
    cogsPct: xlsxPct,
    targetPct,
    delta: xlsxPct != null && targetPct != null ? xlsxPct - targetPct : null,
    biggestCategory,
    nonFoodFoh,
    note: "Reference only: Louise's Currumbin xlsx with BH revenue only.",
  }

  return [combinedRow, asReportedRow]
}
