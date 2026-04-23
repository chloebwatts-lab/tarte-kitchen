"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export type ApprovedItemDTO = {
  id: string
  supplierId: string
  name: string
  packSize: string | null
  packPrice: number
  unit: string | null
  category: string | null
  notes: string | null
  active: boolean
  sortOrder: number
  ingredientId: string | null
}

export async function listApprovedItemsBySupplier(supplierId: string): Promise<ApprovedItemDTO[]> {
  const rows = await db.approvedSupplierItem.findMany({
    where: { supplierId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  })
  return rows.map((r) => ({
    id: r.id,
    supplierId: r.supplierId,
    name: r.name,
    packSize: r.packSize,
    packPrice: Number(r.packPrice),
    unit: r.unit,
    category: r.category,
    notes: r.notes,
    active: r.active,
    sortOrder: r.sortOrder,
    ingredientId: r.ingredientId,
  }))
}

export async function upsertApprovedItem(input: {
  id?: string
  supplierId: string
  name: string
  packSize?: string | null
  packPrice: number
  unit?: string | null
  category?: string | null
  notes?: string | null
  active?: boolean
}) {
  const data = {
    name: input.name.trim(),
    packSize: input.packSize?.trim() || null,
    packPrice: input.packPrice,
    unit: input.unit?.trim() || null,
    category: input.category?.trim() || null,
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  }
  if (input.id) {
    await db.approvedSupplierItem.update({ where: { id: input.id }, data })
  } else {
    await db.approvedSupplierItem.upsert({
      where: { supplierId_name: { supplierId: input.supplierId, name: data.name } },
      update: data,
      create: { ...data, supplierId: input.supplierId },
    })
  }
  revalidatePath("/suppliers")
  revalidatePath("/cogs")
}

export async function deleteApprovedItem(id: string) {
  await db.approvedSupplierItem.delete({ where: { id } })
  revalidatePath("/suppliers")
  revalidatePath("/cogs")
}

export async function toggleApprovedItemActive(id: string, active: boolean) {
  await db.approvedSupplierItem.update({ where: { id }, data: { active } })
  revalidatePath("/suppliers")
  revalidatePath("/cogs")
}

/**
 * Parse a pasted block from a supplier order form. Each line: tab- or
 * comma-separated `name,packSize,packPrice[,category]`. Blank lines and
 * lines starting with `#` are ignored. Returns the count of upserted rows.
 */
export async function bulkImportApprovedItems(supplierId: string, raw: string): Promise<number> {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))

  let count = 0
  for (const line of lines) {
    const cols = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""))
    if (cols.length < 3) continue
    const [name, packSize, priceStr, category] = cols
    const packPrice = Number(priceStr.replace(/[^0-9.]/g, ""))
    if (!name || !Number.isFinite(packPrice)) continue
    await db.approvedSupplierItem.upsert({
      where: { supplierId_name: { supplierId, name } },
      update: { packSize: packSize || null, packPrice, category: category || null, active: true },
      create: {
        supplierId,
        name,
        packSize: packSize || null,
        packPrice,
        category: category || null,
      },
    })
    count++
  }
  revalidatePath("/suppliers")
  revalidatePath("/cogs")
  return count
}
