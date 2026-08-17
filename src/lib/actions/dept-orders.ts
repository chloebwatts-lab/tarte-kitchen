"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import type { OrderDept, Venue } from "@/generated/prisma/client"
import { ORDER_DEPTS, DEPT_LABEL, deptForItem } from "@/lib/departments"
import { submitOrder, sendOrderEmail } from "@/lib/actions/orders"
import { findOrCreateTodayDraftOrder } from "@/lib/actions/order-checklist"

// ------------------------------------------------------------------
// Department ordering.
//
//   1. Each department has its own order form in staff tools, holding only
//      that department's items across every supplier. Anyone on the section
//      can add quantities through the day; it saves as they go.
//   2. At close the department head reviews and approves (or taps "nothing
//      needed today" for an empty day).
//   3. Once every active department at the venue is in, the end-of-day sheet
//      regroups all approved lines BY SUPPLIER and sends one order each, so
//      Bidfood gets a single order covering four departments, not four
//      emails. Sending reuses the existing PurchaseOrder + Gmail flow.
// ------------------------------------------------------------------

function todayAest(): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  aest.setUTCHours(0, 0, 0, 0)
  return new Date(aest.toISOString().split("T")[0])
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type DeptCard = {
  dept: OrderDept
  ownerName: string | null
  /** Items on this department's forms across all suppliers. */
  itemCount: number
  /** Lines with a quantity on today's request. */
  requestedLines: number
  total: number
  status: "NOT_STARTED" | "OPEN" | "APPROVED"
  approvedBy: string | null
  approvedAt: string | null
}

export type DeptHub = {
  venue: Venue
  dateLabel: string
  depts: DeptCard[]
  /** True once every active department has approved today. */
  allIn: boolean
  /** Suppliers with at least one approved line waiting to be sent. */
  suppliersWaiting: number
  suppliersSent: number
}

export type DeptFormRow = {
  approvedItemId: string
  name: string
  packSize: string | null
  packPrice: number
  unit: string | null
  category: string | null
  supplierId: string
  supplierName: string
  quantity: number | null
  note: string | null
  enteredBy: string | null
  /** Set once the line has gone out on an order, locks the row. */
  orderedAt: string | null
}

export type DeptForm = {
  venue: Venue
  dept: OrderDept
  ownerName: string | null
  requestId: string | null
  status: "NOT_STARTED" | "OPEN" | "APPROVED"
  approvedBy: string | null
  notes: string | null
  rows: DeptFormRow[]
}

export type EodSupplierLine = {
  approvedItemId: string
  name: string
  packSize: string | null
  packPrice: number
  quantity: number
  lineTotal: number
  /** Which departments asked, and how much each wanted. */
  contributions: Array<{ dept: OrderDept; quantity: number; by: string | null; note: string | null }>
}

export type EodSupplierOrder = {
  supplierId: string
  supplierName: string
  supplierEmail: string | null
  deliveryDays: number[]
  orderCutoffHour: number | null
  lines: EodSupplierLine[]
  total: number
  depts: OrderDept[]
  /** Set once this supplier's order has been sent today. */
  sent: { orderId: string; at: string; by: string | null; emailed: boolean } | null
}

export type EodSheet = {
  venue: Venue
  dateLabel: string
  /** Departments that haven't approved yet, blocking the send. */
  waitingOn: Array<{ dept: OrderDept; ownerName: string | null }>
  suppliers: EodSupplierOrder[]
  grandTotal: number
}

// ─── Shared loaders ─────────────────────────────────────────────────────────

async function activeDepts(venue: Venue) {
  const owners = await db.deptOrderOwner.findMany({ where: { venue } })
  const byDept = new Map(owners.map((o) => [o.dept, o]))
  return ORDER_DEPTS.filter((d) => byDept.get(d)?.active !== false).map((d) => ({
    dept: d,
    ownerName: byDept.get(d)?.ownerName ?? null,
  }))
}

/**
 * Every active approved item, tagged with the department that orders it.
 * Explicit `dept` wins; otherwise the category default keeps brand-new
 * items on somebody's form instead of nowhere.
 */
async function itemsByDept() {
  const items = await db.approvedSupplierItem.findMany({
    where: { active: true },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  })
  return items.map((it) => ({ ...it, resolvedDept: deptForItem(it) }))
}

function dateLabel(d: Date) {
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

// ─── Hub: one card per department ───────────────────────────────────────────

export async function getDeptOrderHub(venue: Venue): Promise<DeptHub> {
  const date = todayAest()
  const [depts, items, requests] = await Promise.all([
    activeDepts(venue),
    itemsByDept(),
    db.deptOrderRequest.findMany({
      where: { venue, requestDate: date },
      include: { lines: { include: { item: { select: { packPrice: true } } } } },
    }),
  ])

  const reqByDept = new Map(requests.map((r) => [r.dept, r]))
  const itemCounts = new Map<OrderDept, number>()
  for (const it of items) {
    itemCounts.set(it.resolvedDept, (itemCounts.get(it.resolvedDept) ?? 0) + 1)
  }

  const cards: DeptCard[] = depts.map(({ dept, ownerName }) => {
    const req = reqByDept.get(dept)
    const lines = req?.lines ?? []
    return {
      dept,
      ownerName,
      itemCount: itemCounts.get(dept) ?? 0,
      requestedLines: lines.length,
      total: lines.reduce(
        (s, l) => s + Number(l.quantity) * Number(l.item.packPrice),
        0
      ),
      status: !req ? "NOT_STARTED" : req.status === "APPROVED" ? "APPROVED" : "OPEN",
      approvedBy: req?.approvedBy ?? null,
      approvedAt: req?.approvedAt?.toISOString() ?? null,
    }
  })

  const allIn = cards.length > 0 && cards.every((c) => c.status === "APPROVED")

  // Suppliers touched by today's approved lines, split by sent/unsent.
  const approvedLines = requests
    .filter((r) => r.status === "APPROVED")
    .flatMap((r) => r.lines)
  const itemById = new Map(items.map((i) => [i.id, i]))
  const waiting = new Set<string>()
  const sent = new Set<string>()
  for (const l of approvedLines) {
    const sup = itemById.get(l.approvedItemId)?.supplier.id
    if (!sup) continue
    if (l.orderedAt) sent.add(sup)
    else waiting.add(sup)
  }

  return {
    venue,
    dateLabel: dateLabel(date),
    depts: cards,
    allIn,
    suppliersWaiting: waiting.size,
    suppliersSent: sent.size,
  }
}

// ─── The department's own form ──────────────────────────────────────────────

export async function getDeptForm(params: {
  venue: Venue
  dept: OrderDept
}): Promise<DeptForm> {
  const { venue, dept } = params
  const date = todayAest()

  const [owner, items, request] = await Promise.all([
    db.deptOrderOwner.findUnique({
      where: { venue_dept: { venue, dept } },
      select: { ownerName: true },
    }),
    itemsByDept(),
    db.deptOrderRequest.findUnique({
      where: { venue_dept_requestDate: { venue, dept, requestDate: date } },
      include: { lines: true },
    }),
  ])

  const lineByItem = new Map((request?.lines ?? []).map((l) => [l.approvedItemId, l]))

  const rows: DeptFormRow[] = items
    .filter((it) => it.resolvedDept === dept)
    .map((it) => {
      const line = lineByItem.get(it.id)
      return {
        approvedItemId: it.id,
        name: it.name,
        packSize: it.packSize,
        packPrice: Number(it.packPrice),
        unit: it.unit,
        category: it.category,
        supplierId: it.supplier.id,
        supplierName: it.supplier.name,
        quantity: line ? Number(line.quantity) : null,
        note: line?.note ?? null,
        enteredBy: line?.enteredBy ?? null,
        orderedAt: line?.orderedAt?.toISOString() ?? null,
      }
    })

  return {
    venue,
    dept,
    ownerName: owner?.ownerName ?? null,
    requestId: request?.id ?? null,
    status: !request ? "NOT_STARTED" : request.status === "APPROVED" ? "APPROVED" : "OPEN",
    approvedBy: request?.approvedBy ?? null,
    notes: request?.notes ?? null,
    rows,
  }
}

/** Create today's request lazily, the first time anyone enters something. */
async function findOrCreateRequest(venue: Venue, dept: OrderDept) {
  const requestDate = todayAest()
  const existing = await db.deptOrderRequest.findUnique({
    where: { venue_dept_requestDate: { venue, dept, requestDate } },
  })
  if (existing) return existing
  return db.deptOrderRequest.create({ data: { venue, dept, requestDate } })
}

export async function saveDeptLine(params: {
  venue: Venue
  dept: OrderDept
  approvedItemId: string
  /** 0 or null removes the line. */
  quantity: number | null
  note?: string | null
  enteredBy?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const { venue, dept, approvedItemId, quantity } = params

  const item = await db.approvedSupplierItem.findUnique({
    where: { id: approvedItemId },
    select: { id: true, name: true, category: true, dept: true },
  })
  if (!item) return { ok: false, error: "Item not found" }
  // Never let one department write onto another's form.
  if (deptForItem(item) !== dept)
    return { ok: false, error: `${item.name} isn't a ${DEPT_LABEL[dept]} item` }

  const request = await findOrCreateRequest(venue, dept)
  if (request.status === "APPROVED")
    return { ok: false, error: "Already approved. Reopen it to make changes." }

  const existing = await db.deptOrderLine.findUnique({
    where: { requestId_approvedItemId: { requestId: request.id, approvedItemId } },
  })
  // A line that's already gone out on an order is frozen.
  if (existing?.orderedAt)
    return { ok: false, error: "That one's already been ordered today" }

  if (!quantity || quantity <= 0) {
    if (existing) await db.deptOrderLine.delete({ where: { id: existing.id } })
  } else if (existing) {
    await db.deptOrderLine.update({
      where: { id: existing.id },
      data: {
        quantity: new Decimal(quantity),
        note: params.note !== undefined ? params.note : existing.note,
        enteredBy: params.enteredBy ?? existing.enteredBy,
      },
    })
  } else {
    await db.deptOrderLine.create({
      data: {
        requestId: request.id,
        approvedItemId,
        quantity: new Decimal(quantity),
        note: params.note ?? null,
        enteredBy: params.enteredBy ?? null,
      },
    })
  }

  revalidatePath("/kitchen/order")
  return { ok: true }
}

export async function approveDeptRequest(params: {
  venue: Venue
  dept: OrderDept
  approvedBy: string
  notes?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const name = params.approvedBy.trim()
  if (!name) return { ok: false, error: "Put your name in first" }

  const request = await findOrCreateRequest(params.venue, params.dept)
  await db.deptOrderRequest.update({
    where: { id: request.id },
    data: {
      status: "APPROVED",
      approvedBy: name,
      approvedAt: new Date(),
      notes: params.notes ?? request.notes,
    },
  })

  revalidatePath("/kitchen/order")
  revalidatePath("/kitchen/order/sheet")
  return { ok: true }
}

export async function reopenDeptRequest(params: {
  venue: Venue
  dept: OrderDept
}): Promise<{ ok: boolean; error?: string }> {
  const requestDate = todayAest()
  const request = await db.deptOrderRequest.findUnique({
    where: {
      venue_dept_requestDate: {
        venue: params.venue,
        dept: params.dept,
        requestDate,
      },
    },
    include: { lines: { select: { orderedAt: true } } },
  })
  if (!request) return { ok: false, error: "Nothing to reopen" }
  // Reopening after the order has gone is misleading: the supplier already
  // has it. Add-ons go on a fresh order instead.
  if (request.lines.some((l) => l.orderedAt))
    return {
      ok: false,
      error: "Part of this has already been ordered. Add anything extra as a new line.",
    }

  await db.deptOrderRequest.update({
    where: { id: request.id },
    data: { status: "OPEN", approvedBy: null, approvedAt: null },
  })
  revalidatePath("/kitchen/order")
  revalidatePath("/kitchen/order/sheet")
  return { ok: true }
}

// ─── End-of-day sheet, regrouped by supplier ────────────────────────────────

export async function getEodSheet(venue: Venue): Promise<EodSheet> {
  const date = todayAest()
  const [depts, items, requests] = await Promise.all([
    activeDepts(venue),
    itemsByDept(),
    db.deptOrderRequest.findMany({
      where: { venue, requestDate: date },
      include: { lines: true },
    }),
  ])

  const reqByDept = new Map(requests.map((r) => [r.dept, r]))
  const waitingOn = depts
    .filter(({ dept }) => reqByDept.get(dept)?.status !== "APPROVED")
    .map(({ dept, ownerName }) => ({ dept, ownerName }))

  const itemById = new Map(items.map((i) => [i.id, i]))

  // Merge approved lines across departments, keyed by supplier + item.
  type Bucket = Omit<EodSupplierLine, "quantity" | "lineTotal"> & {
    quantity: number
  }
  const bySupplier = new Map<
    string,
    { name: string; email: string | null; lines: Map<string, Bucket> }
  >()

  for (const req of requests) {
    if (req.status !== "APPROVED") continue
    for (const line of req.lines) {
      const item = itemById.get(line.approvedItemId)
      if (!item) continue
      // Sent lines stay visible on the sent order, not the pending list.
      if (line.orderedAt) continue
      const sup =
        bySupplier.get(item.supplier.id) ??
        {
          name: item.supplier.name,
          email: null as string | null,
          lines: new Map<string, Bucket>(),
        }
      const bucket =
        sup.lines.get(item.id) ??
        {
          approvedItemId: item.id,
          name: item.name,
          packSize: item.packSize,
          packPrice: Number(item.packPrice),
          quantity: 0,
          contributions: [],
        }
      bucket.quantity += Number(line.quantity)
      bucket.contributions.push({
        dept: req.dept,
        quantity: Number(line.quantity),
        by: line.enteredBy,
        note: line.note,
      })
      sup.lines.set(item.id, bucket)
      bySupplier.set(item.supplier.id, sup)
    }
  }

  const supplierIds = [...bySupplier.keys()]
  const [supplierRows, sentOrders] = await Promise.all([
    supplierIds.length
      ? db.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: {
            id: true,
            name: true,
            email: true,
            deliveryDays: true,
            orderCutoffHour: true,
          },
        })
      : Promise.resolve([]),
    // Today's orders that came out of department requests, so the sheet can
    // show "sent 5:40pm" instead of offering to send it twice.
    db.purchaseOrder.findMany({
      where: {
        venue,
        orderDate: date,
        deptOrderLines: { some: {} },
      },
      select: {
        id: true,
        supplierId: true,
        submittedAt: true,
        submittedBy: true,
        emailSentAt: true,
        subtotal: true,
        supplier: { select: { name: true, email: true, deliveryDays: true, orderCutoffHour: true } },
      },
    }),
  ])
  const supById = new Map(supplierRows.map((s) => [s.id, s]))

  const suppliers: EodSupplierOrder[] = supplierIds
    .map((id) => {
      const sup = bySupplier.get(id)!
      const meta = supById.get(id)
      const lines: EodSupplierLine[] = [...sup.lines.values()]
        .map((b) => ({
          ...b,
          lineTotal: Math.round(b.quantity * b.packPrice * 100) / 100,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const deptsHere = [
        ...new Set(lines.flatMap((l) => l.contributions.map((c) => c.dept))),
      ]
      return {
        supplierId: id,
        supplierName: meta?.name ?? sup.name,
        supplierEmail: meta?.email ?? null,
        deliveryDays: meta?.deliveryDays ?? [],
        orderCutoffHour: meta?.orderCutoffHour ?? null,
        lines,
        total: Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100,
        depts: deptsHere,
        sent: null,
      }
    })
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName))

  // Already-sent suppliers appear as read-only cards underneath.
  for (const o of sentOrders) {
    if (!o.submittedAt) continue
    suppliers.push({
      supplierId: o.supplierId,
      supplierName: o.supplier.name,
      supplierEmail: o.supplier.email,
      deliveryDays: o.supplier.deliveryDays,
      orderCutoffHour: o.supplier.orderCutoffHour,
      lines: [],
      total: Number(o.subtotal),
      depts: [],
      sent: {
        orderId: o.id,
        at: o.submittedAt.toISOString(),
        by: o.submittedBy,
        emailed: o.emailSentAt != null,
      },
    })
  }

  return {
    venue,
    dateLabel: dateLabel(date),
    waitingOn,
    suppliers,
    grandTotal:
      Math.round(
        suppliers.filter((s) => !s.sent).reduce((s, x) => s + x.total, 0) * 100
      ) / 100,
  }
}

/**
 * Turn one supplier's approved department lines into a purchase order and
 * send it. Lines are stamped so they can't go out on a second order.
 *
 * `force` skips the "every department is in" gate, for when a section has
 * gone home without approving and the supplier cutoff is now.
 */
export async function sendSupplierOrder(params: {
  venue: Venue
  supplierId: string
  by: string
  force?: boolean
}): Promise<{ ok: boolean; error?: string; emailed?: boolean; to?: string | null }> {
  const by = params.by.trim()
  if (!by) return { ok: false, error: "Put your name in first" }

  const sheet = await getEodSheet(params.venue)
  if (sheet.waitingOn.length > 0 && !params.force) {
    const names = sheet.waitingOn.map((w) => DEPT_LABEL[w.dept]).join(", ")
    return { ok: false, error: `Still waiting on ${names}` }
  }

  const supplier = sheet.suppliers.find(
    (s) => s.supplierId === params.supplierId && !s.sent
  )
  if (!supplier || supplier.lines.length === 0)
    return { ok: false, error: "Nothing to send for that supplier" }

  const orderId = await findOrCreateTodayDraftOrder(params.supplierId, params.venue)

  const date = todayAest()
  const lineRows = await db.deptOrderLine.findMany({
    where: {
      orderedAt: null,
      request: { venue: params.venue, requestDate: date, status: "APPROVED" },
      item: { supplierId: params.supplierId },
    },
    include: { item: true },
  })
  if (lineRows.length === 0)
    return { ok: false, error: "Nothing to send for that supplier" }

  // Merge to one PO line per item, then upsert by the same description
  // format the admin order form writes, so a line the orderer already
  // ticked in admin is updated rather than duplicated.
  const merged = new Map<string, { item: (typeof lineRows)[number]["item"]; qty: number }>()
  for (const l of lineRows) {
    const cur = merged.get(l.approvedItemId)
    if (cur) cur.qty += Number(l.quantity)
    else merged.set(l.approvedItemId, { item: l.item, qty: Number(l.quantity) })
  }

  for (const { item, qty } of merged.values()) {
    const description = item.packSize ? `${item.name} (${item.packSize})` : item.name
    const packPrice = Number(item.packPrice)
    const existing = await db.purchaseOrderLine.findFirst({
      where: { orderId, description },
    })
    const data = {
      quantity: new Decimal(qty),
      unit: "pack",
      unitPrice: new Decimal(packPrice),
      lineTotal: new Decimal(Math.round(packPrice * qty * 100) / 100),
      description,
      ingredientId: item.ingredientId,
    }
    if (existing) {
      await db.purchaseOrderLine.update({ where: { id: existing.id }, data })
    } else {
      await db.purchaseOrderLine.create({ data: { orderId, ...data } })
    }
  }

  const lines = await db.purchaseOrderLine.findMany({
    where: { orderId },
    select: { lineTotal: true },
  })
  await db.purchaseOrder.update({
    where: { id: orderId },
    data: {
      subtotal: new Decimal(lines.reduce((s, l) => s + Number(l.lineTotal), 0)),
    },
  })

  // Stamp the department lines BEFORE submitting. If something falls over
  // between the two, this order is left to finish in admin — where the other
  // order leaves the lines unstamped and free to go out on a second order.
  // A duplicate delivery costs money; an order needing one more click doesn't.
  await db.deptOrderLine.updateMany({
    where: { id: { in: lineRows.map((l) => l.id) } },
    data: { purchaseOrderId: orderId, orderedAt: new Date() },
  })

  await submitOrder({ orderId, by })

  let emailed = false
  let to: string | null = null
  try {
    const res = await sendOrderEmail({ orderId })
    emailed = true
    to = res.to
  } catch {
    emailed = false
  }

  revalidatePath("/kitchen/order")
  revalidatePath("/kitchen/order/sheet")
  revalidatePath("/orders")
  return { ok: true, emailed, to }
}

// ─── Admin: owners and item assignment ──────────────────────────────────────

export async function listDeptOwners(): Promise<
  Array<{ venue: Venue; dept: OrderDept; ownerName: string | null; active: boolean }>
> {
  const rows = await db.deptOrderOwner.findMany({
    orderBy: [{ venue: "asc" }, { dept: "asc" }],
  })
  return rows.map((r) => ({
    venue: r.venue,
    dept: r.dept,
    ownerName: r.ownerName,
    active: r.active,
  }))
}

export async function setDeptOwner(params: {
  venue: Venue
  dept: OrderDept
  ownerName: string | null
  active?: boolean
}): Promise<{ ok: boolean }> {
  const { venue, dept } = params
  const ownerName = params.ownerName?.trim() || null
  await db.deptOrderOwner.upsert({
    where: { venue_dept: { venue, dept } },
    create: { venue, dept, ownerName, active: params.active ?? true },
    update: {
      ownerName,
      ...(params.active !== undefined ? { active: params.active } : {}),
    },
  })
  revalidatePath("/order-departments")
  revalidatePath("/kitchen/order")
  return { ok: true }
}

export async function setItemDept(params: {
  approvedItemId: string
  /** Null clears the override and falls back to the category default. */
  dept: OrderDept | null
}): Promise<{ ok: boolean }> {
  await db.approvedSupplierItem.update({
    where: { id: params.approvedItemId },
    data: { dept: params.dept },
  })
  revalidatePath("/order-departments")
  revalidatePath("/kitchen/order")
  return { ok: true }
}

export type DeptAssignmentRow = {
  id: string
  name: string
  packSize: string | null
  category: string | null
  supplierName: string
  /** Explicit override, null when it's running on the category default. */
  dept: OrderDept | null
  resolvedDept: OrderDept
}

export async function listDeptAssignments(): Promise<DeptAssignmentRow[]> {
  const items = await itemsByDept()
  return items.map((it) => ({
    id: it.id,
    name: it.name,
    packSize: it.packSize,
    category: it.category,
    supplierName: it.supplier.name,
    dept: it.dept,
    resolvedDept: it.resolvedDept,
  }))
}
