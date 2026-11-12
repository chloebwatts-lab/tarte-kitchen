/**
 * Event and function revenue out of Xero sales invoices, per venue and day,
 * ex GST. Pure: the Inbox app's read-only Xero door supplies the invoices
 * and the org's revenue accounts (tarte-inbox src/kitchen-bills.ts POST
 * /sales), src/lib/events-revenue/sync.ts stores the result.
 *
 * Chloe, 12 Nov 2026: the wage % has to count all revenue, "uber bopple and
 * events from Xero". Tills (Square, Bopple inside it) and Uber Eats were
 * already in; events were not, because they are invoiced, not rung up.
 *
 * Rules:
 *  - Only lines coded to an event revenue account count (name says Event or
 *    Function; the Inbox app codes every event line to "Event Sales"). That
 *    keeps Amaka's daily Square invoices, Uber remittances and cake orders
 *    (44097 Sales - Online) out, so nothing already in the tills or Uber is
 *    counted twice.
 *  - The invoice date is the trading day: event invoices are dated the EVENT
 *    day (Matt's rule, upsertEventDraftInvoice in tarte-inbox).
 *  - DRAFT counts. The event is booked and its invoice raised; nobody
 *    approves drafts promptly since Louise left. Voided and deleted invoices
 *    never arrive (the door asks Xero for live statuses only) and are
 *    refused here too.
 *  - Venue: Tarte Bakery is Burleigh. Tarte Currumbin is Tea Garden when the
 *    line's tracking, the line, or the invoice reference says Tea Garden,
 *    otherwise Beach House (the Hideout is upstairs at Beach House).
 */
import type { Venue } from "@/generated/prisma/client"

export const EVENT_ORGS = ["Tarte Currumbin", "Tarte Bakery"] as const
export type EventOrg = (typeof EVENT_ORGS)[number]

/** The venues an org's event invoices can land on. */
export const ORG_VENUES: Record<EventOrg, Venue[]> = {
  "Tarte Currumbin": ["BEACH_HOUSE", "TEA_GARDEN"],
  "Tarte Bakery": ["BURLEIGH"],
}

export interface XeroRevenueAccount { Code: string; Name: string; Type?: string }
export interface XeroSaleLine {
  Description?: string
  AccountCode?: string
  LineAmount?: number
  TaxAmount?: number
  Tracking?: Array<{ Name?: string; Option?: string }>
}
export interface XeroSale {
  InvoiceID: string
  Status: string
  InvoiceNumber?: string
  Reference?: string
  /** yyyy-mm-dd, the invoice date. */
  Date: string | null
  LineAmountTypes?: string
  LineItems: XeroSaleLine[]
}

export interface EventSalesDay { date: string; venue: Venue; exGst: number; invoices: number }

const LIVE_STATUSES = new Set(["DRAFT", "SUBMITTED", "AUTHORISED", "PAID"])
const EVENT_ACCOUNT = /\bevents?\b|\bfunctions?\b/i
const TEA_GARDEN = /\btea\s*garden\b/i
const BEACH_HOUSE = /\bbeach\s*house\b|\bhideout\b/i
const YMD = /^\d{4}-\d{2}-\d{2}$/

const round2 = (n: number) => Math.round(n * 100) / 100

/** Revenue account codes whose name says Event(s) or Function(s). */
export function eventAccountCodes(accounts: XeroRevenueAccount[]): Set<string> {
  return new Set(accounts.filter((a) => a.Code && EVENT_ACCOUNT.test(a.Name ?? "")).map((a) => a.Code))
}

/** A line's amount ex GST, whichever way the invoice states its amounts. */
export function lineExGst(line: XeroSaleLine, lineAmountTypes: string | undefined): number {
  const amount = Number(line.LineAmount ?? 0)
  if (!Number.isFinite(amount)) return 0
  if (lineAmountTypes === "Inclusive") return round2(amount - Number(line.TaxAmount ?? 0))
  return round2(amount)
}

/** Which venue an event line belongs to: tracking first, then the line, then the reference. */
export function eventVenue(org: EventOrg, sale: Pick<XeroSale, "Reference">, line: XeroSaleLine): Venue {
  if (org === "Tarte Bakery") return "BURLEIGH"
  const said = [
    ...(line.Tracking ?? []).map((t) => t.Option ?? ""),
    line.Description ?? "",
    sale.Reference ?? "",
  ]
  for (const text of said) {
    if (TEA_GARDEN.test(text)) return "TEA_GARDEN"
    if (BEACH_HOUSE.test(text)) return "BEACH_HOUSE"
  }
  return "BEACH_HOUSE"
}

/**
 * Event revenue per venue and day for one org, oldest first. A day whose
 * lines net below zero (a refund line bigger than the sale) is stored as 0.
 */
export function eventSalesByDay(org: EventOrg, sales: XeroSale[], accounts: XeroRevenueAccount[]): EventSalesDay[] {
  const codes = eventAccountCodes(accounts)
  const byKey = new Map<string, { date: string; venue: Venue; exGst: number; ids: Set<string> }>()
  if (!codes.size) return []
  for (const s of sales) {
    if (!LIVE_STATUSES.has(String(s.Status ?? "").toUpperCase())) continue
    if (!s.Date || !YMD.test(s.Date)) continue
    for (const line of s.LineItems ?? []) {
      if (!line.AccountCode || !codes.has(line.AccountCode)) continue
      const venue = eventVenue(org, s, line)
      const key = `${s.Date}|${venue}`
      const row = byKey.get(key) ?? { date: s.Date, venue, exGst: 0, ids: new Set<string>() }
      row.exGst += lineExGst(line, s.LineAmountTypes)
      row.ids.add(s.InvoiceID)
      byKey.set(key, row)
    }
  }
  return [...byKey.values()]
    .map((r) => ({ date: r.date, venue: r.venue, exGst: Math.max(0, round2(r.exGst)), invoices: r.ids.size }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue))
}
