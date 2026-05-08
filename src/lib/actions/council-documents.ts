"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { isCouncilAuthed } from "@/lib/council-auth"
import { CouncilDocumentType, Venue } from "@/generated/prisma/enums"

const SINGLE_VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
])

const MAX_BYTES = 15 * 1024 * 1024

function ensureSingleVenue(value: string | null): Venue {
  if (!value) throw new Error("Missing venue")
  if (!SINGLE_VENUES.includes(value as Venue)) {
    throw new Error(`Unknown venue: ${value}`)
  }
  return value as Venue
}

function ensureDocType(value: string | null): CouncilDocumentType {
  if (!value) throw new Error("Missing document type")
  if (
    !Object.values(CouncilDocumentType).includes(value as CouncilDocumentType)
  ) {
    throw new Error(`Unknown document type: ${value}`)
  }
  return value as CouncilDocumentType
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || !value) return null
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d
}

export async function uploadCouncilDocument(formData: FormData): Promise<void> {
  if (!(await isCouncilAuthed())) throw new Error("Unauthorized")

  const venue = ensureSingleVenue(String(formData.get("venue") ?? ""))
  const type = ensureDocType(String(formData.get("type") ?? ""))
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim() || null
  const issuedOn = parseDate(formData.get("issuedOn"))
  const expiresOn = parseDate(formData.get("expiresOn"))
  const uploadedBy = String(formData.get("uploadedBy") ?? "").trim() || null

  if (!title) throw new Error("Title is required")

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("File is required")
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`)
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type || "unknown"}`)
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  await db.councilDocument.create({
    data: {
      venue,
      type,
      title,
      description,
      issuedOn,
      expiresOn,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      data: bytes,
      uploadedBy,
    },
  })

  revalidatePath(`/council/${venue}`)
  revalidatePath(`/council`)
}

export async function deleteCouncilDocument(formData: FormData): Promise<void> {
  if (!(await isCouncilAuthed())) throw new Error("Unauthorized")
  const id = String(formData.get("id") ?? "")
  if (!id) throw new Error("Missing id")
  const doc = await db.councilDocument.findUnique({
    where: { id },
    select: { venue: true },
  })
  if (!doc) return
  await db.councilDocument.delete({ where: { id } })
  revalidatePath(`/council/${doc.venue}`)
  revalidatePath(`/council`)
}
