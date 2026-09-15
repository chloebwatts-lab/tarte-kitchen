"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Loader2, Plus } from "lucide-react"
import { KitchenTick } from "@/components/kitchen/KitchenTick"
import { ESTIMATES, chip, fmtMinutes, whenLabel } from "@/components/kitchen/board-bits"
import {
  addOwnItem,
  completeTask,
  releaseToBoard,
  removeOwnItem,
  reopenTask,
  setTaskEstimate,
} from "@/lib/actions/venue-ops"
import type { BoardTask, OwnList as OwnListData } from "@/lib/actions/venue-ops"
import type { Venue, VenueTaskPriority } from "@/generated/prisma/client"

/**
 * One person's own list. The Apple Notes replacement: type a line, tick it
 * off. Nothing here is up for grabs; the only exit to another person is
 * "Put it on the board", which turns it into an ordinary unowned job.
 */

function Row({ task, who }: { task: BoardTask; who: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, start] = useTransition()
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn()
      router.refresh()
    })
  const done = task.status === "DONE"

  return (
    <div className={`rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-3.5 py-3 md:px-4 ${done ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3">
        <KitchenTick
          done={done}
          size={42}
          onClick={() => run(() => (done ? reopenTask(task.id) : completeTask(task.id, who)))}
        />
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span
            className={`text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)] ${
              done ? "line-through decoration-[var(--tk-ink-mute)]" : ""
            }`}
          >
            {task.title}
          </span>
          <span className="ml-2 text-[14px] text-[var(--tk-ink-soft)]">
            {task.priority === "URGENT" ? "today" : null}
            {task.priority === "URGENT" && task.estimateMinutes ? " · " : null}
            {task.estimateMinutes ? fmtMinutes(task.estimateMinutes) : null}
          </span>
        </button>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-[var(--tk-ink-mute)]" /> : null}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Fewer options" : "More options"}
          className="rounded-[10px] p-2 text-[var(--tk-ink-mute)] transition active:scale-[0.98]"
        >
          <ChevronDown className={`h-5 w-5 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open ? (
        <div className="mt-3 space-y-3 border-t-[1.5px] border-[var(--tk-line)] pt-3">
          <p className="text-[14px] text-[var(--tk-ink-soft)]">
            Added {whenLabel(task.createdAt)}.
          </p>
          <div className="flex flex-wrap gap-2">
            {ESTIMATES.map((e) => (
              <button
                key={e.minutes}
                disabled={busy}
                onClick={() =>
                  run(() => setTaskEstimate(task.id, task.estimateMinutes === e.minutes ? null : e.minutes))
                }
                className={chip(task.estimateMinutes === e.minutes)}
              >
                {e.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!done ? (
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Put this on the morning board for someone else to pick up?")) {
                    run(() => releaseToBoard(task.id, who))
                  }
                }}
                className={chip(false)}
              >
                Put it on the board
              </button>
            ) : null}
            <span className="flex-1" />
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm("Remove this from your list?")) run(() => removeOwnItem(task.id))
              }}
              className="rounded-[10px] px-3 py-2 text-[15px] font-semibold text-[var(--tk-ink-soft)] disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function OwnList({ list, venue }: { list: OwnListData; venue: Venue }) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [today, setToday] = useState(false)
  const [busy, start] = useTransition()

  function add() {
    const t = text.trim()
    if (!t) return
    const priority: VenueTaskPriority = today ? "URGENT" : "NORMAL"
    start(async () => {
      await addOwnItem(venue, list.who, t, priority)
      setText("")
      setToday(false)
      router.refresh()
    })
  }

  const todayItems = list.open.filter((t) => t.priority === "URGENT")
  const rest = list.open.filter((t) => t.priority !== "URGENT")

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] p-3 md:p-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add something"
            enterKeyHint="done"
            className="min-w-0 flex-1 rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[18px]"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setToday((v) => !v)} className={chip(today)} aria-pressed={today}>
              Today
            </button>
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-[12px] bg-[var(--tk-charcoal)] px-4 py-3 text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
        </div>
      </form>

      {list.open.length === 0 && list.doneToday.length === 0 ? (
        <p className="px-1 text-[17px] text-[var(--tk-ink-soft)]">Nothing on the list. Type a line above.</p>
      ) : null}

      {todayItems.length > 0 ? (
        <section className="space-y-2.5">
          <p className="px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
            Today
          </p>
          {todayItems.map((t) => (
            <Row key={t.id} task={t} who={list.who} />
          ))}
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="space-y-2.5">
          {todayItems.length > 0 ? (
            <p className="px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
              Everything else
            </p>
          ) : null}
          {rest.map((t) => (
            <Row key={t.id} task={t} who={list.who} />
          ))}
        </section>
      ) : null}

      {list.doneToday.length > 0 ? (
        <section className="space-y-2.5 border-t-[1.5px] border-[var(--tk-line)] pt-5">
          <p className="px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
            Ticked today
          </p>
          {list.doneToday.map((t) => (
            <Row key={t.id} task={t} who={list.who} />
          ))}
        </section>
      ) : null}
    </div>
  )
}
