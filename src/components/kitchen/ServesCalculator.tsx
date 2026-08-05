"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Scale, Search } from "lucide-react"
import type { ServesGuideEntry } from "@/lib/actions/serves-guide"

function fmtGrams(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000
    return `${kg % 1 === 0 ? kg : kg.toFixed(kg < 10 ? 2 : 1)} kg`
  }
  return `${Math.round(g)} g`
}

function fmtPortion(g: number): string {
  return g >= 1000 ? fmtGrams(g) : `${Math.round(g)} g`
}

export function ServesCalculator({ entries }: { entries: ServesGuideEntry[] }) {
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(q))
  }, [entries, query])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--tk-ink-mute)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a prep: scramble, health bowl, beans…"
          className="w-full rounded-[16px] border border-[var(--tk-line)] bg-white py-4 pl-12 pr-4 text-[17px] text-[var(--tk-charcoal)] outline-none placeholder:text-[var(--tk-ink-mute)] focus:border-[var(--tk-sage)]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center text-[14px] text-[var(--tk-ink-soft)]">
          No prep matches that. Portions come from the recipe cards, so if a prep
          is missing here, its card has no serve size yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((e) => (
            <PrepRow
              key={e.preparationId}
              entry={e}
              open={openId === e.preparationId}
              onToggle={() =>
                setOpenId(openId === e.preparationId ? null : e.preparationId)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PrepRow({
  entry,
  open,
  onToggle,
}: {
  entry: ServesGuideEntry
  open: boolean
  onToggle: () => void
}) {
  const [weightStr, setWeightStr] = useState("")
  const [unit, setUnit] = useState<"kg" | "g">("kg")

  const weightGrams = useMemo(() => {
    const n = parseFloat(weightStr.replace(",", "."))
    if (!isFinite(n) || n <= 0) return null
    return unit === "kg" ? n * 1000 : n
  }, [weightStr, unit])

  const serves =
    weightGrams !== null ? Math.floor(weightGrams / entry.portionGrams) : null

  // Dishes that plate this prep at a different size than the headline portion
  const otherSizes = entry.dishUses.filter(
    (d) => d.isActive && Math.round(d.grams) !== Math.round(entry.portionGrams)
  )

  return (
    <div className="overflow-hidden rounded-[16px] border border-[var(--tk-line)] bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition active:scale-[0.997]"
      >
        <div className="min-w-0 flex-1">
          <div
            className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            {entry.name}
          </div>
          <div className="mt-0.5 text-[13px] text-[var(--tk-ink-soft)]">
            1 serve ≈ {fmtPortion(entry.portionGrams)} · full batch{" "}
            {fmtGrams(entry.batchWeightGrams)} = {entry.batchServes} serves
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[var(--tk-ink-mute)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--tk-line)] bg-[var(--tk-bg)] px-5 py-4">
          <div className="tk-caps mb-2" style={{ color: "var(--tk-ink-mute)" }}>
            Weight on the label
          </div>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={weightStr}
              onChange={(e) => setWeightStr(e.target.value)}
              placeholder={unit === "kg" ? "e.g. 3.2" : "e.g. 3200"}
              autoFocus
              className="w-full min-w-0 flex-1 rounded-[12px] border border-[var(--tk-line)] bg-white px-4 py-3 text-[22px] font-semibold tabular-nums text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
            />
            <div className="flex shrink-0 overflow-hidden rounded-[12px] border border-[var(--tk-line)] bg-white">
              {(["kg", "g"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className="px-4 text-[15px] font-semibold transition"
                  style={
                    unit === u
                      ? { background: "var(--tk-charcoal)", color: "white" }
                      : { color: "var(--tk-ink-soft)" }
                  }
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-end gap-3">
            <div className="tk-display text-[44px] font-bold leading-none tabular-nums text-[var(--tk-charcoal)]">
              {serves !== null ? serves : "—"}
            </div>
            <div className="pb-1 text-[14px] leading-tight text-[var(--tk-ink-soft)]">
              full serves
              <br />
              at {fmtPortion(entry.portionGrams)} each
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setUnit("kg")
              setWeightStr((entry.batchWeightGrams / 1000).toString())
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--tk-line)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--tk-ink-soft)] transition active:scale-[0.98]"
          >
            <Scale className="h-3.5 w-3.5" />
            Full batch · {fmtGrams(entry.batchWeightGrams)}
          </button>

          {otherSizes.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
                Plated at other sizes
              </div>
              {otherSizes.map((d) => (
                <div
                  key={d.dishName}
                  className="flex items-baseline justify-between gap-3 text-[14px]"
                >
                  <span className="text-[var(--tk-charcoal)]">{d.dishName}</span>
                  <span className="shrink-0 tabular-nums text-[var(--tk-ink-soft)]">
                    {fmtPortion(d.grams)}
                    {weightGrams !== null &&
                      ` → ${Math.floor(weightGrams / d.grams)} serves`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {entry.portionSource === "dish" && (
            <p className="mt-3 text-[12px] leading-snug text-[var(--tk-ink-mute)]">
              Serve size taken from how the dish plates it, because this prep&apos;s
              recipe card doesn&apos;t list a per-serve yield.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
