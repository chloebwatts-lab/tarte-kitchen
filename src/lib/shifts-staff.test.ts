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

describe("surname spelling fallback (Fran, 13 Oct 2026)", () => {
  const { foldName, surnameCandidates, MAX_SURNAME_CANDIDATES } = require("./shifts-staff") as typeof import("./shifts-staff")
  const staff = [
    { lastName: "Martínez Carretero" },
    { lastName: "Watts" },
    { lastName: "Dell Vassiliou" },
    { lastName: "Simpson-Wylde" },
    { lastName: "Diniz Nasraui" },
    { lastName: "Martínez Carretero" },
  ]

  test("foldName drops accents, case, hyphens and extra spaces", () => {
    assert.equal(foldName("Martínez  Carretero"), "martinez carretero")
    assert.equal(foldName(" Simpson-Wylde "), "simpson wylde")
    assert.equal(foldName("Watts"), "watts")
    assert.equal(foldName(""), "")
  })

  test("the accent-free spelling finds the surname as Shifts holds it", () => {
    assert.deepEqual(surnameCandidates("Martinez Carretero", staff), ["Martínez Carretero"])
    assert.deepEqual(surnameCandidates("MARTINEZ   CARRETERO", staff), ["Martínez Carretero"])
  })

  test("half of a two word surname finds it too", () => {
    assert.deepEqual(surnameCandidates("Martinez", staff), ["Martínez Carretero"])
    assert.deepEqual(surnameCandidates("Carretero", staff), ["Martínez Carretero"])
    assert.deepEqual(surnameCandidates("Vassiliou", staff), ["Dell Vassiliou"])
    assert.deepEqual(surnameCandidates("Simpson", staff), ["Simpson-Wylde"])
  })

  test("the typed spelling itself, a plain miss and a blank yield nothing", () => {
    assert.deepEqual(surnameCandidates("Watts", staff), [])
    assert.deepEqual(surnameCandidates("watts", staff), [])
    assert.deepEqual(surnameCandidates("Martínez Carretero", staff), [])
    assert.deepEqual(surnameCandidates("Nguyen", staff), [])
    assert.deepEqual(surnameCandidates("   ", staff), [])
    assert.deepEqual(surnameCandidates("Mart", staff), [], "a fragment of a word is not a word")
  })

  test("the list is capped so one attempt cannot become many", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ lastName: `Martinez Lopez ${i}` }))
    const out = surnameCandidates("Martinez", many)
    assert.equal(out.length, MAX_SURNAME_CANDIDATES)
  })
})

describe("verifyStaff retries Shifts with the spelling it holds", () => {
  const realFetch = globalThis.fetch
  const calls: Array<{ url: string; body: string | null }> = []
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })

  const fakeShifts: typeof fetch = async (input, init) => {
    const url = String(input)
    const body = typeof init?.body === "string" ? init.body : null
    calls.push({ url, body })
    if (url.endsWith("/api/internal/staff-list")) {
      return json({ ok: true, staff: [{ id: "s1", firstName: "Fran", lastName: "Martínez Carretero", role: "STAFF", venue: "BURLEIGH" }] })
    }
    const req = body ? (JSON.parse(body) as { lastName: string; pin?: string }) : { lastName: "" }
    if (url.endsWith("/api/internal/verify-staff")) {
      if (req.lastName === "Martínez Carretero" && req.pin === "4321") {
        return json({ ok: true, staff: { id: "s1", firstName: "Fran", lastName: "Martínez Carretero", role: "STAFF", venue: "BURLEIGH" } })
      }
      return json({ ok: false })
    }
    if (url.endsWith("/api/internal/find-staff")) {
      return req.lastName === "Martínez Carretero"
        ? json({ ok: true, staff: { id: "s1", firstName: "Fran", lastName: "Martínez Carretero", role: "STAFF", venue: "BURLEIGH", email: "fran@example.test" } })
        : json({ ok: false })
    }
    return json({ ok: false }, 404)
  }

  beforeEach(() => {
    calls.length = 0
    process.env.SHIFTS_BASE_URL = "https://shifts.example.test"
    process.env.SHIFTS_SECRET = "fake"
    globalThis.fetch = fakeShifts
  })

  test("Martinez Carretero plus the right PIN signs Fran in", async () => {
    const r = await verifyStaff("Martinez Carretero", "4321", "10.0.0.1")
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.staff.id, "s1")
    const verifies = calls.filter((c) => c.url.endsWith("/verify-staff")).map((c) => JSON.parse(c.body!).lastName)
    assert.deepEqual(verifies, ["Martinez Carretero", "Martínez Carretero"])
    globalThis.fetch = realFetch
  })

  test("the right spelling with the wrong PIN is still nomatch, and a plain miss asks only once", async () => {
    assert.deepEqual(await verifyStaff("Martinez", "0000", "10.0.0.1"), { ok: false, reason: "nomatch" })
    calls.length = 0
    assert.deepEqual(await verifyStaff("Nguyen", "4321", "10.0.0.1"), { ok: false, reason: "nomatch" })
    assert.equal(calls.filter((c) => c.url.endsWith("/verify-staff")).length, 1)
    globalThis.fetch = realFetch
  })

  test("the setup link lookup gets the same fallback", async () => {
    const found = await findStaff("martinez", "fran@example.test", "10.0.0.1")
    assert.equal(found?.id, "s1")
    assert.equal(await findStaff("Nguyen", "fran@example.test", "10.0.0.1"), null)
    globalThis.fetch = realFetch
  })
})
