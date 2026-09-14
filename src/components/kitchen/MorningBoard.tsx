"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2, Wrench } from "lucide-react"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import {
  assignTask,
  completeTask,
  dismissTask,
  overrideTaskPriority,
} from "@/lib/actions/venue-ops"
import type { BoardTask, MorningBoard as MorningBoardData } from "@/lib/actions/venue-ops"
import type { ReorderLine } from "@/lib/actions/venue-stock"
import type { VenueTaskPriority } from "@/generated/prisma/client"

/**
 * The staff-side morning board. One row per open item, the way the rest of
 * the iPad app reads: big type, one obvious action, everything else a tap
 * away under the row. The morning job is putting a name on things, so an
 * unowned row shows the names right there; an owned row shows who and Done.
 */

const CATEGORY: Record<string, string> = {
  BROKEN_EQUIPMENT: "Broken equipment",
  LOW_STOCK: "Low stock",
  RUBBISH_REMOVAL: "Rubbish",
  CLEANING: "Cleaning",
  FURNITURE: "Furniture",
  BUILDING: "Building",
  MISC: "Other",
}

/** Same words the reporter chose from on the Spotted something screen. */
const PRIORITY_LABEL: Record<VenueTaskPriority, string> = {
  URGENT: "Today",
  NORMAL: "This week",
  WHENEVER: "Whenever",
}

const dayFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Australia/Brisbane",
})

const todayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" })

/** dueAt arrives as an ISO string for a @db.Date column: the calendar day is the first ten chars. */
function dueLabel(dueAt: string): { text: string; late: boolean } {
  const day = dueAt.slice(0, 10)
  const today = todayFmt.format(new Date())
  const date = new Date(`${day}T12:00:00+10:00`)
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (diff === 0) return { text: "due today", late: false }
  if (diff === 1) return { text: "due tomorrow", late: false }
  if (diff < 0) {
    const d = -diff
    return { text: `${d} day${d === 1 ? "" : "s"} overdue`, late: true }
  }
  return { text: `due ${dayFmt.format(date)}`, late: false }
}

function ageLabel(days: number): string {
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 14) return `${days} days ago`
  const w = Math.floor(days / 7)
  return `${w} week${w === 1 ? "" : "s"} ago`
}

const chip = (active: boolean) =>
  `rounded-[10px] px-3 py-2 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
    active
      ? "bg-[var(--tk-charcoal)] text-white"
      : "border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)]"
  }`

function NamePicker({
  names,
  current,
  onPick,
  busy,
  compact,
}: {
  names: string[]
  current: string | null
  onPick: (name: string) => void
  busy: boolean
  compact?: boolean
}) {
  const [other, setOther] = useState(false)
  const [typed, setTyped] = useState("")
  const shown = compact ? names.slice(0, 4) : names
  const cur = (current ?? "").trim().toLowerCase()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((n) => (
        <button
          key={n}
          disabled={busy}
          onClick={() => onPick(n)}
          className={chip(n.trim().toLowerCase() === cur)}
        >
          {n}
        </button>
      ))}
      {other ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (typed.trim()) onPick(typed)
          }}
        >
          <input
            autoFocus
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Name"
            className="w-36 rounded-[10px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-3 py-2 text-[15px]"
          />
          <button type="submit" disabled={busy || !typed.trim()} className={chip(true)}>
            Set
          </button>
        </form>
      ) : (
        <button
          disabled={busy}
          onClick={() => setOther(true)}
          className="rounded-[10px] px-2 py-2 text-[15px] font-semibold text-[var(--tk-ink-soft)] underline decoration-[var(--tk-line)] underline-offset-4"
        >
          {names.length ? "Someone else" : "Type a name"}
        </button>
      )}
    </div>
  )
}

function TaskRow({
  task,
  names,
  me,
  unowned,
}: {
  task: BoardTask
  names: string[]
  me: string
  unowned: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, start] = useTransition()
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn()
      router.refresh()
    })

  const scheduled = task.reportedBy === "Scheduled"
  const due = task.dueAt ? dueLabel(task.dueAt) : null
  const meta: React.ReactNode[] = [CATEGORY[task.category] ?? task.category]
  if (scheduled) meta.push("Scheduled")
  else if (task.reportedBy) meta.push(`${task.reportedBy}, ${ageLabel(task.ageDays)}`)
  else meta.push(ageLabel(task.ageDays))
  if (due) {
    meta.push(
      <span key="due" className={due.late ? "font-semibold text-[var(--tk-warn)]" : undefined}>
        {due.text}
      </span>
    )
  }

  return (
    <div className="rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3.5 md:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-5">
        {/* What it is */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {task.priority === "URGENT" ? (
              <span className="rounded-full bg-[var(--tk-warn-soft)] px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--tk-warn)]">
                Today
              </span>
            ) : null}
            {task.priority === "WHENEVER" ? (
              <span className="rounded-full bg-[var(--tk-charcoal-soft)] px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
                Whenever
              </span>
            ) : null}
            <span className="text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)]">
              {task.title}
            </span>
          </div>
          {task.detail ? (
            <p className="mt-1 text-[15px] leading-snug text-[var(--tk-ink-soft)]">{task.detail}</p>
          ) : null}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[14px] text-[var(--tk-ink-soft)]">
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-x-1.5">
                {i > 0 ? <span className="text-[var(--tk-ink-mute)]">·</span> : null}
                {m}
              </span>
            ))}
          </p>
        </button>

        {/* The one action */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          {unowned ? (
            <NamePicker
              names={names}
              current={null}
              busy={busy}
              compact
              onPick={(n) => run(() => assignTask(task.id, n))}
            />
          ) : (
            <>
              <button
                onClick={() => setOpen(true)}
                className="rounded-[10px] bg-[var(--tk-sage-soft)] px-3 py-2 text-[15px] font-semibold text-[var(--tk-charcoal)]"
              >
                {task.ownedBy}
              </button>
              <button
                disabled={busy}
                onClick={() => run(() => completeTask(task.id, me || task.ownedBy || "Board"))}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--tk-charcoal)] px-4 py-2 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Done
              </button>
            </>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Fewer options" : "More options"}
            className="rounded-[10px] p-2 text-[var(--tk-ink-mute)] transition active:scale-[0.98]"
          >
            <ChevronDown className={`h-5 w-5 transition ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-4 border-t-[1.5px] border-[var(--tk-line)] pt-4">
          <div>
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
              Who&apos;s on it
            </p>
            <NamePicker
              names={names}
              current={task.ownedBy}
              busy={busy}
              onPick={(n) => run(() => assignTask(task.id, n))}
            />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
              How urgent
            </p>
            <div className="flex flex-wrap gap-2">
              {(["URGENT", "NORMAL", "WHENEVER"] as VenueTaskPriority[]).map((p) => (
                <button
                  key={p}
                  disabled={busy}
                  onClick={() => run(() => overrideTaskPriority(task.id, p))}
                  className={chip(task.priority === p)}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {unowned ? (
              <button
                disabled={busy}
                onClick={() => run(() => completeTask(task.id, me || "Board"))}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--tk-charcoal)] px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Already done
              </button>
            ) : null}
            {task.assetSlug ? (
              <Link
                href={`/kitchen/fix/${task.assetSlug}`}
                className="inline-flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-3 py-2 text-[15px] font-semibold text-[var(--tk-charcoal)]"
              >
                <Wrench className="h-4 w-4" /> Open the fix page
              </Link>
            ) : null}
            <span className="flex-1" />
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm("Take this off the board without doing it?")) {
                  run(() => dismissTask(task.id))
                }
              }}
              className="rounded-[10px] px-3 py-2 text-[15px] font-semibold text-[var(--tk-ink-soft)] disabled:opacity-50"
            >
              Not a job, remove it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Section({
  id,
  title,
  hint,
  count,
  children,
}: {
  id: string
  title: string
  hint?: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-4 border-t-[1.5px] border-[var(--tk-line)] pt-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="tk-display text-[24px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
          {title}
        </h2>
        <span className="tk-display text-[16px] font-bold text-[var(--tk-ink-mute)]">{count}</span>
        {hint ? <span className="text-[15px] text-[var(--tk-ink-soft)]">{hint}</span> : null}
      </div>
      {children}
    </section>
  )
}

/** Zero counts stay off the strip; the one exception is "needs an owner",
 * because "nothing needs an owner" is the news a manager opens the board for. */
function Stat({ n, label, href, tone }: { n: number; label: string; href: string; tone: "hot" | "warn" | "calm" }) {
  if (n === 0) return null
  const cls =
    tone === "hot"
      ? "bg-[var(--tk-charcoal)] text-white"
      : tone === "warn"
        ? "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]"
        : "bg-[var(--tk-card)] border-[1.5px] border-[var(--tk-line)] text-[var(--tk-charcoal)]"
  return (
    <a href={href} className={`rounded-[12px] px-3.5 py-2 text-[15px] font-semibold ${cls}`}>
      <span className="tk-display text-[18px] font-bold">{n}</span> {label}
    </a>
  )
}

export function MorningBoard({
  board,
  belowPar,
  venueLabel,
}: {
  board: MorningBoardData
  belowPar: ReorderLine[]
  venueLabel: string
}) {
  const [me] = useRememberedName()
  const mine = me.trim().toLowerCase()

  // Owned rows grouped by name. Whoever is holding the iPad reads first.
  const byOwner = new Map<string, BoardTask[]>()
  for (const t of [...board.mine, ...board.waitingOn]) {
    const k = (t.ownedBy ?? "").trim()
    byOwner.set(k, [...(byOwner.get(k) ?? []), t])
  }
  const groups = [...byOwner.entries()].sort(([a], [b]) => {
    if (a.toLowerCase() === mine) return -1
    if (b.toLowerCase() === mine) return 1
    return a.localeCompare(b)
  })

  const openCount =
    board.unassigned.length + board.waitingOn.length + board.mine.length + board.stale.length
  const waitingCount = board.waitingOn.length + board.mine.length

  if (openCount === 0 && belowPar.length === 0) {
    return (
      <div className="rounded-[20px] bg-[var(--tk-card)] px-6 py-10 text-center">
        <p className="tk-display text-[28px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
          Nothing open at {venueLabel}.
        </p>
        <p className="mt-2 text-[17px] text-[var(--tk-ink-soft)]">
          {board.doneToday > 0
            ? `${board.doneToday} closed today. `
            : ""}
          Anything staff report lands here, so does anything the stock walk flags.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/kitchen/report" className={chip(false)}>Spotted something?</Link>
          <Link href="/kitchen/stock" className={chip(false)}>Stock walk</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {board.unassigned.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-[12px] bg-[var(--tk-done-soft)] px-3.5 py-2 text-[15px] font-semibold text-[var(--tk-done)]">
            <Check className="h-4 w-4" /> Everything has an owner
          </span>
        ) : (
          <Stat n={board.unassigned.length} label="need an owner" href="#needs-owner" tone="hot" />
        )}
        <Stat n={waitingCount} label="waiting on someone" href="#waiting" tone="calm" />
        <Stat n={board.stale.length} label="going stale" href="#stale" tone="warn" />
        <Stat n={belowPar.length} label="to order" href="#to-order" tone="calm" />
        {board.doneToday > 0 ? (
          <span className="self-center px-2 text-[15px] text-[var(--tk-ink-soft)]">
            {board.doneToday} closed today
          </span>
        ) : null}
      </div>

      {board.unassigned.length > 0 ? (
        <Section
          id="needs-owner"
          title="Needs an owner"
          count={board.unassigned.length}
          hint="Tap a name. That is the whole morning job."
        >
          <div className="space-y-2.5">
            {board.unassigned.map((t) => (
              <TaskRow key={t.id} task={t} names={board.owners} me={me} unowned />
            ))}
          </div>
        </Section>
      ) : null}

      {groups.length > 0 ? (
        <div id="waiting" className="scroll-mt-4 space-y-6">
          {groups.map(([owner, tasks]) => (
            <Section
              key={owner}
              id={`waiting-${owner.toLowerCase().replace(/\s+/g, "-")}`}
              title={owner.toLowerCase() === mine ? "On you" : `Waiting on ${owner}`}
              count={tasks.length}
              hint={owner.toLowerCase() === mine ? undefined : "Chase, don't do."}
            >
              <div className="space-y-2.5">
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} names={board.owners} me={me} unowned={false} />
                ))}
              </div>
            </Section>
          ))}
        </div>
      ) : null}

      {board.stale.length > 0 ? (
        <Section
          id="stale"
          title="Going stale"
          count={board.stale.length}
          hint="Open more than a week. Chase it, hand it on, or take it off."
        >
          <div className="space-y-2.5">
            {board.stale.map((t) => (
              <TaskRow key={t.id} task={t} names={board.owners} me={me} unowned={!t.ownedBy} />
            ))}
          </div>
        </Section>
      ) : null}

      {belowPar.length > 0 ? (
        <Section
          id="to-order"
          title="To order"
          count={belowPar.length}
          hint="Flagged on the stock walk or counted below par."
        >
          <div className="divide-y divide-[var(--tk-line)] rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)]">
            {belowPar.map((l) => (
              <div key={l.itemId} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
                <span className="min-w-0">
                  <span className="text-[17px] font-semibold text-[var(--tk-charcoal)]">{l.name}</span>
                  <span className="ml-2 text-[14px] text-[var(--tk-ink-soft)]">{l.area}</span>
                </span>
                <span className="shrink-0 text-[15px] text-[var(--tk-ink-soft)]">
                  {l.tracking === "SIGNAL" ? (
                    <>
                      <span className={`font-semibold ${l.signal === "OUT" ? "text-[var(--tk-warn)]" : "text-[var(--tk-charcoal)]"}`}>
                        {l.signal === "OUT" ? "Out" : "Low"}
                      </span>
                      {l.flaggedBy ? ` · ${l.flaggedBy}` : ""}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[var(--tk-charcoal)]">{l.onHand ?? "?"}</span>
                      {` of ${l.parLevel ?? "?"}${l.unit ? ` ${l.unit}` : ""}`}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/kitchen/order" className={chip(false)}>Put it on today&apos;s order</Link>
            <Link href="/kitchen/stock" className={chip(false)}>Stock walk</Link>
          </div>
        </Section>
      ) : null}

      <p className="pt-2 text-[15px] text-[var(--tk-ink-soft)]">
        Something new?{" "}
        <Link href="/kitchen/report" className="font-semibold text-[var(--tk-charcoal)] underline decoration-[var(--tk-line)] underline-offset-4">
          Spotted something
        </Link>{" "}
        puts it here.
      </p>
    </div>
  )
}
