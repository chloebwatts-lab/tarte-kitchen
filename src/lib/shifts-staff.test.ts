import { test, describe, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  toPersonRole,
  verifyStaff,
  findStaff,
  listActiveStaff,
  foldName,
  surnameCandidates,
  MAX_SURNAME_CANDIDATES,
  type ShiftsStaff,
} from "./shifts-staff"

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

  test("foldName treats the hyphens a phone keyboard can produce the same way", () => {
    // U+2010 hyphen, U+2011 non-breaking hyphen, U+2013 en dash (iOS long press).
    assert.equal(foldName("Simpson‐Wylde"), "simpson wylde")
    assert.equal(foldName("Simpson‑Wylde"), "simpson wylde")
    assert.equal(foldName("Simpson–Wylde"), "simpson wylde")
    assert.equal(foldName("Simpson - Wylde"), "simpson wylde")
    assert.equal(foldName("\tNGUYEN\n"), "nguyen")
    assert.equal(foldName("Müller-Ødegård"), "muller ødegard", "ø is a letter, not an accent, and stays")
  })

  test("the accent-free spelling finds the surname as Shifts holds it", () => {
    assert.deepEqual(surnameCandidates("Martinez Carretero", staff), ["Martínez Carretero"])
    assert.deepEqual(surnameCandidates("MARTINEZ   CARRETERO", staff), ["Martínez Carretero"])
  })

  test("a hyphenated surname typed with a space, or a spaced one typed with a hyphen, still finds it", () => {
    assert.deepEqual(surnameCandidates("Simpson Wylde", staff), ["Simpson-Wylde"])
    assert.deepEqual(surnameCandidates("simpson wylde", staff), ["Simpson-Wylde"])
    assert.deepEqual(surnameCandidates("Martinez-Carretero", staff), ["Martínez Carretero"])
    assert.deepEqual(surnameCandidates("Dell-Vassiliou", staff), ["Dell Vassiliou"])
  })

  test("half of a two word surname finds it too", () => {
    assert.deepEqual(surnameCandidates("Martinez", staff), ["Martínez Carretero"])
    assert.deepEqual(surnameCandidates("Carretero", staff), ["Martínez Carretero"])
    assert.deepEqual(surnameCandidates("Vassiliou", staff), ["Dell Vassiliou"])
    assert.deepEqual(surnameCandidates("Simpson", staff), ["Simpson-Wylde"])
    assert.deepEqual(surnameCandidates("Wylde", staff), ["Simpson-Wylde"])
  })

  test("the typed spelling itself, a plain miss and a blank yield nothing", () => {
    assert.deepEqual(surnameCandidates("Watts", staff), [])
    assert.deepEqual(surnameCandidates("watts", staff), [])
    assert.deepEqual(surnameCandidates("Martínez Carretero", staff), [])
    assert.deepEqual(surnameCandidates("  martínez   carretero ", staff), [], "case and spacing alone do not make a new spelling")
    assert.deepEqual(surnameCandidates("Simpson-Wylde", staff), [])
    assert.deepEqual(surnameCandidates("Nguyen", staff), [])
    assert.deepEqual(surnameCandidates("   ", staff), [])
    assert.deepEqual(surnameCandidates("", staff), [])
    assert.deepEqual(surnameCandidates("-", staff), [], "a lone hyphen folds to nothing")
    assert.deepEqual(surnameCandidates("Mart", staff), [], "a fragment of a word is not a word")
    assert.deepEqual(surnameCandidates("Martinez Carretero Lopez", staff), [], "more words than Shifts holds is not a partial match")
    assert.deepEqual(surnameCandidates("Martinez Nguyen", staff), [], "every typed word must be in the held surname")
  })

  test("an empty staff list, or one with blank surnames, yields nothing and never throws", () => {
    assert.deepEqual(surnameCandidates("Martinez", []), [])
    const blanks = [{ lastName: "" }, { lastName: "   " }, { lastName: null }] as unknown as Array<Pick<ShiftsStaff, "lastName">>
    assert.deepEqual(surnameCandidates("Martinez", blanks), [])
    assert.deepEqual(surnameCandidates("", []), [])
  })

  test("exact fold matches come before partial ones, and each spelling is returned once", () => {
    const mixed = [
      { lastName: "Martinez Lopez" },
      { lastName: "Martínez" },
      { lastName: "Martinez Lopez" },
      { lastName: "MARTÍNEZ" },
      { lastName: "Martinez Carretero" },
    ]
    assert.deepEqual(surnameCandidates("Martinez", mixed), ["Martínez", "MARTÍNEZ", "Martinez Lopez"])
  })

  test("the list is capped so one attempt cannot become many", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ lastName: `Martinez Lopez ${i}` }))
    const out = surnameCandidates("Martinez", many)
    assert.equal(out.length, MAX_SURNAME_CANDIDATES)
    assert.deepEqual(out, ["Martinez Lopez 0", "Martinez Lopez 1", "Martinez Lopez 2"])
    assert.ok(MAX_SURNAME_CANDIDATES >= 1 && MAX_SURNAME_CANDIDATES <= 3, "a handful at most, Shifts has its own lockout")
  })
})

describe("verifyStaff retries Shifts with the spelling it holds", () => {
  const realFetch = globalThis.fetch
  const fran: ShiftsStaff = { id: "s1", firstName: "Fran", lastName: "Martínez Carretero", role: "STAFF", venue: "BURLEIGH", email: "fran@example.test" }
  const calls: Array<{ url: string; body: string | null }> = []
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })

  // What the fake Shifts does per endpoint. Tests override these to model
  // outages and lockouts; beforeEach puts the happy path back.
  let staffList: () => Response
  let verifyStatus: (lastName: string) => number | null

  const fakeShifts: typeof fetch = async (input, init) => {
    const url = String(input)
    const body = typeof init?.body === "string" ? init.body : null
    calls.push({ url, body })
    if (url.endsWith("/api/internal/staff-list")) return staffList()
    const req = body ? (JSON.parse(body) as { lastName: string; pin?: string; email?: string }) : { lastName: "" }
    if (url.endsWith("/api/internal/verify-staff")) {
      const forced = verifyStatus(req.lastName)
      if (forced !== null) return json({ ok: false }, forced)
      if (req.lastName === "Martínez Carretero" && req.pin === "4321") return json({ ok: true, staff: fran })
      return json({ ok: false })
    }
    if (url.endsWith("/api/internal/find-staff")) {
      return req.lastName === "Martínez Carretero" && req.email === "fran@example.test"
        ? json({ ok: true, staff: fran })
        : json({ ok: false })
    }
    return json({ ok: false }, 404)
  }

  const verifies = () => calls.filter((c) => c.url.endsWith("/verify-staff")).map((c) => JSON.parse(c.body!).lastName as string)
  const finds = () => calls.filter((c) => c.url.endsWith("/find-staff")).map((c) => JSON.parse(c.body!).lastName as string)
  const staffLists = () => calls.filter((c) => c.url.endsWith("/staff-list")).length

  beforeEach(() => {
    calls.length = 0
    staffList = () => json({ ok: true, staff: [fran] })
    verifyStatus = () => null
    process.env.SHIFTS_BASE_URL = "https://shifts.example.test"
    process.env.SHIFTS_SECRET = "fake"
    globalThis.fetch = fakeShifts
  })

  // Restored here, not at the end of each test, so a failing assertion can
  // never leave the fake in place for whatever runs next.
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test("Martinez Carretero plus the right PIN signs Fran in", async () => {
    const r = await verifyStaff("Martinez Carretero", "4321", "10.0.0.1")
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.staff.id, "s1")
    assert.deepEqual(verifies(), ["Martinez Carretero", "Martínez Carretero"])
    assert.equal(staffLists(), 1)
  })

  test("the right spelling with the wrong PIN is still nomatch, and a plain miss asks only once", async () => {
    assert.deepEqual(await verifyStaff("Martinez", "0000", "10.0.0.1"), { ok: false, reason: "nomatch" })
    assert.deepEqual(verifies(), ["Martinez", "Martínez Carretero"])
    calls.length = 0
    assert.deepEqual(await verifyStaff("Nguyen", "4321", "10.0.0.1"), { ok: false, reason: "nomatch" })
    assert.equal(verifies().length, 1)
    assert.equal(staffLists(), 1, "the list is fetched to look for other spellings, but there are none to try")
  })

  test("the typed spelling matching first means no staff list and no retry", async () => {
    const r = await verifyStaff("Martínez Carretero", "4321", "10.0.0.1")
    assert.equal(r.ok, true)
    assert.deepEqual(verifies(), ["Martínez Carretero"])
    assert.equal(staffLists(), 0)
  })

  test("the PIN is sent unchanged on every retry, with the same ip", async () => {
    await verifyStaff("martinez", "4321", "10.0.0.1")
    const bodies = calls.filter((c) => c.url.endsWith("/verify-staff")).map((c) => JSON.parse(c.body!) as { pin: string; ip: string })
    assert.equal(bodies.length, 2)
    for (const b of bodies) {
      assert.equal(b.pin, "4321")
      assert.equal(b.ip, "10.0.0.1")
    }
    for (const c of calls) {
      assert.ok(c.url.startsWith("https://shifts.example.test/api/internal/"))
    }
  })

  test("Shifts locking the retry (429) comes back as locked and stops the retries", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...fran, id: `m${i}`, lastName: `Martinez Lopez ${i}` }))
    staffList = () => json({ ok: true, staff: many })
    verifyStatus = (name) => (name === "Martinez Lopez 1" ? 429 : null)
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "locked" })
    assert.deepEqual(verifies(), ["Martinez", "Martinez Lopez 0", "Martinez Lopez 1"])
  })

  test("Shifts locking the first attempt (429) is locked at once: no staff list, no retry", async () => {
    verifyStatus = () => 429
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "locked" })
    assert.deepEqual(verifies(), ["Martinez"])
    assert.equal(staffLists(), 0)
  })

  test("Shifts down on the first attempt is unavailable with no retry; down on the retry is unavailable too", async () => {
    verifyStatus = () => 500
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "unavailable" })
    assert.deepEqual(verifies(), ["Martinez"])
    assert.equal(staffLists(), 0)

    calls.length = 0
    verifyStatus = (name) => (name === "Martínez Carretero" ? 503 : null)
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "unavailable" })
    assert.deepEqual(verifies(), ["Martinez", "Martínez Carretero"])
  })

  test("a staff list that fails or says no leaves the original nomatch and makes no retry", async () => {
    staffList = () => json({ ok: false }, 500)
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "nomatch" })
    assert.deepEqual(verifies(), ["Martinez"])

    calls.length = 0
    staffList = () => json({ ok: false })
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "nomatch" })
    assert.deepEqual(verifies(), ["Martinez"])

    calls.length = 0
    staffList = () => json({ ok: true, staff: [] })
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "nomatch" })
    assert.deepEqual(verifies(), ["Martinez"])

    calls.length = 0
    staffList = () => {
      throw new TypeError("fetch failed")
    }
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "nomatch" })
    assert.deepEqual(verifies(), ["Martinez"])
  })

  test("one sign in attempt is at most 1 + MAX_SURNAME_CANDIDATES calls to Shifts' verify, however many surnames match", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...fran, id: `m${i}`, lastName: `Martinez Lopez ${i}` }))
    staffList = () => json({ ok: true, staff: many })
    assert.deepEqual(await verifyStaff("Martinez", "4321", "10.0.0.1"), { ok: false, reason: "nomatch" })
    assert.equal(verifies().length, 1 + MAX_SURNAME_CANDIDATES)
  })

  test("the setup link lookup gets the same fallback", async () => {
    const found = await findStaff("martinez", "fran@example.test", "10.0.0.1")
    assert.equal(found?.id, "s1")
    assert.deepEqual(finds(), ["martinez", "Martínez Carretero"])
    calls.length = 0
    assert.equal(await findStaff("Nguyen", "fran@example.test", "10.0.0.1"), null)
    assert.deepEqual(finds(), ["Nguyen"])
  })

  test("the setup link lookup still needs the email on the record, spelling fallback or not", async () => {
    assert.equal(await findStaff("martinez", "someone-else@example.test", "10.0.0.1"), null)
    assert.deepEqual(finds(), ["martinez", "Martínez Carretero"])
    calls.length = 0
    assert.equal(await findStaff("Martínez Carretero", "someone-else@example.test", "10.0.0.1"), null)
  })

  test("the setup link lookup with no staff list gives up quietly", async () => {
    staffList = () => json({ ok: false }, 503)
    assert.equal(await findStaff("martinez", "fran@example.test", "10.0.0.1"), null)
    assert.deepEqual(finds(), ["martinez"])
  })
})

describe("after the stubbed Shifts tests", () => {
  test("the real fetch is back in place", () => {
    assert.equal(typeof globalThis.fetch, "function")
    assert.notEqual(globalThis.fetch.name, "fakeShifts")
  })
})

describe("surname spelling fallback: hyphenated surnames run together (Kim, 14 Oct 2026)", () => {
  const staff = [{ lastName: "TSAI-CHI WU" }, { lastName: "Martínez Carretero" }, { lastName: "Wu" }]
  test("the hyphen dropped and the halves joined still finds the surname Shifts holds", () => {
    assert.deepEqual(surnameCandidates("Tsaichi Wu", staff), ["TSAI-CHI WU"])
    assert.deepEqual(surnameCandidates("tsai chi wu", staff), ["TSAI-CHI WU"])
    assert.deepEqual(surnameCandidates("Tsai-Chi Wu", staff), [], "case aside it is the spelling already tried")
    assert.deepEqual(surnameCandidates("TsaiChiWu", staff), ["TSAI-CHI WU"])
  })
  test("one joined run of the words is enough, a fragment is not", () => {
    assert.deepEqual(surnameCandidates("Tsaichi", staff), ["TSAI-CHI WU"])
    assert.deepEqual(surnameCandidates("Tsa", staff), [])
    assert.deepEqual(surnameCandidates("Chiwu", staff), ["TSAI-CHI WU"])
  })
  test("a plain Wu is its own exact match, and the hyphenated one is offered after it", () => {
    assert.deepEqual(surnameCandidates("Wu", staff), ["TSAI-CHI WU"], "Wu itself was already tried by the caller")
  })
})
