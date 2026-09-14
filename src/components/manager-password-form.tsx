"use client"

import { useState, useTransition } from "react"
import { setManagerPassword } from "@/lib/actions/manager-gate"

export function ManagerPasswordForm({ isSet }: { isSet: boolean }) {
  const [pw, setPw] = useState("")
  const [msg, setMsg] = useState("")
  const [busy, start] = useTransition()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setMsg("")
        start(async () => {
          try { await setManagerPassword(pw); setPw(""); setMsg("Saved. Managers can unlock with it now.") }
          catch (err) { setMsg(err instanceof Error ? err.message : "Couldn't save") }
        })
      }}
      className="flex max-w-md flex-col gap-3"
    >
      <p className="text-sm text-muted-foreground">
        {isSet ? "A password is set. Enter a new one to replace it." : "Not set yet. The Managers tile on Staff tools won't open until it is."}
      </p>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New managers password"
        className="rounded-md border border-border bg-card px-3 py-2 text-sm" />
      <button disabled={busy || pw.length < 6}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {isSet ? "Change password" : "Set password"}
      </button>
      {msg ? <p className="text-sm">{msg}</p> : null}
    </form>
  )
}
