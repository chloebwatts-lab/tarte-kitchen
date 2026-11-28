/** Pastry Orders, the timed pushes: morning prep summary and cakes due tomorrow. */

import { db } from "@/lib/db"
import { brisbaneDay, cakesTomorrowPush, groupCards, morningPush, openLines, type PastryLine, type PushText } from "./shared"
import { sendPastryPush } from "./push"

async function openCards(today: string) {
  const rows = await db.pastryOrder.findMany({ where: { OR: [{ date: "" }, { date: { gte: today } }] } })
  return groupCards(openLines(rows as unknown as PastryLine[], today))
}

async function send(text: PushText | null, dry?: boolean): Promise<{ sent: number; title: string | null; body: string | null }> {
  if (!text) return { sent: 0, title: null, body: null }
  if (dry) return { sent: 0, ...text }
  const r = await sendPastryPush(text.title, text.body)
  return { sent: r.sent, ...text }
}

export async function sendPastryMorning(opts: { dry?: boolean; now?: Date } = {}) {
  const today = brisbaneDay(opts.now)
  return send(morningPush(await openCards(today), today), opts.dry)
}

export async function sendPastryCakesTomorrow(opts: { dry?: boolean; now?: Date } = {}) {
  const today = brisbaneDay(opts.now)
  return send(cakesTomorrowPush(await openCards(today), today), opts.dry)
}
