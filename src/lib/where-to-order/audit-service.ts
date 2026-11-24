/**
 * Loads the invoice lines and order forms behind the Wednesday "where to
 * order" check (rules in ./audit.ts, the sheet in ./sheet.ts). Read only.
 */
import { db } from "@/lib/db"
import { effectiveUnitPrice } from "@/lib/invoices/units"
import { auditWeek, formDrift, LATE_LOOKBACK_DAYS, REF_WINDOW_DAYS, type AuditLine, type AuditResult, type FormDrift } from "./audit"

const num = (v: { toString(): string } | null | undefined): number => (v == null ? 0 : Number(v.toString()))
const DAY = 86_400_000

export async function loadAuditLines(from: Date, to: Date): Promise<AuditLine[]> {
  const raw = await db.invoiceLineItem.findMany({
    where: {
      unitPrice: { gt: 0 },
      quantity: { gt: 0 },
      lineTotal: { gt: 0 },
      invoice: { invoiceDate: { gte: from, lte: to }, status: { in: ["MATCHED", "EXTRACTED", "APPROVED"] } },
    },
    select: {
      description: true,
      unit: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
      invoice: { select: { supplierName: true, invoiceDate: true, venue: true, createdAt: true } },
    },
  })
  return raw
    .filter((l) => l.invoice?.invoiceDate)
    .map((l) => {
      const unitPrice = num(l.unitPrice)
      const qty = num(l.quantity)
      const lineTotal = num(l.lineTotal)
      const eff = effectiveUnitPrice(unitPrice, qty, lineTotal)
      return {
        supplierName: l.invoice!.supplierName,
        description: l.description,
        unit: l.unit,
        venue: l.invoice!.venue,
        invoiceDate: l.invoice!.invoiceDate!,
        receivedAt: l.invoice!.createdAt,
        qty,
        lineTotal,
        unitPrice,
        effectivePrice: eff != null && eff !== unitPrice ? eff : null,
      }
    })
}

export async function loadFormDrift(): Promise<FormDrift[]> {
  const forms = await db.approvedSupplierItem.findMany({
    select: { id: true, name: true, active: true, supplier: { select: { name: true } } },
  })
  return formDrift(forms.map((f) => ({ id: f.id, name: f.name, active: f.active, supplier: f.supplier.name })))
}

/** The venues that get their own Wednesday email (Chloe, 25 Nov 2026). */
export const AUDIT_VENUES = ["BURLEIGH", "BEACH_HOUSE"] as const

/**
 * The week's check. `lateSince` defaults to a week before `now`: the last
 * Wednesday run, so an invoice that arrived since then for an earlier week
 * is caught once. `venues` holds one result per venue (Burleigh, Currumbin,
 * then any other venue with a wrong buy, so nothing drops out); reference
 * prices still come from both venues' invoices.
 */
export async function runWhereToOrderAudit(args: {
  weekStart: Date
  weekEnd: Date
  now?: Date
}): Promise<{ result: AuditResult; drift: FormDrift[]; venues: { venue: string; result: AuditResult }[] }> {
  const now = args.now ?? new Date()
  const from = new Date(Math.min(args.weekEnd.getTime() - REF_WINDOW_DAYS * DAY, args.weekStart.getTime() - LATE_LOOKBACK_DAYS * DAY))
  const [lines, drift] = await Promise.all([loadAuditLines(from, args.weekEnd), loadFormDrift()])
  const base = { lines, weekStart: args.weekStart, weekEnd: args.weekEnd, lateSince: new Date(now.getTime() - 7 * DAY) }
  const result = auditWeek(base)
  const names: string[] = [...AUDIT_VENUES]
  for (const v of Object.keys(result.byVenue)) if (!names.includes(v)) names.push(v)
  const venues = names.map((venue) => ({ venue, result: auditWeek({ ...base, venue }) }))
  return { result, drift, venues }
}
