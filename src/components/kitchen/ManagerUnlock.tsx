"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { unlockManagers } from "@/lib/actions/manager-gate"

export function ManagerUnlock({ next, configured }: { next: string; configured: boolean }) {
  const [pw, setPw] = useState("")
  const [error, setError] = useState("")
  const [busy, start] = useTransition()

  if (!configured) {
    return (
      <div className="max-w-[520px] rounded-[18px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] p-5">
        <p className="tk-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-[var(--tk-charcoal)]">
          No managers password yet
        </p>
        <p className="mt-1.5 text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          It gets set once in the office app, under Settings, Manager password. Until
          then nothing behind this page can open.
        </p>
        <KitchenButton variant="secondary" size="md" href="/staffaccess" className="mt-4">
          Back to staff tools
        </KitchenButton>
      </div>
    )
  }

  function go() {
    setError("")
    start(async () => {
      const r = await unlockManagers(pw, next)
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
        placeholder="Managers password"
        autoFocus
        className="w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3.5 text-[19px]"
      />
      {error ? <p className="text-[15px] font-medium text-[var(--tk-warn)]">{error}</p> : null}
      <KitchenButton variant="primary" size="lg" type="submit" disabled={busy || !pw}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Unlock
      </KitchenButton>
    </form>
  )
}
