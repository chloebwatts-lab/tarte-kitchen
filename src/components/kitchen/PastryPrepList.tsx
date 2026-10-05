"use client"

import { useOptimistic, useState, useTransition } from "react"
import { Plus, X } from "lucide-react"
import { KitchenTick } from "@/components/kitchen/KitchenTick"
import { addPrepTask, removePrepTask, setPrepTick, type PrepTaskRow } from "@/lib/actions/pastry-section"
import { MAX_TASK_LENGTH, type PrepListKey } from "@/lib/pastry/section"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

/**
 * One loose prep list. Add a line, tick it when it's done, take it off when
 * it's no longer needed. Deliberately no "complete" state and no sign-off:
 * it is the team's own running list, not a checklist.
 */
export function PastryPrepList({
  venue,
  list,
  title,
  tasks,
}: {
  venue: Venue
  list: PrepListKey
  title: string
  tasks: PrepTaskRow[]
}) {
  const [, start] = useTransition()
  const [rows, setRows] = useOptimistic(tasks)
  const [label, setLabel] = useState("")
  const [everyDay, setEveryDay] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  const done = rows.filter((r) => r.done).length

  function tick(row: PrepTaskRow) {
    // Just-added row still saving: it has no real id to tick yet.
    if (row.id.startsWith("new-")) return
    start(async () => {
      setRows(rows.map((r) => (r.id === row.id ? { ...r, done: !row.done, doneBy: null } : r)))
      await setPrepTick(row.id, !row.done)
    })
  }

  function remove(id: string) {
    setRemoving(null)
    if (id.startsWith("new-")) return
    start(async () => {
      setRows(rows.filter((r) => r.id !== id))
      await removePrepTask(id)
    })
  }

  function add() {
    const text = label.trim()
    if (!text) return
    setLabel("")
    start(async () => {
      setRows([...rows, { id: `new-${Date.now()}`, label: text, everyDay, done: false, doneBy: null }])
      await addPrepTask({ venue, list, label: text, everyDay })
    })
  }

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
      on ? "bg-[var(--tk-charcoal)] text-white" : "border border-[var(--tk-line)] bg-white text-[var(--tk-ink-soft)]"
    }`

  return (
    <div className="rounded-[18px] border border-[var(--tk-line)] bg-white">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="tk-display text-[24px] leading-none text-[var(--tk-charcoal)]" style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
          {title}
        </h2>
        {rows.length > 0 && (
          <div className="text-[14px] tabular-nums text-[var(--tk-ink-soft)]">
            {done} of {rows.length} done
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-[var(--tk-line)] px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
          Nothing on this list yet. Add the first job below.
        </div>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-t border-[var(--tk-line)] px-4 py-2.5">
              <KitchenTick done={r.done} onClick={() => tick(r)} size={42} />
              <button type="button" onClick={() => tick(r)} className="min-w-0 flex-1 text-left">
                <div
                  className={`text-[17px] leading-snug ${
                    r.done ? "text-[var(--tk-ink-mute)] line-through" : "font-semibold text-[var(--tk-charcoal)]"
                  }`}
                >
                  {r.label}
                </div>
                {(r.doneBy || !r.everyDay) && (
                  <div className="text-[13px] text-[var(--tk-ink-mute)]">
                    {[!r.everyDay ? "Today only" : null, r.done && r.doneBy ? `Done by ${r.doneBy}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </button>
              {removing === r.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="min-h-[40px] rounded-full px-3 text-[13px] font-semibold text-white"
                    style={{ background: "var(--tk-warn)" }}
                  >
                    {r.everyDay ? "Take off for good" : "Take off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(null)}
                    className="min-h-[40px] rounded-full border border-[var(--tk-line)] px-3 text-[13px] font-semibold text-[var(--tk-ink-soft)]"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Take ${r.label} off the list`}
                  onClick={() => setRemoving(r.id)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--tk-ink-mute)] active:bg-[var(--tk-bg)]"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="space-y-2.5 border-t border-[var(--tk-line)] px-4 py-3.5"
      >
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={MAX_TASK_LENGTH}
            placeholder="Add a job"
            aria-label={`Add a job to ${title}`}
            className="min-h-[46px] min-w-0 flex-1 rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3.5 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
          />
          <button
            type="submit"
            disabled={!label.trim()}
            className="flex min-h-[46px] shrink-0 items-center gap-1.5 rounded-[12px] bg-[var(--tk-charcoal)] px-4 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {label.trim() && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEveryDay(true)} aria-pressed={everyDay} className={chip(everyDay)}>
              Every day
            </button>
            <button type="button" onClick={() => setEveryDay(false)} aria-pressed={!everyDay} className={chip(!everyDay)}>
              Just today
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
