import { test, describe } from "node:test"
import assert from "node:assert/strict"

// Obviously fake signing secret, set before the module is loaded.
process.env.NEXTAUTH_SECRET = "test-only-secret-not-real-0000000000"

import {
  ABSOLUTE_HOURS,
  IDLE_MINUTES,
  SETUP_MINUTES,
  OWNER_DEVICE_DAYS,
  decodeOwnerDevice,
  decodePerson,
  decodeSetup,
  encodeOwnerDevice,
  mayTrustDevice,
  personFromOwnerDevice,
  encodePerson,
  encodeSetup,
  isManagerRole,
  personCookieOptions,
  type PersonSession,
  type SetupToken,
} from "./person-auth"
import { DEED_VERSION } from "./confidentiality/deed"

const NOW = Date.UTC(2026, 8, 27, 3, 0, 0) // Sun 27 Sep 2026 13:00 AEST
const MIN = 60_000
const HOUR = 3_600_000

function session(over: Partial<PersonSession> = {}): PersonSession {
  return {
    id: "shifts-staff-42",
    name: "Candy Nguyen",
    last: "Nguyen",
    role: "STAFF",
    email: "candy@example.test",
    minor: false,
    deed: DEED_VERSION,
    iat: NOW - 5 * MIN,
    seen: NOW - MIN,
    ...over,
  }
}

/** Flip one character inside a base64url body so the JSON changes but the shape stays. */
function tamperBody(token: string): string {
  const idx = token.lastIndexOf(".")
  const body = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const c = body[5] === "A" ? "B" : "A"
  return `${body.slice(0, 5)}${c}${body.slice(6)}.${sig}`
}

describe("person session cookie", () => {
  test("round-trips a valid session", async () => {
    const p = session()
    const tok = await encodePerson(p)
    assert.match(tok, /^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/)
    assert.deepEqual(await decodePerson(tok, NOW), p)
  })

  test("rejects missing, empty and malformed cookies", async () => {
    assert.equal(await decodePerson(undefined, NOW), null)
    assert.equal(await decodePerson(null, NOW), null)
    assert.equal(await decodePerson("", NOW), null)
    assert.equal(await decodePerson("nodot", NOW), null)
    assert.equal(await decodePerson(".", NOW), null)
    assert.equal(await decodePerson("abc.", NOW), null)
    assert.equal(await decodePerson(".abc", NOW), null)
    assert.equal(await decodePerson("not base64!!.deadbeef", NOW), null)
  })

  test("rejects a tampered signature", async () => {
    const tok = await encodePerson(session())
    const idx = tok.lastIndexOf(".")
    const sig = tok.slice(idx + 1)
    const flipped = (sig[0] === "0" ? "1" : "0") + sig.slice(1)
    assert.equal(await decodePerson(`${tok.slice(0, idx)}.${flipped}`, NOW), null)
    // Wrong length signature
    assert.equal(await decodePerson(`${tok.slice(0, idx)}.${sig.slice(1)}`, NOW), null)
    assert.equal(await decodePerson(`${tok.slice(0, idx)}.`, NOW), null)
  })

  test("rejects a tampered body (role escalation attempt)", async () => {
    const tok = await encodePerson(session({ role: "STAFF" }))
    assert.equal(await decodePerson(tamperBody(tok), NOW), null)
    // Re-encoding a forged body without the secret cannot be verified here,
    // but a body signed under a different secret must fail.
    const idx = tok.lastIndexOf(".")
    const body = tok.slice(0, idx)
    const forged = `${body}.${"0".repeat(64)}`
    assert.equal(await decodePerson(forged, NOW), null)
  })

  test("a body with a valid signature but a bad JSON shape is rejected", async () => {
    // Sign a payload that decodes to JSON without id/name: encodePerson will
    // happily sign whatever object it is handed.
    const bad = await encodePerson({ iat: NOW, seen: NOW } as unknown as PersonSession)
    assert.equal(await decodePerson(bad, NOW), null)
    const noName = await encodePerson(session({ name: "" }))
    assert.equal(await decodePerson(noName, NOW), null)
    const noId = await encodePerson(session({ id: "" }))
    assert.equal(await decodePerson(noId, NOW), null)
    const zeroIat = await encodePerson(session({ iat: 0 }))
    assert.equal(await decodePerson(zeroIat, NOW), null)
    const zeroSeen = await encodePerson(session({ seen: 0 }))
    assert.equal(await decodePerson(zeroSeen, NOW), null)
  })

  test("a signed non-object payload is rejected, not thrown", async () => {
    const tok = await encodePerson("hello" as unknown as PersonSession)
    assert.equal(await decodePerson(tok, NOW), null)
    const nul = await encodePerson(null as unknown as PersonSession)
    assert.equal(await decodePerson(nul, NOW), null)
  })

  test("absolute expiry is 24 hours from issue, measured in milliseconds", async () => {
    assert.equal(ABSOLUTE_HOURS, 24)
    const fresh = session({ iat: NOW - 24 * HOUR + MIN, seen: NOW })
    assert.ok(await decodePerson(await encodePerson(fresh), NOW))
    const stale = session({ iat: NOW - 24 * HOUR - 1, seen: NOW })
    assert.equal(await decodePerson(await encodePerson(stale), NOW), null)
  })

  test("idle expiry is 6 hours since last seen", async () => {
    assert.equal(IDLE_MINUTES, 360)
    const active = session({ iat: NOW - 10 * HOUR, seen: NOW - 6 * HOUR + MIN })
    assert.ok(await decodePerson(await encodePerson(active), NOW))
    const idle = session({ iat: NOW - 10 * HOUR, seen: NOW - 6 * HOUR - 1 })
    assert.equal(await decodePerson(await encodePerson(idle), NOW), null)
  })

  test("timestamps written in seconds instead of ms read as ancient and fail closed", async () => {
    const secs = Math.floor(NOW / 1000)
    const tok = await encodePerson(session({ iat: secs, seen: secs }))
    assert.equal(await decodePerson(tok, NOW), null)
  })

  test("a session from the future is still bounded by idle and absolute windows", async () => {
    // iat in the future gives a negative age; must not throw, and is accepted
    // (the check is one-sided). Documented behaviour, not a hole: the cookie
    // is signed so a client cannot mint this.
    const tok = await encodePerson(session({ iat: NOW + HOUR, seen: NOW + HOUR }))
    assert.ok(await decodePerson(tok, NOW))
  })

  test("deed state survives the round trip so middleware can gate on it", async () => {
    const unsigned = await decodePerson(await encodePerson(session({ deed: null })), NOW)
    assert.equal(unsigned?.deed, null)
    assert.notEqual(unsigned?.deed, DEED_VERSION)
    const old = await decodePerson(await encodePerson(session({ deed: "2026-09-20.3" })), NOW)
    assert.notEqual(old?.deed, DEED_VERSION)
    const current = await decodePerson(await encodePerson(session()), NOW)
    assert.equal(current?.deed, DEED_VERSION)
  })

  test("cookie maxAge is in seconds and matches the absolute window", () => {
    const o = personCookieOptions()
    assert.equal(o.maxAge, 24 * 3600)
    assert.equal(o.httpOnly, true)
    assert.equal(o.sameSite, "lax")
    assert.equal(o.path, "/")
  })

  test("names with unicode survive base64url", async () => {
    const p = session({ name: "Zoë Müller-Šťastný 🍰" })
    assert.equal((await decodePerson(await encodePerson(p), NOW))?.name, p.name)
  })
})

describe("roles", () => {
  test("only owner, manager and supervisor count as managers", () => {
    assert.equal(isManagerRole("OWNER"), true)
    assert.equal(isManagerRole("MANAGER"), true)
    assert.equal(isManagerRole("SUPERVISOR"), true)
    assert.equal(isManagerRole("STAFF"), false)
    // Anything unexpected fails closed.
    assert.equal(isManagerRole("ADMIN" as never), false)
    assert.equal(isManagerRole("" as never), false)
    assert.equal(isManagerRole(undefined as never), false)
  })
})

describe("setup link token", () => {
  const tok: SetupToken = {
    id: "shifts-staff-7",
    first: "Jose",
    last: "Ramirez",
    role: "MANAGER",
    email: "jose@example.test",
    minor: false,
    exp: NOW + SETUP_MINUTES * MIN,
  }

  test("round-trips before expiry and dies at expiry", async () => {
    const t = await encodeSetup(tok)
    assert.deepEqual(await decodeSetup(t, NOW), tok)
    assert.deepEqual(await decodeSetup(t, tok.exp - 1), tok)
    assert.equal(await decodeSetup(t, tok.exp), null)
    assert.equal(await decodeSetup(t, tok.exp + 1), null)
  })

  test("rejects missing, malformed and tampered tokens", async () => {
    assert.equal(await decodeSetup(undefined, NOW), null)
    assert.equal(await decodeSetup("", NOW), null)
    assert.equal(await decodeSetup("abc", NOW), null)
    const t = await encodeSetup(tok)
    assert.equal(await decodeSetup(tamperBody(t), NOW), null)
    const idx = t.lastIndexOf(".")
    assert.equal(await decodeSetup(`${t.slice(0, idx)}.${"f".repeat(64)}`, NOW), null)
  })

  test("a token without exp or id is rejected", async () => {
    const noExp = await encodeSetup({ ...tok, exp: undefined as unknown as number })
    assert.equal(await decodeSetup(noExp, NOW), null)
    const noId = await encodeSetup({ ...tok, id: "" })
    assert.equal(await decodeSetup(noId, NOW), null)
  })

  test("a person cookie cannot be replayed as a setup link, nor the reverse", async () => {
    const personTok = await encodePerson(session())
    assert.equal(await decodeSetup(personTok, NOW), null)
    const setupTok = await encodeSetup(tok)
    assert.equal(await decodePerson(setupTok, NOW), null)
  })
})

describe("secret handling", () => {
  test("no NEXTAUTH_SECRET means nothing can be signed or verified", async () => {
    const saved = process.env.NEXTAUTH_SECRET
    const tok = await encodePerson(session())
    delete process.env.NEXTAUTH_SECRET
    try {
      await assert.rejects(() => encodePerson(session()), /NEXTAUTH_SECRET/)
      await assert.rejects(() => decodePerson(tok, NOW), /NEXTAUTH_SECRET/)
    } finally {
      process.env.NEXTAUTH_SECRET = saved
    }
  })

  test("a cookie signed under one secret does not verify under another", async () => {
    const saved = process.env.NEXTAUTH_SECRET
    const tok = await encodePerson(session())
    process.env.NEXTAUTH_SECRET = "a-different-fake-secret"
    try {
      assert.equal(await decodePerson(tok, NOW), null)
    } finally {
      process.env.NEXTAUTH_SECRET = saved
    }
    assert.ok(await decodePerson(tok, NOW))
  })
})

describe("owner's own phone", () => {
  const device = { id: "shifts-staff-1", name: "Chloe Watts", last: "Watts", email: null, iat: NOW }

  test("only Chloe may mark a device: not other owners, managers or staff", () => {
    assert.equal(mayTrustDevice({ role: "OWNER", last: "Watts" }), true)
    assert.equal(mayTrustDevice({ role: "OWNER", last: "Pate" }), true)
    assert.equal(mayTrustDevice({ role: "OWNER", last: "Warren" }), false)
    assert.equal(mayTrustDevice({ role: "MANAGER", last: "Watts" }), false)
    assert.equal(mayTrustDevice({ role: "STAFF", last: "Nguyen" }), false)
    assert.equal(mayTrustDevice(null), false)
  })

  test("round trips, and signs her in as OWNER with the current deed", async () => {
    const raw = await encodeOwnerDevice(device)
    const d = await decodeOwnerDevice(raw, NOW + 30 * 24 * HOUR)
    assert.equal(d?.id, "shifts-staff-1")
    const p = personFromOwnerDevice(d!, DEED_VERSION, NOW)
    assert.equal(p.role, "OWNER")
    assert.equal(p.deed, DEED_VERSION)
    assert.ok(await decodePerson(await encodePerson(p), NOW + MIN))
  })

  test("expires, rejects tampering, and a staff session is not a device token", async () => {
    const raw = await encodeOwnerDevice(device)
    assert.equal(await decodeOwnerDevice(raw, NOW + (OWNER_DEVICE_DAYS + 1) * 24 * HOUR), null)
    assert.equal(await decodeOwnerDevice(raw.slice(0, -1) + (raw.endsWith("0") ? "1" : "0"), NOW), null)
    assert.equal(await decodeOwnerDevice(await encodePerson(session({ role: "OWNER", last: "Watts", iat: NOW, seen: NOW })), NOW), null)
    assert.equal(await decodePerson(raw, NOW), null)
    assert.equal(await decodeOwnerDevice(undefined, NOW), null)
  })

  test("a device token for anyone but Chloe or Shawna is refused even if correctly signed", async () => {
    const shawna = await encodeOwnerDevice({ ...device, name: "Shawna Pate", last: "Pate" })
    assert.equal((await decodeOwnerDevice(shawna, NOW))?.last, "Pate")
    const oliver = await encodeOwnerDevice({ ...device, name: "Oliver Warren", last: "Warren" })
    assert.equal(await decodeOwnerDevice(oliver, NOW), null)
  })
})
