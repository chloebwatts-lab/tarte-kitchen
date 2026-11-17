"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { isGmAuthed } from "@/lib/gm-auth"
import { PHOTO_SITES, isOurCloudinaryUrl, photoSiteOf } from "@/lib/checklists/thank-you"
import type { Venue } from "@/generated/prisma/client"

/**
 * Staff photos for the checklist "Thank you :)" finishing page. Managed from
 * the GM desk (/kitchen/gm/photos), so the GM gate guards every write.
 * Two sets (Oliver 17 Nov 2026): Burleigh, and Currumbin (saved under Beach
 * House; Tea Garden lists use the same set).
 */

export interface ThankYouPhotoRow {
  id: string
  url: string
  createdAt: string
}

async function guard(): Promise<void> {
  if (!(await isGmAuthed())) throw new Error("Locked. Unlock the GM desk first.")
}

function siteOf(v: string) {
  const key = photoSiteOf(v) ?? "BURLEIGH"
  return PHOTO_SITES.find((s) => s.key === key)!
}

/** `venue` is a site key (BURLEIGH, CURRUMBIN) or a venue (BEACH_HOUSE...). */
export async function listThankYouPhotos(venue: string): Promise<ThankYouPhotoRow[]> {
  await guard()
  const rows = await db.thankYouPhoto.findMany({
    where: { venue: { in: [...siteOf(venue).venues] as Venue[] }, archived: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, createdAt: true },
  })
  return rows.map((r) => ({ id: r.id, url: r.url, createdAt: r.createdAt.toISOString() }))
}

export async function addThankYouPhoto(p: { venue: string; url: string; publicId: string }) {
  await guard()
  if (!isOurCloudinaryUrl(p.url, process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) || !p.publicId) {
    return { ok: false as const, error: "That photo did not upload properly. Try again." }
  }
  const row = await db.thankYouPhoto.create({
    data: { venue: siteOf(p.venue).saveAs as Venue, url: p.url, publicId: p.publicId.slice(0, 300), uploadedBy: "GM desk" },
    select: { id: true, url: true, createdAt: true },
  })
  revalidatePath("/kitchen/gm/photos")
  return { ok: true as const, photo: { id: row.id, url: row.url, createdAt: row.createdAt.toISOString() } }
}

/** Takes a photo out of the pool. The row is kept (archived), not deleted. */
export async function removeThankYouPhoto(id: string) {
  await guard()
  await db.thankYouPhoto.updateMany({ where: { id }, data: { archived: true } })
  revalidatePath("/kitchen/gm/photos")
  return { ok: true as const }
}
