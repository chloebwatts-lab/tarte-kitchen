/**
 * The Wednesday "where to order" email to Chloe: headline first, then the
 * buys that came from the wrong supplier, by department, so she can pass
 * each list to the department head. Deterministic, no LLM.
 */
import { button, callout, list, para, section, shell, subhead, type ListItem } from "@/lib/email/brand"
import { DEPTS, SHEET_DATE } from "./sheet"
import type { AuditResult, FormDrift, OffSheetRow } from "./audit"

const VENUE: Record<string, string> = {
  BURLEIGH: "Burleigh",
  BEACH_HOUSE: "Beach House",
  TEA_GARDEN: "Tea Garden",
  BOTH: "Both venues",
  Unknown: "Venue not on invoice",
}
const venue = (v: string) => VENUE[v] ?? v

const money = (n: number): string => {
  const r = Math.round(Math.abs(n))
  return `$${r.toLocaleString("en-AU")}`
}

/** "12 Nov" from yyyy-mm-dd. */
function day(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })
}

/** "Wed 12 Nov" from yyyy-mm-dd. */
function dayLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
}

/** "12, 14 and 17 Nov" */
function dates(isos: string[]): string {
  const ds = isos.map(day)
  if (ds.length === 1) return ds[0]
  const sameMonth = new Set(ds.map((d) => d.split(" ")[1])).size === 1
  const parts = sameMonth ? ds.map((d, i) => (i < ds.length - 1 ? d.split(" ")[0] : d)) : ds
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/** "$14.95/kg", "$0.097 each", "$45.00/tray" */
function unitPrice(n: number, per: string | null): string {
  if (per === "ea") return `$${n.toFixed(n < 1 ? 3 : 2)} each`
  const label = per === "l" ? "L" : per?.startsWith("u:") ? per.slice(2) : per ?? ""
  return `$${n.toFixed(2)}/${label}`
}

function rowItem(r: OffSheetRow): ListItem {
  const what =
    r.why === "product"
      ? `${r.item}: ${r.say} (${r.boughtFrom})`
      : `${r.item}: ${r.boughtFrom}, not ${r.shouldBe}`
  const bits: string[] = []
  bits.push(`${venue(r.venue)}, ${r.lines === 1 ? "1 line" : `${r.lines} lines`} on ${dates(r.dates)}${r.late ? " (invoice came in late)" : ""}. ${money(r.spend)} spent.`)
  if (r.extra != null && r.paidPer != null && r.rightPer != null) {
    bits.push(`Paid ${unitPrice(r.paidPer, r.per)} vs ${unitPrice(r.rightPer, r.per)} at ${r.shouldBe}.`)
  }
  if (r.switched || r.namedNotFrom) bits.push(`The sheet says switch to ${r.shouldBe}.`)
  bits.push(`Bought: ${r.product}`)
  let tag: string | undefined
  let tone: ListItem["tone"] = "warn"
  if (r.why === "product") tag = "wrong product"
  else if (r.extra == null) tag = "price not comparable"
  else if (r.extra >= 0.5) tag = `${money(r.extra)} extra`
  else if (r.extra <= -0.5) {
    tag = `${money(r.extra)} cheaper`
    tone = "gold"
  } else tag = "same price"
  return { text: what, detail: bits.join("\n"), tone, tag, tagTone: tone === "gold" ? "gold" : r.why === "product" || (r.extra != null && r.extra >= 0.5) ? "warn" : "neutral" }
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderWhereToOrderEmail(args: { result: AuditResult; drift: FormDrift[] }): RenderedEmail {
  const { result: r, drift } = args
  const weekTo = day(r.weekEndKey)
  const offItems = r.itemsOff
  const pctRight = r.sheetLines ? Math.round((r.rightLines / r.sheetLines) * 100) : 100

  const subject =
    r.offLines === 0
      ? `Where to order, week to Tue ${weekTo}: all from the right supplier`
      : `Where to order, week to Tue ${weekTo}: ${offItems} ${offItems === 1 ? "item" : "items"} from the wrong supplier${r.extraTotal >= 1 ? `, ${money(r.extraTotal)} extra` : ""}`

  // ── Headlines (at most five lines).
  const head: string[] = []
  if (r.offLines === 0) {
    head.push(`Every buy of an item on the ${SHEET_DATE} sheet came from the supplier on the sheet (${r.sheetLines} invoice lines).`)
  } else {
    head.push(
      `${r.offLines} of ${r.sheetLines} invoice lines for sheet items came from the wrong supplier (${pctRight}% right).` +
        (r.extraTotal >= 1 ? ` That cost ${money(r.extraTotal)} extra${r.extraTotal >= 20 ? `, about ${money(r.extraTotal * 52)} a year if it keeps up` : ""}.` : "")
    )
    const venues = Object.entries(r.byVenue).sort((a, b) => b[1].extra - a[1].extra || b[1].lines - a[1].lines)
    head.push(venues.map(([v, x]) => `${venue(v)} ${x.lines} ${x.lines === 1 ? "line" : "lines"}${x.extra >= 1 ? ` (${money(x.extra)})` : ""}`).join(", ") + ".")
    const top = r.rows.find((x) => x.extra != null && x.extra >= 1)
    if (top) head.push(`Biggest: ${top.item} from ${top.boughtFrom} at ${venue(top.venue)}, ${money(top.extra!)} over ${top.shouldBe}.`)
    if (r.cheaperTotal >= 1) head.push(`${money(r.cheaperTotal)} of the off-sheet buys were cheaper than the sheet supplier: worth a look at those rows.`)
  }
  head.push(
    drift.length === 0
      ? "The app's order forms match the sheet."
      : `The app: ${drift.length} order-form ${drift.length === 1 ? "line needs" : "lines need"} fixing so staff can only pick the right supplier (below).`
  )

  const sections: string[] = []
  sections.push(callout(head.slice(0, 5).join("\n"), r.offLines === 0 && drift.length === 0 ? "done" : "gold", { label: "Headlines" }))

  if (r.rows.length) {
    let body = ""
    const shown = r.rows.slice(0, 30)
    for (const dept of DEPTS) {
      const rows = shown.filter((x) => x.dept === dept)
      if (!rows.length) continue
      const extra = rows.reduce((s, x) => s + Math.max(0, x.extra ?? 0), 0)
      body += subhead(dept, extra >= 1 ? `${money(extra)} extra` : undefined, "warn")
      body += list(rows.map(rowItem))
    }
    if (r.rows.length > shown.length) body += para(`And ${r.rows.length - shown.length} smaller ones, all under ${money(shown[shown.length - 1].extra ?? 0)}.`, { muted: true })
    sections.push(section("Bought from the wrong supplier", body, { note: "Dearest first, by department, for each department head." }))
  }

  if (r.backups.length) {
    sections.push(
      section(
        "Allowed second choices used",
        list(r.backups.map((b) => ({ text: `${b.item}: ${b.supplier}, ${venue(b.venue)}`, detail: `${b.lines} ${b.lines === 1 ? "line" : "lines"}. Allowed: ${b.when}.`, tone: "neutral" as const }))),
        { note: "Not counted as wrong." }
      )
    )
  }

  if (drift.length) {
    const say: Record<FormDrift["problem"], string> = {
      "wrong-supplier-active": "is still switched on, so staff can order it from there",
      "wrong-product-active": "is switched on but is not the product on the sheet",
      "right-supplier-off": "is switched off, so staff cannot order it from the right supplier",
    }
    sections.push(
      section(
        "The app",
        list(drift.map((d) => ({ text: `${d.item}: ${d.supplier} "${d.formName}" ${say[d.problem]}.`, tone: "gold" as const }))),
        { tone: "gold" }
      )
    )
  }

  sections.push(
    section(
      null,
      para(
        `Checked every invoice line dated ${dayLong(r.weekStartKey)} to ${dayLong(r.weekEndKey)}, plus invoices for earlier weeks that only reached us since last Wednesday, against the ${SHEET_DATE} where-to-order sheet (${DEPTS.length} departments). Prices are ex GST, Bidfood net of the 4% rebate, compared per kg, litre or each with what the right supplier charged us over the last 8 weeks.`,
        { muted: true }
      ) + button("Open Where to order it", "https://kitchen.tarte.com.au/kitchen/managers/preferred", { secondary: true })
    )
  )

  const title =
    r.offLines === 0
      ? "Everything from the right supplier"
      : `${offItems} ${offItems === 1 ? "item" : "items"} bought from the wrong supplier`

  const html = shell({
    kicker: "Where to order check",
    title,
    subtitle: `${dayLong(r.weekStartKey)} to ${dayLong(r.weekEndKey)}`,
    preheader: head[0],
    sections,
  })

  const textRows = r.rows.map((x) => {
    const tag = x.why === "product" ? "wrong product" : x.extra == null ? "price not comparable" : x.extra >= 0.5 ? `${money(x.extra)} extra` : x.extra <= -0.5 ? `${money(x.extra)} cheaper` : "same price"
    const what = x.why === "product" ? `${x.item}: ${x.say} (${x.boughtFrom})` : `${x.item}: ${x.boughtFrom}, not ${x.shouldBe}`
    return `- [${x.dept}] ${what}. ${venue(x.venue)}, ${x.lines} line(s) on ${dates(x.dates)}${x.late ? " (late invoice)" : ""}. ${tag}.`
  })
  const text = [
    title,
    `${dayLong(r.weekStartKey)} to ${dayLong(r.weekEndKey)}`,
    "",
    ...head.slice(0, 5),
    "",
    ...(textRows.length ? ["Bought from the wrong supplier:", ...textRows, ""] : []),
    ...(r.backups.length ? ["Allowed second choices used:", ...r.backups.map((b) => `- ${b.item}: ${b.supplier}, ${venue(b.venue)}, ${b.lines} line(s)`), ""] : []),
    ...(drift.length ? ["The app:", ...drift.map((d) => `- ${d.item}: ${d.supplier} "${d.formName}" (${d.problem})`), ""] : []),
    "Where to order it: https://kitchen.tarte.com.au/kitchen/managers/preferred",
  ].join("\n")

  return { subject, html, text }
}
