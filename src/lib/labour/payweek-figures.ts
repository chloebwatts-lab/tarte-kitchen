import { promises as fs } from "node:fs"
import path from "node:path"

/**
 * The Friday digest's wage section from the Xero pay runs, from the week
 * ending Tue 10 Nov 2026 (Louise Kilgour's payroll PDFs stopped when she left
 * payroll on 10 Nov 2026).
 *
 * Source: the Thursday venue cards' own figures file, weeks/<W>.figures.json,
 * built by the read-only method in tarte-loose-ends/reports/weekly-cards/method
 * (README there). It reads every payslip of the week's Xero runs through the
 * Shifts box and places the pay by venue and department: hourly staff at the
 * paying company's venue in their Shifts home department, salaries by the days
 * worked, Tea Garden hours carved out, admin and the payslips' own leave, TOIL
 * and backpay lines split out. run-week.sh copies the file into this app's
 * data volume (PAYWEEK_FIGURES_DIR). It holds venue and department totals
 * only, no names; parsePayWeekFigures copies just the fields the digest uses.
 *
 * Kitchen makes no Xero call of its own for this: the posted-run check uses
 * Tarte Shifts' pay-runs feed (one list call per company, run detail cached).
 */

export const PAYWEEK_VENUES = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as const
export type PayWeekVenue = (typeof PAYWEEK_VENUES)[number]

export const PAYWEEK_ORGS = ["Tarte Bakery", "Tarte Currumbin"] as const

/** Which company's pay run each venue's wages come from. */
export const PAYWEEK_ORG_FOR_VENUE: Record<PayWeekVenue, string> = {
  BURLEIGH: "Tarte Bakery",
  BEACH_HOUSE: "Tarte Currumbin",
  TEA_GARDEN: "Tarte Currumbin",
}

const VENUE_LABEL: Record<PayWeekVenue, string> = {
  BURLEIGH: "Burleigh",
  BEACH_HOUSE: "Beach House",
  TEA_GARDEN: "Tea Garden",
}

/**
 * First digest week read from the pay runs (Wed 4 Nov 2026, w/e Tue 10 Nov).
 * From this week on the digest never reads LabourWeekActual (her PDFs);
 * earlier weeks still can, so old digests re-run the same.
 */
export const PAYWEEK_CUTOVER = "2026-11-04"

export const DEFAULT_PAYWEEK_DIR = "/app/data/labour-weeks"

type Band = [number, number]

export interface PayWeekVenueFigures {
  revenue: number
  wages: {
    total: number
    exAdmin: number
    exAdminLeaveBackpay: number
    admin: number
    leaveBackpay: number
  }
  depts: {
    chefsKp: { dollars: number; band: Band | null }
    fohBarista: { dollars: number; band: Band | null }
    pastry: { dollars: number; band: Band | null }
    admin: { dollars: number }
    other: { dollars: number }
  }
}

export type PayWeekRunStatus = "POSTED" | "DRAFT" | "none"

export interface PayWeekFigures {
  weekStartWed: string
  generatedAt: string | null
  payRuns: Record<string, { status: PayWeekRunStatus; total: number | null }>
  /** Set by the method when a company has no run for the week: no venues then. */
  stop: string | null
  venues: Partial<Record<PayWeekVenue, PayWeekVenueFigures>>
  /** The method's own check that the three venues add up to both runs. */
  venuesSumToBothRuns: boolean | null
}

export type ParseResult = { ok: true; figures: PayWeekFigures } | { ok: false; reason: string }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x)
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null)

function band(x: unknown): Band | null {
  if (!Array.isArray(x) || x.length !== 2) return null
  const lo = num(x[0])
  const hi = num(x[1])
  return lo != null && hi != null ? [lo, hi] : null
}

/**
 * Validate a figures file for the given week and copy out only what the
 * digest needs (venue and department dollars, revenue, run status).
 */
export function parsePayWeekFigures(raw: unknown, weekStartWed: string): ParseResult {
  if (!isObj(raw)) return { ok: false, reason: "not a JSON object" }
  if (raw.weekStartWed !== weekStartWed)
    return { ok: false, reason: `file is for week ${String(raw.weekStartWed)}, not ${weekStartWed}` }
  if (!isObj(raw.payRuns)) return { ok: false, reason: "no payRuns" }

  const payRuns: PayWeekFigures["payRuns"] = {}
  for (const org of PAYWEEK_ORGS) {
    const r = raw.payRuns[org]
    const status = isObj(r) ? r.status : undefined
    payRuns[org] = {
      status: status === "POSTED" || status === "DRAFT" ? status : "none",
      total: isObj(r) ? num(r.total) : null,
    }
  }

  const stop = typeof raw.stop === "string" && raw.stop.trim() ? raw.stop.trim() : null
  const venues: PayWeekFigures["venues"] = {}
  if (!stop) {
    if (!isObj(raw.venues)) return { ok: false, reason: "no venues" }
    for (const v of PAYWEEK_VENUES) {
      const fv = raw.venues[v]
      if (!isObj(fv) || !isObj(fv.wages) || !isObj(fv.depts)) return { ok: false, reason: `${v} missing` }
      const w = fv.wages
      const d = fv.depts
      const dept = (k: string) => (isObj(d[k]) ? d[k] : {}) as Record<string, unknown>
      const revenue = num(fv.revenue)
      const total = num(w.total)
      const exAdmin = num(w.exAdmin)
      const exAdminLeaveBackpay = num(w.exAdminLeaveBackpay)
      const admin = num(w.admin)
      const leaveBackpay = num(w.leaveBackpay)
      const chefsKp = num(dept("chefsKp").dollars)
      const fohBarista = num(dept("fohBarista").dollars)
      const pastry = num(dept("pastry").dollars)
      const deptAdmin = num(dept("admin").dollars)
      const other = num(dept("other").dollars)
      if (
        revenue == null || total == null || exAdmin == null || exAdminLeaveBackpay == null ||
        admin == null || leaveBackpay == null || chefsKp == null || fohBarista == null ||
        pastry == null || deptAdmin == null || other == null
      )
        return { ok: false, reason: `${v} has a missing or non-numeric figure` }
      venues[v] = {
        revenue,
        wages: { total, exAdmin, exAdminLeaveBackpay, admin, leaveBackpay },
        depts: {
          chefsKp: { dollars: chefsKp, band: band(dept("chefsKp").band) },
          fohBarista: { dollars: fohBarista, band: band(dept("fohBarista").band) },
          pastry: { dollars: pastry, band: band(dept("pastry").band) },
          admin: { dollars: deptAdmin },
          other: { dollars: other },
        },
      }
    }
  }

  const checks = isObj(raw.checks) ? raw.checks : null
  return {
    ok: true,
    figures: {
      weekStartWed,
      generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : null,
      payRuns,
      stop,
      venues,
      venuesSumToBothRuns: checks && typeof checks.venuesSumToBothRuns === "boolean" ? checks.venuesSumToBothRuns : null,
    },
  }
}

export interface LoadResult {
  figures: PayWeekFigures | null
  /** Why a file that exists could not be used (null when absent or fine). */
  problem: string | null
}

/** Read weeks/<W>.figures.json from the data volume; absent is not an error. */
export async function loadPayWeekFigures(
  weekStartWed: string,
  env: Record<string, string | undefined> = process.env
): Promise<LoadResult> {
  const dir = env.PAYWEEK_FIGURES_DIR || DEFAULT_PAYWEEK_DIR
  const file = path.join(dir, `${weekStartWed}.figures.json`)
  let text: string
  try {
    text = await fs.readFile(file, "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { figures: null, problem: null }
    return { figures: null, problem: `could not read ${path.basename(file)}` }
  }
  try {
    const parsed = parsePayWeekFigures(JSON.parse(text), weekStartWed)
    return parsed.ok ? { figures: parsed.figures, problem: null } : { figures: null, problem: parsed.reason }
  } catch {
    return { figures: null, problem: `${path.basename(file)} is not valid JSON` }
  }
}

/** Posted Xero totals per company for the week: null = could not check. */
export type PostedTotals = Map<string, { total: number; runs: number } | null>

export type DeptStatus = "ok" | "amber" | "red" | "no-target"

/**
 * Same rule as the rest of the digest: only overspend is flagged. At or
 * under the top of the band is ok, up to half a point over is amber.
 */
export function bandStatus(pct: number | null, b: Band | null): DeptStatus {
  if (pct == null || !b) return "no-target"
  if (pct <= b[1]) return "ok"
  if (pct <= b[1] + 0.5) return "amber"
  return "red"
}

export interface PayWeekLabourVenue {
  venue: string
  revenueExGst: number | null
  grossWages: number
  overallPct: number | null
  reportedPct: null
  exAdminPct: number | null
  exAdminLeavePct: number | null
  departmentGroups: Array<{
    label: string
    dollars: number
    pct: number | null
    target: { min: number; max: number } | null
    status: DeptStatus
  }>
  /** The company's run was a draft when the cards ran and is not posted since. */
  fromDraft: boolean
}

export interface PayWeekLabour {
  weekStartWed: string
  source: "payweek"
  perVenue: PayWeekLabourVenue[]
  notes: string[]
}

const money = (n: number) =>
  `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const cents = (n: number) => Math.round(n * 100)

/**
 * Venue lines for the digest from a figures file, with the companies' runs
 * checked against what Xero shows as posted right now.
 */
export function labourFromPayWeek(fig: PayWeekFigures, posted: PostedTotals): PayWeekLabour {
  const notes: string[] = []
  const draftOrgs = new Set<string>()
  const tied: string[] = []
  let couldNotCheck = false

  for (const org of PAYWEEK_ORGS) {
    const run = fig.payRuns[org]
    const now = posted.get(org) ?? null
    const pulled = run?.total ?? null
    if (now == null) {
      couldNotCheck = true
      if (run?.status === "DRAFT") {
        draftOrgs.add(org)
        notes.push(`${org}'s pay run was still a draft when the cards ran, so its venues can move a little once it is posted.`)
      }
      continue
    }
    if (now.runs === 0) {
      if (run?.status === "DRAFT") {
        draftOrgs.add(org)
        notes.push(`${org}'s pay run is not posted yet. These are from the draft, so they can move a little once it is posted.`)
      } else {
        notes.push(`Xero no longer shows a posted ${org} run for this week. These figures are from the Thursday pull.`)
      }
      continue
    }
    if (pulled != null && cents(now.total) === cents(pulled)) {
      tied.push(org)
      continue
    }
    // Posted now (with a different total): not a draft any more, the note
    // below says the figures predate the posted run.
    const diff = pulled != null ? now.total - pulled : null
    notes.push(
      `${org}: the posted run is now ${money(now.total)}` +
        (diff != null ? `, ${money(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the ${money(pulled!)} the Thursday pull read` : "") +
        `. These figures are from that pull until the venue cards are re-run for this week.`
    )
  }
  if (couldNotCheck)
    notes.push("Could not re-check the posted runs in Xero just now, so these are as the Thursday pull read them.")
  if (tied.length)
    notes.unshift(`Ties to the posted Xero pay run${tied.length > 1 ? "s" : ""} to the cent (${tied.join(" and ")}).`)
  if (fig.venuesSumToBothRuns === false)
    notes.push("The three venues do not add up to the two pay runs in this week's cards file. Check it before relying on the split.")

  const perVenue: PayWeekLabourVenue[] = []
  for (const v of PAYWEEK_VENUES) {
    const f = fig.venues[v]
    if (!f) continue
    const rev = f.revenue > 0 ? f.revenue : null
    const pct = (n: number) => (rev ? (n / rev) * 100 : null)
    const groups: PayWeekLabourVenue["departmentGroups"] = []
    const add = (label: string, dollars: number, b: Band | null, always: boolean) => {
      if (!always && Math.abs(dollars) < 0.005) return
      const p = pct(dollars)
      groups.push({
        label,
        dollars,
        pct: p,
        target: b ? { min: b[0], max: b[1] } : null,
        status: bandStatus(p, b),
      })
    }
    // Tea Garden shows only the departments that carry pay that week.
    const all = v !== "TEA_GARDEN"
    add("Chefs + KP", f.depts.chefsKp.dollars, f.depts.chefsKp.band, all)
    add(v === "BURLEIGH" ? "FOH + Barista" : "FOH (incl. Barista)", f.depts.fohBarista.dollars, f.depts.fohBarista.band, all)
    add("Pastry", f.depts.pastry.dollars, f.depts.pastry.band, all)
    add("Admin", f.depts.admin.dollars, null, false)
    add("No department in Shifts", f.depts.other.dollars, null, false)
    perVenue.push({
      venue: VENUE_LABEL[v],
      revenueExGst: rev,
      grossWages: f.wages.total,
      overallPct: pct(f.wages.total),
      reportedPct: null,
      exAdminPct: pct(f.wages.exAdmin),
      exAdminLeavePct: pct(f.wages.exAdminLeaveBackpay),
      departmentGroups: groups,
      fromDraft: draftOrgs.has(PAYWEEK_ORG_FOR_VENUE[v]),
    })
  }
  return { weekStartWed: fig.weekStartWed, source: "payweek", perVenue, notes }
}
