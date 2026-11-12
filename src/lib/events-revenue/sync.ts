/**
 * Pull Xero event revenue into DailyEventSales: for each org, the ACCREC
 * invoices dated in the last N Brisbane days (today included) through the
 * Inbox app's read-only Xero door (tarte-inbox src/kitchen-bills.ts POST
 * /sales, reached at INBOX_BILLS_URL with INBOX_BILLS_KEY like the bill
 * drafts), classified by eventSalesByDay, then the window's rows for that
 * org's venues replaced in one transaction so a voided or re-dated invoice
 * drops out. One org failing leaves its rows as they were and does not stop
 * the other.
 */
import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { brisbaneNow } from "@/lib/sales/insights"
import { shiftDate } from "@/lib/sales/compare"
import { inboxBillsConfigured } from "@/lib/xero-bills/inbox"
import { EVENT_ORGS, ORG_VENUES, eventAccountCodes, eventSalesByDay, type EventOrg, type XeroRevenueAccount, type XeroSale } from "./classify"

export interface EventSyncResult {
  org: EventOrg
  from: string
  to: string
  invoices: number
  eventCodes: string[]
  days: number
  exGst: number
  skipped?: string
  error?: string
}

/** POST /sales on the Inbox app's Xero door. */
export async function fetchOrgSales(
  org: EventOrg,
  from: string,
  toExclusive: string,
  env: Record<string, string | undefined> = process.env,
): Promise<{ accounts: XeroRevenueAccount[]; invoices: XeroSale[] }> {
  const base = (env.INBOX_BILLS_URL ?? "").replace(/\/$/, "")
  const res = await fetch(`${base}/sales`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.INBOX_BILLS_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ org, from, to: toExclusive }),
    cache: "no-store",
    signal: AbortSignal.timeout(180_000),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; accounts?: XeroRevenueAccount[]; invoices?: XeroSale[] }
  if (res.status !== 200 || !json.ok) throw new Error(`Inbox sales ${org}: ${json.error ?? res.status}`)
  return { accounts: json.accounts ?? [], invoices: json.invoices ?? [] }
}

export async function syncEventSales(days: number, now = new Date()): Promise<EventSyncResult[]> {
  if (!inboxBillsConfigured()) throw new Error("INBOX_BILLS_URL / INBOX_BILLS_KEY not set")
  const today = brisbaneNow(now).date
  const from = shiftDate(today, -(Math.max(1, days) - 1))
  const to = shiftDate(today, 1)
  const results: EventSyncResult[] = []
  for (const org of EVENT_ORGS) {
    try {
      const { accounts, invoices } = await fetchOrgSales(org, from, to)
      const codes = eventAccountCodes(accounts)
      if (!codes.size) {
        // No account named for events in this org (Burleigh may not run
        // any): leave whatever is stored alone rather than wipe the window.
        results.push({ org, from, to, invoices: invoices.length, eventCodes: [], days: 0, exGst: 0, skipped: "no event revenue account in this org" })
        continue
      }
      const rows = eventSalesByDay(org, invoices, accounts).filter((r) => r.date >= from && r.date <= today)
      const venues: Venue[] = ORG_VENUES[org]
      await db.$transaction([
        db.dailyEventSales.deleteMany({ where: { venue: { in: venues }, date: { gte: new Date(from), lte: new Date(today) } } }),
        db.dailyEventSales.createMany({
          data: rows.map((r) => ({ date: new Date(r.date), venue: r.venue, exGst: r.exGst, invoices: r.invoices })),
        }),
      ])
      results.push({
        org,
        from,
        to,
        invoices: invoices.length,
        eventCodes: accounts.filter((a) => codes.has(a.Code)).map((a) => `${a.Code} ${a.Name}`),
        days: rows.length,
        exGst: Math.round(rows.reduce((s, r) => s + r.exGst, 0) * 100) / 100,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[sync-event-sales] ${org}: ${msg}`)
      results.push({ org, from, to, invoices: 0, eventCodes: [], days: 0, exGst: 0, error: msg })
    }
  }
  return results
}
