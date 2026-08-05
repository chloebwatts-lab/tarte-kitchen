"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Blend,
  Coffee,
  CookingPot,
  Dices,
  Droplets,
  Flame,
  LayoutGrid,
  Microwave,
  Refrigerator,
  Search,
  Snowflake,
  Wrench,
} from "lucide-react"
import { CATEGORY_LABEL, type AssetCategory } from "@/lib/maintenance/constants"

export interface FixAssetRow {
  slug: string
  name: string
  aliases: string[]
  location: string
  category: string
  manufacturer: string | null
  photoUrl: string | null
  openIssues: number
  hasSafetyIssue: boolean
}

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  dishwasher: Droplets,
  refrigeration: Refrigerator,
  freezer: Snowflake,
  "ice-machine": Dices,
  "gas-cooking": Flame,
  fryer: CookingPot,
  oven: Microwave,
  coffee: Coffee,
  "mixer-blender": Blend,
  other: Wrench,
}

/** Order the tiles the way staff think, most-broken things first. */
const CATEGORY_ORDER = [
  "dishwasher",
  "gas-cooking",
  "fryer",
  "oven",
  "refrigeration",
  "freezer",
  "ice-machine",
  "coffee",
  "mixer-blender",
  "other",
]

export function FixAssetList({ assets }: { assets: FixAssetRow[] }) {
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<string | null>(null)

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of assets) counts.set(a.category, (counts.get(a.category) ?? 0) + 1)
    return CATEGORY_ORDER.filter((c) => counts.has(c)).map((c) => ({
      key: c,
      count: counts.get(c)!,
    }))
  }, [assets])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return assets
      .filter((a) => !cat || a.category === cat)
      .filter(
        (a) =>
          !needle ||
          [a.name, a.slug, a.location, a.manufacturer ?? "", ...a.aliases]
            .join(" ")
            .toLowerCase()
            .includes(needle)
      )
  }, [assets, q, cat])

  const byLocation = useMemo(() => {
    const groups = new Map<string, FixAssetRow[]>()
    for (const a of filtered) {
      const list = groups.get(a.location) ?? []
      list.push(a)
      groups.set(a.location, list)
    }
    return Array.from(groups.entries())
  }, [filtered])

  return (
    <div className="space-y-6">
      {/* ── What kind of machine? ── */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        <button
          onClick={() => setCat(null)}
          className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition ${
            cat === null
              ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
              : "border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)]"
          }`}
        >
          <LayoutGrid className="h-8 w-8" strokeWidth={1.6} />
          <span className="text-[14px] font-semibold leading-tight">Everything</span>
        </button>
        {categories.map(({ key, count }) => {
          const Icon = CATEGORY_ICON[key] ?? Wrench
          const active = cat === key
          return (
            <button
              key={key}
              onClick={() => setCat(active ? null : key)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition ${
                active
                  ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
                  : "border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)] hover:border-[var(--tk-sage)]"
              }`}
            >
              <Icon className="h-8 w-8" strokeWidth={1.6} />
              <span className="text-center text-[14px] font-semibold leading-tight">
                {CATEGORY_LABEL[key as AssetCategory] ?? key}
              </span>
              <span className={`text-[11px] ${active ? "text-white/70" : "text-[var(--tk-ink-mute)]"}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--tk-ink-mute)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Or search: “big oven”, “Meiko”, “B07”…"
          className="w-full rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] py-4 pl-12 pr-4 text-[17px] text-[var(--tk-ink)] outline-none focus:border-[var(--tk-sage)]"
        />
      </div>

      {byLocation.map(([location, rows]) => (
        <div key={location}>
          <div className="tk-caps mb-2 px-1 text-[13px] text-[var(--tk-ink-mute)]">
            {location}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {rows.map((a) => (
              <Link
                key={a.slug}
                href={`/kitchen/fix/${a.slug}`}
                className="flex items-center gap-4 rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 shadow-sm transition hover:border-[var(--tk-sage)] active:scale-[0.99]"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--tk-sage-soft)]">
                  {a.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Wrench className="h-6 w-6 text-[var(--tk-charcoal)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]">
                    {a.name}
                  </div>
                  <div className="mt-0.5 text-[13px] text-[var(--tk-ink-soft)]">
                    {a.slug} · {CATEGORY_LABEL[a.category as AssetCategory] ?? a.category}
                    {a.manufacturer ? ` · ${a.manufacturer}` : ""}
                  </div>
                </div>
                {a.hasSafetyIssue ? (
                  <span className="flex items-center gap-1 rounded-full bg-[#fdecea] px-3 py-1 text-[12px] font-semibold text-[#b3362a]">
                    <AlertTriangle className="h-3.5 w-3.5" /> fault
                  </span>
                ) : a.openIssues > 0 ? (
                  <span className="rounded-full bg-[var(--tk-warn-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--tk-warn)]">
                    {a.openIssues} open
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-8 text-center text-[var(--tk-ink-soft)]">
          Nothing matches. Try another word, tap a different category, or ask the
          manager to add the machine.
        </div>
      )}
    </div>
  )
}
