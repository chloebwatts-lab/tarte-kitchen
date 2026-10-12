import { test, describe, beforeEach } from "node:test"
import assert from "node:assert/strict"

process.env.NEXTAUTH_SECRET = "test-only-secret-not-real-0000000000"
process.env.DATABASE_URL = "postgresql://fake:fake@127.0.0.1:1/fake"

import { db } from "./db"
import { GATE_MAX, LOCKED_MESSAGE, PER_DEVICE_MAX, PER_IP_MAX, callerDevice, guardedCheck, ipFrom, isLockedOut, recordAttempt } from "./login-guard"

/**
 * The Prisma delegate is replaced with an in-memory table so the counting
 * logic runs with no database. Nothing here opens a connection.
 */
type Row = { gate: string; ip: string; ok: boolean; createdAt: Date; device?: string | null }
let rows: Row[] = []
let deleted = 0

function within(r: Row, gte?: Date) {
  return !gte || r.createdAt >= gte
}

const fakeLoginAttempt = {
  async count({ where }: { where: { gate: string; ip?: string; device?: string; ok: boolean; createdAt?: { gte: Date } } }) {
    return rows.filter(
      (r) =>
        r.gate === where.gate &&
        (where.ip === undefined || r.ip === where.ip) &&
        (where.device === undefined || r.device === where.device) &&
        r.ok === where.ok &&
        within(r, where.createdAt?.gte)
    ).length
  },
  async findMany({ where, take }: { where: { gate: string; ok: boolean; createdAt?: { gte: Date } }; take: number }) {
    return rows
      .filter((r) => r.gate === where.gate && r.ok === where.ok && within(r, where.createdAt?.gte))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, take)
      .map((r) => ({ createdAt: r.createdAt }))
  },
  async create({ data }: { data: { gate: string; ip: string; ok: boolean; device?: string | null } }) {
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
const seed = (gate: string, ip: string, agoMs: number, ok = false, device: string | null = null) => rows.push({ gate, ip, ok, device, createdAt: new Date(Date.now() - agoMs) })

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

describe("per-device lockout", () => {
  // The Burleigh wifi: every phone and iPad behind one address.
  const VENUE = "203.0.113.40"

  test("four misses from one browser in 15 minutes still allowed, five locks that browser", async () => {
    for (let i = 0; i < 4; i++) seed("staff", VENUE, i * MIN, false, "ipad-front")
    assert.equal(await isLockedOut("staff", VENUE, "ipad-front"), false)
    seed("staff", VENUE, 14 * MIN, false, "ipad-front")
    assert.equal(await isLockedOut("staff", VENUE, "ipad-front"), true)
  })

  test("one person's mistyped PINs never lock the rest of the venue", async () => {
    for (let i = 0; i < 12; i++) seed("staff", VENUE, i * MIN, false, "ipad-front")
    assert.equal(await isLockedOut("staff", VENUE, "ipad-front"), true)
    assert.equal(await isLockedOut("staff", VENUE, "laceys-phone"), false)
    assert.equal(await isLockedOut("staff", VENUE, null), false, "a browser with no device id yet")
  })

  test("misses older than 15 minutes do not count", async () => {
    for (let i = 0; i < 4; i++) seed("staff", VENUE, i * MIN, false, "ipad-front")
    seed("staff", VENUE, 16 * MIN, false, "ipad-front")
    assert.equal(await isLockedOut("staff", VENUE, "ipad-front"), false)
  })

  test("successful attempts never count, other devices and gates are separate", async () => {
    for (let i = 0; i < 10; i++) seed("staff", VENUE, i * MIN, true, "ipad-front")
    assert.equal(await isLockedOut("staff", VENUE, "ipad-front"), false)
    for (let i = 0; i < 5; i++) seed("staff", VENUE, i * MIN, false, "ipad-back")
    assert.equal(await isLockedOut("staff", VENUE, "ipad-front"), false)
    assert.equal(await isLockedOut("staff", VENUE, "ipad-back"), true)
    assert.equal(await isLockedOut("managers", VENUE, "ipad-back"), false)
  })
})

describe("per-address backstop", () => {
  test("39 misses from one address in 15 minutes still allowed, 40 locks the address", async () => {
    for (let i = 0; i < 39; i++) seed("staff", "1.1.1.1", (i % 14) * MIN, false, `bot-${i}`)
    assert.equal(await isLockedOut("staff", "1.1.1.1", "bot-new"), false)
    seed("staff", "1.1.1.1", 0, false, "bot-40")
    assert.equal(await isLockedOut("staff", "1.1.1.1", "bot-new"), true)
    assert.equal(await isLockedOut("staff", "1.1.1.1"), true)
    assert.equal(await isLockedOut("staff", "2.2.2.2"), false)
  })
})

describe("gate-wide lockout", () => {
  test("149 misses across addresses keep the gate open, 150 shut it for 30 minutes", async () => {
    for (let i = 0; i < 149; i++) seed("gm", `10.0.${Math.floor(i / 200)}.${i % 200}`, (i % 55) * MIN)
    assert.equal(await isLockedOut("gm", "9.9.9.9"), false)
    seed("gm", "10.0.0.199", 0)
    assert.equal(await isLockedOut("gm", "9.9.9.9"), true)
    assert.equal(await isLockedOut("gm", "10.0.0.1"), true)
    // Other gates unaffected.
    assert.equal(await isLockedOut("staff", "9.9.9.9"), false)
  })

  test("the gate reopens 30 minutes after the most recent miss even inside the hour", async () => {
    for (let i = 0; i < 150; i++) seed("council", `10.0.0.${i % 200}`, 31 * MIN + (i % 25) * MIN)
    assert.equal(await isLockedOut("council", "9.9.9.9"), false)
    // One newer miss re-arms the lock.
    seed("council", "10.0.0.50", 29 * MIN)
    assert.equal(await isLockedOut("council", "9.9.9.9"), true)
  })

  test("misses older than an hour never count toward the gate total", async () => {
    for (let i = 0; i < 150; i++) seed("admin", `10.0.0.${i % 200}`, 61 * MIN + i)
    seed("admin", "10.0.0.99", 0)
    assert.equal(await isLockedOut("admin", "9.9.9.9"), false)
  })
})

describe("guardedCheck", () => {
  test("refuses while locked without running the check", async () => {
    for (let i = 0; i < 5; i++) seed("staff", "3.3.3.3", i * MIN, false, "dev-a")
    let ran = false
    const r = await guardedCheck("staff", () => { ran = true; return true }, "3.3.3.3", "dev-a")
    assert.equal(r, "locked")
    assert.equal(ran, false)
    assert.equal(rows.length, 5)
  })

  test("records the outcome and returns ok or wrong", async () => {
    assert.equal(await guardedCheck("staff", () => false, "4.4.4.4", "dev-b"), "wrong")
    assert.equal(await guardedCheck("staff", async () => true, "4.4.4.4", "dev-b"), "ok")
    assert.deepEqual(rows.map((r) => r.ok), [false, true])
    assert.equal(rows[0].ip, "4.4.4.4")
    assert.equal(rows[0].device, "dev-b")
  })

  test("five wrong answers in a row lock that browser on the sixth try, the next iPad over is fine", async () => {
    for (let i = 0; i < 5; i++) assert.equal(await guardedCheck("managers", () => false, "5.5.5.5", "ipad-1"), "wrong")
    assert.equal(await guardedCheck("managers", () => true, "5.5.5.5", "ipad-1"), "locked")
    assert.equal(await guardedCheck("managers", () => true, "5.5.5.5", "ipad-2"), "ok")
  })

  test("a browser with no device id is still held by the address backstop", async () => {
    for (let i = 0; i < 40; i++) seed("managers", "7.7.7.7", i % 14 * MIN, false, null)
    assert.equal(await guardedCheck("managers", () => true, "7.7.7.7", null), "locked")
  })

  test("recordAttempt never throws even when the store fails", async () => {
    const saved = fakeLoginAttempt.create
    fakeLoginAttempt.create = async () => { throw new Error("db down") }
    try {
      await recordAttempt("staff", "6.6.6.6", false, "dev-c")
    } finally {
      fakeLoginAttempt.create = saved
    }
  })

  test("locked message is plain English with no dashes", () => {
    assert.equal(/[—–]/.test(LOCKED_MESSAGE), false)
    assert.ok(LOCKED_MESSAGE.includes("15 minutes"))
  })
})

describe("callers that pass no device", () => {
  test("thresholds are ordered: device, then address, then the whole gate", () => {
    assert.ok(PER_DEVICE_MAX < PER_IP_MAX && PER_IP_MAX < GATE_MAX)
    assert.equal(PER_DEVICE_MAX, 5)
  })

  test("callerDevice returns null outside a request instead of throwing", async () => {
    // node:test has no Next request store, same as any stray non-request call.
    assert.equal(await callerDevice(), null)
  })

  test("guardedCheck with no device (council, gm, managers) falls back to the cookie and still works", async () => {
    // Outside a request the cookie read yields null, so only the address rules apply.
    assert.equal(await guardedCheck("council", () => false, "8.8.8.8"), "wrong")
    assert.equal(await guardedCheck("council", () => true, "8.8.8.8"), "ok")
    assert.deepEqual(rows.map((r) => [r.ip, r.device, r.ok]), [["8.8.8.8", null, false], ["8.8.8.8", null, true]])
  })

  test("office login shape: isLockedOut and recordAttempt with no device argument at all", async () => {
    for (let i = 0; i < PER_IP_MAX - 1; i++) seed("admin", "203.0.113.7", (i % 14) * MIN)
    assert.equal(await isLockedOut("admin", "203.0.113.7"), false)
    await recordAttempt("admin", "203.0.113.7", false)
    assert.equal(rows.at(-1)?.device, null, "stored as null, not undefined")
    assert.equal(await isLockedOut("admin", "203.0.113.7"), true)
  })

  test("a device that keeps changing its cookie is still held by the address backstop", async () => {
    for (let i = 0; i < PER_IP_MAX; i++) {
      const r = await guardedCheck("managers", () => false, "198.51.100.9", `rotated-${i}`)
      assert.equal(r, "wrong", `try ${i + 1}`)
    }
    assert.equal(await guardedCheck("managers", () => true, "198.51.100.9", "rotated-fresh"), "locked")
  })
})
