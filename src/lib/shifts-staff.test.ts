import { test, describe, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { toPersonRole, verifyStaff, findStaff, listActiveStaff } from "./shifts-staff"

// No Shifts connection and no dev login unless a test sets one. Never network.
beforeEach(() => {
  delete process.env.SHIFTS_BASE_URL
  delete process.env.SHIFTS_PAYRUNS_URL
  delete process.env.SHIFTS_SECRET
  delete process.env.PERSON_DEV_LOGIN
})

describe("role mapping", () => {
  test("Shifts SENIOR is Kitchen SUPERVISOR, everything else passes through", () => {
    assert.equal(toPersonRole("SENIOR"), "SUPERVISOR")
    assert.equal(toPersonRole("STAFF"), "STAFF")
    assert.equal(toPersonRole("MANAGER"), "MANAGER")
    assert.equal(toPersonRole("OWNER"), "OWNER")
  })
})

describe("verifyStaff fails closed without a Shifts connection", () => {
  test("no base url or secret means unavailable, never ok", async () => {
    assert.deepEqual(await verifyStaff("Nguyen", "1234", "10.0.0.1"), { ok: false, reason: "unavailable" })
    process.env.SHIFTS_SECRET = "fake"
    assert.deepEqual(await verifyStaff("Nguyen", "1234", "10.0.0.1"), { ok: false, reason: "unavailable" })
    delete process.env.SHIFTS_SECRET
    process.env.SHIFTS_BASE_URL = "https://shifts.example.test"
    assert.deepEqual(await verifyStaff("Nguyen", "1234", "10.0.0.1"), { ok: false, reason: "unavailable" })
  })

  test("a malformed payruns url yields unavailable rather than a bad fetch", async () => {
    process.env.SHIFTS_SECRET = "fake"
    process.env.SHIFTS_PAYRUNS_URL = "not a url"
    assert.deepEqual(await verifyStaff("Nguyen", "1234", "10.0.0.1"), { ok: false, reason: "unavailable" })
    assert.equal(await findStaff("Nguyen", "a@b.test", "10.0.0.1"), null)
    assert.equal(await listActiveStaff(), null)
  })

  test("empty name and PIN are refused", async () => {
    assert.equal((await verifyStaff("", "", "10.0.0.1")).ok, false)
  })
})

describe("dev login (never in production)", () => {
  test("only the fixed identities with PIN 0000 match", async () => {
    process.env.PERSON_DEV_LOGIN = "1"
    const dev = await verifyStaff("dev", "0000", "127.0.0.1")
    assert.equal(dev.ok, true)
    if (dev.ok) assert.equal(dev.staff.role, "STAFF")
    const mgr = await verifyStaff(" DevManager ", "0000", "127.0.0.1")
    assert.equal(mgr.ok, true)
    if (mgr.ok) assert.equal(mgr.staff.role, "MANAGER")
    assert.deepEqual(await verifyStaff("dev", "0001", "127.0.0.1"), { ok: false, reason: "nomatch" })
    assert.deepEqual(await verifyStaff("dev", "", "127.0.0.1"), { ok: false, reason: "nomatch" })
    assert.deepEqual(await verifyStaff("", "0000", "127.0.0.1"), { ok: false, reason: "nomatch" })
    assert.deepEqual(await verifyStaff("Nguyen", "0000", "127.0.0.1"), { ok: false, reason: "nomatch" })
  })

  test("findStaff in dev mode only knows dev and never returns a PIN", async () => {
    process.env.PERSON_DEV_LOGIN = "1"
    const s = await findStaff("dev", "x@y.test", "127.0.0.1")
    assert.equal(s?.id, "dev-staff")
    assert.equal("pin" in (s ?? {}), false)
    assert.equal(await findStaff("someone", "x@y.test", "127.0.0.1"), null)
  })
})
