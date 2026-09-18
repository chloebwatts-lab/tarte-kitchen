export const dynamic = "force-dynamic"

import { Star } from "lucide-react"
import { requireGm } from "@/lib/gm-auth"
import { getGmReviews } from "@/lib/actions/gm"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export default async function GmReviewsPage() {
  await requireGm("/kitchen/gm/reviews")
  const r = await getGmReviews()
  return (
    <div className="mx-auto max-w-[860px] space-y-7 pb-16">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver", href: "/kitchen/gm" }, { label: "Reviews" }]} />
      <div className="px-1">
        <h1 className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(34px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-0.025em" }}>Google reviews, last 4 weeks</h1>
        <p className="mt-2 text-[16px] text-[var(--tk-ink-soft)]">Burleigh. Negative first, because that is where the fix is. Replies are drafted for Chloe. Your job is the cause.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Negative (1 to 3 stars)" value={r.negative.length} warn={r.negative.length > 0} />
        <Stat label="Positive (4 to 5 stars)" value={r.positive.length} />
        <Stat label="Five stars this month" value={r.fiveStarThisMonth} sub="of 20" />
      </div>

      {r.themes.length ? (
        <section className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
          <h2 className="text-[17px] font-bold text-[var(--tk-ink)]">What people keep saying</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.themes.map((t) => (
              <span key={t.theme} className={`rounded-full px-3.5 py-2 text-[14px] font-semibold ${t.negative > t.positive ? "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]" : "bg-[var(--tk-done-soft)] text-[var(--tk-done)]"}`}>
                {t.theme} <span className="font-normal">{t.positive} good, {t.negative} bad</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <Group title={`Negative (${r.negative.length})`} rows={r.negative} tone="warn" empty="No negative reviews in the last 4 weeks." />
      <Group title={`Positive (${r.positive.length})`} rows={r.positive} empty="No positive reviews in the last 4 weeks." />
    </div>
  )
}

function Stat({ label, value, sub, warn }: { label: string; value: number; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-[14px] border p-4 ${warn ? "border-[var(--tk-warn)] bg-[var(--tk-warn-soft)]" : "border-[var(--tk-line)] bg-[var(--tk-card)]"}`}>
      <div className="text-[13px] font-semibold text-[var(--tk-ink-soft)]">{label}</div>
      <div className="mt-1 text-[30px] font-bold leading-none tabular-nums text-[var(--tk-ink)]">{value}{sub ? <span className="ml-1 text-[14px] font-normal text-[var(--tk-ink-mute)]">{sub}</span> : null}</div>
    </div>
  )
}

function Group({ title, rows, tone, empty }: { title: string; rows: Awaited<ReturnType<typeof getGmReviews>>["negative"]; tone?: "warn"; empty: string }) {
  return (
    <section className="space-y-3">
      <h2 className={`px-1 text-[14px] font-bold uppercase tracking-[0.09em] ${tone === "warn" ? "text-[var(--tk-warn)]" : "text-[var(--tk-ink-mute)]"}`}>{title}</h2>
      {rows.length === 0 ? <p className="px-1 text-[16px] text-[var(--tk-ink-soft)]">{empty}</p> : null}
      {rows.map((x) => (
        <div key={x.id} className={`rounded-[14px] border p-4 ${tone === "warn" ? "border-[var(--tk-warn)] bg-[var(--tk-card)]" : "border-[var(--tk-line)] bg-[var(--tk-card)]"}`}>
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--tk-ink)]">
            <span className="inline-flex items-center gap-0.5">{x.rating}<Star className="h-3.5 w-3.5 fill-current" /></span>
            <span>{x.who}</span>
            <span className="font-normal text-[var(--tk-ink-mute)]">{x.when}</span>
            {x.themes.map((t) => <span key={t} className="rounded-full bg-[var(--tk-charcoal-soft)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--tk-ink-soft)]">{t}</span>)}
            {x.staff.map((t) => <span key={t} className="rounded-full bg-[var(--tk-gold-soft)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--tk-ink)]">{t}</span>)}
            {x.replied ? <span className="ml-auto text-[12px] font-semibold text-[var(--tk-done)]">Replied</span> : x.rating <= 3 ? <span className="ml-auto text-[12px] font-semibold text-[var(--tk-warn)]">No reply yet</span> : null}
          </div>
          {x.text ? <p className="mt-2 text-[16px] leading-snug text-[var(--tk-ink)]">{x.text}</p> : <p className="mt-2 text-[15px] italic text-[var(--tk-ink-mute)]">Stars only, no words.</p>}
        </div>
      ))}
    </section>
  )
}
