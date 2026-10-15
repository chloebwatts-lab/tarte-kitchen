import type { OrderDept, Venue } from "@/generated/prisma/client"
import { APP_URL, button, list, para, shell, type ListItem } from "@/lib/email/brand"
import { DEPT_LABEL } from "@/lib/departments"
import { VENUE_SHORT_LABEL } from "@/lib/venues"

/**
 * "Order Requests" on the prep page (Jose, 15 Oct 2026): chefs note what
 * needs ordering or did not arrive with a delivery as they notice it, so
 * the head chef sees it all in one place when placing orders.
 */

export const MAX_ORDER_REQUEST_LENGTH = 300

/** Ticked requests stay on the page this many days, then drop off. */
export const DONE_KEEP_DAYS = 3

export interface OrderRequestRow {
  id: string
  /** Whose list: the kitchen's or pastry's. */
  dept: OrderDept
  /** The product: the catalogue name, or what was typed. */
  text: string
  /** How many packs, when said. */
  qty: number | null
  /** Set when the product was picked from the catalogue. */
  approvedItemId: string | null
  supplier: string | null
  packSize: string | null
  /** "for tomorrow", "didn't arrive". */
  note: string | null
  createdBy: string | null
  /** ISO instant. */
  createdAt: string
  done: boolean
  doneBy: string | null
  doneAt: string | null
}

/** A product on the approved order list, as the picker searches it. */
export interface CatalogueChoice {
  id: string
  name: string
  supplier: string
  packSize: string | null
  category: string | null
  /** The department that orders it, so pastry's list leads with pastry's products. */
  dept: OrderDept
}

/** A quantity as typed: whole or decimal packs, nothing else. */
export function parseQty(raw: string | null | undefined): number | null {
  const t = (raw ?? "").trim().replace(",", ".")
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/** "2 ×" in front of a product, or nothing. */
export function qtyLabel(qty: number | null): string {
  if (qty == null) return ""
  return `${Number.isInteger(qty) ? qty : qty.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} ×`
}

export function cleanRequestText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_ORDER_REQUEST_LENGTH).trim()
}

/**
 * The products that match what a chef has typed so far, best first: a name
 * that starts with the words typed, then a name containing them, then a
 * supplier or category match. Every word typed has to appear somewhere.
 * Nothing until two characters are typed, so the list is not the whole
 * catalogue. With a department given, its own products come before the
 * other departments' at the same match strength (pastry sees Jess's list
 * first), but nothing is hidden.
 */
export function matchCatalogue(
  items: readonly CatalogueChoice[],
  query: string,
  limit = 8,
  preferDept?: OrderDept | null
): CatalogueChoice[] {
  const q = query.replace(/\s+/g, " ").trim().toLowerCase()
  if (q.length < 2) return []
  const words = q.split(" ")
  const scored: { item: CatalogueChoice; score: number }[] = []
  for (const item of items) {
    const name = item.name.toLowerCase()
    const rest = `${item.supplier} ${item.category ?? ""} ${item.packSize ?? ""}`.toLowerCase()
    if (!words.every((w) => name.includes(w) || rest.includes(w))) continue
    const strength = name.startsWith(q) ? 0 : name.includes(q) ? 1 : words.every((w) => name.includes(w)) ? 2 : 3
    const other = preferDept && item.dept !== preferDept ? 1 : 0
    scored.push({ item, score: strength * 2 + other })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name) || a.item.supplier.localeCompare(b.item.supplier))
    .slice(0, Math.max(0, limit))
    .map((s) => s.item)
}

/** One line describing where a request's product comes from, or null when typed. */
export function productDetail(r: Pick<OrderRequestRow, "supplier" | "packSize">): string | null {
  return [r.supplier, r.packSize].filter(Boolean).join(" · ") || null
}

/**
 * Who gets the end-of-day email of open requests, per venue and
 * department. Jose runs the Beach House kitchen orders; nobody is set for
 * pastry yet. ORDER_REQUEST_TO_<DEPT>_<VENUE> in the environment overrides
 * (comma separated; ORDER_REQUEST_TO_<VENUE> still works for the kitchen);
 * an empty override turns the email off.
 */
const DEFAULT_RECIPIENTS: Partial<Record<`${OrderDept}_${Venue}`, string[]>> = {
  KITCHEN_BEACH_HOUSE: ["jseluis957@gmail.com"],
}

export function orderRequestRecipients(
  venue: Venue,
  dept: OrderDept = "KITCHEN",
  env: Record<string, string | undefined> = process.env
): string[] {
  const raw = env[`ORDER_REQUEST_TO_${dept}_${venue}`] ?? (dept === "KITCHEN" ? env[`ORDER_REQUEST_TO_${venue}`] : undefined)
  if (raw != null) return raw.split(",").map((s) => s.trim()).filter(Boolean)
  return DEFAULT_RECIPIENTS[`${dept}_${venue}`] ?? []
}

const whenFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Brisbane",
})

function brisbaneDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
}

/**
 * The 5pm email: every request still open, newest first, today's ones
 * tagged. Nothing is sent when the list is empty (the caller checks).
 */
export function renderOrderRequestEmail(params: {
  venue: Venue
  dept?: OrderDept
  open: OrderRequestRow[]
  now?: Date
}): { subject: string; html: string; text: string } {
  const now = params.now ?? new Date()
  const dept = params.dept ?? "KITCHEN"
  const venueLabel = dept === "KITCHEN" ? VENUE_SHORT_LABEL[params.venue] : `${VENUE_SHORT_LABEL[params.venue]} ${DEPT_LABEL[dept].toLowerCase()}`
  const todayYmd = brisbaneDay(now.toISOString())
  const open = [...params.open].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const addedToday = open.filter((r) => brisbaneDay(r.createdAt) === todayYmd).length
  const n = open.length
  const subject = `${venueLabel} order requests: ${n} to order${addedToday ? ` (${addedToday} new today)` : ""}`
  const url = `${APP_URL}/kitchen/restock/orders?venue=${params.venue}${dept === "KITCHEN" ? "" : `&dept=${dept}`}`
  const line = (r: OrderRequestRow) => `${qtyLabel(r.qty)} ${r.text}`.trim()

  const items: ListItem[] = open.map((r) => {
    const isToday = brisbaneDay(r.createdAt) === todayYmd
    return {
      text: line(r),
      detail: [
        productDetail(r) ?? "not on the order list, typed in",
        r.note ? `"${r.note}"` : null,
        [r.createdBy, whenFmt.format(new Date(r.createdAt))].filter(Boolean).join(", "),
      ]
        .filter(Boolean)
        .join("\n"),
      tone: isToday ? "gold" : "neutral",
      tag: isToday ? "today" : undefined,
      tagTone: "gold",
    }
  })

  const html = shell({
    kicker: "Order requests",
    title: `${n} thing${n === 1 ? "" : "s"} to order`,
    subtitle: `${venueLabel} · what the chefs noted as needed or missing`,
    preheader: open.map(line).join(", "),
    sections: [
      list(items),
      para("Tick each one on the prep page once it is on an order, and it leaves this list."),
      button("Open order requests", url),
    ],
  })

  const text = [
    `${venueLabel} order requests: ${n} to order`,
    "",
    ...open.map(
      (r) =>
        `- ${line(r)}${productDetail(r) ? ` [${productDetail(r)}]` : " [not on the order list]"}${r.note ? ` "${r.note}"` : ""}${r.createdBy ? ` (${r.createdBy}, ${whenFmt.format(new Date(r.createdAt))})` : ` (${whenFmt.format(new Date(r.createdAt))})`}`
    ),
    "",
    `Tick each one once it is on an order: ${url}`,
  ].join("\n")

  return { subject, html, text }
}
