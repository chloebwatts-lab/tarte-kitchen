export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import {
  getActiveGmailConnection,
  getValidGmailAccessToken,
} from "@/lib/gmail/token"
import { searchMessages, getMessage, getAttachment } from "@/lib/gmail/client"
import {
  parseLightspeedReportMessage,
  type EodReport,
} from "@/lib/lightspeed/email-parser"
import { normalizeVenueSlug } from "@/lib/venues"
import { Venue } from "@/generated/prisma"
import Decimal from "decimal.js"
import {
  matchSalesToDishes,
  calculateTheoreticalCogs,
  calculateTheoreticalUsage,
} from "@/lib/sales/enrich"

// Allowlist of Lightspeed sender domains — anything else is ignored so a
// spoofed email can't poison the numbers.
const LIGHTSPEED_SENDERS = [
  "reports@lightspeed-hq.com",
  "no-reply@lightspeedhq.com",
  "noreply@lightspeedhq.com",
  "no-reply@lightspeed-retail.com",
  "noreply@lightspeed-retail.com",
  "no-reply@lightspeed.com",
  "noreply@lightspeed.com",
  "reports@lightspeedhq.com",
]

interface LocationMapping {
  id: string
  name: string
  venue: string
}

function buildLocationVenueMap(
  locations: LocationMapping[]
): Map<string, Venue> {
  const m = new Map<string, Venue>()
  for (const loc of locations) {
    const v = (normalizeVenueSlug(loc.venue) ?? (loc.venue as Venue)) as Venue
    m.set(loc.name.toLowerCase().trim(), v)
  }
  return m
}

function resolveVenue(
  reportLocation: string,
  locationMap: Map<string, Venue>
): Venue | null {
  const key = reportLocation.toLowerCase().trim()
  if (locationMap.has(key)) return locationMap.get(key) ?? null
  // Partial match on mapped locations
  for (const [name, venue] of locationMap) {
    if (key.includes(name) || name.includes(key)) return venue
  }
  // Fall back to the normalizer — handles "Tarte Bakery"/"Beach House"/etc.
  return normalizeVenueSlug(reportLocation)
}

function parseReportDate(raw: string | undefined): Date {
  if (raw) {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d
    // Try DD/MM/YYYY
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`)
  }
  // Default: yesterday in AEST
  const now = new Date()
  const aestOffset = 10 * 60 * 60 * 1000
  const aestNow = new Date(now.getTime() + aestOffset)
  const yesterday = new Date(aestNow)
  yesterday.setDate(yesterday.getDate() - 1)
  return new Date(yesterday.toISOString().split("T")[0])
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const connection = await getActiveGmailConnection()
  if (!connection) {
    return Response.json({ error: "Gmail not connected" }, { status: 400 })
  }

  // Pull Lightspeed location→venue map (optional — if the connection isn't
  // configured, we still fall back to fuzzy matching via normalizeVenueSlug).
  const lightspeedConnection = await db.lightspeedConnection.findFirst({
    orderBy: { connectedAt: "desc" },
  })
  const locations =
    (lightspeedConnection?.businessLocations as LocationMapping[] | null) ?? []
  const locationMap = buildLocationVenueMap(locations)

  try {
    const accessToken = await getValidGmailAccessToken()

    const fromQuery = `from:(${LIGHTSPEED_SENDERS.join(" OR ")})`
    const subjectQuery =
      'subject:("End of day" OR "EOD" OR "Daily summary" OR "Daily report")'

    // First-run default: scan the last 2 days.
    let afterQuery = ""
    if (connection.lastScanAt) {
      const epochSec = Math.floor(connection.lastScanAt.getTime() / 1000)
      afterQuery = ` after:${epochSec}`
    } else {
      const twoDaysAgoSec = Math.floor(
        (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000
      )
      afterQuery = ` after:${twoDaysAgoSec}`
    }

    const query = `${fromQuery} ${subjectQuery}${afterQuery}`
    const messageRefs = await searchMessages(accessToken, query, 50)

    let reportsIngested = 0
    const errors: string[] = []
    const processedVenueDates = new Set<string>() // `${venue}|${YYYY-MM-DD}`

    for (const ref of messageRefs) {
      try {
        // Idempotency — skip messages we've already imported.
        const existing = await db.lightspeedReportImport.findUnique({
          where: { gmailMessageId: ref.id },
        })
        if (existing) continue

        const message = await getMessage(accessToken, ref.id)
        const reports: EodReport[] = await parseLightspeedReportMessage(
          message,
          (messageId, attachmentId) =>
            getAttachment(accessToken, messageId, attachmentId)
        )

        if (reports.length === 0) {
          errors.push(`Message ${ref.id}: no reports parsed from attachment or body`)
          continue
        }

        for (const report of reports) {
          const venue = resolveVenue(report.locationName, locationMap)
          if (!venue) {
            errors.push(
              `Message ${ref.id}: could not resolve venue for location "${report.locationName}"`
            )
            continue
          }
          if (venue === "BOTH") {
            errors.push(
              `Message ${ref.id}: location "${report.locationName}" mapped to BOTH — expected a single venue`
            )
            continue
          }

          const dateObj = parseReportDate(report.date)
          const dateKey = dateObj.toISOString().split("T")[0]

          // Upsert summary
          const net =
            report.netRevenueExGst.isZero() && !report.grossRevenue.isZero()
              ? report.grossRevenue.div(1.1)
              : report.netRevenueExGst
          const avgSpend =
            report.covers > 0 ? net.div(report.covers) : new Decimal(0)

          await db.dailySalesSummary.upsert({
            where: { date_venue: { date: dateObj, venue } },
            update: {
              totalRevenue: report.grossRevenue,
              totalRevenueExGst: net,
              totalCovers: report.covers,
              averageSpend: avgSpend,
              totalVoids: report.voids,
              totalComps: report.comps,
              source: "EMAIL",
            },
            create: {
              date: dateObj,
              venue,
              totalRevenue: report.grossRevenue,
              totalRevenueExGst: net,
              totalCovers: report.covers,
              averageSpend: avgSpend,
              totalVoids: report.voids,
              totalComps: report.comps,
              source: "EMAIL",
            },
          })

          // Upsert top-N items — email reports typically carry only a
          // truncated best-sellers list, so we don't delete existing rows
          // for the day (the API sync may have the long tail).
          for (const item of report.topItems) {
            const revenue = item.revenue
            const revenueExGst = revenue.div(1.1)
            await db.dailySales.upsert({
              where: {
                date_venue_menuItemName: {
                  date: dateObj,
                  venue,
                  menuItemName: item.name,
                },
              },
              update: {
                quantitySold: item.qty,
                revenue,
                revenueExGst,
                source: "EMAIL",
              },
              create: {
                date: dateObj,
                venue,
                menuItemName: item.name,
                quantitySold: item.qty,
                revenue,
                revenueExGst,
                source: "EMAIL",
              },
            })
          }

          await db.lightspeedReportImport.create({
            data: {
              gmailMessageId: ref.id,
              reportDate: dateObj,
              venue,
            },
          })

          processedVenueDates.add(`${venue}|${dateKey}`)
          reportsIngested++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`Message ${ref.id}: ${msg}`)
      }
    }

    // Re-run enrichment for any (venue, date) we touched so dishId matches and
    // theoretical COGS/usage numbers reflect the new rows.
    for (const key of processedVenueDates) {
      const [venue, dateKey] = key.split("|") as [Venue, string]
      const dateObj = new Date(dateKey)
      try {
        await matchSalesToDishes(dateObj, venue)
        const cogs = await calculateTheoreticalCogs(dateObj, venue)
        if (cogs) {
          await db.dailySalesSummary.update({
            where: { date_venue: { date: dateObj, venue } },
            data: { theoreticalCogs: cogs },
          })
        }
        await calculateTheoreticalUsage(dateObj, venue)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`Enrichment for ${key} failed: ${msg}`)
      }
    }

    // Update watermark
    await db.gmailConnection.update({
      where: { id: connection.id },
      data: { lastScanAt: new Date() },
    })

    return Response.json({
      success: true,
      messagesFound: messageRefs.length,
      reportsIngested,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error("[sync-lightspeed-reports]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
