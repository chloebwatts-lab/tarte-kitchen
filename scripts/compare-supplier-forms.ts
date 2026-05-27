/**
 * Compare locked-in supplier order forms against today's actual invoice
 * pricing to:
 *   1. Show price changes per item (form vs latest invoice)
 *   2. Surface items where another supplier's recent invoice is cheaper
 *      per unit (so we can re-evaluate "favoured supplier" picks)
 *
 * Run on the droplet:
 *   docker compose exec app npx tsx /app/scripts/compare-supplier-forms.ts
 *
 * Outputs Markdown to stdout — pipe to a file or paste into chat.
 */

import { PrismaClient } from "../src/generated/prisma/client"
import formsRaw from "./order-forms.json"
import path from "path"
import { writeFileSync } from "fs"

interface FormItem {
  category: string
  name: string
  packSize: string
  packPrice: number
  unitPrice: number | null
  unit: string
}

interface SupplierForm {
  supplier: string
  items: FormItem[]
}

interface InvoiceMatch {
  supplierName: string
  description: string
  unitPrice: number
  unit: string | null
  invoiceDate: Date | null
}

const prisma = new PrismaClient()

const STOP = new Set([
  "the", "and", "of", "for", "with", "from", "a", "an",
  "kg", "gr", "ml", "ltr", "lt", "l", "g", "pcs", "pk", "ea", "each",
  "bag", "ctn", "case", "drum", "can", "jar", "pack", "roll", "units",
  "imitation", "brand", "fresh", "frozen", "iqf", "natural",
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    // Strip parenthetical brand notes — they hurt cross-supplier matching.
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b)
  let n = 0
  for (const t of a) if (setB.has(t)) n++
  // Normalise so a 2-token form item with both tokens in a 10-token
  // invoice description doesn't beat a 4-token form item where 4/4
  // match. Use min length as denominator.
  return n / Math.min(a.length, b.length)
}

async function main() {
  const forms = (formsRaw as { forms: SupplierForm[] }).forms

  // Pull every recent invoice line (last 90 days) once, with supplier
  // name attached, so all comparisons happen in-process.
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 90)
  const invoiceLines = await prisma.invoiceLineItem.findMany({
    where: {
      invoice: { invoiceDate: { gte: sinceDate } },
      unitPrice: { not: null },
      description: { not: "" },
    },
    select: {
      description: true,
      unitPrice: true,
      unit: true,
      invoice: {
        select: {
          invoiceDate: true,
          supplier: { select: { name: true } },
        },
      },
    },
  })

  const allLines: InvoiceMatch[] = invoiceLines
    .filter((l) => l.invoice.supplier && l.unitPrice !== null)
    .map((l) => ({
      supplierName: l.invoice.supplier!.name,
      description: l.description,
      unitPrice: Number(l.unitPrice),
      unit: l.unit,
      invoiceDate: l.invoice.invoiceDate,
    }))

  // Pre-tokenize invoice descriptions once.
  const linesByName = new Map<string, InvoiceMatch[]>()
  for (const l of allLines) {
    const list = linesByName.get(l.supplierName.toLowerCase()) ?? []
    list.push(l)
    linesByName.set(l.supplierName.toLowerCase(), list)
  }

  function bestMatch(
    item: FormItem,
    supplierName: string
  ): InvoiceMatch | null {
    const candidates = linesByName.get(supplierName.toLowerCase()) ?? []
    const itemTokens = tokens(item.name)
    let best: { match: InvoiceMatch; score: number } | null = null
    for (const c of candidates) {
      const score = overlap(itemTokens, tokens(c.description))
      if (score < 0.5) continue
      if (!best || score > best.score) best = { match: c, score }
    }
    return best?.match ?? null
  }

  function bestMatchAcrossAll(item: FormItem): InvoiceMatch | null {
    const itemTokens = tokens(item.name)
    let best: { match: InvoiceMatch; score: number } | null = null
    for (const c of allLines) {
      const score = overlap(itemTokens, tokens(c.description))
      if (score < 0.6) continue
      // Cheapest unit price wins among well-matched candidates.
      if (!best || c.unitPrice < best.match.unitPrice) best = { match: c, score }
    }
    return best?.match ?? null
  }

  type ResultRow = {
    formItem: FormItem
    sameSupplierMatch: InvoiceMatch | null
    cheapestMatch: InvoiceMatch | null
  }
  const out: { supplier: string; rows: ResultRow[] }[] = []

  for (const form of forms) {
    const rows: ResultRow[] = []
    for (const item of form.items) {
      const same = bestMatch(item, form.supplier)
      const cheapest = bestMatchAcrossAll(item)
      rows.push({ formItem: item, sameSupplierMatch: same, cheapestMatch: cheapest })
    }
    out.push({ supplier: form.supplier, rows })
  }

  // ─── Render Markdown ──────────────────────────────────────────────
  const lines: string[] = []
  lines.push(`# Supplier Order Form vs Recent Invoices`)
  lines.push("")
  lines.push(
    `Compares each supplier's locked-in order form (the one you provided) ` +
      `against actual invoice prices in the last 90 days. ` +
      `Δ shows how much the price has moved since the form was set.`
  )
  lines.push("")
  lines.push(`Only invoices from **${allLines.length}** line items considered.`)
  lines.push("")

  for (const { supplier, rows } of out) {
    lines.push(`## ${supplier}`)
    lines.push("")
    lines.push(
      `| Item | Pack | Form | Now (this supplier) | Δ | Cheapest now | Cheapest supplier |`
    )
    lines.push("|---|---|---:|---:|---:|---:|---|")
    let increased = 0
    let decreased = 0
    let cheaperElsewhere = 0
    for (const r of rows) {
      const formPrice = r.formItem.packPrice
      const samePrice = r.sameSupplierMatch?.unitPrice ?? null
      const cheapestPrice = r.cheapestMatch?.unitPrice ?? null
      const cheapestSupplier = r.cheapestMatch?.supplierName ?? null

      let delta = ""
      if (samePrice !== null && formPrice > 0) {
        const pct = ((samePrice - formPrice) / formPrice) * 100
        if (pct > 1) {
          delta = `**+${pct.toFixed(0)}%**`
          increased++
        } else if (pct < -1) {
          delta = `−${Math.abs(pct).toFixed(0)}%`
          decreased++
        } else {
          delta = "≈"
        }
      } else {
        delta = "—"
      }

      let cheapestLabel = "—"
      if (
        cheapestPrice !== null &&
        cheapestSupplier &&
        formPrice > 0 &&
        cheapestPrice < formPrice * 0.95 &&
        cheapestSupplier.toLowerCase() !== supplier.toLowerCase()
      ) {
        const savePct = ((formPrice - cheapestPrice) / formPrice) * 100
        cheapestLabel = `$${cheapestPrice.toFixed(2)} (**−${savePct.toFixed(0)}%**)`
        cheaperElsewhere++
      } else if (cheapestPrice !== null && cheapestSupplier) {
        cheapestLabel = `$${cheapestPrice.toFixed(2)}`
      }

      lines.push(
        `| ${r.formItem.name} | ${r.formItem.packSize || "—"} | $${formPrice.toFixed(2)} | ${
          samePrice !== null ? `$${samePrice.toFixed(2)}` : "—"
        } | ${delta} | ${cheapestLabel} | ${cheapestSupplier ?? "—"} |`
      )
    }
    lines.push("")
    lines.push(
      `**Summary** — ${increased} items up, ${decreased} down, ` +
        `${cheaperElsewhere} where another supplier currently bills cheaper.`
    )
    lines.push("")
  }

  const md = lines.join("\n")
  const outPath = path.resolve(__dirname, "../supplier-form-comparison.md")
  writeFileSync(outPath, md, "utf8")
  console.log(md)
  console.error(`\n[wrote ${outPath}]`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
