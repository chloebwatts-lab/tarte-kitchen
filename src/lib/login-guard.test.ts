import { test, describe, beforeEach } from "node:test"
import assert from "node:assert/strict"

process.env.NEXTAUTH_SECRET = "test-only-secret-not-real-0000000000"
process.env.DATABASE_URL = "postgresql://fake:fake@127.0.0.1:1/fake"

import { db } from "./db"
import { LOCKED_MESSAGE, guardedCheck, ipFrom, isLockedOut, recordAttempt } from "./login-guard"

/**
 * The Prisma delegate is replaced with an in-memory table so the counting
 * logic runs with no database. Nothing here opens a connection.
 */
type Row = { gate: string; ip: string; ok: boolean; createdAt: Date }
let rows: Row[] = []
let deleted = 0

function within(r: Row, gte?: Date) {
  return !gte || r.createdAt >= gte
}

const fakeLoginAttempt = {
  async count({ where }: { where: { gate: string; ip?: string; ok: boolean; createdAt?: { gte: Date } } }) {
    return rows.filter((r) => r.gate === where.gate && (where.ip === undefined || r.ip === where.ip) && r.ok === where.ok && within(r, where.createdAt?.gte)).length
  },
  async findMany({ where, take }: { where: { gate: string; ok: boolean; createdAt?: { gte: Date } }; take: number }) {
    return rows
      .filter((r) => r.gate === where.gate && r.ok === where.ok && within(r, where.createdAt?.gte))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, take)
      .map((r) => ({ createdAt: r.createdAt }))
  },
  async create({ data }: { data: { gate: string; ip: string; ok: boolean } }) {
    rows.push({ ...data, createdAt: new Date() })
    return data
  },
  async groupBy() {
    return []
  },
  async deleteMany() {
    deleted++
    return { count: 0 }
  },
}
Object.defineProperty(db, "loginAttempt", { value: fakeLoginAttempt, configurable: true })

const MIN = 60_000
const seed = (gate: string, ip: string, agoMs: number, ok = false) => rows.push({ gate, ip, ok, createdAt: new Date(Date.now() - agoMs) })

beforeEach(() => {
  rows = []
  deleted = 0
})

describe("ipFrom", () => {
  const h = (m: Record<string, string | null | undefined>) => ({ get: (n: string) => m[n] })

  test("first hop of x-forwarded-for wins, trimmed", () => {
    assert.equal(ipFrom(h({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" })), "203.0.113.9")
    assert.equal(ipFrom(h({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9")
  })

  test("falls back to x-real-ip then unknown", () => {
    assert.equal(ipFrom(h({ "x-real-ip": "198.51.100.4" })), "198.51.100.4")
    assert.equal(ipFrom(h({})), "unknown")
    assert.equal(ipFrom(h({ "x-forwarded-for": "", "x-real-ip": "" })), "unknown")
    assert.equal(ipFrom(h({ "x-forwarded-for": "   " })), "unknown")
    assert.equal(ipFrom(h({ "x-forwarded-for": null, "x-real-ip": null })), "unknown")
  })

  test("caps at 64 characters", () => {
    assert.equal(ipFrom(h({ "x-forwarded-for": "a".repeat(200) })).length, 64)
  })
})

describe("per-address lockout", () => {
  test("four misses in 15 minutes still allowed, five locks", async () => {
    for (let i = 0; i < 4; i++) seed("staff", "1.1.1.1", i * MIN)
    assert.equal(await isLockedOut("staff", "1.1.1.1"), false)
    seed("staff", "1.1.1.1", 14 * MIN)
    assert.equal(await isLockedOut("staff", "1.1.1.1"), true)
  })

  test("misses older than 15 minutes do not count", async () => {
    for (let i = 0; i < 4; i++) seed("staff", "1.1.1.1", i * MIN)
    seed("staff", "1.1.1.1", 16 * MIN)
    assert.equal(await isLockedOut("staff", "1.1.1.1"), false)
  })

  test("successful attempts never count, other addresses and gates are separate", async () => {
    for (let i = 0; i < 10; i++) seed("staff", "1.1.1.1", i * MIN, true)
    assert.equal(await isLockedOut("staff", "1.1.1.1"), false)
    for (let i = 0; i < 5; i++) seed("staff", "2.2.2.2", i * MIN)
    assert.equal(await isLockedOut("staff", "1.1.1.1"), false)
    assert.equal(await isLockedOut("staff", "2.2.2.2"), true)
    assert.equal(await isLockedOut("managers", "2.2.2.2"), false)
  })
})

describe("gate-wide lockout", () => {
  test("24 misses across addresses keep the gate open, 25 shut it for 30 minutes", async () => {
    for (let i = 0; i < 24; i++) seed("gm", `10.0.0.${i}`, i * 2 * MIN)
    assert.equal(await isLockedOut("gm", "9.9.9.9"), false)
    seed("gm", "10.0.0.99", 0)
    assert.equal(await isLockedOut("gm", "9.9.9.9"), true)
    assert.equal(await isLockedOut("gm", "10.0.0.1"), true)
    // Other gates unaffected.
    assert.equal(await isLockedOut("staff", "9.9.9.9"), false)
  })

  test("the gate reopens 30 minutes after the most recent miss even inside the hour", async () => {
    for (let i = 0; i < 25; i++) seed("council", `10.0.0.${i}`, 31 * MIN + i * MIN)
    assert.equal(await isLockedOut("council", "9.9.9.9"), false)
    // One newer miss re-arms the lock.
    seed("council", "10.0.0.50", 29 * MIN)
    assert.equal(await isLockedOut("council", "9.9.9.9"), true)
  })

  test("misses older than an hour never count toward the gate total", async () => {
    for (let i = 0; i < 25; i++) seed("admin", `10.0.0.${i}`, 61 * MIN + i)
    seed("admin", "10.0.0.99", 0)
    assert.equal(await isLockedOut("admin", "9.9.9.9"), false)
  })
})

describe("guardedCheck", () => {
  test("refuses while locked without running the check", async () => {
    for (let i = 0; i < 5; i++) seed("staff", "3.3.3.3", i * MIN)
    let ran = false
    const r = await guardedCheck("staff", () => { ran = true; return true }, "3.3.3.3")
    assert.equal(r, "locked")
    assert.equal(ran, false)
    assert.equal(rows.length, 5)
  })

  test("records the outcome and returns ok or wrong", async () => {
    assert.equal(await guardedCheck("staff", () => false, "4.4.4.4"), "wrong")
    assert.equal(await guardedCheck("staff", async () => true, "4.4.4.4"), "ok")
    assert.deepEqual(rows.map((r) => r.ok), [false, true])
    assert.equal(rows[0].ip, "4.4.4.4")
  })

  test("five wrong answers in a row lock the address on the sixth try", async () => {
    for (let i = 0; i < 5; i++) assert.equal(await guardedCheck("managers", () => false, "5.5.5.5"), "wrong")
    assert.equal(await guardedCheck("managers", () => true, "5.5.5.5"), "locked")
  })

  test("recordAttempt never throws even when the store fails", async () => {
    const saved = fakeLoginAttempt.create
    fakeLoginAttempt.create = async () => { throw new Error("db down") }
    try {
      await recordAttempt("staff", "6.6.6.6", false)
    } finally {
      fakeLoginAttempt.create = saved
    }
  })

  test("locked message is plain English with no dashes", () => {
    assert.equal(/[—–]/.test(LOCKED_MESSAGE), false)
    assert.ok(LOCKED_MESSAGE.includes("15 minutes"))
  })
})
