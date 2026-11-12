/**
 * Kitchen to Xero DRAFT supplier bills: the planning step (no Xero calls).
 *
 * Spec: tarte-loose-ends/reference/kitchen-xero-draft-bills-spec.md (Chloe,
 * 12 Nov 2026: "Yes, Kitchen drafts them"). Given the Kitchen invoices and a
 * read of each Xero org (active contacts, recent ACCPAY bills), decide for
 * every invoice either one DRAFT bill payload or a hold with a plain reason.
 *
 * Safety rules kept here, so no caller can skip them:
 * - Status is always DRAFT and Type ACCPAY. Nothing here can authorise.
 * - Only an EXISTING contact. Never a new one: no match is a hold.
 * - Coding (account, tax type) comes from the supplier's own AUTHORISED or
 *   PAID bills in that org: its most used account by amount over the last 10
 *   bills, for the GST kind wanted. No history is a hold.
 * - The bill total must equal the Kitchen total to the cent. GST must be 10%
 *   of the subtotal or nil (within 2 cents); with splitMixed, an invoice whose
 *   GST is between those becomes two lines, the GST items (GST / 10%) and the
 *   GST-free rest, the way mixed invoices were keyed by hand. Anything else
 *   is a hold.
 * - Duplicates: the same supplier and invoice number already in EITHER org,
 *   any status (Dext and hand-keyed drafts included), is a hold. So is the
 *   same supplier, date and total under a different number.
 * - Date suspect: a number below most of the same supplier's numbers from
 *   one to four months before this invoice's date is an old invoice re-sent
 *   (often with a statement, sometimes a disputed one): a hold, never a draft.
 */

export const BILL_ORGS = ["Tarte Bakery", "Tarte Currumbin"] as const
export type BillOrg = (typeof BILL_ORGS)[number]

/** Kitchen venue to Xero org. Tea Garden and BOTH are held for a person. */
export const ORG_FOR_VENUE: Record<string, BillOrg> = {
  BURLEIGH: "Tarte Bakery",
  BEACH_HOUSE: "Tarte Currumbin",
}

/** Kitchen statuses that can become a bill (APPROVED = extracted and its
 *  price changes resolved in Kitchen). Everything else is never pushed. */
export const PUSHABLE_STATUSES = new Set(["EXTRACTED", "MATCHED", "APPROVED"])

export interface KitchenInvoice {
  id: string
  supplierName: string
  venue: string | null
  invoiceNumber: string | null
  /** yyyy-mm-dd: Kitchen's date (the email date when the document's own date looked wrong) */
  invoiceDate: string | null
  /** yyyy-mm-dd as read off the document (extractedData.invoiceDate), when there is one */
  documentDate?: string | null
  /** Off the document when the extractor reads them: money already received, and the balance left. */
  amountReceived?: number | null
  balanceDue?: number | null
  dueDate: string | null
  subtotal: number | null
  gst: number | null
  total: number | null
  status: string
  hasPdf: boolean
  /** Set once pushed; such rows are never pushed again. */
  xeroInvoiceId?: string | null
  /** The last push failed (or got no answer): held until a person clears it. */
  pushError?: string | null
}

export interface XeroContact {
  ContactID: string
  Name: string
}

export interface XeroBillLine {
  AccountCode?: string
  TaxType?: string
  LineAmount?: number
  Tracking?: { Name?: string; Option?: string; TrackingCategoryID?: string; TrackingOptionID?: string }[]
}

export interface XeroBill {
  InvoiceID: string
  Type?: string
  Status: string
  InvoiceNumber?: string
  Contact: { ContactID: string; Name?: string }
  /** yyyy-mm-dd */
  Date: string
  DueDate?: string | null
  Total?: number
  LineItems?: XeroBillLine[]
  Url?: string
}

export interface OrgRead {
  contacts: XeroContact[]
  /** Recent ACCPAY bills, any status: coding history and duplicate check. */
  bills: XeroBill[]
}

export interface DraftPayload {
  Type: "ACCPAY"
  Status: "DRAFT"
  Contact: { ContactID: string }
  Date: string
  DueDate: string
  InvoiceNumber: string
  Reference: string
  Url?: string
  LineAmountTypes: "Exclusive"
  LineItems: {
    Description: string
    Quantity: 1
    UnitAmount: number
    AccountCode: string
    TaxType: string
    TaxAmount: number
    Tracking?: { Name: string; Option: string }[]
  }[]
}

export interface PlannedDraft {
  invoiceId: string
  org: BillOrg
  supplierName: string
  contactName: string
  matchedBy: MatchTier
  /** Two lines: GST items and GST-free items. */
  split: boolean
  /** The supplier spreads items over several accounts: the approver re-splits by line in Xero. */
  resplit: boolean
  /** The latest bill the coding was read from. */
  codedFrom: { invoiceNumber: string; date: string }
  /** This supplier's contact in each org (for the duplicate check right before create). */
  contactIds: Partial<Record<BillOrg, string>>
  /** Things the approver should know (e.g. a twin invoice in the other org). */
  notes: string[]
  total: number
  payload: DraftPayload
}

export interface Hold {
  invoiceId: string
  org: BillOrg | null
  supplierName: string
  invoiceNumber: string | null
  invoiceDate: string | null
  total: number | null
  reason: string
}

export interface Skipped {
  invoiceId: string
  supplierName: string
  status: string
  reason: string
}

export interface PlanResult {
  drafts: PlannedDraft[]
  holds: Hold[]
  skipped: Skipped[]
}

export interface PlanOptions {
  /** yyyy-mm-dd: invoices dated before this are never pushed. */
  cutoff: string
  /** e.g. https://kitchen.tarte.com.au; the bill Url is <base>/api/invoices/<id>/pdf */
  kitchenBaseUrl?: string
  /** Most drafts per org in this run (live day 1 cap). */
  capPerOrg?: number
  /** Kitchen supplier name (lowercased) to a known ContactID per org. */
  knownContacts?: Partial<Record<BillOrg, Record<string, string>>>
  /** Draft an invoice with mixed GST and GST-free items as two lines. */
  splitMixed?: boolean
}

// ---------- helpers ----------

const round2 = (n: number) => Math.round(n * 100) / 100
const cents = (n: number) => Math.round(n * 100)

/** Case and punctuation insensitive: "Bidfood (Gold Coast) Pty. Ltd." -> "bidfood gold coast pty ltd" */
export function looseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

const SUFFIXES = /\b(pty|ltd|limited|proprietary|the|trust|trustee|for|atf|co|company|australia|aust|au|qld|group)\b/g

/** looseName without company suffixes: "the bidfood group pty ltd" -> "bidfood" */
export function coreName(s: string): string {
  return looseName(s).replace(SUFFIXES, " ").replace(/\s+/g, " ").trim()
}

/** "INV-000123 " -> "123"; "AB/0045" -> "AB45". Used only to compare numbers. */
export function normNumber(s: string | null | undefined): string {
  if (!s) return ""
  let n = s.toUpperCase().replace(/[^A-Z0-9]/g, "")
  n = n.replace(/^(INVOICE|INV|TAXINVOICE|TI)(?=\d)/, "")
  n = n.replace(/^0+(?=\d)/, "")
  // Leading zeros after a letter prefix: "AB0045" -> "AB45"
  n = n.replace(/^([A-Z]+)0+(?=\d)/, "$1")
  return n
}

export type MatchTier = "known" | "exact" | "loose" | "core"

/**
 * The supplier's Xero contact in one org. Learned (known) first, then the
 * exact name, then case and punctuation insensitive, then without company
 * suffixes. When a name tier finds more than one contact, the one on the most
 * recently dated bill wins (a supplier keyed under two contacts); with no
 * bills to tell them apart it is a hold.
 */
export function matchContact(
  supplierName: string,
  contacts: XeroContact[],
  known?: Record<string, string>,
  lastBillDate?: Map<string, string>
): { contact: XeroContact; tier: MatchTier } | { contact: null; reason: string } {
  const knownId = known?.[supplierName.toLowerCase()]
  if (knownId) {
    const c = contacts.find((x) => x.ContactID === knownId)
    if (c) return { contact: c, tier: "known" }
  }
  const pick = (found: XeroContact[], tier: MatchTier) => {
    if (found.length === 1) return { contact: found[0], tier }
    const dated = found.filter((c) => lastBillDate?.get(c.ContactID)).sort((a, b) => (lastBillDate!.get(b.ContactID)! < lastBillDate!.get(a.ContactID)! ? -1 : 1))
    if (dated.length && (dated.length === 1 || lastBillDate!.get(dated[0].ContactID) !== lastBillDate!.get(dated[1].ContactID))) return { contact: dated[0], tier }
    return { contact: null, reason: `more than one Xero contact matches "${supplierName}"` }
  }
  const exact = contacts.filter((c) => c.Name === supplierName)
  if (exact.length) return pick(exact, "exact")
  const ln = looseName(supplierName)
  const loose = contacts.filter((c) => looseName(c.Name) === ln)
  if (loose.length) return pick(loose, "loose")
  const cn = coreName(supplierName)
  if (cn.length >= 4) {
    const core = contacts.filter((c) => coreName(c.Name) === cn)
    if (core.length) return pick(core, "core")
  }
  return { contact: null, reason: `no Xero contact matches "${supplierName}" (contacts are never created)` }
}

/** Latest bill date per contact in one org's bills. */
export function lastBillDates(bills: XeroBill[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const b of bills) {
    if ((b.Type ?? "ACCPAY") !== "ACCPAY" || b.Status === "DELETED" || b.Status === "VOIDED") continue
    const d = m.get(b.Contact.ContactID)
    if (!d || b.Date > d) m.set(b.Contact.ContactID, b.Date)
  }
  return m
}

/**
 * Two invoice numbers one slip apart: a character added or dropped, or two
 * neighbours swapped, or one character changed. One changed digit between
 * two plain numbers within TWIN_NUMBER_GAP of each other is the next invoice
 * in the supplier's sequence (twin weekly orders, one per venue), not a slip.
 */
export function oneSlipApart(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const diff: number[] = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i)
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true
    // One changed digit in plain numbers: the next invoice in the sequence
    // when the two are close (twin weekly orders), a misread when far apart.
    if (diff.length === 1) return !(/^\d+$/.test(a) && /^\d+$/.test(b)) || Math.abs(Number(a) - Number(b)) > TWIN_NUMBER_GAP
    return false
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a]
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return true
  return false
}

/** AU tax types by GST rate. Unknown types hold. */
const TEN_PCT = new Set(["INPUT", "CAPEXINPUT", "INPUT2", "GSTONCAPIMPORTS"])
const NIL = new Set(["EXEMPTEXPENSES", "BASEXCLUDED", "INPUTTAXED", "EXEMPTCAPITAL", "GSTONIMPORTS"])

export type GstKind = "ten" | "nil"
export function taxKind(taxType: string | undefined): GstKind | null {
  if (!taxType) return null
  if (TEN_PCT.has(taxType)) return "ten"
  if (NIL.has(taxType)) return "nil"
  return null
}

/** The GST the Kitchen invoice carries: 10% or nil (2 cent tolerance), else null. */
export function gstKindOf(subtotal: number, gst: number): GstKind | null {
  const g = cents(gst)
  if (Math.abs(g) <= 2) return "nil"
  // In tenths of a cent, exactly: GST x 10 against the subtotal, 2 cents either way.
  if (Math.abs(g * 10 - cents(subtotal)) <= 20) return "ten"
  return null
}

const CODED_STATUSES = new Set(["AUTHORISED", "PAID"])

export interface Coding {
  accountCode: string
  taxType: string
  tracking?: { Name: string; Option: string }[]
  termsDays: number | null
  fromNumber: string
  fromDate: string
  /** Share of this GST kind's money the chosen account carried (0 to 1). */
  mainShare: number
}

/** Due dates worked out from a supplier's last bill stop at this many days. */
export const MAX_COMPUTED_TERMS_DAYS = 30
/** The document's own date and Kitchen's may differ by this much before it is a hold. */
export const DOCUMENT_DATE_SLACK_DAYS = 7

/** Under this share, the supplier spreads items over several accounts. */
export const RESPLIT_BELOW = 0.8

/** Bills read for a supplier's usual account: the latest this many. */
export const CODING_LOOKBACK = 10

/**
 * Coding for one supplier in one org, for the GST kind wanted: over its
 * latest CODING_LOOKBACK AUTHORISED or PAID bills, the account and tax type
 * that carried the most money on lines of that kind. Suppliers like a
 * broadline wholesaler spread taxable lines over several accounts, so the
 * most used one beats whatever the very last bill happened to carry.
 */
export function codingFor(contactId: string, bills: XeroBill[], want: GstKind): Coding | { reason: string } {
  const mine = bills
    .filter((b) => b.Contact.ContactID === contactId && CODED_STATUSES.has(b.Status) && (b.Type ?? "ACCPAY") === "ACCPAY")
    .sort((a, b) => (a.Date < b.Date ? 1 : a.Date > b.Date ? -1 : 0))
  if (!mine.length) return { reason: "no approved bill from this supplier in Xero to copy the account coding from" }
  const recent = mine.slice(0, CODING_LOOKBACK)
  const pool = recent.some((b) => (b.LineItems ?? []).some((l) => l.AccountCode && taxKind(l.TaxType) === want)) ? recent : mine
  const weight = new Map<string, { amount: number; latest: XeroBill; line: XeroBillLine }>()
  for (const b of pool) {
    for (const l of b.LineItems ?? []) {
      if (!l.AccountCode || taxKind(l.TaxType) !== want) continue
      const k = `${l.AccountCode}|${l.TaxType}`
      const w = weight.get(k)
      if (w) w.amount += Math.abs(l.LineAmount ?? 0)
      else weight.set(k, { amount: Math.abs(l.LineAmount ?? 0), latest: b, line: l })
    }
  }
  if (!weight.size)
    return {
      reason:
        want === "ten"
          ? "this invoice has GST but the supplier's approved bills in Xero are all GST-free"
          : "this invoice has no GST but the supplier's approved bills in Xero all carry GST",
    }
  const ranked = [...weight.values()].sort((a, b) => b.amount - a.amount)
  const top = ranked[0]
  const all = ranked.reduce((s, w) => s + w.amount, 0)
  const tracking = (top.line.Tracking ?? []).filter((t) => t.Name && t.Option).map((t) => ({ Name: t.Name!, Option: t.Option! }))
  const last = mine[0]
  const terms = last.DueDate ? Math.round((Date.parse(last.DueDate) - Date.parse(last.Date)) / 86400000) : null
  return {
    accountCode: top.line.AccountCode!,
    taxType: top.line.TaxType!,
    ...(tracking.length ? { tracking } : {}),
    // Computed terms never run past 30 days; a longer due date must be on the document.
    termsDays: terms != null && terms >= 0 ? Math.min(terms, MAX_COMPUTED_TERMS_DAYS) : null,
    fromNumber: top.latest.InvoiceNumber ?? top.latest.InvoiceID,
    fromDate: top.latest.Date,
    mainShare: all > 0 ? top.amount / all : 1,
  }
}

/** "INV-000290275" -> { prefix: "", digits: "290275" }; "OMI35877" -> { prefix: "OMI", digits: "35877" } */
export function numberParts(s: string | null | undefined): { prefix: string; value: number; width: number } | null {
  const n = normNumber(s)
  const m = /^([A-Z]*)(\d+)$/.exec(n)
  if (!m || m[2].length < 3 || m[2].length > 12) return null
  return { prefix: m[1], value: Number(m[2]), width: m[2].length }
}

/** The supplier's numbers this far back are compared: from 120 to 30 days before the invoice date. */
export const DATE_SUSPECT_FROM_DAYS = 120
export const DATE_SUSPECT_TO_DAYS = 30
/** At least this many of them, so one mis-keyed number cannot raise it. */
export const DATE_SUSPECT_MIN_BILLS = 3

/**
 * An invoice number below the median of the same supplier's numbers (same
 * prefix and length) on bills dated 30 to 120 days before this invoice. A
 * real new invoice sits above all of those; an old one re-sent sits below.
 * Returns the median bill as the example, or null.
 */
export function dateSuspect(
  number: string,
  invoiceDate: string,
  supplierBills: { InvoiceNumber?: string; Date: string; org: BillOrg }[]
): { InvoiceNumber: string; Date: string; org: BillOrg } | null {
  const mine = numberParts(number)
  if (!mine) return null
  const day = Date.parse(`${invoiceDate}T00:00:00Z`)
  const from = day - DATE_SUSPECT_FROM_DAYS * 86400000
  const to = day - DATE_SUSPECT_TO_DAYS * 86400000
  const seen = new Set<string>()
  const pool: { InvoiceNumber: string; Date: string; org: BillOrg; value: number }[] = []
  for (const b of supplierBills) {
    const p = numberParts(b.InvoiceNumber)
    const at = Date.parse(`${b.Date}T00:00:00Z`)
    if (!p || p.prefix !== mine.prefix || p.width !== mine.width || at < from || at > to) continue
    const key = `${p.value}`
    if (seen.has(key)) continue
    seen.add(key)
    pool.push({ InvoiceNumber: b.InvoiceNumber!, Date: b.Date, org: b.org, value: p.value })
  }
  if (pool.length < DATE_SUSPECT_MIN_BILLS) return null
  const values = pool.map((x) => x.value).sort((a, b) => a - b)
  const median = values[Math.floor((values.length - 1) / 2)]
  if (mine.value >= median) return null
  const example = pool.find((x) => x.value === median)!
  return { InvoiceNumber: example.InvoiceNumber, Date: example.Date, org: example.org }
}

/** Plain-number invoices this close are the supplier's sequence (twins), not a misread. */
export const TWIN_NUMBER_GAP = 50

/** yyyy-mm-dd that is a real day ("2026-02-30" is not). */
export function realDate(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}

const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

// ---------- the plan ----------

type Indexed = { org: BillOrg; bill: XeroBill; contactCore: string }

export function planDrafts(invoices: KitchenInvoice[], orgs: Record<BillOrg, OrgRead>, opts: PlanOptions): PlanResult {
  const drafts: PlannedDraft[] = []
  const holds: Hold[] = []
  const skipped: Skipped[] = []
  const perOrg = new Map<BillOrg, number>()
  /** supplier + normalised number, across both orgs, from the first sight of each invoice */
  const batchKeys = new Set<string>()

  // Every Xero bill in both orgs, keyed for the duplicate checks.
  const xeroByNumber = new Map<string, Indexed[]>()
  const xeroByDateTotal = new Map<string, Indexed[]>()
  const lastBill = {} as Record<BillOrg, Map<string, string>>
  for (const org of BILL_ORGS) {
    lastBill[org] = lastBillDates(orgs[org].bills)
    const names = new Map(orgs[org].contacts.map((c) => [c.ContactID, c.Name]))
    for (const bill of orgs[org].bills) {
      if ((bill.Type ?? "ACCPAY") !== "ACCPAY") continue
      const contactCore = coreName(bill.Contact.Name ?? names.get(bill.Contact.ContactID) ?? "")
      const n = normNumber(bill.InvoiceNumber)
      if (n) xeroByNumber.set(n, [...(xeroByNumber.get(n) ?? []), { org, bill, contactCore }])
      if (bill.Total != null && bill.Status !== "DELETED" && bill.Status !== "VOIDED") {
        const k = `${bill.Date}|${cents(bill.Total)}`
        xeroByDateTotal.set(k, [...(xeroByDateTotal.get(k) ?? []), { org, bill, contactCore }])
      }
    }
  }

  const sorted = [...invoices].sort((a, b) =>
    (a.invoiceDate ?? "") < (b.invoiceDate ?? "") ? -1 : (a.invoiceDate ?? "") > (b.invoiceDate ?? "") ? 1 : a.id < b.id ? -1 : 1
  )
  const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000

  for (const inv of sorted) {
    const base = {
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      total: inv.total,
    }
    if (inv.xeroInvoiceId) {
      skipped.push({ invoiceId: inv.id, supplierName: inv.supplierName, status: inv.status, reason: "already pushed" })
      continue
    }
    if (!PUSHABLE_STATUSES.has(inv.status)) {
      skipped.push({ invoiceId: inv.id, supplierName: inv.supplierName, status: inv.status, reason: `Kitchen status ${inv.status} is never pushed` })
      continue
    }
    if (!inv.invoiceDate || inv.invoiceDate < opts.cutoff) {
      skipped.push({ invoiceId: inv.id, supplierName: inv.supplierName, status: inv.status, reason: `dated before the cutoff ${opts.cutoff}` })
      continue
    }
    const org = inv.venue ? ORG_FOR_VENUE[inv.venue] ?? null : null
    const hold = (reason: string) => holds.push({ ...base, org, reason })

    const number = (inv.invoiceNumber ?? "").trim()
    if (!number) {
      hold("no invoice number in Kitchen")
      continue
    }
    // The same invoice twice in Kitchen (any venue): the first one seen goes
    // on, every other copy is held, even if the first is itself held.
    const supplierCore = coreName(inv.supplierName)
    const nn = normNumber(number)
    const bk = `${supplierCore}|${nn}`
    if (batchKeys.has(bk)) {
      hold("the same supplier and invoice number is in Kitchen twice; only the first is considered")
      continue
    }
    batchKeys.add(bk)
    if (inv.pushError) {
      hold(`the last push failed and is not retried until someone checks it and clears it: ${inv.pushError}`)
      continue
    }
    if (!org) {
      hold(inv.venue === "BOTH" ? "needs venue (Kitchen says BOTH)" : `needs venue (Kitchen says ${inv.venue ?? "none"})`)
      continue
    }
    if (/["\\]/.test(number)) {
      hold("the invoice number has a quote or backslash in it; key this one by hand")
      continue
    }
    // An old invoice re-sent (often with a statement): Kitchen files it under
    // the day it arrived, the document carries its real date.
    if (inv.documentDate !== undefined && inv.documentDate !== null) {
      if (!realDate(inv.documentDate)) {
        hold(`the document's date could not be read ("${inv.documentDate}"); check the PDF`)
        continue
      }
      if (dayDiff(inv.documentDate, inv.invoiceDate) > DOCUMENT_DATE_SLACK_DAYS) {
        hold(
          `date suspect: the document is dated ${inv.documentDate} but Kitchen filed it under ${inv.invoiceDate} (when it arrived), so it is probably an old invoice re-sent; check it is not on the never-pay list`
        )
        continue
      }
    }
    if (inv.subtotal == null || inv.total == null) {
      hold("Kitchen has no subtotal or total")
      continue
    }
    if (inv.total === 0) {
      hold("total is nil (a delivery docket or a misread invoice)")
      continue
    }
    if (inv.total < 0 || inv.subtotal <= 0) {
      hold("total is negative or the subtotal is nil (credit notes come in a later phase)")
      continue
    }
    if (inv.balanceDue != null && cents(inv.balanceDue) === 0) {
      hold("the document shows a balance of 0.00, so it looks already paid; check it is not on the never-pay list")
      continue
    }
    if (inv.amountReceived != null && cents(inv.amountReceived) >= cents(inv.total)) {
      hold("the document shows the amount received equals the total, so it looks already paid; check it is not on the never-pay list")
      continue
    }
    if ((inv.amountReceived != null && cents(inv.amountReceived) > 0) || (inv.balanceDue != null && cents(inv.balanceDue) > 0 && cents(inv.balanceDue) < cents(inv.total))) {
      hold("the document shows part of it already paid, so the bill would overstate what is owed; key it by hand")
      continue
    }
    const billDate = inv.documentDate ?? inv.invoiceDate
    if (billDate < opts.cutoff) {
      skipped.push({ invoiceId: inv.id, supplierName: inv.supplierName, status: inv.status, reason: `the document is dated ${billDate}, before the cutoff ${opts.cutoff}` })
      continue
    }
    const gst = inv.gst ?? round2(inv.total - inv.subtotal)
    const addsUp = cents(inv.subtotal) + cents(gst) === cents(inv.total)
    // The two parts of a two-line draft, ex GST: [GST items, GST-free items].
    let split: { taxable: number; free: number } | null = null
    let kind: GstKind | null = null
    if (addsUp) {
      kind = gstKindOf(inv.subtotal, gst)
      // Mixed: GST items worth GST / 10%, the rest GST-free. Only when both
      // parts are real amounts (at least a dollar each).
      const taxable = round2(gst * 10)
      if (!kind && opts.splitMixed === true && gst > 0 && taxable >= 1 && inv.subtotal - taxable >= 1)
        split = { taxable, free: round2(inv.subtotal - taxable) }
      if (!kind && !split) {
        hold(`GST does not reconcile: ${gst.toFixed(2)} on ${inv.subtotal.toFixed(2)} is neither 10% nor nil (likely mixed GST and GST-free lines)`)
        continue
      }
    } else {
      // A taxable fee outside the subtotal (a delivery or card fee): the
      // subtotal is the GST-free goods, and what is left of the total after
      // the subtotal and GST carries exactly that GST at 10%.
      const outside = round2(inv.total - inv.subtotal - gst)
      if (opts.splitMixed === true && gst > 0 && outside >= 0.5 && Math.abs(Math.round(outside * 10) - cents(gst)) <= 1)
        split = { taxable: outside, free: round2(inv.subtotal) }
      else {
        hold(`Kitchen figures do not add up: subtotal ${inv.subtotal.toFixed(2)} plus GST ${gst.toFixed(2)} is not the total ${inv.total.toFixed(2)}`)
        continue
      }
    }

    // This supplier's contact in each org: the draft's org must have one.
    const contactIds: Partial<Record<BillOrg, string>> = {}
    let m: ReturnType<typeof matchContact> | null = null
    for (const o of BILL_ORGS) {
      const r = matchContact(inv.supplierName, orgs[o].contacts, opts.knownContacts?.[o], lastBill[o])
      if (r.contact) contactIds[o] = r.contact.ContactID
      if (o === org) m = r
    }
    if (!m || !m.contact) {
      hold(m && !m.contact ? m.reason : "no Xero contact")
      continue
    }
    const contact = m.contact
    const contactCore = coreName(contact.Name)
    const isSupplier = (x: Indexed) =>
      (contactIds[x.org] != null && x.bill.Contact.ContactID === contactIds[x.org]) || x.contactCore === contactCore || x.contactCore === supplierCore

    // Duplicate guards, both orgs, any status.
    const byNum = (xeroByNumber.get(nn) ?? []).filter(isSupplier)
    if (byNum.length) {
      const x = byNum[0]
      hold(`already in Xero: ${x.org} ${x.bill.Status} bill ${x.bill.InvoiceNumber ?? ""} dated ${x.bill.Date}${x.bill.Url?.includes("dext") ? " (Dext)" : ""}`)
      continue
    }
    // Two Kitchen supplier names on one Xero contact: one draft per number.
    const ck = `${org}|${contact.ContactID}|${nn}`
    if (batchKeys.has(ck)) {
      hold("another Kitchen invoice with this number goes to the same Xero contact; only the first is considered")
      continue
    }
    batchKeys.add(ck)
    const notes: string[] = []
    const byDT = (xeroByDateTotal.get(`${billDate}|${cents(inv.total)}`) ?? []).filter(isSupplier)
    const dupDT = byDT.find((x) => x.org === org || !normNumber(x.bill.InvoiceNumber) || oneSlipApart(normNumber(x.bill.InvoiceNumber), nn))
    if (dupDT) {
      hold(
        `possible duplicate: ${dupDT.org} already has a ${dupDT.bill.Status} bill from this supplier dated ${dupDT.bill.Date} for the same total, numbered ${dupDT.bill.InvoiceNumber || "(none)"}`
      )
      continue
    }
    // Same day and total at the other venue under another number: twin weekly orders.
    for (const x of byDT) notes.push(`twin in ${x.org}: ${x.bill.InvoiceNumber} has the same date and total`)

    // Old invoice re-sent: its number sits below the supplier's sequence.
    const supplierBills = BILL_ORGS.flatMap((o) =>
      orgs[o].bills
        .filter((b) => (b.Type ?? "ACCPAY") === "ACCPAY" && b.Status !== "DELETED" && b.Status !== "VOIDED")
        .filter((b) => isSupplier({ org: o, bill: b, contactCore: coreName(b.Contact.Name ?? "") }))
        .map((b) => ({ InvoiceNumber: b.InvoiceNumber, Date: b.Date, org: o }))
    )
    const older = dateSuspect(number, billDate, supplierBills)
    if (older) {
      hold(
        `date suspect: number ${number} is below most of this supplier's numbers from one to four months earlier (for example ${older.InvoiceNumber} on ${older.Date}, ${older.org}), so it is probably an old invoice re-sent; check it is not on the never-pay list`
      )
      continue
    }

    const coding = codingFor(contact.ContactID, orgs[org].bills, kind ?? "ten")
    if ("reason" in coding) {
      hold(split ? `mixed GST invoice: ${coding.reason.replace("this invoice has GST but ", "")}` : coding.reason)
      continue
    }
    const freeCoding = split ? codingFor(contact.ContactID, orgs[org].bills, "nil") : null
    if (freeCoding && "reason" in freeCoding) {
      hold("mixed GST invoice, but the supplier's approved bills in Xero all carry GST, so there is no GST-free account to copy")
      continue
    }
    if (opts.capPerOrg != null && (perOrg.get(org) ?? 0) >= opts.capPerOrg) {
      hold(`over today's cap of ${opts.capPerOrg} drafts for ${org}; drafted on the next run`)
      continue
    }

    const dueFromInvoice = inv.dueDate && inv.dueDate >= billDate && inv.dueDate <= addDays(billDate, 120) ? inv.dueDate : null
    const dueDate = dueFromInvoice ?? addDays(billDate, coding.termsDays ?? 14)
    const taxAmount = kind === "nil" ? 0 : round2(gst)
    const line = (c: Coding, unit: number, tax: number, label: string) => ({
      Description: `${inv.supplierName} ${number}${label}`,
      Quantity: 1 as const,
      UnitAmount: round2(unit),
      AccountCode: c.accountCode,
      TaxType: c.taxType,
      TaxAmount: tax,
      ...(c.tracking ? { Tracking: c.tracking } : {}),
    })
    const lineItems =
      split && freeCoding && !("reason" in freeCoding)
        ? [line(coding, split.taxable, taxAmount, " (GST items)"), line(freeCoding, split.free, 0, " (GST-free items)")]
        : [line(coding, inv.subtotal, taxAmount, "")]
    const payload: DraftPayload = {
      Type: "ACCPAY",
      Status: "DRAFT",
      Contact: { ContactID: contact.ContactID },
      Date: billDate,
      DueDate: dueDate,
      InvoiceNumber: number,
      Reference: `Kitchen ${inv.id}`,
      ...(opts.kitchenBaseUrl ? { Url: `${opts.kitchenBaseUrl.replace(/\/$/, "")}/api/invoices/${inv.id}/pdf` } : {}),
      LineAmountTypes: "Exclusive",
      LineItems: lineItems,
    }
    // Belt and braces: the bill as Xero will total it must be the Kitchen total.
    const billCents = payload.LineItems.reduce((s, l) => s + cents(l.UnitAmount) + cents(l.TaxAmount), 0)
    if (billCents !== cents(inv.total)) {
      hold("the draft would not total the Kitchen total to the cent")
      continue
    }
    perOrg.set(org, (perOrg.get(org) ?? 0) + 1)
    drafts.push({
      invoiceId: inv.id,
      org,
      supplierName: inv.supplierName,
      contactName: contact.Name,
      matchedBy: m.tier,
      split: payload.LineItems.length > 1,
      resplit: coding.mainShare < RESPLIT_BELOW || (!!freeCoding && !("reason" in freeCoding) && freeCoding.mainShare < RESPLIT_BELOW),
      codedFrom: { invoiceNumber: coding.fromNumber, date: coding.fromDate },
      contactIds,
      notes,
      total: inv.total,
      payload,
    })
  }
  return { drafts, holds, skipped }
}

/** Fewest entered invoices that teach a supplier's contact (one is chance). */
export const LEARN_MIN_MATCHES = 2

/**
 * Kitchen supplier to Xero contact, learned from invoices already entered:
 * the same invoice number and total, dated within a week, in that org. A
 * contact needs at least LEARN_MIN_MATCHES such invoices (one could be a
 * coincidence or one bill keyed under the wrong supplier). When a supplier
 * was keyed under more than one contact, the one on the most recent bill
 * wins.
 */
export function learnKnownContacts(
  history: Pick<KitchenInvoice, "supplierName" | "venue" | "invoiceNumber" | "invoiceDate" | "total">[],
  orgs: Record<BillOrg, OrgRead>
): Partial<Record<BillOrg, Record<string, string>>> {
  const out: Partial<Record<BillOrg, Record<string, string>>> = {}
  for (const org of BILL_ORGS) {
    const byNum = new Map<string, XeroBill[]>()
    for (const b of orgs[org].bills) {
      if ((b.Type ?? "ACCPAY") !== "ACCPAY" || b.Status === "DELETED" || b.Status === "VOIDED") continue
      const n = normNumber(b.InvoiceNumber)
      if (n) byNum.set(n, [...(byNum.get(n) ?? []), b])
    }
    const seen = new Map<string, Map<string, { n: number; latest: string }>>()
    for (const h of history) {
      if (!h.venue || ORG_FOR_VENUE[h.venue] !== org || !h.invoiceNumber || h.total == null) continue
      const hits = (byNum.get(normNumber(h.invoiceNumber)) ?? []).filter(
        (b) =>
          b.Total != null &&
          cents(b.Total) === cents(h.total!) &&
          (!h.invoiceDate || Math.abs(Date.parse(b.Date) - Date.parse(h.invoiceDate)) <= 7 * 86400000)
      )
      if (hits.length !== 1) continue
      const key = h.supplierName.toLowerCase()
      const per = seen.get(key) ?? new Map<string, { n: number; latest: string }>()
      const id = hits[0].Contact.ContactID
      const cur = per.get(id) ?? { n: 0, latest: "" }
      per.set(id, { n: cur.n + 1, latest: hits[0].Date > cur.latest ? hits[0].Date : cur.latest })
      seen.set(key, per)
    }
    const map: Record<string, string> = {}
    for (const [k, per] of seen) {
      const ok = [...per.entries()].filter(([, v]) => v.n >= LEARN_MIN_MATCHES).sort((a, b) => (a[1].latest < b[1].latest ? 1 : a[1].latest > b[1].latest ? -1 : b[1].n - a[1].n))
      if (ok.length) map[k] = ok[0][0]
    }
    out[org] = map
  }
  return out
}
