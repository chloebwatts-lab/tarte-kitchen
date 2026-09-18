"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, ExternalLink, Loader2, Minus, Plus, RotateCcw, Sparkles, Star } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { cn } from "@/lib/utils"
import {
  clearGmMark,
  logOneOnOne,
  logSickCall,
  markGmItem,
  saveGmPush,
  sendFridayReport,
  setGmDays,
  setGmTaskDone,
  undoOneOnOne,
  undoSickCall,
  type GmBoard,
} from "@/lib/actions/gm"
import type { BoardItem } from "@/lib/gm/board"
import { MISSION, THEME_BLURB, THEME_LABEL, type GmDays, type GmTheme } from "@/lib/gm/plan"
import type { NumberTile } from "@/lib/gm/readings"

type Tab = "today" | "week" | "tasks"
type DayTheme = Exclude<GmTheme, "everyday">
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const THEMES: DayTheme[] = ["rosters", "kitchen", "people"]

const isDone = (i: BoardItem) => i.state === "done" || i.state === "auto-ok"

export function GmDesk({ board }: { board: GmBoard }) {
  const [tab, setTab] = useState<Tab>("today")
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState("")

  /** Run an action, show its error if it returns one, then refetch. */
  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    setError("")
    start(async () => {
      try {
        const r = await fn()
        if (r && r.ok === false) setError(r.error ?? "That did not save.")
      } catch {
        setError("That did not save. Check the wifi and try again.")
      }
      router.refresh()
    })
  }

  const pct = Math.round((board.doneCount / board.totalCount) * 100)
  const nextTask = board.tasks.find((t) => !t.done)

  return (
    <div className="space-y-6 pb-16">
      {/* Header: the date, the job, the week so far */}
      <div className="px-1">
        <div className="text-[15px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-mute)]">{board.todayLabel}</div>
        <h1 className="tk-display mt-1 leading-none text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(34px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-0.025em" }}>
          {board.todayTheme ? THEME_LABEL[board.todayTheme] : board.isoDay === 2 || board.isoDay === 3 ? "Day off" : "On the floor"}
        </h1>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">{MISSION}</p>
      </div>

      <div className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[17px] font-semibold text-[var(--tk-ink)]">This week: {board.doneCount} of {board.totalCount} done</span>
          <span className="text-[14px] text-[var(--tk-ink-mute)]">{board.weekLabel}</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--tk-charcoal-soft)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[var(--tk-done)] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-2 z-10 grid grid-cols-4 gap-1 rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-1 shadow-sm">
        {(["today", "week", "tasks"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-[10px] px-2 py-3 text-[16px] font-semibold capitalize",
              tab === t ? "bg-[var(--tk-charcoal)] text-white" : "text-[var(--tk-ink-soft)]",
            )}
          >
            {t === "tasks" ? `Deadlines` : t}
          </button>
        ))}
        <Link href="/kitchen/gm/month" className="rounded-[10px] px-2 py-3 text-center text-[16px] font-semibold text-[var(--tk-ink-soft)]">
          Tracking
        </Link>
      </div>

      {error ? (
        <p className="rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[16px] font-medium text-[var(--tk-warn)]" role="alert">{error}</p>
      ) : null}

      {tab === "today" ? <Today board={board} run={run} busy={busy} nextTask={nextTask} /> : null}
      {tab === "week" ? <Week board={board} run={run} busy={busy} /> : null}
      {tab === "tasks" ? <Tasks board={board} run={run} busy={busy} /> : null}
    </div>
  )
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string } | void>) => void

// ─── Today ───────────────────────────────────────────────────────────

function Today({ board, run, busy, nextTask }: { board: GmBoard; run: Run; busy: boolean; nextTask: GmBoard["tasks"][number] | undefined }) {
  const theme = board.todayTheme
  const [showCarried, setShowCarried] = useState(false)
  const dayOf = useMemo(() => {
    const m = new Map<DayTheme, number>()
    for (const [d, t] of Object.entries(board.gmDays)) if (t) m.set(t, Number(d))
    return m
  }, [board.gmDays])

  const todays = board.items.filter((i) => theme && (i.theme === "everyday" || i.theme === theme))
  const doNow = todays.filter((i) => !isDone(i) && i.state !== "couldnt")
  // Anything from a GM day that has already been and gone this week.
  const carried = board.items.filter((i) => {
    if (i.theme === "everyday" || i.theme === theme) return false
    const d = dayOf.get(i.theme as DayTheme)
    if (d == null) return false
    const pos = (d + 4) % 7 // Wed = 0 ... Tue = 6, same as gmWeekPos
    return pos < board.todayPos && pos >= board.firstPosThisWeek && !isDone(i) && i.state !== "couldnt"
  })
  const finished = todays.filter((i) => isDone(i) || i.state === "couldnt")

  return (
    <div className="space-y-7">
      {board.pushKey && board.pushDevices === 0 ? <PhoneAlerts board={board} run={run} /> : null}

      {!theme ? (
        <div className="rounded-[16px] bg-[var(--tk-sage-soft)] p-5 text-[17px] leading-snug text-[var(--tk-ink)]">
          Not a GM day, so nothing new is due. Two minutes: look at what is still open below, and at the numbers.
        </div>
      ) : null}

      {theme && doNow.length === 0 && carried.length === 0 ? (
        <div className="rounded-[16px] bg-[var(--tk-done-soft)] p-5 text-[18px] font-semibold text-[var(--tk-done)]">
          Today is done. Nothing open.
        </div>
      ) : null}

      {doNow.length ? (
        <Section title="Do now" sub={theme ? THEME_BLURB[theme] : undefined}>
          {doNow.map((i) => <ItemCard key={i.slug} item={i} run={run} busy={busy} board={board} />)}
        </Section>
      ) : null}

      {carried.length ? (
        <Section title={`Still open from earlier this week (${carried.length})`} tone="warn">
          {(showCarried ? carried : carried.slice(0, 3)).map((i) => <ItemCard key={i.slug} item={i} run={run} busy={busy} board={board} compact />)}
          {carried.length > 3 ? (
            <button onClick={() => setShowCarried(!showCarried)} className="inline-flex items-center gap-1 px-1 text-[15px] font-semibold text-[var(--tk-ink-soft)]">
              <ChevronDown className={cn("h-4 w-4 transition", showCarried && "rotate-180")} /> {showCarried ? "Show fewer" : `Show the other ${carried.length - 3}`}
            </button>
          ) : null}
        </Section>
      ) : null}

      {nextTask ? (
        <Section title="Next deadline">
          <TaskCard task={nextTask} run={run} busy={busy} />
        </Section>
      ) : null}

      <Numbers board={board} />

      <SickCalls board={board} run={run} busy={busy} />

      {finished.length ? (
        <Section title={`Sorted today (${finished.length})`}>
          {finished.map((i) => <ItemCard key={i.slug} item={i} run={run} busy={busy} board={board} compact />)}
        </Section>
      ) : null}
    </div>
  )
}

function Section({ title, sub, tone, children }: { title: string; sub?: string; tone?: "warn"; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className={cn("text-[14px] font-bold uppercase tracking-[0.09em]", tone === "warn" ? "text-[var(--tk-warn)]" : "text-[var(--tk-ink-mute)]")}>{title}</h2>
        {sub ? <p className="text-[15px] text-[var(--tk-ink-soft)]">{sub}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

// ─── One item ────────────────────────────────────────────────────────

function ItemCard({ item, run, busy, board, compact }: { item: BoardItem; run: Run; busy: boolean; board: GmBoard; compact?: boolean }) {
  const [mode, setMode] = useState<"idle" | "done" | "couldnt">("idle")
  const [note, setNote] = useState("")
  const [n1, setN1] = useState(0)
  const [n2, setN2] = useState(0)
  const done = isDone(item)
  const needsForm = Boolean(item.counts || item.noteOnDone)

  function tickDone() {
    if (needsForm && mode !== "done") return setMode("done")
    run(() => markGmItem({ slug: item.slug, met: true, note, num1: item.counts ? n1 : null, num2: item.counts ? n2 : null }))
    setMode("idle")
  }
  function tickCouldnt() {
    if (mode !== "couldnt") return setMode("couldnt")
    run(() => markGmItem({ slug: item.slug, met: false, note }))
    setMode("idle")
  }

  const stateChip =
    item.state === "done" ? { text: "Done", cls: "bg-[var(--tk-done-soft)] text-[var(--tk-done)]" }
    : item.state === "auto-ok" ? { text: "Checked by the app", cls: "bg-[var(--tk-done-soft)] text-[var(--tk-done)]" }
    : item.state === "couldnt" ? { text: "Couldn't this week", cls: "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]" }
    : item.state === "auto-bad" ? { text: "App says not yet", cls: "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]" }
    : null

  return (
    <div className={cn("rounded-[16px] border bg-[var(--tk-card)] p-4 md:p-5", item.state === "auto-bad" ? "border-[var(--tk-warn)]" : "border-[var(--tk-line)]", done && "opacity-80")}>
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2", done ? "border-[var(--tk-done)] bg-[var(--tk-done)] text-white" : "border-[var(--tk-line)]")}>
          {done ? <Check className="h-5 w-5" strokeWidth={3} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("text-[19px] font-semibold leading-snug text-[var(--tk-ink)]", done && "line-through decoration-[var(--tk-ink-mute)]")}>{item.title}</div>
          {!compact ? <p className="mt-1 text-[16px] leading-snug text-[var(--tk-ink-soft)]">{item.hint}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {stateChip ? <span className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", stateChip.cls)}>{stateChip.text}</span> : null}
            {item.auto_ ? (
              <span className="inline-flex items-center gap-1.5 text-[15px] text-[var(--tk-ink-soft)]">
                <Sparkles className="h-4 w-4 shrink-0 text-[var(--tk-ink-mute)]" /> {item.auto_.detail}
              </span>
            ) : null}
          </div>
          {item.note ? <p className="mt-2 text-[15px] italic text-[var(--tk-ink-soft)]">&ldquo;{item.note}&rdquo;</p> : null}
          {item.manual && item.counts && item.state === "done" ? (
            <p className="mt-1 text-[15px] text-[var(--tk-ink-soft)]">{item.counts.num1}: {item.num1 ?? 0}. {item.counts.num2}: {item.num2 ?? 0}.</p>
          ) : null}
        </div>
      </div>

      {/* People day helpers live inside the item they belong to */}
      {!compact && item.slug === "one-on-ones" ? <OneOnOnes board={board} run={run} busy={busy} /> : null}
      {!compact && item.slug === "reviews-read" ? <Reviews board={board} /> : null}
      {!compact && item.slug === "roster-2wk" && board.nextToPublish ? (
        <p className="mt-3 rounded-[12px] bg-[var(--tk-gold-soft)] px-4 py-3 text-[16px] font-semibold text-[var(--tk-ink)]">Publish next: week of {board.nextToPublish}.</p>
      ) : null}

      {mode === "done" && item.counts ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stepper label={item.counts.num1} value={n1} set={setN1} />
          <Stepper label={item.counts.num2} value={n2} set={setN2} />
        </div>
      ) : null}
      {mode === "done" && item.noteOnDone ? (
        <NoteBox id={`note-${item.slug}`} value={note} set={setNote} placeholder={item.noteOnDone} />
      ) : null}
      {mode === "couldnt" ? (
        <NoteBox id={`why-${item.slug}`} value={note} set={setNote} placeholder="One line: what got in the way, and what changes next week?" />
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.manual ? (
          <KitchenButton variant="ghost" size="sm" disabled={busy} onClick={() => run(() => clearGmMark(item.slug))}>
            <RotateCcw className="h-4 w-4" /> Undo
          </KitchenButton>
        ) : item.slug === "weekly-report" || item.slug === "one-on-ones" ? null : (
          <>
            {!done ? (
              <KitchenButton variant="primary" size="lg" disabled={busy || (mode === "couldnt")} onClick={tickDone} className="min-w-[150px]">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                {mode === "done" ? "Save" : "Done"}
              </KitchenButton>
            ) : null}
            {!done || item.state === "auto-ok" ? (
              <KitchenButton variant="ghost" size="sm" disabled={busy} onClick={tickCouldnt}>
                {mode === "couldnt" ? "Save the reason" : item.state === "auto-ok" ? "Not actually done" : "Couldn't"}
              </KitchenButton>
            ) : null}
            {mode !== "idle" ? (
              <KitchenButton variant="ghost" size="sm" onClick={() => { setMode("idle"); setNote("") }}>Cancel</KitchenButton>
            ) : null}
          </>
        )}
        {item.href ? (
          <Link href={item.href} className="ml-auto inline-flex items-center gap-1.5 px-2 py-2 text-[15px] font-semibold text-[var(--tk-ink-soft)] underline underline-offset-4">
            Open the tool <ExternalLink className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function NoteBox({ id, value, set, placeholder }: { id: string; value: string; set: (v: string) => void; placeholder: string }) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      rows={2}
      autoFocus
      className="mt-4 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px] leading-snug"
    />
  )
}

function Stepper({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2">
      <span className="text-[16px] font-semibold text-[var(--tk-ink)]">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Less ${label}`} onClick={() => set(Math.max(0, value - 1))} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tk-line)] bg-[var(--tk-card)]"><Minus className="h-5 w-5" /></button>
        <span className="w-8 text-center text-[22px] font-bold tabular-nums">{value}</span>
        <button type="button" aria-label={`More ${label}`} onClick={() => set(value + 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tk-line)] bg-[var(--tk-card)]"><Plus className="h-5 w-5" /></button>
      </div>
    </div>
  )
}

// ─── One-on-ones ─────────────────────────────────────────────────────

function OneOnOnes({ board, run, busy }: { board: GmBoard; run: Run; busy: boolean }) {
  const [all, setAll] = useState(false)
  const seen = new Set(board.talksThisWeek.map((t) => t.name))
  const queue = board.queue.filter((q) => !seen.has(q.name))
  const shown = all ? queue : queue.slice(0, 6)
  return (
    <div className="mt-4 space-y-3">
      {board.talksThisWeek.length ? (
        <div className="flex flex-wrap gap-2">
          {board.talksThisWeek.map((t) => (
            <button key={t.id} disabled={busy} onClick={() => run(() => undoOneOnOne(t.id))} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tk-done-soft)] px-3.5 py-2 text-[15px] font-semibold text-[var(--tk-done)]" title="Tap to take back">
              <Check className="h-4 w-4" /> {t.name}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-[15px] text-[var(--tk-ink-soft)]">Most overdue first. Tap a name once you have sat down with them.</p>
      <div className="flex flex-wrap gap-2">
        {shown.map((q) => (
          <button key={q.name} disabled={busy} onClick={() => run(() => logOneOnOne(q.name))} className="rounded-full border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2.5 text-left text-[16px] font-semibold text-[var(--tk-ink)] active:scale-[0.98]">
            {q.name}
            <span className="ml-2 text-[13px] font-normal text-[var(--tk-ink-mute)]">{q.daysSince == null ? "never" : `${q.daysSince}d ago`}</span>
          </button>
        ))}
      </div>
      {queue.length > 6 ? (
        <button onClick={() => setAll(!all)} className="inline-flex items-center gap-1 text-[15px] font-semibold text-[var(--tk-ink-soft)]">
          <ChevronDown className={cn("h-4 w-4 transition", all && "rotate-180")} /> {all ? "Show fewer" : `Everyone (${queue.length})`}
        </button>
      ) : null}
    </div>
  )
}

function Reviews({ board }: { board: GmBoard }) {
  const { lines, fiveStarThisMonth } = board.reviews
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[15px] text-[var(--tk-ink-soft)]">Five-star reviews this month: <b className="text-[var(--tk-ink)]">{fiveStarThisMonth}</b> of 20.</p>
      {lines.length === 0 ? <p className="text-[15px] text-[var(--tk-ink-mute)]">No new reviews yet this week.</p> : null}
      {lines.map((r, i) => (
        <div key={i} className={cn("rounded-[12px] px-4 py-3", r.rating <= 3 ? "bg-[var(--tk-warn-soft)]" : "bg-[var(--tk-bg)]")}>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--tk-ink)]">
            <span className="inline-flex items-center gap-0.5">{r.rating}<Star className="h-3.5 w-3.5 fill-current" /></span>
            <span>{r.who}</span><span className="font-normal text-[var(--tk-ink-mute)]">{r.when}</span>
          </div>
          {r.text ? <p className="mt-1 text-[15px] leading-snug text-[var(--tk-ink-soft)]">{r.text}</p> : null}
        </div>
      ))}
    </div>
  )
}

// ─── Numbers ─────────────────────────────────────────────────────────

function Numbers({ board }: { board: GmBoard }) {
  const { wages, cogs } = board.numbers
  if (!wages.tiles.length && !cogs.tiles.length) return null
  return (
    <Section title="The numbers" sub="Worked out for you from payroll and invoices. Percent of sales, no dollars.">
      {wages.tiles.length ? <TileRow label={`Wages, week ${wages.weekLabel}`} tiles={wages.tiles} /> : null}
      {cogs.tiles.length ? <TileRow label={`COGS, week ${cogs.weekLabel}`} tiles={cogs.tiles} /> : null}
      <KitchenButton href="/kitchen/gm/live" variant="secondary" size="lg" className="w-full">See this week live: spend and wages so far</KitchenButton>
    </Section>
  )
}

function TileRow({ label, tiles }: { label: string; tiles: NumberTile[] }) {
  return (
    <div>
      <div className="mb-2 px-1 text-[14px] text-[var(--tk-ink-mute)]">{label}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.key} className={cn("rounded-[14px] border p-4", t.status === "red" ? "border-[var(--tk-warn)] bg-[var(--tk-warn-soft)]" : t.status === "amber" ? "border-[var(--tk-gold)] bg-[var(--tk-gold-soft)]" : "border-[var(--tk-line)] bg-[var(--tk-card)]")}>
            <div className="text-[14px] font-semibold text-[var(--tk-ink-soft)]">{t.label}</div>
            <div className="mt-1 text-[28px] font-bold leading-none tabular-nums text-[var(--tk-ink)]">{t.value}</div>
            <div className="mt-1.5 text-[13px] text-[var(--tk-ink-soft)]">Target {t.target}{t.status === "red" ? ". Over." : t.status === "amber" ? ". Close." : t.status === "ok" ? ". Good." : ""}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Week ────────────────────────────────────────────────────────────

function Week({ board, run, busy }: { board: GmBoard; run: Run; busy: boolean }) {
  return (
    <div className="space-y-8">
      <WeeklyReport board={board} run={run} busy={busy} />
      {(["everyday", ...THEMES] as GmTheme[]).map((th) => (
        <Section key={th} title={THEME_LABEL[th]}>
          {board.items.filter((i) => i.theme === th).map((i) => <ItemCard key={i.slug} item={i} run={run} busy={busy} board={board} compact={isDone(i)} />)}
        </Section>
      ))}
      <SickCalls board={board} run={run} busy={busy} />
      <PhoneAlerts board={board} run={run} />
      <DayPicker board={board} run={run} busy={busy} />
    </div>
  )
}

function WeeklyReport({ board, run, busy }: { board: GmBoard; run: Run; busy: boolean }) {
  const [fixed, setFixed] = useState(board.report.fixed)
  const [need, setNeed] = useState(board.report.need)
  const [show, setShow] = useState(false)
  return (
    <section className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
      <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">Monday report to Chloe</h2>
      <p className="mt-1 text-[16px] text-[var(--tk-ink-soft)]">
        {board.report.sent ? `Sent ${board.report.sentLabel}. Sending again replaces it.` : "Due Monday 3pm, before your two days off. The numbers and the ticks are filled in for you. Add two lines."}
      </p>
      <label htmlFor="gm-fixed" className="mt-4 block text-[15px] font-semibold text-[var(--tk-ink)]">One thing I fixed this week</label>
      <textarea id="gm-fixed" rows={2} value={fixed} onChange={(e) => setFixed(e.target.value)} className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px]" />
      <label htmlFor="gm-need" className="mt-3 block text-[15px] font-semibold text-[var(--tk-ink)]">One thing I need from Chloe</label>
      <textarea id="gm-need" rows={2} value={need} onChange={(e) => setNeed(e.target.value)} placeholder="Leave blank if nothing" className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px]" />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <KitchenButton variant="primary" size="lg" disabled={busy} onClick={() => run(() => sendFridayReport({ fixed, need }))}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Send to Chloe
        </KitchenButton>
        <button onClick={() => setShow(!show)} className="inline-flex items-center gap-1 text-[15px] font-semibold text-[var(--tk-ink-soft)]">
          <ChevronDown className={cn("h-4 w-4 transition", show && "rotate-180")} /> {show ? "Hide" : "See what it will say"}
        </button>
      </div>
      {show ? <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[12px] bg-[var(--tk-bg)] p-4 font-sans text-[15px] leading-relaxed text-[var(--tk-ink-soft)]">{board.report.preview}</pre> : null}
    </section>
  )
}

function DayPicker({ board, run, busy }: { board: GmBoard; run: Run; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState<GmDays>(board.gmDays)
  function cycle(d: string) {
    const cur = days[d as keyof GmDays]
    const next = cur == null ? THEMES[0] : THEMES[THEMES.indexOf(cur) + 1]
    const copy = { ...days }
    if (next) copy[d as keyof GmDays] = next
    else delete copy[d as keyof GmDays]
    setDays(copy)
  }
  return (
    <section className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-[17px] font-semibold text-[var(--tk-ink)]">
        My GM days
        <ChevronDown className={cn("h-5 w-5 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-[15px] text-[var(--tk-ink-soft)]">Tap a day to change what it is for. Blank means on the floor or off.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
            {DAY_NAMES.map((n, idx) => {
              const d = String(idx + 1)
              const t = days[d as keyof GmDays]
              return (
                <button key={d} onClick={() => cycle(d)} className={cn("rounded-[12px] border px-2 py-3 text-center", t ? "border-[var(--tk-charcoal)] bg-[var(--tk-sage-soft)]" : "border-[var(--tk-line)] bg-[var(--tk-bg)]")}>
                  <div className="text-[16px] font-bold text-[var(--tk-ink)]">{n}</div>
                  <div className="text-[13px] text-[var(--tk-ink-soft)]">{t ? THEME_LABEL[t].split(" ")[0] : "No"}</div>
                </button>
              )
            })}
          </div>
          <KitchenButton variant="secondary" size="md" disabled={busy} onClick={() => run(() => setGmDays(days))}>Save my days</KitchenButton>
        </div>
      ) : null}
    </section>
  )
}

// ─── Deadlines ───────────────────────────────────────────────────────

function Tasks({ board, run, busy }: { board: GmBoard; run: Run; busy: boolean }) {
  const open = board.tasks.filter((t) => !t.done)
  const done = board.tasks.filter((t) => t.done)
  return (
    <div className="space-y-7">
      <Section title="To do, soonest first">
        {open.map((t) => <TaskCard key={t.slug} task={t} run={run} busy={busy} />)}
        {open.length === 0 ? <p className="text-[17px] text-[var(--tk-ink-soft)]">All done. Set the next ones with Chloe at the monthly sit-down.</p> : null}
      </Section>
      {done.length ? (
        <Section title={`Done (${done.length})`}>
          {done.map((t) => <TaskCard key={t.slug} task={t} run={run} busy={busy} />)}
        </Section>
      ) : null}
    </div>
  )
}

function TaskCard({ task, run, busy }: { task: GmBoard["tasks"][number]; run: Run; busy: boolean }) {
  const late = !task.done && task.daysLeft < 0
  const soon = !task.done && task.daysLeft >= 0 && task.daysLeft <= 7
  const when = task.done ? `Done ${task.doneLabel}` : late ? `${Math.abs(task.daysLeft)} days late` : task.daysLeft === 0 ? "Due today" : `${task.daysLeft} days left`
  return (
    <div className={cn("rounded-[16px] border bg-[var(--tk-card)] p-4 md:p-5", late ? "border-[var(--tk-warn)]" : "border-[var(--tk-line)]", task.done && "opacity-75")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-3 py-1 text-[13px] font-bold", task.done ? "bg-[var(--tk-done-soft)] text-[var(--tk-done)]" : late ? "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]" : soon ? "bg-[var(--tk-gold-soft)] text-[var(--tk-ink)]" : "bg-[var(--tk-charcoal-soft)] text-[var(--tk-ink-soft)]")}>{when}</span>
        <span className="text-[14px] text-[var(--tk-ink-mute)]">Due {task.dueLabel}</span>
      </div>
      <div className="mt-2 text-[19px] font-semibold leading-snug text-[var(--tk-ink)]">{task.title}</div>
      <p className="mt-1 text-[16px] leading-snug text-[var(--tk-ink-soft)]"><b className="text-[var(--tk-ink)]">Done means:</b> {task.doneMeans}</p>
      <div className="mt-3">
        {task.done ? (
          <KitchenButton variant="ghost" size="sm" disabled={busy} onClick={() => run(() => setGmTaskDone(task.slug, false))}><RotateCcw className="h-4 w-4" /> Not done after all</KitchenButton>
        ) : (
          <KitchenButton variant="secondary" size="md" disabled={busy} onClick={() => run(() => setGmTaskDone(task.slug, true))}><Check className="h-5 w-5" /> Mark done</KitchenButton>
        )}
      </div>
    </div>
  )
}

// ─── Phone alerts ────────────────────────────────────────────────────

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
const b64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : "")

function PhoneAlerts({ board, run }: { board: GmBoard; run: Run }) {
  const [msg, setMsg] = useState("")
  const [working, setWorking] = useState(false)
  if (!board.pushKey) return null

  async function turnOn() {
    setMsg("")
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setMsg("On an iPhone, alerts only work from the home screen app. In Safari tap Share, then Add to Home Screen. Open Tarte from the home screen, come back here and tap this again.")
      return
    }
    setWorking(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") { setMsg("Alerts are blocked for this app. Allow notifications for Tarte in your phone settings, then tap this again."); return }
      const reg = await navigator.serviceWorker.register("/gm-sw.js")
      await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(board.pushKey as string) as BufferSource }))
      const label = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Computer"
      run(() => saveGmPush({ endpoint: sub.endpoint, p256dh: b64(sub.getKey("p256dh")), auth: b64(sub.getKey("auth")), label }))
      setMsg("Done. A test alert is on its way to this phone.")
    } catch {
      setMsg("That did not work on this phone. Tell Chloe.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
      <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">Phone alerts</h2>
      <p className="mt-1 text-[16px] leading-snug text-[var(--tk-ink-soft)]">
        {board.pushDevices > 0
          ? `On for ${board.pushDevices} ${board.pushDevices === 1 ? "device" : "devices"}. Tap again on a new phone to add it.`
          : "Get your GM day list at 6:30am, a 2pm check if things are still open, and the Monday report nudge, as alerts on this phone."}
      </p>
      <div className="mt-3">
        <KitchenButton variant={board.pushDevices > 0 ? "secondary" : "primary"} size="lg" disabled={working} onClick={turnOn}>
          {working ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Turn on alerts on this phone
        </KitchenButton>
      </div>
      {msg ? <p className="mt-3 text-[16px] font-medium text-[var(--tk-ink)]">{msg}</p> : null}
    </section>
  )
}

// ─── Sick calls ──────────────────────────────────────────────────────

function SickCalls({ board, run, busy }: { board: GmBoard; run: Run; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [daysAgo, setDaysAgo] = useState(0)
  const names = board.queue.map((s) => s.name)
  const shown = names.filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 12)
  const counts = new Map<string, number>()
  for (const c of board.sickThisMonth) counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
  const total = board.sickThisMonth.length
  return (
    <section className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold text-[var(--tk-ink)]">Sick calls</h2>
          <p className="text-[15px] text-[var(--tk-ink-soft)]">{total} this month. Target 4 or fewer.</p>
        </div>
        <KitchenButton variant={open ? "ghost" : "secondary"} size="md" onClick={() => setOpen(!open)}>{open ? "Cancel" : "Log a sick call"}</KitchenButton>
      </div>
      {open ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input id="gm-sick-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing a name" autoFocus className="min-w-[200px] flex-1 rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-3 text-[17px]" />
            <select id="gm-sick-when" value={daysAgo} onChange={(e) => setDaysAgo(Number(e.target.value))} className="rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-bg)] px-3 py-3 text-[16px]">
              <option value={0}>Today</option>
              <option value={1}>Yesterday</option>
              <option value={2}>2 days ago</option>
              <option value={3}>3 days ago</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {shown.map((n) => (
              <button key={n} disabled={busy} onClick={() => { run(() => logSickCall(n, daysAgo)); setOpen(false); setQ("") }} className="rounded-full border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2.5 text-[16px] font-semibold text-[var(--tk-ink)] active:scale-[0.98]">
                {n}{counts.get(n) ? <span className="ml-2 text-[13px] font-normal text-[var(--tk-warn)]">{counts.get(n)} this month</span> : null}
              </button>
            ))}
            {shown.length === 0 ? <p className="text-[15px] text-[var(--tk-ink-mute)]">No one on the Burleigh roster matches that.</p> : null}
          </div>
        </div>
      ) : null}
      {board.sickThisMonth.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {board.sickThisMonth.map((c) => (
            <span key={c.id} className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] font-semibold", (counts.get(c.name) ?? 0) >= 2 ? "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]" : "bg-[var(--tk-charcoal-soft)] text-[var(--tk-ink-soft)]")}>
              {c.name} <span className="font-normal">{c.when}</span>
              {c.today ? <button disabled={busy} onClick={() => run(() => undoSickCall(c.id))} className="ml-1 underline" title="Mis-tap? Take it back">undo</button> : null}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}
