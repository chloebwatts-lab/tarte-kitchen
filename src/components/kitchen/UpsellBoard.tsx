"use client"

import { useEffect, useState, useTransition } from "react"
import { Trophy, Plus, ChevronDown, ChevronRight, RefreshCw } from "lucide-react"
import {
  getUpsellBoard, createChallenge, endChallenge, deleteChallenge, saveGroup,
  type UpsellBoardData, type ChallengeView, type StandingRow,
} from "@/lib/actions/upsell"
import type { BoardRow, Metric } from "@/lib/sales/upsell"

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`
const pctTxt = (n: number | null) => (n === null ? "n/a" : `${n.toFixed(1)}%`)
const METRIC_LABEL: Record<Metric, string> = { UNITS: "Most sold", ATTACH: "Best attach rate", SALES: "Most dollars", PER_HOUR: "Most sold per hour worked" }
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const shiftDate = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const medal = (rank: number | null) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank ? `${rank}` : "")

function scoreText(r: BoardRow, metric: Metric) {
  if (metric === "UNITS") return `${r.units}`
  if (metric === "SALES") return money0(r.sales)
  if (metric === "PER_HOUR") return r.perHour !== null && r.perHour !== undefined ? `${r.perHour.toFixed(2)} per hour` : `${r.units}`
  return pctTxt(r.attachPct)
}

function Leaderboard({ c }: { c: ChallengeView }) {
  const rows = c.board.filter((r) => r.eligibleOrders > 0)
  if (!rows.length) return <p className="mt-3 text-[14px] text-[var(--tk-ink-soft)]">{c.status === "UPCOMING" ? `Starts ${fmtDay(c.startDate)}.` : "No orders counted yet."}</p>
  const perHour = c.metric === "PER_HOUR"
  return (
    <div className="mt-3">
      {c.daily && c.days.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--tk-ink-mute)]">Day by day · most sold</div>
          <div className="mt-1 divide-y divide-[var(--tk-line)]">
            {c.days.map((d) => (
              <div key={d.date} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-x-3 py-2 text-[14px]">
                <span className="font-semibold">{d.isToday ? "Today" : fmtDay(d.date)}</span>
                {d.top.length ? (
                  <span>
                    <span className="font-semibold">🥇 {d.top[0].staffName} {d.top[0].units}</span>
                    {d.isToday && <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">so far</span>}
                    {d.top.slice(1).map((r, i) => <span key={r.teamMemberId} className="ml-3 text-[var(--tk-ink-soft)]">{i === 0 ? "🥈" : "🥉"} {r.staffName} {r.units}</span>)}
                  </span>
                ) : <span className="text-[var(--tk-ink-soft)]">No sides counted</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {c.daily && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--tk-ink-mute)]">The week · {METRIC_LABEL[c.metric].toLowerCase()}</div>}
      <div className={`grid ${perHour ? "grid-cols-[2rem_1fr_auto_auto_auto_auto]" : "grid-cols-[2rem_1fr_auto_auto_auto]"} gap-x-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--tk-ink-mute)]`}>
        <span /><span>Team member</span><span className="text-right">Sold</span>{perHour && <span className="text-right">Hours</span>}{perHour && <span className="text-right">Per hour</span>}{!perHour && <span className="text-right">Attach</span>}<span className="text-right">{perHour ? "Attach" : "Orders"}</span>
      </div>
      <div className="divide-y divide-[var(--tk-line)]">
        {rows.map((r) => (
          <div key={r.teamMemberId} className={`grid ${perHour ? "grid-cols-[2rem_1fr_auto_auto_auto_auto]" : "grid-cols-[2rem_1fr_auto_auto_auto]"} items-baseline gap-x-4 py-2 text-[15px] ${r.rank === 1 ? "font-semibold" : ""}`}>
            <span className="text-[17px]">{medal(r.rank)}</span>
            <span>{r.staffName}</span>
            <span className="text-right tabular-nums">{r.units}<span className="ml-1 text-[12px] font-normal text-[var(--tk-ink-soft)]">{money0(r.sales)}</span></span>
            {perHour && <span className="text-right tabular-nums">{r.hours ?? "n/a"}</span>}
            {perHour && <span className="text-right tabular-nums">{r.perHour !== null && r.perHour !== undefined ? r.perHour.toFixed(2) : "n/a"}</span>}
            {!perHour && <span className="text-right tabular-nums">{pctTxt(r.attachPct)}</span>}
            <span className="text-right tabular-nums text-[var(--tk-ink-soft)]">{perHour ? pctTxt(r.attachPct) : r.eligibleOrders}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 rounded-xl bg-[var(--tk-bg)] px-3 py-2 text-[14px]">
        <span className="font-semibold">Whole team</span>
        <span className="tabular-nums">{c.team.units} sold · {money0(c.team.sales)} · {pctTxt(c.team.attachPct)} of {c.team.eligibleOrders} orders</span>
      </div>
      {c.metric === "ATTACH" && <p className="mt-1 text-[12px] text-[var(--tk-ink-soft)]">Ranked on attach rate once someone has 10 eligible orders.</p>}
      {perHour && <p className="mt-1 text-[12px] text-[var(--tk-ink-soft)]">Hours are clocked timesheet hours for the challenge dates. Ranked once someone has {c.minHours} hours. No hours shown means the timesheet name did not match the till name.</p>}
    </div>
  )
}

export function UpsellBoard({ initial }: { initial: UpsellBoardData }) {
  const [data, setData] = useState(initial)
  const [pending, start] = useTransition()
  const [showNew, setShowNew] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [editGroup, setEditGroup] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const today = data.date

  const reload = () => start(async () => setData(await getUpsellBoard(initial.venue)))
  useEffect(() => {
    if (!data.challenges.some((c) => c.status === "LIVE")) return
    const t = setInterval(reload, 2 * 60 * 1000)
    return () => clearInterval(t)
  }, [data.challenges]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data.onSquare) {
    return (
      <section className="rounded-3xl border border-[var(--tk-line)] bg-white p-5">
        <h2 className="text-[20px] font-semibold text-[var(--tk-charcoal)]">Upselling and challenges</h2>
        <p className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">Starts when this venue moves to Square. Lightspeed never recorded which items were on each sale.</p>
      </section>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ── Challenges ───────────────────────────────────────────── */}
      <section className="rounded-3xl border border-[var(--tk-line)] bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[var(--tk-charcoal)]"><Trophy className="h-5 w-5 text-[var(--tk-gold)]" /> Challenges</h2>
          <button onClick={() => setShowNew((v) => !v)} className="inline-flex items-center gap-1 rounded-full bg-[var(--tk-charcoal)] px-3 py-1.5 text-[13px] font-semibold text-white"><Plus className="h-3.5 w-3.5" /> New challenge</button>
        </div>
        <p className="text-[13px] text-[var(--tk-ink-soft)]">Credit goes to whoever opened the order. Bopple orders count for the team, not a person.{pending && <RefreshCw className="ml-2 inline h-3 w-3 animate-spin" />}</p>

        {showNew && (
          <form
            className="mt-4 space-y-3 rounded-2xl bg-[var(--tk-bg)] p-4 text-[14px]"
            action={(fd) => start(async () => {
              const r = await createChallenge({
                venue: initial.venue, name: String(fd.get("name") ?? ""), groupKey: String(fd.get("group") ?? ""), metric: String(fd.get("metric") ?? "UNITS") as Metric,
                startDate: String(fd.get("start") ?? ""), endDate: String(fd.get("end") ?? ""), note: String(fd.get("note") ?? ""), daily: fd.get("daily") === "on",
              })
              if (!r.ok) { setMsg(r.error); return }
              setMsg(null); setShowNew(false); setData(await getUpsellBoard(initial.venue))
            })}
          >
            <label className="block">Name<input name="name" required placeholder="Sides week" className="mt-1 w-full rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">What counts<select name="group" className="mt-1 w-full rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2">{data.groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select></label>
              <label className="block">Scored by<select name="metric" className="mt-1 w-full rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2"><option value="UNITS">Most sold</option><option value="PER_HOUR">Most sold per hour worked</option><option value="ATTACH">Best attach rate</option><option value="SALES">Most dollars</option></select></label>
              <label className="block">Starts<input type="date" name="start" defaultValue={today} className="mt-1 w-full rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2" /></label>
              <label className="block">Ends<input type="date" name="end" defaultValue={shiftDate(today, 6)} className="mt-1 w-full rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2" /></label>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" name="daily" defaultChecked /> Crown a winner each day too (most sold that day)</label>
            <label className="block">Prize or note (optional)<input name="note" placeholder="Winner picks Friday's playlist" className="mt-1 w-full rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2" /></label>
            {msg && <p className="text-[13px] text-[var(--tk-warn)]">{msg}</p>}
            <div className="flex gap-2"><button type="submit" disabled={pending} className="rounded-full bg-[var(--tk-sage)] px-4 py-2 text-[14px] font-semibold text-white">Start it</button><button type="button" onClick={() => setShowNew(false)} className="rounded-full px-4 py-2 text-[14px]">Cancel</button></div>
          </form>
        )}

        {data.challenges.length === 0 && !showNew && <p className="mt-4 text-[14px] text-[var(--tk-ink-soft)]">No challenge running. Start one and the leaderboard fills in from Square by itself, including sales already made in the dates you pick.</p>}

        <div className="mt-4 space-y-5">
          {data.challenges.map((c) => (
            <div key={c.id} className="rounded-2xl border border-[var(--tk-line)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-[18px] font-semibold">{c.name}</div>
                  <div className="text-[13px] text-[var(--tk-ink-soft)]">{c.groupLabel} · {METRIC_LABEL[c.metric]} · {fmtDay(c.startDate)} to {fmtDay(c.endDate)}{c.note ? ` · ${c.note}` : ""}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${c.status === "LIVE" ? "bg-emerald-100 text-emerald-800" : c.status === "UPCOMING" ? "bg-amber-100 text-amber-800" : "bg-[var(--tk-bg)] text-[var(--tk-ink-soft)]"}`}>
                  {c.status === "LIVE" ? `Live · ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} left` : c.status === "UPCOMING" ? "Upcoming" : "Finished"}
                </span>
              </div>
              {c.status !== "UPCOMING" && c.board[0]?.rank === 1 && (
                <div className="mt-2 text-[14px]">{c.status === "FINISHED" ? "Winner" : "Leading"}: <strong>{c.board[0].staffName}</strong> with {scoreText(c.board[0], c.metric)}{c.metric === "UNITS" ? " sold" : ""}</div>
              )}
              <Leaderboard c={c} />
              <div className="mt-3 flex gap-3 text-[13px]">
                {c.status === "LIVE" && <button className="underline" onClick={() => start(async () => { await endChallenge(c.id); setData(await getUpsellBoard(initial.venue)) })}>End now</button>}
                <button className="text-[var(--tk-ink-soft)] underline" onClick={() => { if (confirm(`Remove "${c.name}"? The sales stay, only the challenge goes.`)) start(async () => { await deleteChallenge(c.id); setData(await getUpsellBoard(initial.venue)) }) }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Standing upsell measures ─────────────────────────────── */}
      <section className="rounded-3xl border border-[var(--tk-line)] bg-white p-5">
        <h2 className="text-[20px] font-semibold text-[var(--tk-charcoal)]">Upselling</h2>
        <p className="text-[13px] text-[var(--tk-ink-soft)]">Attach rate is the share of eligible orders that took one. This week is {data.weekLabel}. Tap a row for who is selling it.</p>
        <div className="mt-3 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--tk-ink-mute)]"><span /><span className="text-right">Today</span><span className="text-right">This week</span><span className="text-right">Last week</span></div>
        <div className="divide-y divide-[var(--tk-line)]">
          {data.standing.map((s: StandingRow) => {
            const change = s.thisWeek.attachPct !== null && s.lastWeek.attachPct !== null && s.lastWeek.eligibleOrders > 0 ? Math.round((s.thisWeek.attachPct - s.lastWeek.attachPct) * 10) / 10 : null
            const open = openGroup === s.groupKey
            return (
              <div key={s.groupKey}>
                <button className="grid w-full grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-4 py-2.5 text-left" onClick={() => setOpenGroup(open ? null : s.groupKey)}>
                  <span className="flex items-center gap-1 text-[15px] font-semibold">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{s.label}</span>
                  {[s.today, s.thisWeek, s.lastWeek].map((p, i) => (
                    <span key={i} className="text-right tabular-nums">
                      <span className="text-[15px]">{p.eligibleOrders ? pctTxt(p.attachPct) : "n/a"}</span>
                      <div className="text-[11px] text-[var(--tk-ink-soft)]">{p.eligibleOrders ? `${p.units} sold · ${money0(p.sales)}` : "no orders"}</div>
                    </span>
                  ))}
                </button>
                {change !== null && <div className="-mt-1 pb-1 text-right text-[12px]"><span className={change >= 0 ? "text-emerald-700" : "text-rose-700"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)} pts vs last week</span></div>}
                {open && (
                  <div className="mb-3 rounded-xl bg-[var(--tk-bg)] px-3 py-2">
                    {s.blurb && <p className="pb-1 text-[12px] text-[var(--tk-ink-soft)]">{s.blurb}</p>}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tk-ink-mute)]"><span>This week</span><span className="text-right">Sold</span><span className="text-right">Attach</span><span className="text-right">Per 100 orders</span></div>
                    {s.staffThisWeek.length === 0 && <p className="py-1 text-[13px] text-[var(--tk-ink-soft)]">Nothing yet this week.</p>}
                    {s.staffThisWeek.map((r) => (
                      <div key={r.teamMemberId} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-1 text-[14px]"><span>{r.staffName}</span><span className="text-right tabular-nums">{r.units}</span><span className="text-right tabular-nums">{pctTxt(r.attachPct)}</span><span className="text-right tabular-nums">{r.per100 ?? "n/a"}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* What counts */}
        <div className="mt-5 border-t border-[var(--tk-line)] pt-4">
          <h3 className="text-[15px] font-semibold">What counts</h3>
          <p className="text-[12px] text-[var(--tk-ink-soft)]">Lists use the item and add-on names exactly as they are on the till. Nothing needs changing in Square. Saving recounts the last two weeks.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.groups.map((g) => <button key={g.key} onClick={() => setEditGroup(editGroup === g.key ? null : g.key)} className={`rounded-full border px-3 py-1 text-[13px] ${editGroup === g.key ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white" : "border-[var(--tk-line)]"}`}>{g.label}</button>)}
            <button onClick={() => setEditGroup(editGroup === "__new" ? null : "__new")} className={`rounded-full border px-3 py-1 text-[13px] ${editGroup === "__new" ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white" : "border-dashed border-[var(--tk-line)]"}`}>+ New list</button>
          </div>
          {editGroup && (() => {
            const g = data.groups.find((x) => x.key === editGroup)
            return (
              <form key={editGroup} className="mt-3 space-y-2 text-[13px]" action={(fd) => start(async () => {
                const r = await saveGroup({ venue: initial.venue, key: g?.key, label: String(fd.get("label") ?? ""), items: String(fd.get("items") ?? ""), modifiers: String(fd.get("mods") ?? "") })
                setMsg(r.ok ? `Saved. Recounted ${r.recounted} day${r.recounted === 1 ? "" : "s"}.` : r.error)
                if (r.ok) { setEditGroup(null); setData(await getUpsellBoard(initial.venue)) }
              })}>
                <label className="block">Name<input name="label" defaultValue={g?.label ?? ""} required className="mt-1 w-full rounded-lg border border-[var(--tk-line)] px-3 py-2" /></label>
                {g && g.itemCategories.length > 0 && <p className="text-[var(--tk-ink-soft)]">Also counts every item in: {g.itemCategories.join(", ")}.</p>}
                <label className="block">Items (one per line)<textarea name="items" rows={4} defaultValue={(g?.itemNames ?? []).join("\n")} className="mt-1 w-full rounded-lg border border-[var(--tk-line)] px-3 py-2" /></label>
                <label className="block">Add-ons on a dish (one per line)<textarea name="mods" rows={6} defaultValue={(g?.modifierNames ?? []).join("\n")} className="mt-1 w-full rounded-lg border border-[var(--tk-line)] px-3 py-2" /></label>
                <button type="submit" disabled={pending} className="rounded-full bg-[var(--tk-sage)] px-4 py-2 font-semibold text-white">{pending ? "Recounting…" : "Save and recount"}</button>
              </form>
            )
          })()}
          {msg && !showNew && <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">{msg}</p>}
          {data.unassigned.length > 0 && (
            <div className="mt-4">
              <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--tk-ink-mute)]">Add-ons sold today that no list counts</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[13px]">{data.unassigned.map((u) => <span key={u.name} className="rounded-full bg-[var(--tk-bg)] px-2.5 py-1">{u.name} × {u.units}</span>)}</div>
              <p className="mt-1 text-[12px] text-[var(--tk-ink-soft)]">Add any of these to Sides above if they should count.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
