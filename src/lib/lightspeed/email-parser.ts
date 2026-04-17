/**
 * Parser for Lightspeed "End of day" / "Daily summary" emails that land in
 * the finance inbox (e.g. accounts@tarte.com.au).
 *
 * Deliberately tolerant — Lightspeed's CSV columns and HTML layout drift, and
 * different Lightspeed products (X-Series / Retail / K-Series) use different
 * shapes. We identify rows and figures by fuzzy column names rather than
 * positional indices, fail gracefully, and return an array of one EodReport
 * per location.
 *
 * No external dependencies beyond what's already installed (decimal.js).
 */

import Decimal from "decimal.js"

// Minimal shape of a Gmail message payload we care about. Kept local to
// avoid coupling this parser to internals of @/lib/gmail/client.
interface MimePart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: Array<{ name: string; value: string }>
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: MimePart[]
}
interface GmailMessageShape {
  id: string
  threadId?: string
  payload: MimePart & {
    headers: Array<{ name: string; value: string }>
  }
}
type GmailAttachmentPart = MimePart

export interface EodTopItem {
  name: string
  qty: number
  revenue: Decimal
}

export interface EodReport {
  locationName: string
  date: string // YYYY-MM-DD
  grossRevenue: Decimal // inc GST
  netRevenueExGst: Decimal
  covers: number
  voids: number
  comps: number
  averageSpend: Decimal
  topItems: EodTopItem[]
  source: "csv" | "html"
}

// ─── Money / number helpers ─────────────────────────────────────────────────

function parseMoney(raw: string | undefined | null): Decimal {
  if (!raw) return new Decimal(0)
  // Strip $, commas, spaces, and any stray currency codes.
  const cleaned = String(raw)
    .replace(/[$,\s]/g, "")
    .replace(/AUD/gi, "")
    .replace(/[^\d.\-]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === ".") return new Decimal(0)
  try {
    return new Decimal(cleaned)
  } catch {
    return new Decimal(0)
  }
}

function parseInt10(raw: string | undefined | null): number {
  if (!raw) return 0
  const n = parseInt(String(raw).replace(/[^\d\-]/g, ""), 10)
  return Number.isFinite(n) ? n : 0
}

// ─── CSV parsing ────────────────────────────────────────────────────────────

/**
 * Minimal CSV parser that understands quoted fields with embedded commas.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    rows.push(parseCsvLine(line))
  }
  return rows
}

/**
 * Fuzzy header matcher — returns the first column index whose label contains
 * any of the needles (case-insensitive). Returns -1 if none match.
 */
function findCol(headers: string[], needles: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase()
    if (needles.some((n) => h.includes(n))) return i
  }
  return -1
}

/**
 * Parse a Lightspeed EOD CSV buffer. Tries to detect either the
 * "summary by location" shape or the "top items by location" shape.
 * Returns an empty array if no recognisable header is found.
 */
export function parseLightspeedCsv(buffer: Buffer): EodReport[] {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "") // strip BOM
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  // Locate the header row (first row containing recognisable columns)
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]
    if (row.length < 2) continue
    const joined = row.join("|").toLowerCase()
    if (
      joined.includes("location") &&
      (joined.includes("total") ||
        joined.includes("revenue") ||
        joined.includes("sales") ||
        joined.includes("net"))
    ) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return []

  const headers = rows[headerIdx]
  const data = rows.slice(headerIdx + 1)

  const colLocation = findCol(headers, ["location", "outlet", "site", "venue"])
  const colDate = findCol(headers, ["date", "day"])
  const colGross = findCol(headers, ["gross", "total sales", "total inc", "total (inc"])
  const colNet = findCol(headers, ["net", "ex gst", "excl", "ex-gst"])
  const colCovers = findCol(headers, ["covers", "guests", "transactions"])
  const colVoids = findCol(headers, ["void"])
  const colComps = findCol(headers, ["comp", "discount"])
  const colItemName = findCol(headers, ["item", "product", "menu item"])
  const colQty = findCol(headers, ["qty", "quantity", "units sold", "sold"])
  const colRevenue = findCol(headers, ["revenue", "amount", "total"])

  // Two modes: summary-per-location (one row per location)
  // or itemised (multiple rows per location with an item column).
  if (colLocation === -1) return []

  const byLocation = new Map<string, EodReport>()

  if (colItemName !== -1 && colQty !== -1) {
    // Itemised mode — group by location
    for (const r of data) {
      if (r.length <= colLocation) continue
      const loc = r[colLocation]?.trim()
      if (!loc) continue

      const existing =
        byLocation.get(loc) ??
        ({
          locationName: loc,
          date: r[colDate]?.trim() ?? "",
          grossRevenue: new Decimal(0),
          netRevenueExGst: new Decimal(0),
          covers: 0,
          voids: 0,
          comps: 0,
          averageSpend: new Decimal(0),
          topItems: [],
          source: "csv",
        } as EodReport)

      const itemName = r[colItemName]?.trim() ?? ""
      const qty = parseInt10(r[colQty])
      const revenue =
        colRevenue !== -1 ? parseMoney(r[colRevenue]) : new Decimal(0)

      if (itemName) {
        existing.topItems.push({ name: itemName, qty, revenue })
        existing.grossRevenue = existing.grossRevenue.plus(revenue)
      }

      byLocation.set(loc, existing)
    }

    // Derive netRevenueExGst if missing (grossRevenue / 1.1 for AU GST)
    for (const report of byLocation.values()) {
      if (report.netRevenueExGst.isZero() && !report.grossRevenue.isZero()) {
        report.netRevenueExGst = report.grossRevenue.div(1.1)
      }
      report.topItems.sort((a, b) => Number(b.revenue.minus(a.revenue)))
      report.topItems = report.topItems.slice(0, 20)
    }
  } else {
    // Summary-per-location mode
    for (const r of data) {
      if (r.length <= colLocation) continue
      const loc = r[colLocation]?.trim()
      if (!loc) continue

      const gross =
        colGross !== -1 ? parseMoney(r[colGross]) : new Decimal(0)
      const net =
        colNet !== -1
          ? parseMoney(r[colNet])
          : gross.isZero()
            ? new Decimal(0)
            : gross.div(1.1)
      const covers = colCovers !== -1 ? parseInt10(r[colCovers]) : 0
      const avgSpend = covers > 0 ? net.div(covers) : new Decimal(0)

      byLocation.set(loc, {
        locationName: loc,
        date: r[colDate]?.trim() ?? "",
        grossRevenue: gross,
        netRevenueExGst: net,
        covers,
        voids: colVoids !== -1 ? parseInt10(r[colVoids]) : 0,
        comps: colComps !== -1 ? parseInt10(r[colComps]) : 0,
        averageSpend: avgSpend,
        topItems: [],
        source: "csv",
      })
    }
  }

  return Array.from(byLocation.values())
}

// ─── HTML parsing ───────────────────────────────────────────────────────────

/**
 * Very small HTML table walker — no dependency. Extracts rows of <td> text
 * from every <table> in the document. Returns [tableRows, tableRows, ...].
 */
function extractHtmlTables(html: string): string[][][] {
  const tables: string[][][] = []
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi

  let tableMatch
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1]
    const rows: string[][] = []
    let rowMatch
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1]
      const cells: string[] = []
      let cellMatch
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const raw = cellMatch[1]
        const text = raw
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, " ")
          .trim()
        cells.push(text)
      }
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length > 0) tables.push(rows)
  }
  return tables
}

/**
 * Parse a Lightspeed EOD HTML email body. Walks every table, tries to spot
 * one that looks like "Location | Sales | Covers ..." or "Item | Qty | $".
 */
export function parseLightspeedHtml(html: string): EodReport[] {
  const tables = extractHtmlTables(html)
  if (tables.length === 0) return []

  const byLocation = new Map<string, EodReport>()

  for (const table of tables) {
    if (table.length < 2) continue
    const headers = table[0].map((h) => h.toLowerCase())
    const body = table.slice(1)

    const colLocation = findCol(headers, ["location", "outlet", "site", "venue"])
    const colGross = findCol(headers, ["gross", "total sales", "total inc", "total (inc"])
    const colNet = findCol(headers, ["net", "ex gst", "excl"])
    const colCovers = findCol(headers, ["covers", "guests", "transactions"])
    const colVoids = findCol(headers, ["void"])
    const colComps = findCol(headers, ["comp", "discount"])
    const colItemName = findCol(headers, ["item", "product", "menu item"])
    const colQty = findCol(headers, ["qty", "quantity", "units sold", "sold"])
    const colRevenue = findCol(headers, ["revenue", "amount", "total"])

    if (colLocation !== -1 && colGross !== -1) {
      for (const r of body) {
        const loc = r[colLocation]?.trim()
        if (!loc) continue
        const gross = parseMoney(r[colGross])
        const net =
          colNet !== -1
            ? parseMoney(r[colNet])
            : gross.isZero()
              ? new Decimal(0)
              : gross.div(1.1)
        const covers = colCovers !== -1 ? parseInt10(r[colCovers]) : 0
        const existing =
          byLocation.get(loc) ??
          ({
            locationName: loc,
            date: "",
            grossRevenue: new Decimal(0),
            netRevenueExGst: new Decimal(0),
            covers: 0,
            voids: 0,
            comps: 0,
            averageSpend: new Decimal(0),
            topItems: [],
            source: "html",
          } as EodReport)
        existing.grossRevenue = gross
        existing.netRevenueExGst = net
        existing.covers = covers
        existing.voids = colVoids !== -1 ? parseInt10(r[colVoids]) : existing.voids
        existing.comps = colComps !== -1 ? parseInt10(r[colComps]) : existing.comps
        existing.averageSpend = covers > 0 ? net.div(covers) : new Decimal(0)
        byLocation.set(loc, existing)
      }
    } else if (colItemName !== -1 && colQty !== -1) {
      // Item table — try to find location context above (not reliable; use single 'default' bucket)
      const bucket = "__default__"
      const existing =
        byLocation.get(bucket) ??
        ({
          locationName: bucket,
          date: "",
          grossRevenue: new Decimal(0),
          netRevenueExGst: new Decimal(0),
          covers: 0,
          voids: 0,
          comps: 0,
          averageSpend: new Decimal(0),
          topItems: [],
          source: "html",
        } as EodReport)
      for (const r of body) {
        const name = r[colItemName]?.trim() ?? ""
        if (!name) continue
        const qty = parseInt10(r[colQty])
        const revenue =
          colRevenue !== -1 ? parseMoney(r[colRevenue]) : new Decimal(0)
        existing.topItems.push({ name, qty, revenue })
      }
      existing.topItems.sort((a, b) => Number(b.revenue.minus(a.revenue)))
      existing.topItems = existing.topItems.slice(0, 20)
      byLocation.set(bucket, existing)
    }
  }

  return Array.from(byLocation.values())
}

// ─── Message orchestrator ──────────────────────────────────────────────────

type GetAttachmentFn = (
  messageId: string,
  attachmentId: string
) => Promise<Buffer>

/**
 * Walk MIME parts to find the first part matching a predicate.
 */
function findMimePart(
  part: GmailAttachmentPart | undefined,
  predicate: (p: GmailAttachmentPart) => boolean
): GmailAttachmentPart | undefined {
  if (!part) return undefined
  if (predicate(part)) return part
  const parts = (part as { parts?: GmailAttachmentPart[] }).parts ?? []
  for (const sub of parts) {
    const found = findMimePart(sub, predicate)
    if (found) return found
  }
  return undefined
}

/**
 * Extract all CSV/XLSX-looking attachment IDs from a Gmail message payload.
 */
function extractCsvAttachments(message: GmailMessageShape): Array<{
  attachmentId: string
  filename: string
  mimeType: string
}> {
  const results: Array<{
    attachmentId: string
    filename: string
    mimeType: string
  }> = []
  const walk = (part: GmailAttachmentPart | undefined) => {
    if (!part) return
    const body = (part as { body?: { attachmentId?: string } }).body
    const filename = (part as { filename?: string }).filename ?? ""
    const mimeType = (part as { mimeType?: string }).mimeType ?? ""
    if (
      body?.attachmentId &&
      (mimeType.includes("csv") ||
        mimeType.includes("excel") ||
        mimeType.includes("spreadsheet") ||
        filename.toLowerCase().endsWith(".csv") ||
        filename.toLowerCase().endsWith(".xlsx"))
    ) {
      results.push({ attachmentId: body.attachmentId, filename, mimeType })
    }
    const parts = (part as { parts?: GmailAttachmentPart[] }).parts ?? []
    for (const sub of parts) walk(sub)
  }
  walk(message.payload)
  return results
}

/**
 * Decode a base64url HTML body from a Gmail message payload.
 */
function extractHtmlBody(message: GmailMessageShape): string | null {
  const htmlPart = findMimePart(message.payload, (p) => {
    const mt = (p as { mimeType?: string }).mimeType ?? ""
    return mt === "text/html"
  })
  if (!htmlPart) return null
  const data = (htmlPart as { body?: { data?: string } }).body?.data
  if (!data) return null
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/")
  try {
    return Buffer.from(normalized, "base64").toString("utf-8")
  } catch {
    return null
  }
}

/**
 * Orchestrate parsing: try each CSV attachment; fall back to HTML body.
 * Returns the union of parsed EodReport records.
 */
export async function parseLightspeedReportMessage(
  message: GmailMessageShape,
  getAttachmentFn: GetAttachmentFn
): Promise<EodReport[]> {
  const csvAttachments = extractCsvAttachments(message)
  const reports: EodReport[] = []

  for (const att of csvAttachments) {
    try {
      // For now we only parse .csv — .xlsx would need a dependency. Skip .xlsx
      // but leave the hook so we can add it later.
      if (!att.filename.toLowerCase().endsWith(".csv")) continue
      const buffer = await getAttachmentFn(message.id, att.attachmentId)
      const parsed = parseLightspeedCsv(buffer)
      reports.push(...parsed)
    } catch {
      // Continue — try next attachment or fall back to HTML
    }
  }

  if (reports.length === 0) {
    const html = extractHtmlBody(message)
    if (html) {
      try {
        reports.push(...parseLightspeedHtml(html))
      } catch {
        // ignore — caller will log
      }
    }
  }

  return reports
}
