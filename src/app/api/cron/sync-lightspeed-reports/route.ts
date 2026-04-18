export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import {
  getActiveGmailConnection,
  getValidGmailAccessToken,
} from "@/lib/gmail/token"
import { searchMessages, getMessage, getAttachment } from "@/lib/gmail/client"
import { parseLightspeedPdf, type LightspeedPdfReport } from "@/lib/lightspeed/pdf-parser"
import { normalizeVenueSlug } from "@/lib/venues"
import { Venue } from "@/generated/prisma"
import Decimal from "decimal.js"
import {
  matchSalesToDishes,
  calculateTheoreticalCogs,
  calculateTheoreticalUsage,
} from "@/lib/sales/enrich"

// Allowlist of Lightspeed sender domains — anything else is ignored so a
// spoofed email can't poison the numbers. Lightspeed AU was originally
// Kounta, and the Looker reports still come from that domain.
const LIGHTSPEED_SENDERS = [
  "insights@kounta.com",
  "reports@kounta.com",
  "no-reply@kounta.com",
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
  for (const [name, venue] of locationMap) {
    if (key.includes(name) || name.includes(key)) return venue
  }
  return normalizeVenueSlug(reportLocation)
}

function findPdfAttachment(
  payload: unknown
): { attachmentId: string; filename: string } | null {
  type Part = {
    mimeType?: string
    filename?: string
    body?: { attachmentId?: string }
    parts?: Part[]
  }
  const walk = (p: Part): { attachmentId: string; filename: string } | null => {
    const name = p.filename ?? ""
    const mime = p.mimeType ?? ""
    if (
      p.body?.attachmentId &&
      (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf"))
    ) {
      return { attachmentId: p.body.attachmentId, filename: name || "report.pdf" }
    }
    for (const sub of p.parts ?? []) {
      const found = walk(sub)
      if (found) return found
    }
    return null
  }
  return walk(payload as Part)
}

function reportDateFromEmail(
  reportDate: string | null,
  emailDateHeader: string | undefined
): Date {
  if (reportDate) {
    const d = new Date(reportDate)
    if (!isNaN(d.getTime())) return new Date(reportDate)
  }
  // Fall back: email arrives the morning after — subtract 1 day in AEST.
  const base = emailDateHeader ? new Date(emailDateHeader) : new Date()
  const aestOffset = 10 * 60 * 60 * 1000
  const aestNow = new Date(base.getTime() + aestOffset)
  aestNow.setUTCDate(aestNow.getUTCDate() - 1)
  return new Date(aestNow.toISOString().split("T")[0])
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const connection = await getActiveGmailConnection()
  if (!connection) {
    return Response.json({ error: "Gmail not connected" }, { status: 400 })
  }

  const lightspeedConnection = await db.lightspeedConnection.findFirst({
    orderBy: { connectedAt: "desc" },
  })
  const locations =
    (lightspeedConnection?.businessLocations as LocationMapping[] | null) ?? []
  const locationMap = buildLocationVenueMap(locations)

  try {
    const accessToken = await getValidGmailAccessToken()

    const fromQuery = `from:(${LIGHTSPEED_SENDERS.join(" OR ")})`

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

    const query = `${fromQuery} has:attachment filename:pdf${afterQuery}`
    const messageRefs = await searchMessages(accessToken, query, 50)

    let reportsIngested = 0
    const errors: string[] = []
    const processedVenueDates = new Set<string>()

    for (const ref of messageRefs) {
      try {
        const existing = await db.lightspeedReportImport.findUnique({
          where: { gmailMessageId: ref.id },
        })
        if (existing) continue

        const message = await getMessage(accessToken, ref.id)
        const emailDateHeader = (message.payload.headers || []).find(
          (h) => h.name.toLowerCase() === "date"
        )?.value

        const pdfRef = findPdfAttachment(message.payload)
        if (!pdfRef) {
          errors.push(`Message ${ref.id}: no PDF attachment`)
          continue
        }

        const pdfBuffer = await getAttachment(accessToken, ref.id, pdfRef.attachmentId)
        const parsed: LightspeedPdfReport = await parseLightspeedPdf(pdfBuffer)
        const reportDate = reportDateFromEmail(parsed.reportDate, emailDateHeader)
        const dateKey = reportDate.toISOString().split("T")[0]
        let messageRecorded = false

        for (const site of parsed.sites) {
          const venue = resolveVenue(site.siteName, locationMap)
          if (!venue || venue === "BOTH") {
            errors.push(
              `Message ${ref.id}: unresolved venue for site "${site.siteName}"`
            )
            continue
          }

          const revenue = site.totalIncTax
          const revenueExGst = site.totalExTax.isZero()
            ? revenue.div(1.1)
            : site.totalExTax

          await db.dailySalesSummary.upsert({
            where: { date_venue: { date: reportDate, venue } },
            update: {
              totalRevenue: revenue,
              totalRevenueExGst: revenueExGst,
              source: "EMAIL",
            },
            create: {
              date: reportDate,
              venue,
              totalRevenue: revenue,
              totalRevenueExGst: revenueExGst,
              totalCovers: 0,
              averageSpend: new Decimal(0),
              totalVoids: 0,
              totalComps: 0,
              source: "EMAIL",
            },
          })

          // Clear previous top items for this day+venue so rankings refresh
          // if the report is re-ingested.
          await db.dailyCategoryTopItem.deleteMany({
            where: { date: reportDate, venue },
          })

          for (const cat of site.categories) {
            let rank = 0
            for (const product of cat.topProducts) {
              rank++
              try {
                await db.dailyCategoryTopItem.create({
                  data: {
                    date: reportDate,
                    venue,
                    categoryName: cat.categoryName,
                    productName: product.name,
                    quantity: product.quantity,
                    rank,
                  },
                })
              } catch {
                // Duplicate product name in the same category — skip.
              }
            }
          }

          // Only record the gmail message once, keyed to the first venue we
          // processed (the table's unique constraint is on gmailMessageId).
          if (!messageRecorded) {
            await db.lightspeedReportImport.create({
              data: { gmailMessageId: ref.id, reportDate, venue },
            })
            messageRecorded = true
          }

          processedVenueDates.add(`${venue}|${dateKey}`)
          reportsIngested++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`Message ${ref.id}: ${msg}`)
      }
    }

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
