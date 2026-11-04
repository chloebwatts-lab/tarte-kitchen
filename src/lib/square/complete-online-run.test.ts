import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/encryption"
import { completeOnlineOrders, COMPLETE_FROM, MAX_PER_RUN } from "./complete-online"
import type { SquareOrder } from "./client"

/**
 * End to end run of the nightly job against a fake Square and a fake
 * connection table. No network, no database: global fetch and the one
 * Prisma delegate the job reads are swapped for the length of this file.
 */

const m = (d: number) => ({ amount: Math.round(d * 100), currency: "AUD" })
// Wed 4 Nov 2026, 23:55 AEST: when the cron fires.
const NOW = new Date("2026-11-04T13:55:00Z")
const BH = "L940NQYQY567T" // Beach House location
const TG = "LTEAGARDEN0001" // Tea Garden shares the Currumbin Square account
const BURLEIGH = "LBURLEIGH0001"

function bopple(id: string, over: Partial<SquareOrder> = {}): SquareOrder {
  return {
    id,
    location_id: BH,
    version: 7,
    state: "OPEN",
    source: { name: "Bopple" },
    created_at: "2026-11-04T00:21:11.596Z",
    total_money: m(23.9),
    net_amount_due_money: m(0),
    tenders: [{ type: "OTHER", amount_money: m(23.9), other_details: { source: "BOPPLE", status: "CAPTURED" } }],
    fulfillments: [{ uid: `ful-${id}`, type: "IN_STORE", state: "PREPARED" }],
    ...over,
  }
}

interface Call { method: string; path: string; body: Record<string, unknown> | null }

const realFetch = globalThis.fetch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any
const realFindMany = dbAny.squareConnection.findMany
const realKey = process.env.TOKEN_ENCRYPTION_KEY

let store: SquareOrder[] = []
let calls: Call[] = []
let putFailsFor = new Set<string>()
let putLeavesOpen = new Set<string>()

before(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64")
  const token = encrypt("sq-test-token")
  dbAny.squareConnection.findMany = async () => [
    // Currumbin account: Tea Garden is listed before Beach House on purpose.
    { id: "conn-currumbin", accessToken: token, merchantId: "M1", merchantName: "Currumbin", connectedAt: new Date(), lastSyncAt: null, lastError: null,
      locations: [{ id: TG, name: "Tea Garden", venue: "TEA_GARDEN" }, { id: BH, name: "Beach House", venue: "BEACH_HOUSE" }] },
    { id: "conn-burleigh", accessToken: token, merchantId: "M2", merchantName: "Burleigh", connectedAt: new Date(), lastSyncAt: null, lastError: null,
      locations: [{ id: BURLEIGH, name: "Tarte Bakery", venue: "BURLEIGH" }] },
  ]
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const method = init?.method ?? "GET"
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    calls.push({ method, path: url.pathname, body })
    if (method === "POST" && url.pathname.endsWith("/orders/search")) {
      // Deliberately ignores the location and date filters, so the job's own guards are what is tested.
      return Response.json({ orders: store.filter((o) => o.state === "OPEN") })
    }
    const put = /\/orders\/([^/]+)$/.exec(url.pathname)
    if (method === "PUT" && put) {
      const id = put[1]
      if (putFailsFor.has(id)) return new Response("VERSION_MISMATCH", { status: 409 })
      const o = store.find((x) => x.id === id)
      if (!o) return new Response("NOT_FOUND", { status: 404 })
      if (putLeavesOpen.has(id)) return Response.json({ order: o })
      o.state = "COMPLETED"
      return Response.json({ order: o })
    }
    return new Response("unexpected", { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = realFetch
  dbAny.squareConnection.findMany = realFindMany
  if (realKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY
  else process.env.TOKEN_ENCRYPTION_KEY = realKey
})

function reset(orders: SquareOrder[]) {
  store = orders.map((o) => structuredClone(o))
  calls = []
  putFailsFor = new Set()
  putLeavesOpen = new Set()
}
const puts = () => calls.filter((c) => c.method === "PUT")

test("job completes only the eligible November Bopple order, even if Square hands back October, other-location and fresh orders", async () => {
  reset([
    bopple("good"),
    // Everything about this one is eligible except that it was placed 23:59:59 AEST on 31 Oct.
    bopple("october", { created_at: "2026-10-31T13:59:59.999Z" }),
    bopple("october-old", { created_at: "2026-10-01T00:54:22.479Z" }),
    bopple("tea-garden", { location_id: TG }),
    bopple("burleigh", { location_id: BURLEIGH }),
    bopple("fresh", { created_at: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString() }),
    bopple("till", { source: { name: "Point of Sale" } }),
    bopple("unpaid", { net_amount_due_money: m(5), tenders: [{ type: "OTHER", amount_money: m(18.9), other_details: { status: "CAPTURED" } }] }),
  ])
  const [r, ...rest] = await completeOnlineOrders({ now: NOW })
  assert.equal(rest.length, 0, "only Beach House is reported")
  assert.equal(r.venue, "BEACH_HOUSE")
  assert.deepEqual(r.completed.map((c) => c.id), ["good"])
  assert.equal(r.completedIncGst, 23.9)
  assert.equal(r.open, 8)
  assert.deepEqual(r.failed, [])
  assert.equal(r.skipped["placed before 1 Nov 2026"], 2)
  assert.equal(r.skipped["other location"], 2)
  assert.equal(r.skipped["placed in the last 20 minutes"], 1)
  assert.equal(r.skipped["not a Bopple order"], 1)
  assert.equal(r.skipped["not fully paid"], 1)

  // Exactly one write went to Square, for the one good order, at Beach House.
  assert.equal(puts().length, 1)
  assert.match(puts()[0].path, /\/orders\/good$/)
  const sent = puts()[0].body as { idempotency_key: string; order: { location_id: string; version: number; state: string; fulfillments: Array<{ uid: string; state: string }> } }
  assert.equal(sent.order.location_id, BH)
  assert.equal(sent.order.version, 7)
  assert.equal(sent.order.state, "COMPLETED")
  assert.deepEqual(sent.order.fulfillments, [{ uid: "ful-good", state: "COMPLETED" }])
  assert.equal(sent.idempotency_key, "tk-complete-good-v7")
  assert.equal(store.find((o) => o.id === "october")!.state, "OPEN")
  assert.equal(store.find((o) => o.id === "tea-garden")!.state, "OPEN")
})

test("job asks Square for open Bopple orders at Beach House only, from the 1 Nov floor up to now", async () => {
  reset([])
  await completeOnlineOrders({ now: NOW })
  const search = calls.find((c) => c.path.endsWith("/orders/search"))!
  const body = search.body as { location_ids: string[]; query: { filter: { state_filter: { states: string[] }; source_filter: { source_names: string[] }; date_time_filter: { created_at: { start_at: string; end_at: string } } } } }
  assert.deepEqual(body.location_ids, [BH], "Tea Garden is listed first in the account but Beach House is what is searched")
  assert.deepEqual(body.query.filter.state_filter.states, ["OPEN"])
  assert.deepEqual(body.query.filter.source_filter.source_names, ["Bopple"])
  assert.equal(body.query.filter.date_time_filter.created_at.start_at, "2026-10-31T14:00:00.000Z")
  assert.equal(new Date(COMPLETE_FROM).toISOString(), "2026-10-31T14:00:00.000Z")
  assert.equal(body.query.filter.date_time_filter.created_at.end_at, NOW.toISOString())
  assert.equal(calls.length, 1, "no other Square call when nothing is open")
})

test("dry run lists what it would complete and writes nothing", async () => {
  reset([bopple("a"), bopple("b", { total_money: m(48.3), tenders: [{ type: "OTHER", amount_money: m(48.3), other_details: { status: "CAPTURED" } }] })])
  const [r] = await completeOnlineOrders({ now: NOW, dryRun: true })
  assert.equal(r.dryRun, true)
  assert.deepEqual(r.completed.map((c) => c.id), ["a", "b"])
  assert.equal(r.completedIncGst, 72.2)
  assert.equal(puts().length, 0)
  assert.ok(store.every((o) => o.state === "OPEN"))
})

test("running the job twice completes each order once", async () => {
  reset([bopple("a"), bopple("b")])
  const first = await completeOnlineOrders({ now: NOW })
  assert.equal(first[0].completed.length, 2)
  assert.equal(puts().length, 2)
  const second = await completeOnlineOrders({ now: new Date(NOW.getTime() + 24 * 3600 * 1000) })
  assert.equal(second[0].open, 0)
  assert.equal(second[0].completed.length, 0)
  assert.equal(puts().length, 2, "the second run wrote nothing")
})

test("a retry of the same order version reuses the same idempotency key; a new version gets a new one", async () => {
  reset([bopple("a")])
  putLeavesOpen = new Set(["a"]) // Square answered but the order is still OPEN
  const r1 = await completeOnlineOrders({ now: NOW })
  assert.equal(r1[0].failed.length, 1)
  assert.equal(r1[0].completed.length, 0)
  await completeOnlineOrders({ now: NOW })
  const keys = puts().map((c) => (c.body as { idempotency_key: string }).idempotency_key)
  assert.deepEqual(keys, ["tk-complete-a-v7", "tk-complete-a-v7"])
  store[0].version = 8
  await completeOnlineOrders({ now: NOW })
  assert.equal((puts()[2].body as { idempotency_key: string }).idempotency_key, "tk-complete-a-v8")
})

test("one order failing in Square is reported and the rest are still completed", async () => {
  reset([bopple("a"), bopple("b"), bopple("c")])
  putFailsFor = new Set(["b"])
  const [r] = await completeOnlineOrders({ now: NOW })
  assert.deepEqual(r.completed.map((c) => c.id), ["a", "c"])
  assert.equal(r.failed.length, 1)
  assert.equal(r.failed[0].id, "b")
  assert.match(r.failed[0].error, /409/)
  assert.equal(r.completedIncGst, 47.8)
})

test("a busy night stops at the cap and leaves the rest for the next run", async () => {
  reset(Array.from({ length: MAX_PER_RUN + 3 }, (_, i) => bopple(`o${i}`)))
  const [r] = await completeOnlineOrders({ now: NOW })
  assert.equal(r.completed.length, MAX_PER_RUN)
  assert.equal(r.capped, true)
  assert.equal(puts().length, MAX_PER_RUN)
  assert.equal(store.filter((o) => o.state === "OPEN").length, 3)
})
