import type { ProcessedPayRun } from "@/lib/xero/client"

/**
 * Which Xero orgs the pay-run sync asks Tarte Shifts for, and how runs from
 * several orgs collapse into Kitchen's one-row-per-week WeeklyLabourCost.
 * Tarte Bakery pays Burleigh, Tarte Currumbin pays Beach House + Tea Garden;
 * both run Wednesday-to-Tuesday weekly pay periods.
 */
export function payRunOrgs(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.SHIFTS_PAYRUNS_ORGS ?? env.SHIFTS_PAYRUNS_ORG ?? "Tarte Bakery,Tarte Currumbin")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const unique = [...new Set(list)]
  return unique.length ? unique : ["Tarte Bakery", "Tarte Currumbin"]
}

/** Sum pay runs that share a period start (one row per week across orgs). */
export function mergePayRunsByWeek(runs: ProcessedPayRun[]): ProcessedPayRun[] {
  const byWeek = new Map<string, ProcessedPayRun>()
  for (const r of runs) {
    const key = r.weekStart.toISOString().slice(0, 10)
    const cur = byWeek.get(key)
    if (!cur) {
      byWeek.set(key, { ...r })
      continue
    }
    cur.grossWages = Math.round((cur.grossWages + r.grossWages) * 100) / 100
    cur.superAmount = Math.round((cur.superAmount + r.superAmount) * 100) / 100
    cur.totalCost = Math.round((cur.totalCost + r.totalCost) * 100) / 100
    cur.headcount += r.headcount
    cur.payRunId = `${cur.payRunId}+${r.payRunId}`
    if (r.paymentDate > cur.paymentDate) cur.paymentDate = r.paymentDate
  }
  return [...byWeek.values()].sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
}

