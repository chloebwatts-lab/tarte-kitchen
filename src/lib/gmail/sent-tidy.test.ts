import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/encryption"
import { sendEmail, sendHtmlEmail } from "./send"
import { sweepPrivateSent, tidyAfterSend, trashPrivateSentCopy } from "./sent-tidy"
import { SENT_TIDY_FLOOR_MS } from "./sent-tidy-rules"
import { POST as trashSentRoute } from "@/app/api/internal/trash-sent/route"
import { GET as tidySentCron } from "@/app/api/cron/tidy-sent/route"

/**
 * The accounts@ Sent tidy end to end against a fake Gmail mailbox. No
 * network, no database: global fetch and the one Prisma delegate the code
 * reads (gmailConnection.findFirst) are swapped for the length of this file.
 * The fake search ignores the query on purpose, so the safety checks in
 * decideTrash are what decide, not Gmail's search.
 */

const ME = "accounts@tarte.com.au"
const CHLOE = "chloe@tarte.com.au"
const SEP = Date.parse("2026-09-21T06:00:00Z")
const NOV6 = Date.parse("2026-11-05T22:00:00Z")

type Msg = { id: string; threadId: string; internalDate: number; labelIds: string[]; headers: Record<string, string> }
type Call = { method: string; path: string }

const realFetch = globalThis.fetch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any
const realFindFirst = dbAny.gmailConnection.findFirst
const realKey = process.env.TOKEN_ENCRYPTION_KEY
const realDry = process.env.SENT_TIDY_DRY_RUN
const realSecret = process.env.CRON_SECRET
const realLog = console.log
const realWarn = console.warn

let box = new Map<string, Msg>()
let calls: Call[] = []
let seq = 0
let trashMode: "ok" | "403" | "throw" = "ok"
let getMode: "ok" | "500" = "ok"
let sendMode: "json" | "not-json" = "json"
let connection: () => Promise<unknown> = async () => null
let logs: string[] = []

function put(m: Partial<Msg> & { subject: string }): Msg {
  const id = m.id ?? `19a${(++seq).toString(16).padStart(13, "0")}`
  const msg: Msg = {
    id,
    threadId: m.threadId ?? id,
    internalDate: m.internalDate ?? NOV6,
    labelIds: m.labelIds ?? ["SENT"],
    headers: { Subject: m.subject, From: `Tarte Accounts <${ME}>`, To: CHLOE, ...m.headers },
  }
  box.set(id, msg)
  return msg
}

function parseRaw(raw: string): Record<string, string> {
  const text = Buffer.from(raw, "base64url").toString("utf-8")
  const head = text.split("\r\n\r\n")[0]
  const out: Record<string, string> = {}
  for (const line of head.split("\r\n")) {
    const i = line.indexOf(": ")
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 2)
  }
  return out
}

const BASE = "/gmail/v1/users/me/messages"

before(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64")
  process.env.CRON_SECRET = "test-cron-secret"
  const token = encrypt("ya29.kitchen-test")
  connection = async () => ({
    id: "gc-accounts",
    email: ME,
    accessToken: token,
    refreshToken: encrypt("1//refresh-test"),
    tokenExpiry: new Date(Date.now() + 3_600_000),
    lastScanAt: null,
    scanFrequency: 60,
    createdAt: new Date("2026-11-05T00:00:00Z"),
    updatedAt: new Date("2026-11-05T00:00:00Z"),
  })
  dbAny.gmailConnection.findFirst = () => connection()
  console.log = (...a: unknown[]) => { logs.push(a.join(" ")) }
  console.warn = (...a: unknown[]) => { logs.push(a.join(" ")) }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    if (url.hostname !== "www.googleapis.com") throw new Error(`test blocked network call to ${url.hostname}`)
    const method = init?.method ?? "GET"
    calls.push({ method, path: url.pathname })
    if (method === "POST" && url.pathname === `${BASE}/send`) {
      const h = parseRaw((JSON.parse(String(init?.body)) as { raw: string }).raw)
      const self = (h.To ?? "").toLowerCase().includes(ME)
      const m = put({ subject: h.Subject, headers: { From: h.From, To: h.To }, labelIds: self ? ["SENT", "INBOX", "UNREAD"] : ["SENT"], internalDate: Date.now() })
      if (sendMode === "not-json") return new Response("sent", { status: 200 })
      return Response.json({ id: m.id, threadId: m.threadId, labelIds: m.labelIds })
    }
    if (method === "GET" && url.pathname === BASE) {
      return Response.json({ messages: [...box.values()].map((m) => ({ id: m.id, threadId: m.threadId })) })
    }
    const get = new RegExp(`^${BASE}/([^/]+)$`).exec(url.pathname)
    if (method === "GET" && get) {
      if (getMode === "500") return new Response("backend error", { status: 500 })
      const m = box.get(decodeURIComponent(get[1]))
      if (!m) return new Response("not found", { status: 404 })
      return Response.json({
        id: m.id,
        threadId: m.threadId,
        internalDate: String(m.internalDate),
        labelIds: m.labelIds,
        payload: { headers: Object.entries(m.headers).map(([name, value]) => ({ name, value })) },
      })
    }
    const trash = new RegExp(`^${BASE}/([^/]+)/trash$`).exec(url.pathname)
    if (method === "POST" && trash) {
      if (trashMode === "throw") throw new TypeError("fetch failed")
      if (trashMode === "403") return new Response('{"error":{"code":403,"message":"Request had insufficient authentication scopes."}}', { status: 403 })
      const m = box.get(decodeURIComponent(trash[1]))
      if (!m) return new Response("not found", { status: 404 })
      m.labelIds = [...m.labelIds.filter((l) => l !== "INBOX"), "TRASH"]
      return Response.json({ id: m.id, labelIds: m.labelIds })
    }
    return new Response("unexpected call in test", { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = realFetch
  dbAny.gmailConnection.findFirst = realFindFirst
  console.log = realLog
  console.warn = realWarn
  for (const [k, v] of [["TOKEN_ENCRYPTION_KEY", realKey], ["SENT_TIDY_DRY_RUN", realDry], ["CRON_SECRET", realSecret]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

beforeEach(() => {
  box = new Map()
  calls = []
  logs = []
  trashMode = "ok"
  getMode = "ok"
  sendMode = "json"
  delete process.env.SENT_TIDY_DRY_RUN
})

const trashed = (id: string | undefined) => !!id && box.get(id)!.labelIds.includes("TRASH")
const trashCalls = () => calls.filter((c) => c.path.endsWith("/trash"))

function assertNothingDestructiveBeyondTrash() {
  for (const c of calls) {
    assert.ok(!c.path.includes("/threads"), `thread call ${c.path}`)
    assert.ok(!/batchDelete|batchModify|\/modify$/.test(c.path), `bulk or modify call ${c.path}`)
    assert.notEqual(c.method, "DELETE", `DELETE ${c.path}`)
  }
}

test("a flagged private send trashes only its own Sent message, by id, never the thread", async () => {
  const reply = put({ subject: "Re: Tarte weekly: 24 to 30 Oct", labelIds: ["INBOX"], headers: { From: CHLOE, To: ME } })
  const ref = await sendHtmlEmail({ to: CHLOE, subject: "Tarte weekly: 31 Oct to 6 Nov 2026", html: "<p>P&amp;L</p>", text: "P&L", privateCopy: true })
  assert.ok(ref.id)
  assert.equal(trashed(ref.id), true)
  assert.equal(trashed(reply.id), false)
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path.replace(BASE, "")}`), ["POST /send", `GET /${ref.id}`, `POST /${ref.id}/trash`])
  assertNothingDestructiveBeyondTrash()
})

test("a subject on the list is trashed without the flag (plain sendEmail)", async () => {
  const ref = await sendEmail({ to: CHLOE, subject: "COGS TRACKING (Wed 4 to Tue 10 Nov): 3 days to go", body: "spend vs budget" })
  assert.equal(trashed(ref.id), true)
  assertNothingDestructiveBeyondTrash()
})

test("operational mail is never even looked up", async () => {
  for (const subject of ["End of day Monday 9 November: 3 open, 0 with nobody on them", "Today: People and quality (4 to do)", "Set your Tarte Shifts PIN"]) {
    calls = []
    const ref = await sendHtmlEmail({ to: "oliver@tarte.com.au", subject, html: "<p>x</p>", text: "x" })
    assert.equal(trashed(ref.id), false, subject)
    assert.deepEqual(calls.map((c) => c.path), [`${BASE}/send`], subject)
  }
})

test("private mail sent to accounts@ itself keeps its inbox copy, flag or not", async () => {
  const ref = await sendHtmlEmail({ to: [CHLOE, ME], subject: "Tarte weekly: 31 Oct to 6 Nov 2026", html: "<p>x</p>", text: "x", privateCopy: true })
  assert.equal(trashed(ref.id), false)
  assert.ok(box.get(ref.id!)!.labelIds.includes("INBOX"))
  assert.equal(trashCalls().length, 0)
})

test("a failed tidy never fails the send", async () => {
  const subject = "Oliver's Monday report, w/e 3 Nov"
  for (const mode of ["403", "throw"] as const) {
    trashMode = mode
    const ref = await sendHtmlEmail({ to: CHLOE, subject, html: "<p>x</p>", text: "x", privateCopy: true })
    assert.ok(ref.id, mode)
    assert.equal(trashed(ref.id), false, mode)
  }
  trashMode = "ok"
  getMode = "500"
  assert.ok((await sendHtmlEmail({ to: CHLOE, subject, html: "<p>x</p>", text: "x", privateCopy: true })).id)
  getMode = "ok"
  sendMode = "not-json"
  calls = []
  assert.deepEqual(await sendHtmlEmail({ to: CHLOE, subject, html: "<p>x</p>", text: "x", privateCopy: true }), {})
  assert.deepEqual(calls.map((c) => c.path), [`${BASE}/send`])
  // the scope hint reaches the log line
  trashMode = "403"
  const m = put({ subject: "Tarte weekly: 31 Oct to 6 Nov 2026" })
  const r = await trashPrivateSentCopy({ id: m.id, via: "test" })
  assert.equal(r.action, "failed")
  assert.equal(r.reason, "token lacks gmail.modify, re-consent needed")
})

test("trashPrivateSentCopy never throws when the connection lookup fails", async () => {
  const prev = connection
  connection = async () => { throw new Error("db down") }
  try {
    const r = await trashPrivateSentCopy({ id: "19a0000000000abc", via: "test" })
    assert.equal(r.action, "failed")
    assert.equal(calls.length, 0)
    connection = async () => null
    assert.equal((await trashPrivateSentCopy({ id: "19a0000000000abc", via: "test" })).reason, "no Gmail connection")
  } finally {
    connection = prev
  }
})

test("SENT_TIDY_DRY_RUN=1 logs would-trash and touches nothing", async () => {
  process.env.SENT_TIDY_DRY_RUN = "1"
  const ref = await sendHtmlEmail({ to: CHLOE, subject: "Tarte weekly: 31 Oct to 6 Nov 2026", html: "<p>x</p>", text: "x", privateCopy: true })
  assert.equal(trashed(ref.id), false)
  assert.equal(trashCalls().length, 0)
  assert.ok(logs.some((l) => l.includes("would trash") && l.includes(ref.id!)))
})

test("tidyAfterSend skips without an id or a private subject", async () => {
  assert.equal(await tidyAfterSend({ id: undefined, subject: "Tarte weekly: x", via: "test", privateCopy: true }), null)
  assert.equal(await tidyAfterSend({ id: "19a0000000000abc", subject: "Set your Tarte Shifts PIN", via: "test" }), null)
  assert.equal(calls.length, 0)
})

test("internal trash-sent route: bearer only, Gmail ids only, and the caller cannot widen it", async () => {
  const pin = put({ subject: "Set your Tarte Shifts PIN", headers: { To: "sam@tarte.com.au" } })
  const daily = put({ subject: "Tarte today, Mon 9 Nov: wages and COGS" })
  const post = (body: unknown, auth = "Bearer test-cron-secret") =>
    trashSentRoute(new Request("http://kitchen-app:3000/api/internal/trash-sent", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }) as unknown as NextRequest)

  assert.equal((await post({ id: daily.id }, "Bearer wrong")).status, 401)
  for (const id of ["../threads/19a1", "19a1/trash", "short", "", 42]) assert.equal((await post({ id })).status, 400, String(id))
  assert.equal(calls.length, 0)

  const kept = await (await post({ id: pin.id, explicit: true, privateCopy: true, via: "shifts-onboarding" })).json()
  assert.equal(kept.action, "kept")
  assert.equal(trashed(pin.id), false)

  const dry = await (await post({ id: daily.id, via: "shifts-owner-daily", dryRun: true })).json()
  assert.equal(dry.action, "would trash")
  assert.equal(trashed(daily.id), false)

  const done = await (await post({ id: daily.id, via: "shifts-owner-daily" })).json()
  assert.equal(done.ok, true)
  assert.equal(trashed(daily.id), true)
  assertNothingDestructiveBeyondTrash()
})

test("weekly sweep: only private accounts@ Sent copies go, Louise-era tax mail and inbox mail stay", async () => {
  const digestSep = put({ subject: "Tarte weekly: 15 to 21 Sep", internalDate: SEP })
  const iasNov = put({ subject: "October IAS lodged", internalDate: Date.parse("2026-11-04T07:00:00Z") })
  const haccp = put({ subject: "[Tarte] HACCP Temperature Check - PM - Bakery - 2026-11-07 - 2 BREACH", labelIds: ["SENT", "INBOX"], headers: { To: ME } })
  const selfDigest = put({ subject: "Tarte weekly: 31 Oct to 6 Nov 2026", labelIds: ["SENT", "INBOX"], headers: { To: ME } })
  const reply = put({ subject: "Re: Tarte weekly: 31 Oct to 6 Nov 2026", labelIds: ["INBOX", "UNREAD"], headers: { From: CHLOE, To: ME } })
  const pin = put({ subject: "Set your Tarte Shifts PIN", headers: { To: "sam@tarte.com.au" } })
  const louise = put({ subject: "Re: September BAS", internalDate: Date.parse("2025-10-20T01:00:00Z"), headers: { To: "matt@example.com.au" } })
  const louiseTax = put({ subject: "Payroll Tax Burleigh due 21st July", internalDate: SENT_TIDY_FLOOR_MS - 1 })
  const alias = put({ subject: "Venue results w/e Tue 3 November", headers: { From: "hello@tarte.com.au" } })
  const binned = put({ subject: "COGS TRACKING (Wed 28 Oct to Tue 3 Nov): 1 day to go", labelIds: ["SENT", "TRASH"] })
  const all = [digestSep, iasNov, haccp, selfDigest, reply, pin, louise, louiseTax, alias, binned]

  const dry = await sweepPrivateSent({ dryRun: true })
  assert.equal(dry.checked, all.length)
  assert.equal(dry.wouldTrash, 2)
  assert.equal(trashCalls().length, 0)

  calls = []
  const live = await sweepPrivateSent({ dryRun: false })
  assert.equal(live.trashed, 2)
  assert.equal(live.failed, 0)
  assert.deepEqual(all.filter((m) => trashed(m.id) && m !== binned).map((m) => m.headers.Subject).sort(), ["October IAS lodged", "Tarte weekly: 15 to 21 Sep"])
  assert.ok(box.get(haccp.id)!.labelIds.includes("INBOX"))
  assert.ok(box.get(selfDigest.id)!.labelIds.includes("INBOX"))
  assert.ok(box.get(reply.id)!.labelIds.includes("INBOX"))
  assert.equal(live.kept["sent before 1 Nov 2026, kept as a record"], 2)
  // every search stayed in Sent
  const searches = calls.filter((c) => c.method === "GET" && c.path === BASE)
  assert.ok(searches.length > 0)
  assertNothingDestructiveBeyondTrash()
})

test("tidy-sent cron: bearer only, ?dry=1 touches nothing", async () => {
  const m = put({ subject: "Tarte weekly: 31 Oct to 6 Nov 2026" })
  const url = "http://kitchen-app:3000/api/cron/tidy-sent"
  assert.equal((await tidySentCron(new NextRequest(url))).status, 401)
  const res = await tidySentCron(new NextRequest(`${url}?dry=1&days=7`, { headers: { authorization: "Bearer test-cron-secret" } }))
  const body = await res.json()
  assert.equal(body.dryRun, true)
  assert.equal(body.wouldTrash, 1)
  assert.equal(trashed(m.id), false)
  assert.equal(trashCalls().length, 0)
})
