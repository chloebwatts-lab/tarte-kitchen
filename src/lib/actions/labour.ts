"use server"

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"

export interface LabourDashboardData {
  rangeDays: number
  venue: Venue | "ALL"
  totalCost: number
  totalHours: number
  totalRevenue: number
  labourPct: number | null
  byDay: {
    date: string
    cost: number
    hours: number
    revenue: number
    pctOfRevenue: number | null
  }[]
  byVenue: {
    venue: Venue
    cost: number
    hours: number
    revenue: number
    pctOfRevenue: number | null
  }[]
  byEmployee: {
    employeeName: string
    hours: number
    cost: number
    shifts: number
  }[]
  highestLabourDays: {
    date: string
    venue: Venue
    pctOfRevenue: number
    cost: number
    revenue: number
  }[]
}

function startOfAestDay(offsetDays = 0): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  aest.setUTCHours(0, 0, 0, 0)
  aest.setUTCDate(aest.getUTCDate() - offsetDays)
  return new Date(aest.toISOString().split("T")[0])
}

function ymd(d: Date): string {
  return d.toISOString().split("T")[0]
}

export async function getLabourDashboardData(params: {
  venue: Venue | "ALL"
  rangeDays?: number
}): Promise<LabourDashboardData> {
  const { venue, rangeDays = 28 } = params
  const start = startOfAestDay(rangeDays)
  const venueFilter =
    venue === "ALL"
      ? { venue: { in: [...SINGLE_VENUES] as Venue[] } }
      : { venue: { in: [venue as Venue] } }

  const shifts = await db.labourShift.findMany({
    where: { ...venueFilter, shiftStart: { gte: start } },
    orderBy: { shiftStart: "asc" },
  })
  const summaries = await db.dailySalesSummary.findMany({
    where: { ...venueFilter, date: { gte: start } },
  })

  const totalCost = shifts.reduce((s, r) => s + Number(r.cost), 0)
  const totalHours = shifts.reduce((s, r) => s + Number(r.hours), 0)
  const totalRevenue = summaries.reduce(
    (s, r) => s + Number(r.totalRevenueExGst),
    0
  )
  const labourPct =
    totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : null

  // By day — shifts grouped by the start date, revenue from daily summary
  const dayMap = new Map<
    string,
    { cost: number; hours: number }
  >()
  for (const s of shifts) {
    const key = ymd(new Date(s.shiftStart))
    const e = dayMap.get(key) ?? { cost: 0, hours: 0 }
    e.cost += Number(s.cost)
    e.hours += Number(s.hours)
    dayMap.set(key, e)
  }
  const revMap = new Map<string, number>()
  for (const r of summaries) {
    const key = ymd(new Date(r.date))
    revMap.set(
      key,
      (revMap.get(key) ?? 0) + Number(r.totalRevenueExGst)
    )
  }
  const allDays = new Set<string>([...dayMap.keys(), ...revMap.keys()])
  const byDay = Array.from(allDays)
    .sort()
    .map((date) => {
      const d = dayMap.get(date) ?? { cost: 0, hours: 0 }
      const revenue = revMap.get(date) ?? 0
      return {
        date,
        cost: Math.round(d.cost * 100) / 100,
        hours: Math.round(d.hours * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        pctOfRevenue:
          revenue > 0 ? Math.round((d.cost / revenue) * 10000) / 100 : null,
      }
    })

  // By venue
  const venueMap = new Map<Venue, { cost: number; hours: number }>()
  for (const s of shifts) {
    const e = venueMap.get(s.venue) ?? { cost: 0, hours: 0 }
    e.cost += Number(s.cost)
    e.hours += Number(s.hours)
    venueMap.set(s.venue, e)
  }
  const venueRev = new Map<Venue, number>()
  for (const r of summaries) {
    venueRev.set(
      r.venue,
      (venueRev.get(r.venue) ?? 0) + Number(r.totalRevenueExGst)
    )
  }
  const byVenue = SINGLE_VENUES.map((v) => {
    const e = venueMap.get(v) ?? { cost: 0, hours: 0 }
    const revenue = venueRev.get(v) ?? 0
    return {
      venue: v,
      cost: Math.round(e.cost * 100) / 100,
      hours: Math.round(e.hours * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      pctOfRevenue:
        revenue > 0 ? Math.round((e.cost / revenue) * 10000) / 100 : null,
    }
  }).filter((r) => r.cost > 0 || r.revenue > 0)

  // By employee
  const empMap = new Map<
    string,
    { hours: number; cost: number; shifts: number }
  >()
  for (const s of shifts) {
    const e = empMap.get(s.employeeName) ?? {
      hours: 0,
      cost: 0,
      shifts: 0,
    }
    e.hours += Number(s.hours)
    e.cost += Number(s.cost)
    e.shifts += 1
    empMap.set(s.employeeName, e)
  }
  const byEmployee = Array.from(empMap.entries())
    .map(([employeeName, v]) => ({
      employeeName,
      hours: Math.round(v.hours * 100) / 100,
      cost: Math.round(v.cost * 100) / 100,
      shifts: v.shifts,
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 15)

  // Highest labour % days per venue
  const perVenueDay = new Map<
    string,
    { date: string; venue: Venue; cost: number; revenue: number }
  >()
  for (const s of shifts) {
    const key = `${ymd(new Date(s.shiftStart))}|${s.venue}`
    const existing = perVenueDay.get(key) ?? {
      date: ymd(new Date(s.shiftStart)),
      venue: s.venue,
      cost: 0,
      revenue: 0,
    }
    existing.cost += Number(s.cost)
    perVenueDay.set(key, existing)
  }
  for (const r of summaries) {
    const key = `${ymd(new Date(r.date))}|${r.venue}`
    const existing = perVenueDay.get(key)
    if (existing) {
      existing.revenue += Number(r.totalRevenueExGst)
    }
  }
  const highestLabourDays = Array.from(perVenueDay.values())
    .filter((r) => r.revenue > 0)
    .map((r) => ({
      date: r.date,
      venue: r.venue,
      cost: Math.round(r.cost * 100) / 100,
      revenue: Math.round(r.revenue * 100) / 100,
      pctOfRevenue: Math.round((r.cost / r.revenue) * 10000) / 100,
    }))
    .sort((a, b) => b.pctOfRevenue - a.pctOfRevenue)
    .slice(0, 8)

  return {
    rangeDays,
    venue,
    totalCost: Math.round(totalCost * 100) / 100,
    totalHours: Math.round(totalHours * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    labourPct: labourPct !== null ? Math.round(labourPct * 100) / 100 : null,
    byDay,
    byVenue,
    byEmployee,
    highestLabourDays,
  }
}

export async function hasDeputyConnection() {
  const c = await db.deputyConnection.findFirst()
  return !!c
}
