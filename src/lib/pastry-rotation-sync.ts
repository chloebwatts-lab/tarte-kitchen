/**
 * Pure logic for the pastry-rotation auto-fill (no DB imports so it's
 * directly unit-testable). Used by /api/cron/sync-pastry-rotation.
 */

/** Rows the auto-fill may replace. Anything else — including rows with a
 * NULL staff name — is treated as human and never touched. */
export const AUTO_NAMES = new Set(["auto", "JP", "BM", "BB", "DE", "TZ"])

export function isAutoRow(staffName: string | null): boolean {
  return staffName !== null && AUTO_NAMES.has(staffName)
}

export function isHumanRow(staffName: string | null): boolean {
  return !isAutoRow(staffName)
}

/** Map a POS / wastage item name to a PastryProduct name. Null = not a
 * tracked pastry (almond croissants, generic "Cruellers", sourdough…).
 * Ordering matters: specific berries BEFORE the generic berry→strawberry
 * fallback — "blueberry"/"raspberry" contain the substring "berry". */
export function matchProduct(raw: string): string | null {
  const n = raw.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()
  if (/tarte?s?\b/.test(n)) {
    if (/blueberry/.test(n)) return "Blueberry tarte"
    if (/raspberry/.test(n)) return "Raspberry tarte"
    if (/rhubarb/.test(n)) return "Rhubarb tarte"
    if (/passionfruit/.test(n)) return "Passionfruit tarte"
    if (/strawberry|berry/.test(n)) return "Strawberry tarte"
  }
  if (/muffin top/.test(n)) return "Muffin top"
  if (/triple choc/.test(n)) return "Dark triple chocolate cookie"
  if (/choc chip/.test(n)) return "Choc chip cookie"
  if (/pistachio/.test(n) && /cookie/.test(n)) return "Pistachio cookie"
  if (/crueller|cruller/.test(n)) {
    if (/vanilla/.test(n)) return "Vanilla crueller"
    if (/dul/.test(n)) return "Dulce crueller"
    return null // cinnamon / generic — not tracked products
  }
  if (/croissant/.test(n)) {
    if (/almond|chocolate|choc|ham|cheese/.test(n)) return null
    return "Plain croissant"
  }
  if (/scroll/.test(n) && /cinnamon/.test(n)) return "Cinnamon scroll"
  if (/^cinnamon scroll/.test(n)) return "Cinnamon scroll"
  if (/kouign/.test(n)) return "Kouign amann"
  if (/cheesecake/.test(n)) return "Cheesecake"
  if (/lemon butter/.test(n)) return "Lemon butter cake"
  if (/pecan/.test(n)) return "Pecan pie"
  if (/friand/.test(n)) return "Friand"
  return null
}

/** Largest-remainder split of a total across bake times. */
export function splitAcrossBakes(total: number, props: number[]): number[] {
  const raw = props.map((p) => total * p)
  const base = raw.map(Math.floor)
  let rem = total - base.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const o of order) {
    if (rem <= 0) break
    base[o.i]++
    rem--
  }
  return base
}

/**
 * Distribute a day's prepared/discarded across bakes. Waste is discovered
 * at close, so discard fills backwards from the LAST producing bake until
 * exhausted (a 10-piece discard on a [7,4,1] day lands 1+4+5, not just 1 —
 * sold + discarded always reconciles with the wastage register exactly).
 */
export function buildBakeRows(
  prepared: number,
  discarded: number,
  props: number[]
): { prepared: number; sold: number; discarded: number }[] {
  const prepSplit = splitAcrossBakes(prepared, props)
  const rows = prepSplit.map((p) => ({ prepared: p, sold: p, discarded: 0 }))
  let remaining = Math.min(discarded, prepared)
  for (let i = rows.length - 1; i >= 0 && remaining > 0; i--) {
    const take = Math.min(remaining, rows[i].prepared)
    rows[i].discarded = take
    rows[i].sold = rows[i].prepared - take
    remaining -= take
  }
  return rows
}
