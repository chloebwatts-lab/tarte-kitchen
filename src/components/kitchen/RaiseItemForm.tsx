"use client"

import { useState, useTransition } from "react"
import { Check, Loader2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { addAgendaItem } from "@/lib/actions/meetings"
import type { AgendaItem } from "@/lib/actions/meetings"
import type { Venue } from "@/generated/prisma/client"

const when = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  timeZone: "Australia/Brisbane",
})

export function RaiseItemForm({
  venue,
  meetingDate,
  open,
}: {
  venue: Venue
  meetingDate: string
  open: AgendaItem[]
}) {
  const [topic, setTopic] = useState("")
  const [detail, setDetail] = useState("")
  const [name, setName] = useRememberedName()
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const [saving, start] = useTransition()

  function submit() {
    setError("")
    start(async () => {
      try {
        await addAgendaItem({
          topic,
          detail,
          raisedBy: name,
          venue,
        })
        setTopic("")
        setDetail("")
        setDone(true)
        setTimeout(() => setDone(false), 6000)
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't save, try again")
      }
    })
  }

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <label className="block">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
            What do you want raised?
          </span>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="In a few words"
            className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3.5 text-[19px] text-[var(--tk-charcoal)]"
          />
        </label>

        <label className="block">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
            Anything else about it (optional)
          </span>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)]"
          />
        </label>

        <label className="block max-w-[260px]">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
            Your name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3 text-[17px]"
          />
        </label>

        {error ? (
          <p className="text-[16px] font-medium text-[var(--tk-red-text,#B4432A)]">{error}</p>
        ) : null}

        <div className="flex items-center gap-3 pt-1">
          <KitchenButton
            variant="primary"
            size="lg"
            onClick={submit}
            disabled={saving || !topic.trim()}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Add it to the agenda
          </KitchenButton>
          {done ? (
            <span className="flex items-center gap-1.5 text-[17px] font-semibold text-[var(--tk-charcoal)]">
              <Check className="h-5 w-5" />
              On the list for {when.format(new Date(meetingDate))}
            </span>
          ) : null}
        </div>
      </div>

      <section className="border-t-[1.5px] border-[var(--tk-line)] pt-6">
        <h2 className="tk-display text-[20px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
          Already on the agenda
        </h2>
        {open.length === 0 ? (
          <p className="mt-2 text-[17px] text-[var(--tk-ink-soft)]">
            Nothing yet. Yours would be first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {open.map((i) => (
              <li
                key={i.id}
                className="rounded-[14px] bg-[var(--tk-card)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)]"
              >
                {i.topic}
                {i.raisedBy ? (
                  <span className="text-[15px] text-[var(--tk-ink-soft)]">
                    {" "}
                    &middot; {i.raisedBy}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
