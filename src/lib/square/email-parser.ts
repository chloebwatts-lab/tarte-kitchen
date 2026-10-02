/**
 * Parser for Square's "<Location> – your daily sales summary report for
 * <D Month YYYY>" emails (sender noreply@messaging.squareup.com, one email
 * per location, arrives ~00:30 AEST for the previous trading day).
 *
 * The email is an HTML table of label/value rows. Square's markup changes
 * without notice, so we never rely on tags: the HTML is flattened to text
 * lines and figures are located by their label, the same way a human reads
 * the email. Any missing section yields zero / empty rather than a throw;
 * only a report with no net sales figure at all is rejected.
 */

import Decimal from "decimal.js"

export interface SquareCategorySales {
  name: string
  itemsSold: Decimal
  netSalesExGst: Decimal
}

export interface SquareOrderSource {
  name: string
  orders: number
  netSalesExGst: Decimal
}

export interface SquareDailySummary {
  locationName: string
  /** Trading day, YYYY-MM-DD (AEST). */
  date: string
  netSalesExGst: Decimal
  /** Net sales + taxes, i.e. revenue inc GST after returns + discounts. */
  grossSales: Decimal
  /** Gross sales + tips + gift cards - refunds by amount. */
  totalSales: Decimal
  taxes: Decimal
  returns: Decimal // positive number
  discountsAndComps: Decimal // positive number
  refundsByAmount: Decimal // positive number
  /** Square processing fees incl GST (positive number). */
  fees: Decimal
  totalOrders: number
  averageOrder: Decimal
  totalCovers: number
  categories: SquareCategorySales[]
  orderSources: SquareOrderSource[]
}

// ─── HTML → lines ───────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  hellip: "…",
  rarr: "→",
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

/** Flatten HTML to trimmed, non-empty text lines (one per cell/block). */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|h[1-6]|table|section|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return textToLines(decodeEntities(text))
}

export function textToLines(text: string): string[] {
  return text
    .replace(/ /g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0)
}

// ─── Token helpers ──────────────────────────────────────────────────────────

const MONEY_RE = /^\(?-?\$?\s?-?\d[\d,]*(\.\d+)?\)?$/
const INT_RE = /^\d[\d,]*$/
const QTY_RE = /^\d[\d,]*(\.\d+)?$/
const NOISE_RE = /^(n\/a|[+-]?\d+(\.\d+)?%|wow|yoy|n\/a wow|n\/a yoy|[+-]?\d+(\.\d+)?% wow|[+-]?\d+(\.\d+)?% yoy)$/i

function isMoney(line: string): boolean {
  return line.includes("$") && MONEY_RE.test(line.replace(/\s/g, ""))
}

/** "($341.01)" → -341.01, "$11,611.52" → 11611.52, "-$5.00" → -5. */
export function parseMoney(raw: string): Decimal {
  const s = raw.replace(/\s/g, "")
  const negative = /^\(.*\)$/.test(s) || s.includes("-")
  const digits = s.replace(/[^\d.]/g, "")
  if (!digits) return new Decimal(0)
  const d = new Decimal(digits)
  return negative ? d.neg() : d
}

function parseIntLoose(raw: string): number {
  const n = parseInt(raw.replace(/[^\d]/g, ""), 10)
  return Number.isFinite(n) ? n : 0
}

/** Strip footnote marks / arrows so "Fees² →" matches "fees". */
function normaliseLabel(line: string): string {
  return line
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰→←*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function findLabel(lines: string[], label: string, from = 0): number {
  const want = label.toLowerCase()
  for (let i = from; i < lines.length; i++) {
    if (normaliseLabel(lines[i]) === want) return i
  }
  return -1
}

/** Value on the first money-looking line within `window` lines after the label. */
function moneyAfter(lines: string[], label: string, from = 0, window = 4): Decimal | null {
  const i = findLabel(lines, label, from)
  if (i < 0) return null
  for (let j = i + 1; j <= i + window && j < lines.length; j++) {
    if (isMoney(lines[j])) return parseMoney(lines[j])
  }
  return null
}

function intAfter(lines: string[], label: string, from = 0, window = 4): number | null {
  const i = findLabel(lines, label, from)
  if (i < 0) return null
  for (let j = i + 1; j <= i + window && j < lines.length; j++) {
    if (INT_RE.test(lines[j])) return parseIntLoose(lines[j])
  }
  return null
}

// ─── Date / location ────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/**
 * Subject: "Tarte Beach House – your daily sales summary report for 1 October 2026".
 * Square uses an en dash but we accept hyphens / em dashes too.
 */
export function parseSubject(
  subject: string
): { locationName: string; date: string } | null {
  const m = subject.match(
    /^\s*(.+?)\s*[–—-]\s*your daily sales summary report for\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/i
  )
  if (!m) return null
  const month = MONTHS[m[3].toLowerCase()]
  if (!month) return null
  return { locationName: m[1].trim(), date: ymd(parseInt(m[4], 10), month, parseInt(m[2], 10)) }
}

/**
 * Body header: "Thursday 1 Oct, Tarte Beach House". No year in the body, so
 * the caller passes the email's Date header to pick the right year (the
 * report is for the day before the email, never months before).
 */
function parseBodyHeader(
  lines: string[],
  emailDate: Date | undefined
): { locationName: string; date: string } | null {
  for (const line of lines.slice(0, 15)) {
    const m = line.match(/^[A-Za-z]+\s+(\d{1,2})\s+([A-Za-z]+),\s*(.+)$/)
    if (!m) continue
    const month = MONTHS[m[2].toLowerCase()]
    if (!month) continue
    const day = parseInt(m[1], 10)
    const ref = emailDate ?? new Date()
    let year = ref.getUTCFullYear()
    // Email from early January about a late-December trading day.
    if (month === 12 && ref.getUTCMonth() === 0) year -= 1
    return { locationName: m[3].trim(), date: ymd(year, month, day) }
  }
  return null
}

// ─── Tables ─────────────────────────────────────────────────────────────────

function isHeaderOrNoise(line: string): boolean {
  const n = normaliseLabel(line)
  return (
    NOISE_RE.test(line) ||
    n === "category" ||
    n === "items sold" ||
    n === "net sales" ||
    n === "orders" ||
    n === "avg. order" ||
    n === "avg order"
  )
}

function parseCategories(lines: string[]): SquareCategorySales[] {
  const start = findLabel(lines, "sales breakdown")
  if (start < 0) return []
  const out: SquareCategorySales[] = []
  let i = start + 1
  while (i < lines.length) {
    const line = lines[i]
    const n = normaliseLabel(line)
    if (n === "order source" || n.startsWith("square au") || n.startsWith("¹") || /^does not include/i.test(line)) break
    if (isHeaderOrNoise(line) || isMoney(line) || QTY_RE.test(line)) {
      i++
      continue
    }
    // Candidate category name: next qty then next money within a few lines.
    let qty: Decimal | null = null
    let money: Decimal | null = null
    let j = i + 1
    for (; j < lines.length && j <= i + 5; j++) {
      const l = lines[j]
      if (qty === null && QTY_RE.test(l)) {
        qty = new Decimal(l.replace(/,/g, ""))
        continue
      }
      if (qty !== null && isMoney(l)) {
        money = parseMoney(l)
        break
      }
      if (!NOISE_RE.test(l) && !QTY_RE.test(l) && !isMoney(l)) break
    }
    if (qty !== null && money !== null) {
      out.push({ name: line, itemsSold: qty, netSalesExGst: money })
      i = j + 1
    } else {
      i++
    }
  }
  return out
}

function parseOrderSources(lines: string[]): SquareOrderSource[] {
  const start = findLabel(lines, "order source")
  if (start < 0) return []
  const out: SquareOrderSource[] = []
  let i = start + 1
  while (i < lines.length) {
    const line = lines[i]
    const n = normaliseLabel(line)
    if (n.startsWith("square au") || /^does not include/i.test(line) || /^\(abn/i.test(line)) break
    if (isHeaderOrNoise(line) || isMoney(line) || QTY_RE.test(line)) {
      i++
      continue
    }
    let orders: number | null = null
    let money: Decimal | null = null
    let j = i + 1
    for (; j < lines.length && j <= i + 6; j++) {
      const l = lines[j]
      if (orders === null && INT_RE.test(l)) {
        orders = parseIntLoose(l)
        continue
      }
      if (orders !== null && money === null && isMoney(l)) {
        money = parseMoney(l)
        continue
      }
      if (money !== null) {
        // Skip the avg. order figure, then stop.
        if (isMoney(l)) j++
        break
      }
      if (!NOISE_RE.test(l)) break
    }
    if (orders !== null && money !== null) {
      out.push({ name: line, orders, netSalesExGst: money })
      i = j
    } else {
      i++
    }
  }
  return out
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface ParseOptions {
  subject?: string
  /** Email Date header, used for the year when the subject is missing. */
  emailDate?: Date
}

export function parseSquareDailySummaryLines(
  lines: string[],
  opts: ParseOptions = {}
): SquareDailySummary {
  const head =
    (opts.subject ? parseSubject(opts.subject) : null) ??
    parseBodyHeader(lines, opts.emailDate)
  if (!head) {
    throw new Error("Square daily summary: could not find location/date in subject or body")
  }

  const netSales = moneyAfter(lines, "net sales")
  if (netSales === null) {
    throw new Error("Square daily summary: no Net sales figure found")
  }
  const abs = (d: Decimal | null) => (d ?? new Decimal(0)).abs()

  const taxes = abs(moneyAfter(lines, "taxes"))
  const grossSales = moneyAfter(lines, "gross sales") ?? netSales.plus(taxes)
  const totalSales = moneyAfter(lines, "total sales") ?? grossSales

  return {
    locationName: head.locationName,
    date: head.date,
    netSalesExGst: netSales,
    grossSales,
    totalSales,
    taxes,
    returns: abs(moneyAfter(lines, "returns")),
    discountsAndComps: abs(moneyAfter(lines, "discounts and comps")),
    refundsByAmount: abs(moneyAfter(lines, "refunds by amount")),
    fees: abs(moneyAfter(lines, "fees")),
    totalOrders: intAfter(lines, "total orders") ?? 0,
    averageOrder: moneyAfter(lines, "average order") ?? new Decimal(0),
    totalCovers: intAfter(lines, "total covers") ?? 0,
    categories: parseCategories(lines),
    orderSources: parseOrderSources(lines),
  }
}

export function parseSquareDailySummaryHtml(html: string, opts: ParseOptions = {}) {
  return parseSquareDailySummaryLines(htmlToLines(html), opts)
}

export function parseSquareDailySummaryText(text: string, opts: ParseOptions = {}) {
  return parseSquareDailySummaryLines(textToLines(text), opts)
}

// ─── Gmail message adapter ──────────────────────────────────────────────────

interface MimePart {
  mimeType?: string
  filename?: string
  headers?: Array<{ name: string; value: string }>
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: MimePart[]
}
export interface GmailMessageLike {
  id: string
  payload: MimePart & { headers: Array<{ name: string; value: string }> }
}

export const SQUARE_REPORT_SENDERS = ["noreply@messaging.squareup.com"]
export const SQUARE_REPORT_SUBJECT = "your daily sales summary report for"

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
}

/** True when the From header is Square's report sender (exact address). */
export function isSquareReportSender(from: string | undefined): boolean {
  if (!from) return false
  const m = from.match(/<([^>]+)>/)
  const addr = (m ? m[1] : from).trim().toLowerCase()
  return SQUARE_REPORT_SENDERS.includes(addr)
}

export function parseSquareDailySummaryMessage(message: GmailMessageLike): SquareDailySummary {
  const header = (name: string) =>
    message.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
  const subject = header("Subject")
  const dateHeader = header("Date")
  const emailDate = dateHeader ? new Date(dateHeader) : undefined

  const html: string[] = []
  const plain: string[] = []
  const walk = (p: MimePart) => {
    if (p.body?.data) {
      if (p.mimeType === "text/html") html.push(decodeB64Url(p.body.data))
      else if (p.mimeType === "text/plain") plain.push(decodeB64Url(p.body.data))
    }
    for (const sub of p.parts ?? []) walk(sub)
  }
  walk(message.payload)

  const opts: ParseOptions = {
    subject,
    emailDate: emailDate && !isNaN(emailDate.getTime()) ? emailDate : undefined,
  }
  if (html.length) return parseSquareDailySummaryHtml(html.join("\n"), opts)
  if (plain.length) return parseSquareDailySummaryText(plain.join("\n"), opts)
  throw new Error("Square daily summary: email has no text body")
}
