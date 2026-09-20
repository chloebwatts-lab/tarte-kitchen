import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { DEED_VERSION } from "@/lib/confidentiality/deed"
import { DEVICE_COOKIE, decodeSetup } from "@/lib/person-auth"
import { logAccess, setPersonCookie } from "@/lib/person-session"

export const dynamic = "force-dynamic"

/**
 * Landing for the emailed setup link. Opening it proves they own the mailbox
 * on their staff record, so it signs them in; the staff gate then puts the
 * deed in front of them, and /staff-login/done emails the PIN once signed.
 */
export async function GET(req: NextRequest) {
  const base = (process.env.NEXTAUTH_URL ?? req.nextUrl.origin).replace(/\/$/, "")
  const t = await decodeSetup(req.nextUrl.searchParams.get("t"))
  if (!t) return NextResponse.redirect(`${base}/staff-login/start?expired=1`)

  const jar = await cookies()
  if (!jar.get(DEVICE_COOKIE)) {
    jar.set(DEVICE_COOKIE, randomBytes(12).toString("hex"), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 24 * 3600,
    })
  }
  const signed = await db.confidentialityDeed.findUnique({
    where: { staffId_version: { staffId: t.id, version: DEED_VERSION } },
    select: { id: true },
  })
  const now = Date.now()
  const name = `${t.first} ${t.last}`.trim()
  await setPersonCookie({ id: t.id, name, last: t.last, role: t.role, email: t.email, minor: t.minor, deed: signed ? DEED_VERSION : null, iat: now, seen: now })
  await logAccess("LOGIN", { staffId: t.id, staffName: name, path: "setup link" })
  return NextResponse.redirect(
    signed ? `${base}/staff-login/done` : `${base}/kitchen/confidentiality?next=${encodeURIComponent("/staff-login/done")}`
  )
}
