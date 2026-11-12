import { test } from "node:test"
import assert from "node:assert/strict"
import { runDraftBills, type RunDeps } from "./run"
import type { CreateResult, InboxBills } from "./inbox"
import type { BillOrg, DraftPayload, KitchenInvoice, OrgRead, XeroBill } from "./plan"

// Live-run safety (pre-push test guard, 12 Nov 2026), against a fake Xero
// that remembers what was created, so a second look sees it. Made-up
// suppliers and figures only: the repo is public.

const FLOUR_B = { ContactID: "b-flour", Name: "Ridge Flour Mill" }
const FLOUR_K = { ContactID: "k-flour", Name: "Ridge Flour Mill" }
const MILK_B = { ContactID: "b-milk", Name: "Valley Milk" }

const paid = (c: { ContactID: string; Name: string }, n: string, tax: string): XeroBill => ({
  InvoiceID: `p-${c.ContactID}-${n}`,
  Type: "ACCPAY",
  Status: "PAID",
  InvoiceNumber: n,
  Contact: c,
  Date: "2026-10-20",
  DueDate: "2026-11-03",
  Total: 1,
  LineItems: [{ AccountCode: "51000", TaxType: tax, LineAmount: 100 }],
})

const inv = (p: Partial<KitchenInvoice>): KitchenInvoice => ({
  id: "i1",
  supplierName: "Ridge Flour Mill",
  venue: "BURLEIGH",
  invoiceNumber: "RF-4001",
  invoiceDate: "2026-11-06",
  dueDate: null,
  subtotal: 412.5,
  gst: 41.25,
  total: 453.75,
  status: "EXTRACTED",
  hasPdf: true,
  ...p,
})

type Call = { op: string; org?: BillOrg; detail?: string }

function world(opts: {
  invoices: KitchenInvoice[]
  attachments?: boolean
  create?: (org: BillOrg, bill: DraftPayload, n: number) => CreateResult | "default"
  find?: (org: BillOrg, number: string, n: number) => XeroBill[] | Error | "default"
  attach?: (n: number) => { ok: boolean; error?: string }
  pdf?: (id: string) => { filename: string; contentBase64: string } | null
}) {
  const xero: Record<BillOrg, XeroBill[]> = {
    "Tarte Bakery": [paid(FLOUR_B, "OLD-1", "INPUT"), paid(MILK_B, "OLD-2", "EXEMPTEXPENSES")],
    "Tarte Currumbin": [paid(FLOUR_K, "OLD-3", "INPUT")],
  }
  const contacts: Record<BillOrg, { ContactID: string; Name: string }[]> = { "Tarte Bakery": [FLOUR_B, MILK_B], "Tarte Currumbin": [FLOUR_K] }
  const calls: Call[] = []
  const pushed: Record<string, string> = {}
  const errors: Record<string, string> = {}
  let creates = 0
  let finds = 0
  let attaches = 0
  const inbox: InboxBills = {
    async status() {
      calls.push({ op: "status" })
      return { attachments: opts.attachments ?? false, orgs: ["Tarte Bakery", "Tarte Currumbin"] }
    },
    async read(org): Promise<OrgRead> {
      calls.push({ op: "read", org })
      return { contacts: contacts[org], bills: [...xero[org]] }
    },
    async find(org, number) {
      calls.push({ op: "find", org, detail: number })
      const r = opts.find?.(org, number, finds++) ?? "default"
      if (r instanceof Error) throw r
      return r === "default" ? xero[org].filter((b) => b.InvoiceNumber === number) : r
    },
    async create(org, bill, key) {
      calls.push({ op: "create", org, detail: key })
      const n = creates++
      const r = opts.create?.(org, bill, n) ?? "default"
      if (r !== "default") return r
      const made: XeroBill = {
        InvoiceID: `new-${n}`,
        Type: "ACCPAY",
        Status: "DRAFT",
        InvoiceNumber: bill.InvoiceNumber,
        Contact: { ContactID: bill.Contact.ContactID, Name: contacts[org].find((c) => c.ContactID === bill.Contact.ContactID)?.Name },
        Date: bill.Date,
        DueDate: bill.DueDate,
        Total: bill.LineItems.reduce((s, l) => s + Math.round(l.UnitAmount * 100) + Math.round(l.TaxAmount * 100), 0) / 100,
      }
      xero[org].push(made)
      return { ok: true, bill: made }
    },
    async attach(org, invoiceId) {
      calls.push({ op: "attach", org, detail: invoiceId })
      return opts.attach?.(attaches++) ?? { ok: true }
    },
  }
  const deps: RunDeps = {
    inbox,
    loadInvoices: async () => opts.invoices.map((i) => ({ ...i, xeroInvoiceId: pushed[i.id] ?? i.xeroInvoiceId ?? null })),
    loadHistory: async () => [],
    markPushed: async (id, _org, x) => {
      calls.push({ op: "markPushed", detail: id })
      pushed[id] = x
    },
    markError: async (id, e) => {
      calls.push({ op: "markError", detail: id })
      errors[id] = e
    },
    markAttached: async (id) => void calls.push({ op: "markAttached", detail: id }),
    readPdf: async (id) => (opts.pdf ? opts.pdf(id) : { filename: `${id}.pdf`, contentBase64: "JVBERi0=" }),
    sleep: async () => {},
  }
  const creates_ = () => calls.filter((c) => c.op === "create")
  return { deps, xero, calls, pushed, errors, creates: creates_ }
}

const OPTS = { cutoff: "2026-11-04", capPerOrg: 40, today: "2026-11-12", kitchenBaseUrl: "https://kitchen.example.test" }

test("dry run touches nothing: no find, create, attach or Kitchen write", async () => {
  const w = world({ invoices: [inv({}), inv({ id: "i2", invoiceNumber: "RF-4002" })], attachments: true })
  const s = await runDraftBills(w.deps, { ...OPTS, live: false })
  assert.deepEqual(
    w.calls.map((c) => c.op).filter((op) => op !== "status" && op !== "read"),
    []
  )
  assert.equal(s.drafted["Tarte Bakery"], 2)
})

test("the same invoice in Kitchen under both venues: the plan holds the second copy, so Xero gets one bill", async () => {
  const w = world({ invoices: [inv({ id: "a" }), inv({ id: "b", venue: "BEACH_HOUSE" })] })
  const s = await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.equal(w.creates().length, 1)
  assert.equal(s.holds.length, 1)
  assert.match(s.holds[0].reason, /in Kitchen twice/)
})

test("a second live run creates nothing again, even when the first run's Kitchen record was lost", async () => {
  const w = world({ invoices: [inv({}), inv({ id: "i2", invoiceNumber: "RF-4002" })] })
  await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.equal(w.creates().length, 2)
  // Lose the Kitchen side of the push: the plan still sees the drafts in Xero.
  for (const k of Object.keys(w.pushed)) delete w.pushed[k]
  const again = await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.equal(w.creates().length, 2)
  assert.equal(again.holds.length, 2)
  for (const h of again.holds) assert.match(h.reason, /^already in Xero: Tarte Bakery DRAFT bill/)
})

test("the check before create failing stops that org's batch with nothing created; the other org carries on", async () => {
  const w = world({
    invoices: [inv({}), inv({ id: "i2", invoiceNumber: "RF-4002" }), inv({ id: "k1", venue: "BEACH_HOUSE", invoiceNumber: "RF-9001" })],
    find: (org, number) => (number === "RF-4001" && org === "Tarte Currumbin" ? new Error("Inbox find Tarte Currumbin: Xero 503") : "default"),
  })
  const s = await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.deepEqual(w.creates().map((c) => c.org), ["Tarte Currumbin"])
  assert.equal(s.stopped.length, 1)
  assert.equal(s.stopped[0].org, "Tarte Bakery")
  assert.equal(s.stopped[0].invoiceId, "i1")
  assert.match(w.errors.i1, /could not check Xero for this number before creating/)
})

test("refused at create as already there or an inactive contact: held, nothing recorded, the next one still goes", async () => {
  const w = world({
    invoices: [inv({}), inv({ id: "i2", invoiceNumber: "RF-4002" }), inv({ id: "i3", invoiceNumber: "RF-4003" })],
    create: (_o, _b, n) =>
      n === 0
        ? { ok: false, kind: "already", error: "refused: already in Xero" }
        : n === 1
          ? { ok: false, kind: "contact", error: "refused: contact is not an active contact in this org" }
          : "default",
  })
  const s = await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.equal(w.creates().length, 3)
  assert.deepEqual(Object.keys(w.pushed), ["i3"])
  assert.deepEqual(s.stopped, [])
  assert.deepEqual(
    s.holds.map((h) => [h.invoiceId, h.reason]),
    [
      ["i1", "already in Xero (found by the Inbox app at create)"],
      ["i2", "contact is not an active contact in this org"],
    ]
  )
})

test("rate limit, a refused payload or any other Xero error stops the batch after that one create", async () => {
  for (const kind of ["rate", "refused", "error"] as const) {
    const w = world({
      invoices: [inv({}), inv({ id: "i2", invoiceNumber: "RF-4002" })],
      create: (_o, _b, n) => (n === 0 ? { ok: false, kind, error: `Xero said no (${kind})` } : "default"),
    })
    const s = await runDraftBills(w.deps, { ...OPTS, live: true })
    assert.equal(w.creates().length, 1, kind)
    assert.deepEqual(w.pushed, {}, kind)
    assert.equal(s.stopped[0].error, `Xero said no (${kind})`)
    assert.equal(s.drafted["Tarte Bakery"], 0)
  }
})

test("no answer on create, and the search after it fails too: never retried, nothing recorded, batch stops", async () => {
  const w = world({
    invoices: [inv({}), inv({ id: "i2", invoiceNumber: "RF-4002" })],
    create: () => ({ ok: false, kind: "unknown", error: "no answer from the Inbox app (timeout)" }),
    // Both orgs answer before the create (finds 0 and 1); the search after it throws.
    find: (_o, _n, n) => (n === 2 ? new Error("Inbox down") : "default"),
  })
  const s = await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.equal(w.creates().length, 1)
  assert.deepEqual(w.pushed, {})
  assert.match(s.stopped[0].error, /^no answer from the Inbox app \(timeout\); not found by number afterwards, so not retried$/)
})

test("no answer on create: a bill with that number from ANOTHER supplier is not taken as ours", async () => {
  const w = world({
    invoices: [inv({})],
    create: () => ({ ok: false, kind: "unknown", error: "no answer" }),
    find: (_o, number, n) => (n === 2 ? [{ InvoiceID: "theirs", Status: "DRAFT", InvoiceNumber: number, Contact: { ContactID: "b-milk", Name: "Valley Milk" }, Date: "2026-11-06" }] : "default"),
  })
  const s = await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.deepEqual(w.pushed, {})
  assert.equal(s.stopped.length, 1)
})

test("attachments: a missing PDF or a failed attach is reported but never stops the batch or undoes the draft", async () => {
  const w = world({
    invoices: [inv({}), inv({ id: "i2", invoiceNumber: "RF-4002" }), inv({ id: "i3", invoiceNumber: "RF-4003" })],
    attachments: true,
    pdf: (id) => (id === "i1" ? null : { filename: `${id}.pdf`, contentBase64: "JVBERi0=" }),
    attach: (n) => (n === 0 ? { ok: false, error: "Xero 413" } : { ok: true }),
  })
  const s = await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.equal(w.creates().length, 3)
  assert.deepEqual(Object.keys(w.pushed).sort(), ["i1", "i2", "i3"])
  assert.deepEqual(s.attachFailures, [
    { invoiceId: "i1", error: "no PDF in Kitchen" },
    { invoiceId: "i2", error: "Xero 413" },
  ])
  assert.deepEqual(w.calls.filter((c) => c.op === "markAttached").map((c) => c.detail), ["i3"])
  assert.deepEqual(s.stopped, [])
})

test("the live batch never goes past the cap, and every create is a DRAFT ACCPAY with its own idempotency key", async () => {
  const invoices = Array.from({ length: 7 }, (_, i) => inv({ id: `c${i}`, invoiceNumber: `RF-50${i}0` }))
  const w = world({ invoices })
  const s = await runDraftBills(w.deps, { ...OPTS, capPerOrg: 5, live: true })
  assert.equal(w.creates().length, 5)
  assert.equal(new Set(w.creates().map((c) => c.detail)).size, 5)
  for (const b of w.xero["Tarte Bakery"].filter((x) => x.InvoiceID.startsWith("new-"))) assert.equal(b.Status, "DRAFT")
  assert.equal(s.holds.filter((h) => /over today's cap of 5/.test(h.reason)).length, 2)
})

test("live: the check before create knows the supplier's contact in the other org by id, even under another name there", async () => {
  const w = world({
    invoices: [inv({}), inv({ id: "i2", invoiceNumber: "RF-4002" })],
    // Keyed by hand in Currumbin a minute ago, on its Ridge Flour contact renamed since the read.
    find: (org, number) => (org === "Tarte Currumbin" && number === "RF-4001" ? [{ InvoiceID: "hand-1", Status: "DRAFT", InvoiceNumber: "RF-4001", Contact: { ContactID: "k-flour", Name: "RFM Gold Coast" }, Date: "2026-11-06" }] : "default"),
  })
  const s = await runDraftBills(w.deps, { ...OPTS, live: true })
  assert.deepEqual(w.creates().map((c) => c.detail), ["kitchen-i2"])
  assert.match(s.holds[0].reason, /^already in Xero: Tarte Currumbin DRAFT bill RF-4001 dated 2026-11-06 \(keyed since the read\)$/)
})
