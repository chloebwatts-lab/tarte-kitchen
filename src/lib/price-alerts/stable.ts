/**
 * STABLE stream: a real supplier price move. Pure, no database.
 *
 * "Was" is the price the same supplier charged for the same product just
 * before the change, never the ingredient's cost card. Chloe, 13 Nov 2026:
 * the Friday digest compared invoices with cost cards nobody had touched
 * since the March import, so 9 of the top 12 "price changes" had not moved
 * in months (creme fraiche "was $16.50/l" when Provedores has charged
 * $22.40/l on every invoice since April; Pixel loaves "-14%" because the
 * card said 1200g and the invoice says 1400g).
 *
 * Rules:
 *  - A product is one supplier SKU (product code, or the normalised
 *    description when the supplier prints no code; old uncoded lines inherit
 *    the code their description later carried). Different pack formats of
 *    one ingredient never get compared with each other.
 *  - Each venue is its own series, so two venues on different prices can't
 *    flip-flop into a fake move.
 *  - The new price must be on 2+ deliveries (distinct invoice dates) and
 *    must first have appeared inside the last 4 weeks. Older moves are
 *    history, not news.
 *  - A one-delivery blip between two runs of the same price is not a move.
 *  - Moves under 5% either way are noise.
 */
import { STABLE_FLAG_THRESHOLD_PCT } from "./classifier"

export const STABLE_WINDOW_DAYS = 28
export const STABLE_CONFIRM_DELIVERIES = 2
/** Prices this close (as a fraction) are the same price; covers rounding. */
export const SAME_PRICE_TOLERANCE = 0.005

const DAY = 86_400_000

export interface StableLine {
  supplierName: string | null
  productCode: string | null
  description: string
  venue: string | null
  invoiceDate: Date
  /** Unit-safe price per purchase unit (per g / ml / piece). */
  price: number
  lineTotal: number | null
}

export interface StableMove {
  supplierName: string | null
  productKey: string
  /** Price now, per purchase unit. */
  current: number
  /** Price the same supplier charged for this product before the change. */
  prior: number
  changePct: number
  /** First invoice date the new price appeared. */
  changedAt: Date
  /** 4-week volume of this product x (current - prior), per week. */
  weeklyImpactDollars: number | null
}

export function normaliseDescription(d: string): string {
  return d
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
}

/** One product key per line, aligned with the input. */
export function productKeys(lines: StableLine[]): string[] {
  const codeByDesc = new Map<string, string | null>()
  for (const l of lines) {
    const code = l.productCode?.trim()
    if (!code) continue
    const k = `${l.supplierName ?? ""}|${normaliseDescription(l.description)}`
    const prev = codeByDesc.get(k)
    if (prev === undefined) codeByDesc.set(k, code)
    else if (prev !== null && prev !== code) codeByDesc.set(k, null) // ambiguous: keep by description
  }
  return lines.map((l) => {
    const sup = l.supplierName ?? ""
    const desc = normaliseDescription(l.description)
    const code = l.productCode?.trim() || codeByDesc.get(`${sup}|${desc}`) || null
    return code ? `${sup}|code:${code.toLowerCase()}` : `${sup}|desc:${desc}`
  })
}

function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) <= SAME_PRICE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b))
}

function dayKey(d: Date): number {
  return Math.floor(d.getTime() / DAY)
}

/** The move at the end of one venue's series of one product, oldest first. */
export function seriesMove(
  series: StableLine[],
  windowStart: number
): { current: number; prior: number; changedAt: Date } | null {
  if (series.length === 0) return null
  const current = series[series.length - 1].price
  let i = series.length - 1
  while (i >= 0 && samePrice(series[i].price, current)) i--
  if (i < 0) return null // one price all window: nothing moved

  const run = series.slice(i + 1)
  if (new Set(run.map((l) => dayKey(l.invoiceDate))).size < STABLE_CONFIRM_DELIVERIES) return null
  const changedAt = run[0].invoiceDate
  if (changedAt.getTime() < windowStart) return null

  const prior = series[i].price
  // A single delivery at the "prior" price sandwiched between runs of the
  // current price is a blip (promo, mis-key), not the price we used to pay.
  let j = i
  while (j >= 0 && samePrice(series[j].price, prior)) j--
  const priorDays = new Set(series.slice(j + 1, i + 1).map((l) => dayKey(l.invoiceDate))).size
  if (j >= 0 && priorDays < 2 && samePrice(series[j].price, current)) return null

  return { current, prior, changedAt }
}

function sortByDate(lines: StableLine[]): StableLine[] {
  return lines
    .map((l, idx) => ({ l, idx }))
    .sort((a, b) => a.l.invoiceDate.getTime() - b.l.invoiceDate.getTime() || a.idx - b.idx)
    .map((x) => x.l)
}

/**
 * The biggest real price move across an ingredient's supplier products, or
 * null when nothing moved 5%+ in the last 4 weeks.
 */
export function findStableMove(lines: StableLine[], now: Date = new Date()): StableMove | null {
  const windowStart = now.getTime() - STABLE_WINDOW_DAYS * DAY
  const valid = lines.filter((l) => l.price > 0 && Number.isFinite(l.price))
  const keys = productKeys(valid)
  const byProduct = new Map<string, StableLine[]>()
  valid.forEach((l, i) => {
    const arr = byProduct.get(keys[i]) ?? []
    arr.push(l)
    byProduct.set(keys[i], arr)
  })

  let best: StableMove | null = null
  const rank = (m: StableMove) =>
    m.weeklyImpactDollars != null ? Math.abs(m.weeklyImpactDollars) : -1 / (1 + Math.abs(m.changePct))

  for (const [productKey, productLines] of byProduct) {
    const byVenue = new Map<string, StableLine[]>()
    for (const l of sortByDate(productLines)) {
      const v = l.venue ?? ""
      const arr = byVenue.get(v) ?? []
      arr.push(l)
      byVenue.set(v, arr)
    }

    let rep: { current: number; prior: number; changedAt: Date; weight: number } | null = null
    let impact = 0
    let anyVolume = false
    let changedAt: Date | null = null
    for (const series of byVenue.values()) {
      const m = seriesMove(series, windowStart)
      if (!m) continue
      const pct = ((m.current - m.prior) / m.prior) * 100
      if (Math.abs(pct) < STABLE_FLAG_THRESHOLD_PCT) continue

      let vol = 0
      let hasVol = false
      for (const l of series) {
        const t = l.invoiceDate.getTime()
        if (t < windowStart || l.lineTotal == null) continue
        vol += l.lineTotal / l.price
        hasVol = true
      }
      if (hasVol) {
        impact += (vol / (STABLE_WINDOW_DAYS / 7)) * (m.current - m.prior)
        anyVolume = true
      }
      const weight = hasVol ? Math.abs(vol) : 0
      if (!rep || weight > rep.weight) rep = { ...m, weight }
      if (!changedAt || m.changedAt < changedAt) changedAt = m.changedAt
    }
    if (!rep || !changedAt) continue

    const move: StableMove = {
      supplierName: productLines[0].supplierName,
      productKey,
      current: rep.current,
      prior: rep.prior,
      changePct: Math.round(((rep.current - rep.prior) / rep.prior) * 10000) / 100,
      changedAt,
      weeklyImpactDollars: anyVolume ? Math.round(impact * 100) / 100 : null,
    }
    if (!best || rank(move) > rank(best)) best = move
  }
  return best
}
