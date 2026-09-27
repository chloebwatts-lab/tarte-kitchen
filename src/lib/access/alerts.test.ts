import { test, describe, beforeEach } from "node:test"
import assert from "node:assert/strict"

process.env.NEXTAUTH_SECRET = "test-only-secret-not-real-0000000000"
process.env.DATABASE_URL = "postgresql://fake:fake@127.0.0.1:1/fake"
delete process.env.ACCESS_ALERT_TO

import { db } from "@/lib/db"
import { accessAlertRecipients, findNewAlerts, markAlertsSent } from "./alerts"

/**
 * In-memory AccessEvent and AccessAlert tables standing in for Prisma, so
 * the alert rules run with no database. Nothing here connects anywhere.
 */
type Ev = { id: string; kind: string; staffId: string | null; staffName: string | null; attemptedName: string | null; path: string | null; ip: string | null; at: Date }
let events: Ev[] = []
let sentKeys = new Set<string>()
let n = 0

const fakeAccessEvent = {
  async findMany({ where }: { where: { at?: { gte: Date }; kind?: string } }) {
    return events
      .filter((e) => (!where.at?.gte || e.at >= where.at.gte) && (!where.kind || e.kind === where.kind))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
  },
  async findFirst({ where }: { where: { kind: string } }) {
    const hits = events.filter((e) => e.kind === where.kind).sort((a, b) => a.at.getTime() - b.at.getTime())
    return hits.length ? { at: hits[0].at } : null
  },
  async count({ where }: { where: { kind: string; ip?: string | null; at?: { lt?: Date; gte?: Date } } }) {
    return events.filter((e) => e.kind === where.kind && (where.ip === undefined || e.ip === where.ip) && (!where.at?.lt || e.at < where.at.lt) && (!where.at?.gte || e.at >= where.at.gte)).length
  },
}
const fakeAccessAlert = {
  async findMany({ where }: { where: { key?: { in: string[] } } }) {
    return [...sentKeys].filter((k) => !where.key || where.key.in.includes(k)).map((key) => ({ key }))
  },
  async upsert({ where }: { where: { key: string } }) {
    sentKeys.add(where.key)
    return { key: where.key }
  },
}
Object.defineProperty(db, "accessEvent", { value: fakeAccessEvent, configurable: true })
Object.defineProperty(db, "accessAlert", { value: fakeAccessAlert, configurable: true })

// Sun 27 Sep 2026 13:00 AEST (03:00 UTC): the middle of a normal shift.
const NOW = new Date(Date.UTC(2026, 8, 27, 3, 0, 0))
const MIN = 60_000
function ev(over: Partial<Ev> & { kind: string; agoMin?: number }): Ev {
  const { agoMin = 1, ...rest } = over
  const e: Ev = { id: `e${++n}`, staffId: "s1", staffName: "Candy Nguyen", attemptedName: null, path: "/kitchen", ip: "10.0.0.5", at: new Date(NOW.getTime() - agoMin * MIN), ...rest }
  events.push(e)
  return e
}
/** A login from long ago so the "new place" rule is out of its learning week. */
const oldLogin = () => ev({ kind: "LOGIN", agoMin: 10 * 24 * 60, ip: "10.0.0.5" })

beforeEach(() => {
  events = []
  sentKeys = new Set()
  n = 0
})

describe("recipients", () => {
  test("default is chloe only, never a shared inbox", () => {
    delete process.env.ACCESS_ALERT_TO
    assert.deepEqual(accessAlertRecipients(), ["chloe@tarte.com.au"])
  })

  test("env list is split and trimmed, and blanks fall back to the default", () => {
    process.env.ACCESS_ALERT_TO = " chloe@tarte.com.au , shawna@tarte.com.au ,, "
    assert.deepEqual(accessAlertRecipients(), ["chloe@tarte.com.au", "shawna@tarte.com.au"])
    process.env.ACCESS_ALERT_TO = " , , "
    assert.deepEqual(accessAlertRecipients(), ["chloe@tarte.com.au"])
    process.env.ACCESS_ALERT_TO = ""
    assert.deepEqual(accessAlertRecipients(), ["chloe@tarte.com.au"])
    delete process.env.ACCESS_ALERT_TO
  })
})

describe("findNewAlerts", () => {
  test("quiet window yields nothing", async () => {
    oldLogin()
    ev({ kind: "VIEW", path: "/kitchen/cooling" })
    ev({ kind: "LOGIN", agoMin: 3 })
    assert.deepEqual(await findNewAlerts(NOW), [])
  })

  test("every capture attempt alerts straight away and names the person", async () => {
    oldLogin()
    const a = ev({ kind: "CAPTURE_ATTEMPT", path: "/kitchen/prices", staffName: "Jose Ramirez", staffId: "s9" })
    const out = await findNewAlerts(NOW)
    assert.equal(out.length, 1)
    assert.equal(out[0].key, `capture:${a.id}`)
    assert.equal(out[0].staffId, "s9")
    assert.ok(out[0].summary.includes("Jose Ramirez"))
    assert.ok(out[0].summary.includes("/kitchen/prices"))
  })

  test("bulk: 59 views is quiet, 60 alerts once per hour", async () => {
    oldLogin()
    for (let i = 0; i < 59; i++) ev({ kind: "VIEW", path: "/kitchen/cooling", agoMin: 1 })
    assert.deepEqual(await findNewAlerts(NOW), [])
    ev({ kind: "VIEW", path: "/kitchen/cooling", agoMin: 1 })
    const out = await findNewAlerts(NOW)
    assert.equal(out.length, 1)
    assert.ok(out[0].key.startsWith("bulk:s1:"))
    assert.ok(out[0].summary.includes("opened 60 pages"))
  })

  test("bulk: ten distinct sensitive pages alerts even at low volume, query strings and sub paths count", async () => {
    oldLogin()
    const pages = ["/kitchen/portions", "/kitchen/prices?q=butter", "/kitchen/prep/monday", "/kitchen/serves", "/kitchen/order", "/kitchen/ordering", "/kitchen/restock", "/kitchen/gm", "/kitchen/managers/board"]
    for (const p of pages) ev({ kind: "VIEW", path: p })
    assert.deepEqual(await findNewAlerts(NOW), [], "nine sensitive pages is under the bar")
    ev({ kind: "VIEW", path: "/kitchen/training" })
    const out = await findNewAlerts(NOW)
    assert.equal(out.length, 1)
    assert.ok(out[0].summary.includes("10 of them sensitive"))
  })

  test("look-alike paths are not sensitive", async () => {
    oldLogin()
    for (const p of ["/kitchen/pricesheet", "/kitchen/gmail", "/kitchen/orders-old", "/kitchen/prepared", "/kitchen/jobsite", "/kitchen/restocking", "/kitchen/lineups", "/kitchen/trainingx", "/kitchen/meetings", "/kitchen/servesx"]) ev({ kind: "VIEW", path: p })
    assert.deepEqual(await findNewAlerts(NOW), [])
  })

  test("views without a staff id never trip the bulk rule", async () => {
    oldLogin()
    for (let i = 0; i < 80; i++) ev({ kind: "VIEW", staffId: null, staffName: null })
    assert.deepEqual(await findNewAlerts(NOW), [])
  })

  test("views outside the 15 minute window are ignored", async () => {
    oldLogin()
    for (let i = 0; i < 80; i++) ev({ kind: "VIEW", agoMin: 16 })
    assert.deepEqual(await findNewAlerts(NOW), [])
  })

  test("late night: a view at 22:00 or 03:59 Brisbane alerts, 21:59 and 04:00 do not", async () => {
    oldLogin()
    // 22:00 AEST = 12:00 UTC. Use a NOW just after each view.
    const at = (utcHour: number, utcMin: number) => new Date(Date.UTC(2026, 8, 26, utcHour, utcMin, 0))
    const check = async (utcHour: number, utcMin: number) => {
      events = events.filter((e) => e.kind !== "VIEW")
      const t = at(utcHour, utcMin)
      events.push({ id: `v${++n}`, kind: "VIEW", staffId: "s1", staffName: "Candy Nguyen", attemptedName: null, path: "/kitchen", ip: "10.0.0.5", at: t })
      sentKeys = new Set()
      return (await findNewAlerts(new Date(t.getTime() + MIN))).filter((a) => a.key.startsWith("late:"))
    }
    assert.equal((await check(12, 0)).length, 1, "22:00 AEST")
    assert.equal((await check(17, 59)).length, 1, "03:59 AEST")
    assert.equal((await check(11, 59)).length, 0, "21:59 AEST")
    assert.equal((await check(18, 0)).length, 0, "04:00 AEST")
    const [late] = await check(13, 30)
    assert.ok(late.summary.includes("outside hours"))
    assert.ok(late.key.startsWith("late:s1:"))
  })

  test("PIN guessing: four fails from one address quiet, five alerts with the names tried", async () => {
    oldLogin()
    for (let i = 0; i < 4; i++) ev({ kind: "LOGIN_FAILED", ip: "203.0.113.7", attemptedName: `name${i}`, staffId: null })
    assert.deepEqual(await findNewAlerts(NOW), [])
    ev({ kind: "LOGIN_FAILED", ip: "203.0.113.7", attemptedName: "", staffId: null })
    const out = await findNewAlerts(NOW)
    assert.equal(out.length, 1)
    assert.ok(out[0].key.startsWith("guess:203.0.113.7:"))
    assert.equal(out[0].staffId, null)
    assert.ok(out[0].summary.includes("5 failed sign ins"))
    assert.ok(out[0].summary.includes("name0"))
    assert.ok(out[0].summary.includes("blank"))
  })

  test("PIN guessing counts per address, missing ip groups as ?", async () => {
    oldLogin()
    for (let i = 0; i < 3; i++) ev({ kind: "LOGIN_FAILED", ip: "1.1.1.1", staffId: null })
    for (let i = 0; i < 3; i++) ev({ kind: "LOGIN_FAILED", ip: "2.2.2.2", staffId: null })
    assert.deepEqual(await findNewAlerts(NOW), [])
    for (let i = 0; i < 5; i++) ev({ kind: "LOGIN_FAILED", ip: null, staffId: null })
    const out = await findNewAlerts(NOW)
    assert.equal(out.length, 1)
    assert.ok(out[0].key.startsWith("guess:?:"))
  })

  test("new place: a first-ever address alerts only after a week of history", async () => {
    // Learning week: first login was 3 days ago.
    ev({ kind: "LOGIN", agoMin: 3 * 24 * 60, ip: "10.0.0.5" })
    ev({ kind: "LOGIN", agoMin: 2, ip: "198.51.100.77", staffName: "Jose Ramirez", staffId: "s9" })
    assert.deepEqual(await findNewAlerts(NOW), [])
    // Now with history.
    events = []
    oldLogin()
    ev({ kind: "LOGIN", agoMin: 2, ip: "198.51.100.77", staffName: "Jose Ramirez", staffId: "s9" })
    const out = await findNewAlerts(NOW)
    assert.equal(out.length, 1)
    assert.equal(out[0].key, "newplace:s9:198.51.100.77")
    assert.ok(out[0].summary.includes("never used before"))
    // A known address is fine, whoever uses it.
    events = []
    oldLogin()
    ev({ kind: "LOGIN", agoMin: 2, ip: "10.0.0.5", staffName: "Jose Ramirez", staffId: "s9" })
    assert.deepEqual(await findNewAlerts(NOW), [])
    // A login with no ip cannot be judged.
    ev({ kind: "LOGIN", agoMin: 2, ip: null, staffName: "Jose Ramirez", staffId: "s9" })
    assert.deepEqual(await findNewAlerts(NOW), [])
  })

  test("alerts already sent are not repeated, but a new one still is", async () => {
    oldLogin()
    const a = ev({ kind: "CAPTURE_ATTEMPT", path: "/kitchen/prices" })
    const first = await findNewAlerts(NOW)
    assert.equal(first.length, 1)
    await markAlertsSent(first)
    assert.deepEqual(await findNewAlerts(NOW), [])
    const b = ev({ kind: "CAPTURE_ATTEMPT", path: "/kitchen/portions" })
    const second = await findNewAlerts(NOW)
    assert.deepEqual(second.map((x) => x.key), [`capture:${b.id}`])
    assert.notEqual(a.id, b.id)
  })

  test("summaries carry no em or en dashes", async () => {
    oldLogin()
    ev({ kind: "CAPTURE_ATTEMPT", path: "/kitchen/prices" })
    for (let i = 0; i < 60; i++) ev({ kind: "VIEW", path: "/kitchen/prices" })
    for (let i = 0; i < 5; i++) ev({ kind: "LOGIN_FAILED", ip: "9.9.9.9", staffId: null })
    for (const a of await findNewAlerts(NOW)) assert.equal(/[—–]/.test(a.summary), false, a.summary)
  })
})
