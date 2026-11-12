/**
 * All revenue per venue and day, ex GST: the wage % basis (Chloe, 12 Nov
 * 2026: "include all revenue ... uber bopple and events from Xero").
 *
 *   tills (Lightspeed / Square end of day, Bopple inside Square)
 * + Uber Eats (menu value inc GST / 1.1, Louise's basis)
 * + events (Xero event invoices, dated the event day, DailyEventSales)
 *
 * Pure. Used by the daily sales feed Tarte Shifts reads for its wage %, the
 * /labour/live tracker and the Friday digest.
 *
 * A day with no till row is left out while it can still report (today, or a
 * day not synced yet): it should stay missing, not read as a day of Uber or
 * events alone. A PAST day with no till row is a closed day, so its event
 * revenue (a private hire on a closed Monday) still counts, with tills 0.
 */
import { uberSalesExGst } from "@/lib/uber/client"

export interface PosDayIn { date: string; venue: string; exGst: number; incGst?: number }
export interface UberDayIn { date: string; venue: string; salesIncGst: number }
export interface EventDayIn { date: string; venue: string; exGst: number }

export interface AllRevenueDay {
  date: string
  venue: string
  /** Tills ex GST (0 on a closed day that only had an event). */
  posExGst: number
  posIncGst: number
  uberExGst: number
  uberIncGst: number
  eventsExGst: number
  /** posExGst + uberExGst + eventsExGst. */
  totalExGst: number
  /** True when the day had no till row (closed day with an event). */
  posMissing: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function allRevenueByDay(
  pos: PosDayIn[],
  uber: UberDayIn[],
  events: EventDayIn[],
  /** Brisbane yyyy-mm-dd; days before it with no till row are closed days. */
  today: string,
): AllRevenueDay[] {
  const key = (date: string, venue: string) => `${date}|${venue}`
  const uberInc = new Map<string, number>()
  for (const u of uber) uberInc.set(key(u.date, u.venue), (uberInc.get(key(u.date, u.venue)) ?? 0) + u.salesIncGst)
  const ev = new Map<string, number>()
  for (const e of events) ev.set(key(e.date, e.venue), (ev.get(key(e.date, e.venue)) ?? 0) + e.exGst)

  const build = (date: string, venue: string, posEx: number, posInc: number, posMissing: boolean): AllRevenueDay => {
    const inc = round2(uberInc.get(key(date, venue)) ?? 0)
    const uberEx = uberSalesExGst(inc)
    const eventsEx = round2(ev.get(key(date, venue)) ?? 0)
    return {
      date,
      venue,
      posExGst: posEx,
      posIncGst: posInc,
      uberExGst: uberEx,
      uberIncGst: inc,
      eventsExGst: eventsEx,
      totalExGst: round2(posEx + uberEx + eventsEx),
      posMissing,
    }
  }

  const out: AllRevenueDay[] = []
  const seen = new Set<string>()
  for (const p of pos) {
    const k = key(p.date, p.venue)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(build(p.date, p.venue, p.exGst, p.incGst ?? 0, false))
  }
  for (const e of events) {
    const k = key(e.date, e.venue)
    if (seen.has(k) || e.date >= today) continue
    seen.add(k)
    out.push(build(e.date, e.venue, 0, 0, true))
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue))
}
