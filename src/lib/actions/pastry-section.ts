"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getPerson } from "@/lib/person-session"
import { brisbaneDay } from "@/lib/high-tea/prep"
import type { Venue } from "@/generated/prisma/client"
import {
  MAX_NOTE_LENGTH,
  MAX_PRODUCT_NAME_LENGTH,
  MAX_TASK_LENGTH,
  SORTED_NOTE_DAYS,
  cleanText,
  isPrepList,
  noteVisible,
  taskOnDay,
  type PrepListKey,
} from "@/lib/pastry/section"

type SingleVenue = Exclude<Venue, "BOTH">

export interface PrepTaskRow {
  id: string
  label: string
  everyDay: boolean
  done: boolean
  doneBy: string | null
}

export interface PastryNoteRow {
  id: string
  text: string
  createdBy: string | null
  createdAt: string
  done: boolean
  doneBy: string | null
}

export interface PastrySection {
  day: string
  lists: Record<PrepListKey, PrepTaskRow[]>
  notes: PastryNoteRow[]
}

export interface GalleryProduct {
  id: string
  name: string
  note: string | null
  inRotation: boolean
  photos: { id: string; url: string }[]
}

const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`)

async function who(): Promise<string | null> {
  return (await getPerson())?.name ?? null
}

function refresh() {
  revalidatePath("/kitchen/pastry")
  revalidatePath("/kitchen/pastry/products")
}

/** Today's two prep lists with their ticks, plus the notes for Jess. */
export async function getPastrySection(venue: SingleVenue): Promise<PastrySection> {
  const day = brisbaneDay()
  const [tasks, notes] = await Promise.all([
    db.pastryPrepTask.findMany({
      where: { venue, isActive: true, OR: [{ onlyDay: null }, { onlyDay: dayDate(day) }] },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { ticks: { where: { day: dayDate(day) } } },
    }),
    db.pastryNote.findMany({
      where: {
        venue,
        OR: [{ doneAt: null }, { doneAt: { gte: new Date(Date.now() - SORTED_NOTE_DAYS * 86_400_000) } }],
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const lists: Record<PrepListKey, PrepTaskRow[]> = { DAILY: [], AFTERNOON: [] }
  for (const t of tasks) {
    if (!isPrepList(t.list) || !taskOnDay(t, day)) continue
    const tick = t.ticks[0] ?? null
    lists[t.list].push({
      id: t.id,
      label: t.label,
      everyDay: t.onlyDay === null,
      done: !!tick,
      doneBy: tick?.doneBy ?? null,
    })
  }

  return {
    day,
    lists,
    notes: notes
      .filter((n) => noteVisible(n))
      .sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt))
      .map((n) => ({
        id: n.id,
        text: n.text,
        createdBy: n.createdBy,
        createdAt: n.createdAt.toISOString(),
        done: !!n.doneAt,
        doneBy: n.doneBy,
      })),
  }
}

export async function addPrepTask(params: {
  venue: SingleVenue
  list: PrepListKey
  label: string
  everyDay: boolean
}): Promise<void> {
  const label = cleanText(params.label, MAX_TASK_LENGTH)
  if (!label || !isPrepList(params.list)) return
  const last = await db.pastryPrepTask.findFirst({
    where: { venue: params.venue, list: params.list },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  await db.pastryPrepTask.create({
    data: {
      venue: params.venue,
      list: params.list,
      label,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      onlyDay: params.everyDay ? null : dayDate(brisbaneDay()),
      createdBy: await who(),
    },
  })
  refresh()
}

/** Tick or untick a task for today (Brisbane). */
export async function setPrepTick(taskId: string, done: boolean): Promise<void> {
  if (!taskId) return
  const day = dayDate(brisbaneDay())
  if (done) {
    const doneBy = await who()
    await db.pastryPrepTick.upsert({
      where: { taskId_day: { taskId, day } },
      create: { taskId, day, doneBy },
      update: {},
    })
  } else {
    await db.pastryPrepTick.deleteMany({ where: { taskId, day } })
  }
  refresh()
}

/** Take a task off the list. The row and its past ticks are kept. */
export async function removePrepTask(taskId: string): Promise<void> {
  if (!taskId) return
  await db.pastryPrepTask.updateMany({ where: { id: taskId }, data: { isActive: false } })
  refresh()
}

export async function addPastryNote(params: { venue: SingleVenue; text: string }): Promise<void> {
  const text = cleanText(params.text, MAX_NOTE_LENGTH)
  if (!text) return
  await db.pastryNote.create({ data: { venue: params.venue, text, createdBy: await who() } })
  refresh()
}

export async function setPastryNoteDone(noteId: string, done: boolean): Promise<void> {
  if (!noteId) return
  await db.pastryNote.updateMany({
    where: { id: noteId },
    data: done ? { doneAt: new Date(), doneBy: await who() } : { doneAt: null, doneBy: null },
  })
  refresh()
}

/** Every pastry product for the venue, with its reference photos. */
export async function listPastryGallery(venue: SingleVenue): Promise<GalleryProduct[]> {
  const rows = await db.pastryProduct.findMany({
    where: { isActive: true, venue: { in: [venue, "BOTH"] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { photos: { orderBy: { uploadedAt: "asc" }, select: { id: true, url: true } } },
  })
  return rows.map((r) => ({ id: r.id, name: r.name, note: r.note, inRotation: r.inRotation, photos: r.photos }))
}

/**
 * Add a product to the photo list. It is NOT put on the rotation log:
 * that list is counted every bake and stays as it is.
 */
export async function addGalleryProduct(rawName: string): Promise<{ error?: string }> {
  const name = cleanText(rawName, MAX_PRODUCT_NAME_LENGTH)
  if (!name) return { error: "Type a product name" }
  const existing = await db.pastryProduct.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  })
  if (existing?.isActive) return { error: `${existing.name} is already on the list` }
  if (existing) {
    // A retired product comes back for photos only, never back onto the rotation log.
    await db.pastryProduct.update({ where: { id: existing.id }, data: { isActive: true, inRotation: false } })
  } else {
    const last = await db.pastryProduct.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } })
    await db.pastryProduct.create({
      data: { name, venue: "BOTH", inRotation: false, sortOrder: (last?.sortOrder ?? 0) + 1 },
    })
  }
  refresh()
  return {}
}

/** Hide a product added here by mistake. Rotation products can't be removed from this page. */
export async function removeGalleryProduct(productId: string): Promise<void> {
  await db.pastryProduct.updateMany({ where: { id: productId, inRotation: false }, data: { isActive: false } })
  refresh()
}

export async function savePastryProductNote(productId: string, rawNote: string): Promise<void> {
  const note = cleanText(rawNote, MAX_NOTE_LENGTH)
  await db.pastryProduct.updateMany({ where: { id: productId }, data: { note: note || null } })
  refresh()
}

export async function savePastryProductPhoto(params: {
  productId: string
  url: string
  publicId: string
}): Promise<void> {
  if (!params.productId || !/^https:\/\/res\.cloudinary\.com\//.test(params.url)) return
  await db.pastryProductPhoto.create({
    data: { productId: params.productId, url: params.url, publicId: params.publicId, uploadedBy: await who() },
  })
  refresh()
}

export async function deletePastryProductPhoto(photoId: string): Promise<void> {
  if (!photoId) return
  await db.pastryProductPhoto.deleteMany({ where: { id: photoId } })
  refresh()
}
