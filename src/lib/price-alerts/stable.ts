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
  /** Billed unit as printed (PAT, BLK, CTN). Keys uncoded products. */
  unit?: string | null
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

/**
 * One product key per line, aligned with the input. Coded lines key on the
 * code. Uncoded lines key on description AND billed unit, so "BUTTER
 * SALTED" by the pat and "BUTTER SALTED" by the 5kg block never get
 * compared; they inherit a code only from a coded line with the same
 * description and unit.
 */
export function productKeys(lines: StableLine[]): string[] {
  const descUnit = (l: StableLine) =>
    `${normaliseDescription(l.description)}|${(l.unit ?? "").trim().toLowerCase()}`
  const codeByDesc = new Map<string, string | null>()
  for (const l of lines) {
    const code = l.productCode?.trim()
    if (!code) continue
    const k = `${l.supplierName ?? ""}|${descUnit(l)}`
    const prev = codeByDesc.get(k)
    if (prev === undefined) codeByDesc.set(k, code)
    else if (prev !== null && prev !== code) codeByDesc.set(k, null) // ambiguous: keep by description
  }
  return lines.map((l) => {
    const sup = l.supplierName ?? ""
    const code = l.productCode?.trim() || codeByDesc.get(`${sup}|${descUnit(l)}`) || null
    return code ? `${sup}|code:${code.toLowerCase()}` : `${sup}|desc:${descUnit(l)}`
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
  const days = (from: number, to: number, price: number) =>
    new Set(
      series
        .slice(from, to + 1)
        .filter((l) => samePrice(l.price, price))
        .map((l) => dayKey(l.invoiceDate))
    ).size

  // Runs of one price, newest first.
  const runs: { price: number; first: number; last: number; days: number }[] = []
  for (let k = series.length - 1; k >= 0; k--) {
    const r = runs[runs.length - 1]
    if (r && samePrice(series[k].price, r.price)) r.first = k
    else runs.push({ price: series[k].price, first: k, last: k, days: 0 })
  }
  for (const r of runs) r.days = days(r.first, r.last, r.price)

  // The newest run must stand on its own 2 deliveries before any folding:
  // otherwise two prices alternating one delivery at a time (two venues on
  // one unlabelled series, two packs on one key) fold into a fake move.
  if (runs[0].days < STABLE_CONFIRM_DELIVERIES) return null

  // A one-delivery run between two runs of the current price is a blip
  // (an invoice still at the old price, a mis-key): fold it into the
  // current run rather than letting it cancel the move.
  const current = runs[0].price
  let first = runs[0].first
  let k = 1
  while (k + 1 < runs.length && runs[k].days < 2 && samePrice(runs[k + 1].price, current)) {
    first = runs[k + 1].first
    k += 2
  }
  if (k >= runs.length) return null // one price all window: nothing moved

  if (days(first, series.length - 1, current) < STABLE_CONFIRM_DELIVERIES) return null
  const changedAt = series[first].invoiceDate
  if (changedAt.getTime() < windowStart) return null

  // Was: the last price paid, the run just before. Exception: a
  // one-delivery run there (a promo just before a rise) gives way to the
  // established price behind it, but only when that price sits between
  // the promo and today's price. That can shrink an overstated move; it
  // can never flip a rise into a drop (12, 12, 10, 11, 11 is 10 to 11).
  let prior = runs[k]
  const established = k + 1 < runs.length ? runs[k + 1] : null
  if (
    prior.days < 2 &&
    established &&
    established.days >= 2 &&
    Math.min(prior.price, current) < established.price &&
    established.price < Math.max(prior.price, current)
  ) {
    prior = established
  }
  if (samePrice(prior.price, current)) return null

  return { current, prior: prior.price, changedAt }
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
