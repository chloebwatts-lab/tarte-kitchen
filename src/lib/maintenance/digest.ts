/**
 * Maintenance data for the Friday digest: every open fault (oldest first,
 * with whether a trade has been booked and whether the machine is still
 * under warranty) plus warranties running out in the next 60 days, so a
 * claim gets lodged before the cover lapses.
 */

import { db } from "@/lib/db"
import { warrantyEndDate } from "@/lib/maintenance/constants"

const DAY_MS = 86_400_000
/// How far ahead to warn about a warranty running out.
const WARRANTY_LOOKAHEAD_DAYS = 60

const VENUE_LABEL: Record<string, string> = {
  BURLEIGH: "Burleigh",
  BEACH_HOUSE: "Beach House",
  TEA_GARDEN: "Tea Garden",
  BOTH: "Both venues",
}

export interface MaintenanceSection {
  openCount: number
  safetyCount: number
  /// Open faults where nobody has booked a trade yet.
  unbookedCount: number
  fixedLast7Days: number
  openIssues: Array<{
    venue: string
    machine: string | null
    slug: string | null
    title: string
    daysOpen: number
    isSafety: boolean
    /// YYYY-MM-DD the trade is booked for, null when nobody has called one.
    bookedFor: string | null
    /// Machine still under warranty: call the warranty provider first.
    underWarranty: boolean
    warrantyProvider: string | null
  }>
  warrantiesEnding: Array<{
    venue: string
    machine: string
    slug: string
    endsOn: string
    daysLeft: number
    warrantyProvider: string | null
    hasOpenIssue: boolean
  }>
}

/// Asset names carry a location after a long dash ("Hobart dishwasher,
/// Main Kitchen" style). House style is no long dashes in anything sent out.
function cleanName(name: string): string {
  return name.replace(/\s*[\u2014\u2013]\s*/g, ", ")
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function buildMaintenanceSection(now: Date = new Date()): Promise<MaintenanceSection> {
  const [open, fixedLast7Days, assets] = await Promise.all([
    db.maintenanceIssue.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: {
        venue: true,
        title: true,
        isSafety: true,
        bookedFor: true,
        createdAt: true,
        assetId: true,
        asset: {
          select: {
            name: true,
            slug: true,
            purchaseDate: true,
            warrantyMonths: true,
            warrantyProvider: true,
          },
        },
      },
    }),
    db.maintenanceIssue.count({
      where: { status: "FIXED", fixedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
    }),
    db.maintenanceAsset.findMany({
      where: { status: "ACTIVE", purchaseDate: { not: null }, warrantyMonths: { not: null } },
      select: {
        id: true,
        venue: true,
        name: true,
        slug: true,
        purchaseDate: true,
        warrantyMonths: true,
        warrantyProvider: true,
      },
    }),
  ])

  const assetsWithOpenIssue = new Set(open.map((i) => i.assetId).filter((x): x is string => !!x))

  const openIssues = open.map((i) => {
    const wEnd = i.asset ? warrantyEndDate(i.asset) : null
    return {
      venue: VENUE_LABEL[i.venue] ?? i.venue,
      machine: i.asset ? cleanName(i.asset.name) : null,
      slug: i.asset?.slug ?? null,
      title: cleanName(i.title),
      daysOpen: Math.max(0, Math.floor((now.getTime() - i.createdAt.getTime()) / DAY_MS)),
      isSafety: i.isSafety,
      bookedFor: i.bookedFor ? ymd(i.bookedFor) : null,
      underWarranty: wEnd != null && wEnd.getTime() > now.getTime(),
      warrantyProvider: i.asset?.warrantyProvider ?? null,
    }
  })

  const warrantiesEnding = assets
    .map((a) => {
      const end = warrantyEndDate(a)
      if (!end) return null
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY_MS)
      if (daysLeft < 0 || daysLeft > WARRANTY_LOOKAHEAD_DAYS) return null
      return {
        venue: VENUE_LABEL[a.venue] ?? a.venue,
        machine: cleanName(a.name),
        slug: a.slug,
        endsOn: ymd(end),
        daysLeft,
        warrantyProvider: a.warrantyProvider,
        hasOpenIssue: assetsWithOpenIssue.has(a.id),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  return {
    openCount: openIssues.length,
    safetyCount: openIssues.filter((i) => i.isSafety).length,
    unbookedCount: openIssues.filter((i) => !i.bookedFor).length,
    fixedLast7Days,
    openIssues,
    warrantiesEnding,
  }
}
