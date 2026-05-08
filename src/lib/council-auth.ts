import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const COOKIE_NAME = "council_session"
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.COUNCIL_PASSWORD
  if (!s) throw new Error("NEXTAUTH_SECRET or COUNCIL_PASSWORD must be set")
  return s
}

function getCouncilPassword(): string {
  const p = process.env.COUNCIL_PASSWORD
  if (!p) throw new Error("COUNCIL_PASSWORD must be set")
  return p
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex")
}

export function checkCouncilPassword(input: string): boolean {
  const expected = Buffer.from(getCouncilPassword())
  const actual = Buffer.from(input)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

export async function setCouncilCookie(): Promise<void> {
  const expiresAt = Date.now() + TWELVE_HOURS_MS
  const payload = String(expiresAt)
  const value = `${payload}.${sign(payload)}`
  const jar = await cookies()
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/council",
    expires: new Date(expiresAt),
  })
}

export async function clearCouncilCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}

export async function isCouncilAuthed(): Promise<boolean> {
  const jar = await cookies()
  const raw = jar.get(COOKIE_NAME)?.value
  if (!raw) return false
  const idx = raw.indexOf(".")
  if (idx < 0) return false
  const payload = raw.slice(0, idx)
  const sig = raw.slice(idx + 1)
  const expected = sign(payload)
  if (sig.length !== expected.length) return false
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
  const expiresAt = Number(payload)
  if (!Number.isFinite(expiresAt)) return false
  if (expiresAt < Date.now()) return false
  return true
}

export async function requireCouncil(): Promise<void> {
  if (!(await isCouncilAuthed())) redirect("/council/login")
}
