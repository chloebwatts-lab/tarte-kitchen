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
import { staffAddServiceVisit, type ServiceProgramRow } from "@/lib/actions/services"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"

type VisitKind = "COMPLETED" | "BOOKED"
/** Which card has its inline form open, and for what. */
type Marking = { id: string; kind: VisitKind } | null
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

export function ServicesCalendar({ programs: allPrograms }: { programs: ServiceProgramRow[] }) {
  const router = useRouter()
  const [marking, setMarking] = useState<Marking>(null)
  const [view, setView] = useState<"list" | "calendar">("list")
  // One service at a time: tap Pest control and the card, its next booking
  // and its history are all that's left on the page.
  const [filter, setFilter] = useState<string | null>(null)
  const programs = useMemo(
    () => (filter ? allPrograms.filter((p) => p.id === filter) : allPrograms),
    [allPrograms, filter]
  )

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
      {/* Service filter + view toggle */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter(null)}
            className={`rounded-full px-3.5 py-2 text-[14px] font-bold transition active:scale-[0.98] ${
              filter === null
                ? "bg-[var(--tk-charcoal)] text-white"
                : "border border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-ink-soft)]"
            }`}
          >
            All services
          </button>
          {allPrograms.map((p) => {
            const st = STATUS_STYLE[p.schedule.status]
            const active = filter === p.id
            return (
              <button
                key={p.id}
                onClick={() => setFilter(active ? null : p.id)}
                className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] font-bold transition active:scale-[0.98] ${
                  active
                    ? "bg-[var(--tk-charcoal)] text-white"
                    : "border border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)]"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: active ? "white" : st.fg }}
                  aria-hidden
                />
                {p.displayLabel}
              </button>
            )
          })}
        </div>
        <div className="flex shrink-0 rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-1">
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
          marking={marking}
          setMarking={setMarking}
          upcoming={upcoming}
          historyByMonth={historyByMonth}
          onSaved={() => {
            setMarking(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function ListView({
  programs,
  marking,
  setMarking,
  upcoming,
  historyByMonth,
  onSaved,
}: {
  programs: ServiceProgramRow[]
  marking: Marking
  setMarking: (m: Marking) => void
  upcoming: Array<{ program: ServiceProgramRow; visit: ServiceProgramRow["visits"][number] }>
  historyByMonth: Array<{
    month: string
    entries: Array<{ program: ServiceProgramRow; visit: ServiceProgramRow["visits"][number] }>
  }>
  onSaved: () => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-8">
      {/* Status board: one card per service */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {programs.map((p) => (
          <ProgramCard
            key={p.id}
            program={p}
            marking={marking?.id === p.id ? marking.kind : null}
            onToggleMark={(kind) =>
              setMarking(marking?.id === p.id && marking.kind === kind ? null : { id: p.id, kind })
            }
            onSaved={onSaved}
          />
        ))}
      </div>

      {/* Coming up */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h2 className="tk-caps text-[13px] text-[var(--tk-ink-mute)]">Booked in</h2>
          <button
            onClick={() => setAdding((a) => !a)}
            className="flex items-center gap-1.5 rounded-full border border-[var(--tk-line)] bg-[var(--tk-card)] px-3.5 py-2 text-[14px] font-bold text-[var(--tk-charcoal)] transition active:scale-[0.98]"
          >
            {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {adding ? "Cancel" : "Add a booking"}
          </button>
        </div>
        {adding ? (
          <div className="mb-3 rounded-[18px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4">
            <p className="mb-3 text-[15px] text-[var(--tk-ink-soft)]">
              Bookings from emails land here on their own. Booked by phone, or an email that
              never came through? Put it on the calendar here.
            </p>
            <VisitForm programs={programs} kind="BOOKED" allowKind onSaved={onSaved} />
          </div>
        ) : null}
        {upcoming.length === 0 ? (
          <div className="rounded-[18px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
            Nothing booked in yet. Bookings picked up from emails land here on their own; if one
            was booked by phone, add it above.
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
  marking: VisitKind | null
  onToggleMark: (kind: VisitKind) => void
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tk-line)] pt-3">
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
        <div className="flex shrink-0 items-center gap-1.5">
          {(
            [
              ["COMPLETED", "They came"],
              ["BOOKED", "Book it in"],
            ] as [VisitKind, string][]
          ).map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => onToggleMark(kind)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-bold transition active:scale-[0.98] ${
                marking === kind
                  ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
                  : "border-[var(--tk-line)] text-[var(--tk-charcoal)]"
              }`}
            >
              {marking === kind ? <X className="h-3.5 w-3.5" /> : kind === "BOOKED" ? <CalendarClock className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {marking === kind ? "Cancel" : label}
            </button>
          ))}
        </div>
      </div>

      {marking ? (
        <div className="mt-3 rounded-[14px] bg-[var(--tk-bg)] p-3">
          <VisitForm programs={[p]} kind={marking} onSaved={onSaved} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * One form for both "they came" and "book it in". With one program it is the
 * card's inline form; with several it asks which service first. `allowKind`
 * adds a happened / booked toggle for the catch-all "Add a booking" box.
 */
function VisitForm({
  programs,
  kind: initialKind,
  allowKind,
  onSaved,
}: {
  programs: ServiceProgramRow[]
  kind: VisitKind
  allowKind?: boolean
  onSaved: () => void
}) {
  const [programId, setProgramId] = useState(programs.length === 1 ? programs[0].id : "")
  const [kind, setKind] = useState<VisitKind>(initialKind)
  const [date, setDate] = useState(todayStr())
  const [name, setName] = useRememberedName()
  const [provider, setProvider] = useState(
    programs.length === 1 ? (programs[0].providerName ?? "") : ""
  )
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const program = programs.find((p) => p.id === programId) ?? null

  function pickProgram(id: string) {
    setProgramId(id)
    const p = programs.find((x) => x.id === id)
    if (p?.providerName && !provider.trim()) setProvider(p.providerName)
  }

  function save() {
    if (!program) {
      setError("Pick which service it is")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await staffAddServiceVisit({
          programId: program.id,
          kind,
          serviceDate: date,
          recordedBy: name,
          providerName: provider,
          notes,
        })
        onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save")
      }
    })
  }

  const field =
    "rounded-lg border border-[var(--tk-line)] bg-white px-3 py-2.5 text-[15px] text-[var(--tk-charcoal)]"
  const seg = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-[14px] font-bold transition ${
      active ? "bg-[var(--tk-charcoal)] text-white" : "text-[var(--tk-ink-soft)]"
    }`

  return (
    <div className="space-y-2">
      {programs.length > 1 ? (
        <select value={programId} onChange={(e) => pickProgram(e.target.value)} className={`w-full ${field}`}>
          <option value="">Which service?</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayLabel}
              {p.providerName ? ` · ${p.providerName}` : ""}
            </option>
          ))}
        </select>
      ) : null}
      {allowKind ? (
        <div className="flex rounded-lg border border-[var(--tk-line)] bg-white p-1">
          <button onClick={() => setKind("BOOKED")} className={seg(kind === "BOOKED")}>
            Booked for a date
          </button>
          <button onClick={() => setKind("COMPLETED")} className={seg(kind === "COMPLETED")}>
            Already happened
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="tk-caps text-[11px] text-[var(--tk-ink-mute)]">
            {kind === "BOOKED" ? "Booked for" : "Done on"}
          </span>
          <input
            type="date"
            value={date}
            min={kind === "BOOKED" ? todayStr() : undefined}
            max={kind === "COMPLETED" ? todayStr() : undefined}
            onChange={(e) => setDate(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="tk-caps text-[11px] text-[var(--tk-ink-mute)]">Your name</span>
          <input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <input
        placeholder="Who's coming (optional)"
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        className={`w-full ${field}`}
      />
      <input
        placeholder="Anything worth noting (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className={`w-full ${field}`}
      />
      {error ? <p className="text-[13px] font-semibold text-[var(--tk-warn)]">{error}</p> : null}
      <button
        onClick={save}
        disabled={pending || !name.trim() || !programId}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tk-charcoal)] px-4 py-2.5 text-[15px] font-bold text-white disabled:opacity-40"
      >
        {kind === "BOOKED" ? <CalendarClock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {pending ? "Saving…" : kind === "BOOKED" ? "Put it on the calendar" : "Mark done"}
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
