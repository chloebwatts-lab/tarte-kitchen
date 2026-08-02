"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma/client"
import {
  CATEGORY_SPECIALTIES,
  CATEGORY_SYMPTOMS,
  type AssetCategory,
  warrantyEndDate,
} from "@/lib/maintenance/constants"

// ── Staff (kiosk, no auth) ──────────────────────────────────────────────────

export async function getFixAssets(venue: Venue) {
  return db.maintenanceAsset.findMany({
    where: { venue, status: "ACTIVE" },
    orderBy: [{ location: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      aliases: true,
      location: true,
      category: true,
      manufacturer: true,
      photoUrl: true,
      issues: {
        where: { status: "OPEN" },
        select: { id: true, isSafety: true },
      },
    },
  })
}

export async function getFixAsset(slug: string) {
  const asset = await db.maintenanceAsset.findUnique({
    where: { slug: slug.toUpperCase() },
    include: {
      issues: {
        orderBy: { createdAt: "desc" },
        include: {
          contact: { select: { name: true, phone: true } },
          events: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  })
  if (!asset) return null

  const category = asset.category as AssetCategory
  const specialties = CATEGORY_SPECIALTIES[category] ?? ["general"]
  const contacts = await db.maintenanceContact.findMany({
    orderBy: { sortOrder: "asc" },
  })
  const suggestedContacts = contacts
    .filter((c) => c.specialties.some((s) => specialties.includes(s)))
    .slice(0, 3)
  const warrantyContact =
    contacts.find(
      (c) =>
        asset.warrantyProvider &&
        (c.name.toLowerCase().includes(asset.warrantyProvider.toLowerCase()) ||
          asset.warrantyProvider.toLowerCase().includes(c.name.toLowerCase()))
    ) ?? contacts.find((c) => c.specialties.includes("warranty"))

  return {
    asset,
    symptoms: CATEGORY_SYMPTOMS[category] ?? CATEGORY_SYMPTOMS.other,
    suggestedContacts,
    warrantyContact: warrantyContact ?? null,
    warrantyEnd: warrantyEndDate(asset),
  }
}

export interface ReportIssueInput {
  assetSlug: string
  symptomKey: string | null
  title: string
  description?: string
  reportedBy: string
  isSafety?: boolean
}

export async function reportIssue(input: ReportIssueInput) {
  const asset = await db.maintenanceAsset.findUnique({
    where: { slug: input.assetSlug.toUpperCase() },
  })
  if (!asset) throw new Error("Unknown asset")
  if (!input.reportedBy.trim()) throw new Error("Name is required")
  if (!input.title.trim()) throw new Error("Describe the problem")

  const symptom = (CATEGORY_SYMPTOMS[asset.category as AssetCategory] ?? []).find(
    (s) => s.key === input.symptomKey
  )

  const issue = await db.maintenanceIssue.create({
    data: {
      assetId: asset.id,
      venue: asset.venue,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      reportedBy: input.reportedBy.trim(),
      isSafety: input.isSafety ?? symptom?.safety ?? false,
    },
  })
  revalidatePath(`/kitchen/fix/${asset.slug}`)
  revalidatePath("/maintenance")
  return { id: issue.id }
}

export async function addIssueComment(issueId: string, author: string, body: string) {
  if (!body.trim()) return
  await db.maintenanceIssueEvent.create({
    data: { issueId, author: author.trim() || null, body: body.trim() },
  })
  const issue = await db.maintenanceIssue.findUnique({
    where: { id: issueId },
    include: { asset: { select: { slug: true } } },
  })
  if (issue?.asset) revalidatePath(`/kitchen/fix/${issue.asset.slug}`)
  revalidatePath("/maintenance")
}

export interface MarkFixedInput {
  issueId: string
  fixedBy: string
  fixSummary: string
  costCents?: number | null
  wasWarranty?: boolean
}

export async function markIssueFixed(input: MarkFixedInput) {
  if (!input.fixedBy.trim()) throw new Error("Name is required")
  if (!input.fixSummary.trim())
    throw new Error("Say what fixed it — that's the whole point of the history")
  const issue = await db.maintenanceIssue.update({
    where: { id: input.issueId },
    data: {
      status: "FIXED",
      fixedBy: input.fixedBy.trim(),
      fixedAt: new Date(),
      fixSummary: input.fixSummary.trim(),
      costCents: input.costCents ?? null,
      wasWarranty: input.wasWarranty ?? false,
    },
    include: { asset: { select: { slug: true } } },
  })
  if (issue.asset) revalidatePath(`/kitchen/fix/${issue.asset.slug}`)
  revalidatePath("/maintenance")
}

// ── Admin ───────────────────────────────────────────────────────────────────

export async function getMaintenanceOverview() {
  const [openIssues, assets, contacts] = await Promise.all([
    db.maintenanceIssue.findMany({
      where: { status: "OPEN" },
      orderBy: [{ isSafety: "desc" }, { createdAt: "asc" }],
      include: {
        asset: { select: { slug: true, name: true, location: true } },
        contact: { select: { name: true, phone: true } },
      },
    }),
    db.maintenanceAsset.findMany({
      orderBy: [{ venue: "asc" }, { location: "asc" }, { name: "asc" }],
      include: { _count: { select: { issues: true } } },
    }),
    db.maintenanceContact.findMany({ orderBy: { sortOrder: "asc" } }),
  ])
  return { openIssues, assets, contacts }
}

export interface AssetUpdateInput {
  id: string
  name?: string
  location?: string
  category?: string
  aliases?: string[]
  manufacturer?: string | null
  model?: string | null
  serial?: string | null
  year?: string | null
  purchaseDate?: string | null
  purchasePriceCents?: number | null
  supplier?: string | null
  warrantyMonths?: number | null
  warrantyProvider?: string | null
  warrantyNotes?: string | null
  notes?: string | null
  status?: "ACTIVE" | "RETIRED"
}

export async function updateMaintenanceAsset(input: AssetUpdateInput) {
  const { id, purchaseDate, status, ...rest } = input
  await db.maintenanceAsset.update({
    where: { id },
    data: {
      ...rest,
      ...(purchaseDate !== undefined
        ? { purchaseDate: purchaseDate ? new Date(purchaseDate) : null }
        : {}),
      ...(status
        ? {
            status,
            retiredAt: status === "RETIRED" ? new Date() : null,
          }
        : {}),
    },
  })
  revalidatePath("/maintenance")
}

export interface ContactInput {
  id?: string
  name: string
  company?: string | null
  phone?: string | null
  email?: string | null
  specialties?: string[]
  notes?: string | null
}

export async function upsertMaintenanceContact(input: ContactInput) {
  const { id, ...data } = input
  if (!data.name.trim()) throw new Error("Name required")
  if (id) {
    await db.maintenanceContact.update({ where: { id }, data })
  } else {
    await db.maintenanceContact.create({ data: { ...data, sortOrder: 99 } })
  }
  revalidatePath("/maintenance")
  revalidatePath("/maintenance/contacts")
}
