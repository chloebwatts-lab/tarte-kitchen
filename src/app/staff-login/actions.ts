"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  STAFF_COOKIE,
  buildStaffCookieValue,
  checkStaffCredentials,
} from "@/lib/staff-auth"

/** Only ever bounce back into our own app, never to a pasted URL. */
function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/staffaccess"
  if (raw.startsWith("/staff-login")) return "/staffaccess"
  return raw
}

export async function submitStaffLogin(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "")
  const password = String(formData.get("password") ?? "")
  const next = safeNext(String(formData.get("next") ?? "/staffaccess"))

  if (!(await checkStaffCredentials(username, password))) {
    redirect(`/staff-login?error=1&next=${encodeURIComponent(next)}`)
  }

  const { value, expiresAt } = await buildStaffCookieValue()
  const jar = await cookies()
  jar.set(STAFF_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  })

  redirect(next)
}
