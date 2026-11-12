import { test } from "node:test"
import assert from "node:assert/strict"
import { runDraftBills, type RunDeps } from "./run"
import type { CreateResult, InboxBills } from "./inbox"
import type { BillOrg, DraftPayload, KitchenInvoice, OrgRead, XeroBill } from "./plan"

// Made-up suppliers and figures only: this repo is public.
const FLOUR = { ContactID: "c-flour", Name: "Sunny Flour Mills" }
const DAIRY = { ContactID: "k-dairy", Name: "Hilltop Dairy" }
const past = (contact: { ContactID: string; Name: string }, n: string, date: string, account: string, tax: string, amt: number): XeroBill => ({
  InvoiceID: `x-${n}`,
  Type: "ACCPAY",
  Status: "PAID",
  InvoiceNumber: n,
  Contact: contact,
  Date: date,
  DueDate: date,
  Total: amt,
  LineItems: [{ AccountCode: account, TaxType: tax, LineAmount: amt }],
})

function orgs(): Record<BillOrg, OrgRead> {
  return {
    "Tarte Bakery": { contacts: [FLOUR], bills: [past(FLOUR, "F-1", "2026-10-20", "311", "INPUT", 100)] },
    "Tarte Currumbin": { contacts: [DAIRY], bills: [past(DAIRY, "D-1", "2026-10-21", "312", "EXEMPTEXPENSES", 50)] },
  }
}

const inv = (p: Partial<KitchenInvoice>): KitchenInvoice => ({
  id: "i1",
  supplierName: "Sunny Flour Mills",
  venue: "BURLEIGH",
  invoiceNumber: "F-10",
  invoiceDate: "2026-11-05",
  dueDate: null,
  subtotal: 100,
  gst: 10,
  total: 110,
  status: "EXTRACTED",
  hasPdf: true,
  ...p,
})

interface Fake {
  deps: RunDeps
  created: { org: BillOrg; bill: DraftPayload; key: string }[]
  pushed: string[]
  errors: Record<string, string>
  attached: string[]
}

function fake(opts: {
  invoices: KitchenInvoice[]
  attachments?: boolean
  createResult?: (org: BillOrg, bill: DraftPayload, n: number) => CreateResult
  findResult?: (org: BillOrg, number: string, n: number) => XeroBill[]
}): Fake {
  const f: Fake = { created: [], pushed: [], errors: {}, attached: [], deps: undefined as unknown as RunDeps }
  let creates = 0
  let finds = 0
  const inbox: InboxBills = {
    async status() {
      return { attachments: opts.attachments ?? false, orgs: ["Tarte Bakery", "Tarte Currumbin"] }
    },
    async read(org) {
      return orgs()[org]
    },
    async find(org, number) {
      return opts.findResult?.(org, number, finds++) ?? []
    },
    async create(org, bill, key) {
      f.created.push({ org, bill, key })
      const n = creates++
      return (
        opts.createResult?.(org, bill, n) ?? {
          ok: true,
          bill: { InvoiceID: `new-${n}`, Status: "DRAFT", Contact: bill.Contact, Date: bill.Date, InvoiceNumber: bill.InvoiceNumber, Total: bill.LineItems.reduce((s, l) => s + l.UnitAmount + l.TaxAmount, 0) },
        }
      )
    },
    async attach(_org, invoiceId) {
      f.attached.push(invoiceId)
      return { ok: true }
    },
  }
  f.deps = {
    inbox,
    loadInvoices: async () => opts.invoices,
    loadHistory: async () => [],
    markPushed: async (id) => void f.pushed.push(id),
    markError: async (id, e) => void (f.errors[id] = e),
    markAttached: async () => {},
    readPdf: async (id) => ({ filename: `${id}.pdf`, contentBase64: "JVBERi0=" }),
    sleep: async () => {},
  }
  return f
}

const OPTS = { cutoff: "2026-11-04", capPerOrg: 60, today: "2026-11-12", kitchenBaseUrl: "https://kitchen.example.test" }

test("dry run: plans, never creates", async () => {
  const f = fake({ invoices: [inv({}), inv({ id: "i2", supplierName: "Hilltop Dairy", venue: "BEACH_HOUSE", invoiceNumber: "D-9", subtotal: 50, gst: 0, total: 50 })] })
  const s = await runDraftBills(f.deps, { ...OPTS, live: false })
  assert.equal(f.created.length, 0)
  assert.deepEqual(s.drafted, { "Tarte Bakery": 1, "Tarte Currumbin": 1 })
  assert.deepEqual(s.draftedTotal, { "Tarte Bakery": 110, "Tarte Currumbin": 50 })
  assert.equal(s.drafts[0].xeroInvoiceId, undefined)
})

test("live: one create per draft with an idempotency key, recorded, PDF attached once the grant is in", async () => {
  const f = fake({ invoices: [inv({}), inv({ id: "i2", invoiceNumber: "F-11" })], attachments: true })
  const s = await runDraftBills(f.deps, { ...OPTS, live: true })
  assert.deepEqual(f.created.map((c) => [c.org, c.key, c.bill.Status, c.bill.Type]), [
    ["Tarte Bakery", "kitchen-i1", "DRAFT", "ACCPAY"],
    ["Tarte Bakery", "kitchen-i2", "DRAFT", "ACCPAY"],
  ])
  assert.deepEqual(f.pushed, ["i1", "i2"])
  assert.deepEqual(f.attached, ["new-0", "new-1"])
  assert.equal(s.drafted["Tarte Bakery"], 2)
  assert.deepEqual(s.stopped, [])
  // Without the grant nothing is attached and nothing fails.
  const g = fake({ invoices: [inv({})] })
  await runDraftBills(g.deps, { ...OPTS, live: true })
  assert.deepEqual(g.attached, [])
})

test("live: keyed by hand since the read, in either org, is held, not created", async () => {
  const f = fake({
    invoices: [inv({})],
    // The writer keyed it in the other org (wrong venue) a minute ago.
    findResult: (org, number) => (org === "Tarte Currumbin" && number === "F-10" ? [{ InvoiceID: "w1", Status: "AUTHORISED", InvoiceNumber: "F-10", Contact: { ContactID: "zz", Name: "Sunny Flour Mills Pty Ltd" }, Date: "2026-11-05" }] : []),
  })
  const s = await runDraftBills(f.deps, { ...OPTS, live: true })
  assert.equal(f.created.length, 0)
  assert.match(s.holds[0].reason, /^already in Xero: Tarte Currumbin AUTHORISED bill F-10/)
})

test("live: a Xero error stops that org's batch for the run, the other org carries on", async () => {
  const f = fake({
    invoices: [inv({}), inv({ id: "i2", invoiceNumber: "F-11" }), inv({ id: "c1", supplierName: "Hilltop Dairy", venue: "BEACH_HOUSE", invoiceNumber: "D-9", subtotal: 50, gst: 0, total: 50 })],
    createResult: (org, bill, n) =>
      org === "Tarte Bakery" && n === 0
        ? { ok: false, kind: "error", error: "Xero 422: account code is archived" }
        : { ok: true, bill: { InvoiceID: `new-${n}`, Status: "DRAFT", Contact: bill.Contact, Date: bill.Date, Total: 50 } },
  })
  const s = await runDraftBills(f.deps, { ...OPTS, live: true })
  assert.deepEqual(f.created.map((c) => c.org), ["Tarte Bakery", "Tarte Currumbin"])
  assert.deepEqual(s.stopped, [{ org: "Tarte Bakery", invoiceId: "i1", error: "Xero 422: account code is archived" }])
  assert.equal(f.errors.i1, "Xero 422: account code is archived")
  assert.deepEqual(s.drafted, { "Tarte Bakery": 0, "Tarte Currumbin": 1 })
})

test("live: no answer on create is never retried; found by number it is recorded, not found the batch stops", async () => {
  const found = fake({
    invoices: [inv({}), inv({ id: "i2", invoiceNumber: "F-11" })],
    createResult: (_o, bill, n) => (n === 0 ? { ok: false, kind: "unknown", error: "Xero did not answer" } : { ok: true, bill: { InvoiceID: "new-1", Status: "DRAFT", Contact: bill.Contact, Date: bill.Date, Total: 110 } }),
    // Before create: nothing in either org (2 finds). After the timeout: there it is.
    findResult: (org, number, n) => (n === 2 && number === "F-10" ? [{ InvoiceID: "made-it", Status: "DRAFT", InvoiceNumber: "F-10", Contact: { ContactID: "c-flour", Name: "Sunny Flour Mills" }, Date: "2026-11-05" }] : []),
  })
  const s = await runDraftBills(found.deps, { ...OPTS, live: true })
  assert.equal(found.created.length, 2)
  assert.deepEqual(found.pushed, ["i1", "i2"])
  assert.equal(s.drafts[0].xeroInvoiceId, "made-it")

  const lost = fake({ invoices: [inv({}), inv({ id: "i2", invoiceNumber: "F-11" })], createResult: () => ({ ok: false, kind: "unknown", error: "Xero did not answer" }) })
  const t = await runDraftBills(lost.deps, { ...OPTS, live: true })
  assert.equal(lost.created.length, 1)
  assert.match(t.stopped[0].error, /not found by number afterwards, so not retried/)
  assert.deepEqual(lost.pushed, [])
})

test("live: a bill Xero created as something other than the planned DRAFT total stops the batch", async () => {
  const f = fake({
    invoices: [inv({}), inv({ id: "i2", invoiceNumber: "F-11" })],
    createResult: (_o, bill) => ({ ok: true, bill: { InvoiceID: "odd", Status: "DRAFT", Contact: bill.Contact, Date: bill.Date, Total: 111 } }),
  })
  const s = await runDraftBills(f.deps, { ...OPTS, live: true })
  assert.equal(f.created.length, 1)
  assert.deepEqual(f.pushed, ["i1"])
  assert.match(s.stopped[0].error, /^created odd but Xero shows DRAFT 111, not DRAFT 110\.00/)
})

test("an org missing from the Inbox token stops the run before any read", async () => {
  const f = fake({ invoices: [inv({})] })
  f.deps.inbox.status = async () => ({ attachments: false, orgs: ["Tarte Currumbin"] })
  await assert.rejects(runDraftBills(f.deps, { ...OPTS, live: true }), /Tarte Bakery is not linked/)
  assert.equal(f.created.length, 0)
})
