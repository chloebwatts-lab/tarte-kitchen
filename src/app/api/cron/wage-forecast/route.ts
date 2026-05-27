/**
 * TEMPORARY endpoint — pulls the live wage forecast for the Tarte week
 * containing the optional `at` query timestamp (defaults to now).
 *
 * Usage:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "http://app:3000/api/cron/wage-forecast?at=2026-05-26T13:00:00Z"
 *
 * With `?diagnostic=1`, also returns per-employee labour rows for the
 * Tarte week containing `at`, plus DeputyConnection multiplier rates —
 * used to triage which hypothesis is driving the over-target wage %
 * (salary double-count vs. multiplier vs. revenue source).
 *
 * Delete after we've logged the forecast for the 2026-05-20 → 2026-05-26
 * trading week.
 */

import { NextRequest } from "next/server"
import { getLiveLabourSnapshot } from "@/lib/actions/labour-live"
import { db } from "@/lib/db"
import { currentTarteWeekRange } from "@/lib/dates"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const at = req.nextUrl.searchParams.get("at")
  const now = at ? new Date(at) : new Date()
  if (Number.isNaN(now.getTime())) {
    return new Response("Bad `at`", { status: 400 })
  }

  const snap = await getLiveLabourSnapshot({ now })

  const diagnostic = req.nextUrl.searchParams.get("diagnostic") === "1"
  if (!diagnostic) {
    return Response.json({ asOf: now.toISOString(), ...snap })
  }

  const { start: weekStart, end: weekEnd } = currentTarteWeekRange(now)
  // Match the snapshot's instant-corrected window so the diagnostic
  // reflects exactly what `getLiveLabourSnapshot` sees.
  const AEST_OFFSET_MS = 10 * 60 * 60 * 1000
  const weekStartInstant = new Date(weekStart.getTime() - AEST_OFFSET_MS)
  const weekEndInstant = new Date(weekEnd.getTime() - AEST_OFFSET_MS)

  const [shifts, connection, sales] = await Promise.all([
    db.labourShift.findMany({
      where: { shiftStart: { gte: weekStartInstant, lt: weekEndInstant } },
      select: {
        venue: true,
        area: true,
        cost: true,
        hours: true,
        payRate: true,
        source: true,
        employeeName: true,
        employeeId: true,
        shiftStart: true,
      },
      orderBy: [{ venue: "asc" }, { employeeName: "asc" }, { shiftStart: "asc" }],
    }),
    db.deputyConnection.findFirst({
      select: { superRate: true, onCostUpliftRate: true, defaultOpenShiftRate: true },
    }),
    db.dailySalesSummary.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      select: { venue: true, date: true, totalRevenueExGst: true },
      orderBy: [{ venue: "asc" }, { date: "asc" }],
    }),
  ])

  // Group per (venue, employeeName) so we can spot double-counting
  // — i.e. the same person showing up in BOTH a "Salary X" ROSTER
  // placeholder row AND non-zero-cost TIMESHEET rows in another area.
  type Row = {
    venue: string
    employeeName: string
    timesheetHours: number
    timesheetCost: number
    timesheetAreas: string[]
    rosterCost: number
    rosterAreas: string[]
    hasSalaryPlaceholder: boolean
    salaryPlaceholderCost: number
    doubleCountedCost: number
  }
  const byEmp = new Map<string, Row>()
  for (const s of shifts) {
    const key = `${s.venue}|${s.employeeName}`
    let row = byEmp.get(key)
    if (!row) {
      row = {
        venue: s.venue,
        employeeName: s.employeeName,
        timesheetHours: 0,
        timesheetCost: 0,
        timesheetAreas: [],
        rosterCost: 0,
        rosterAreas: [],
        hasSalaryPlaceholder: false,
        salaryPlaceholderCost: 0,
        doubleCountedCost: 0,
      }
      byEmp.set(key, row)
    }
    const isSalary = s.area?.toLowerCase().startsWith("salary") ?? false
    const cost = Number(s.cost)
    if (s.source === "TIMESHEET") {
      row.timesheetHours += Number(s.hours)
      row.timesheetCost += cost
      if (s.area && !row.timesheetAreas.includes(s.area)) {
        row.timesheetAreas.push(s.area)
      }
    } else {
      if (isSalary) {
        row.hasSalaryPlaceholder = true
        row.salaryPlaceholderCost += cost
      } else {
        row.rosterCost += cost
        if (s.area && !row.rosterAreas.includes(s.area)) {
          row.rosterAreas.push(s.area)
        }
      }
    }
  }
  // Double-count = salaried employee who also logged non-zero TIMESHEET
  // cost. The full timesheet cost is the over-count amount (their salary
  // placeholder already covers them; the timesheet should have been
  // PayRate=0 → Cost=0).
  for (const row of byEmp.values()) {
    if (row.hasSalaryPlaceholder && row.timesheetCost > 0) {
      row.doubleCountedCost = row.timesheetCost
    }
  }

  const employees = Array.from(byEmp.values()).sort(
    (a, b) =>
      (b.doubleCountedCost || 0) - (a.doubleCountedCost || 0) ||
      b.timesheetCost - a.timesheetCost
  )

  // Roll up double-count per venue so we can quantify the magnitude.
  const doubleCountByVenue: Record<string, number> = {}
  for (const row of employees) {
    if (row.doubleCountedCost > 0) {
      doubleCountByVenue[row.venue] =
        (doubleCountByVenue[row.venue] ?? 0) + row.doubleCountedCost
    }
  }

  // Replay the exact branch the snapshot takes for ROSTER rows, so we
  // can see WHICH individual shifts are getting counted as "remaining"
  // labour. Critical for diagnosing why labourRemaining is still
  // implausibly high after the week-window fix.
  const remainingContributors = shifts
    .filter((s) => s.source !== "TIMESHEET")
    .map((s) => {
      const isSalary = s.area?.toLowerCase().startsWith("salary") ?? false
      const isFuture = s.shiftStart.getTime() > now.getTime()
      return {
        venue: s.venue,
        employeeName: s.employeeName,
        area: s.area,
        cost: Number(s.cost),
        shiftStart: s.shiftStart.toISOString(),
        isFuture,
        isSalary,
        counted: isFuture || isSalary,
      }
    })
    .filter((r) => r.counted)
    .sort((a, b) => b.cost - a.cost)
  const remainingByVenueRaw: Record<string, number> = {}
  for (const r of remainingContributors) {
    remainingByVenueRaw[r.venue] = (remainingByVenueRaw[r.venue] ?? 0) + r.cost
  }

  return Response.json({
    asOf: now.toISOString(),
    nowEpochMs: now.getTime(),
    week: {
      start: weekStart,
      end: weekEnd,
      startInstant: weekStartInstant,
      endInstant: weekEndInstant,
    },
    snapshot: snap,
    multipliers: {
      superRate: Number(connection?.superRate ?? 0),
      onCostUpliftRate: Number(connection?.onCostUpliftRate ?? 0),
      totalMultiplier:
        1 +
        Number(connection?.superRate ?? 0) +
        Number(connection?.onCostUpliftRate ?? 0),
      defaultOpenShiftRate: Number(connection?.defaultOpenShiftRate ?? 0),
    },
    salesByDay: sales.map((s) => ({
      venue: s.venue,
      date: s.date.toISOString().slice(0, 10),
      revenueExGst: Number(s.totalRevenueExGst),
    })),
    doubleCountSuspects: employees.filter((e) => e.doubleCountedCost > 0),
    doubleCountByVenueRaw: doubleCountByVenue, // pre-multiplier $
    employees: employees.slice(0, 80), // cap so the response stays manageable
    remainingByVenueRaw, // pre-multiplier $
    remainingContributors: remainingContributors.slice(0, 100),
    remainingContributorsTotal: remainingContributors.length,
  })
}
