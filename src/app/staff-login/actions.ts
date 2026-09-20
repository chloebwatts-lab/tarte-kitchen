"use server"

import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { DEED_VERSION } from "@/lib/confidentiality/deed"
import { callerIp, isLockedOut, recordAttempt } from "@/lib/login-guard"
import { DEVICE_COOKIE, SETUP_MINUTES, encodeSetup } from "@/lib/person-auth"
import { clearPersonCookie, getPerson, logAccess, setPersonCookie } from "@/lib/person-session"
import { findStaff, toPersonRole, verifyStaff } from "@/lib/shifts-staff"
import { sendEmail } from "@/lib/gmail/send"

/** Only ever bounce back into our own app, never to a pasted URL. */
function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/staffaccess"
  if (raw.startsWith("/staff-login")) return "/staffaccess"
  return raw
}

/**
 * Sign in with the same last name + kiosk PIN as Tarte Shifts. Shifts does
 * the check; this side adds the lockout, the audit trail, the device id and
 * the confidentiality deed gate.
 */
export async function submitStaffLogin(formData: FormData): Promise<void> {
  const lastName = String(formData.get("lastName") ?? "").trim()
  const pin = String(formData.get("pin") ?? "").replace(/\D/g, "")
  const next = safeNext(String(formData.get("next") ?? "/staffaccess"))
  const back = (code: string) => redirect(`/staff-login?error=${code}&next=${encodeURIComponent(next)}`)

  const ip = await callerIp()
  if (await isLockedOut("staff", ip)) back("locked")

  // A stable id for this browser, so "signed in from a device we have never
  // seen" can be told apart from the venue iPads.
  const jar = await cookies()
  if (!jar.get(DEVICE_COOKIE)) {
    jar.set(DEVICE_COOKIE, randomBytes(12).toString("hex"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 400 * 24 * 3600,
    })
  }

  const result = await verifyStaff(lastName, pin, ip)
  if (!result.ok) {
    if (result.reason === "unavailable") back("down")
    await recordAttempt("staff", ip, false)
    await logAccess("LOGIN_FAILED", { attemptedName: lastName.slice(0, 80) })
    back(result.reason === "locked" ? "locked" : "1")
    return
  }
  await recordAttempt("staff", ip, true)

  const s = result.staff
  const name = `${s.firstName} ${s.lastName}`.trim()
  const signed = await db.confidentialityDeed.findUnique({
    where: { staffId_version: { staffId: s.id, version: DEED_VERSION } },
    select: { id: true },
  })
  const now = Date.now()
  await setPersonCookie({
    id: s.id,
    name,
    last: s.lastName,
    role: toPersonRole(s.role),
    email: s.email ?? null,
    minor: !!s.minor,
    deed: signed ? DEED_VERSION : null,
    iat: now,
    seen: now,
  })
  await logAccess("LOGIN", { staffId: s.id, staffName: name })

  redirect(signed ? next : `/kitchen/confidentiality?next=${encodeURIComponent(next)}`)
}

export async function signOut(): Promise<void> {
  const p = await getPerson()
  if (p) await logAccess("LOGOUT", { staffId: p.id, staffName: p.name })
  await clearPersonCookie()
  redirect("/staff-login")
}

/**
 * "Set up your sign in" / "Forgot your PIN": emails a one-time link to the
 * address on the person's record. The link signs them in, the deed comes
 * first, and only then is the PIN emailed. Same answer whether or not
 * anything matched.
 */
export async function submitSetupRequest(formData: FormData): Promise<void> {
  const lastName = String(formData.get("lastName") ?? "").trim().slice(0, 80)
  const email = String(formData.get("email") ?? "").trim().slice(0, 160)
  const ip = await callerIp()
  if (lastName && email.includes("@") && !(await isLockedOut("staff", ip))) {
    const staff = await findStaff(lastName, email, ip)
    if (staff?.email) {
      const token = await encodeSetup({
        id: staff.id,
        first: staff.firstName,
        last: staff.lastName,
        role: toPersonRole(staff.role),
        email: staff.email,
        minor: !!staff.minor,
        exp: Date.now() + SETUP_MINUTES * 60_000,
      })
      const base = (process.env.NEXTAUTH_URL ?? "https://kitchen.tarte.com.au").replace(/\/$/, "")
      const link = `${base}/staff-login/setup?t=${encodeURIComponent(token)}`
      try {
        await sendEmail({
          to: staff.email,
          subject: "Set up your Tarte sign in",
          body: `Hi ${staff.firstName},\n\nTap this link to set up your own Tarte Kitchen sign in. It works for ${SETUP_MINUTES} minutes and only for you:\n\n${link}\n\nYou will be asked to read and sign a confidentiality deed (about three minutes). As soon as it is signed, your PIN is emailed to you.\n\nIf you did not ask for this, ignore it.\n\nChloe`,
        })
      } catch (e) {
        console.error("[setup-link] send failed", e)
      }
    } else {
      await logAccess("LOGIN_FAILED", { attemptedName: `${lastName} (setup link, no match)` })
    }
  }
  redirect("/staff-login/start?sent=1")
}
