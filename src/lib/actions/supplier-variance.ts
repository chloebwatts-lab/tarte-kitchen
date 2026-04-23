"use server"

import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"

const STOP_WORDS = new Set([
  "the", "and", "of", "for", "with", "from", "a", "an",
  "kg", "gr", "ml", "ltr", "lt", "l", "g", "pcs", "pk", "ea", "each", "bag", "ctn", "case",
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
}

function tokenOverlap(a: string[], b: string[]): number {
  const setB = new Set(b)
  let n = 0
  for (const t of a) if (setB.has(t)) n++
  return n
}

export type SupplierVarianceRow = {
  invoiceId: string
  invoiceDate: string | null
  invoiceNumber: string | null
  supplierName: string
  venue: Venue | null
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
  /** Suggested correct supplier (other supplier has this item on their approved form cheaper). */
  correctSupplier: string | null
  correctPackPrice: number | null
  /** Approximate $ overspend vs the correct supplier's form price. */
  overspend: number | null
  /** Did the bought supplier have this item on their own form at all? */
  onOwnForm: boolean
}

export type SupplierVarianceSummary = {
  ranges: { since: string; until: string }
  rows: SupplierVarianceRow[]
  totalOverspend: number
  byVenue: { venue: Venue; overspend: number; rows: number }[]
  suppliersWithoutForms: string[]
}

/**
 * Walk recent invoice line items and flag purchases that shouldn't have
 * come from that supplier — or that came in above the approved form price.
 * Compares against ApprovedSupplierItem by fuzzy token overlap on name.
 */
export async function getSupplierVariance(params?: {
  weeks?: number
}): Promise<SupplierVarianceSummary> {
  const weeks = params?.weeks ?? 4
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 7 * weeks)

  const [invoices, approvedItems] = await Promise.all([
    db.invoice.findMany({
      where: { invoiceDate: { gte: since }, supplierId: { not: null } },
      include: {
        supplier: true,
        lineItems: true,
      },
    }),
    db.approvedSupplierItem.findMany({ where: { active: true }, include: { supplier: true } }),
  ])

  const approvedBySupplier = new Map<string, typeof approvedItems>()
  for (const a of approvedItems) {
    const list = approvedBySupplier.get(a.supplierId) ?? []
    list.push(a)
    approvedBySupplier.set(a.supplierId, list)
  }

  // Pre-tokenize approved items.
  const approvedTokens = new Map<string, string[]>()
  for (const a of approvedItems) approvedTokens.set(a.id, tokens(a.name))

  const rows: SupplierVarianceRow[] = []
  const suppliersSeen = new Set<string>()
  for (const inv of invoices) {
    if (!inv.supplierId || !inv.supplier) continue
    suppliersSeen.add(inv.supplier.name)

    const ownForm = approvedBySupplier.get(inv.supplierId) ?? []
    for (const li of inv.lineItems) {
      if (!li.description || !li.lineTotal) continue
      const descTokens = tokens(li.description)
      if (descTokens.length === 0) continue

      // Find best match on *own* supplier's form.
      let ownMatch: (typeof approvedItems)[number] | null = null
      let ownScore = 0
      for (const a of ownForm) {
        const score = tokenOverlap(descTokens, approvedTokens.get(a.id) ?? [])
        if (score > ownScore && score >= 2) {
          ownScore = score
          ownMatch = a
        }
      }

      // Find best match on OTHER suppliers' forms.
      let otherMatch: (typeof approvedItems)[number] | null = null
      let otherScore = 0
      for (const a of approvedItems) {
        if (a.supplierId === inv.supplierId) continue
        const score = tokenOverlap(descTokens, approvedTokens.get(a.id) ?? [])
        if (score > otherScore && score >= 2) {
          otherScore = score
          otherMatch = a
        }
      }

      const unitPrice = Number(li.unitPrice ?? 0)
      const qty = Number(li.quantity ?? 0)
      const lineTotal = Number(li.lineTotal)

      // Decide whether this is a variance.
      // Case 1: item is on the bought supplier's form → only flag if
      // invoice price > form price (price creep).
      // Case 2: item is NOT on bought supplier's form, but IS on another
      // supplier's form → flag as cross-supplier misorder.
      if (ownMatch) {
        const formPrice = Number(ownMatch.packPrice)
        if (unitPrice > formPrice * 1.02) {
          const over = qty * (unitPrice - formPrice)
          rows.push({
            invoiceId: inv.id,
            invoiceDate: inv.invoiceDate ? inv.invoiceDate.toISOString().slice(0, 10) : null,
            invoiceNumber: inv.invoiceNumber,
            supplierName: inv.supplier.name,
            venue: inv.venue,
            description: li.description,
            quantity: qty,
            unitPrice,
            lineTotal,
            correctSupplier: inv.supplier.name,
            correctPackPrice: formPrice,
            overspend: Math.round(over * 100) / 100,
            onOwnForm: true,
          })
        }
      } else if (otherMatch) {
        const otherPrice = Number(otherMatch.packPrice)
        const over = unitPrice > otherPrice ? qty * (unitPrice - otherPrice) : null
        rows.push({
          invoiceId: inv.id,
          invoiceDate: inv.invoiceDate ? inv.invoiceDate.toISOString().slice(0, 10) : null,
          invoiceNumber: inv.invoiceNumber,
          supplierName: inv.supplier.name,
          venue: inv.venue,
          description: li.description,
          quantity: qty,
          unitPrice,
          lineTotal,
          correctSupplier: otherMatch.supplier.name,
          correctPackPrice: otherPrice,
          overspend: over === null ? null : Math.round(over * 100) / 100,
          onOwnForm: false,
        })
      }
    }
  }

  rows.sort((a, b) => (b.overspend ?? 0) - (a.overspend ?? 0))

  const byVenueMap = new Map<Venue, { overspend: number; rows: number }>()
  let totalOverspend = 0
  for (const r of rows) {
    if (!r.venue || r.overspend === null) continue
    totalOverspend += r.overspend
    const cur = byVenueMap.get(r.venue) ?? { overspend: 0, rows: 0 }
    cur.overspend += r.overspend
    cur.rows += 1
    byVenueMap.set(r.venue, cur)
  }

  const suppliersWithoutForms = Array.from(suppliersSeen)
    .filter((name) => {
      const sup = invoices.find((i) => i.supplier?.name === name)?.supplier
      return sup && !(approvedBySupplier.get(sup.id)?.length ?? 0)
    })
    .sort()

  return {
    ranges: {
      since: since.toISOString().slice(0, 10),
      until: new Date().toISOString().slice(0, 10),
    },
    rows,
    totalOverspend: Math.round(totalOverspend * 100) / 100,
    byVenue: Array.from(byVenueMap.entries()).map(([venue, v]) => ({
      venue,
      overspend: Math.round(v.overspend * 100) / 100,
      rows: v.rows,
    })),
    suppliersWithoutForms,
  }
}
