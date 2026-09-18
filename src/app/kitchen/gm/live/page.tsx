export const dynamic = "force-dynamic"

import { requireGm } from "@/lib/gm-auth"
import { getGmLive } from "@/lib/actions/gm"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

const money = (n: number) => `$${n.toLocaleString("en-AU")}`
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
          <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">COGS so far: invoices in against sales in</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Invoiced so far" value={money(c.spent)} />
            <Tile label={`Sales so far (${c.revenueDays} ${c.revenueDays === 1 ? "day" : "days"} in)`} value={c.revenue != null ? money(c.revenue) : "not in yet"} />
            <Tile label="So far, % of sales" value={c.actualPct != null ? `${c.actualPct}%` : "not yet"} warn={c.actualPct != null && c.actualPct > c.targetPct} />
            <Tile label={`Week budget at ${c.targetPct}%`} value={c.budget != null ? money(c.budget) : "no forecast"} />
          </div>
          <p className="text-[14px] text-[var(--tk-ink-mute)]">Real invoices against real sales, nothing projected. Wednesday and Friday carry the big deliveries, so the % reads high early in the week and settles by Monday. Judge it on Monday, act on the supplier lines below any day.</p>
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
          <p className="text-[14px] text-[var(--tk-ink-mute)]">A supplier in red is already past a quarter over its usual full week. Ask why before the next order goes in.</p>
        </section>
      ) : null}

      {live.wages.length ? (
        <section className="space-y-4 rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
          <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">Wages: where this week is heading</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {live.wages.map((w) => (
              <div key={w.label} className={`rounded-[14px] border p-4 ${w.status === "red" ? "border-[var(--tk-warn)] bg-[var(--tk-warn-soft)]" : w.status === "amber" ? "border-[var(--tk-gold)] bg-[var(--tk-gold-soft)]" : "border-[var(--tk-line)] bg-[var(--tk-bg)]"}`}>
                <div className="text-[14px] font-semibold text-[var(--tk-ink-soft)]">{w.label}</div>
                <div className="mt-1 text-[28px] font-bold leading-none tabular-nums text-[var(--tk-ink)]">{w.pct || "not yet"}</div>
                <div className="mt-1.5 text-[13px] text-[var(--tk-ink-soft)]">Target {w.target}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
          <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">Wages, live</h2>
          <p className="mt-1 text-[16px] text-[var(--tk-ink-soft)]">Coming when Tarte Shifts is running the rosters. Until then the settled weekly wage % is on your desk and the Tracking page, a few days after each week closes.</p>
        </section>
      )}
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
