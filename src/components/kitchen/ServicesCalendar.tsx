"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  Mail,
  Phone,
  Plus,
  X,
} from "lucide-react"
import { staffMarkServiceDone, type ServiceProgramRow } from "@/lib/actions/services"
import { STATUS_LABEL } from "@/lib/services/constants"

const STATUS_STYLE: Record<
  ServiceProgramRow["schedule"]["status"],
  { bg: string; fg: string }
> = {
  OVERDUE: { bg: "var(--tk-warn-soft)", fg: "var(--tk-warn)" },
  DUE_SOON: { bg: "var(--tk-gold-soft)", fg: "#8a6d1d" },
  BOOKED: { bg: "var(--tk-done-soft)", fg: "var(--tk-done)" },
  OK: { bg: "var(--tk-sage-soft)", fg: "#5f7f6f" },
  NO_RECORD: { bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" },
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

function fmtMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00`)
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
}

function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

export function ServicesCalendar({ programs }: { programs: ServiceProgramRow[] }) {
  const router = useRouter()
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [view, setView] = useState<"list" | "calendar">("list")

  // One flat feed of everything, for the month-grouped calendar view:
  // future bookings ascending on top, history descending below.
  const { upcoming, history } = useMemo(() => {
    const today = todayStr()
    const all = programs.flatMap((p) =>
      p.visits.map((v) => ({ program: p, visit: v }))
    )
    const upcoming = all
      .filter((e) => e.visit.serviceDate >= today && e.visit.kind === "BOOKED")
      .sort((a, b) => a.visit.serviceDate.localeCompare(b.visit.serviceDate))
    const history = all
      .filter((e) => !(e.visit.serviceDate >= today && e.visit.kind === "BOOKED"))
      .sort((a, b) => b.visit.serviceDate.localeCompare(a.visit.serviceDate))
    return { upcoming, history }
  }, [programs])

  const historyByMonth = useMemo(() => {
    const groups: Array<{ month: string; entries: typeof history }> = []
    for (const e of history) {
      const month = e.visit.serviceDate.slice(0, 7)
      const last = groups[groups.length - 1]
      if (last && last.month === month) last.entries.push(e)
      else groups.push({ month, entries: [e] })
    }
    return groups
  }, [history])

  return (
    <div className="space-y-8">
      {/* View toggle */}
      <div className="flex justify-end px-1">
        <div className="flex rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-1">
          {(
            [
              { key: "list", label: "List", icon: List },
              { key: "calendar", label: "Calendar", icon: CalendarDays },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-bold transition ${
                view === v.key
                  ? "bg-[var(--tk-charcoal)] text-white"
                  : "text-[var(--tk-ink-soft)] hover:text-[var(--tk-charcoal)]"
              }`}
            >
              <v.icon className="h-4 w-4" /> {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "calendar" ? (
        <YearCalendar programs={programs} />
      ) : (
        <ListView
          programs={programs}
          markingId={markingId}
          setMarkingId={setMarkingId}
          upcoming={upcoming}
          historyByMonth={historyByMonth}
          onSaved={() => {
            setMarkingId(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function ListView({
  programs,
  markingId,
  setMarkingId,
  upcoming,
  historyByMonth,
  onSaved,
}: {
  programs: ServiceProgramRow[]
  markingId: string | null
  setMarkingId: (id: string | null) => void
  upcoming: Array<{ program: ServiceProgramRow; visit: ServiceProgramRow["visits"][number] }>
  historyByMonth: Array<{
    month: string
    entries: Array<{ program: ServiceProgramRow; visit: ServiceProgramRow["visits"][number] }>
  }>
  onSaved: () => void
}) {
  return (
    <div className="space-y-8">
      {/* Status board: one card per service */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {programs.map((p) => (
          <ProgramCard
            key={p.id}
            program={p}
            marking={markingId === p.id}
            onToggleMark={() => setMarkingId(markingId === p.id ? null : p.id)}
            onSaved={onSaved}
          />
        ))}
      </div>

      {/* Coming up */}
      <section>
        <h2 className="tk-caps mb-3 px-1 text-[13px] text-[var(--tk-ink-mute)]">Booked in</h2>
        {upcoming.length === 0 ? (
          <div className="rounded-[18px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
            Nothing booked in yet. Bookings picked up from emails land here on their own.
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <VisitRow key={e.visit.id} entry={e} upcoming />
            ))}
          </div>
        )}
      </section>

      {/* History, month by month */}
      <section>
        <h2 className="tk-caps mb-3 px-1 text-[13px] text-[var(--tk-ink-mute)]">History</h2>
        {historyByMonth.length === 0 ? (
          <div className="rounded-[18px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
            No services recorded yet. They&apos;ll appear here as invoices and booking
            emails come in, or when someone marks a visit done above.
          </div>
        ) : (
          <div className="space-y-5">
            {historyByMonth.map((g) => (
              <div key={g.month}>
                <div className="mb-2 px-1 text-[15px] font-semibold text-[var(--tk-ink-soft)]">
                  {fmtMonth(`${g.month}-01`)}
                </div>
                <div className="space-y-2">
                  {g.entries.map((e) => (
                    <VisitRow key={e.visit.id} entry={e} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ProgramCard({
  program: p,
  marking,
  onToggleMark,
  onSaved,
}: {
  program: ServiceProgramRow
  marking: boolean
  onToggleMark: () => void
  onSaved: () => void
}) {
  const s = STATUS_STYLE[p.schedule.status]
  return (
    <div className="flex flex-col rounded-[18px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[18px] font-semibold leading-tight text-[var(--tk-charcoal)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            {p.displayLabel}
          </div>
          {p.providerName ? (
            <div className="mt-0.5 truncate text-[13px] text-[var(--tk-ink-soft)]">
              {p.providerName}
            </div>
          ) : null}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold"
          style={{ background: s.bg, color: s.fg }}
        >
          {STATUS_LABEL[p.schedule.status]}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-[14px]">
        <div>
          <div className="tk-caps text-[11px] text-[var(--tk-ink-mute)]">Last done</div>
          <div className="mt-0.5 font-semibold text-[var(--tk-charcoal)]">
            {fmtDate(p.schedule.lastDone)}
          </div>
        </div>
        <div>
          <div className="tk-caps text-[11px] text-[var(--tk-ink-mute)]">
            {p.schedule.status === "BOOKED" ? "Booked for" : "Next due"}
          </div>
          <div className="mt-0.5 font-semibold text-[var(--tk-charcoal)]">
            {fmtDate(p.schedule.nextDue)}
            {p.schedule.status !== "BOOKED" && p.intervalDays && p.schedule.nextDue
              ? ` · every ${Math.round(p.intervalDays / 7)} wks`
              : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--tk-line)] pt-3">
        {p.providerPhone ? (
          <a
            href={`tel:${p.providerPhone.replace(/\s+/g, "")}`}
            className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--tk-ink-soft)]"
          >
            <Phone className="h-4 w-4" /> {p.providerPhone}
          </a>
        ) : (
          <span className="text-[13px] text-[var(--tk-ink-mute)]">{p.blurb}</span>
        )}
        <button
          onClick={onToggleMark}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--tk-line)] px-3 py-1.5 text-[13px] font-bold text-[var(--tk-charcoal)] transition active:scale-[0.98]"
        >
          {marking ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {marking ? "Cancel" : "They came"}
        </button>
      </div>

      {marking ? <MarkDoneForm program={p} onSaved={onSaved} /> : null}
    </div>
  )
}

function MarkDoneForm({
  program,
  onSaved,
}: {
  program: ServiceProgramRow
  onSaved: () => void
}) {
  const [date, setDate] = useState(todayStr())
  const [name, setName] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await staffMarkServiceDone({
          programId: program.id,
          serviceDate: date,
          recordedBy: name,
          notes,
        })
        onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save")
      }
    })
  }

  return (
    <div className="mt-3 space-y-2 rounded-[14px] bg-[var(--tk-bg)] p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2.5 text-[15px]"
        />
        <input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2.5 text-[15px]"
        />
      </div>
      <input
        placeholder="Anything worth noting (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2.5 text-[15px]"
      />
      {error ? <p className="text-[13px] font-semibold text-[var(--tk-warn)]">{error}</p> : null}
      <button
        onClick={save}
        disabled={pending || !name.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tk-charcoal)] px-4 py-2.5 text-[15px] font-bold text-white disabled:opacity-40"
      >
        <Check className="h-4 w-4" /> {pending ? "Saving…" : "Mark done"}
      </button>
    </div>
  )
}

function VisitRow({
  entry: { program, visit },
  upcoming,
}: {
  entry: { program: ServiceProgramRow; visit: ServiceProgramRow["visits"][number] }
  upcoming?: boolean
}) {
  const Icon = visit.kind === "BOOKED" ? CalendarClock : CalendarCheck
  return (
    <div className="flex items-center gap-4 rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
        style={{
          background: upcoming ? "var(--tk-done-soft)" : "var(--tk-sage-soft)",
          color: upcoming ? "var(--tk-done)" : "#5f7f6f",
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
            {program.displayLabel}
          </span>
          {visit.providerName ? (
            <span className="text-[13px] text-[var(--tk-ink-soft)]">{visit.providerName}</span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[var(--tk-ink-soft)]">
          <span className="font-semibold">{fmtDate(visit.serviceDate)}</span>
          {visit.kind === "BOOKED" && !upcoming ? <span>· was booked</span> : null}
          {visit.costCents != null ? (
            <span>· ${(visit.costCents / 100).toFixed(2)}</span>
          ) : null}
          {visit.recordedBy ? <span>· logged by {visit.recordedBy}</span> : null}
          {visit.notes ? <span>· {visit.notes}</span> : null}
        </div>
      </div>
      {visit.source === "EMAIL" ? (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold"
          style={{ background: "var(--tk-charcoal-soft)", color: "var(--tk-ink-soft)" }}
          title={visit.emailSubject ?? undefined}
        >
          <Mail className="h-3 w-3" /> from email
        </span>
      ) : null}
    </div>
  )
}

// ── Year calendar view ──────────────────────────────────────────────────────

interface CalEvent {
  kind: "COMPLETED" | "BOOKED" | "DUE"
  program: ServiceProgramRow
  visit?: ServiceProgramRow["visits"][number]
}

const EVENT_STYLE: Record<CalEvent["kind"], { dot: string; label: string }> = {
  COMPLETED: { dot: "var(--tk-done)", label: "Done" },
  BOOKED: { dot: "#b08a2e", label: "Booked" },
  DUE: { dot: "var(--tk-warn)", label: "Due" },
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function YearCalendar({ programs }: { programs: ServiceProgramRow[] }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [selected, setSelected] = useState<string | null>(null)

  // date (YYYY-MM-DD) -> events. Visits as recorded, plus each program's
  // projected next-due date (skipped when the due date IS a booking,
  // that's already an event).
  const events = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    const push = (date: string, e: CalEvent) => {
      const arr = map.get(date) ?? []
      arr.push(e)
      map.set(date, arr)
    }
    for (const p of programs) {
      for (const v of p.visits) push(v.serviceDate, { kind: v.kind, program: p, visit: v })
      if (p.schedule.nextDue && p.schedule.status !== "BOOKED") {
        push(p.schedule.nextDue, { kind: "DUE", program: p })
      }
    }
    return map
  }, [programs])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-1 rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-1">
          <button
            onClick={() => { setYear(year - 1); setSelected(null) }}
            className="rounded-xl p-2.5 text-[var(--tk-ink-soft)] hover:text-[var(--tk-charcoal)]"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span
            className="tk-display px-2 text-[22px] font-bold text-[var(--tk-charcoal)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            {year}
          </span>
          <button
            onClick={() => { setYear(year + 1); setSelected(null) }}
            className="rounded-xl p-2.5 text-[var(--tk-ink-soft)] hover:text-[var(--tk-charcoal)]"
            aria-label="Next year"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[13px] font-semibold text-[var(--tk-ink-soft)]">
          {(Object.keys(EVENT_STYLE) as Array<CalEvent["kind"]>).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: EVENT_STYLE[k].dot }}
              />
              {EVENT_STYLE[k].label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MONTH_NAMES.map((name, m) => (
          <MonthGrid
            key={m}
            year={year}
            month={m}
            name={name}
            events={events}
            selected={selected}
            onSelect={(d) => setSelected(selected === d ? null : d)}
          />
        ))}
      </div>
    </div>
  )
}

function MonthGrid({
  year,
  month,
  name,
  events,
  selected,
  onSelect,
}: {
  year: number
  month: number
  name: string
  events: Map<string, CalEvent[]>
  selected: string | null
  onSelect: (date: string) => void
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7 // Monday = 0
  const today = todayStr()
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`

  const cells: Array<number | null> = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const selectedInMonth = selected?.startsWith(monthPrefix)
    ? events.get(selected) ?? []
    : null

  return (
    <div className="rounded-[18px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <span
          className="tk-display text-[18px] font-bold text-[var(--tk-charcoal)]"
          style={{ letterSpacing: "-0.015em" }}
        >
          {name}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="pb-1 text-[11px] font-bold text-[var(--tk-ink-mute)]">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`b${i}`} />
          const date = monthPrefix + String(day).padStart(2, "0")
          const evs = events.get(date)
          const isToday = date === today
          const isSelected = date === selected
          return (
            <button
              key={date}
              onClick={() => evs && onSelect(date)}
              disabled={!evs}
              className={`relative mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-[10px] text-[14px] transition ${
                isSelected
                  ? "bg-[var(--tk-charcoal)] font-bold text-white"
                  : evs
                    ? "bg-[var(--tk-bg)] font-bold text-[var(--tk-charcoal)] active:scale-95"
                    : "text-[var(--tk-ink-soft)]"
              } ${isToday && !isSelected ? "ring-2 ring-[var(--tk-sage)]" : ""}`}
            >
              {day}
              {evs ? (
                <span className="mt-0.5 flex gap-[3px]">
                  {evs.slice(0, 3).map((e, j) => (
                    <span
                      key={j}
                      className="inline-block h-[5px] w-[5px] rounded-full"
                      style={{
                        background: isSelected ? "#fff" : EVENT_STYLE[e.kind].dot,
                      }}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {selectedInMonth && selected ? (
        <div className="mt-3 space-y-1.5 border-t border-[var(--tk-line)] pt-3">
          {selectedInMonth.length === 0 ? (
            <p className="text-[13px] text-[var(--tk-ink-soft)]">Nothing on this day.</p>
          ) : (
            selectedInMonth.map((e, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[14px]">
                <span
                  className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: EVENT_STYLE[e.kind].dot }}
                />
                <span className="leading-snug text-[var(--tk-charcoal)]">
                  <span className="font-semibold">{e.program.displayLabel}</span>
                  <span className="text-[var(--tk-ink-soft)]">
                    {e.kind === "DUE"
                      ? " · next due"
                      : e.kind === "BOOKED"
                        ? " · booked"
                        : " · done"}
                    {e.visit?.providerName ? ` · ${e.visit.providerName}` : ""}
                    {e.visit?.costCents != null
                      ? ` · $${(e.visit.costCents / 100).toFixed(2)}`
                      : ""}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
