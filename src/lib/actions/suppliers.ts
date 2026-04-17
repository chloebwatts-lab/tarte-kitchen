"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { Supplier, Ingredient } from "@/generated/prisma/client"

type SupplierWithCount = Supplier & { _count: { ingredients: number } }
type SupplierWithIngredients = Supplier & {
  ingredients: Pick<Ingredient, "id" | "name" | "category" | "purchasePrice" | "purchaseUnit" | "purchaseQuantity">[]
}

export async function getSuppliers() {
  const suppliers = await db.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { ingredients: true } },
    },
  }) as SupplierWithCount[]

  return suppliers.map((s) => ({
    ...s,
    ingredientCount: s._count.ingredients,
  }))
}

export async function getSupplier(id: string) {
  const s = await db.supplier.findUnique({
    where: { id },
    include: {
      ingredients: {
        select: { id: true, name: true, category: true, purchasePrice: true, purchaseUnit: true, purchaseQuantity: true },
        orderBy: { name: "asc" },
      },
    },
  }) as SupplierWithIngredients | null
  if (!s) return null
  return {
    ...s,
    ingredients: s.ingredients.map((i) => ({
      ...i,
      purchasePrice: Number(i.purchasePrice),
      purchaseQuantity: Number(i.purchaseQuantity),
    })),
  }
}

export async function createSupplier(data: {
  name: string
  contact?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}) {
  const supplier = await db.supplier.create({
    data: {
      name: data.name,
      contact: data.contact || null,
      phone: data.phone || null,
      email: data.email || null,
      notes: data.notes || null,
    },
  })
  revalidatePath("/suppliers")
  return supplier.id
}

export async function updateSupplier(
  id: string,
  data: {
    name: string
    contact?: string | null
    phone?: string | null
    email?: string | null
    notes?: string | null
  }
) {
  await db.supplier.update({
    where: { id },
    data: {
      name: data.name,
      contact: data.contact || null,
      phone: data.phone || null,
      email: data.email || null,
      notes: data.notes || null,
    },
  })
  revalidatePath("/suppliers")
  return id
}

export async function deleteSupplier(id: string) {
  await db.supplier.delete({ where: { id } })
  revalidatePath("/suppliers")
  return true
}

export async function getSupplierEmails(supplierId: string) {
  const emails = await db.supplierEmail.findMany({
    where: { supplierId },
    orderBy: { createdAt: "asc" },
  })
  return emails.map((e) => ({ id: e.id, email: e.email }))
}

export async function addSupplierEmail(supplierId: string, email: string) {
  await db.supplierEmail.create({
    data: { supplierId, email: email.toLowerCase().trim() },
  })
  revalidatePath("/suppliers")
}

export async function removeSupplierEmail(id: string) {
  await db.supplierEmail.delete({ where: { id } })
  revalidatePath("/suppliers")
}
