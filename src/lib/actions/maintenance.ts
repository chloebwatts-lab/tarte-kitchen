"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma/client"
import {
  ASSET_CATEGORIES,
  CATEGORY_SPECIALTIES,
  CATEGORY_SYMPTOMS,
  type AssetCategory,
  warrantyEndDate,
} from "@/lib/maintenance/constants"
import { nextAssetSlug } from "@/lib/maintenance/slug"
import { fmtDay, sendIssueAlert } from "@/lib/maintenance/notify"

/** A fault lives on the morning board too; both go stale together. */
function bustBoard() {
  revalidatePath("/venue-ops")
  revalidatePath("/kitchen/managers/board")
  revalidatePath("/kitchen/jobs")
}

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
  /// The quick-fix steps the reporter ticked as tried before logging it.
  triedFixes?: string[]
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

  const isSafety = input.isSafety ?? symptom?.safety ?? false
  const reportedBy = input.reportedBy.trim()
  const issue = await db.maintenanceIssue.create({
    data: {
      assetId: asset.id,
      venue: asset.venue,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      reportedBy,
      isSafety,
      symptomKey: symptom?.key ?? null,
      triedFixes: (input.triedFixes ?? []).map((t) => t.trim()).filter(Boolean),
    },
  })

  // The same fault is a row on the morning board, so Georgia's triage sees
  // it without anyone opening the maintenance page. Done on the board closes
  // the issue; fixed on the fix page closes the board row (markIssueFixed).
  await db.venueTask.create({
    data: {
      venue: asset.venue,
      category: "BROKEN_EQUIPMENT",
      title: `${asset.name} (${asset.slug}): ${issue.title}`,
      detail: issue.description,
      reportedPriority: isSafety ? "URGENT" : "NORMAL",
      reportedBy,
      maintenanceIssueId: issue.id,
    },
  })

  revalidatePath(`/kitchen/fix/${asset.slug}`)
  revalidatePath("/maintenance")
  bustBoard()

  const emailed = await sendIssueAlert(
    issue.id,
    "reported",
    `${reportedBy} has logged a fault on ${asset.name} (${asset.slug}) at ${asset.venue === "BURLEIGH" ? "Burleigh" : "Currumbin"}.${
      isSafety ? " Safety fault." : ""
    }`
  )
  return { id: issue.id, emailed }
}

export interface BookTradeInput {
  issueId: string
  /// A contact on file, or a free-typed name when they called someone else.
  contactId?: string | null
  contactName?: string
  /// Calendar day they said they are coming, "YYYY-MM-DD" in venue time. Optional.
  comingOn?: string | null
  bookedBy: string
  note?: string
}

/**
 * Somebody called a trade. Record who, when, and when they are coming, on
 * the issue and on its board row (due date, and the caller owns it if nobody
 * did), then tell everyone. This is the step that used to live in one
 * person's head and a WhatsApp thread.
 */
export async function bookTrade(input: BookTradeInput) {
  const by = input.bookedBy.trim()
  if (!by) throw new Error("Name is required")
  const issue = await db.maintenanceIssue.findUnique({
    where: { id: input.issueId },
    include: { asset: { select: { slug: true, name: true } }, venueTask: { select: { id: true, ownedBy: true, detail: true } } },
  })
  if (!issue) throw new Error("Unknown issue")

  let contactId = input.contactId ?? null
  let contactName = input.contactName?.trim() || null
  if (contactId) {
    const c = await db.maintenanceContact.findUnique({ where: { id: contactId }, select: { name: true } })
    if (!c) contactId = null
    else contactName = c.name
  }
  if (!contactId && !contactName) throw new Error("Who did you call?")

  const comingOn = input.comingOn ? new Date(`${input.comingOn}T09:00:00+10:00`) : null
  if (comingOn && Number.isNaN(comingOn.getTime())) throw new Error("That date does not look right")
  const note = input.note?.trim() || null
  const now = new Date()

  await db.maintenanceIssue.update({
    where: { id: issue.id },
    data: {
      contactId,
      bookedFor: comingOn,
      bookedBy: by,
      bookedAt: now,
      bookedNote: [contactId ? null : contactName, note].filter(Boolean).join(". ") || null,
    },
  })
  await db.maintenanceIssueEvent.create({
    data: {
      issueId: issue.id,
      author: by,
      body: `Called ${contactName}.${comingOn ? ` Coming ${fmtDay(comingOn)}.` : " No date yet."}${note ? ` ${note}` : ""}`,
    },
  })

  if (issue.venueTask) {
    const booked = `Called ${contactName}${comingOn ? `, coming ${fmtDay(comingOn)}` : ""}${note ? `. ${note}` : ""}`
    const base = (issue.venueTask.detail ?? "").replace(/\s*·\s*Called [^·]*$/, "")
    await db.venueTask.update({
      where: { id: issue.venueTask.id },
      data: {
        detail: base ? `${base} · ${booked}` : booked,
        dueAt: comingOn,
        ...(issue.venueTask.ownedBy
          ? {}
          : { ownedBy: by, status: "IN_PROGRESS", assignedBy: by, assignedAt: now }),
      },
    })
  }

  if (issue.asset) revalidatePath(`/kitchen/fix/${issue.asset.slug}`)
  revalidatePath("/maintenance")
  bustBoard()

  const emailed = await sendIssueAlert(
    issue.id,
    "booked",
    `${by} called ${contactName} about ${issue.asset ? `${issue.asset.name} (${issue.asset.slug})` : issue.title}.${
      comingOn ? ` Coming ${fmtDay(comingOn)}.` : " No date given yet."
    }`
  )
  return { emailed }
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
  await sendIssueAlert(issueId, "update", `${author.trim() || "Someone"} added an update: ${body.trim()}`)
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
    throw new Error("Say what fixed it, that's the whole point of the history")
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

  // The board row closes with it, so the morning board and the fix page
  // never disagree about whether the machine works.
  await db.venueTask.updateMany({
    where: { maintenanceIssueId: input.issueId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    data: {
      status: "DONE",
      doneBy: input.fixedBy.trim() || null,
      doneAt: new Date(),
      doneNote: input.fixSummary.trim() || null,
    },
  })
  bustBoard()
  await sendIssueAlert(input.issueId, "fixed", `${input.fixedBy.trim()} marked it fixed: ${input.fixSummary.trim()}`)
}

/** Existing sub-locations at a venue, for the quick-add page's picker. */
export async function getVenueLocations(venue: Venue): Promise<string[]> {
  const rows = await db.maintenanceAsset.findMany({
    where: { venue, status: "ACTIVE" },
    select: { location: true },
    distinct: ["location"],
    orderBy: { location: "asc" },
  })
  return rows.map((r) => r.location).filter((l) => l !== "To confirm")
}

export interface CreateAssetInput {
  venue: Venue
  name: string
  location: string
  category: string
  aliases?: string[]
  manufacturer?: string | null
  model?: string | null
  serial?: string | null
  photoUrl?: string | null
  photoPublicId?: string | null
  addedBy: string
}

/**
 * Staff quick-add (kitchen page, behind the shared staff login). Allocates
 * the next QR slug for the venue so the label is printable immediately.
 */
export async function createMaintenanceAsset(input: CreateAssetInput): Promise<{ slug: string }> {
  if (!input.name.trim()) throw new Error("What is the machine called?")
  if (!input.location.trim()) throw new Error("Where does it live?")
  if (!input.addedBy.trim()) throw new Error("Name is required")
  const venue: Venue = input.venue === "BURLEIGH" ? "BURLEIGH" : "BEACH_HOUSE"
  const category = (ASSET_CATEGORIES as readonly string[]).includes(input.category)
    ? input.category
    : "other"

  const slug = await nextAssetSlug(venue)
  await db.maintenanceAsset.create({
    data: {
      slug,
      venue,
      name: input.name.trim(),
      location: input.location.trim(),
      category,
      aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean),
      manufacturer: input.manufacturer?.trim() || null,
      model: input.model?.trim() || null,
      serial: input.serial?.trim() || null,
      photoUrl: input.photoUrl || null,
      photoPublicId: input.photoPublicId || null,
      source: "staff",
      addedBy: input.addedBy.trim(),
    },
  })
  revalidatePath("/kitchen/fix")
  revalidatePath("/maintenance")
  revalidatePath("/maintenance/labels")
  return { slug }
}

// ── Admin ───────────────────────────────────────────────────────────────────

/** Clears the "check details" flag on an email-created asset. */
export async function confirmMaintenanceAsset(id: string) {
  await db.maintenanceAsset.update({ where: { id }, data: { needsReview: false } })
  revalidatePath("/maintenance")
}

/**
 * Rejects an auto-created asset that isn't really a machine (the sweep
 * occasionally over-reads an invoice). Deliberately narrow: only rows still
 * flagged needsReview and with no issue history can be removed — everything
 * else goes through retirement, never deletion.
 */
export async function removeMaintenanceAsset(id: string) {
  const asset = await db.maintenanceAsset.findUnique({
    where: { id },
    include: { _count: { select: { issues: true } } },
  })
  if (!asset) return
  if (!asset.needsReview || asset._count.issues > 0) {
    throw new Error("Only unreviewed machines with no history can be removed")
  }
  await db.maintenanceAsset.delete({ where: { id } })
  revalidatePath("/maintenance")
  revalidatePath("/maintenance/labels")
  revalidatePath("/kitchen/fix")
}

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
