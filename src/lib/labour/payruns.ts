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

/**
 * The posted run whose pay period starts on the given Wednesday (UTC
 * midnight date, as LabourWeekActual.weekStartWed is stored), or null when
 * that week has not been posted yet.
 */
export function payRunForWeek(runs: ProcessedPayRun[], weekStartWed: Date): ProcessedPayRun | null {
  const key = weekStartWed.toISOString().slice(0, 10)
  return runs.find((r) => r.weekStart.toISOString().slice(0, 10) === key) ?? null
}

/**
 * Every posted run whose pay period starts on the given Wednesday, summed.
 * A company can post more than one run for a week (an off-cycle run for a
 * leaver, say); the venue cards count them all, so this does too.
 */
export function sumPostedForWeek(
  runs: ProcessedPayRun[],
  weekStartWed: Date
): { total: number; grossWages: number; superAmount: number; headcount: number; runs: number } {
  const key = weekStartWed.toISOString().slice(0, 10)
  const hit = runs.filter((r) => r.weekStart.toISOString().slice(0, 10) === key)
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    total: r2(hit.reduce((s, r) => s + r.totalCost, 0)),
    grossWages: r2(hit.reduce((s, r) => s + r.grossWages, 0)),
    superAmount: r2(hit.reduce((s, r) => s + r.superAmount, 0)),
    headcount: hit.reduce((s, r) => s + r.headcount, 0),
    runs: hit.length,
  }
}

/**
 * Which venues each Xero entity's pay run covers, for per-entity reads
 * (the Friday digest's provisional wage line). Louise moves a few
 * cross-venue salaries between the two after the fact, so a per-entity
 * total is within about 1% of her venue total, not equal to it.
 */
export const PAY_RUN_ORG_VENUES: ReadonlyArray<{
  org: string
  label: string
  venues: ReadonlyArray<"BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN">
}> = [
  { org: "Tarte Bakery", label: "Burleigh", venues: ["BURLEIGH"] },
  { org: "Tarte Currumbin", label: "Beach House + Tea Garden", venues: ["BEACH_HOUSE", "TEA_GARDEN"] },
]

/** True when the Tarte Shifts pay-runs feed is configured for this deploy. */
export function shiftsPayRunsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.SHIFTS_PAYRUNS_URL && env.SHIFTS_SECRET)
}

interface FeedPayRun extends Omit<ProcessedPayRun, "weekStart" | "weekEnd" | "paymentDate"> {
  weekStart: string
  weekEnd: string
  paymentDate: string
  /** Xero PayRunStatus. Shifts sends it from 11 Nov 2026. */
  status?: string
}

/**
 * Keep only the runs the feed marks POSTED. Until 11 Nov 2026 the feed sent
 * DRAFT runs as if posted (Xero ignores a bare ?PayRunStatus=POSTED) and
 * carried no status, so a feed run with no status is refused outright: a
 * draft must never be stored or reported as a posted week.
 */
export function postedFeedRuns<T extends { status?: string }>(org: string, runs: T[]): T[] {
  if (runs.some((r) => typeof r.status !== "string"))
    throw new Error(
      `Tarte Shifts pay-runs feed (${org}): runs carry no status, so posted cannot be told from draft (Shifts needs the 11 Nov 2026 feed fix)`
    )
  return runs.filter((r) => r.status === "POSTED")
}

/**
 * Posted pay runs for one Xero org from Tarte Shifts' internal feed
 * (SHIFTS_PAYRUNS_URL + SHIFTS_SECRET). Shifts holds the Xero connection
 * for every org, so Kitchen needs no uncertified-app slot of its own.
 * POSTED runs only (see postedFeedRuns); throws on a feed without status.
 */
export async function fetchShiftsPayRuns(
  org: string,
  fromDate: Date,
  env: Record<string, string | undefined> = process.env
): Promise<ProcessedPayRun[]> {
  const url = new URL(env.SHIFTS_PAYRUNS_URL!)
  url.searchParams.set("org", org)
  url.searchParams.set("from", fromDate.toISOString().slice(0, 10))
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.SHIFTS_SECRET}` },
    cache: "no-store",
  })
  const body = (await res.json()) as { ok?: boolean; error?: string; payRuns?: FeedPayRun[] }
  if (!res.ok || !body.ok) throw new Error(`Tarte Shifts pay-runs feed (${org}): ${body.error ?? res.status}`)
  return postedFeedRuns(org, body.payRuns ?? []).map(({ status: _status, ...r }) => ({
    ...r,
    weekStart: new Date(r.weekStart),
    weekEnd: new Date(r.weekEnd),
    paymentDate: new Date(r.paymentDate),
  }))
}

/**
 * Posted totals per company for one week (every posted run that starts on
 * that Wednesday), keyed by org name. null = not configured or the feed
 * failed, so the caller can say it could not check. One feed call per
 * company; Shifts caches posted run detail, so this is about one Xero list
 * call per company on the Starter tier.
 */
export async function postedPayRunTotals(
  weekStartWed: Date,
  env: Record<string, string | undefined> = process.env
): Promise<Map<string, ReturnType<typeof sumPostedForWeek> | null>> {
  const out = new Map<string, ReturnType<typeof sumPostedForWeek> | null>()
  for (const o of PAY_RUN_ORG_VENUES) {
    if (!shiftsPayRunsConfigured(env)) {
      out.set(o.org, null)
      continue
    }
    try {
      out.set(o.org, sumPostedForWeek(await fetchShiftsPayRuns(o.org, weekStartWed, env), weekStartWed))
    } catch (e) {
      console.error("[labour] posted pay runs:", e instanceof Error ? e.message : e)
      out.set(o.org, null)
    }
  }
  return out
}
