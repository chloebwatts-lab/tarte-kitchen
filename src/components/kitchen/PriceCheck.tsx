"use client"

import { useRef, useState, useTransition } from "react"
import { Search, X, TrendingUp } from "lucide-react"
import { searchPrices, type IngredientPrices } from "@/lib/actions/price-check"

const VENUE_LABEL: Record<string, string> = {
  BURLEIGH: "Burleigh",
  BEACH_HOUSE: "Currumbin",
  TEA_GARDEN: "Tea Garden",
}
const VENUE_COLOR: Record<string, string> = {
  BURLEIGH: "#0f766e",
  BEACH_HOUSE: "#0e7490",
  TEA_GARDEN: "#7c3aed",
}

const QUICK = ["Avocado", "Butter", "Milk", "Salmon", "Eggs", "Flour"]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

export function PriceCheck() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<IngredientPrices[]>([])
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
        const r = await searchPrices(next)
        setResults(r)
        setSearched(true)
      })
    }, 250)
  }

  const total = results.length

  return (
    <div className="space-y-5">
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-3">
        <div className="flex items-center gap-2 rounded-[14px] bg-[var(--tk-bg)] px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-[var(--tk-ink-soft)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search an ingredient, e.g. avocado"
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
              : `${total === 0 ? "No matches" : `${total} item${total === 1 ? "" : "s"}`} for “${q}”`}
          </div>
        )}
      </div>

      {searched && !isPending && total === 0 && (
        <div className="rounded-[20px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center">
          <p className="text-[15px] font-semibold text-[var(--tk-charcoal)]">
            Nothing on the invoices for &ldquo;{q}&rdquo;.
          </p>
          <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">
            Try the plain name of the item (e.g. &ldquo;avocado&rdquo;, not a
            brand). Only things we&apos;ve been invoiced for show up here.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {results.map((item) => (
          <section
            key={item.ingredientId}
            className="overflow-hidden rounded-[20px] border border-[var(--tk-line)] bg-white"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--tk-line)] px-5 py-4">
              <h2 className="text-[19px] font-semibold text-[var(--tk-charcoal)]">
                {item.name}
              </h2>
              {item.varies && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tk-gold-soft)] px-3 py-1 text-[12px] font-semibold text-[#8a6d1f]">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Price differs
                </span>
              )}
            </div>
            <div className="divide-y divide-[var(--tk-line)]">
              {item.rows.map((row, i) => {
                const isCheapest =
                  item.varies && item.cheapest?.unitPrice === row.unitPrice
                return (
                  <div
                    key={`${row.venue}-${row.supplier}-${i}`}
                    className="flex items-center gap-4 px-5 py-3.5"
                  >
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold text-white"
                      style={{ background: VENUE_COLOR[row.venue] ?? "#555" }}
                    >
                      {VENUE_LABEL[row.venue] ?? row.venue}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-[var(--tk-charcoal)]">
                        {row.supplier ?? "Unknown supplier"}
                      </div>
                      <div className="text-[12px] text-[var(--tk-ink-soft)]">
                        {row.lastDescription} · last {fmtDate(row.lastSeen)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="text-[17px] font-semibold text-[var(--tk-charcoal)]">
                        ${row.unitPrice.toFixed(2)}
                        <span className="ml-0.5 text-[12px] font-normal text-[var(--tk-ink-soft)]">
                          /{row.unit ?? "unit"}
                        </span>
                      </div>
                      {isCheapest && (
                        <div className="text-[11px] font-semibold text-[var(--tk-done)]">
                          cheapest
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
