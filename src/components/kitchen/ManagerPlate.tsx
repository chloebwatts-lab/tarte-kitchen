import Link from "next/link"
import { Check } from "lucide-react"
import { MetaLine, PriorityTag, SectionHead } from "@/components/kitchen/board-bits"
import { CATEGORY, ageLabel, dueLabel, fmtHours, fmtMinutes, whenLabel } from "@/components/kitchen/board-format"
import type { BoardTask, ManagerPlate as PlateData } from "@/lib/actions/venue-ops"

/**
 * The plate: everything on one person, read-only, for the other managers.
 * Georgia's time gets questioned because the list only exists in her head.
 * This is the list, with hours next to it. Nothing here can be actioned,
 * on purpose: the point is to be seen, not taken over.
 */

const dayFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Australia/Brisbane",
})

function Stat({ n, label, tone = "calm" }: { n: string | number; label: string; tone?: "hot" | "warn" | "calm" }) {
  const cls =
    tone === "hot"
      ? "bg-[var(--tk-charcoal)] text-white"
      : tone === "warn"
        ? "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]"
        : "bg-[var(--tk-card)] border-[1.5px] border-[var(--tk-line)] text-[var(--tk-charcoal)]"
  return (
    <span className={`rounded-[12px] px-3.5 py-2 text-[15px] font-semibold ${cls}`}>
      <span className="tk-display text-[18px] font-bold">{n}</span> {label}
    </span>
  )
}

function PlateRow({ task, showOwner }: { task: BoardTask; showOwner?: boolean }) {
  const scheduled = task.reportedBy === "Scheduled"
  const due = task.dueAt ? dueLabel(task.dueAt) : null
  const meta: React.ReactNode[] = []
  if (!task.personal) meta.push(CATEGORY[task.category] ?? task.category)
  if (scheduled) meta.push("Scheduled")
  else if (task.personal) meta.push(`added ${ageLabel(task.ageDays)}`)
  else if (task.reportedBy) meta.push(`${task.reportedBy}, ${ageLabel(task.ageDays)}`)
  else meta.push(ageLabel(task.ageDays))
  if (showOwner && task.ownedBy && task.assignedAt) meta.push(`on ${task.ownedBy} since ${whenLabel(task.assignedAt)}`)
  else if (showOwner && task.ownedBy) meta.push(`on ${task.ownedBy}`)
  if (task.estimateMinutes) meta.push(`about ${fmtMinutes(task.estimateMinutes)}`)
  if (due) {
    meta.push(
      <span key="due" className={due.late ? "font-semibold text-[var(--tk-warn)]" : undefined}>
        {due.text}
      </span>
    )
  }
  return (
    <div className="px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <PriorityTag priority={task.priority} />
        <span className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]">{task.title}</span>
      </div>
      {task.detail ? <p className="mt-0.5 text-[15px] leading-snug text-[var(--tk-ink-soft)]">{task.detail}</p> : null}
      <MetaLine items={meta} />
    </div>
  )
}

function ListBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-[var(--tk-line)] rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)]">
      {children}
    </div>
  )
}

export function ManagerPlate({ plate, venueLabel }: { plate: PlateData; venueLabel: string }) {
  const first = plate.who.split(/\s+/)[0]
  const openCount = plate.open.length + plate.ownList.length
  const sized = openCount - plate.openUnsized

  const sentences: string[] = []
  const split =
    plate.ownList.length === 0
      ? "all from the board"
      : plate.open.length === 0
        ? `all on ${first}'s own list`
        : `${plate.open.length} from the board and ${plate.ownList.length} on ${first}'s own list`
  sentences.push(
    openCount === 0
      ? `${first} has nothing open at ${venueLabel} right now.`
      : `${first} has ${openCount} open item${openCount === 1 ? "" : "s"} at ${venueLabel}, ${split}.`
  )
  if (sized > 0) {
    sentences.push(
      `The ${sized} that have been sized come to ${fmtHours(plate.openMinutes)}${
        plate.openUnsized > 0 ? `, and ${plate.openUnsized} more have no size on them yet` : ""
      }.`
    )
  }
  if (plate.dueThisWeek > 0) {
    sentences.push(
      plate.dueThisWeek === 1 ? "One of the board jobs falls due this week." : `${plate.dueThisWeek} of the board jobs fall due this week.`
    )
  }
  if (plate.chasing.length > 0 || plate.unallocated > 0) {
    const bits: string[] = []
    if (plate.chasing.length > 0) bits.push(`chasing ${plate.chasing.length} job${plate.chasing.length === 1 ? "" : "s"} on other people`)
    if (plate.unallocated > 0) bits.push(`${plate.unallocated} more still to hand out`)
    sentences.push(`On top of that, ${first} is ${bits.join(", with ")}.`)
  }
  if (plate.schedules.length > 0 || plate.areas.length > 0) {
    const bits: string[] = []
    if (plate.schedules.length > 0) bits.push(`${plate.schedules.length} recurring job${plate.schedules.length === 1 ? "" : "s"} due in the next three months`)
    if (plate.areas.length > 0) bits.push(`${plate.areas.length} standing area${plate.areas.length === 1 ? "" : "s"} of the business`)
    sentences.push(`${first} also owns ${bits.join(" and ")}.`)
  }
  if (plate.closed30.length > 0) {
    sentences.push(
      `In the last 30 days ${first} closed ${plate.closed30.length}${
        plate.medianTurnaroundDays !== null ? `, typically ${plate.medianTurnaroundDays} day${plate.medianTurnaroundDays === 1 ? "" : "s"} after it was raised` : ""
      }.`
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Stat n={openCount} label="open" tone="hot" />
        {sized > 0 ? <Stat n={fmtHours(plate.openMinutes).replace(/\s*\(.*\)$/, "")} label="sized so far" /> : null}
        {plate.dueThisWeek > 0 ? <Stat n={plate.dueThisWeek} label="due this week" tone="warn" /> : null}
        {plate.chasing.length > 0 ? <Stat n={plate.chasing.length} label="chasing on others" /> : null}
        {plate.schedules.length > 0 ? <Stat n={plate.schedules.length} label="recurring, next 3 months" /> : null}
        {plate.closed30.length > 0 ? <Stat n={plate.closed30.length} label="closed in 30 days" /> : null}
      </div>

      <p className="max-w-3xl px-1 text-[18px] leading-snug text-[var(--tk-charcoal)]">{sentences.join(" ")}</p>

      {plate.open.length > 0 ? (
        <section className="border-t-[1.5px] border-[var(--tk-line)] pt-5">
          <SectionHead title={`Board jobs on ${first}`} count={plate.open.length} hint="Worst first." />
          <ListBox>
            {plate.open.map((t) => (
              <PlateRow key={t.id} task={t} />
            ))}
          </ListBox>
        </section>
      ) : null}

      {plate.ownList.length > 0 ? (
        <section className="border-t-[1.5px] border-[var(--tk-line)] pt-5">
          <SectionHead
            title={`${first}'s own list`}
            count={plate.ownList.length}
            hint={`${first}'s alone. Listed for the size of it, not for anyone to pick up.`}
          />
          <ListBox>
            {plate.ownList.map((t) => (
              <PlateRow key={t.id} task={t} />
            ))}
          </ListBox>
        </section>
      ) : null}

      {plate.chasing.length > 0 ? (
        <section className="border-t-[1.5px] border-[var(--tk-line)] pt-5">
          <SectionHead title="Chasing on other people" count={plate.chasing.length} hint="Handed out, still open." />
          <ListBox>
            {plate.chasing.map((t) => (
              <PlateRow key={t.id} task={t} showOwner />
            ))}
          </ListBox>
        </section>
      ) : null}

      {plate.schedules.length > 0 ? (
        <section className="border-t-[1.5px] border-[var(--tk-line)] pt-5">
          <SectionHead title="Recurring jobs" count={plate.schedules.length} hint="Due in the next three months." />
          <ListBox>
            {plate.schedules.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 px-4 py-3 md:px-5">
                <span className="min-w-0">
                  <span className="text-[17px] font-semibold text-[var(--tk-charcoal)]">{s.title}</span>
                  <span className="mt-0.5 block text-[14px] text-[var(--tk-ink-soft)]">
                    every {s.everyMonths === 1 ? "month" : s.everyMonths === 12 ? "year" : `${s.everyMonths} months`}
                    {s.raised ? " · on the board now" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[15px] text-[var(--tk-ink-soft)]">
                  {dayFmt.format(new Date(`${s.nextDueAt.slice(0, 10)}T12:00:00+10:00`))}
                </span>
              </div>
            ))}
          </ListBox>
        </section>
      ) : null}

      {plate.areas.length > 0 ? (
        <section className="border-t-[1.5px] border-[var(--tk-line)] pt-5">
          <SectionHead title="Standing responsibilities" count={plate.areas.length} hint="Areas of the business this person owns." />
          <ListBox>
            {plate.areas.map((a) => (
              <div key={a.id} className="px-4 py-3 md:px-5">
                <span className="text-[17px] font-semibold text-[var(--tk-charcoal)]">{a.name}</span>
                <span className="mt-0.5 block text-[14px] text-[var(--tk-ink-soft)]">
                  {a.description ? `${a.description} ` : ""}
                  {a.backupName ? `Backup: ${a.backupName}.` : "No backup named."}
                </span>
              </div>
            ))}
          </ListBox>
        </section>
      ) : null}

      {plate.closed30.length > 0 ? (
        <section className="border-t-[1.5px] border-[var(--tk-line)] pt-5">
          <SectionHead
            title="Closed in the last 30 days"
            count={plate.closed30.length}
            hint={plate.closed7 > 0 ? `${plate.closed7} of them this week.` : undefined}
          />
          <ListBox>
            {plate.closed30.slice(0, 25).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[var(--tk-done)]" />
                  <span className="text-[16px] font-semibold text-[var(--tk-charcoal)]">{d.title}</span>
                  {d.personal ? <span className="text-[13px] text-[var(--tk-ink-mute)]">own list</span> : null}
                </span>
                <span className="shrink-0 text-[14px] text-[var(--tk-ink-soft)]">
                  {whenLabel(d.doneAt)}
                  {!d.personal && d.turnaroundDays > 0 ? ` · ${d.turnaroundDays} day${d.turnaroundDays === 1 ? "" : "s"} open` : ""}
                </span>
              </div>
            ))}
            {plate.closed30.length > 25 ? (
              <div className="px-4 py-2.5 text-[14px] text-[var(--tk-ink-soft)] md:px-5">
                and {plate.closed30.length - 25} more
              </div>
            ) : null}
          </ListBox>
        </section>
      ) : null}

      {openCount === 0 && plate.chasing.length === 0 && plate.schedules.length === 0 && plate.closed30.length === 0 ? (
        <div className="rounded-[20px] bg-[var(--tk-card)] px-6 py-10 text-center">
          <p className="tk-display text-[28px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
            Nothing recorded on {first} at {venueLabel}.
          </p>
          <p className="mt-2 text-[17px] text-[var(--tk-ink-soft)]">
            Jobs land here from the morning board and from {first}&apos;s own list.
          </p>
        </div>
      ) : null}

      <p className="pt-2 text-[15px] text-[var(--tk-ink-soft)]">
        Read-only. To act on any of it, open the{" "}
        <Link href={`/kitchen/managers/board?venue=${plate.venue}`} className="font-semibold text-[var(--tk-charcoal)] underline decoration-[var(--tk-line)] underline-offset-4">
          morning board
        </Link>
        .
      </p>
    </div>
  )
}
