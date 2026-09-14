"use client"

import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"

/**
 * The sign-in button knows when the form is in flight, so a slow cafe
 * connection shows "Signing in" instead of inviting a second tap.
 */
export function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full px-6 text-[17px] font-semibold text-white disabled:opacity-70"
      style={{ background: "var(--tk-charcoal)" }}
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {pending ? "Signing in" : "Sign in"}
    </button>
  )
}
