import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { compare, hash } from "bcryptjs"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

/**
 * Second gate inside the staff area, for pages that carry numbers or names:
 * line-up (yesterday's take), the morning board, Said + Done, the meeting
 * agenda, training records. Same shape as council-auth. The password lives
 * in AppSetting as a bcrypt hash so it is set from the admin, not from .env.
 * An admin next-auth session passes without it.
 */

const COOKIE_NAME = "tk_manager"
const SETTING_KEY = "managerPasswordHash"
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET must be set")
  return s
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex")
}

export async function managerPasswordIsSet(): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } })
  return Boolean(row?.value)
}

export async function checkManagerPassword(input: string): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } })
  if (!row?.value) return false
  return compare(input, row.value)
}

export async function storeManagerPassword(plain: string): Promise<void> {
  const value = await hash(plain, 10)
  await db.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  })
}

export async function setManagerCookie(): Promise<void> {
  const expiresAt = Date.now() + TWELVE_HOURS_MS
  const payload = String(expiresAt)
  const jar = await cookies()
  jar.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/kitchen",
    expires: new Date(expiresAt),
  })
}

export async function isManagerAuthed(): Promise<boolean> {
  if (await getServerSession(authOptions)) return true
  const raw = (await cookies()).get(COOKIE_NAME)?.value
  if (!raw) return false
  const idx = raw.indexOf(".")
  if (idx < 0) return false
  const payload = raw.slice(0, idx)
  const sig = raw.slice(idx + 1)
  const expected = sign(payload)
  if (sig.length !== expected.length) return false
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
  const expiresAt = Number(payload)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

/** Call at the top of any manager-only page. `next` is where to come back to. */
export async function requireManager(next: string): Promise<void> {
  if (!(await isManagerAuthed())) {
    redirect(`/kitchen/managers/unlock?next=${encodeURIComponent(next)}`)
  }
}
