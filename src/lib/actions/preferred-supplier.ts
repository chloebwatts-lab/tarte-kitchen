"use server"

import { assertManager } from "@/lib/manager-auth"
import { db } from "@/lib/db"
import { rankRows, type FormRow, type RankedRow } from "@/lib/preferred-supplier"

/**
 * Managers' "Where to order it" lookup. Searches every approved supplier
 * form at once (active and retired rows alike) so a product the kitchen
 * keeps ordering from the wrong place shows up next to the place it should
 * come from. Ranking lives in src/lib/preferred-supplier.ts.
 */
export async function searchPreferred(query: string): Promise<RankedRow[]> {
  await assertManager()
  const words = query.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 0 || words.join("").length < 2) return []

  const rows = await db.approvedSupplierItem.findMany({
    where: { AND: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    include: { supplier: { select: { name: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 60,
  })

  const form: FormRow[] = rows.map((r) => ({
    id: r.id,
    supplier: r.supplier.name,
    name: r.name,
    packSize: r.packSize,
    packPrice: Number(r.packPrice),
    unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
    unit: r.unit,
    category: r.category,
    notes: r.notes,
    active: r.active,
  }))
  return rankRows(form)
}
