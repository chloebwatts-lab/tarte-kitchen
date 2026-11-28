/**
 * Cake orders, the scheduled side (cron /api/cron/cake-orders):
 *
 *  - import: every 10 minutes, new Squarespace order emails in hello@ become
 *    CakeOrder rows (one per item, gift cards left out) and pastry gets an
 *    alert. Each email is looked at once (CakeOrderImport). Website orders
 *    are paid at checkout.
 *  - remind: an order still not opened ("Got it") two hours after it came
 *    in gets one more alert, 7am to 3pm.
 *  - morning: 6am list of today's pickups and the next three days.
 */

import { db } from "@/lib/db"
import type { CakeOrder } from "@/generated/prisma/client"
import { getHelloAccessToken } from "@/lib/gmail/hello-token"
import { extractPlainTextBody, getHeader, getMessage, searchMessages } from "@/lib/gmail/client"
import { isMadeToOrder, isPlainDate, parseWebsiteOrder } from "./squarespace"
import { brisbaneDay, dueForReminder, morningAlert, newOrderAlert, niceTime, shortDay, CAKE_VENUE_LABEL, type AlertOrder, type CakeVenue } from "./shared"
import { CAKES_PATH, sendCakePush } from "./push"

/** Most emails one run fetches, to stay well inside the hello@ Gmail quota. */
const RUN_BUDGET = 30
/** Only orders this fresh set off an alert; older ones (first run, catch-up) come in quietly. */
const ALERT_IF_EMAIL_UNDER_MIN = 180

export function toAlertOrder(o: Pick<CakeOrder, "venue" | "pickupDate" | "pickupTime" | "customerName" | "product" | "details" | "quantity" | "status" | "checkNote" | "orderedAt">): AlertOrder {
  return {
    venue: (o.venue === "BOTH" ? "BURLEIGH" : o.venue) as CakeVenue,
    pickupDate: o.pickupDate ? o.pickupDate.toISOString().slice(0, 10) : null,
    pickupTime: o.pickupTime,
    customerName: o.customerName,
    product: o.product,
    details: o.details,
    quantity: o.quantity,
    status: o.status,
    checkNote: o.checkNote,
    orderedDay: brisbaneDay(o.orderedAt),
  }
}

export interface ImportReport {
  ok: boolean
  reason?: string
  found: number
  fetched: number
  created: number
  skipped: number
  alerts: number
  details: string[]
}

export async function importWebsiteCakeOrders(opts: { days?: number; dryRun?: boolean; now?: Date } = {}): Promise<ImportReport> {
  const now = opts.now ?? new Date()
  const days = Math.min(Math.max(opts.days ?? 3, 1), 60)
  const report: ImportReport = { ok: true, found: 0, fetched: 0, created: 0, skipped: 0, alerts: 0, details: [] }

  const token = await getHelloAccessToken("cake-orders")
  if (!token) return { ...report, ok: false, reason: "No hello@ token this run" }

  const ids = (await searchMessages(token, `from:no-reply@squarespace.com subject:("New Order has Arrived") newer_than:${days}d`, 200)).map((m) => m.id)
  report.found = ids.length
  const seen = new Set(
    (await db.cakeOrderImport.findMany({ where: { gmailMessageId: { in: ids } }, select: { gmailMessageId: true } })).map((s) => s.gmailMessageId)
  )
  const today = brisbaneDay(now)

  for (const id of ids.filter((i) => !seen.has(i)).slice(0, RUN_BUDGET)) {
    let msg
    try {
      msg = await getMessage(token, id)
    } catch (e) {
      // Not recorded, so the next run tries again.
      report.details.push(`${id}: fetch failed ${e instanceof Error ? e.message.slice(0, 80) : e}`)
      continue
    }
    report.fetched++
    const subject = getHeader(msg, "Subject") ?? ""
    const sent = new Date(getHeader(msg, "Date") ?? now.toISOString())
    const emailAt = Number.isNaN(sent.getTime()) ? now : sent
    const order = parseWebsiteOrder(extractPlainTextBody(msg), brisbaneDay(emailAt), subject)

    const record = async (outcome: string, detail: string, orderRef?: string) => {
      report.details.push(`${orderRef ?? id}: ${outcome}, ${detail}`)
      if (!opts.dryRun) {
        await db.cakeOrderImport.create({ data: { gmailMessageId: id, orderRef: orderRef ?? null, outcome, detail } }).catch(() => undefined)
      }
    }

    if (!order || !order.items.length) {
      report.skipped++
      await record("skipped", "not an order we could read")
      continue
    }

    const rows = order.items
      .map((it, i) => ({ it, ref: `${order.orderNo}-${i + 1}` }))
      .filter(({ it }) => isMadeToOrder(it.product))
      // Pickups already gone come in only from a catch-up; leave them out.
      .filter(({ it }) => (it.pickupDate ? it.pickupDate >= today : now.getTime() - emailAt.getTime() < 7 * 86_400_000))
    if (!rows.length) {
      report.skipped++
      await record("skipped", "gift cards only, or every pickup has been", order.orderNo)
      continue
    }

    // Customers often write more than a date in the pickup box ("8.30am, blueberries
    // instead of strawberries if you can"): keep their words with the order.
    const boxNote = order.requestedDateRaw && !isPlainDate(order.requestedDateRaw) ? `Pickup date box: "${order.requestedDateRaw}"` : null
    const orderNotes = [order.notes, boxNote].filter(Boolean).join("\n") || null
    const data = rows.map(({ it, ref }) => {
      const venue = it.venue ?? order.venue
      const notes = [...it.checkNotes, venue ? null : "Pickup place not on the order, set to Burleigh. Check with the customer."].filter(Boolean)
      return {
        venue: venue ?? "BURLEIGH",
        pickupDate: it.pickupDate ? new Date(`${it.pickupDate}T00:00:00.000Z`) : null,
        pickupTime: it.pickupTime,
        customerName: it.customerName,
        customerEmail: order.customerEmail,
        customerPhone: it.customerPhone,
        product: it.product,
        details: it.details,
        quantity: it.quantity,
        notes: orderNotes,
        paid: true,
        source: "WEBSITE" as const,
        orderRef: order.orderNo,
        sourceRef: ref,
        checkNote: notes.length ? notes.join(" ") : null,
        createdBy: "Website",
        orderedAt: emailAt,
      }
    })

    if (opts.dryRun) {
      report.created += data.length
      report.details.push(`${order.orderNo}: would add ${data.map((d) => `${d.quantity}x ${d.product} ${d.pickupDate?.toISOString().slice(0, 10) ?? "no date"}`).join("; ")}`)
      continue
    }

    const res = await db.cakeOrder.createMany({ data, skipDuplicates: true })
    report.created += res.count
    await record("created", `${res.count} of ${data.length} items`, order.orderNo)

    if (res.count > 0 && now.getTime() - emailAt.getTime() < ALERT_IF_EMAIL_UNDER_MIN * 60_000) {
      const made = await db.cakeOrder.findMany({ where: { orderRef: order.orderNo, source: "WEBSITE" }, orderBy: { sourceRef: "asc" } })
      const alert = newOrderAlert(made.map(toAlertOrder), today)
      const r = await sendCakePush(alert.title, alert.body, `${CAKES_PATH}?order=${encodeURIComponent(order.orderNo)}`)
      if (r.sent) report.alerts++
    }
  }
  return report
}

/** One more alert for orders nobody has opened two hours on (7am to 3pm). */
export async function sendCakeReminders(now = new Date()): Promise<{ due: number; sent: number }> {
  const waiting = await db.cakeOrder.findMany({
    where: { status: "NEW", remindedAt: null, createdAt: { lt: new Date(now.getTime() - 2 * 3_600_000) } },
    orderBy: [{ pickupDate: "asc" }, { pickupTime: "asc" }],
  })
  const due = waiting.filter((o) => dueForReminder(o, now))
  if (!due.length) return { due: 0, sent: 0 }
  const today = brisbaneDay(now)
  const lines = due.slice(0, 4).map((o) => {
    const a = toAlertOrder(o)
    const when = a.pickupDate ? (a.pickupDate === today ? "today" : shortDay(a.pickupDate)) : "no date"
    return `${o.product} for ${o.customerName} (${[when, niceTime(a.pickupTime), CAKE_VENUE_LABEL[a.venue]].filter(Boolean).join(", ")})`
  })
  const more = due.length > 4 ? ` and ${due.length - 4} more` : ""
  const r = await sendCakePush(
    `${due.length === 1 ? "A cake order is" : `${due.length} cake orders are`} not opened yet`,
    `${lines.join("; ")}${more}. Tap Got it once you have seen it.`
  )
  await db.cakeOrder.updateMany({ where: { id: { in: due.map((o) => o.id) } }, data: { remindedAt: now } })
  return { due: due.length, sent: r.sent }
}

/** The 6am list. Quiet when nothing is coming up. */
export async function sendCakeMorning(now = new Date()): Promise<{ sent: number; title: string | null }> {
  const today = brisbaneDay(now)
  const rows = await db.cakeOrder.findMany({
    where: {
      status: { notIn: ["CANCELLED", "COLLECTED"] },
      OR: [{ pickupDate: null }, { pickupDate: { gte: new Date(`${today}T00:00:00.000Z`) } }],
    },
  })
  const alert = morningAlert(rows.map(toAlertOrder), today)
  if (!alert) return { sent: 0, title: null }
  const r = await sendCakePush(alert.title, alert.body)
  return { sent: r.sent, title: alert.title }
}
