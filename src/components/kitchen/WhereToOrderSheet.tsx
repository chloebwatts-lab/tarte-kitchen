"use client"

import { useState } from "react"
import { ArrowRight, Ban, ClipboardList } from "lucide-react"
import type { Dept, SheetRow } from "@/lib/where-to-order/sheet"

const DEPT_LABEL: Record<Dept, string> = {
  Kitchen: "Kitchen",
  Pastry: "Pastry",
  "Coffee and bar": "Coffee & bar",
  "Front of house": "Front of house",
}

const SUPPLIER_COLOR: Record<string, string> = {
  Bidfood: "#c8102e",
  Fermex: "#1f7a4d",
  "The Provedores": "#1e3a8a",
  Eustralis: "#0f766e",
  "Son Of A Bunn": "#b45309",
  Jensens: "#4d7c0f",
  "Pacific Wholesale": "#0369a1",
  "Pixel Bread": "#6b4f2a",
  EasyVend: "#7c3aed",
  "Gold Coast Premium Foods": "#8b5cf6",
}

/** The sheet's section order (chef-facing, not A to Z). */
const SECTIONS = [
  "Bread and pastries", "Dairy and eggs", "Meat and seafood", "Fruit and veg", "Pantry", "Oils and vinegars",
  "Spices and salt", "Baking", "Nuts and chocolate", "Frozen", "Drinks", "Packaging and cleaning",
]
const sectionRank = (s: string) => (SECTIONS.indexOf(s) + 1 || 99)

function price(r: SheetRow): string {
  const pack = `$${r.price.toFixed(2)}`
  if (!r.per) return pack
  const per = r.per.unit === "ea" ? `$${r.per.price.toFixed(r.per.price < 1 ? 3 : 2)} each` : `$${r.per.price.toFixed(2)}/${r.per.unit === "l" ? "L" : r.per.unit}`
  return `${pack} (${per})`
}

/** Every word of the query in the item, product or supplier. */
export function sheetMatches(r: SheetRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = `${r.item} ${r.product} ${r.orderFrom}`.toLowerCase()
  return words.length > 0 && words.every((w) => hay.includes(w))
}

function SheetLine({ r, showDept }: { r: SheetRow; showDept: boolean }) {
  return (
    <div className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold text-[var(--tk-charcoal)]">{r.item}</span>
        {r.switched && (
          <span className="rounded-full bg-[var(--tk-gold-soft)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#8a6d1f]">Switched</span>
        )}
        {showDept && <span className="text-[11px] uppercase tracking-wide text-[var(--tk-ink-mute)]">{DEPT_LABEL[r.dept]}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px]">
        <ArrowRight className="h-3.5 w-3.5 text-[var(--tk-done)]" />
        <span
          className="rounded-full px-2.5 py-0.5 text-[12px] font-bold text-white"
          style={{ background: SUPPLIER_COLOR[r.orderFrom] ?? "#555" }}
        >
          {r.orderFrom}
        </span>
        <span className="text-[var(--tk-ink-soft)]">{r.product}</span>
        <span className="tabular-nums text-[var(--tk-ink-soft)]">{price(r)}</span>
      </div>
      {r.notFrom && (
        <div className="mt-1 flex items-center gap-2 text-[13px] text-[var(--tk-warn)]">
          <Ban className="h-3.5 w-3.5" />
          Not from {r.notFrom.supplier} ({r.notFrom.dearer} dearer)
        </div>
      )}
      {r.note && <div className="mt-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">{r.note}</div>}
    </div>
  )
}

/**
 * The 14 Nov 2026 "where to order it" sheet, the list staff were given and
 * the Wednesday check holds the invoices to. With a search it shows only
 * the matching rows, above the order-form results.
 */
export function WhereToOrderSheet({ rows, query, sheetDate }: { rows: SheetRow[]; query: string; sheetDate: string }) {
  const depts = [...new Set(rows.map((r) => r.dept))]
  const [dept, setDept] = useState<Dept>(depts[0] ?? "Kitchen")
  const q = query.trim()

  if (q.length >= 2) {
    const hits = rows.filter((r) => sheetMatches(r, q))
    if (!hits.length) return null
    return (
      <section className="overflow-hidden rounded-[20px] border border-[var(--tk-line)] bg-white">
        <div className="flex items-center gap-2 border-b border-[var(--tk-line)] bg-[var(--tk-sage-soft)] px-5 py-3">
          <ClipboardList className="h-5 w-5 text-[var(--tk-charcoal)]" />
          <h2 className="text-[16px] font-semibold text-[var(--tk-charcoal)]">On our list</h2>
          <span className="ml-auto text-[12px] text-[var(--tk-ink-soft)]">Where to order it, {sheetDate}</span>
        </div>
        <div className="divide-y divide-[var(--tk-line)]">
          {hits.map((r) => <SheetLine key={r.id} r={r} showDept />)}
        </div>
      </section>
    )
  }

  const shown = rows
    .filter((r) => r.dept === dept)
    .sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.item.localeCompare(b.item))
  const sections = [...new Set(shown.map((r) => r.section))]

  return (
    <section className="overflow-hidden rounded-[20px] border border-[var(--tk-line)] bg-white">
      <div className="border-b border-[var(--tk-line)] px-5 py-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-[var(--tk-charcoal)]" />
          <h2 className="text-[17px] font-semibold text-[var(--tk-charcoal)]">Our list, {sheetDate}</h2>
        </div>
        <p className="mt-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
          Our biggest buys and the supplier each one comes from. Every Wednesday the invoices are checked against this list.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {depts.map((d) => (
            <button
              key={d}
              onClick={() => setDept(d)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-[0.97] ${
                d === dept
                  ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
                  : "border-[var(--tk-line)] bg-white text-[var(--tk-ink-soft)] hover:border-[var(--tk-sage)] hover:text-[var(--tk-charcoal)]"
              }`}
            >
              {DEPT_LABEL[d]}
            </button>
          ))}
        </div>
      </div>
      {sections.map((s) => (
        <div key={s}>
          <div className="bg-[var(--tk-bg)] px-5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--tk-ink-mute)]">{s}</div>
          <div className="divide-y divide-[var(--tk-line)]">
            {shown.filter((r) => r.section === s).map((r) => <SheetLine key={r.id} r={r} showDept={false} />)}
          </div>
        </div>
      ))}
    </section>
  )
}
