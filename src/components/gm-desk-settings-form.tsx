"use client"

import { useState, useTransition } from "react"
import { setGmEmail, setGmPassword } from "@/lib/actions/gm"

export function GmDeskSettingsForm({ isSet, email }: { isSet: boolean; email: string }) {
  const [pw, setPw] = useState("")
  const [em, setEm] = useState(email)
  const [msg, setMsg] = useState("")
  const [emMsg, setEmMsg] = useState("")
  const [busy, start] = useTransition()
  return (
    <div className="flex max-w-md flex-col gap-8">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setMsg("")
          start(async () => {
            try { await setGmPassword(pw); setPw(""); setMsg("Saved. Give it to Oliver in person.") }
            catch { setMsg("Couldn't save. Six characters or more.") }
          })
        }}
        className="flex flex-col gap-3"
      >
        <h2 className="text-base font-semibold">Password</h2>
        <p className="text-sm text-muted-foreground">
          {isSet ? "A password is set. Enter a new one to replace it." : "Not set yet. His tile won't open until it is."}
        </p>
        <input id="gm-desk-password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password for Oliver"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm" />
        <button disabled={busy || pw.length < 6}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {isSet ? "Change password" : "Set password"}
        </button>
        {msg ? <p className="text-sm">{msg}</p> : null}
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setEmMsg("")
          start(async () => {
            try { await setGmEmail(em); setEmMsg(em ? "Saved. His reminders go here." : "Cleared. No reminders to Oliver.") }
            catch { setEmMsg("That doesn't look like an email address.") }
          })
        }}
        className="flex flex-col gap-3"
      >
        <h2 className="text-base font-semibold">Oliver&apos;s email, for reminders</h2>
        <p className="text-sm text-muted-foreground">
          On each of his GM days he gets a 6:30am email with that day&apos;s list, and on Friday at 1pm a nudge if the
          report isn&apos;t sent. You get his week at 4pm Friday either way. Leave blank to send him nothing.
        </p>
        <input id="gm-desk-email" type="email" value={em} onChange={(e) => setEm(e.target.value)} placeholder="oliver@..."
          className="rounded-md border border-border bg-card px-3 py-2 text-sm" />
        <button disabled={busy} className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          Save email
        </button>
        {emMsg ? <p className="text-sm">{emMsg}</p> : null}
      </form>
    </div>
  )
}
