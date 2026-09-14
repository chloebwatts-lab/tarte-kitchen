/**
 * The Tarte Ten, verbatim from `docs/training/00-training-system.md`.
 *
 * They rotate one per line-up so the whole culture is re-taught every two
 * weeks, forever. The rotation is derived from the date rather than stored,
 * so there is no pointer to drift out of step, and every venue is on the same
 * value on the same day — which matters when one manager covers both shops.
 */
export const TARTE_TEN = [
  'I greet every guest within 30 seconds, even if it is just eye contact and "won\'t be a moment".',
  "I know what is in the cabinet today, and I have tasted it.",
  'I name one thing. I never ask "anything else?"',
  "I tell guests the wait before they ask.",
  "I ask about allergies early, and treat the answer as law.",
  "I own problems: hear, empathise, apologise, resolve. I never argue.",
  "My section is spotless without being asked.",
  "Meals land together, hot, complete. If they cannot, I say so first.",
  "I help the team, but my section comes first.",
  "I farewell every guest by choice, not by accident, and invite them back.",
] as const

/** Days since the epoch in AEST, so the value turns over at local midnight. */
function aestDayNumber(date: Date): number {
  const aest = new Date(date.getTime() + 10 * 60 * 60 * 1000)
  return Math.floor(aest.getTime() / (24 * 60 * 60 * 1000))
}

export interface TarteValue {
  /** 1-based, as printed in the booklets. */
  number: number
  text: string
}

export function valueForDate(date: Date): TarteValue {
  const n = TARTE_TEN.length
  const i = ((aestDayNumber(date) % n) + n) % n
  return { number: i + 1, text: TARTE_TEN[i] }
}
