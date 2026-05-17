/**
 * TEMPORARY probe — delete after the FOH-live build is wired up.
 *
 * Pulls the current Tarte week's Timesheet rows + the full Employee
 * list so we can eyeball:
 *   1. Are unapproved rows queryable mid-week? (sanity)
 *   2. How are salary-placeholder "employees" structured? (zero PayRate
 *      but with a Cost? regular rate but flagged Approved=true even
 *      with no shift?)
 *   3. For full-time staff who clock in (Oliver / Jessica / Jose), do
 *      their Timesheet rows have Cost=0, or PayRate=0, or some other
 *      tell that signals "exclude from live spend"?
 *
 * Returns enough raw shape per row to reason about the model without
 * having to add the data to a UI.
 */

import { NextRequest } from "next/server"
import {
  listEmployees,
  listTimesheetsSince,
  listOpUnits,
  type DeputyEmployee,
  type DeputyTimesheet,
} from "@/lib/deputy/client"
import { startOfTarteWeekUtc } from "@/lib/dates"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const wedAest = startOfTarteWeekUtc(new Date())
  // startOfTarteWeekUtc returns Wed 00:00 UTC labelled as the AEST Wed;
  // for Deputy's unix-seconds filter we want the actual UTC instant of
  // Wed 00:00 AEST (i.e. subtract 10h).
  const sinceUnix = Math.floor(wedAest.getTime() / 1000) - 10 * 3600

  const [employees, timesheets, opUnits] = await Promise.all([
    listEmployees(),
    listTimesheetsSince(sinceUnix),
    listOpUnits(),
  ])

  // Employees who logged any time this week
  const empWithRows = new Map<number, number>() // empId → row count
  const empWithCost = new Map<number, number>() // empId → total cost
  for (const t of timesheets) {
    empWithRows.set(t.Employee, (empWithRows.get(t.Employee) ?? 0) + 1)
    empWithCost.set(
      t.Employee,
      (empWithCost.get(t.Employee) ?? 0) + (t.Cost ?? 0)
    )
  }

  // Build enriched employee summaries — only ones with activity OR a
  // notable name pattern (so we can spot salary placeholders).
  const empMap = new Map<number, DeputyEmployee>(
    employees.map((e) => [e.Id, e])
  )
  const opUnitMap = new Map<number, string>(
    opUnits.map((o) => [o.Id, o.OperationalUnitName])
  )

  const activeEmps = Array.from(empWithRows.keys())
    .map((id) => {
      const e = empMap.get(id)
      return {
        id,
        name: e?.DisplayName ?? `unknown-${id}`,
        payRate: e?.PayRate ?? null,
        rowsThisWeek: empWithRows.get(id) ?? 0,
        costThisWeek: empWithCost.get(id) ?? 0,
      }
    })
    .sort((a, b) => (b.costThisWeek || 0) - (a.costThisWeek || 0))

  // Look for likely salary-placeholders: high cost but zero rows
  // (i.e. employees the payroll system attributes cost to without
  // any clock-in), or display names containing SALARY / SAL / FT etc.
  const allEmpSummary = employees
    .filter(
      (e) =>
        /salary|salar|salaried|\bft\b|full.?time|wages?/i.test(e.DisplayName) ||
        (e.PayRate ?? 0) === 0
    )
    .slice(0, 50)
    .map((e) => ({
      id: e.Id,
      name: e.DisplayName,
      payRate: e.PayRate ?? null,
      rowsThisWeek: empWithRows.get(e.Id) ?? 0,
      costThisWeek: empWithCost.get(e.Id) ?? 0,
    }))

  // Sample raw timesheet shape (first 5 rows so we can inspect)
  const sampleRows = timesheets.slice(0, 5).map((t: DeputyTimesheet) => ({
    id: t.Id,
    employee: empMap.get(t.Employee)?.DisplayName ?? `id-${t.Employee}`,
    employeeId: t.Employee,
    employeePayRate: empMap.get(t.Employee)?.PayRate ?? null,
    opUnit: opUnitMap.get(t.OperationalUnit) ?? `id-${t.OperationalUnit}`,
    startTime: new Date(t.StartTime * 1000).toISOString(),
    endTime: t.EndTime ? new Date(t.EndTime * 1000).toISOString() : null,
    totalHours: t.TotalTime,
    cost: t.Cost,
    payRate: t.PayRate,
    approved: t.Approved,
  }))

  return Response.json({
    weekStartAest: wedAest.toISOString().slice(0, 10),
    sinceUnix,
    counts: {
      totalEmployees: employees.length,
      activeThisWeek: activeEmps.length,
      timesheetRowsThisWeek: timesheets.length,
      unapprovedRowsThisWeek: timesheets.filter((t) => !t.Approved).length,
    },
    activeEmployees: activeEmps,
    likelySalaryPlaceholders: allEmpSummary,
    sampleRows,
    opUnits: opUnits.map((o) => ({ id: o.Id, name: o.OperationalUnitName })),
  })
}
