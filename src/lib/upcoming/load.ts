/**
 * Reads what the upcoming events feed needs. Read only: two SELECTs and one
 * Google Calendar read (the hello@ token helper may refresh the shared token
 * row, as every hello@ reader does). The merge rules are in ./merge.ts.
 */

import { db } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"
import { getTeamCalendarEvents } from "@/lib/functions/calendar"
import { buildFeed, type CakeRowIn, type FeedItem, type FeedRange, type InvoiceRowIn } from "./merge"

interface InvoiceSql {
  id: bigint | number | string
  invoice_number: string
  kind: string
  thread_id: string
  customer_name: string | null
  amount: string | number
  editable: Record<string, unknown> | null
  booking_state: string | null
}

/**
 * tarte-inbox's function invoices (table written by tarte-inbox in the same
 * database, not part of the Prisma schema). Same "real invoice" rule as
 * tarte-inbox's own lists and sweeps: not PENDING, has a thread, and an app
 * invoice (thread fn:...) only once its email was drafted.
 */
export async function readFunctionInvoices(range: FeedRange): Promise<InvoiceRowIn[]> {
  let rows: InvoiceSql[]
  try {
    rows = await db.$queryRaw<InvoiceSql[]>(Prisma.sql`
      SELECT i.id, i.invoice_number, i.kind, i.thread_id, i.customer_name, i.amount, i.editable,
             (SELECT b.state FROM inbox_bookings b WHERE b.thread_id = i.thread_id ORDER BY b.id DESC LIMIT 1) AS booking_state
        FROM inbox_invoices i
       WHERE i.invoice_number <> 'PENDING'
         AND i.thread_id IS NOT NULL AND i.thread_id <> ''
         AND (i.thread_id NOT LIKE 'fn:%' OR i.drafted_at IS NOT NULL)
         AND i.editable IS NOT NULL
         AND i.thread_id IN (
           SELECT thread_id FROM inbox_invoices
            WHERE (editable->>'event_date') ~ '^\\d{4}-\\d{2}-\\d{2}$'
              AND (editable->>'event_date') BETWEEN ${range.from} AND ${range.to}
         )`)
  } catch (e) {
    // Table absent (tarte-inbox not installed): no invoices, not an error for the feed.
    if (String(e).includes("inbox_invoices")) return []
    throw e
  }
  return rows.map((r) => ({
    id: Number(r.id),
    invoiceNumber: r.invoice_number,
    kind: r.kind,
    threadId: r.thread_id,
    customerName: r.customer_name,
    amount: Number(r.amount) || 0,
    editable: r.editable,
    bookingState: r.booking_state,
  }))
}

export async function readCakePickups(range: FeedRange): Promise<CakeRowIn[]> {
  const rows = await db.cakeOrder.findMany({
    where: {
      status: { notIn: ["CANCELLED", "COLLECTED"] },
      pickupDate: { gte: new Date(`${range.from}T00:00:00.000Z`), lte: new Date(`${range.to}T00:00:00.000Z`) },
    },
    select: {
      id: true,
      venue: true,
      pickupDate: true,
      pickupTime: true,
      customerName: true,
      product: true,
      quantity: true,
      details: true,
      message: true,
      dietary: true,
      status: true,
    },
  })
  return rows.map((r) => ({ ...r, pickupDate: r.pickupDate ? r.pickupDate.toISOString().slice(0, 10) : null }))
}

export async function loadUpcomingFeed(range: FeedRange): Promise<{ items: FeedItem[]; warnings: string[] }> {
  const warnings: string[] = []
  const [invoices, calendar, cakes] = await Promise.all([
    readFunctionInvoices(range),
    getTeamCalendarEvents(range.from, range.to).catch(() => null),
    readCakePickups(range),
  ])
  if (calendar === null) warnings.push("hello@ calendar not readable this time: calendar-only entries missing, onCalendar is null")
  return { items: buildFeed({ range, invoices, calendar, cakes }), warnings }
}
