"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getPerson, isOwnerSession } from "@/lib/person-session"
import { isManagerRole } from "@/lib/person-auth"
import { pushPublicKey } from "@/lib/gm/push"
import { pastryScanToken } from "@/lib/pastry-orders/intake"
import { PASTRY_ORDERS_PATH } from "@/lib/pastry-orders/push"
import {
  CHANNELS,
  PAYMENTS,
  brisbaneDay,
  brisbaneIso,
  groupCards,
  isCake,
  logId,
  manualOrderNo,
  newOrderPush,
  openLines,
  plain,
  validDay,
  validTime,
  venueName,
  type PastryLine,
  type PastryLogEntry,
} from "@/lib/pastry-orders/shared"
import { sendPastryPush } from "@/lib/pastry-orders/push"

/**
 * Pastry Orders (Shawna, 28 Nov 2026): what staff do on the screen.
 *
 * Every action is one database transaction that changes the order's lines
 * and adds ONE log entry with the name of the person signed in. Nothing is
 * deleted. Cancel, refund and resolve flag (and their undos) are refused
 * here, on the server, unless the person is a manager, supervisor or owner:
 * the app's roles replace the tracker's shared manager PIN.
 */

interface Who {
  id: string
  name: string
  manager: boolean
  owner: boolean
}

async function who(): Promise<Who | null> {
  const p = await getPerson()
  if (p) return { id: p.id, name: p.name, manager: isManagerRole(p.role), owner: p.role === "OWNER" }
  if (await isOwnerSession()) return { id: "office", name: "Office", manager: true, owner: true }
  return null
}

export interface PastryBoard {
  today: string
  lines: PastryLine[]
  log: PastryLogEntry[]
  scanLabel: string | null
  me: { name: string; manager: boolean; owner: boolean }
  /** Past items and cake options, for the order form. */
  suggestions: string[]
  pushKey: string | null
  pushDevices: number
}

type Result = { ok: true } | { ok: false; error: string }

const SIGN_IN = "Sign in first."
const MANAGERS_ONLY = "Only a manager or supervisor can do that. Ask one to sign in."

const CAKE_OPTIONS = [
  "Celebration cake 6in",
  "Celebration cake 8in",
  "Celebration cake 10in",
  "Baked Ricotta Cheesecake",
  "Lemon Butter Cake",
  "Large Seasonal Berry Tarte",
  "Cherry Pie",
]

function refresh() {
  revalidatePath(PASTRY_ORDERS_PATH)
}

function asLine(o: PastryLine & { createdAt?: Date }): PastryLine {
  const { createdAt: _c, ...rest } = o
  void _c
  return rest
}

export async function getPastryBoard(): Promise<PastryBoard> {
  const me = await who()
  if (!me) throw new Error("Sign in first")
  const today = brisbaneDay()
  const [rows, log, scan, past, devices] = await Promise.all([
    db.pastryOrder.findMany({ where: { OR: [{ date: "" }, { date: { gte: today } }] } }),
    db.pastryLog.findMany({ orderBy: { id: "asc" }, take: 600 }),
    db.pastryScan.findUnique({ where: { id: "latest" } }),
    db.pastryOrder.findMany({ select: { item: true }, distinct: ["item"], take: 300, orderBy: { createdAt: "desc" } }),
    db.cakePushSub.count(),
  ])
  const lines = openLines(rows.map(asLine), today)
  const suggestions = [...new Set([...CAKE_OPTIONS, ...past.map((p) => plain(p.item, 200)).filter(Boolean)])].sort((a, b) => a.localeCompare(b))
  return {
    today,
    lines,
    log: log.map(({ createdAt: _c, ...e }) => (void _c, e)),
    scanLabel: scan?.label || null,
    me: { name: me.name, manager: me.manager, owner: me.owner },
    suggestions,
    pushKey: pushPublicKey(),
    pushDevices: devices,
  }
}

/** The lines of one card: an order number on a pickup day. */
async function cardLines(order: string, date: string) {
  if (typeof order !== "string" || !order || typeof date !== "string") return []
  return db.pastryOrder.findMany({ where: { order, date } })
}

async function writeLog(tx: Pick<typeof db, "pastryLog">, me: Who, entry: { order: string; customer: string; action: string; detail: string }) {
  const at = new Date()
  for (let i = 0; i < 5; i++) {
    const id = logId(at.getTime() + i, entry.order)
    if (await tx.pastryLog.findUnique({ where: { id }, select: { id: true } })) continue
    await tx.pastryLog.create({ data: { id, at: brisbaneIso(at), ...entry, by: me.name, byId: me.id } })
    return
  }
  throw new Error("could not write the log entry")
}

const itemsOf = (lines: { qty: number; item: string }[]) => lines.map((l) => `${l.qty} x ${plain(l.item, 80)}`).join(", ")

export async function markPickedUp(order: string, date: string, undo = false): Promise<Result> {
  const me = await who()
  if (!me) return { ok: false, error: SIGN_IN }
  const lines = await cardLines(order, date)
  if (!lines.length) return { ok: false, error: "That order is not there any more." }
  if (!undo && lines.some((l) => l.staffStatus === "cancelled" || l.staffStatus === "refunded")) return { ok: false, error: "That order was cancelled or refunded." }
  const now = brisbaneIso()
  await db.$transaction(async (tx) => {
    await tx.pastryOrder.updateMany({
      where: { order, date },
      data: undo ? { pickedUp: false, pickedUpBy: "", pickedUpAt: "" } : { pickedUp: true, pickedUpBy: me.name, pickedUpAt: now },
    })
    await writeLog(tx, me, { order, customer: lines[0].customer, action: undo ? "Pickup undone" : "Picked up", detail: itemsOf(lines) })
  })
  refresh()
  return { ok: true }
}

const OUTCOME_LOG: Record<string, string> = { notcollected: "Not collected", cancelled: "Cancelled", refunded: "Refunded" }

/** Not collected (anyone), Cancelled or Refunded (managers). `undo` puts the order back. */
export async function setOutcome(order: string, date: string, outcome: string, note: string, undo = false): Promise<Result> {
  const me = await who()
  if (!me) return { ok: false, error: SIGN_IN }
  const lines = await cardLines(order, date)
  if (!lines.length) return { ok: false, error: "That order is not there any more." }
  const current = lines.find((l) => l.staffStatus)?.staffStatus ?? ""
  const kind = undo ? current : outcome
  if (!OUTCOME_LOG[kind]) return { ok: false, error: undo ? "Nothing to undo." : "Unknown step." }
  // Managers only: setting cancelled or refunded, AND touching an order a
  // manager already cancelled or refunded (overwriting it is an undo too).
  const managerOnly = (k: string) => k === "cancelled" || k === "refunded"
  if ((managerOnly(kind) || managerOnly(current)) && !me.manager) return { ok: false, error: MANAGERS_ONLY }
  if (!undo && current && current !== kind) return { ok: false, error: "Undo the current status first." }
  const text = plain(note, 400)
  if (!undo && kind === "notcollected" && !text) return { ok: false, error: "Add a short note." }
  const now = brisbaneIso()
  await db.$transaction(async (tx) => {
    await tx.pastryOrder.updateMany({
      where: { order, date },
      data: undo
        ? { staffStatus: "", staffStatusBy: "", staffStatusAt: "", staffStatusNote: "" }
        : { staffStatus: kind, staffStatusBy: me.name, staffStatusAt: now, staffStatusNote: text },
    })
    await writeLog(tx, me, {
      order,
      customer: lines[0].customer,
      action: undo ? "Restored" : OUTCOME_LOG[kind],
      detail: undo ? `${OUTCOME_LOG[kind]} undone` : text || itemsOf(lines),
    })
  })
  refresh()
  return { ok: true }
}

/** Changed or swapped: the note is required and carries the name. */
export async function saveChangeNote(order: string, date: string, note: string): Promise<Result> {
  const me = await who()
  if (!me) return { ok: false, error: SIGN_IN }
  const text = plain(note, 400)
  if (!text) return { ok: false, error: "Say what changed." }
  const lines = await cardLines(order, date)
  if (!lines.length) return { ok: false, error: "That order is not there any more." }
  await db.$transaction(async (tx) => {
    await tx.pastryOrder.updateMany({ where: { order, date }, data: { changeNote: `${text} (${me.name})` } })
    await writeLog(tx, me, { order, customer: lines[0].customer, action: "Changed", detail: text })
  })
  refresh()
  return { ok: true }
}

/** Managers only. Marks every flagged line of the card resolved, or reopens them. */
export async function resolveFlag(order: string, date: string, note: string, undo = false): Promise<Result> {
  const me = await who()
  if (!me) return { ok: false, error: SIGN_IN }
  if (!me.manager) return { ok: false, error: MANAGERS_ONLY }
  const text = plain(note, 400)
  if (!undo && !text) return { ok: false, error: "Say what was done." }
  const lines = (await cardLines(order, date)).filter((l) => l.flag && l.flagResolved === undo)
  if (!lines.length) return { ok: false, error: undo ? "No resolved flag on that order." : "No open flag on that order." }
  const now = brisbaneIso()
  await db.$transaction(async (tx) => {
    await tx.pastryOrder.updateMany({
      where: { id: { in: lines.map((l) => l.id) } },
      data: undo ? { flagResolved: false, resolvedBy: "", resolvedAt: "", resolvedNote: "" } : { flagResolved: true, resolvedBy: me.name, resolvedAt: now, resolvedNote: text },
    })
    await writeLog(tx, me, { order, customer: lines[0].customer, action: undo ? "Flag reopened" : "Flag resolved", detail: undo ? plain(lines[0].flag, 300) : text })
  })
  refresh()
  return { ok: true }
}

export interface ManualOrderInput {
  customer: string
  contact?: string
  venue: string
  channel: string
  date: string
  time?: string
  items: { item: string; qty: number | string }[]
  notes?: string
  payment: string
}

/** Add an order (in store, phone, custom). Taken by = the person signed in. */
export async function addManualOrder(input: ManualOrderInput): Promise<Result & { order?: string }> {
  const me = await who()
  if (!me) return { ok: false, error: SIGN_IN }
  const customer = plain(input.customer, 120)
  if (!customer) return { ok: false, error: "Add the customer's name." }
  const venue = venueName(input.venue)
  if (!venue) return { ok: false, error: "Pick the venue." }
  const date = validDay(input.date)
  if (!date) return { ok: false, error: "Pick the pickup date." }
  if (date < brisbaneDay()) return { ok: false, error: "That pickup date has passed." }
  const payment = (PAYMENTS as readonly string[]).includes(input.payment) ? input.payment : ""
  if (!payment) return { ok: false, error: "Pick how it is being paid." }
  const channel = (CHANNELS as readonly string[]).includes(input.channel) ? input.channel : "In store"
  const items = (Array.isArray(input.items) ? input.items : [])
    .map((i) => ({ item: plain(i?.item, 200), qty: Math.min(Math.max(Math.round(Number(i?.qty)) || 1, 1), 500) }))
    .filter((i) => i.item)
    .slice(0, 6)
  if (!items.length) return { ok: false, error: "Add at least one item." }
  const time = validTime(input.time)
  const notes = plain(input.notes, 600)
  const contact = plain(input.contact, 200)
  const now = brisbaneIso()

  let order = ""
  for (let i = 0; i < 6 && !order; i++) {
    const tryNo = manualOrderNo()
    if (!(await db.pastryOrder.findFirst({ where: { order: tryNo }, select: { id: true } }))) order = tryNo
  }
  if (!order) return { ok: false, error: "Could not make an order number. Try again." }

  const rows: PastryLine[] = items.map((it, n) => ({
    id: `${order}-${n + 1}`,
    order,
    customer,
    venue,
    date,
    time,
    item: it.item,
    qty: it.qty,
    price: 0,
    contact,
    notes: n === 0 ? notes : "",
    flag: "",
    flagKind: "",
    status: "active",
    source: "Manual",
    channel,
    payment,
    takenBy: me.name,
    staffStatus: "",
    staffStatusBy: "",
    staffStatusAt: "",
    staffStatusNote: "",
    changeNote: "",
    pickedUp: false,
    pickedUpBy: "",
    pickedUpAt: "",
    flagResolved: false,
    resolvedBy: "",
    resolvedAt: "",
    resolvedNote: "",
    updatedAt: now,
  }))
  await db.$transaction(async (tx) => {
    await tx.pastryOrder.createMany({ data: rows })
    await writeLog(tx, me, {
      order,
      customer,
      action: "Added",
      detail: `${channel} order for ${venue}, ${date}${time ? ` ${time}` : ""}: ${itemsOf(rows)}. ${payment}.`,
    })
  })
  const card = groupCards(rows)[0]
  const text = newOrderPush(card, brisbaneDay())
  await sendPastryPush(text.title, `${text.body} Added by ${me.name}.`, `${PASTRY_ORDERS_PATH}?q=${order}`).catch(() => undefined)
  refresh()
  return { ok: true, order }
}

/**
 * Owners only: the address and token Shawna's inbox scan posts to, for the
 * Scan connection panel. Never sent to anyone else's browser.
 */
export async function getScanConnection(): Promise<{ ok: true; url: string; token: string } | { ok: false; error: string }> {
  const me = await who()
  if (!me) return { ok: false, error: SIGN_IN }
  if (!me.owner) return { ok: false, error: "Owners only." }
  const token = pastryScanToken()
  if (!token) return { ok: false, error: "The app has no signing secret set." }
  return { ok: true, url: "https://kitchen.tarte.com.au/api/internal/pastry-orders", token }
}

/** For the Pastry hub link. */
export async function getPastryOrdersSummary(): Promise<{ today: number; attention: number; cakes: number }> {
  if (!(await who())) throw new Error("Sign in first")
  const today = brisbaneDay()
  const rows = await db.pastryOrder.findMany({ where: { OR: [{ date: "" }, { date: { gte: today } }] } })
  const cards = groupCards(openLines(rows.map(asLine), today)).filter((c) => !c.dead)
  return {
    today: cards.filter((c) => c.date === today).length,
    attention: cards.filter((c) => c.state === "attention").length,
    cakes: cards.filter((c) => c.lines.some((l) => isCake(l.item))).length,
  }
}
