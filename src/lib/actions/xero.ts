"use server"

import { db } from "@/lib/db"
import Decimal from "decimal.js"

export interface XeroStatus {
  connected: boolean
  organisationName: string | null
  lastSyncedAt: Date | null
  tenantId: string | null
}

export async function getXeroStatus(): Promise<XeroStatus> {
  try {
    const conn = await (db as any).xeroConnection.findFirst()
    if (!conn) return { connected: false, organisationName: null, lastSyncedAt: null, tenantId: null }
    return {
      connected: true,
      organisationName: conn.organisationName,
      lastSyncedAt: conn.lastSyncedAt,
      tenantId: conn.tenantId,
    }
  } catch {
    return { connected: false, organisationName: null, lastSyncedAt: null, tenantId: null }
  }
}

export interface WeeklyLabourRow {
  weekStart: Date
  grossWages: number
  superAmount: number
  totalCost: number
  headcount: number
}

export interface LabourStats {
  weeks: WeeklyLabourRow[]
  latestWeek: WeeklyLabourRow | null
  thirteenWeekAvg: number
  totalLabour13Weeks: number
}

export async function getLabourStats(): Promise<LabourStats> {
  const rows = await (db as any).weeklyLabourCost.findMany({
    orderBy: { weekStart: "desc" },
    take: 26,
  })

  const weeks: WeeklyLabourRow[] = rows.map((r: any) => ({
    weekStart: r.weekStart,
    grossWages: Number(r.grossWages),
    superAmount: Number(r.superAmount),
    totalCost: Number(r.totalCost),
    headcount: r.headcount,
  }))

  const latestWeek = weeks[0] ?? null
  const last13 = weeks.slice(0, 13)
  const totalLabour13Weeks = last13.reduce((sum, w) => sum + w.totalCost, 0)
  const thirteenWeekAvg = last13.length > 0 ? totalLabour13Weeks / last13.length : 0

  return {
    weeks: [...weeks].reverse(), // chronological for charts
    latestWeek,
    thirteenWeekAvg: Math.round(thirteenWeekAvg * 100) / 100,
    totalLabour13Weeks: Math.round(totalLabour13Weeks * 100) / 100,
  }
}

export interface WeeklyPnlRow {
  weekStart: Date
  labourCost: number
  wasteCost: number
  totalKnownCost: number
  headcount: number
}

export async function getWeeklyPnl(weeks = 13): Promise<WeeklyPnlRow[]> {
  // Get labour weeks
  const labourRows = await (db as any).weeklyLabourCost.findMany({
    orderBy: { weekStart: "desc" },
    take: weeks,
  })

  // For each labour week, aggregate waste entries
  const result: WeeklyPnlRow[] = []

  for (const row of labourRows) {
    const weekStart = new Date(row.weekStart)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const wasteAgg = await db.wasteEntry.aggregate({
      where: {
        date: { gte: weekStart, lt: weekEnd },
      },
      _sum: { estimatedCost: true },
    })

    const wasteCost = Number(wasteAgg._sum?.estimatedCost ?? 0)
    const labourCost = Number(row.totalCost)

    result.push({
      weekStart,
      labourCost: Math.round(labourCost * 100) / 100,
      wasteCost: Math.round(wasteCost * 100) / 100,
      totalKnownCost: Math.round((labourCost + wasteCost) * 100) / 100,
      headcount: row.headcount,
    })
  }

  return result.reverse() // chronological
}
