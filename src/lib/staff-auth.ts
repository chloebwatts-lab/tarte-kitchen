/**
 * Password gate for the staff area (/kitchen, /staffaccess, /log).
 *
 * Deliberately NOT Caddy basic auth: the admin area already uses basic auth
 * with the username `tarte` on this domain, so a second realm with the same
 * username would have browsers sending one area's password to the other. A
 * signed cookie also survives the installed home-screen app, where a native
 * auth prompt does not.
 *
 * Web Crypto rather than node:crypto so the same verify runs in middleware
 * (Edge runtime) and in server actions.
 */

export const STAFF_COOKIE = "tk_staff"

/** Shared iPads: long enough that staff aren't typing it mid-service. */
export const STAFF_SESSION_DAYS = 90

const encoder = new TextEncoder()

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET must be set to gate the staff area")
  return s
}

async function signHex(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Length-independent compare, no early return on the first differing byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function checkStaffCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const expectedUser = process.env.STAFF_USERNAME
  const expectedPass = process.env.STAFF_PASSWORD
  // Fail closed. An unset password must never mean "everyone's welcome".
  if (!expectedUser || !expectedPass) return false
  // Phone and iPad keyboards auto-capitalise the first letter, which would
  // otherwise lock staff out of their own tools.
  const userOk = safeEqual(username.trim().toLowerCase(), expectedUser.toLowerCase())
  const passOk = safeEqual(password, expectedPass)
  return userOk && passOk
}

export async function buildStaffCookieValue(): Promise<{
  value: string
  expiresAt: Date
}> {
  const expiresAt = new Date(
    Date.now() + STAFF_SESSION_DAYS * 24 * 60 * 60 * 1000
  )
  const payload = String(expiresAt.getTime())
  return { value: `${payload}.${await signHex(payload)}`, expiresAt }
}

export async function isValidStaffCookie(
  raw: string | undefined | null
): Promise<boolean> {
  if (!raw) return false
  const idx = raw.indexOf(".")
  if (idx < 0) return false
  const payload = raw.slice(0, idx)
  const sig = raw.slice(idx + 1)
  if (!safeEqual(sig, await signHex(payload))) return false
  const expiresAt = Number(payload)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}
