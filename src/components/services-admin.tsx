"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Check, Mail, Pencil, Plus, Trash2 } from "lucide-react"
import {
  confirmServiceVisit,
  deleteServiceVisit,
  markVisitCompleted,
  upsertServiceProgram,
  upsertServiceVisit,
  type ProgramInput,
  type ServiceProgramRow,
  type VisitInput,
} from "@/lib/actions/services"
import { SERVICE_CATEGORIES, STATUS_LABEL } from "@/lib/services/constants"

const VENUE_LABELS: Record<string, string> = {
  BURLEIGH: "Burleigh",
  BEACH_HOUSE: "Beach House (Currumbin)",
}

const STATUS_CLASS: Record<string, string> = {
  OVERDUE: "bg-orange-100 text-orange-800",
  DUE_SOON: "bg-amber-100 text-amber-800",
  BOOKED: "bg-emerald-100 text-emerald-800",
  OK: "bg-muted text-muted-foreground",
  NO_RECORD: "bg-muted text-muted-foreground",
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function ServicesAdmin({ programs }: { programs: ServiceProgramRow[] }) {
  const router = useRouter()
  const reviewQueue = useMemo(
    () =>
      programs.flatMap((p) =>
        p.visits.filter((v) => v.needsReview).map((visit) => ({ program: p, visit }))
      ),
    [programs]
  )

  return (
    <div className="space-y-8">
      {reviewQueue.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 font-medium">
            <Mail className="h-4 w-4" />
            Picked up from email, needs a look ({reviewQueue.length})
          </h2>
          <div className="mt-3 space-y-2">
            {reviewQueue.map(({ program, visit }) => (
              <ReviewRow
                key={visit.id}
                program={program}
                visit={visit}
                onDone={() => router.refresh()}
              />
            ))}
          </div>
        </section>
      )}

      {(["BURLEIGH", "BEACH_HOUSE"] as const).map((venue) => (
        <VenueSection
          key={venue}
          venue={venue}
          programs={programs.filter((p) => p.venue === venue)}
          onChanged={() => router.refresh()}
        />
      ))}
    </div>
  )
}

function ReviewRow({
  program,
  visit,
  onDone,
}: {
  program: ServiceProgramRow
  visit: ServiceProgramRow["visits"][number]
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white p-3">
      <div className="min-w-0">
        <div className="font-medium">
          {program.displayLabel}
          <span className="ml-2 text-sm text-muted-foreground">
            {VENUE_LABELS[program.venue]}
          </span>
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {visit.kind === "BOOKED" ? "Booked for" : "Done"} {fmtDate(visit.serviceDate)}
          {visit.providerName ? ` · ${visit.providerName}` : ""}
          {visit.costCents != null ? ` · $${(visit.costCents / 100).toFixed(2)}` : ""}
        </div>
        {visit.emailSubject && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            ✉ {visit.emailSubject}
          </div>
        )}
        {visit.notes && <div className="mt-0.5 text-xs text-muted-foreground">{visit.notes}</div>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          disabled={pending}
          onClick={() => startTransition(async () => (await confirmServiceVisit(visit.id), onDone()))}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" /> Looks right
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Delete this auto-detected visit? (It was misread from an email.)")) return
            startTransition(async () => (await deleteServiceVisit(visit.id), onDone()))
          }}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Not a service
        </button>
      </div>
    </div>
  )
}

function VenueSection({
  venue,
  programs,
  onChanged,
}: {
  venue: "BURLEIGH" | "BEACH_HOUSE"
  programs: ServiceProgramRow[]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<ProgramInput | null>(null)
  const [addingVisitFor, setAddingVisitFor] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const active = programs.filter((p) => p.active)
  const inactive = programs.filter((p) => !p.active)

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold">{VENUE_LABELS[venue]}</h2>
        <button
          onClick={() =>
            setEditing({ venue, category: "other", intervalDays: null, active: true })
          }
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Add service
        </button>
      </div>

      <div className="space-y-2">
        {active.map((p) => (
          <div key={p.id} className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.displayLabel}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[p.schedule.status]}`}
                  >
                    {STATUS_LABEL[p.schedule.status]}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  Last {fmtDate(p.schedule.lastDone)} · Next {fmtDate(p.schedule.nextDue)}
                  {p.intervalDays ? ` · every ${p.intervalDays}d` : " · ad-hoc"}
                  {p.providerName ? ` · ${p.providerName}` : ""}
                </div>
              </button>
              <div className="flex shrink-0 gap-1.5">
                <button
                  title="Log a visit"
                  onClick={() => setAddingVisitFor(addingVisitFor === p.id ? null : p.id)}
                  className="rounded-md border p-2 hover:bg-muted"
                >
                  <CalendarClock className="h-4 w-4" />
                </button>
                <button
                  title="Edit service"
                  onClick={() =>
                    setEditing({
                      id: p.id,
                      venue: p.venue,
                      category: p.category,
                      label: p.label ?? "",
                      providerName: p.providerName ?? "",
                      providerPhone: p.providerPhone ?? "",
                      providerEmails: p.providerEmails,
                      intervalDays: p.intervalDays,
                      notes: p.notes ?? "",
                      active: p.active,
                    })
                  }
                  className="rounded-md border p-2 hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>

            {addingVisitFor === p.id && (
              <div className="border-t bg-muted/30 p-3">
                <VisitForm
                  programId={p.id}
                  onDone={() => {
                    setAddingVisitFor(null)
                    onChanged()
                  }}
                />
              </div>
            )}

            {expanded === p.id && (
              <div className="border-t p-3">
                {p.visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {p.visits.map((v) => (
                      <VisitAdminRow key={v.id} visit={v} onChanged={onChanged} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {inactive.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {inactive.length} switched off
          </summary>
          <div className="mt-2 space-y-2">
            {inactive.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
              >
                <span>{p.displayLabel}</span>
                <button
                  onClick={() =>
                    setEditing({
                      id: p.id,
                      venue: p.venue,
                      category: p.category,
                      label: p.label ?? "",
                      providerName: p.providerName ?? "",
                      providerPhone: p.providerPhone ?? "",
                      providerEmails: p.providerEmails,
                      intervalDays: p.intervalDays,
                      notes: p.notes ?? "",
                      active: p.active,
                    })
                  }
                  className="rounded-md border p-1.5 hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {editing && editing.venue === venue && (
        <ProgramForm
          input={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </section>
  )
}

function ProgramForm({
  input,
  onClose,
  onSaved,
}: {
  input: ProgramInput
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProgramInput>(input)
  const [emailsText, setEmailsText] = useState((input.providerEmails ?? []).join(", "))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await upsertServiceProgram({
          ...form,
          providerEmails: emailsText.split(",").map((e) => e.trim()).filter(Boolean),
        })
        onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save")
      }
    })
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border px-3 py-2 text-sm"
          placeholder='Name override (e.g. "Coolroom deep clean"), optional'
          value={form.label ?? ""}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Provider (company)"
          value={form.providerName ?? ""}
          onChange={(e) => setForm({ ...form, providerName: e.target.value })}
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Provider phone"
          value={form.providerPhone ?? ""}
          onChange={(e) => setForm({ ...form, providerPhone: e.target.value })}
        />
        <input
          className="rounded-md border px-3 py-2 text-sm md:col-span-2"
          placeholder="Provider email addresses, comma-separated (helps the email sweep find them)"
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
        />
        <input
          type="number"
          min={1}
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Every N days (blank = ad-hoc)"
          value={form.intervalDays ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              intervalDays: e.target.value ? parseInt(e.target.value, 10) : null,
            })
          }
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active ?? true}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active (shows on the staff calendar)
        </label>
        <textarea
          className="rounded-md border px-3 py-2 text-sm md:col-span-2"
          rows={2}
          placeholder="Notes: account numbers, gate codes, what the contract covers"
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium">
          Cancel
        </button>
      </div>
    </div>
  )
}

function VisitForm({ programId, onDone }: { programId: string; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState<VisitInput>({
    programId,
    kind: "COMPLETED",
    serviceDate: today,
  })
  const [cost, setCost] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await upsertServiceVisit({
          ...form,
          costCents: cost ? Math.round(parseFloat(cost) * 100) : null,
        })
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save")
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as VisitInput["kind"] })}
        >
          <option value="COMPLETED">Done</option>
          <option value="BOOKED">Booked</option>
        </select>
        <input
          type="date"
          className="rounded-md border px-3 py-2 text-sm"
          value={form.serviceDate}
          onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Provider"
          value={form.providerName ?? ""}
          onChange={(e) => setForm({ ...form, providerName: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Cost ex GST ($)"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </div>
      <input
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="Notes (optional)"
        value={form.notes ?? ""}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save visit"}
        </button>
      </div>
    </div>
  )
}

function VisitAdminRow({
  visit: v,
  onChanged,
}: {
  visit: ServiceProgramRow["visits"][number]
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const today = new Date().toISOString().slice(0, 10)
  const staleBooking = v.kind === "BOOKED" && v.serviceDate < today
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <span className="font-medium">{fmtDate(v.serviceDate)}</span>
        <span className="ml-2 text-muted-foreground">
          {v.kind === "BOOKED" ? (staleBooking ? "booked (date passed)" : "booked") : "done"}
          {v.providerName ? ` · ${v.providerName}` : ""}
          {v.costCents != null ? ` · $${(v.costCents / 100).toFixed(2)}` : ""}
          {v.source === "EMAIL" ? " · from email" : ""}
          {v.recordedBy ? ` · by ${v.recordedBy}` : ""}
        </span>
        {v.notes && <div className="text-xs text-muted-foreground">{v.notes}</div>}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {staleBooking && (
          <button
            disabled={pending}
            onClick={() => startTransition(async () => (await markVisitCompleted(v.id), onChanged()))}
            className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
            title="It went ahead on the booked date"
          >
            It happened
          </button>
        )}
        <button
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Delete this visit?")) return
            startTransition(async () => (await deleteServiceVisit(v.id), onChanged()))
          }}
          className="rounded-md border p-1.5 text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
