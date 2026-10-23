"use server"

/**
 * Live current-week spend aggregator. Pulls every Invoice with an
 * `invoiceDate` inside the current Tarte trading week (Wed → Tue AEST),
 * plus 8 weeks of invoice and takings history, and hands the rows to
 * buildSpendSnapshot (snapshot.ts, pure) for the shape the live `/spend`
 * page, the Sunday email, the Friday digest and Shifts' owner note all
 * render off.
 *
 * Venue split: most supplier deliveries are for one venue. Genuinely
 * shared invoices (per Chris 2026-07-14, e.g. Breadtop) carry venue
 * BOTH and are split between the two buckets, 50/50 unless the supplier
 * has its own ratio in shared-split.ts. Invoices with a
 * null `venue` field are surfaced as "unassigned" so they can be
 * assigned manually, not silently lumped into a "Shared" bucket.
 *
 * Revenue comes from DailySalesSummary (Lightspeed EOD emails at Burleigh,
 * Square at Currumbin). Today's intraday figure is reported separately and
 * never counted as a finished day.
 *
 * BEACH_HOUSE here represents Currumbin's COGS, which per the Mge PDF
 * combines Beach House + Tea Garden, so we sum TEA_GARDEN spend and
 * forecast into BEACH_HOUSE for the budget read.
 */

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma/client"
import { buildSpendSnapshot, snapshotWindow } from "./snapshot"
import type { CurrentWeekSpendSnapshot } from "./types"

export async function getCurrentWeekSpend(): Promise<CurrentWeekSpendSnapshot> {
  const now = new Date()
  const { start, end, historyStart: earliest8wkStart } = snapshotWindow(now)

  // ------- Pull invoices for the current week, in parallel with
  //         forecasts, targets, and COGS history.
  const [
    invoices,
    forecasts,
    targets,
    cogsSupplierHistory,
    unassignedRaw,
    latestInvoiceByAlias,
    salesSummaries,
    salesHistory,
    invoiceHistory,
  ] = await Promise.all([
    db.invoice.findMany({
      where: {
        invoiceDate: { gte: start, lt: end },
        status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE", "ORDER_CONFIRMATION", "REJECTED"] },
      },
      select: {
        id: true,
        supplierName: true,
        invoiceDate: true,
        venue: true,
        total: true,
        subtotal: true,
        gst: true,
      },
    }),
    db.managerSalesForecast.findMany({
      where: { weekStartWed: start },
    }),
    db.venueCogsTarget.findMany(),
    db.cogsSupplierLine.findMany({
      where: { weekStartWed: { gte: earliest8wkStart, lt: start } },
      select: {
        venue: true,
        supplier: true,
        amount: true,
        weekStartWed: true,
      },
    }),
    db.invoice.findMany({
      where: {
        invoiceDate: { gte: start, lt: end },
        venue: null,
        status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE", "ORDER_CONFIRMATION", "REJECTED"] },
      },
      select: {
        id: true,
        supplierName: true,
        invoiceDate: true,
        total: true,
        subtotal: true,
        invoiceNumber: true,
      },
      orderBy: { invoiceDate: "desc" },
    }),
    db.invoice.groupBy({
      by: ["supplierName"],
      _max: { invoiceDate: true },
      where: { status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE", "ORDER_CONFIRMATION", "REJECTED"] } },
    }),
    // POS revenue for the week (Lightspeed EOD emails at Burleigh, Square
    // at Currumbin). `date` is a @db.Date stored at UTC midnight of the
    // AEST calendar day, so it sits inside [start, end). `source` tells a
    // final EMAIL figure from the intraday API row the half-hourly Square
    // sync keeps rewriting for today.
    db.dailySalesSummary.findMany({
      where: { date: { gte: start, lt: end } },
      select: { date: true, venue: true, totalRevenueExGst: true, source: true },
    }),
    // 8 weeks of revenue history, weekday-share weights for projections
    db.dailySalesSummary.findMany({
      where: { date: { gte: earliest8wkStart, lt: start } },
      select: { date: true, venue: true, totalRevenueExGst: true },
    }),
    // 8 weeks of invoice history, weekday-share weights for spend pace
    db.invoice.findMany({
      where: {
        invoiceDate: { gte: earliest8wkStart, lt: start },
        status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE", "ORDER_CONFIRMATION", "REJECTED"] },
        venue: { not: null },
      },
      select: { invoiceDate: true, createdAt: true, venue: true, supplierName: true, total: true, subtotal: true, gst: true },
    }),
  ])

  return buildSpendSnapshot(
    {
      invoices,
      forecasts,
      targets,
      cogsSupplierHistory,
      unassignedRaw,
      latestInvoiceByAlias,
      salesSummaries,
      salesHistory,
      invoiceHistory,
    },
    now
  )
}

/**
 * Server action to assign a venue to an invoice that came through with
 * a null venue field. Called from the unassigned panel on /spend.
 */
export async function assignInvoiceVenue(params: {
  invoiceId: string
  venue: Venue
}): Promise<void> {
  await db.invoice.update({
    where: { id: params.invoiceId },
    data: { venue: params.venue },
  })
}
