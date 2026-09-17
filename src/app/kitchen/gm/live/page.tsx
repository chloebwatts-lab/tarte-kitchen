export const dynamic = "force-dynamic"

import { requireGm } from "@/lib/gm-auth"
import { getGmLive } from "@/lib/actions/gm"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

const money = (n: number) => `$${n.toLocaleString("en-AU")}`
const PACE: Record<string, { text: string; cls: string }> = {
  "on-track": { text: "On track", cls: "bg-[var(--tk-done-soft)] text-[var(--tk-done)]" },
  watch: { text: "Watch it", cls: "bg-[var(--tk-gold-soft)] text-[var(--tk-ink)]" },
  over: { text: "Heading over", cls: "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]" },
  "no-forecast": { text: "No sales forecast yet", cls: "bg-[var(--tk-charcoal-soft)] text-[var(--tk-ink-soft)]" },
}

export default async function GmLivePage() {
  await requireGm("/kitchen/gm/live")
  const live = await getGmLive()
  const c = live.cogs
  const max = c ? Math.max(1, ...c.daily.map((d) => d.amount)) : 1
  return (
    <div className="mx-auto max-w-[860px] space-y-7 pb-16">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver", href: "/kitchen/gm" }, { label: "Live" }]} />
      <div className="px-1">
        <h1 className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(34px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-0.025em" }}>Live, this week</h1>
        <p className="mt-2 text-[16px] text-[var(--tk-ink-soft)]">Burleigh, trading week {live.weekLabel}. Updates through the day as invoices and sales come in.</p>
      </div>

      {c ? (
        <section className="space-y-4 rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">COGS: what we have spent</h2>
            <span className={`rounded-full px-3 py-1 text-[14px] font-bold ${PACE[c.pace].cls}`}>{PACE[c.pace].text}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Spent so far" value={money(c.spent)} />
            <Tile label={`Budget at ${c.targetPct}%`} value={c.budget != null ? money(c.budget) : "not yet"} />
            <Tile label="Left to spend" value={c.remaining != null ? money(c.remaining) : "not yet"} warn={c.remaining != null && c.remaining < 0} />
            <Tile label="Heading for" value={c.projectedPct != null ? `${c.projectedPct}%` : "not yet"} warn={c.projectedPct != null && c.projectedPct > c.targetPct} />
          </div>
          <div>
            <div className="mb-2 text-[14px] text-[var(--tk-ink-mute)]">Invoices by day</div>
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {c.daily.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[12px] tabular-nums text-[var(--tk-ink-soft)]">{d.amount ? money(d.amount) : ""}</div>
                  <div className="w-full rounded-t-[6px] bg-[var(--tk-sage)]" style={{ height: `${Math.max(2, (d.amount / max) * 80)}px` }} />
                  <div className="text-[13px] font-semibold text-[var(--tk-ink-soft)]">{d.day}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[16px]">
              <thead>
                <tr className="text-[13px] uppercase tracking-[0.07em] text-[var(--tk-ink-mute)]">
                  <th className="py-2 font-bold">Supplier</th><th className="py-2 font-bold">This week</th><th className="py-2 font-bold">Usual week</th>
                </tr>
              </thead>
              <tbody>
                {c.suppliers.map((s) => (
                  <tr key={s.supplier} className="border-t border-[var(--tk-line)]">
                    <td className="py-2.5 font-semibold text-[var(--tk-ink)]">{s.supplier}</td>
                    <td className={`py-2.5 tabular-nums ${s.usual != null && s.amount > s.usual * 1.25 ? "font-bold text-[var(--tk-warn)]" : "text-[var(--tk-ink)]"}`}>{money(s.amount)}</td>
                    <td className="py-2.5 tabular-nums text-[var(--tk-ink-soft)]">{s.usual != null ? money(s.usual) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[14px] text-[var(--tk-ink-mute)]">A supplier in red is running more than a quarter over its usual week. Ask why before the next order goes in.</p>
        </section>
      ) : null}

      <section className="space-y-4 rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
        <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">Wages: where this week is heading</h2>
        {live.wages.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {live.wages.map((w) => (
              <div key={w.label} className={`rounded-[14px] border p-4 ${w.status === "red" ? "border-[var(--tk-warn)] bg-[var(--tk-warn-soft)]" : w.status === "amber" ? "border-[var(--tk-gold)] bg-[var(--tk-gold-soft)]" : "border-[var(--tk-line)] bg-[var(--tk-bg)]"}`}>
                <div className="text-[14px] font-semibold text-[var(--tk-ink-soft)]">{w.label}</div>
                <div className="mt-1 text-[28px] font-bold leading-none tabular-nums text-[var(--tk-ink)]">{w.pct || "not yet"}</div>
                <div className="mt-1.5 text-[13px] text-[var(--tk-ink-soft)]">Target {w.target}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-[16px] text-[var(--tk-ink-soft)]">No live wage reading yet this week.</p>}
        <p className="text-[14px] text-[var(--tk-ink-mute)]">An estimate from Deputy: hours worked so far plus the rest of the roster, against sales so far plus forecast. It tends to read a little under final payroll. The settled number is on your desk each week.</p>
      </section>
    </div>
  )
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-[14px] border p-4 ${warn ? "border-[var(--tk-warn)] bg-[var(--tk-warn-soft)]" : "border-[var(--tk-line)] bg-[var(--tk-bg)]"}`}>
      <div className="text-[14px] font-semibold text-[var(--tk-ink-soft)]">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-none tabular-nums text-[var(--tk-ink)]">{value}</div>
    </div>
  )
}
