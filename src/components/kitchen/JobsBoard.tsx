"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2, Wrench } from "lucide-react"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import {
  CATEGORY,
  MetaLine,
  NamePicker,
  PriorityTag,
  SectionHead,
  ageLabel,
  chip,
  dueLabel,
  fmtMinutes,
  whenLabel,
} from "@/components/kitchen/board-bits"
import { completeTask, handBackTask } from "@/lib/actions/venue-ops"
import type { BoardTask, JobsBoard as JobsBoardData } from "@/lib/actions/venue-ops"

/**
 * The Jobs board: what the morning board put on people, laid out by
 * person. Whoever holds the iPad reads their own list first. One action
 * per row (Done); handing a job back sits under the chevron because it
 * should be the rare case, not the easy one.
 */

const timeFmt = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Australia/Brisbane",
})

function JobRow({ task, me }: { task: BoardTask; me: string }) {
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
  if (task.assignedAt) {
    meta.push(
      task.assignedBy
        ? `${task.assignedBy} put this on you ${whenLabel(task.assignedAt)}`
        : `on you since ${whenLabel(task.assignedAt)}`
    )
  } else if (scheduled) meta.push("Scheduled")
  else meta.push(`spotted ${ageLabel(task.ageDays)}${task.reportedBy ? ` by ${task.reportedBy}` : ""}`)
  if (task.estimateMinutes) meta.push(`about ${fmtMinutes(task.estimateMinutes)}`)
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
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <PriorityTag priority={task.priority} />
            <span className="text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)]">{task.title}</span>
          </div>
          {task.detail ? (
            <p className="mt-1 text-[15px] leading-snug text-[var(--tk-ink-soft)]">{task.detail}</p>
          ) : null}
          <MetaLine items={meta} />
        </button>
        <div className="flex shrink-0 items-center gap-2 md:justify-end">
          <button
            disabled={busy}
            onClick={() => run(() => completeTask(task.id, me || task.ownedBy || "Jobs board"))}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--tk-charcoal)] px-4 py-2 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Done
          </button>
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
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t-[1.5px] border-[var(--tk-line)] pt-4">
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
              if (window.confirm("Send this back to the morning board for someone else?")) {
                run(() => handBackTask(task.id, me || task.ownedBy || "Jobs board"))
              }
            }}
            className="rounded-[10px] px-3 py-2 text-[15px] font-semibold text-[var(--tk-ink-soft)] disabled:opacity-50"
          >
            Can&apos;t do it, hand it back
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function JobsBoard({ board, venueLabel }: { board: JobsBoardData; venueLabel: string }) {
  const [me, setMe] = useRememberedName()
  const mine = me.trim().toLowerCase()

  const columns = [...board.columns].sort((a, b) => {
    if (a.owner.toLowerCase() === mine) return -1
    if (b.owner.toLowerCase() === mine) return 1
    return 0
  })
  const total = board.columns.reduce((n, c) => n + c.tasks.length, 0)
  const meListed = board.columns.some((c) => c.owner.toLowerCase() === mine)

  return (
    <div className="space-y-6">
      <div className="rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3.5 md:px-5">
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
          Who&apos;s reading
        </p>
        <NamePicker names={board.owners} current={me} busy={false} onPick={(n) => setMe(n.trim())} />
      </div>

      {total === 0 && board.doneToday.length === 0 ? (
        <div className="rounded-[20px] bg-[var(--tk-card)] px-6 py-10 text-center">
          <p className="tk-display text-[28px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
            Nothing on anyone at {venueLabel}.
          </p>
          <p className="mt-2 text-[17px] text-[var(--tk-ink-soft)]">
            {board.unassignedCount > 0
              ? `${board.unassignedCount} waiting for a manager to hand out. `
              : ""}
            When the morning board puts a name on a job, it lands here under that name.
          </p>
        </div>
      ) : null}

      {mine && !meListed && total > 0 ? (
        <p className="px-1 text-[16px] text-[var(--tk-ink-soft)]">Nothing on you, {me.trim()}.</p>
      ) : null}

      {columns.map((c) => {
        const isMe = c.owner.toLowerCase() === mine
        return (
          <section
            key={c.owner}
            id={`jobs-${c.owner.toLowerCase().replace(/\s+/g, "-")}`}
            className="scroll-mt-4 border-t-[1.5px] border-[var(--tk-line)] pt-5"
          >
            <SectionHead
              title={isMe ? "On you" : `On ${c.owner}`}
              count={c.tasks.length}
              hint={c.tasks.length === 0 ? "Nothing at the moment." : undefined}
            />
            {c.tasks.length > 0 ? (
              <div className="space-y-2.5">
                {c.tasks.map((t) => (
                  <JobRow key={t.id} task={t} me={me} />
                ))}
              </div>
            ) : null}
          </section>
        )
      })}

      {board.doneToday.length > 0 ? (
        <section className="border-t-[1.5px] border-[var(--tk-line)] pt-5">
          <SectionHead title="Closed today" count={board.doneToday.length} />
          <div className="divide-y divide-[var(--tk-line)] rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)]">
            {board.doneToday.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[var(--tk-done)]" />
                  <span className="text-[17px] font-semibold text-[var(--tk-charcoal)] line-through decoration-[var(--tk-ink-mute)]">
                    {d.title}
                  </span>
                </span>
                <span className="shrink-0 text-[14px] text-[var(--tk-ink-soft)]">
                  {d.doneBy ? `${d.doneBy}, ` : ""}
                  {timeFmt.format(new Date(d.doneAt))}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="pt-2 text-[15px] text-[var(--tk-ink-soft)]">
        {board.unassignedCount > 0
          ? `${board.unassignedCount} more with a manager to hand out. `
          : ""}
        Spotted something new?{" "}
        <Link
          href={`/kitchen/report?venue=${board.venue}`}
          className="font-semibold text-[var(--tk-charcoal)] underline decoration-[var(--tk-line)] underline-offset-4"
        >
          Report it
        </Link>{" "}
        and it goes to the morning board.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/kitchen/managers/board?venue=${board.venue}`} className={chip(false)}>Morning board</Link>
      </div>
    </div>
  )
}
