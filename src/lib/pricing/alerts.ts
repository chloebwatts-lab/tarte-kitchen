// Alert evaluation over a product's observation history. Pure; no database.
//
// Thresholds are carried over from the v2 engine (they were tuned on real
// invoices): STABLE fires on a >=5% move either way against the
// ingredient's current cost; PRODUCE fires only when the latest two
// deliveries are both >=25% above the trailing 4-week median (excluding
// the delivery under test).

import type {
  EvaluateOutcome,
  ObservationPoint,
  PriceStream,
  RecentDecision,
} from "./types"

export const STABLE_THRESHOLD_PCT = 5
export const PRODUCE_THRESHOLD_PCT = 25
export const PRODUCE_CONFIRM_DELIVERIES = 2
export const TRAILING_WINDOW_DAYS = 28
/** A chef decision at a price within this band is "the same price". */
export const DECISION_STICK_PCT = 2
/** Beyond this a move is a data error, not a price. */
export const ABSURD_PCT = 500

const DAY = 86_400_000

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Latest observation per distinct day, oldest first. */
export function byDelivery(points: ObservationPoint[]): ObservationPoint[] {
  const m = new Map<number, ObservationPoint>()
  for (const p of [...points].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())) {
    m.set(dayKey(p.observedAt), p) // last on the day wins
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])
}

function dayKey(d: Date): number {
  return Math.floor(d.getTime() / DAY)
}

export function pctChange(current: number, prior: number): number {
  return ((current - prior) / prior) * 100
}

/**
 * Weekly dollar impact of moving from prior to current, using delivered
 * volume over the trailing window. Null when no volume is known.
 */
export function weeklyImpact(
  points: ObservationPoint[],
  asOf: Date,
  current: number,
  prior: number
): number | null {
  const from = asOf.getTime() - TRAILING_WINDOW_DAYS * DAY
  let vol = 0
  let any = false
  for (const p of points) {
    const t = p.observedAt.getTime()
    if (t < from || t > asOf.getTime()) continue
    if (p.baseUnitsDelivered === null) continue
    vol += p.baseUnitsDelivered
    any = true
  }
  if (!any) return null
  const weeks = TRAILING_WINDOW_DAYS / 7
  return Math.round(((vol / weeks) * (current - prior)) * 100) / 100
}

export function evaluateProduct(
  stream: PriceStream,
  points: ObservationPoint[],
  /** Ingredient's current cost per base unit (purchasePrice / baseUnitsPerPurchase). */
  ingredientPerBase: number | null,
  recent: RecentDecision | null,
  now: Date = new Date()
): EvaluateOutcome {
  const deliveries = byDelivery(points)
  if (deliveries.length === 0) return { fire: false, reason: "no valid observations" }
  const latest = deliveries[deliveries.length - 1]
  const current = latest.pricePerBaseUnit

  let prior: number
  let priorMedian: number | null = null

  if (stream === "PRODUCE") {
    const from = latest.observedAt.getTime() - TRAILING_WINDOW_DAYS * DAY
    const window = deliveries.filter(
      (p) => p.observedAt.getTime() >= from && p.observedAt.getTime() < latest.observedAt.getTime()
    )
    if (window.length < 2) return { fire: false, reason: "fewer than 2 prior deliveries in window" }
    priorMedian = median(window.map((p) => p.pricePerBaseUnit))!
    prior = priorMedian
    if (deliveries.length < PRODUCE_CONFIRM_DELIVERIES) {
      return { fire: false, reason: "not enough deliveries to confirm" }
    }
    const recentDeliveries = deliveries.slice(-PRODUCE_CONFIRM_DELIVERIES)
    const allAbove = recentDeliveries.every(
      (p) => pctChange(p.pricePerBaseUnit, prior) >= PRODUCE_THRESHOLD_PCT
    )
    if (!allAbove) return { fire: false, reason: "not confirmed across consecutive deliveries" }
  } else {
    if (ingredientPerBase === null || !(ingredientPerBase > 0)) {
      return { fire: false, reason: "ingredient has no cost to compare against" }
    }
    prior = ingredientPerBase
    if (Math.abs(pctChange(current, prior)) < STABLE_THRESHOLD_PCT) {
      return { fire: false, reason: "within threshold" }
    }
  }

  const change = pctChange(current, prior)
  if (Math.abs(change) >= ABSURD_PCT) {
    return { fire: false, reason: `absurd move (${change.toFixed(0)}%), data error not a price` }
  }

  // Chef decisions stick. Engine auto-closes do NOT: they were never seen
  // by a person, so they must not mute a real move for 45 days.
  if (
    recent &&
    recent.resolvedBy === "CHEF" &&
    recent.pricePerBaseUnit > 0 &&
    Math.abs(pctChange(current, recent.pricePerBaseUnit)) < DECISION_STICK_PCT
  ) {
    return { fire: false, reason: "already decided at this price" }
  }

  return {
    fire: true,
    alert: {
      kind: "PRICE_MOVE",
      stream,
      currentPerBase: current,
      priorPerBase: prior,
      priorMedianPerBase: priorMedian,
      changePct: Math.round(change * 100) / 100,
      weeklyImpactDollars: weeklyImpact(points, now, current, prior),
      latestObservedAt: latest.observedAt,
    },
  }
}

/**
 * The only write formula for accepting a price: the ingredient's
 * purchasePrice for its existing baseUnitsPerPurchase. purchaseQuantity
 * and purchaseUnit are untouched, which is what keeps recipe costing and
 * the accepted price on the same basis.
 */
export function newPurchasePrice(pricePerBaseUnit: number, baseUnitsPerPurchase: number): number {
  if (!(pricePerBaseUnit > 0) || !(baseUnitsPerPurchase > 0)) {
    throw new Error("newPurchasePrice needs positive inputs")
  }
  return Math.round(pricePerBaseUnit * baseUnitsPerPurchase * 10000) / 10000
}
