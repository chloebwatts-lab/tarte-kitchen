"use client"

import { useMemo, useState } from "react"
import { Loader2, PackageSearch, Plus, ShoppingCart, X } from "lucide-react"
import { KitchenTick } from "@/components/kitchen/KitchenTick"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { addOrderRequest, setOrderRequestDone } from "@/lib/actions/order-requests"
import {
  MAX_ORDER_REQUEST_LENGTH,
  matchCatalogue,
  parseQty,
  productDetail,
  qtyLabel,
  splitLeadingQty,
  type CatalogueChoice,
  type OrderRequestRow,
} from "@/lib/order-requests/shared"
import type { OrderDept } from "@/generated/prisma/client"

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
 * as they go. Typing it is enough (Chloe, 19 Oct 2026: chefs and KPs just
 * type what they need, no searching the list): "4 cream" goes on as
 * 4 × cream. While they type, matching products from the approved order
 * list are offered as a tap, which pins the exact product and supplier for
 * the head chef, but nothing has to be picked. The head chef ticks each one
 * once it is on an order.
 */
export function OrderRequests({
  venue,
  dept = "KITCHEN",
  initial,
  catalogue,
}: {
  venue: Venue
  /** Whose list: the kitchen's or pastry's. Its own products lead the search. */
  dept?: OrderDept
  initial: OrderRequestRow[]
  catalogue: CatalogueChoice[]
}) {
  const [rows, setRows] = useState(initial)
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<CatalogueChoice | null>(null)
  const [qty, setQty] = useState("")
  const [note, setNote] = useState("")
  const [name, setName] = useRememberedName()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Suggestions search the words after any leading quantity, so "4 cream"
  // still finds the creams.
  const typedText = useMemo(() => splitLeadingQty(query).text, [query])
  const matches = useMemo(
    () => (picked ? [] : matchCatalogue(catalogue, typedText, 5, dept)),
    [catalogue, typedText, picked, dept]
  )
  const open = rows.filter((r) => !r.done)
  const done = rows.filter((r) => r.done)
  const canAdd = !!picked || typedText.length > 0

  function pick(item: CatalogueChoice) {
    setPicked(item)
    // Keep a quantity typed in front: "4 cream" then tap Pure Cream 1L keeps the 4.
    const lead = splitLeadingQty(query).qty
    if (lead != null && !qty.trim()) setQty(String(lead))
    setQuery(item.name)
  }

  function clearPick() {
    setPicked(null)
    setQuery("")
  }

  async function add() {
    if (!canAdd || adding) return
    setAdding(true)
    setError(null)
    const res = await addOrderRequest({
      venue,
      dept,
      approvedItemId: picked?.id ?? null,
      text: picked ? null : query,
      qty: parseQty(qty),
      note,
      createdBy: name,
    })
    setAdding(false)
    if (!res.ok || !res.row) {
      setError(res.error ?? "Couldn't save. Try again.")
      return
    }
    setRows((prev) => [res.row!, ...prev])
    setPicked(null)
    setQuery("")
    setQty("")
    setNote("")
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

        {picked ? (
          <div
            className="flex items-center gap-3 rounded-[14px] px-4 py-3"
            style={{ background: "var(--tk-sage-soft)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]">
                {picked.name}
              </div>
              <div className="text-[13px] text-[var(--tk-ink-soft)]">
                {productDetail({ supplier: picked.supplier, packSize: picked.packSize })}
              </div>
            </div>
            <button
              type="button"
              onClick={clearPick}
              aria-label="Choose something else"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--tk-ink-soft)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <PackageSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--tk-ink-mute)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={MAX_ORDER_REQUEST_LENGTH}
              placeholder="Type what you need: 4 cream, vinegar, blue roll..."
              aria-label="What do you need"
              autoComplete="off"
              enterKeyHint="done"
              className="min-h-[56px] w-full rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] pl-12 pr-4 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
            />
          </div>
        )}

        {!picked && matches.length > 0 && (
          <div className="overflow-hidden rounded-[14px] border border-[var(--tk-line)]">
            <div className="bg-[var(--tk-bg)] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-mute)]">
              On the order list, tap to use the exact product (optional)
            </div>
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m)}
                className="flex w-full items-center gap-3 border-t border-[var(--tk-line)] bg-white px-4 py-3 text-left transition hover:bg-[var(--tk-bg)] active:bg-[var(--tk-bg)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-medium leading-snug text-[var(--tk-charcoal)]">{m.name}</div>
                  <div className="text-[13px] text-[var(--tk-ink-soft)]">
                    {productDetail({ supplier: m.supplier, packSize: m.packSize })}
                  </div>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-[var(--tk-ink-mute)]" />
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            placeholder="How many"
            aria-label={picked?.packSize ? `How many (${picked.packSize})` : "How many"}
            className="min-h-[52px] w-[120px] shrink-0 rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 text-center text-[16px] tabular-nums text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_ORDER_REQUEST_LENGTH}
            placeholder="Anything to add? For tomorrow, didn't arrive..."
            aria-label="Note"
            className="min-h-[52px] min-w-0 flex-1 rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
          />
        </div>
        {picked?.packSize && (
          <p className="text-[13px] text-[var(--tk-ink-mute)]">How many is in packs: {picked.packSize} each.</p>
        )}

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
            disabled={!canAdd || adding}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] px-7 text-[16px] font-semibold text-white transition active:scale-[0.985] disabled:opacity-40"
            style={{ background: "var(--tk-charcoal)" }}
          >
            {adding ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Add to the list
          </button>
        </div>
        {!picked && (
          <p className="text-[13px] text-[var(--tk-ink-mute)]">
            Just type it and add. A number in front is the quantity: &ldquo;4 cream&rdquo; goes on as 4 × cream.
            Tapping a product from the list is optional, it tells the head chef exactly which one.
          </p>
        )}
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
  const detail = productDetail(row)
  return (
    <li className="flex items-center gap-3 border-b border-[var(--tk-line)] px-4 py-3 last:border-b-0">
      <KitchenTick done={row.done} onClick={onToggle} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={`text-[17px] leading-snug ${
              row.done ? "text-[var(--tk-ink-mute)] line-through" : "font-semibold text-[var(--tk-charcoal)]"
            }`}
          >
            {row.qty != null && <span className="tabular-nums">{qtyLabel(row.qty)} </span>}
            {row.text}
          </span>
          {detail ? (
            <span className="text-[13px] text-[var(--tk-ink-soft)]">{detail}</span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
            >
              typed in
            </span>
          )}
        </div>
        {row.note && <div className="text-[14px] italic text-[var(--tk-ink-soft)]">“{row.note}”</div>}
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
