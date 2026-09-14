"use client"

import { useEffect, useRef, useState, useTransition, type ComponentType } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Armchair,
  Check,
  Ellipsis,
  Lightbulb,
  Loader2,
  PackageOpen,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { reportTask } from "@/lib/actions/venue-ops"
import type { Venue, VenueTaskCategory, VenueTaskPriority } from "@/generated/prisma/client"

type Category = {
  k: VenueTaskCategory
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  /** A worked example in the input so "what and where" needs no explaining. */
  placeholder: string
}

const CATEGORIES: Category[] = [
  { k: "LOW_STOCK", label: "Low on something", icon: PackageOpen, placeholder: "e.g. Glass cleaner in the bar" },
  { k: "RUBBISH_REMOVAL", label: "Rubbish needs going", icon: Trash2, placeholder: "e.g. Cardboard out the back" },
  { k: "CLEANING", label: "Needs a clean", icon: Sparkles, placeholder: "e.g. Sticky floor near table 4" },
  { k: "FURNITURE", label: "Tables, chairs, furniture", icon: Armchair, placeholder: "e.g. Table 4 wobbles" },
  { k: "BUILDING", label: "Building, plumbing, lights", icon: Lightbulb, placeholder: "e.g. Light out in the ladies" },
  { k: "MISC", label: "Something else", icon: Ellipsis, placeholder: "What it is and where it is" },
]

const PRIORITIES: { k: VenueTaskPriority; label: string; hint: string }[] = [
  { k: "URGENT", label: "Today", hint: "Can't wait" },
  { k: "NORMAL", label: "This week", hint: "Soon-ish" },
  { k: "WHENEVER", label: "Whenever", hint: "No rush" },
]

const SECTION_LABEL =
  "text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]"
const FIELD =
  "mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 text-[var(--tk-charcoal)] outline-none transition focus:border-[var(--tk-charcoal)]"

type Sent = { category: Category; title: string; priority: VenueTaskPriority }

/**
 * Two screens, not one long form. Screen one is only the six tiles (plus the
 * hand-off to maintenance), so on a phone the whole choice fits above the
 * fold. Tapping a tile swaps the grid for a compact "chosen" row and puts
 * the text field at the top, where the keyboard can't cover it. Screen two
 * is the confirmation, which stays put until somebody taps through it
 * instead of vanishing on a timer.
 */
export function ReportForm({ venue, venueLabel }: { venue: Venue; venueLabel: string }) {
  const [category, setCategory] = useState<Category | null>(null)
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<VenueTaskPriority>("NORMAL")
  const [name, setName] = useRememberedName()
  const [sent, setSent] = useState<Sent | null>(null)
  const [error, setError] = useState("")
  const [busy, start] = useTransition()
  const top = useRef<HTMLDivElement>(null)

  // On a phone the hero pushes the details below the fold, so bring the
  // form to the top of the screen when it changes shape (tile chosen, or
  // sent). No-op on an iPad where it already fits.
  const stage = sent ? "sent" : category ? "details" : "pick"
  useEffect(() => {
    if (stage === "pick") return
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [stage])

  const canSend = !!category && title.trim().length > 0 && !busy

  function reset() {
    setTitle("")
    setCategory(null)
    setPriority("NORMAL")
    setError("")
  }

  function submit() {
    if (!canSend || !category) return
    setError("")
    start(async () => {
      try {
        await reportTask({ venue, category: category.k, title, priority, reportedBy: name })
        setSent({ category, title: title.trim(), priority })
        reset()
      } catch {
        // Server action errors are masked in production, so the message
        // would be noise anyway. Say the only thing worth saying.
        setError("That didn't save. Check the wifi and try again.")
      }
    })
  }

  // Screen three: it's on the board. Nothing auto-dismisses; the next
  // person taps "Report another" and gets a clean form.
  if (sent) {
    const SentIcon = sent.category.icon
    const pri = PRIORITIES.find((p) => p.k === sent.priority)
    return (
      <div ref={top} className="scroll-mt-4 rounded-[18px] border-[1.5px] border-[var(--tk-done)] bg-[var(--tk-done-soft)] p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-done)] text-white">
            <Check className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="tk-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-[var(--tk-charcoal)]">
              On the board.
            </p>
            <p className="mt-1 text-[16px] leading-snug text-[var(--tk-ink-soft)]">
              Georgia sees it in the morning. Nothing else to do.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-[14px] bg-[var(--tk-card)] px-4 py-3">
          <SentIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tk-ink-soft)]" strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]">{sent.title}</p>
            <p className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
              {sent.category.label} &middot; {pri?.label ?? sent.priority}
              {name.trim() ? <> &middot; {name.trim()}</> : null}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <KitchenButton variant="primary" size="lg" onClick={() => setSent(null)} className="flex-1">
            Report another
          </KitchenButton>
          <KitchenButton variant="secondary" size="lg" href={`/kitchen?venue=${venue}`} className="flex-1">
            Back to {venueLabel}
          </KitchenButton>
        </div>
      </div>
    )
  }

  // Screen one: just the choice.
  if (!category) {
    return (
      <div ref={top}>
        <p className={`mb-2 ${SECTION_LABEL}`}>What is it?</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon
            return (
              <button
                key={c.k}
                type="button"
                onClick={() => {
                  setError("")
                  setCategory(c)
                }}
                className="flex min-h-[104px] flex-col items-start justify-between gap-3 rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] p-4 text-left transition active:scale-[0.98] active:border-[var(--tk-charcoal)] active:bg-[var(--tk-charcoal-soft)]"
              >
                <Icon className="h-6 w-6 text-[var(--tk-ink-soft)]" strokeWidth={1.8} />
                <span className="text-[17px] font-semibold leading-tight text-[var(--tk-charcoal)]">{c.label}</span>
              </button>
            )
          })}
        </div>

        {/* Different action, different look: this one leaves the page. */}
        <Link
          href={`/kitchen/fix?venue=${venue}`}
          className="mt-2.5 flex items-center gap-3 rounded-[16px] border-[1.5px] border-dashed border-[var(--tk-ink-mute)] bg-transparent px-4 py-3.5 transition active:scale-[0.99] active:bg-[var(--tk-charcoal-soft)]"
        >
          <Wrench className="h-6 w-6 shrink-0 text-[var(--tk-ink-soft)]" strokeWidth={1.8} />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold leading-tight text-[var(--tk-charcoal)]">Something broken?</span>
            <span className="block text-[14px] text-[var(--tk-ink-soft)]">Machines and equipment go to the maintenance page</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-[var(--tk-ink-mute)]" />
        </Link>
      </div>
    )
  }

  // Screen two: the details. Chosen tile collapses to one row so the text
  // field sits near the top of the screen.
  const ChosenIcon = category.icon
  return (
    <div ref={top} className="scroll-mt-4 space-y-6">
      <div>
        <p className={`mb-2 ${SECTION_LABEL}`}>What is it?</p>
        <div className="flex items-center gap-3 rounded-[14px] bg-[var(--tk-charcoal)] py-2.5 pl-4 pr-2 text-white">
          <ChosenIcon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{category.label}</span>
          <button
            type="button"
            onClick={() => setCategory(null)}
            className="shrink-0 rounded-full px-3 py-1.5 text-[14px] font-semibold text-white/80 transition active:bg-white/15"
          >
            Change
          </button>
        </div>
      </div>

      <label className="block">
        <span className={SECTION_LABEL}>What and where</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
          }}
          placeholder={category.placeholder}
          enterKeyHint="done"
          autoCapitalize="sentences"
          autoFocus
          className={`${FIELD} py-3.5 text-[18px]`}
        />
        <span className="mt-1.5 block text-[14px] text-[var(--tk-ink-mute)]">
          Where it is helps most. Table numbers, cupboard, out the back.
        </span>
      </label>

      <div>
        <p className={`mb-2 ${SECTION_LABEL}`}>How urgent</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How urgent">
          {PRIORITIES.map((p) => {
            const active = priority === p.k
            return (
              <button
                key={p.k}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPriority(p.k)}
                className={`rounded-[14px] border-[1.5px] px-2 py-3 text-center transition active:scale-[0.98] ${
                  active
                    ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
                    : "border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)]"
                }`}
              >
                <span className="block text-[17px] font-semibold leading-tight">{p.label}</span>
                <span className={`mt-0.5 block text-[13px] ${active ? "text-white/70" : "text-[var(--tk-ink-mute)]"}`}>
                  {p.hint}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <label className="block sm:max-w-[280px]">
        <span className={SECTION_LABEL}>Your name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="So Georgia knows who to ask"
          autoCapitalize="words"
          className={`${FIELD} py-3 text-[17px]`}
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[16px] font-medium text-[var(--tk-warn)]">
          {error}
        </p>
      ) : null}

      <div className="pt-1">
        <KitchenButton variant="primary" size="lg" onClick={submit} disabled={!canSend} className="w-full sm:w-auto sm:min-w-[260px]">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {busy ? "Putting it on the board" : "Put it on the board"}
        </KitchenButton>
        {!title.trim() ? (
          <p className="mt-2 text-[14px] text-[var(--tk-ink-mute)]">Say what and where first, then this lights up.</p>
        ) : null}
      </div>
    </div>
  )
}
