export const dynamic = "force-dynamic"

import { requireBurleighSales } from "@/lib/sales/burleigh-sales-auth"
import { loadBurleighDaily } from "@/lib/sales/burleigh-sales-data"
import { fmtPctChange, weekdayShort } from "@/lib/sales/compare"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-AU")}`
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

/** Burleigh daily sales, the basics (Chloe, 23 Nov 2026, for Vinicius). */
export default async function BurleighSalesPage() {
  await requireBurleighSales()
  const s = await loadBurleighDaily()
  const lastDay = weekdayShort(s.today)
  return (
    <div className="mx-auto max-w-[860px] space-y-7 pb-16">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Burleigh sales" }]} />
      <div className="px-1">
        <h1 className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(34px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-0.025em" }}>Burleigh sales</h1>
        <p className="mt-2 text-[16px] text-[var(--tk-ink-soft)]">From Square. Net sales ex GST on paid orders, the same figure as Square&apos;s net sales. Today updates every half hour.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Today so far" value={s.todaySoFar != null ? money(s.todaySoFar) : "nothing yet"} sub={s.todayOrders != null ? `${s.todayOrders} orders` : ""} />
        <Tile label={`Last ${lastDay}, full day`} value={s.sameDayLastWeek != null ? money(s.sameDayLastWeek) : "no sales"} sub="to read today against" />
        <Tile
          label={s.weekDoneDays > 0 ? `This week, ${s.weekDoneDays} ${s.weekDoneDays === 1 ? "day" : "days"} done` : "This week"}
          value={s.weekDoneDays > 0 ? money(s.weekDone) : "starts today"}
          sub={s.weekVsLastWeekPct != null ? `${fmtPctChange(s.weekVsLastWeekPct)} on the same days last week` : s.weekDoneDays > 0 ? "" : "the week runs Wed to Tue"}
          warn={s.weekVsLastWeekPct != null && s.weekVsLastWeekPct <= -10}
        />
        <Tile label="Last week, Wed to Tue" value={s.lastWeekTotal != null ? money(s.lastWeekTotal) : "no sales"} sub="" />
      </section>

      <section className="space-y-3 rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
        <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">Last two weeks, day by day</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[16px]">
            <thead>
              <tr className="text-[13px] uppercase tracking-[0.07em] text-[var(--tk-ink-mute)]">
                <th className="py-2 font-bold">Day</th>
                <th className="py-2 text-right font-bold">Sales</th>
                <th className="py-2 text-right font-bold">Orders</th>
                <th className="py-2 text-right font-bold">Week before</th>
              </tr>
            </thead>
            <tbody>
              {s.days.map((d) => (
                <tr key={d.date} className={`border-t border-[var(--tk-line)] ${d.isToday ? "bg-[var(--tk-bg)]" : ""}`}>
                  <td className="py-2.5 font-semibold text-[var(--tk-ink)]">{d.isToday ? "Today so far" : dayLabel(d.date)}</td>
                  <td className="py-2.5 text-right font-bold tabular-nums text-[var(--tk-ink)]">{d.total != null ? money(d.total) : d.isToday ? "" : "closed"}</td>
                  <td className="py-2.5 text-right tabular-nums text-[var(--tk-ink-soft)]">{d.orders ?? ""}</td>
                  <td className="py-2.5 text-right tabular-nums text-[var(--tk-ink-soft)]">
                    {d.lastWeek != null ? money(d.lastWeek) : ""}
                    {d.vsLastWeekPct != null ? (
                      <span className={`ml-2 font-semibold ${d.vsLastWeekPct <= -10 ? "text-[var(--tk-warn)]" : "text-[var(--tk-ink-soft)]"}`}>{fmtPctChange(d.vsLastWeekPct)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[14px] text-[var(--tk-ink-mute)]">&quot;Week before&quot; is the same weekday seven days earlier, with the change in sales. A day 10% or more down shows in red.</p>
      </section>
    </div>
  )
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`rounded-[14px] border p-4 ${warn ? "border-[var(--tk-warn)] bg-[var(--tk-warn-soft)]" : "border-[var(--tk-line)] bg-[var(--tk-card)]"}`}>
      <div className="text-[14px] font-semibold text-[var(--tk-ink-soft)]">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-none tabular-nums text-[var(--tk-ink)]">{value}</div>
      {sub ? <div className="mt-1.5 text-[13px] text-[var(--tk-ink-soft)]">{sub}</div> : null}
    </div>
  )
}
