"use client"

import { useEffect, useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { getAvgSaleBoard, type AvgTab, type AvgSaleData } from "@/lib/actions/avg-sale"
import type { BoardChannel } from "@/lib/sales/avg-sale"

const TABS: Array<{ key: AvgTab; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
]
const CHANNELS: Array<{ key: BoardChannel; label: string }> = [
  { key: "CAFE", label: "Cafe" },
  { key: "RESTAURANT", label: "Restaurant" },
]
const medal = (rank: number | null) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank ? String(rank) : "")
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`

/**
 * Average sale leaderboard: one list per channel, who, their average paid
 * sale and how many sales. Built for a phone or the iPad, like the challenge.
 */
export function AvgSaleSimple({ initial }: { initial: AvgSaleData }) {
  const [data, setData] = useState(initial)
  const [tab, setTab] = useState<AvgTab>(initial.tab)
  const [channel, setChannel] = useState<BoardChannel>(initial.channel)
  const [pending, start] = useTransition()

  const load = (t: AvgTab, c: BoardChannel) => start(async () => setData(await getAvgSaleBoard(initial.venue, t, c)))
  useEffect(() => {
    if (tab === "yesterday") return
    const timer = setInterval(() => load(tab, channel), 2 * 60 * 1000)
    return () => clearInterval(timer)
  }, [tab, channel]) // eslint-disable-line react-hooks/exhaustive-deps

  const b = data.board
  const ranked = b.rows.filter((r) => r.rank !== null)
  const building = b.rows.filter((r) => r.rank === null)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-full bg-[var(--tk-charcoal-soft)] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); load(t.key, channel) }}
            className={`min-h-[44px] rounded-full text-[15px] font-semibold transition ${tab === t.key ? "bg-white text-[var(--tk-charcoal)] shadow-sm" : "text-[var(--tk-ink-soft)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            onClick={() => { setChannel(c.key); load(tab, c.key) }}
            aria-pressed={channel === c.key}
            className={`min-h-[44px] rounded-full text-[15px] font-semibold transition active:scale-[0.98] ${channel === c.key ? "bg-[var(--tk-charcoal)] text-white" : "border border-[var(--tk-line)] bg-white text-[var(--tk-charcoal)]"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-3xl border border-[var(--tk-line)] bg-white">
        <div className="flex items-end justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold leading-tight text-[var(--tk-charcoal)]">{channel === "CAFE" ? "Cafe" : "Restaurant"} average sale</h2>
            <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
              {data.rangeLabel}
              {pending && <RefreshCw className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 40, fontWeight: 700 }}>{b.teamOrders ? money(b.teamAvg) : "–"}</div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--tk-ink-mute)]">team average</div>
          </div>
        </div>

        {!data.onSquare ? (
          <p className="px-5 py-5 text-[15px] text-[var(--tk-ink-soft)]">This starts when the venue moves to Square.</p>
        ) : b.rows.length === 0 ? (
          <p className="px-5 py-5 text-[15px] text-[var(--tk-ink-soft)]">No sales yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-[var(--tk-line)] border-t border-[var(--tk-line)]">
            {ranked.map((r) => (
              <div key={r.id} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-x-2 px-5 py-3.5">
                <span className="text-[20px] tabular-nums text-[var(--tk-ink-soft)]">{medal(r.rank)}</span>
                <span className="min-w-0">
                  <span className={`block truncate text-[17px] text-[var(--tk-charcoal)] ${r.rank === 1 ? "font-bold" : "font-semibold"}`}>{r.name}</span>
                  <span className="block text-[13px] text-[var(--tk-ink-soft)]">
                    {r.orders} sales · {money0(r.sales)} · {r.vsTeam >= 0 ? `${money(r.vsTeam)} above team` : `${money(-r.vsTeam)} below team`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[26px] font-bold leading-none tabular-nums text-[var(--tk-charcoal)]">{money(r.avg)}</span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tk-ink-mute)]">per sale</span>
                </span>
              </div>
            ))}
            {building.length > 0 && (
              <div className="bg-[var(--tk-bg)] px-5 py-3">
                <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--tk-ink-mute)]">Under {b.minOrders} sales, not ranked yet</div>
                {building.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 text-[15px]">
                    <span className="text-[var(--tk-charcoal)]">{r.name} <span className="text-[var(--tk-ink-soft)]">· {r.orders} {r.orders === 1 ? "sale" : "sales"}</span></span>
                    <span className="font-semibold tabular-nums">{money(r.avg)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <p className="px-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
        Average paid sale per person, tips out, surcharge in. Ranked once someone has {b.minOrders} sales{tab === "week" ? " this week" : ""}.
        A sale goes to whoever takes the payment, else whoever opened it. Online orders are not counted.
      </p>
    </div>
  )
}
