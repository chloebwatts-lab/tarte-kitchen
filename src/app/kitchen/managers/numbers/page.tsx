export const dynamic = "force-dynamic"
export const revalidate = 0

import { requireNumbers } from "@/lib/numbers-auth"
import { NUMBERS_HREF } from "@/lib/numbers-access"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { AutoRefresh } from "@/components/kitchen/AutoRefresh"
import { getLiveLabourSnapshot } from "@/lib/actions/labour-live"
import { getCurrentWeekSpend } from "@/lib/spend/current-week"
import type { LiveVenueSnapshot } from "@/lib/labour/live"
import { doneRange, recoveryCopy, recoveryPlan, restRange } from "@/lib/labour/recovery"
import type { BucketSpendData } from "@/lib/spend/types"

/**
 * Wages + COGS, live (Chloe, 15 Nov 2026). Chloe, Shawna and Oliver only: the gate
 * is requireNumbers (managers password, then numbers-auth), called before
 * anything is read. Read only: the page has no buttons that write.
 * Same engines as /labour/live and /spend, so the numbers always agree.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`
const signed = (n: number | null) => (n == null ? "n/a" : `${n < 0 ? "-" : ""}${money(Math.abs(n))}`)
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

/**
 * To finish the week on target (Chloe, 23 Nov 2026): how the finished days
 * went, what the rest of the week is set to do, and the cut that gets every
 * team inside its band and the week on target. Wording is recoveryCopy
 * (src/lib/labour/recovery.ts), tested there.
 */
function RecoveryBlock({ v }: { v: LiveVenueSnapshot }) {
  const plan = recoveryPlan(v)
  if (!plan) return null
  const copy = recoveryCopy(plan, { lockedDays: v.locked.days, revenueStillToCome: v.revenueStillToCome })
  const rest = restRange(v.locked.days)
  const tone = copy.tone === "ok" ? TONE.ok : TONE.red
  return (
    <div className="mt-2 border-t-2 border-[var(--tk-line)] pt-3">
      <div className="text-[16px] font-semibold">To finish the week on {copy.target}</div>
      <div className="text-[13px] leading-snug text-[var(--tk-ink-soft)]">Target is the department bands added up, and every team is held to its own band. Paid leave out, the same as the big number</div>
      {plan.soFar && (
        <Row
          label={`${doneRange(plan.soFar.days)}, done`}
          sub={`${money(plan.soFar.wages)} wages on ${money(plan.soFar.revenue)}: ${money(Math.abs(plan.soFar.overTarget))} ${plan.soFar.overTarget > 0 ? "over" : "under"} target`}
          value={pct(plan.soFar.pct)}
        />
      )}
      <Row
        label={`${rest}, as rostered`}
        sub={`${money(plan.rest.wages)} wages on ${money(plan.rest.revenue)} takings, today so far plus the forecast. ${plan.rest.maxWagesForTarget > 0 ? `${money(plan.rest.maxWagesForTarget)} at most keeps the week on ${copy.target}` : `The days done already put the week past ${copy.target}`}`}
        value={pct(plan.rest.pct)}
      />
      <div className="mt-2 rounded-[14px] p-3 text-[15px] leading-snug" style={{ background: tone.bg, color: tone.fg }}>
        <p className="font-semibold">{copy.headline}</p>
        {copy.teams.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {copy.teams.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {copy.notes.map((n) => (
          <p key={n} className="mt-1">{n}</p>
        ))}
        {copy.week && <p className="mt-2 border-t border-[var(--tk-line)] pt-2 text-[14px]">{copy.week}</p>}
      </div>
    </div>
  )
}

function WageCard({ v }: { v: LiveVenueSnapshot }) {
  const bandTone = (s: string): Tone => (s === "ok" ? "ok" : s === "amber" ? "amber" : s === "red" ? "red" : "none")
  return (
    <Card title={v.label}>
      <Big
        value={pct(v.workingProjectedPct)}
        caption={`Wage % for the week, forecast. ${money(v.labourProjected - v.paidLeave)} wages on ${money(v.revenueProjected)}. Pay plus super only: no WorkCover, payroll tax or admin`}
      />
      <div className="mt-4">
        {v.paidLeave > 0 && (
          <Row
            label="With paid leave"
            sub={`${money(v.paidLeave)} of salary for people away all week on approved leave. Still paid, but not in the figure above or the teams below`}
            value={pct(v.overallProjectedPct)}
          />
        )}
        {v.locked.days > 0 ? (
          <Row
            label={`Locked in, ${dayRange(v.locked.days)}`}
            sub={`Actual: ${money(v.locked.labour - v.locked.paidLeave)} wages on ${money(v.locked.revenue)} revenue`}
            value={pct(v.locked.workingPct)}
          />
        ) : (
          <Row label="Locked in" sub="First day of the week. Nothing is final until tomorrow" value="n/a" />
        )}
        <div className="border-t border-[var(--tk-line)] pt-3">
          <div className="text-[16px] font-semibold">Day by day</div>
          <div className="text-[13px] leading-snug text-[var(--tk-ink-soft)]">Wages on takings ex GST. Today is the whole day&apos;s wages on takings so far, so it falls as the tills fill</div>
          <table className="mt-2 w-full text-[15px] tabular-nums">
            <tbody>
              {v.days.map((d) => (
                <tr
                  key={d.date}
                  className={d.state === "ahead" ? "text-[var(--tk-ink-mute)]" : ""}
                  style={d.state === "today" ? { background: "var(--tk-gold-soft)" } : undefined}
                >
                  <td className="rounded-l-lg py-1.5 pl-2 font-semibold">
                    {d.dayName}
                    {d.state === "today" ? ", now" : d.state === "ahead" ? ", roster" : ""}
                  </td>
                  <td className="py-1.5 text-right">{money(d.labour - d.paidLeave)}</td>
                  <td className="py-1.5 text-right">{d.revenue > 0 ? money(d.revenue) : "no takings yet"}</td>
                  <td className="rounded-r-lg py-1.5 pr-2 text-right font-semibold">{pct(d.workingPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.days
            .filter((d) => d.state === "today" && d.labourSoFar != null)
            .map((d) => (
              <div key={d.date} className="mt-1 text-[13px] text-[var(--tk-ink-soft)]">
                Today: {money((d.labourSoFar ?? 0) - d.paidLeave)} of the {money(d.labour - d.paidLeave)} is already in, {money(d.labour - (d.labourSoFar ?? 0))} still rostered to run
              </div>
            ))}
        </div>
        {v.buckets.map((b) => (
          <div key={b.key} className="flex items-center justify-between gap-3 border-t border-[var(--tk-line)] py-2.5">
            <div className="min-w-0">
              <div className="text-[16px] font-semibold">{b.label}</div>
              <div className="text-[13px] text-[var(--tk-ink-soft)]">
                Band {b.target ? `${b.target.min} to ${b.target.max}%` : "not set"}
                {b.workingVarianceVsBandPct != null && b.workingVarianceVsBandPct > 0 ? `, ${b.workingVarianceVsBandPct.toFixed(1)} over` : ""}
                {b.paidLeave > 0 ? `. ${pct(b.projectedPct)} with ${money(b.paidLeave)} paid leave` : ""}
              </div>
            </div>
            <Chip tone={bandTone(b.workingStatus)}>{pct(b.workingPct)}</Chip>
          </div>
        ))}
        <RecoveryBlock v={v} />
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
          sub={`${money(b.spentToDate)} invoiced${b.estimatedUninvoiced > 0 ? `, ${money(b.estimatedUninvoiced)} already delivered (to yesterday) with the invoice still to land` : ""}`}
          value={money(b.estimatedSpentToDate)}
        />
        {b.overdueGap > 0 && (
          <Row label="Overdue invoices" sub={b.overdueGapRows.slice(0, 3).map((r) => r.supplier).join(", ")} value={money(b.overdueGap)} />
        )}
        <Row
          label="Room to order, today to Tuesday"
          sub={b.budget != null ? `Budget ${money(b.budget)} at target, less what has come in` : "No budget until there is a forecast"}
          value={signed(b.leftBeforeStillToCome)}
        />
        <Row
          label="Normal orders still to land"
          sub={`Not ordered or delivered yet as far as invoices show: the usual top-ups for today to Tuesday${b.stillToCome.length ? `. ${b.stillToCome.slice(0, 3).map((r) => `${r.supplier} (${r.days.join(", ")})`).join(", ")}` : ""}`}
          value={money(b.usualStillToCome)}
        />
        <Row
          label="Spare on top of normal orders"
          sub="Order as usual and this is what is left. Negative means trim the usual orders by this much"
          value={signed(b.leftToSpend)}
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
          Week {labour.weekLabel}. As of {asOf}, refreshes itself every 5 minutes. Only you, Shawna and Oliver can open this.
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
        <p className="mt-1">Clock-ins update every 15 minutes, tills every 30, invoices every 2 hours, and this page reloads itself every 5. A timesheet nobody has clocked is not in the wages until it is fixed in Shifts.</p>
      </div>
    </div>
  )
}
