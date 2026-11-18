export const dynamic = "force-dynamic"
export const revalidate = 0

import { requireGm } from "@/lib/gm-auth"
import { getGmLive } from "@/lib/actions/gm"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { AutoRefresh } from "@/components/kitchen/AutoRefresh"
import type { SimpleCogs, SimpleWage, Tone } from "@/lib/gm/live-simple"

/**
 * Oliver's live wages + COGS (Chloe, 18 Nov 2026). Percent only, from the
 * same engines as Chloe's Wages + COGS page, so the numbers always agree.
 * Kept deliberately short: one wage % and one COGS % per site, with the
 * department wage chips so he can see which team to look at.
 */

const TONE: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: "var(--tk-done-soft)", fg: "var(--tk-done)" },
  amber: { bg: "var(--tk-gold-soft)", fg: "var(--tk-charcoal)" },
  red: { bg: "var(--tk-warn-soft)", fg: "var(--tk-warn)" },
  none: { bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" },
}

const pct = (n: number | null) => (n == null ? "not yet" : `${n.toFixed(1)}%`)
const DAYS = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]
const doneDays = (n: number) => (n <= 1 ? "Wed" : `Wed to ${DAYS[Math.min(n, 7) - 1]}`)

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-[14px] font-semibold tabular-nums" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>
      {children}
    </span>
  )
}

function Wage({ w, showName }: { w: SimpleWage; showName: boolean }) {
  return (
    <div>
      <div className="text-[14px] font-semibold text-[var(--tk-ink-soft)]">{showName ? `Wages, ${w.label}` : "Wages"}</div>
      <div className="tk-display mt-1 leading-none tabular-nums text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}>{pct(w.pct)}</div>
      <div className="mt-1 text-[13px] text-[var(--tk-ink-soft)]">
        Week forecast{w.lockedPct != null ? `. Finished days (${doneDays(w.lockedDays)}): ${pct(w.lockedPct)}` : ""}
      </div>
      {w.depts.length ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {w.depts.map((d) => (
            <Chip key={d.label} tone={d.tone}>
              {d.label} {pct(d.pct)}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Cogs({ c }: { c: SimpleCogs }) {
  return (
    <div>
      <div className="text-[14px] font-semibold text-[var(--tk-ink-soft)]">COGS</div>
      <div className="mt-1 flex items-center gap-3">
        <div className="tk-display leading-none tabular-nums text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}>{pct(c.pct)}</div>
        <Chip tone={c.tone}>{c.status}</Chip>
      </div>
      <div className="mt-1 text-[13px] text-[var(--tk-ink-soft)]">Week forecast. Target {c.targetPct}%</div>
    </div>
  )
}

export default async function GmLivePage() {
  await requireGm("/kitchen/gm/live")
  const live = await getGmLive()
  const asOf = new Date().toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", hour: "numeric", minute: "2-digit" })
  return (
    <div className="mx-auto max-w-[860px] space-y-6 pb-16">
      <AutoRefresh seconds={300} />
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver", href: "/kitchen/gm" }, { label: "Wages + COGS" }]} />
      <div className="px-1">
        <h1 className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(34px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-0.025em" }}>Wages + COGS, live</h1>
        <p className="mt-2 text-[16px] text-[var(--tk-ink-soft)]">Week {live.weekLabel}. As of {asOf}, updates itself every 5 minutes. Percent of sales, the same numbers Chloe sees.</p>
      </div>

      {live.sites.map((s) => (
        <section key={s.key} className="rounded-[20px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] p-5 md:p-6">
          <h2 className="tk-display mb-4 text-[24px] font-bold leading-tight" style={{ letterSpacing: "-0.02em" }}>{s.label}</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-5">
              {s.wages.length ? s.wages.map((w) => <Wage key={w.venue} w={w} showName={s.wages.length > 1} />) : <p className="text-[15px] text-[var(--tk-ink-soft)]">No wages in yet this week.</p>}
            </div>
            {s.cogs ? <Cogs c={s.cogs} /> : <p className="text-[15px] text-[var(--tk-ink-soft)]">No COGS yet this week.</p>}
          </div>
        </section>
      ))}

      <p className="px-1 text-[14px] leading-relaxed text-[var(--tk-ink-mute)]">
        Green is on target, gold is just over, red is over. The week forecast is what has happened so far plus the roster and the usual takings for the days left, so it moves through the week. Wages are pay plus super.
      </p>
    </div>
  )
}
