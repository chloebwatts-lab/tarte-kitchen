"use server"

import { redirect } from "next/navigation"
import { checkCouncilPassword, setCouncilCookie } from "@/lib/council-auth"
import { guardedCheck } from "@/lib/login-guard"

export async function submitCouncilPassword(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "")
  const result = await guardedCheck("council", () => checkCouncilPassword(password))
  if (result !== "ok") {
    redirect(`/council/login?error=${result === "locked" ? "locked" : "1"}`)
  }
  await setCouncilCookie()
  redirect("/council")
}
