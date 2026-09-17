/**
 * Oliver's week is the Tarte trading week: Wednesday to Tuesday, the same
 * week rosters, payroll, COGS and every report run on. His GM days are
 * Thursday, Friday and Monday; the weekend is on the floor; Tuesday and
 * Wednesday are off. The Monday report is the last thing before days off.
 */

import { addDays, todayAest, ymd } from "@/lib/commitments/weeks"

/** Wednesday (UTC-midnight date) of the trading week containing `d`. */
export function gmWeekStartOf(d: Date): Date {
  const since = (d.getUTCDay() + 4) % 7 // Wed=0, Thu=1 ... Tue=6
  return addDays(d, -since)
}

/** Wednesday of the current week, YYYY-MM-DD. */
export function gmWeekStart(): string {
  return ymd(gmWeekStartOf(todayAest()))
}

/** Position of an ISO weekday (1=Mon..7=Sun) inside the week: Wed=0 ... Tue=6. */
export function gmWeekPos(isoDay: number): number {
  return (isoDay + 4) % 7
}
