/**
 * The head chef's copy of the Wednesday "where to order" check, as a
 * WhatsApp message (Chloe, 25 Nov 2026: "send them to each venue's head
 * chef too", "via whatsapp"). One per venue, from that venue's result.
 *
 * Staff copies never show what was spent (Chloe, 14 Nov 2026: staff sheets
 * carry savings, not spend), so this says what to order where and what the
 * wrong supplier cost extra. Buys that came in cheaper than the sheet
 * supplier are left out: those are Chloe's call, not a correction.
 * Deterministic, no LLM. Plain text with WhatsApp bullets, no em dashes.
 */
import { SHEET_DATE } from "./sheet"
import type { AuditResult, OffSheetRow } from "./audit"

/** First names, as the chefs are addressed on WhatsApp. */
export const HEAD_CHEFS: Record<string, string> = {
  BURLEIGH: "Vinicius",
  BEACH_HOUSE: "Jose",
}

const VENUE_NAME: Record<string, string> = { BURLEIGH: "Burleigh", BEACH_HOUSE: "Currumbin" }

const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString("en-AU")}`

/** "Wed 18 to Tue 24 Nov", or "Wed 26 Nov to Tue 2 Dec" across a month end. */
export function weekLabel(startKey: string, endKey: string): string {
  const f = (iso: string, withMonth: boolean) =>
    new Date(`${iso}T00:00:00Z`)
      .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", ...(withMonth ? { month: "short" } : {}), timeZone: "UTC" })
      .replace(",", "")
  const sameMonth = startKey.slice(0, 7) === endKey.slice(0, 7)
  return `${f(startKey, !sameMonth)} to ${f(endKey, true)}`
}

/** "Bidfood or The Provedores", "A, B or C". */
function either(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
}

interface SupplierFix {
  item: string
  shouldBe: string
  from: string[]
  extra: number
  priced: boolean
}

export function renderChefWhatsApp(args: { result: AuditResult; venue: string; chef?: string }): string {
  const r = args.result
  const chef = args.chef ?? HEAD_CHEFS[args.venue]
  const where = VENUE_NAME[args.venue] ?? args.venue
  const pctRight = r.sheetLines ? Math.round((r.rightLines / r.sheetLines) * 100) : 100

  // One line per item: every wrong supplier it came from, dearer or not comparable.
  const fixes = new Map<string, SupplierFix>()
  // One line per item too: a late invoice and an on-time one are one bullet.
  const products = new Map<string, OffSheetRow>()
  for (const row of r.rows) {
    if (row.why === "product") {
      const p = products.get(row.ruleId)
      if (p) products.set(row.ruleId, { ...p, lines: p.lines + row.lines })
      else products.set(row.ruleId, row)
      continue
    }
    if (row.extra != null && row.extra <= -0.5) continue
    const f = fixes.get(row.ruleId) ?? { item: row.item, shouldBe: row.shouldBe, from: [], extra: 0, priced: false }
    if (!f.from.includes(row.boughtFrom)) f.from.push(row.boughtFrom)
    if (row.extra != null) {
      f.extra += Math.max(0, row.extra)
      f.priced = true
    }
    fixes.set(row.ruleId, f)
  }
  const supplierFixes = [...fixes.values()].sort((a, b) => b.extra - a.extra || Number(b.priced) - Number(a.priced))
  // The email's own total, so the chef and Chloe see the same figure.
  const extra = r.extraTotal

  const out: string[] = []
  let opening = `Hi${chef ? ` ${chef}` : ""}, here's the where to order check for last week (${weekLabel(r.weekStartKey, r.weekEndKey)}) at ${where}.`
  if (r.sheetLines === 0) {
    out.push(`${opening} There were no orders of items on the list.`, "", "Thanks!")
    return out.join("\n")
  }
  if (r.offLines === 0) {
    out.push(`${opening} Every order of an item on the list came from the right supplier. Great work, thanks!`)
    return out.join("\n")
  }
  if (!supplierFixes.length && !products.size) {
    // Only buys that came in cheaper than the sheet supplier: Chloe's call, nothing for the chef to change.
    out.push(`${opening} Nothing to change on the list this week. Thanks!`)
    return out.join("\n")
  }
  opening += ` ${pctRight}% of orders came from the right supplier.`
  if (extra >= 1) opening += ` The ones that didn't cost us ${money(extra)} extra.`
  out.push(opening)

  if (supplierFixes.length) {
    out.push("", "Please order these from the supplier on the list:")
    for (const f of supplierFixes) {
      out.push(`• ${f.item}: ${f.shouldBe}, not ${either(f.from)}${f.extra >= 1 ? ` (${money(f.extra)} extra)` : ""}`)
    }
  }
  if (products.size) {
    out.push("", "Wrong product:")
    for (const p of products.values()) {
      const n = p.lines
      out.push(`• ${p.item}: ${n === 1 ? "1 order was" : `${n} orders were`} ${p.say ?? "not the one on the list"}. Order ${p.shouldBeProduct} from ${p.shouldBe}.`)
    }
  }
  out.push("", `It's all on the where to order sheet from ${SHEET_DATE}. This check runs every Wednesday. Thanks!`)
  return out.join("\n")
}
