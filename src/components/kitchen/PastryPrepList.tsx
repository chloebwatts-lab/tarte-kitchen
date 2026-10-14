"use client"

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react"
import { Check, Loader2, Plus, X } from "lucide-react"
import { KitchenTick } from "@/components/kitchen/KitchenTick"
import {
  addPrepTask,
  removePrepTask,
  savePrepListNote,
  setPrepPriority,
  setPrepTick,
  type PrepTaskRow,
} from "@/lib/actions/pastry-section"
import {
  DEFAULT_PRIORITY,
  MAX_LIST_NOTE_LENGTH,
  MAX_TASK_LENGTH,
  PRIORITIES,
  PRIORITY_LABEL,
  byPriority,
  nextPriority,
  type PrepListKey,
  type Priority,
} from "@/lib/pastry/section"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

/** The number's colour: urgent reads red, medium gold, not urgent quiet. */
const PRIORITY_STYLE: Record<Priority, { bg: string; fg: string }> = {
  1: { bg: "var(--tk-warn)", fg: "white" },
  2: { bg: "var(--tk-gold-soft)", fg: "#8a6d1f" },
  3: { bg: "var(--tk-bg)", fg: "var(--tk-ink-soft)" },
}

function PriorityBadge({
  priority,
  onClick,
  label,
  size = 32,
}: {
  priority: Priority
  onClick?: () => void
  label: string
  size?: number
}) {
  const s = PRIORITY_STYLE[priority]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={PRIORITY_LABEL[priority]}
      className="flex shrink-0 items-center justify-center rounded-full text-[15px] font-bold tabular-nums transition active:scale-95"
      style={{ width: size, height: size, background: s.bg, color: s.fg }}
    >
      {priority}
    </button>
  )
}

/**
 * One loose prep list. Add a line with a priority number (1 urgent, 2
 * medium, 3 not urgent), tick it when it's done, take it off when it's no
 * longer needed, and leave free text underneath. Deliberately no "complete"
 * state and no sign-off: it is the team's own running list, not a checklist.
 */
export function PastryPrepList({
  venue,
  list,
  title,
  tasks,
  notes,
}: {
  venue: Venue
  list: PrepListKey
  title: string
  tasks: PrepTaskRow[]
  notes: string
}) {
  const [, start] = useTransition()
  const [rows, setRows] = useOptimistic(tasks)
  const [label, setLabel] = useState("")
  const [everyDay, setEveryDay] = useState(true)
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY)
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

  function cycle(row: PrepTaskRow) {
    if (row.id.startsWith("new-")) return
    const next = nextPriority(row.priority)
    start(async () => {
      setRows(byPriority(rows.map((r) => (r.id === row.id ? { ...r, priority: next } : r))))
      await setPrepPriority(row.id, next)
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
    const p = priority
    setPriority(DEFAULT_PRIORITY)
    start(async () => {
      setRows(byPriority([...rows, { id: `new-${Date.now()}`, label: text, priority: p, everyDay, done: false, doneBy: null }]))
      await addPrepTask({ venue, list, label: text, everyDay, priority: p })
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
              <PriorityBadge
                priority={r.priority}
                onClick={() => cycle(r)}
                label={`${r.label}: priority ${r.priority}, ${PRIORITY_LABEL[r.priority]}. Tap to change`}
              />
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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--tk-ink-soft)]">Priority</span>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  aria-pressed={priority === p}
                  className={`flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition ${
                    priority === p ? "ring-2 ring-[var(--tk-charcoal)]" : ""
                  }`}
                  style={{ background: PRIORITY_STYLE[p].bg, color: PRIORITY_STYLE[p].fg }}
                >
                  <span className="tabular-nums">{p}</span>
                  <span className="font-medium">{PRIORITY_LABEL[p]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEveryDay(true)} aria-pressed={everyDay} className={chip(everyDay)}>
                Every day
              </button>
              <button type="button" onClick={() => setEveryDay(false)} aria-pressed={!everyDay} className={chip(!everyDay)}>
                Just today
              </button>
            </div>
          </div>
        )}
      </form>

      <ListNotes venue={venue} list={list} title={title} initial={notes} />
    </div>
  )
}

/**
 * Free text under the list. Saves itself a moment after typing stops, so
 * nobody has to find a button; the last person to type wins.
 */
function ListNotes({ venue, list, title, initial }: { venue: Venue; list: PrepListKey; title: string; initial: string }) {
  const [text, setText] = useState(initial)
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(initial)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function change(next: string) {
    setText(next)
    latest.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setState("saving")
      await savePrepListNote({ venue, list, text: latest.current })
      setState("saved")
    }, 700)
  }

  return (
    <div className="border-t border-[var(--tk-line)] px-4 py-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={`notes-${list}`} className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
          Notes
        </label>
        <span className="text-[12px] text-[var(--tk-ink-mute)]">
          {state === "saving" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> saving
            </span>
          ) : state === "saved" ? (
            <span className="inline-flex items-center gap-1 text-[var(--tk-done)]">
              <Check className="h-3 w-3" /> saved
            </span>
          ) : null}
        </span>
      </div>
      <textarea
        id={`notes-${list}`}
        value={text}
        onChange={(e) => change(e.target.value)}
        maxLength={MAX_LIST_NOTE_LENGTH}
        rows={3}
        placeholder={`Anything the ${title.toLowerCase()} team should know. Saves as you type.`}
        className="w-full resize-y rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3.5 py-2.5 text-[15px] leading-snug text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
      />
    </div>
  )
}
