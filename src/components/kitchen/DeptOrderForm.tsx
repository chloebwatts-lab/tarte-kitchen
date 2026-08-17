"use client"

import { useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Loader2,
  Lock,
  Minus,
  Pencil,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react"
import {
  approveDeptRequest,
  reopenDeptRequest,
  saveDeptLine,
  type DeptForm,
  type DeptFormRow,
} from "@/lib/actions/dept-orders"
import { DEPT_LABEL } from "@/lib/departments"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"

/**
 * One department's order form. Everything that department orders, across
 * every supplier, on one page. Anyone on the section can add to it during
 * the day; the department head approves it at close, which is what releases
 * it onto the end-of-day order sheet.
 */
export function DeptOrderForm({ initialForm }: { initialForm: DeptForm }) {
  const [rows, setRows] = useState<DeptFormRow[]>(initialForm.rows)
  const [status, setStatus] = useState(initialForm.status)
  const [approvedBy, setApprovedBy] = useState(initialForm.approvedBy)
  const [name, setName] = useRememberedName()
  const [query, setQuery] = useState("")
  const [onlyAdded, setOnlyAdded] = useState(false)
  const [savingCount, setSavingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const locked = status === "APPROVED"

  const added = rows.filter((r) => (r.quantity ?? 0) > 0)
  const total = added.reduce((s, r) => s + (r.quantity ?? 0) * r.packPrice, 0)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (onlyAdded && !(r.quantity ?? 0)) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q)
      )
    })
  }, [rows, query, onlyAdded])

  // Supplier first: it's how the order actually goes out, and it stops the
  // same item from two suppliers sitting side by side looking like a dupe.
  const groups = useMemo(() => {
    const map = new Map<string, DeptFormRow[]>()
    for (const r of visible) {
      const arr = map.get(r.supplierName) ?? []
      arr.push(r)
      map.set(r.supplierName, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible])

  function patch(itemId: string, p: Partial<DeptFormRow>) {
    setRows((prev) =>
      prev.map((r) => (r.approvedItemId === itemId ? { ...r, ...p } : r))
    )
  }

  function persist(
    row: DeptFormRow,
    p: { quantity?: number | null; note?: string | null },
    debounceKey?: string
  ) {
    const run = () => {
      setSavingCount((n) => n + 1)
      saveDeptLine({
        venue: initialForm.venue,
        dept: initialForm.dept,
        approvedItemId: row.approvedItemId,
        quantity: p.quantity !== undefined ? p.quantity : (row.quantity ?? 0),
        note: p.note,
        enteredBy: name.trim() || null,
      })
        .then((res) => {
          if (!res.ok) setError(res.error ?? "Couldn't save. Try again.")
          else setError(null)
        })
        .catch(() => setError("Couldn't save. Check the connection."))
        .finally(() => setSavingCount((n) => n - 1))
    }
    if (debounceKey) {
      const key = `${row.approvedItemId}|${debounceKey}`
      const existing = timers.current.get(key)
      if (existing) clearTimeout(existing)
      timers.current.set(key, setTimeout(run, 600))
    } else {
      run()
    }
  }

  function bump(row: DeptFormRow, delta: number) {
    if (locked || row.orderedAt) return
    const next = Math.max(0, (row.quantity ?? 0) + delta)
    patch(row.approvedItemId, {
      quantity: next || null,
      enteredBy: name.trim() || row.enteredBy,
    })
    persist(row, { quantity: next })
  }

  async function handleApprove(emptyDay: boolean) {
    if (!name.trim()) {
      setError("Put your name in first")
      return
    }
    setBusy(true)
    const res = await approveDeptRequest({
      venue: initialForm.venue,
      dept: initialForm.dept,
      approvedBy: name.trim(),
      notes: emptyDay ? "Nothing needed today" : null,
    })
    setBusy(false)
    if (res.ok) {
      setStatus("APPROVED")
      setApprovedBy(name.trim())
      setError(null)
    } else {
      setError(res.error ?? "Couldn't approve")
    }
  }

  async function handleReopen() {
    setBusy(true)
    const res = await reopenDeptRequest({
      venue: initialForm.venue,
      dept: initialForm.dept,
    })
    setBusy(false)
    if (res.ok) {
      setStatus("OPEN")
      setApprovedBy(null)
      setError(null)
    } else {
      setError(res.error ?? "Couldn't reopen")
    }
  }

  if (locked) {
    return (
      <div className="space-y-5">
        <div className="rounded-[24px] border border-[var(--tk-line)] bg-white p-10 text-center">
          <div
            className="tk-display text-[var(--tk-done)]"
            style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em" }}
          >
            {added.length > 0 ? "Approved ✓" : "Nothing needed ✓"}
          </div>
          <p className="mt-3 text-[16px] text-[var(--tk-ink-soft)]">
            {added.length > 0
              ? `${added.length} item${added.length === 1 ? "" : "s"} · $${total.toFixed(2)}`
              : `${DEPT_LABEL[initialForm.dept]} has nothing to order today`}
            {approvedBy ? ` · by ${approvedBy}` : ""}
          </p>
          <p className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">
            It&apos;s on the order sheet now. It goes out once every section is
            in.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleReopen}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--tk-line)] bg-white px-5 py-2.5 text-[14px] font-medium text-[var(--tk-charcoal)] hover:bg-[var(--tk-bg)] disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" />
              Reopen &amp; edit
            </button>
            <a
              href={`/kitchen/order/sheet?venue=${initialForm.venue}`}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-white"
              style={{ background: "var(--tk-charcoal)" }}
            >
              Order sheet
            </a>
          </div>
        </div>
        {error && <ErrorStrip message={error} />}
        {added.length > 0 && (
          <div className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white">
            {added.map((r) => (
              <div
                key={r.approvedItemId}
                className="flex items-center gap-3 border-b border-[var(--tk-line)] px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium text-[var(--tk-charcoal)]">
                    {r.name}
                    {r.packSize ? (
                      <span className="ml-1.5 text-[13px] font-normal text-[var(--tk-ink-soft)]">
                        {r.packSize}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[13px] text-[var(--tk-ink-soft)]">
                    {r.supplierName}
                    {r.enteredBy ? ` · ${r.enteredBy}` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="text-[15px] font-semibold text-[var(--tk-charcoal)]">
                    {r.quantity} ×
                  </div>
                  <div className="text-[13px] text-[var(--tk-ink-soft)]">
                    ${((r.quantity ?? 0) * r.packPrice).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-40">
      {/* Who's entering + save state */}
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="min-w-[140px] flex-1 rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2.5 text-[15px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
          />
          <span className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-widest text-[var(--tk-ink-soft)] tabular-nums">
            {savingCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> saving
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--tk-done)]">
                <Check className="h-3.5 w-3.5" /> saved
              </span>
            )}
          </span>
        </div>
      </div>

      {error && <ErrorStrip message={error} />}

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tk-ink-mute)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this section's items"
            className="w-full rounded-full border border-[var(--tk-line)] bg-white py-2.5 pl-10 pr-9 text-[15px] outline-none focus:border-[var(--tk-charcoal)]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tk-ink-mute)]"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setOnlyAdded((v) => !v)}
          className="shrink-0 rounded-full border px-4 py-2.5 text-[14px] font-medium"
          style={
            onlyAdded
              ? { background: "var(--tk-charcoal)", color: "white", borderColor: "var(--tk-charcoal)" }
              : { background: "white", color: "var(--tk-charcoal)", borderColor: "var(--tk-line)" }
          }
        >
          On my order ({added.length})
        </button>
      </div>

      {groups.length === 0 && (
        <div className="rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-10 text-center text-[15px] text-[var(--tk-ink-soft)]">
          {onlyAdded
            ? "Nothing on your order yet."
            : "Nothing matches that search."}
        </div>
      )}

      {groups.map(([supplierName, supplierRows]) => (
        <div key={supplierName} className="space-y-2">
          <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
            {supplierName}
          </div>
          <div className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white">
            {supplierRows.map((row) => {
              const qty = row.quantity ?? 0
              const sent = row.orderedAt != null
              return (
                <div
                  key={row.approvedItemId}
                  className="border-b border-[var(--tk-line)] last:border-b-0"
                  style={qty > 0 ? { background: "var(--tk-sage-soft)" } : undefined}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium leading-snug text-[var(--tk-charcoal)]">
                        {row.name}
                        {row.packSize ? (
                          <span className="ml-1.5 text-[13px] font-normal text-[var(--tk-ink-soft)]">
                            {row.packSize}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[13px] text-[var(--tk-ink-soft)] tabular-nums">
                        ${row.packPrice.toFixed(2)} a pack
                        {qty > 0
                          ? ` · $${(qty * row.packPrice).toFixed(2)}`
                          : ""}
                        {row.enteredBy && qty > 0 ? ` · ${row.enteredBy}` : ""}
                      </div>
                    </div>

                    {sent ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--tk-bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--tk-ink-soft)]">
                        <Lock className="h-3.5 w-3.5" />
                        Ordered
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => bump(row, -1)}
                          disabled={qty === 0}
                          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tk-line)] bg-white text-[var(--tk-charcoal)] disabled:opacity-30"
                          aria-label={`One less ${row.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          inputMode="decimal"
                          value={qty === 0 ? "" : String(qty)}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9.]/g, "")
                            const next = raw === "" ? null : Number(raw)
                            if (next != null && Number.isNaN(next)) return
                            patch(row.approvedItemId, {
                              quantity: next,
                              enteredBy: name.trim() || row.enteredBy,
                            })
                            persist(row, { quantity: next }, "qty")
                          }}
                          className="h-11 w-14 rounded-[12px] border border-[var(--tk-line)] bg-white text-center text-[17px] font-semibold text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
                        />
                        <button
                          onClick={() => bump(row, 1)}
                          className="flex h-11 w-11 items-center justify-center rounded-full text-white"
                          style={{ background: "var(--tk-charcoal)" }}
                          aria-label={`One more ${row.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {qty > 0 && !sent && (
                    <div className="px-4 pb-3">
                      {noteOpen === row.approvedItemId || row.note ? (
                        <input
                          autoFocus={noteOpen === row.approvedItemId}
                          value={row.note ?? ""}
                          placeholder="Note for the supplier or your head (optional)"
                          onChange={(e) => {
                            patch(row.approvedItemId, { note: e.target.value })
                            persist(row, { note: e.target.value }, "note")
                          }}
                          className="w-full rounded-[12px] border border-[var(--tk-line)] bg-white px-3.5 py-2 text-[14px] outline-none focus:border-[var(--tk-charcoal)]"
                        />
                      ) : (
                        <button
                          onClick={() => setNoteOpen(row.approvedItemId)}
                          className="text-[13px] font-medium text-[var(--tk-ink-soft)] underline underline-offset-2"
                        >
                          Add a note
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Sticky footer: running total + approve */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--tk-line)] bg-white/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1194px] flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] uppercase tracking-widest text-[var(--tk-ink-soft)]">
              {DEPT_LABEL[initialForm.dept]} today
            </div>
            <div className="text-[20px] font-semibold text-[var(--tk-charcoal)] tabular-nums">
              {added.length} item{added.length === 1 ? "" : "s"} · $
              {total.toFixed(2)}
            </div>
          </div>
          {added.length === 0 ? (
            <button
              onClick={() => handleApprove(true)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--tk-line)] bg-white px-5 py-3 text-[15px] font-medium text-[var(--tk-charcoal)] disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Nothing needed today
            </button>
          ) : (
            <button
              onClick={() => handleApprove(false)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--tk-charcoal)" }}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Approve &amp; send to order sheet
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ErrorStrip({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[16px] px-5 py-4 text-[14px] font-medium"
      style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
    >
      <AlertTriangle className="h-5 w-5 shrink-0" />
      {message}
    </div>
  )
}
