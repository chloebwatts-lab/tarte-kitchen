"use server"

import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  checkManagerPassword,
  setManagerCookie,
  storeManagerPassword,
} from "@/lib/manager-auth"
import { guardedCheck, LOCKED_MESSAGE } from "@/lib/login-guard"

export async function unlockManagers(password: string, next: string) {
  const result = await guardedCheck("managers", () => checkManagerPassword(password))
  if (result === "locked") return { ok: false as const, error: LOCKED_MESSAGE }
  if (result === "wrong") {
    return { ok: false as const, error: "That's not it. Ask Chloe or Shawna." }
  }
  await setManagerCookie()
  const safe = next.startsWith("/kitchen") ? next : "/kitchen/managers"
  redirect(safe)
}

/** Admin only: requires an office login, never the staff cookie. */
export async function setManagerPassword(password: string) {
  if (!(await getServerSession(authOptions))) throw new Error("Sign in first")
  const p = password.trim()
  if (p.length < 6) throw new Error("Six characters or more")
  await storeManagerPassword(p)
  return { ok: true as const }
}
