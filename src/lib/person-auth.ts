/**
 * Per-person sign-in for the staff area (/kitchen, /staffaccess, /log).
 *
 * Chloe, 20 Sep 2026: no more shared passwords. Everyone signs in with the
 * same name and kiosk PIN they use on Tarte Shifts, every time they use the
 * app, and signs the confidentiality deed once before anything opens.
 *
 * The session is a signed cookie carrying who they are. It is short on
 * purpose: shared iPads mean the next person must not inherit the last
 * person's name. Idle for IDLE_MINUTES and it is gone; ABSOLUTE_HOURS is the
 * hard stop however busy they are.
 *
 * Web Crypto only, so the same code verifies in middleware and in actions.
 */

export const PERSON_COOKIE = "tk_person"
export const DEVICE_COOKIE = "tk_device"

export const IDLE_MINUTES = 20
export const ABSOLUTE_HOURS = 12

export type PersonRole = "OWNER" | "MANAGER" | "SUPERVISOR" | "STAFF"

export interface PersonSession {
  /** Tarte Shifts staff id. */
  id: string
  name: string
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
