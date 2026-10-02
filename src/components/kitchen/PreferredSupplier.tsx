"use client"

import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import { Search, X, CheckCircle2, Ban, ArrowRight } from "lucide-react"
import { searchPreferred } from "@/lib/actions/preferred-supplier"
import type { RankedRow } from "@/lib/preferred-supplier"

const QUICK = ["Mozzarella", "Cream cheese", "Caster sugar", "Olive oil", "Butter", "Condensed milk", "Chips"]

const SUPPLIER_COLOR: Record<string, string> = {
  Bidfood: "#c8102e",
  Fermex: "#1f7a4d",
  "The Provedores": "#1e3a8a",
  "Cheese Time": "#9333ea",
  Fino: "#d97706",
  "Gold Coast Premium Foods": "#8b5cf6",
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function Price({ row }: { row: RankedRow }) {
  return (
    <div className="shrink-0 text-right tabular-nums">
      <div className="text-[17px] font-semibold text-[var(--tk-charcoal)]">
        {money(row.packPrice)}
        <span className="ml-1 text-[12px] font-normal text-[var(--tk-ink-soft)]">/ {row.packSize || "pack"}</span>
      </div>
      {row.unitPrice != null && row.unit && (
        <div className="text-[12px] text-[var(--tk-ink-soft)]">
          {money(row.unitPrice)} per {row.unit}
        </div>
      )}
      {row.rebatePct > 0 && (
        <div className="text-[11px] text-[var(--tk-ink-mute)]">
          {money(row.netPackPrice)} after {row.rebatePct}% rebate
        </div>
      )}
    </div>
  )
}

function Row({ row, bySupplierOnly }: { row: RankedRow; bySupplierOnly: boolean }) {
  const avoid = row.role === "avoid"
  return (
    <div className={`flex items-start gap-4 px-5 py-3.5 ${avoid ? "bg-[var(--tk-bg)]" : ""}`}>
      <span
        className="mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold text-white"
        style={{ background: SUPPLIER_COLOR[row.supplier] ?? "#555", opacity: avoid ? 0.55 : 1 }}
      >
        {row.supplier}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] font-medium ${avoid ? "text-[var(--tk-ink-soft)] line-through decoration-[var(--tk-ink-mute)]" : "text-[var(--tk-charcoal)]"}`}>
          {row.name}
        </div>
        {row.category && !bySupplierOnly && (
          <div className="text-[11px] uppercase tracking-wide text-[var(--tk-ink-mute)]">{row.category}</div>
        )}
        {avoid && row.useInstead && (
          <div className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-[var(--tk-done)]">
            <ArrowRight className="h-3.5 w-3.5" />
            Use {row.useInstead.supplier}: {row.useInstead.name}
            {row.vsPreferredPct != null && (
              <span className={`rounded-full px-2 py-0.5 text-[12px] ${row.vsPreferredPct > 0 ? "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]" : "bg-[var(--tk-gold-soft)] text-[#8a6d1f]"}`}>
                {row.vsPreferredPct > 0 ? `this one is ${row.vsPreferredPct}% dearer per ${row.unit}` : `this one is ${Math.abs(row.vsPreferredPct)}% cheaper per ${row.unit}, check the note`}
              </span>
            )}
          </div>
        )}
        {avoid && !row.useInstead && (
          <div className="mt-1 text-[13px] text-[var(--tk-ink-soft)]">Not ordered from here. See the note, or search the product it replaces.</div>
        )}
        {row.notes && (
          <div className="mt-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">{row.notes}</div>
        )}
      </div>
      <Price row={row} />
    </div>
  )
}

export function PreferredSupplier() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<RankedRow[]>([])
  const [searched, setSearched] = useState(false)
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const q = query.trim()

  function onChange(value: string) {
    setQuery(value)
    const next = value.trim()
    if (timer.current) clearTimeout(timer.current)
    if (next.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const r = await searchPreferred(next)
        setResults(r)
        setSearched(true)
      })
    }, 250)
  }

  const order = results.filter((r) => r.role === "order")
  const avoid = results.filter((r) => r.role === "avoid")
  const suppliers = new Set(results.map((r) => r.supplier))

  return (
    <div className="space-y-5">
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-3">
        <div className="flex items-center gap-2 rounded-[14px] bg-[var(--tk-bg)] px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-[var(--tk-ink-soft)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type a product, e.g. mozzarella"
            className="w-full bg-transparent text-[17px] text-[var(--tk-charcoal)] outline-none placeholder:text-[var(--tk-ink-mute)]"
          />
          {query && (
            <button
              onClick={() => onChange("")}
              aria-label="Clear search"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[var(--tk-ink-soft)] transition hover:bg-[var(--tk-charcoal)] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!q && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 px-2">
            {QUICK.map((s) => (
              <button
                key={s}
                onClick={() => onChange(s)}
                className="rounded-full border border-[var(--tk-line)] bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[var(--tk-ink-soft)] transition hover:border-[var(--tk-sage)] hover:text-[var(--tk-charcoal)] active:scale-[0.97]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {q.length >= 2 && (
          <div className="mt-2.5 px-2 text-[13px] font-semibold text-[var(--tk-ink-soft)]">
            {isPending
              ? "Searching…"
              : results.length === 0
                ? `No matches for “${q}”`
                : `${order.length} to order, ${avoid.length} to avoid, for “${q}”`}
          </div>
        )}
      </div>

      {searched && !isPending && results.length === 0 && (
        <div className="rounded-[20px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center">
          <p className="text-[15px] font-semibold text-[var(--tk-charcoal)]">Nothing on the supplier forms for &ldquo;{q}&rdquo;.</p>
          <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">
            Try a shorter word (&ldquo;mozz&rdquo;, not the brand). Only Bidfood, Fermex, Provedores, Fino and Cheese Time are on the forms. For produce, bread and coffee use{" "}
            <Link href="/kitchen/prices" className="font-semibold underline">Price check</Link>, which reads the invoices.
          </p>
        </div>
      )}

      {order.length > 0 && (
        <section className="overflow-hidden rounded-[20px] border border-[var(--tk-line)] bg-white">
          <div className="flex items-center gap-2 border-b border-[var(--tk-line)] bg-[var(--tk-done-soft)] px-5 py-3">
            <CheckCircle2 className="h-5 w-5 text-[var(--tk-done)]" />
            <h2 className="text-[16px] font-semibold text-[var(--tk-done)]">Order from here</h2>
          </div>
          <div className="divide-y divide-[var(--tk-line)]">
            {order.map((r) => <Row key={r.id} row={r} bySupplierOnly={suppliers.size === 1} />)}
          </div>
        </section>
      )}

      {avoid.length > 0 && (
        <section className="overflow-hidden rounded-[20px] border border-[var(--tk-line)] bg-white">
          <div className="flex items-center gap-2 border-b border-[var(--tk-line)] bg-[var(--tk-warn-soft)] px-5 py-3">
            <Ban className="h-5 w-5 text-[var(--tk-warn)]" />
            <h2 className="text-[16px] font-semibold text-[var(--tk-warn)]">Not from here</h2>
            <span className="ml-auto text-[12px] text-[var(--tk-ink-soft)]">On the book, but we chose another source</span>
          </div>
          <div className="divide-y divide-[var(--tk-line)]">
            {avoid.map((r) => <Row key={r.id} row={r} bySupplierOnly={suppliers.size === 1} />)}
          </div>
        </section>
      )}
    </div>
  )
}
