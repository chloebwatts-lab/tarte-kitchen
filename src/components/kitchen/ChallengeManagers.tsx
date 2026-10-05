"use client"

import { useState, useTransition } from "react"
import type { Venue } from "@/generated/prisma/client"
import { saveChallengeManagers } from "@/lib/actions/upsell"

/** Who counts nine hours a day on the challenge instead of clocked hours. */
export function ChallengeManagers({ venue, initial }: { venue: Venue; initial: string[] }) {
  const [text, setText] = useState(initial.join("\n"))
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  return (
    <section className="rounded-3xl border border-[var(--tk-line)] bg-white p-5">
      <h2 className="text-[20px] font-semibold text-[var(--tk-charcoal)]">Managers</h2>
      <p className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">
        One name per line, spelled as it shows on the challenge. Managers count 9 hours for every day they sell on.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false) }}
        rows={4}
        className="mt-3 w-full rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3 py-2.5 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
        placeholder={"First Last\nFirst Last"}
      />
      <button
        disabled={pending}
        onClick={() => start(async () => { const r = await saveChallengeManagers(venue, text); setText(r.managers.join("\n")); setSaved(true) })}
        className="mt-2 min-h-[44px] rounded-full bg-[var(--tk-charcoal)] px-5 text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving" : saved ? "Saved" : "Save managers"}
      </button>
    </section>
  )
}
