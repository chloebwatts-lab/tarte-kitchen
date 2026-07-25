"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search, AlertTriangle, Wrench } from "lucide-react"
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

export function FixAssetList({ assets }: { assets: FixAssetRow[] }) {
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return assets
    return assets.filter((a) =>
      [a.name, a.slug, a.location, a.manufacturer ?? "", ...a.aliases]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  }, [assets, q])

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
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--tk-ink-mute)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search — “dishwasher”, “big oven”, “B07”…"
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
                className="flex items-center gap-4 rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 shadow-sm transition hover:border-[var(--tk-sage)]"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--tk-sage-soft)]">
                  {a.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Wrench className="h-6 w-6 text-[var(--tk-charcoal)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-semibold text-[var(--tk-charcoal)]">
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
          Nothing matches “{q}”. Try another name — or ask the manager to add the machine.
        </div>
      )}
    </div>
  )
}
