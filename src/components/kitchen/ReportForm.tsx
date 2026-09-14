"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Check, Loader2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { reportTask } from "@/lib/actions/venue-ops"
import type { Venue, VenueTaskCategory, VenueTaskPriority } from "@/generated/prisma/client"

const CATEGORIES: { k: VenueTaskCategory; label: string }[] = [
  { k: "LOW_STOCK", label: "Low on something" },
  { k: "RUBBISH_REMOVAL", label: "Rubbish needs going" },
  { k: "CLEANING", label: "Needs a clean" },
  { k: "FURNITURE", label: "Tables, chairs, furniture" },
  { k: "BUILDING", label: "Building, plumbing, lights" },
  { k: "MISC", label: "Something else" },
]

export function ReportForm({ venue }: { venue: Venue }) {
  const [category, setCategory] = useState<VenueTaskCategory | null>(null)
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<VenueTaskPriority>("NORMAL")
  const [name, setName] = useRememberedName()
  const [done, setDone] = useState(false)
  const [busy, start] = useTransition()

  function submit() {
    if (!category) return
    start(async () => {
      await reportTask({ venue, category, title, priority, reportedBy: name })
      setTitle("")
      setCategory(null)
      setPriority("NORMAL")
      setDone(true)
      setTimeout(() => setDone(false), 5000)
    })
  }

  const tile = (active: boolean) =>
    `rounded-[14px] border-[1.5px] px-4 py-3.5 text-left text-[17px] font-semibold transition active:scale-[0.99] ${
      active
        ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
        : "border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)]"
    }`

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
          What is it?
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href={`/kitchen/fix?venue=${venue}`} className={tile(false)}>
            Something broken <span className="block text-[13px] font-normal text-[var(--tk-ink-soft)]">Goes to the maintenance page</span>
          </Link>
          {CATEGORIES.map((c) => (
            <button key={c.k} onClick={() => setCategory(c.k)} className={tile(category === c.k)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {category ? (
        <>
          <label className="block">
            <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
              What and where
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. No glass cleaner left in the bar cupboard"
              className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3.5 text-[18px]"
              autoFocus
            />
          </label>

          <div>
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
              How urgent
            </p>
            <div className="flex gap-2">
              {(
                [
                  ["URGENT", "Today"],
                  ["NORMAL", "This week"],
                  ["WHENEVER", "Whenever"],
                ] as [VenueTaskPriority, string][]
              ).map(([p, label]) => (
                <button key={p} onClick={() => setPriority(p)} className={tile(priority === p) + " flex-1 text-center"}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[180px] flex-1">
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
            <KitchenButton variant="primary" size="lg" onClick={submit} disabled={busy || !title.trim()}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Report it
            </KitchenButton>
          </div>
        </>
      ) : null}

      {done ? (
        <p className="flex items-center gap-2 text-[17px] font-semibold text-[var(--tk-charcoal)]">
          <Check className="h-5 w-5" /> On the board. Georgia sees it in the morning.
        </p>
      ) : null}
    </div>
  )
}
