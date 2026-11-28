"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getPerson } from "@/lib/person-session"
import type { CakeOrder } from "@/generated/prisma/client"
import {
  MAX_LONG,
  MAX_SHORT,
  brisbaneDay,
  changedAlert,
  clean,
  cleanDay,
  cleanQty,
  cleanTime,
  daysBetween,
  isCakeStatus,
  isCakeVenue,
  isShortNotice,
  newOrderAlert,
  type CakeStatus,
  type CakeVenue,
} from "@/lib/cakes/shared"
import { toAlertOrder } from "@/lib/cakes/import"
import { CAKES_PATH, sendCakePush } from "@/lib/cakes/push"
import { pushPublicKey } from "@/lib/gm/push"

export interface CakeOrderRow {
  id: string
  venue: CakeVenue
  pickupDate: string | null
  pickupTime: string | null
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  product: string
  details: string | null
  quantity: number
  message: string | null
  dietary: string | null
  notes: string | null
  paid: boolean
  source: "WEBSITE" | "STAFF"
  orderRef: string | null
  checkNote: string | null
  status: CakeStatus
  statusBy: string | null
  statusAt: string | null
  createdBy: string | null
  updatedBy: string | null
  orderedDay: string
  shortNotice: boolean
}

export interface CakeBoard {
  today: string
  orders: CakeOrderRow[]
  products: string[]
  pushKey: string | null
  pushDevices: number
}

export interface CakeOrderInput {
  venue: string
  pickupDate: string
  pickupTime?: string | null
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  product: string
  details?: string | null
  quantity?: number | string
  message?: string | null
  dietary?: string | null
  notes?: string | null
  paid?: boolean
}

type Result = { ok: true; id?: string } | { ok: false; error: string }

/** The cakes and pies the website sells, so the box suggests them before any order exists. */
const KNOWN_PRODUCTS = [
  "Tarte Signature Celebration Cake",
  "Lemon Butter Cake",
  "Baked Ricotta Cheesecake",
  "Large Seasonal Berry Tarte",
  "Cherry Pie",
  "Mini Cherry Pie - 5 Pack",
  "Gingerbread House",
  "Christmas Tree",
]

function toRow(o: CakeOrder): CakeOrderRow {
  const pickupDate = o.pickupDate ? o.pickupDate.toISOString().slice(0, 10) : null
  const orderedDay = brisbaneDay(o.orderedAt)
  return {
    id: o.id,
    venue: (o.venue === "BOTH" ? "BURLEIGH" : o.venue) as CakeVenue,
    pickupDate,
    pickupTime: o.pickupTime,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    product: o.product,
    details: o.details,
    quantity: o.quantity,
    message: o.message,
    dietary: o.dietary,
    notes: o.notes,
    paid: o.paid,
    source: o.source,
    orderRef: o.orderRef,
    checkNote: o.checkNote,
    status: o.status,
    statusBy: o.statusBy,
    statusAt: o.statusAt ? o.statusAt.toISOString() : null,
    createdBy: o.createdBy,
    updatedBy: o.updatedBy,
    orderedDay,
    shortNotice: isShortNotice(orderedDay, pickupDate),
  }
}

const dayDate = (d: string) => new Date(`${d}T00:00:00.000Z`)

async function signedIn(): Promise<string> {
  const p = await getPerson()
  if (!p) throw new Error("Sign in first")
  return p.name
}

function refresh() {
  revalidatePath(CAKES_PATH)
  revalidatePath("/kitchen/pastry")
}

/** Upcoming (and anything left open from the last 30 days), or the last 60 days of past pickups. */
export async function getCakeBoard(view: "upcoming" | "past" = "upcoming"): Promise<CakeBoard> {
  await signedIn()
  const today = brisbaneDay()
  const where =
    view === "past"
      ? { pickupDate: { lt: dayDate(today), gte: dayDate(brisbaneDay(new Date(), -60)) } }
      : { OR: [{ pickupDate: null }, { pickupDate: { gte: dayDate(brisbaneDay(new Date(), -30)) } }] }
  const [rows, recent, devices] = await Promise.all([
    db.cakeOrder.findMany({ where, orderBy: [{ pickupDate: view === "past" ? "desc" : "asc" }, { pickupTime: "asc" }, { sourceRef: "asc" }], take: 400 }),
    db.cakeOrder.findMany({ where: { createdAt: { gte: new Date(Date.now() - 120 * 86_400_000) } }, select: { product: true }, distinct: ["product"], take: 80 }),
    db.cakePushSub.count(),
  ])
  const products = [...new Set([...KNOWN_PRODUCTS, ...recent.map((r) => r.product)])].sort((a, b) => a.localeCompare(b))
  return { today, orders: rows.map(toRow), products, pushKey: pushPublicKey(), pushDevices: devices }
}

/** For the Pastry hub tile. */
export async function getCakeSummary(): Promise<{ today: number; nextWeek: number; unopened: number; needsCheck: number }> {
  const today = brisbaneDay()
  const live = await db.cakeOrder.findMany({
    where: {
      status: { notIn: ["CANCELLED", "COLLECTED"] },
      OR: [{ pickupDate: null }, { pickupDate: { gte: dayDate(today) } }],
    },
    select: { pickupDate: true, status: true, checkNote: true },
  })
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  return {
    today: live.filter((o) => day(o.pickupDate) === today).length,
    nextWeek: live.filter((o) => {
      const d = day(o.pickupDate)
      return d !== null && daysBetween(today, d) <= 7
    }).length,
    unopened: live.filter((o) => o.status === "NEW").length,
    needsCheck: live.filter((o) => !o.pickupDate || o.checkNote).length,
  }
}

function readInput(input: CakeOrderInput): { ok: false; error: string } | { ok: true; data: Omit<Parameters<typeof db.cakeOrder.create>[0]["data"], "createdBy"> } {
  const venue = input.venue
  if (!isCakeVenue(venue)) return { ok: false, error: "Pick where it is picked up." }
  const pickupDate = cleanDay(input.pickupDate)
  if (!pickupDate) return { ok: false, error: "Pick the pickup date." }
  const customerName = clean(input.customerName, MAX_SHORT)
  if (!customerName) return { ok: false, error: "Add the customer's name." }
  const product = clean(input.product, MAX_SHORT)
  if (!product) return { ok: false, error: "Say what they ordered." }
  return {
    ok: true,
    data: {
      venue,
      pickupDate: dayDate(pickupDate),
      pickupTime: cleanTime(input.pickupTime),
      customerName,
      customerEmail: clean(input.customerEmail, MAX_SHORT)?.toLowerCase() ?? null,
      customerPhone: clean(input.customerPhone, 40),
      product,
      details: clean(input.details, MAX_SHORT * 2),
      quantity: cleanQty(input.quantity),
      message: clean(input.message, MAX_SHORT),
      dietary: clean(input.dietary, MAX_SHORT * 2),
      notes: clean(input.notes, MAX_LONG, true),
      paid: !!input.paid,
    },
  }
}

const ALERT_FIELDS = ["venue", "pickupDate", "pickupTime", "product", "details", "quantity", "message", "dietary"] as const

export async function saveCakeOrder(input: CakeOrderInput, id?: string): Promise<Result> {
  let who: string
  try {
    who = await signedIn()
  } catch {
    return { ok: false, error: "Sign in first." }
  }
  const parsed = readInput(input)
  if (!parsed.ok) return parsed
  const today = brisbaneDay()

  if (!id) {
    const made = await db.cakeOrder.create({ data: { ...parsed.data, source: "STAFF", createdBy: who, updatedBy: who } })
    const alert = newOrderAlert([toAlertOrder(made)], today)
    await sendCakePush(alert.title, `${alert.body} Added by ${who}.`, `${CAKES_PATH}?open=${made.id}`).catch(() => undefined)
    refresh()
    return { ok: true, id: made.id }
  }

  const before = await db.cakeOrder.findUnique({ where: { id } })
  if (!before) return { ok: false, error: "That order is not there any more." }
  const after = await db.cakeOrder.update({
    where: { id },
    // A person has looked at it and saved: the import's "check this" note has done its job.
    data: { ...parsed.data, checkNote: null, updatedBy: who },
  })
  const changed = ALERT_FIELDS.some((k) => String(before[k] ?? "") !== String(after[k] ?? ""))
  if (changed && before.status !== "NEW" && after.status !== "CANCELLED" && after.status !== "COLLECTED") {
    const alert = changedAlert(toAlertOrder(after), today, false)
    await sendCakePush(alert.title, `${alert.body} Changed by ${who}.`, `${CAKES_PATH}?open=${id}`).catch(() => undefined)
  }
  refresh()
  return { ok: true, id }
}

export async function setCakeOrderStatus(id: string, status: string): Promise<Result> {
  let who: string
  try {
    who = await signedIn()
  } catch {
    return { ok: false, error: "Sign in first." }
  }
  if (!isCakeStatus(status)) return { ok: false, error: "Unknown step." }
  const before = await db.cakeOrder.findUnique({ where: { id } })
  if (!before) return { ok: false, error: "That order is not there any more." }
  const after = await db.cakeOrder.update({ where: { id }, data: { status, statusBy: who, statusAt: new Date() } })
  if (status === "CANCELLED" && before.status !== "CANCELLED") {
    const alert = changedAlert(toAlertOrder(after), brisbaneDay(), true)
    await sendCakePush(alert.title, `${alert.body} Cancelled by ${who}.`).catch(() => undefined)
  }
  refresh()
  return { ok: true, id }
}

/** "Got it" on every new item of one website order in one tap. */
export async function markOrderSeen(orderRef: string): Promise<Result> {
  let who: string
  try {
    who = await signedIn()
  } catch {
    return { ok: false, error: "Sign in first." }
  }
  await db.cakeOrder.updateMany({ where: { orderRef, status: "NEW" }, data: { status: "SEEN", statusBy: who, statusAt: new Date() } })
  refresh()
  return { ok: true }
}

export async function saveCakePush(sub: { endpoint: string; p256dh: string; auth: string; label?: string }): Promise<Result> {
  let who: string
  try {
    who = await signedIn()
  } catch {
    return { ok: false, error: "Sign in first." }
  }
  if (!/^https:\/\//.test(sub.endpoint) || !sub.p256dh || !sub.auth) return { ok: false, error: "That device did not give a push address." }
  await db.cakePushSub.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, label: clean(sub.label, 40), person: who },
    update: { p256dh: sub.p256dh, auth: sub.auth, label: clean(sub.label, 40), person: who },
  })
  await sendCakePush("Cake order alerts are on", "New cake orders, changes and the 6am list will show here.", CAKES_PATH, sub.endpoint).catch(() => undefined)
  refresh()
  return { ok: true }
}
