import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { getPerson, isOwnerSession } from "@/lib/person-session"
import { compare, hash } from "bcryptjs"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

/**
 * Gate for the GM desk (/kitchen/gm), Oliver's own tile. Same shape as
 * manager-auth but its own password and cookie, so the managers password
 * does not open it. Hash lives in AppSetting, set from the office side.
 * The cookie lasts 30 days on his device: logging in every morning is
 * friction he does not need. An admin next-auth session passes without it.
 */

const COOKIE_NAME = "tk_gm"
const SETTING_KEY = "gmPasswordHash"
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET must be set")
  return s
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex")
}

export async function gmPasswordIsSet(): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } })
  return Boolean(row?.value)
}

export async function checkGmPassword(input: string): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } })
  if (!row?.value) return false
  return compare(input, row.value)
}

export async function storeGmPassword(plain: string): Promise<void> {
  const value = await hash(plain, 10)
  await db.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  })
}

export async function setGmCookie(): Promise<void> {
  const expiresAt = Date.now() + THIRTY_DAYS_MS
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

export async function isGmAuthed(): Promise<boolean> {
  // Local preview only: lets the desk be checked in dev without a live
  // sign in. Ignored in production builds.
  if (process.env.NODE_ENV !== "production" && process.env.GM_DEV_BYPASS === "1") return true
  if (await isOwnerSession()) return true
  // Since 20 Sep 2026 the desk opens for one person, by their own sign in:
  // the Tarte Shifts staff id held in AppSetting gmStaffId. No desk password.
  const person = await getPerson()
  if (!person) return false
  const gm = await db.appSetting.findUnique({ where: { key: "gmStaffId" } })
  if (!gm || gm.value !== person.id) return false
  // First time he opens it, start the nudges (they wait for this marker).
  await db.appSetting.upsert({
    where: { key: "gmFirstUnlockAt" },
    create: { key: "gmFirstUnlockAt", value: new Date().toISOString() },
    update: {},
  })
  return true
}

/** Call at the top of every GM desk page. */
export async function requireGm(next: string): Promise<void> {
  if (!(await isGmAuthed())) {
    redirect(`/kitchen/gm/unlock?next=${encodeURIComponent(next)}`)
  }
}
