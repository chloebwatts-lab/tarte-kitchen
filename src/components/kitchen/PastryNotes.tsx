"use client"

import { useOptimistic, useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { KitchenTick } from "@/components/kitchen/KitchenTick"
import { addPastryNote, setPastryNoteDone, type PastryNoteRow } from "@/lib/actions/pastry-section"
import { MAX_NOTE_LENGTH, NOTES_FOR } from "@/lib/pastry/section"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

const when = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane" })

/** Notes the pastry team leaves for Jess. Tick one when it's sorted. */
export function PastryNotes({ venue, notes }: { venue: Venue; notes: PastryNoteRow[] }) {
  const [, start] = useTransition()
  const [rows, setRows] = useOptimistic(notes)
  const [text, setText] = useState("")

  function add() {
    const t = text.trim()
    if (!t) return
    setText("")
    start(async () => {
      setRows([
        { id: `new-${Date.now()}`, text: t, createdBy: null, createdAt: new Date().toISOString(), done: false, doneBy: null },
        ...rows,
      ])
      await addPastryNote({ venue, text: t })
    })
  }

  function toggle(n: PastryNoteRow) {
    if (n.id.startsWith("new-")) return
    start(async () => {
      setRows(rows.map((r) => (r.id === n.id ? { ...r, done: !n.done } : r)))
      await setPastryNoteDone(n.id, !n.done)
    })
  }

  return (
    <div className="rounded-[18px] border border-[var(--tk-line)] bg-white">
      <div className="px-5 pt-4 pb-3">
        <h2 className="tk-display text-[24px] leading-none text-[var(--tk-charcoal)]" style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
          Notes for {NOTES_FOR}
        </h2>
        <p className="mt-1.5 text-[14px] text-[var(--tk-ink-soft)]">
          {`Anything ${NOTES_FOR} needs to know or buy. Tick it once it's sorted.`}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="flex gap-2 border-t border-[var(--tk-line)] px-4 py-3.5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="We need piping bags, butter is out..."
          aria-label={`Add a note for ${NOTES_FOR}`}
          className="min-h-[46px] min-w-0 flex-1 rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3.5 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex min-h-[46px] shrink-0 items-center gap-1.5 rounded-[12px] bg-[var(--tk-charcoal)] px-4 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="border-t border-[var(--tk-line)] px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
          No notes at the moment.
        </div>
      ) : (
        <ul>
          {rows.map((n) => (
            <li key={n.id} className="flex items-center gap-3 border-t border-[var(--tk-line)] px-4 py-2.5">
              <KitchenTick done={n.done} onClick={() => toggle(n)} size={42} />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[17px] leading-snug ${
                    n.done ? "text-[var(--tk-ink-mute)] line-through" : "font-semibold text-[var(--tk-charcoal)]"
                  }`}
                >
                  {n.text}
                </div>
                <div className="text-[13px] text-[var(--tk-ink-mute)]">
                  {[n.createdBy, when.format(new Date(n.createdAt)), n.done ? (n.doneBy ? `Sorted by ${n.doneBy}` : "Sorted") : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
