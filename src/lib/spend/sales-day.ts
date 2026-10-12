/**
 * A sales-summary row counts as a completed trading day for revenue pace
 * unless it is today's intraday API figure (Square sync rewrites it every
 * half hour while the venue trades). A final EMAIL row for today is fine.
 */
export function isCompletedSalesDay(
  dateKey: string,
  todayAest: string,
  source: "API" | "EMAIL"
): boolean {
  return dateKey !== todayAest || source === "EMAIL"
}
