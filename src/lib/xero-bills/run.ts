/**
 * Kitchen to Xero DRAFT supplier bills: one run (dry or live).
 *
 * Reads both orgs through the Inbox app, plans with plan.ts, and in a live
 * run creates the drafts one at a time per org:
 * - right before each create, the invoice number is looked up in BOTH orgs
 *   (any age, any status) so nothing keyed since the read is doubled;
 * - any Xero error stops that org's batch for the run, and is reported;
 * - a create that got no answer is never retried: the number is searched
 *   and, if the bill is there, it is recorded; if not, the batch stops;
 * - the PDF is attached when the accounting.attachments grant is in.
 * All IO comes in through `deps`, so the rules are unit tested.
 */
import { BILL_ORGS, coreName, learnKnownContacts, normNumber, planDrafts, type BillOrg, type Hold, type KitchenInvoice, type OrgRead, type PlannedDraft, type Skipped, type XeroBill } from "./plan"
import type { InboxBills } from "./inbox"

export interface RunDeps {
  inbox: InboxBills
  /** Every Kitchen invoice dated on or after the cutoff. */
  loadInvoices(cutoff: string): Promise<KitchenInvoice[]>
  /** Kitchen invoices of the last months, to learn supplier to contact. */
  loadHistory(since: string): Promise<Pick<KitchenInvoice, "supplierName" | "venue" | "invoiceNumber" | "invoiceDate" | "total">[]>
  markPushed(invoiceId: string, org: BillOrg, xeroInvoiceId: string): Promise<void>
  markError(invoiceId: string, error: string): Promise<void>
  markAttached(invoiceId: string): Promise<void>
  /** The invoice PDF, or null when Kitchen has none. */
  readPdf(invoiceId: string): Promise<{ filename: string; contentBase64: string } | null>
  sleep(ms: number): Promise<void>
}

export interface RunOptions {
  live: boolean
  /** yyyy-mm-dd */
  cutoff: string
  capPerOrg: number
  /** yyyy-mm-dd, "today" in AEST */
  today: string
  kitchenBaseUrl: string
  /** How far back Xero is read for coding, duplicates and number sequences. */
  readDays?: number
  /** Pause between Xero writes (the Inbox token allows 60 calls a minute an org). */
  paceMs?: number
}

export interface DraftLine {
  invoiceId: string
  /** e.g. a twin invoice in the other org */
  notes: string[]
  org: BillOrg
  supplier: string
  number: string
  date: string
  total: number
  contact: string
  lines: { account: string; tax: string; amount: number }[]
  split: boolean
  resplit: boolean
  xeroInvoiceId?: string
  attached?: boolean
}

export interface RunSummary {
  live: boolean
  cutoff: string
  capPerOrg: number
  attachmentsGranted: boolean
  /** live: created; dry: would create */
  drafted: Record<BillOrg, number>
  draftedTotal: Record<BillOrg, number>
  drafts: DraftLine[]
  holds: Hold[]
  skipped: Skipped[]
  /** Org batches that stopped early, with why. */
  stopped: { org: BillOrg; invoiceId: string; error: string }[]
  attachFailures: { invoiceId: string; error: string }[]
  /** Suppliers whose drafts should be re-split by line in Xero. */
  resplitSuppliers: string[]
}

const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
const cents = (n: number) => Math.round(n * 100)

function lineOf(d: PlannedDraft): DraftLine {
  return {
    invoiceId: d.invoiceId,
    org: d.org,
    supplier: d.supplierName,
    number: d.payload.InvoiceNumber,
    date: d.payload.Date,
    total: d.total,
    contact: d.contactName,
    lines: d.payload.LineItems.map((l) => ({ account: l.AccountCode, tax: l.TaxType, amount: l.UnitAmount })),
    split: d.split,
    resplit: d.resplit,
    notes: d.notes,
  }
}

/** A bill in Xero that is this draft already: same number, and the supplier's contact in that org (or its name). */
function sameBill(d: PlannedDraft, found: XeroBill[], org: BillOrg, contactCore: string, supplierCore: string): XeroBill | undefined {
  const id = org === d.org ? d.payload.Contact.ContactID : d.contactIds[org]
  return found.find(
    (b) =>
      normNumber(b.InvoiceNumber) === normNumber(d.payload.InvoiceNumber) &&
      ((id != null && b.Contact.ContactID === id) || [contactCore, supplierCore].includes(coreName(b.Contact.Name ?? "")))
  )
}

export async function runDraftBills(deps: RunDeps, opts: RunOptions): Promise<RunSummary> {
  const status = await deps.inbox.status()
  for (const org of BILL_ORGS) if (!status.orgs.includes(org)) throw new Error(`${org} is not linked to the Inbox app's Xero token`)
  // A rolling window back from today (not from the cutoff), so the newest bills are always read.
  const since = addDays(opts.today, -(opts.readDays ?? 200))
  // Both orgs or nothing: the duplicate check spans both.
  const orgs = {} as Record<BillOrg, OrgRead>
  for (const org of BILL_ORGS) orgs[org] = await deps.inbox.read(org, since)

  const [invoices, history] = await Promise.all([deps.loadInvoices(opts.cutoff), deps.loadHistory(since)])
  const known = learnKnownContacts(history, orgs)
  const plan = planDrafts(invoices, orgs, {
    cutoff: opts.cutoff,
    kitchenBaseUrl: opts.kitchenBaseUrl,
    capPerOrg: opts.capPerOrg,
    knownContacts: known,
    splitMixed: true,
  })

  const summary: RunSummary = {
    live: opts.live,
    cutoff: opts.cutoff,
    capPerOrg: opts.capPerOrg,
    attachmentsGranted: status.attachments,
    drafted: { "Tarte Bakery": 0, "Tarte Currumbin": 0 },
    draftedTotal: { "Tarte Bakery": 0, "Tarte Currumbin": 0 },
    drafts: [],
    holds: [...plan.holds],
    skipped: plan.skipped,
    stopped: [],
    attachFailures: [],
    resplitSuppliers: [],
  }
  const count = (d: PlannedDraft, line: DraftLine) => {
    summary.drafts.push(line)
    summary.drafted[d.org] += 1
    summary.draftedTotal[d.org] = Math.round((summary.draftedTotal[d.org] + d.total) * 100) / 100
  }
  const hold = (d: PlannedDraft, reason: string) =>
    summary.holds.push({ invoiceId: d.invoiceId, org: d.org, supplierName: d.supplierName, invoiceNumber: d.payload.InvoiceNumber, invoiceDate: d.payload.Date, total: d.total, reason })

  if (!opts.live) {
    for (const d of plan.drafts) count(d, lineOf(d))
  } else {
    for (const org of BILL_ORGS) {
      for (const d of plan.drafts.filter((x) => x.org === org)) {
        const contactCore = coreName(d.contactName)
        const supplierCore = coreName(d.supplierName)
        // 1. Is it in Xero now, in either org? (keyed since the read)
        let already: { org: BillOrg; bill: XeroBill } | null = null
        try {
          for (const o of BILL_ORGS) {
            const hit = sameBill(d, await deps.inbox.find(o, d.payload.InvoiceNumber), o, contactCore, supplierCore)
            if (hit) {
              already = { org: o, bill: hit }
              break
            }
          }
        } catch (e) {
          const error = `could not check Xero for this number before creating: ${e instanceof Error ? e.message : String(e)}`
          await deps.markError(d.invoiceId, error)
          summary.stopped.push({ org, invoiceId: d.invoiceId, error })
          break
        }
        if (already) {
          hold(d, `already in Xero: ${already.org} ${already.bill.Status} bill ${already.bill.InvoiceNumber ?? ""} dated ${already.bill.Date} (keyed since the read)`)
          continue
        }
        // 2. Create, once.
        const res = await deps.inbox.create(org, d.payload, `kitchen-${d.invoiceId}`)
        let xeroId: string | null = null
        if (res.ok) {
          xeroId = res.bill.InvoiceID
          await deps.markPushed(d.invoiceId, org, xeroId)
          if (res.bill.Status !== "DRAFT" || res.bill.Total == null || cents(res.bill.Total) !== cents(d.total)) {
            const error = `created ${xeroId} but Xero shows ${res.bill.Status} ${res.bill.Total}, not DRAFT ${d.total.toFixed(2)}; check it before anything else`
            await deps.markError(d.invoiceId, error)
            count(d, { ...lineOf(d), xeroInvoiceId: xeroId })
            summary.stopped.push({ org, invoiceId: d.invoiceId, error })
            break
          }
        } else if (res.kind === "already" || res.kind === "contact") {
          hold(d, res.kind === "already" ? "already in Xero (found by the Inbox app at create)" : res.error.replace(/^refused: /, ""))
          continue
        } else if (res.kind === "unknown") {
          // Never retried blind: look for it by number.
          let found: XeroBill | undefined
          try {
            found = sameBill(d, await deps.inbox.find(org, d.payload.InvoiceNumber), org, contactCore, supplierCore)
          } catch {
            found = undefined
          }
          if (found) {
            xeroId = found.InvoiceID
            await deps.markPushed(d.invoiceId, org, xeroId)
          } else {
            const error = `${res.error}; not found by number afterwards, so not retried`
            await deps.markError(d.invoiceId, error)
            summary.stopped.push({ org, invoiceId: d.invoiceId, error })
            break
          }
        } else {
          await deps.markError(d.invoiceId, res.error)
          summary.stopped.push({ org, invoiceId: d.invoiceId, error: res.error })
          break
        }
        const line: DraftLine = { ...lineOf(d), xeroInvoiceId: xeroId! }
        // 3. The PDF, when the grant is in.
        if (status.attachments) {
          const pdf = await deps.readPdf(d.invoiceId).catch(() => null)
          if (!pdf) summary.attachFailures.push({ invoiceId: d.invoiceId, error: "no PDF in Kitchen" })
          else {
            const a = await deps.inbox.attach(org, xeroId!, pdf.filename, pdf.contentBase64)
            if (a.ok) {
              await deps.markAttached(d.invoiceId)
              line.attached = true
            } else summary.attachFailures.push({ invoiceId: d.invoiceId, error: a.error ?? a.reason ?? "attach failed" })
          }
        }
        count(d, line)
        await deps.sleep(opts.paceMs ?? 1500)
      }
    }
  }
  summary.resplitSuppliers = [...new Set(summary.drafts.filter((d) => d.resplit).map((d) => d.supplier))].sort()
  return summary
}
