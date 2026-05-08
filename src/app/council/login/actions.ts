"use server"

import { redirect } from "next/navigation"
import { checkCouncilPassword, setCouncilCookie } from "@/lib/council-auth"

export async function submitCouncilPassword(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "")
  if (!checkCouncilPassword(password)) {
    redirect("/council/login?error=1")
  }
  await setCouncilCookie()
  redirect("/council")
}
