"use client"

import { useState, useTransition } from "react"
import { Plus, Pencil, Trash2, ShieldCheck, GraduationCap } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import {
  createTrainingRecord,
  updateTrainingRecord,
  deleteTrainingRecord,
  type TrainingRecordDto,
  type TrainingRecordInput,
} from "@/lib/actions/training"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

const inputClass =
  "w-full rounded-[10px] border border-[var(--tk-line)] bg-white px-3 py-2.5 text-[15px] text-[var(--tk-ink)] focus:border-[var(--tk-charcoal)] focus:outline-none"

function todayIso() {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const ITEMS: {
  key: keyof Pick<
    TrainingRecordDto,
    "allergenTrainedAt" | "inductionAt" | "illnessPolicyAt" | "recordsTrainedAt"
  >
  label: string
  hint: string
}[] = [
  {
    key: "inductionAt",
    label: "Safe food handling induction",
    hint: "Temp limits, cooling rules, date labels, cleaning, hygiene",
  },
  {
    key: "allergenTrainedAt",
    label: "Allergen awareness",
    hint: "Allergen matrix walk-through, cross contact rules",
  },
  {
    key: "illnessPolicyAt",
    label: "Illness reporting",
    hint: "Report symptoms before shift, 48 hr exclusion",
  },
  {
    key: "recordsTrainedAt",
    label: "Venue records training",
    hint: "Checklists, temp logs, cooling + wastage on the iPad",
  },
]

export function TrainingDashboard({
  venue,
  initialRecords,
}: {
  venue: Venue
  initialRecords: TrainingRecordDto[]
}) {
  const [records] = useState(initialRecords)
  const [openForm, setOpenForm] = useState<null | { record: TrainingRecordDto | null }>(
    null
  )
  const [, startTransition] = useTransition()

  const complete = records.filter((r) => r.complete)
  const inProgress = records.filter((r) => !r.complete)

  const remove = (r: TrainingRecordDto) => {
    if (!window.confirm(`Delete the training record for ${r.staffName}?`)) return
    startTransition(async () => {
      await deleteTrainingRecord(r.id)
      window.location.reload()
    })
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <KitchenButton variant="primary" size="lg" onClick={() => setOpenForm({ record: null })}>
          <Plus className="h-5 w-5" />
          Add staff record
        </KitchenButton>
      </div>

      <section>
        <h2 className="tk-caps mb-3" style={{ color: "var(--tk-ink-soft)", fontSize: 12 }}>
          In progress · {inProgress.length}
        </h2>
        {inProgress.length === 0 ? (
          <EmptyState text="No in-progress records. Add one per staff member — every food handler needs a completed record." />
        ) : (
          <div className="space-y-3">
            {inProgress.map((r) => (
              <RecordCard key={r.id} record={r} onEdit={() => setOpenForm({ record: r })} onDelete={() => remove(r)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="tk-caps mb-3" style={{ color: "var(--tk-ink-soft)", fontSize: 12 }}>
          Complete · {complete.length}
        </h2>
        {complete.length === 0 ? (
          <EmptyState text="No completed records yet. A record is complete when every item is dated and a manager has verified it." />
        ) : (
          <div className="space-y-2">
            {complete.map((r) => (
              <RecordCard key={r.id} record={r} onEdit={() => setOpenForm({ record: r })} onDelete={() => remove(r)} />
            ))}
          </div>
        )}
      </section>

      {openForm && (
        <RecordForm
          venue={venue}
          record={openForm.record}
          onClose={() => setOpenForm(null)}
        />
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-8 text-center text-[14px] text-[var(--tk-ink-soft)]">
      {text}
    </div>
  )
}

function Chip({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: done ? "var(--tk-done-soft)" : "var(--tk-charcoal-soft)",
        color: done ? "var(--tk-done)" : "var(--tk-ink-soft)",
      }}
    >
      {label}
    </span>
  )
}

function RecordCard({
  record,
  onEdit,
  onDelete,
}: {
  record: TrainingRecordDto
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              {record.staffName}
            </div>
            {record.role && (
              <span className="text-[13px] text-[var(--tk-ink-soft)]">· {record.role}</span>
            )}
            {record.complete && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "var(--tk-done-soft)", color: "var(--tk-done)" }}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Complete
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip
              label={
                record.onlineCourseDate
                  ? `Online course ${formatDate(record.onlineCourseDate)}${record.certificateSighted ? " (cert filed)" : ""}`
                  : "Online course pending"
              }
              done={!!record.onlineCourseDate}
            />
            {ITEMS.map((it) => (
              <Chip
                key={it.key}
                label={
                  record[it.key] ? `${it.label} ${formatDate(record[it.key])}` : `${it.label} pending`
                }
                done={!!record[it.key]}
              />
            ))}
            <Chip
              label={
                record.verifiedBy
                  ? `Verified by ${record.verifiedBy}${record.verifiedAt ? ` ${formatDate(record.verifiedAt)}` : ""}`
                  : "Verification pending"
              }
              done={!!record.verifiedBy}
            />
          </div>
          {record.notes && (
            <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">{record.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onEdit}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition hover:bg-[var(--tk-charcoal)] hover:text-white"
            aria-label={`Edit ${record.staffName}`}
          >
            <Pencil className="h-[16px] w-[16px]" />
          </button>
          <button
            onClick={onDelete}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition hover:bg-[#a33] hover:text-white"
            aria-label={`Delete ${record.staffName}`}
          >
            <Trash2 className="h-[16px] w-[16px]" />
          </button>
        </div>
      </div>
    </div>
  )
}

function DateItemRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  const done = !!value
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[var(--tk-line)] bg-white px-3 py-2.5">
      <input
        type="checkbox"
        className="h-5 w-5 shrink-0 accent-[var(--tk-sage)]"
        checked={done}
        onChange={(e) => onChange(e.target.checked ? todayIso() : "")}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold leading-tight text-[var(--tk-charcoal)]">
          {label}
        </div>
        <div className="text-[12px] leading-snug text-[var(--tk-ink-soft)]">{hint}</div>
      </div>
      {done && (
        <input
          type="date"
          className="w-[150px] shrink-0 rounded-[8px] border border-[var(--tk-line)] px-2 py-1.5 text-[13px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

function RecordForm({
  venue,
  record,
  onClose,
}: {
  venue: Venue
  record: TrainingRecordDto | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [staffName, setStaffName] = useState(record?.staffName ?? "")
  const [role, setRole] = useState(record?.role ?? "")
  const [onlineCourse, setOnlineCourse] = useState(record?.onlineCourse ?? "")
  const [onlineCourseDate, setOnlineCourseDate] = useState(record?.onlineCourseDate ?? "")
  const [certificateSighted, setCertificateSighted] = useState(record?.certificateSighted ?? false)
  const [inductionAt, setInductionAt] = useState(record?.inductionAt ?? "")
  const [allergenTrainedAt, setAllergenTrainedAt] = useState(record?.allergenTrainedAt ?? "")
  const [illnessPolicyAt, setIllnessPolicyAt] = useState(record?.illnessPolicyAt ?? "")
  const [recordsTrainedAt, setRecordsTrainedAt] = useState(record?.recordsTrainedAt ?? "")
  const [verifiedBy, setVerifiedBy] = useState(record?.verifiedBy ?? "")
  const [verifiedAt, setVerifiedAt] = useState(record?.verifiedAt ?? "")
  const [notes, setNotes] = useState(record?.notes ?? "")
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    if (!staffName.trim()) return setError("Staff name required")
    const input: TrainingRecordInput = {
      staffName,
      role: role || null,
      onlineCourse: onlineCourse || null,
      onlineCourseDate: onlineCourseDate || null,
      certificateSighted,
      inductionAt: inductionAt || null,
      allergenTrainedAt: allergenTrainedAt || null,
      illnessPolicyAt: illnessPolicyAt || null,
      recordsTrainedAt: recordsTrainedAt || null,
      verifiedBy: verifiedBy || null,
      verifiedAt: verifiedBy ? verifiedAt || todayIso() : null,
      notes: notes || null,
    }
    startTransition(async () => {
      try {
        if (record) await updateTrainingRecord(record.id, input)
        else await createTrainingRecord(venue, input)
        onClose()
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed")
      }
    })
  }

  const itemState: Record<string, [string, (v: string) => void]> = {
    inductionAt: [inductionAt, setInductionAt],
    allergenTrainedAt: [allergenTrainedAt, setAllergenTrainedAt],
    illnessPolicyAt: [illnessPolicyAt, setIllnessPolicyAt],
    recordsTrainedAt: [recordsTrainedAt, setRecordsTrainedAt],
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="my-0 max-h-[95vh] w-full max-w-[620px] overflow-y-auto rounded-t-[24px] bg-white p-6 sm:my-6 sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="tk-display mb-1 flex items-center gap-2 leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          <GraduationCap className="h-6 w-6" />
          {record ? `Update ${record.staffName}` : "Add staff record"}
        </div>
        <p className="mb-4 text-[13px] text-[var(--tk-ink-soft)]">
          Tick each item once it has been done with the staff member. Ticking uses
          today&apos;s date; adjust if it happened earlier.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Staff name</FieldLabel>
              <input
                autoFocus={!record}
                className={inputClass}
                placeholder="Full name"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Role</FieldLabel>
              <input
                className={inputClass}
                placeholder="e.g. Barista, Pastry chef"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] p-3">
            <FieldLabel>Online food handler course</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <select
                className={inputClass}
                value={onlineCourse}
                onChange={(e) => setOnlineCourse(e.target.value)}
              >
                <option value="">Not done yet</option>
                <option value="DoFoodSafely">DoFoodSafely (free)</option>
                <option value="I'm Alert">I&apos;m Alert (free, GCCC)</option>
                <option value="Other">Other</option>
              </select>
              <input
                type="date"
                className={inputClass}
                value={onlineCourseDate}
                onChange={(e) => setOnlineCourseDate(e.target.value)}
                disabled={!onlineCourse}
              />
            </div>
            <label className="mt-2 flex items-center gap-2 text-[13px] text-[var(--tk-charcoal)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--tk-sage)]"
                checked={certificateSighted}
                onChange={(e) => setCertificateSighted(e.target.checked)}
              />
              Completion certificate sighted / filed
            </label>
          </div>

          <div className="space-y-2">
            {ITEMS.map((it) => {
              const [value, setValue] = itemState[it.key]
              return (
                <DateItemRow
                  key={it.key}
                  label={it.label}
                  hint={it.hint}
                  value={value}
                  onChange={setValue}
                />
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Verified by (manager / FSS)</FieldLabel>
              <input
                className={inputClass}
                placeholder="Manager name"
                value={verifiedBy}
                onChange={(e) => setVerifiedBy(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Verified on</FieldLabel>
              <input
                type="date"
                className={inputClass}
                value={verifiedAt}
                onChange={(e) => setVerifiedAt(e.target.value)}
                disabled={!verifiedBy}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Notes</FieldLabel>
            <input
              className={inputClass}
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-[13px] font-semibold" style={{ color: "#a33" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <KitchenButton variant="secondary" onClick={onClose}>
              Cancel
            </KitchenButton>
            <KitchenButton variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : record ? "Save changes" : "Add record"}
            </KitchenButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)]"
      style={{ letterSpacing: "0.08em" }}
    >
      {children}
    </label>
  )
}
