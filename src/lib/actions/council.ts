"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { isGmAuthed } from "@/lib/gm-auth"
import { isOurCloudinaryUrl } from "@/lib/checklists/thank-you"
import {
  CAMPAIGN,
  cleanFields,
  isSignaturePng,
  isStatus,
  signProblem,
  signedTime,
  sortKey,
  type SignOnFields,
  type SignOnStatus,
} from "@/lib/council/sign-on"

/**
 * Council sign-ons on the GM desk (/kitchen/gm/council). Every write is
 * guarded by the GM gate. Nothing here deletes: a save updates the row and
 * appends a full snapshot (signature included) to CouncilSignOnEvent, so any
 * earlier state can be recovered.
 */

export interface SignOnRow extends SignOnFields {
  id: string
  name: string
  street: string
  unsure: boolean
  source: string
  status: SignOnStatus
  hasSignature: boolean
  signatureUrl: string | null
  signedAt: string | null
  updatedAt: string
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; code?: "locked" }

async function guard(): Promise<void> {
  if (!(await isGmAuthed())) throw new Error("Locked. Unlock the GM desk first.")
}

/** Writes answer a locked desk with this instead of throwing, so the iPad keeps the save and retries after unlock. */
const LOCKED = { ok: false as const, error: "The desk locked itself. Unlock it, then come back. Nothing is lost.", code: "locked" as const }

const LIST_SELECT = {
  id: true, name: true, street: true, unsure: true, source: true, status: true,
  owner: true, permit: true, worksPct: true, openedPct: true, nowPct: true, setupHours: true, email: true, note: true,
  signatureUrl: true, signedAt: true, updatedAt: true,
  signature: false,
} as const

type ListRow = {
  id: string; name: string; street: string; unsure: boolean; source: string; status: string
  owner: string; permit: string; worksPct: string; openedPct: string; nowPct: string; setupHours: string; email: string; note: string
  signatureUrl: string | null; signedAt: Date | null; updatedAt: Date
}

function toRow(r: ListRow, hasSignature: boolean): SignOnRow {
  return {
    id: r.id, name: r.name, street: r.street, unsure: r.unsure, source: r.source,
    status: isStatus(r.status) ? r.status : "todo",
    owner: r.owner, permit: r.permit, worksPct: r.worksPct, openedPct: r.openedPct, nowPct: r.nowPct,
    setupHours: r.setupHours, email: r.email, note: r.note,
    hasSignature,
    signatureUrl: r.signatureUrl,
    signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function listSignOns(): Promise<SignOnRow[]> {
  await guard()
  const rows = await db.councilSignOn.findMany({ where: { campaign: CAMPAIGN }, select: LIST_SELECT, orderBy: { sortName: "asc" } })
  const signed = new Set(
    (await db.councilSignOn.findMany({ where: { campaign: CAMPAIGN, signature: { not: null } }, select: { id: true } })).map((r) => r.id),
  )
  return rows.map((r) => toRow(r, signed.has(r.id)))
}

/** The stored signature image (PNG data URL) for one business, or null. */
export async function getSignOnSignature(id: string): Promise<string | null> {
  await guard()
  const r = await db.councilSignOn.findFirst({ where: { id, campaign: CAMPAIGN }, select: { signature: true } })
  return r?.signature ?? null
}

export interface SaveSignOnInput {
  id: string
  status: string
  fields: Record<string, unknown>
  /** A fresh signature (PNG data URL). Omit to keep the one already saved. */
  signature?: string | null
  /** Cloudinary copy of the fresh signature, when the upload worked. */
  signatureUrl?: string | null
  /** When the owner signed, from the iPad clock (a save sent later after no wifi keeps the real time). */
  signedAt?: string | null
}


export async function saveSignOn(input: SaveSignOnInput): Promise<Result<{ row: SignOnRow }>> {
  if (!(await isGmAuthed())) return LOCKED
  if (!input || typeof input.id !== "string") return { ok: false, error: "That business was not found. Reload the page." }
  if (!isStatus(input.status)) return { ok: false, error: "Unknown status." }
  const existing = await db.councilSignOn.findFirst({ where: { id: input.id, campaign: CAMPAIGN } })
  if (!existing) return { ok: false, error: "That business was not found. Reload the page." }

  const fields = cleanFields(input.fields)
  const freshSig = input.signature != null ? input.signature : null
  if (freshSig !== null && !isSignaturePng(freshSig)) return { ok: false, error: "The signature did not come through. Ask them to sign again." }
  const url =
    freshSig !== null && typeof input.signatureUrl === "string" && isOurCloudinaryUrl(input.signatureUrl, process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME)
      ? input.signatureUrl
      : null

  const data: Record<string, unknown> = { ...fields, status: input.status }
  if (input.status === "signed") {
    const problem = signProblem({ owner: fields.owner, hasSignature: freshSig !== null || !!existing.signature })
    if (problem) return { ok: false, error: problem }
    if (freshSig !== null) {
      data.signature = freshSig
      data.signatureUrl = url
      data.signedAt = signedTime(input.signedAt)
    }
  }

  const saved = await db.$transaction(async (tx) => {
    const row = await tx.councilSignOn.update({ where: { id: existing.id }, data })
    await tx.councilSignOnEvent.create({
      data: { signOnId: row.id, action: freshSig !== null ? "sign" : `status:${input.status}`, snapshot: JSON.parse(JSON.stringify(row)) },
    })
    return row
  })
  revalidatePath("/kitchen/gm/council")
  return { ok: true, row: toRow(saved, !!saved.signature) }
}

export async function addSignOn(p: { name: string; street: string }): Promise<Result<{ row: SignOnRow; existed: boolean }>> {
  if (!(await isGmAuthed())) return LOCKED
  const name = String(p?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100)
  const street = String(p?.street ?? "").replace(/\s+/g, " ").trim().slice(0, 60)
  const key = sortKey(name)
  if (!key) return { ok: false, error: "Type the business name." }

  const found = await db.councilSignOn.findUnique({ where: { campaign_sortName: { campaign: CAMPAIGN, sortName: key } }, select: LIST_SELECT })
  if (found) {
    const hasSig = !!(await db.councilSignOn.findFirst({ where: { id: found.id, signature: { not: null } }, select: { id: true } }))
    return { ok: true, row: toRow(found, hasSig), existed: true }
  }

  const row = await db.$transaction(async (tx) => {
    const r = await tx.councilSignOn.create({ data: { campaign: CAMPAIGN, name, sortName: key, street, source: "added" } })
    await tx.councilSignOnEvent.create({ data: { signOnId: r.id, action: "add", snapshot: JSON.parse(JSON.stringify(r)) } })
    return r
  })
  revalidatePath("/kitchen/gm/council")
  return { ok: true, row: toRow(row, false), existed: false }
}

/** Everything, signatures included, for the filed copy page. */
export async function listSignOnsForFiling() {
  await guard()
  return db.councilSignOn.findMany({ where: { campaign: CAMPAIGN }, orderBy: { sortName: "asc" } })
}
