"use client"

import { useEffect, useState, useTransition } from "react"
import { ChevronDown, RefreshCw } from "lucide-react"
import { getSimpleChallenge, type ChallengeTab, type SimpleChallengeData } from "@/lib/actions/upsell"

const TABS: Array<{ key: ChallengeTab; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
]
const medal = (rank: number | null) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank ? String(rank) : "")

/**
 * The challenge, kept to one list: who, how many sides, how many per hour
 * worked. Tap a name for what they sold. Built for a phone or the iPad.
 */
export function ChallengeSimple({ initial }: { initial: SimpleChallengeData }) {
  const [data, setData] = useState(initial)
  const [tab, setTab] = useState<ChallengeTab>(initial.tab)
  const [open, setOpen] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const load = (t: ChallengeTab) => start(async () => setData(await getSimpleChallenge(initial.venue, t)))
  useEffect(() => {
    if (tab === "yesterday") return
    const timer = setInterval(() => load(tab), 2 * 60 * 1000)
    return () => clearInterval(timer)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const week = tab === "week"
  const rows = data.board.rows.filter((r) => r.units > 0)
  const unit = data.countLabel.toLowerCase()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-full bg-[var(--tk-charcoal-soft)] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setOpen(null); load(t.key) }}
            className={`min-h-[44px] rounded-full text-[15px] font-semibold transition ${tab === t.key ? "bg-white text-[var(--tk-charcoal)] shadow-sm" : "text-[var(--tk-ink-soft)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-3xl border border-[var(--tk-line)] bg-white">
        <div className="flex items-end justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold leading-tight text-[var(--tk-charcoal)]">{data.title}</h2>
            <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
              {data.rangeLabel}
              {pending && <RefreshCw className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 40, fontWeight: 700 }}>{data.board.teamUnits}</div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--tk-ink-mute)]">team {unit}</div>
          </div>
        </div>

        {!data.onSquare ? (
          <p className="px-5 py-5 text-[15px] text-[var(--tk-ink-soft)]">This starts when the venue moves to Square.</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-5 text-[15px] text-[var(--tk-ink-soft)]">Nothing counted yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-[var(--tk-line)] border-t border-[var(--tk-line)]">
            {rows.map((r) => {
              const isOpen = open === r.id
              return (
                <div key={r.id}>
                  <button
                    onClick={() => setOpen(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-[2.25rem_1fr_auto] items-center gap-x-2 px-5 py-3.5 text-left active:bg-[var(--tk-bg)]"
                  >
                    <span className="text-[20px] tabular-nums text-[var(--tk-ink-soft)]">{medal(r.rank)}</span>
                    <span className="min-w-0">
                      <span className={`block truncate text-[17px] text-[var(--tk-charcoal)] ${r.rank === 1 ? "font-bold" : "font-semibold"}`}>
                        {r.name}
                        <ChevronDown className={`ml-1 inline h-4 w-4 text-[var(--tk-ink-mute)] transition ${isOpen ? "rotate-180" : ""}`} />
                      </span>
                      <span className="block text-[13px] text-[var(--tk-ink-soft)]">
                        {r.perHour === null
                          ? week ? `${r.units} sold · no hours found` : "No hours found"
                          : `${week ? `${r.units} sold` : `${r.perHour.toFixed(1)} per hour`} · ${r.hours} hours${r.manager ? " (manager)" : ""}`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[26px] font-bold leading-none tabular-nums text-[var(--tk-charcoal)]">{week && r.perHour !== null ? r.perHour.toFixed(1) : r.units}</span>
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tk-ink-mute)]">{week && r.perHour !== null ? "per hour" : "sold"}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="bg-[var(--tk-bg)] px-5 py-3 pl-[3.5rem] text-[15px]">
                      {r.items.length ? (
                        r.items.map((it) => (
                          <div key={it.name} className="flex justify-between py-1">
                            <span className="text-[var(--tk-charcoal)]">{it.name}</span>
                            <span className="font-semibold tabular-nums">{it.units}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[var(--tk-ink-soft)]">The breakdown fills in from the next till sync.</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <p className="px-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
        {week ? `The week is won on most sold per hour worked, once someone has ${data.minHours} hours. ` : "The day is won on most sold. "}
        Tap a name to see what they sold. Managers count 9 hours a day; everyone else is their clocked hours.
        {data.board.onlineUnits > 0 && ` ${data.board.onlineUnits} came from online orders and count for the team only.`}
      </p>
    </div>
  )
}
