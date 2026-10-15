"use client"

import { useState } from "react"
import { Loader2, Plus, ShoppingCart } from "lucide-react"
import { KitchenTick } from "@/components/kitchen/KitchenTick"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { addOrderRequest, setOrderRequestDone } from "@/lib/actions/order-requests"
import { MAX_ORDER_REQUEST_LENGTH, type OrderRequestRow } from "@/lib/order-requests/shared"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

const when = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Brisbane",
})

/**
 * Order Requests (Jose, 15 Oct 2026): anything a chef notices through the
 * day that needs ordering, or did not arrive with a delivery, written down
 * as they go. The head chef ticks each one once it is on an order.
 */
export function OrderRequests({ venue, initial }: { venue: Venue; initial: OrderRequestRow[] }) {
  const [rows, setRows] = useState(initial)
  const [text, setText] = useState("")
  const [name, setName] = useRememberedName()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = rows.filter((r) => !r.done)
  const done = rows.filter((r) => r.done)

  async function add() {
    const t = text.trim()
    if (!t || adding) return
    setAdding(true)
    setError(null)
    const res = await addOrderRequest({ venue, text: t, createdBy: name })
    setAdding(false)
    if (!res.ok || !res.id) {
      setError(res.error ?? "Couldn't save. Try again.")
      return
    }
    setRows((prev) => [
      { id: res.id!, text: t, createdBy: name.trim() || null, createdAt: new Date().toISOString(), done: false, doneBy: null, doneAt: null },
      ...prev,
    ])
    setText("")
  }

  async function toggle(r: OrderRequestRow) {
    const next = !r.done
    setRows((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? { ...x, done: next, doneBy: next ? name.trim() || null : null, doneAt: next ? new Date().toISOString() : null }
          : x
      )
    )
    const res = await setOrderRequestDone({ id: r.id, done: next, doneBy: name })
    if (!res.ok) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)))
      setError("Couldn't save. Try again.")
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="space-y-3 rounded-[20px] border border-[var(--tk-line)] bg-white p-5"
      >
        <div className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
          Add a request
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_ORDER_REQUEST_LENGTH}
          placeholder="White wine vinegar for tomorrow, detergent didn't arrive..."
          aria-label="What needs ordering or didn't arrive"
          className="min-h-[56px] w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoCapitalize="words"
            aria-label="Your name"
            className="min-h-[52px] flex-1 rounded-[14px] border border-[var(--tk-line)] bg-white px-4 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
          />
          <button
            type="submit"
            disabled={!text.trim() || adding}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] px-7 text-[16px] font-semibold text-white transition active:scale-[0.985] disabled:opacity-40"
            style={{ background: "var(--tk-charcoal)" }}
          >
            {adding ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Add to the list
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-[16px] px-5 py-4 text-[14px] font-medium" style={{ background: "#fdecec", color: "#b3261e" }}>
          {error}
        </div>
      )}

      <div className="space-y-2">
        <div className="tk-caps flex items-center gap-1.5 px-1" style={{ color: "var(--tk-ink-mute)" }}>
          <ShoppingCart className="h-3.5 w-3.5" />
          <span style={{ color: "var(--tk-charcoal)" }}>To order</span>
          <span className="ml-auto tabular-nums">{open.length}</span>
        </div>
        <div className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white">
          {open.length === 0 ? (
            <div className="px-5 py-6 text-[15px] text-[var(--tk-ink-soft)]">
              Nothing waiting. Add anything you notice is running out or didn&apos;t arrive.
            </div>
          ) : (
            <ul>
              {open.map((r) => (
                <Row key={r.id} row={r} onToggle={() => toggle(r)} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {done.length > 0 && (
        <div className="space-y-2">
          <div className="tk-caps flex items-center gap-1.5 px-1" style={{ color: "var(--tk-ink-mute)" }}>
            <span>Ordered</span>
            <span className="ml-auto tabular-nums">{done.length}</span>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white">
            <ul>
              {done.map((r) => (
                <Row key={r.id} row={r} onToggle={() => toggle(r)} />
              ))}
            </ul>
          </div>
          <p className="px-1 text-[13px] text-[var(--tk-ink-mute)]">Ordered requests drop off after a few days.</p>
        </div>
      )}
    </div>
  )
}

function Row({ row, onToggle }: { row: OrderRequestRow; onToggle: () => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-[var(--tk-line)] px-4 py-3 last:border-b-0">
      <KitchenTick done={row.done} onClick={onToggle} size={44} />
      <div className="min-w-0 flex-1">
        <div
          className={`text-[17px] leading-snug ${
            row.done ? "text-[var(--tk-ink-mute)] line-through" : "font-semibold text-[var(--tk-charcoal)]"
          }`}
        >
          {row.text}
        </div>
        <div className="text-[13px] text-[var(--tk-ink-mute)]">
          {[
            row.createdBy,
            when.format(new Date(row.createdAt)),
            row.done ? (row.doneBy ? `Ordered by ${row.doneBy}` : "Ordered") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </li>
  )
}
