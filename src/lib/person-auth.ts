/**
 * Per-person sign-in for the staff area (/kitchen, /staffaccess, /log).
 *
 * Chloe, 20 Sep 2026: no more shared passwords. Everyone signs in with the
 * same name and kiosk PIN they use on Tarte Shifts, every time they use the
 * app, and signs the confidentiality deed once before anything opens.
 *
 * The session is a signed cookie carrying who they are. Chloe, 20 Sep 2026
 * (evening): sign out after 6 hours of inactivity, with the managers area
 * and Oliver's desk back behind their own second passwords (manager-auth,
 * gm-auth). ABSOLUTE_HOURS is the hard stop so nobody's name carries over
 * to the next day on a shared iPad.
 *
 * Web Crypto only, so the same code verifies in middleware and in actions.
 */

export const PERSON_COOKIE = "tk_person"
export const DEVICE_COOKIE = "tk_device"

export const IDLE_MINUTES = 360
export const ABSOLUTE_HOURS = 24

export type PersonRole = "OWNER" | "MANAGER" | "SUPERVISOR" | "STAFF"

export interface PersonSession {
  /** Tarte Shifts staff id. */
  id: string
  name: string
  /** Last name as Shifts holds it, for the PIN email after the deed is signed. */
  last?: string
  role: PersonRole
  /** For the emailed copy of the deed. Optional: not everyone has one on file. */
  email?: string | null
  /** Under 18 on the day they signed in, from the Shifts date of birth. */
  minor?: boolean
  /** Deed version this person has signed, or null if they still have to. */
  deed: string | null
  /** Issued at, and last seen, in ms. */
  iat: number
  seen: number
}

const encoder = new TextEncoder()

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET must be set to sign staff sessions")
  return s
}

async function signHex(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`person:${secret()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function toB64Url(s: string): string {
  const bytes = encoder.encode(s)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64Url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export async function encodePerson(p: PersonSession): Promise<string> {
  const body = toB64Url(JSON.stringify(p))
  return `${body}.${await signHex(body)}`
}

/** A valid, unexpired, not-idle session, or null. */
export async function decodePerson(raw: string | undefined | null, now = Date.now()): Promise<PersonSession | null> {
  if (!raw) return null
  const idx = raw.lastIndexOf(".")
  if (idx < 0) return null
  const body = raw.slice(0, idx)
  if (!safeEqual(raw.slice(idx + 1), await signHex(body))) return null
  try {
    const p = JSON.parse(fromB64Url(body)) as PersonSession
    if (!p?.id || !p.name || !p.iat || !p.seen) return null
    if (now - p.iat > ABSOLUTE_HOURS * 3_600_000) return null
    if (now - p.seen > IDLE_MINUTES * 60_000) return null
    return p
  } catch {
    return null
  }
}

export function personCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // Session cookie plus our own idle/absolute checks: closing the browser
    // signs them out as well.
    maxAge: ABSOLUTE_HOURS * 3600,
  }
}

export function isManagerRole(role: PersonRole): boolean {
  return role === "OWNER" || role === "MANAGER" || role === "SUPERVISOR"
}


/**
 * One-time setup link ("set up your sign in"). Emailed to the address on the
 * person's Shifts record, so opening it proves they own that mailbox. Carries
 * who they are; good for SETUP_MINUTES.
 */
export const SETUP_MINUTES = 60

export interface SetupToken {
  id: string
  first: string
  last: string
  role: PersonRole
  email: string
  minor: boolean
  exp: number
}

export async function encodeSetup(t: SetupToken): Promise<string> {
  const body = toB64Url(JSON.stringify(t))
  return `${body}.${await signHex(`setup:${body}`)}`
}

export async function decodeSetup(raw: string | undefined | null, now = Date.now()): Promise<SetupToken | null> {
  if (!raw) return null
  const idx = raw.lastIndexOf(".")
  if (idx < 0) return null
  const body = raw.slice(0, idx)
  if (!safeEqual(raw.slice(idx + 1), await signHex(`setup:${body}`))) return null
  try {
    const t = JSON.parse(fromB64Url(body)) as SetupToken
    return t?.id && t.exp > now ? t : null
  } catch {
    return null
  }
}


/**
 * "This is my phone" for the owner (Chloe, 5 Oct 2026: on her phone, and
 * only hers, never sign in again). A long-lived signed cookie set from a
 * button only she is shown, after a normal sign in. While it is there the
 * middleware signs her straight back in, and the managers and GM gates
 * open without their second passwords. "Forget this phone" removes it;
 * changing NEXTAUTH_SECRET kills every one at once.
 */
export const OWNER_DEVICE_COOKIE = "tk_owner_device"
/** 30 days, re-issued whenever it signs her in, so an unused phone lapses. */
export const OWNER_DEVICE_DAYS = 30

export interface OwnerDevice {
  id: string
  name: string
  last?: string
  email?: string | null
  iat: number
}

/** Who may mark a device as theirs: Chloe only, not every OWNER role. */
export function mayTrustDevice(p: Pick<PersonSession, "role" | "last"> | null): boolean {
  return !!p && p.role === "OWNER" && (p.last ?? "").trim().toLowerCase() === "watts"
}

export async function encodeOwnerDevice(d: OwnerDevice): Promise<string> {
  const body = toB64Url(JSON.stringify(d))
  // Own prefix under the signature, so a staff session can never be
  // replayed as a device token or the other way round.
  return `${body}.${await signHex(`owner-device:${body}`)}`
}

export async function decodeOwnerDevice(raw: string | undefined | null, now = Date.now()): Promise<OwnerDevice | null> {
  if (!raw) return null
  const idx = raw.lastIndexOf(".")
  if (idx < 0) return null
  const body = raw.slice(0, idx)
  if (!safeEqual(raw.slice(idx + 1), await signHex(`owner-device:${body}`))) return null
  try {
    const d = JSON.parse(fromB64Url(body)) as OwnerDevice
    if (!d?.id || !d.name || !d.iat) return null
    if (now - d.iat > OWNER_DEVICE_DAYS * 86_400_000) return null
    if (!mayTrustDevice({ role: "OWNER", last: d.last })) return null
    return d
  } catch {
    return null
  }
}

/** A fresh staff session for the owner of a trusted device. */
export function personFromOwnerDevice(d: OwnerDevice, deedVersion: string, now = Date.now()): PersonSession {
  return { id: d.id, name: d.name, last: d.last, role: "OWNER", email: d.email ?? null, minor: false, deed: deedVersion, iat: now, seen: now }
}

export function ownerDeviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OWNER_DEVICE_DAYS * 86_400,
  }
}
