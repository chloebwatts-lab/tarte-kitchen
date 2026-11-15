export const dynamic = "force-dynamic"
export const revalidate = 0

import { requireNumbers } from "@/lib/numbers-auth"
import { NUMBERS_HREF } from "@/lib/numbers-access"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { AutoRefresh } from "@/components/kitchen/AutoRefresh"
import { getLiveLabourSnapshot } from "@/lib/actions/labour-live"
import { getCurrentWeekSpend } from "@/lib/spend/current-week"
import type { LiveVenueSnapshot } from "@/lib/labour/live"
import type { BucketSpendData } from "@/lib/spend/types"

/**
 * Wages + COGS, live (Chloe, 15 Nov 2026). Chloe and Shawna only: the gate
 * is requireNumbers (managers password, then numbers-auth). Read only, no
 * server actions, so nothing here can be called from outside the page.
 * Same engines as /labour/live and /spend, so the numbers always agree.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`
const pct = (n: number | null, d = 1) => (n == null ? "n/a" : `${n.toFixed(d)}%`)

const TONE = {
  ok: { bg: "var(--tk-done-soft)", fg: "var(--tk-done)" },
  amber: { bg: "var(--tk-gold-soft)", fg: "var(--tk-charcoal)" },
  red: { bg: "var(--tk-warn-soft)", fg: "var(--tk-warn)" },
  none: { bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" },
} as const
type Tone = keyof typeof TONE

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[14px] font-semibold tabular-nums" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>
      {children}
    </span>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--tk-line)] py-2.5">
      <div className="min-w-0">
        <div className="text-[16px] font-semibold">{label}</div>
        {sub && <div className="text-[13px] leading-snug text-[var(--tk-ink-soft)]">{sub}</div>}
      </div>
      <div className="shrink-0 text-[18px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Big({ value, caption }: { value: string; caption: string }) {
  return (
    <div>
      <div className="tk-display leading-none tabular-nums" style={{ fontSize: 52, fontWeight: 600, letterSpacing: "-0.03em" }}>{value}</div>
      <div className="mt-1.5 text-[14px] text-[var(--tk-ink-soft)]">{caption}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] p-5 md:p-6">
      <h2 className="tk-display mb-3 text-[22px] font-bold leading-tight" style={{ letterSpacing: "-0.02em" }}>{title}</h2>
      {children}
    </section>
  )
}

function dayRange(days: number): string {
  const names = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]
  if (days <= 0) return ""
  return days === 1 ? "Wed" : `Wed to ${names[Math.min(days, 7) - 1]}`
}

function WageCard({ v }: { v: LiveVenueSnapshot }) {
  const bandTone = (s: string): Tone => (s === "ok" ? "ok" : s === "amber" ? "amber" : s === "red" ? "red" : "none")
  return (
    <Card title={v.label}>
      <Big value={pct(v.overallProjectedPct)} caption={`Wage % for the week, forecast. ${money(v.labourProjected)} wages on ${money(v.revenueProjected)}`} />
      <div className="mt-4">
        {v.locked.days > 0 ? (
          <Row
            label={`Locked in, ${dayRange(v.locked.days)}`}
            sub={`Actual: ${money(v.locked.labour)} wages on ${money(v.locked.revenue)} revenue`}
            value={pct(v.locked.pct)}
          />
        ) : (
          <Row label="Locked in" sub="First day of the week. Nothing is final until tomorrow" value="n/a" />
        )}
        <Row
          label="Today so far"
          sub={
            v.today.revenueSoFar > 0
              ? `${money(v.today.labourSoFar)} clocked, ${money(v.today.revenueSoFar)} taken${v.today.live && v.today.shareOfDayDone != null ? `. Usually ${Math.round(v.today.shareOfDayDone * 100)}% of the day is in by now` : ""}`
              : `${money(v.today.labourSoFar)} clocked. No till figure yet`
          }
          value={v.today.revenueSoFar > 0 ? pct((v.today.labourSoFar / v.today.revenueSoFar) * 100) : "n/a"}
        />
        {v.buckets.map((b) => (
          <div key={b.key} className="flex items-center justify-between gap-3 border-t border-[var(--tk-line)] py-2.5">
            <div className="min-w-0">
              <div className="text-[16px] font-semibold">{b.label}</div>
              <div className="text-[13px] text-[var(--tk-ink-soft)]">
                Band {b.target ? `${b.target.min} to ${b.target.max}%` : "not set"}
                {b.varianceVsBandPct != null && b.varianceVsBandPct > 0 ? `, ${b.varianceVsBandPct.toFixed(1)} over` : ""}
              </div>
            </div>
            <Chip tone={bandTone(b.status)}>{pct(b.projectedPct)}</Chip>
          </div>
        ))}
      </div>
    </Card>
  )
}

function CogsCard({ b }: { b: BucketSpendData }) {
  const projectedPct = b.projectedRevenueExGst && b.projectedRevenueExGst > 0 ? (b.projectedEndOfWeek / b.projectedRevenueExGst) * 100 : null
  const tone: Tone = b.paceStatus === "on-track" ? "ok" : b.paceStatus === "watch" ? "amber" : b.paceStatus === "over" ? "red" : "none"
  const paceLabel = b.paceStatus === "on-track" ? "On track" : b.paceStatus === "watch" ? "Watch" : b.paceStatus === "over" ? "Over" : "No forecast"
  return (
    <Card title={b.label}>
      <div className="flex items-start justify-between gap-3">
        <Big
          value={pct(projectedPct)}
          caption={`COGS % for the week, forecast. Target ${pct(b.targetPct)}${b.projectedRevenueExGst ? `. ${money(b.projectedEndOfWeek)} on ${money(b.projectedRevenueExGst)}` : ""}`}
        />
        <Chip tone={tone}>{paceLabel}</Chip>
      </div>
      <div className="mt-4">
        <Row
          label="Spent so far"
          sub={`${money(b.spentToDate)} invoiced${b.estimatedUninvoiced > 0 ? `, ${money(b.estimatedUninvoiced)} delivered and not invoiced yet` : ""}`}
          value={money(b.estimatedSpentToDate)}
        />
        {b.overdueGap > 0 && (
          <Row label="Overdue invoices" sub={b.overdueGapRows.slice(0, 3).map((r) => r.supplier).join(", ")} value={money(b.overdueGap)} />
        )}
        <Row label="Usually still to come" sub="Deliveries that normally land before Tuesday close" value={money(b.usualStillToCome)} />
        <Row
          label="Left to spend"
          sub={b.budget != null ? `Budget ${money(b.budget)} at target` : "No budget until there is a forecast"}
          value={b.leftToSpend == null ? "n/a" : `${b.leftToSpend < 0 ? "-" : ""}${money(Math.abs(b.leftToSpend))}`}
        />
        <Row
          label="Takings counted"
          sub={`${b.revenueDaysReported} finished day${b.revenueDaysReported === 1 ? "" : "s"}, tills ex GST${b.todaySoFarExGst != null ? `. Today so far ${money(b.todaySoFarExGst)}` : ""}`}
          value={b.revenueToDateExGst == null ? "n/a" : money(b.revenueToDateExGst)}
        />
        {b.revenueNotes.map((n) => (
          <p key={n} className="border-t border-[var(--tk-line)] pt-2.5 text-[13px] leading-snug text-[var(--tk-ink-soft)]">{n}</p>
        ))}
      </div>
    </Card>
  )
}

export default async function WagesCogsPage() {
  await requireNumbers(NUMBERS_HREF)
  const [labour, spend] = await Promise.all([getLiveLabourSnapshot(), getCurrentWeekSpend()])
  const asOf = new Date().toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", hour: "numeric", minute: "2-digit" })
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <AutoRefresh seconds={300} />
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Wages + COGS" }]} />
      <div>
        <h1 className="tk-display text-[34px] font-semibold leading-tight" style={{ letterSpacing: "-0.03em" }}>Wages + COGS</h1>
        <p className="mt-1 text-[15px] text-[var(--tk-ink-soft)]">
          Week {labour.weekLabel}. As of {asOf}, refreshes itself every 5 minutes. Only you and Shawna can open this.
        </p>
      </div>

      <h2 className="tk-display pt-1 text-[24px] font-bold" style={{ letterSpacing: "-0.02em" }}>Wages</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {labour.venues.map((v) => (
          <WageCard key={v.venue} v={v} />
        ))}
      </div>

      <h2 className="tk-display pt-2 text-[24px] font-bold" style={{ letterSpacing: "-0.02em" }}>COGS</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {spend.buckets.map((b) => (
          <CogsCard key={b.bucket} b={b} />
        ))}
      </div>

      <div className="rounded-[16px] border border-[var(--tk-line)] bg-white p-4 text-[14px] leading-relaxed text-[var(--tk-ink-soft)]">
        <p className="font-semibold text-[var(--tk-charcoal)]">How to read it</p>
        <p className="mt-1">
          Locked in is the one to trust: clocked hours and salaries for the finished days against the money actually taken, nothing forecast. The week forecast
          adds today as a full day plus the roster and the usual takings for the days left. Wages include super and on-costs. Wage revenue is tills, Uber and
          events, ex GST. COGS is invoices against till takings, the same figures as Live spend.
        </p>
        <p className="mt-1">Clock-ins update every 15 minutes, tills every 30, invoices every 2 hours. A timesheet nobody has clocked is not in the wages until it is fixed in Shifts.</p>
      </div>
    </div>
  )
}
