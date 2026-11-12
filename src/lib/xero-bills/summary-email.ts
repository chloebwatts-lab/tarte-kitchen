/**
 * The Kitchen draft bills summary, as an email to Chloe (first live run) and
 * as plain lines. Pure: no IO. Supplier figures, so it goes to chloe@ only
 * and its accounts@ Sent copy is trashed (subject on the private list,
 * src/lib/gmail/sent-tidy-rules.ts, key "draft-bills").
 */
import type { RunSummary } from "./run"

export const DRAFT_BILLS_SUBJECT_PREFIX = "Kitchen draft bills, "

const money = (n: number | null | undefined) =>
  n == null ? "" : `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const short = (org: string | null) => (org ?? "").replace(/^Tarte /, "")

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "2026-11-04" -> "Wed 4 Nov" */
function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function summarySubject(s: RunSummary, today: string): string {
  const b = s.drafted["Tarte Bakery"]
  const c = s.drafted["Tarte Currumbin"]
  return `${DRAFT_BILLS_SUBJECT_PREFIX}${dayLabel(today)}: ${b} Bakery, ${c} Currumbin ${s.live ? "drafted" : "would be drafted"}, ${s.holds.length} held`
}

/** The headline sentences: the whole email body (12 lines at most; the detail is the attached CSV). */
export function summaryLines(s: RunSummary): string[] {
  const out: string[] = []
  const n = s.drafted["Tarte Bakery"] + s.drafted["Tarte Currumbin"]
  out.push(
    s.live
      ? `Kitchen put ${n} DRAFT bills into Xero from supplier invoices dated ${dayLabel(s.cutoff)} on: Bakery ${s.drafted["Tarte Bakery"]} (${money(s.draftedTotal["Tarte Bakery"])}), Currumbin ${s.drafted["Tarte Currumbin"]} (${money(s.draftedTotal["Tarte Currumbin"])}). None is approved; the morning bill check approves the clean ones.`
      : `Dry run, nothing written to Xero: ${n} bills would be drafted from invoices dated ${dayLabel(s.cutoff)} on (Bakery ${s.drafted["Tarte Bakery"]}, Currumbin ${s.drafted["Tarte Currumbin"]}).`
  )
  if (s.holds.length) out.push(`${s.holds.length} held for a person, each with the reason, in the attached file.`)
  if (s.resplitSuppliers.length)
    out.push(`Re-split by line before approving: ${s.resplitSuppliers.join(", ")}. These suppliers spread items over several accounts, and the draft carries the main one.`)
  const twins = s.drafts.filter((d) => d.notes.some((x) => x.startsWith("twin in "))).length
  if (twins) out.push(`${twins} ${twins === 1 ? "has" : "have"} a twin at the other venue (same day and total, another number), noted in the file.`)
  out.push(
    s.attachmentsGranted
      ? s.attachFailures.length
        ? `The PDF is attached to each draft except ${s.attachFailures.length}.`
        : "The PDF is attached to each draft."
      : "PDFs are not attached yet (the Xero grant is still to come); each draft links to the invoice PDF in Kitchen."
  )
  for (const st of s.stopped.slice(0, 2)) out.push(`${short(st.org)} stopped early on one invoice: ${st.error}`)
  return out
}

/** The detail behind the summary: one row per draft and per hold. */
export function summaryCsv(s: RunSummary): string {
  const q = (v: string | number | null | undefined) => {
    let t = v == null ? "" : String(v)
    // A cell a spreadsheet would run as a formula is kept as text.
    if (/^[=+\-@]/.test(t)) t = `'${t}`
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const rows: (string | number | null | undefined)[][] = [["Result", "Venue", "Date", "Supplier", "Number", "Total", "Lines or reason", "Notes", "Xero bill"]]
  for (const d of s.drafts)
    rows.push([
      s.live ? "drafted" : "would draft",
      short(d.org),
      d.date,
      d.supplier,
      d.number,
      d.total.toFixed(2),
      d.lines.map((l) => `${l.account} ${l.tax} ${l.amount.toFixed(2)}`).join("; "),
      [...(d.resplit ? ["re-split by line"] : []), ...d.notes].join("; "),
      d.xeroInvoiceId ?? "",
    ])
  for (const h of s.holds) rows.push(["held", short(h.org), h.invoiceDate, h.supplierName, h.invoiceNumber, h.total == null ? "" : h.total.toFixed(2), h.reason, "", ""])
  for (const st of s.stopped) rows.push(["stopped", short(st.org), "", "", "", "", st.error, "", ""])
  return rows.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n"
}

export function summaryText(s: RunSummary): string {
  return [...summaryLines(s), "", "The full list is in the attached file."].join("\n")
}

export function summaryHtml(s: RunSummary): string {
  const p = (t: string) => `<p style="margin:0 0 10px;font:15px/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#2b2b2b">${esc(t)}</p>`
  return `<div style="max-width:640px">${[...summaryLines(s), "The full list is in the attached file."].map(p).join("")}</div>`
}

export function summaryFilename(today: string): string {
  return `kitchen-draft-bills-${today}.csv`
}
