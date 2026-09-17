"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { unlockGm } from "@/lib/actions/gm"

export function GmUnlock({ next, configured }: { next: string; configured: boolean }) {
  const [pw, setPw] = useState("")
  const [error, setError] = useState("")
  const [busy, start] = useTransition()

  if (!configured) {
    return (
      <p className="text-[17px] text-[var(--tk-ink-soft)]">
        No password has been set yet. Chloe sets it from the office side under
        Settings, GM desk. Then this page works.
      </p>
    )
  }

  function go() {
    setError("")
    start(async () => {
      const r = await unlockGm(pw, next)
      if (r && !r.ok) setError(r.error)
    })
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); go() }}
      className="flex max-w-[420px] flex-col gap-3"
    >
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="Your password"
        autoFocus
        className="w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3.5 text-[19px]"
      />
      {error ? <p className="text-[15px] font-medium text-[#B4432A]">{error}</p> : null}
      <KitchenButton variant="primary" size="lg" type="submit" disabled={busy || !pw}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Unlock
      </KitchenButton>
    </form>
  )
}
