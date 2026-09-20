"use server"

import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { DEED_VERSION } from "@/lib/confidentiality/deed"
import { callerIp, isLockedOut, recordAttempt } from "@/lib/login-guard"
import { DEVICE_COOKIE } from "@/lib/person-auth"
import { clearPersonCookie, getPerson, logAccess, setPersonCookie } from "@/lib/person-session"
import { remindPin, toPersonRole, verifyStaff } from "@/lib/shifts-staff"

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

/** "Forgot your PIN?": Shifts emails it to the address on file. Same answer whether or not anything matched. */
export async function submitPinReminder(formData: FormData): Promise<void> {
  const lastName = String(formData.get("lastName") ?? "").trim().slice(0, 80)
  const email = String(formData.get("email") ?? "").trim().slice(0, 160)
  const ip = await callerIp()
  if (lastName && email.includes("@") && !(await isLockedOut("staff", ip))) {
    await remindPin(lastName, email, ip)
    await logAccess("LOGIN_FAILED", { attemptedName: `${lastName} (asked for PIN reminder)` })
  }
  redirect("/staff-login/pin?sent=1")
}
