"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from "recharts"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { getSalesInsights, type SalesInsights as Data, type Range } from "@/lib/actions/sales-insights"
import type { CompareMode } from "@/lib/sales/insights"
import { VENUE_LABEL } from "@/lib/venues"

const NAVY = "#1f3b4d", NAVY_SOFT = "#2a4b60", GOLD = "#e3b86f", GOLD_NOW = "#c9a46a", UBER = "#7fd1a8"
const money0 = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `$${Math.round(n).toLocaleString("en-AU")}`)
const money2 = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const shiftDate = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" })
const hourLabel = (h: number) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`)
const COMPARE_LABEL: Record<CompareMode, string> = { LAST_WEEK: "last week", WEEKS_4: "4 week avg", WEEKS_8: "8 week avg" }
const COMPARE_DAYS: Record<CompareMode, number> = { LAST_WEEK: 1, WEEKS_4: 4, WEEKS_8: 8 }

function Pill({ pct, dollars, children }: { pct: number | null; dollars?: number | null; children?: React.ReactNode }) {
  if (pct === null) return <span className="text-[13px] text-white/60">{children ?? "no comparison yet"}</span>
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[15px] font-semibold ${up ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%{dollars !== undefined && dollars !== null && <span className="font-medium"> {dollars >= 0 ? "+" : "-"}{money0(Math.abs(dollars))}</span>}
    </span>
  )
}
function SmallPill({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const up = pct >= 0
  return <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold ${up ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%</span>
}

function UberLine({ uber, isToday }: { uber: Data["uber"]; isToday: boolean }) {
  if (uber.status === "NONE" && !uber.error) return null
  const when = uber.fetchedAt ? new Date(uber.fetchedAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Brisbane" }) : ""
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[14px] text-white/85">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: UBER }} />
      <span>Uber Eats <strong>{money0(uber.sales)}</strong> · {uber.orders} order{uber.orders === 1 ? "" : "s"}</span>
      <span className="text-[12px] text-white/55">
        not in the total
        {uber.status === "LIVE" && ` · live ${when}`}
        {uber.status === "STORED" && isToday && ` · last seen ${when}`}
        {uber.error && <span className="text-rose-200"> · Uber session expired, paste a fresh one in Settings</span>}
      </span>
    </div>
  )
}

/**
 * view "sales": the navy total, categories under it, restaurant and cafe,
 * average sale per person. view "hourly": the by-hour chart, the week and
 * the month, with the compare controls. One page each (Chloe, 5 Oct 2026).
 */
export function SalesInsights({ initial, view = "sales" }: { initial: Data; view?: "sales" | "hourly" }) {
  const hourly = view === "hourly"
  const [data, setData] = useState<Data>(initial)
  const [range, setRange] = useState<Range>("1D")
  const [compare, setCompare] = useState<CompareMode>("WEEKS_4")
  const [date, setDate] = useState(initial.date)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function load(d = date, r = range, c = compare, force = false) {
    start(async () => { setData(await getSalesInsights(initial.venue, d, r, c, { force })) })
  }
  useEffect(() => { load(date, range, compare) }, [date, range, compare]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data.isToday) return
    const t = setInterval(() => load(date, range, compare, true), 2 * 60 * 1000)
    return () => clearInterval(t)
  }, [data.isToday, date, range, compare]) // eslint-disable-line react-hooks/exhaustive-deps

  const day = data.day
  const paid = day?.paidIncGst ?? 0
  const open = day?.openTablesIncGst ?? 0
  const total = paid + open
  const nowHour = data.nowMinutes !== null ? Math.floor(data.nowMinutes / 60) : null
  const chart = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => h)
    const have = hours.filter((h) => (day?.hourly[h] ?? 0) > 0 || data.hourlyCompare.avgHourly[h] > 0)
    const lo = Math.max(0, Math.min(6, ...have)), hi = Math.min(23, Math.max(16, ...have)) + 1
    return hours.slice(lo, hi).map((h) => ({ hour: hourLabel(h), h, today: (day?.hourly[h] ?? 0) + (h === nowHour ? open : 0), avg: data.hourlyCompare.avgHourly[h] ?? 0 }))
  }, [day, data.hourlyCompare, nowHour, open])
  const typical = (ch: string) => data.typical.find((t) => t.channel === ch)
  const channelsPaid = (day?.channels.CAFE.sales ?? 0) + (day?.channels.RESTAURANT.sales ?? 0) + (day?.channels.ONLINE.sales ?? 0)
  const share = (n: number) => (channelsPaid > 0 ? (n / channelsPaid) * 100 : 0)
  const avgChange = (ch: string, avg: number) => { const t = typical(ch)?.typicalAvgSale; return t && t > 0 ? Math.round(((avg - t) / t) * 1000) / 10 : null }
  const venueLabel = VENUE_LABEL[initial.venue].replace(/\s*\(.*\)$/, "")
  const sourceNote = data.source === "LIVE" ? `Square live · refreshed ${data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Brisbane" }) : ""}` : data.source === "SQUARE" ? "Square, closed day" : data.source === "LIGHTSPEED" ? "Lightspeed day, from the export" : data.source === "ESTIMATE" ? "Lightspeed total, hourly shape estimated" : "No sales data for this day"

  return (
    <div className={hourly ? "" : "grid items-start gap-5 lg:grid-cols-2"}>
      <div className="space-y-5">
      {/* ── Revenue card ─────────────────────────────────────────── */}
      <div className="rounded-3xl p-5 text-white shadow-sm md:p-6" style={{ background: NAVY }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[20px] font-semibold leading-tight">{data.isToday ? "Today" : weekday(date)}</div>
              <div className="text-[14px] text-white/70">{dayLabel(date)} · {venueLabel}</div>
            </div>
            <button className="rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></button>
            <button className="rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30" disabled={data.isToday} onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {hourly && <div className="flex rounded-full bg-white/10 p-1 text-[13px] font-semibold">
            {(["1D", "1W", "1M"] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1 ${range === r ? "bg-white text-[#1f3b4d]" : "text-white/80"}`}>{r}</button>
            ))}
          </div>}
        </div>
        <div className={`mt-4 flex-wrap items-center gap-2 text-[14px] ${hourly ? "flex" : "hidden"}`}>
          <span className="text-white/70">Compare with</span>
          <div className="flex rounded-full bg-white/10 p-1 font-semibold">
            {(["LAST_WEEK", "WEEKS_4", "WEEKS_8"] as CompareMode[]).map((c) => (
              <button key={c} onClick={() => setCompare(c)} className={`rounded-full px-3 py-1 ${compare === c ? "bg-white text-[#1f3b4d]" : "text-white/80"}`}>{c === "LAST_WEEK" ? "Last week" : c === "WEEKS_4" ? "4 weeks" : "8 weeks"}</button>
            ))}
          </div>
        </div>

        {range === "1D" ? (
          <>
            <div className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">Revenue inc GST</div>
            <div className="mt-1 font-serif text-[52px] font-semibold leading-none tabular-nums">{money0(total)}</div>
            <div className="mt-2 text-[15px] text-white/85">
              <strong>{money0(paid)}</strong> paid{open > 0 && <> + <strong>{money0(open)}</strong> on {day?.openTables} open table{day?.openTables === 1 ? "" : "s"}</>}
              {day && day.surchargeIncGst > 0 && <> · incl. <strong>{money0(day.surchargeIncGst)}</strong> {day.surchargeName ?? "surcharge"}</>}
            </div>
            <UberLine uber={data.uber} isToday={data.isToday} />
            <div className="mt-4 space-y-3">
              <div>
                <Pill pct={data.head.vsAvgPct} dollars={data.head.vsAvgDollars} />
                <div className="mt-1 text-[13px] text-white/70">
                  vs {COMPARE_LABEL[compare]}{data.isToday ? ` at ${new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" })} (est.)` : ""}
                  {day && day.surchargeIncGst > 0 && data.head.vsAvgNoSurchargePct !== null && <> ({data.head.vsAvgNoSurchargePct >= 0 ? "▲" : "▼"} {Math.abs(data.head.vsAvgNoSurchargePct).toFixed(1)}% without surcharge)</>}
                  {data.hourlyCompare.daysUsed === 0 && " · no history for this weekday yet"}
                  {data.hourlyCompare.daysUsed > 0 && data.hourlyCompare.daysUsed < COMPARE_DAYS[compare] && ` · ${data.hourlyCompare.daysUsed} of ${COMPARE_DAYS[compare]} ${weekday(date)}s`}
                  {data.hourlyCompare.estimated && " · some days estimated from daily totals"}
                </div>
              </div>
              {compare !== "LAST_WEEK" && (
                <div className="flex items-center gap-2">
                  <Pill pct={data.head.vsLastWeekPct} dollars={data.head.vsLastWeekDollars} />
                  <span className="text-[13px] text-white/70">vs last {weekday(date)}{data.isToday ? " (est.)" : ""}</span>
                </div>
              )}
              <div className="text-[14px] text-white/85">
                {COMPARE_LABEL[compare]} day <strong>{money0(data.hourlyCompare.avgDay)}</strong>
                {data.isToday && data.head.onPaceFor !== null && <> · on pace for <strong>{money0(data.head.onPaceFor)}</strong></>}
              </div>
            </div>

            {hourly ? (<>
            <div className="mt-5 flex items-baseline justify-between text-[13px] text-white/70">
              <span>{nowHour !== null ? `${hourLabel(nowHour)} so far` : "By hour"}</span>
              <span>{sourceNote}{pending && <RefreshCw className="ml-2 inline h-3 w-3 animate-spin" />}</span>
            </div>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.12)" />
                  <XAxis dataKey="hour" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={{ background: NAVY_SOFT, border: "none", borderRadius: 10, color: "white", fontSize: 12 }} formatter={(v, name) => [money0(typeof v === "number" ? v : Number(v ?? 0)), String(name) === "today" ? (data.isToday ? "Today" : "This day") : COMPARE_LABEL[compare]]} />
                  <Bar dataKey="today" radius={[4, 4, 0, 0]} fill={GOLD} shape={(p: { x?: number; y?: number; width?: number; height?: number; payload?: { h: number } }) => <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={4} fill={p.payload?.h === nowHour ? GOLD_NOW : GOLD} opacity={p.payload?.h === nowHour ? 0.75 : 1} />} />
                  <Line type="monotone" dataKey="avg" stroke="rgba(255,255,255,0.85)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex gap-4 text-[12px] text-white/70"><span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} />{data.isToday ? "Today" : "This day"}</span><span>- - - {COMPARE_LABEL[compare]}</span></div>

            </>) : (
              <div className="mt-4 text-[13px] text-white/70">{sourceNote}{pending && <RefreshCw className="ml-2 inline h-3 w-3 animate-spin" />}</div>
            )}

            <div className="mt-5 divide-y divide-white/10 text-[15px]">
              <div className="flex justify-between py-2"><span>Open tables</span><span className="tabular-nums">{data.source === "LIVE" ? `${day?.openTables ?? 0} · ${money0(open)}` : "n/a"}</span></div>
              <div className="flex justify-between py-2"><span>Paid orders</span><span className="tabular-nums">{day?.paidOrders ? day.paidOrders.toLocaleString() : "n/a"}</span></div>
              <div className="flex justify-between py-2"><span>Avg transaction</span><span className="tabular-nums">{day?.avgTransaction ? money2(day.avgTransaction) : "n/a"}</span></div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">{range === "1W" ? "Trading week (Wed to Tue)" : "Last 4 trading weeks"} · revenue inc GST</div>
            <div className="mt-1 font-serif text-[52px] font-semibold leading-none tabular-nums">{money0(data.seriesTotals.actual)}</div>
            <div className="mt-3"><Pill pct={data.seriesTotals.pct} dollars={data.seriesTotals.compare !== null ? data.seriesTotals.actual - data.seriesTotals.compare : null} /> <span className="ml-2 text-[13px] text-white/70">vs {COMPARE_LABEL[compare]} for the same weekdays</span></div>
            {data.seriesTotals.uber !== null && (
              <div className="mt-2 text-[14px] text-white/85"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: UBER }} />Uber Eats <strong>{money0(data.seriesTotals.uber)}</strong> <span className="text-white/60">on top, not in the total</span></div>
            )}
            <div className="mt-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.series.map((s) => ({ ...s, label: range === "1W" ? dayLabel(s.date).slice(0, 3) : dayLabel(s.date).slice(4) }))} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.12)" />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} axisLine={false} tickLine={false} interval={range === "1W" ? 0 : 3} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={{ background: NAVY_SOFT, border: "none", borderRadius: 10, color: "white", fontSize: 12 }} formatter={(v, name) => [money0(typeof v === "number" ? v : Number(v ?? 0)), String(name) === "actual" ? "Revenue" : String(name) === "uber" ? "Uber Eats" : COMPARE_LABEL[compare]]} labelFormatter={(_, p) => (p?.[0]?.payload?.date ? dayLabel(p[0].payload.date) : "")} />
                  <Bar dataKey="actual" radius={[4, 4, 0, 0]} fill={GOLD} />
                  <Line type="monotone" dataKey="compare" stroke="rgba(255,255,255,0.85)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
                  {data.seriesTotals.uber !== null && <Line type="monotone" dataKey="uber" stroke={UBER} dot={{ r: 2, fill: UBER, strokeWidth: 0 }} strokeWidth={1.5} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex gap-4 text-[12px] text-white/70"><span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} />Revenue</span><span>- - - {COMPARE_LABEL[compare]}</span>{data.seriesTotals.uber !== null && <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: UBER }} />Uber Eats</span>}</div>
            <div className="mt-3 divide-y divide-white/10 text-[14px]">
              {data.series.filter((s) => s.actual !== null).map((s) => (
                <div key={s.date} className="flex justify-between py-1.5"><span className="text-white/85">{dayLabel(s.date)}</span><span className="tabular-nums">{money0(s.actual)}<span className="ml-2 text-white/50">{s.compare !== null ? `vs ${money0(s.compare)}` : ""}</span>{s.uber !== null && s.uber > 0 && <span className="ml-2 text-[12px]" style={{ color: UBER }}>+ Uber {money0(s.uber)}</span>}</span></div>
              ))}
            </div>
          </>
        )}
      </div>

      {!hourly && (<>
        <section className="rounded-3xl border border-[var(--tk-line)] bg-white p-5">
          <h2 className="text-[20px] font-semibold text-[var(--tk-charcoal)]">Categories</h2>
          <p className="text-[13px] text-[var(--tk-ink-soft)]">Tap a category for its top 10.</p>
          {day && day.groups.length > 0 ? (
            <div className="mt-3 divide-y divide-[var(--tk-line)]">
              {day.groups.map((g) => (
                <div key={g.name}>
                  <button className="flex w-full items-baseline justify-between py-2 text-left text-[15px]" onClick={() => setOpenGroup(openGroup === g.name ? null : g.name)}>
                    <span className="font-semibold">{g.name}<span className="ml-2 text-[12px] font-normal text-[var(--tk-ink-soft)]">{g.qty} items</span></span>
                    <span className="tabular-nums">{money0(g.sales)}<span className="ml-2 text-[12px] text-[var(--tk-ink-soft)]">{paid > 0 ? `${((g.sales / paid) * 100).toFixed(0)}%` : ""}</span></span>
                  </button>
                  {openGroup === g.name && (
                    <div className="mb-2 rounded-xl bg-[var(--tk-bg)] px-3 py-2 text-[14px]">
                      {g.topItems.map((it) => (
                        <div key={it.name} className="flex justify-between py-1"><span>{it.name}<span className="ml-2 text-[12px] text-[var(--tk-ink-soft)]">× {it.qty}</span></span><span className="tabular-nums">{money0(it.sales)}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-[var(--tk-ink-soft)]">Needs the live Square connection (Square days only).</p>
          )}
        </section>
      </>)}
      </div>

      {/* ── Right column ─────────────────────────────────────────── */}
      {!hourly && <div className="space-y-5">
        <section className="rounded-3xl border border-[var(--tk-line)] bg-white p-5">
          <h2 className="text-[20px] font-semibold text-[var(--tk-charcoal)]">Restaurant and cafe</h2>
          <p className="text-[13px] text-[var(--tk-ink-soft)]">Paid orders only. Typical share is over the {COMPARE_LABEL[compare]} days.</p>
          {day && channelsPaid > 0 ? (
            <div className="mt-4 space-y-4">
              {([["CAFE", "Cafe", "#c49a4a"], ["RESTAURANT", "Restaurant", NAVY], ["ONLINE", "Bopple online", "#6b8e9b"]] as const).map(([key, label, color]) => {
                const v = day.channels[key]
                if (!v.orders && !typical(key)) return null
                const pct = share(v.sales)
                const t = typical(key)?.typicalSharePct
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between"><span className="text-[17px] font-semibold">{label}</span><span className="text-[17px] font-semibold tabular-nums">{money0(v.sales)}</span></div>
                    <div className="mt-1 h-2.5 w-full rounded-full bg-[var(--tk-bg)]"><div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>
                    <div className="mt-1 text-[13px] text-[var(--tk-ink-soft)]">{pct.toFixed(1)}%{t !== null && t !== undefined && <> · typically {t.toFixed(1)}%</>}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-[var(--tk-ink-soft)]">{data.source === "LIGHTSPEED" || data.source === "ESTIMATE" ? "Lightspeed day: split by register where the export had it." : "Needs the live Square connection."}</p>
          )}
          {data.uber.status !== "NONE" && (
            <div className="mt-4 border-t border-[var(--tk-line)] pt-3">
              <div className="flex items-baseline justify-between"><span className="text-[17px] font-semibold">Uber Eats</span><span className="text-[17px] font-semibold tabular-nums">{money0(data.uber.sales)}</span></div>
              <div className="mt-1 h-2.5 w-full rounded-full bg-[var(--tk-bg)]"><div className="h-2.5 rounded-full" style={{ width: `${channelsPaid > 0 ? Math.min(100, (data.uber.sales / channelsPaid) * 100) : 0}%`, background: UBER }} /></div>
              <div className="mt-1 text-[13px] text-[var(--tk-ink-soft)]">{data.uber.orders} order{data.uber.orders === 1 ? "" : "s"} · {channelsPaid > 0 ? `${((data.uber.sales / channelsPaid) * 100).toFixed(1)}% on top of the venue total` : "on top of the venue total"} · menu value before Uber&apos;s cut{data.uber.status === "LIVE" ? " · live" : ""}</div>
            </div>
          )}
        </section>

        {day && day.registers.length > 0 && (
          <section className="rounded-3xl border border-[var(--tk-line)] bg-white p-5">
            <h2 className="text-[20px] font-semibold text-[var(--tk-charcoal)]">Average sale per person</h2>
            <p className="text-[13px] text-[var(--tk-ink-soft)]">Who took the payment. The arrow is against the {COMPARE_LABEL[compare]} for that area.</p>
            {(["CAFE", "RESTAURANT", "ONLINE"] as const).map((ch) => {
              const regs = day.registers.filter((r) => r.channel === ch)
              if (!regs.length) return null
              const staff = day.staff.filter((s) => s.channel === ch)
              const sales = regs.reduce((n, r) => n + r.sales, 0), orders = regs.reduce((n, r) => n + r.orders, 0)
              const avg = orders > 0 ? sales / orders : 0
              return (
                <div key={ch} className="mt-4">
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--tk-bg)] px-4 py-3">
                    <div>
                      <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">{ch === "CAFE" ? "Cafe" : ch === "RESTAURANT" ? "Restaurant" : "Bopple online"}</div>
                      <div className="text-[13px] text-[var(--tk-ink-soft)]">{money0(sales)} · {orders} orders</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[22px] font-bold leading-none tabular-nums text-[var(--tk-charcoal)]">{money2(avg)}</div>
                      <div className="mt-1"><SmallPill pct={avgChange(ch, avg)} /></div>
                    </div>
                  </div>
                  {staff.length > 0 && (
                    <div className="divide-y divide-[var(--tk-line)] px-1">
                      {staff.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-[16px] font-medium text-[var(--tk-charcoal)]">{s.name}</div>
                            <div className="text-[13px] text-[var(--tk-ink-soft)]">{money0(s.sales)} · {s.orders} orders</div>
                          </div>
                          <div className="shrink-0 text-[18px] font-semibold tabular-nums text-[var(--tk-charcoal)]">{money2(s.avgSale)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}

      </div>}
    </div>
  )
}
