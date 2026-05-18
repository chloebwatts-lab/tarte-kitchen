/**
 * Seed `ApprovedSupplierItem` rows from `scripts/order-forms.json`.
 *
 * Idempotent: uses `(supplierId, name)` unique constraint so re-running
 * updates existing rows rather than creating duplicates. Items in the JSON
 * marked inactive aren't supported yet — everything seeded is active.
 *
 * Usage (locally with prod DATABASE_URL set, or on the prod droplet):
 *   npx tsx scripts/seed-approved-supplier-items.ts
 */
import { PrismaClient } from "@/generated/prisma"
import * as fs from "node:fs"
import * as path from "node:path"

const db = new PrismaClient()

type FormItem = {
  category: string
  name: string
  packSize: string
  packPrice: number | null
  unitPrice: number | null
  unit: string
  notes?: string
}
type Form = { supplier: string; items: FormItem[] }
type FormsFile = { forms: Form[] }

async function main() {
  const filePath = path.join(__dirname, "order-forms.json")
  const raw = fs.readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw) as FormsFile

  let total = 0
  let created = 0
  let updated = 0

  for (const form of parsed.forms) {
    const supplier = await db.supplier.findUnique({
      where: { name: form.supplier },
    })
    if (!supplier) {
      console.warn(`! Supplier not found in DB: "${form.supplier}" — skipping ${form.items.length} items`)
      continue
    }

    for (const [idx, it] of form.items.entries()) {
      total++
      if (it.packPrice == null) {
        console.warn(`  skip (no packPrice): ${form.supplier} · ${it.name}`)
        continue
      }
      const data = {
        name: it.name,
        packSize: it.packSize || null,
        packPrice: it.packPrice,
        unit: it.unit || null,
        category: it.category || null,
        notes: it.notes || null,
        active: true,
        sortOrder: idx,
      }
      const existing = await db.approvedSupplierItem.findUnique({
        where: { supplierId_name: { supplierId: supplier.id, name: it.name } },
      })
      if (existing) {
        await db.approvedSupplierItem.update({
          where: { id: existing.id },
          data,
        })
        updated++
      } else {
        await db.approvedSupplierItem.create({
          data: { supplierId: supplier.id, ...data },
        })
        created++
      }
    }
    console.log(`✓ ${form.supplier}: processed ${form.items.length} items`)
  }

  console.log(`\nDone — ${total} items processed: ${created} created, ${updated} updated.`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
