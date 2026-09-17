"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { saveGmMonthly, type GmMonth } from "@/lib/actions/gm"

const AGENDA: [string, string][] = [
  ["0 to 10", "Numbers. Reds first."],
  ["10 to 25", "Staff. Who is flying, who is struggling, who is leaving, what the pulse said."],
  ["25 to 40", "Kitchen and quality. Label walks, prep, portions, what guests keep saying."],
  ["40 to 50", "Deadlines. Done, slipped, blocked."],
  ["50 to 60", "Next month's three priorities. You name them, Chloe agrees them."],
]

export function GmMonthSheet({ month }: { month: GmMonth }) {
  return (
    <div className="space-y-7 pb-16">
      <div className="px-1">
        <h1 className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(34px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-0.025em" }}>
          {month.thisLabel} sheet
        </h1>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Bring this to the monthly sit-down with Chloe. The app fills in everything it can see. You add three numbers at the bottom.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)]">
        <table className="w-full min-w-[560px] text-left text-[16px]">
          <thead>
            <tr className="bg-[var(--tk-sage-soft)] text-[13px] uppercase tracking-[0.07em] text-[var(--tk-ink-soft)]">
              <th className="px-4 py-3 font-bold">KPI</th>
              <th className="px-4 py-3 font-bold">Target</th>
              <th className="px-4 py-3 font-bold">{month.thisLabel}</th>
              <th className="px-4 py-3 font-bold">{month.lastLabel}</th>
            </tr>
          </thead>
          <tbody>
            {month.rows.map((r) => (
              <tr key={r.label} className="border-t border-[var(--tk-line)]">
                <td className="px-4 py-3 font-semibold text-[var(--tk-ink)]">{r.label}</td>
                <td className="px-4 py-3 text-[var(--tk-ink-soft)]">{r.target}</td>
                <td className="px-4 py-3 font-bold tabular-nums text-[var(--tk-ink)]">{r.thisMonth || <span className="font-normal text-[var(--tk-ink-mute)]">not yet</span>}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--tk-ink-soft)]">{r.lastMonth || <span className="text-[var(--tk-ink-mute)]">none</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <h2 className="px-1 text-[14px] font-bold uppercase tracking-[0.09em] text-[var(--tk-ink-mute)]">Only you know these</h2>
        {month.manual.map((m) => <ManualRow key={m.slug} row={m} lastLabel={month.lastLabel} />)}
      </section>

      <section className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
        <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">The 60 minutes</h2>
        <dl className="mt-3 grid grid-cols-[84px_1fr] gap-x-4 gap-y-2 text-[16px]">
          {AGENDA.map(([t, what]) => (
            <div key={t} className="contents">
              <dt className="font-bold tabular-nums text-[var(--tk-done)]">{t}</dt>
              <dd className="text-[var(--tk-ink-soft)]">{what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

function ManualRow({ row, lastLabel }: { row: GmMonth["manual"][number]; lastLabel: string }) {
  const [v, setV] = useState(row.thisMonth)
  const [saved, setSaved] = useState(false)
  const [busy, start] = useTransition()
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4">
      <label htmlFor={`gm-month-${row.slug}`} className="min-w-[220px] flex-1">
        <div className="text-[17px] font-semibold text-[var(--tk-ink)]">{row.label}</div>
        <div className="text-[14px] text-[var(--tk-ink-soft)]">Target {row.target}. {lastLabel}: {row.lastMonth || "none"}.</div>
      </label>
      <input
        id={`gm-month-${row.slug}`}
        value={v}
        onChange={(e) => { setV(e.target.value); setSaved(false) }}
        inputMode="decimal"
        className="w-[110px] rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-bg)] px-3 py-2.5 text-center text-[19px] font-bold tabular-nums"
      />
      <button
        disabled={busy}
        onClick={() => start(async () => { await saveGmMonthly(row.slug, v); setSaved(true); router.refresh() })}
        className="rounded-[12px] bg-[var(--tk-charcoal)] px-5 py-3 text-[16px] font-semibold text-white disabled:opacity-50"
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  )
}
