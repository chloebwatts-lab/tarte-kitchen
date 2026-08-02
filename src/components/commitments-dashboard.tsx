"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  CalendarClock,
  Camera,
  Check,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  clearStandingMark,
  createOneOff,
  deleteOneOff,
  markOneOffDone,
  reopenOneOff,
  rescheduleOneOff,
  setStandingMark,
  updateOneOff,
  type CommitmentsBoard,
  type OneOffRow,
  type StandingCell,
} from "@/lib/actions/commitments"
import {
  COMMITMENT_PARTY_LABEL,
  effectiveDueOn,
  formatDayMonth,
  photoKindLabel,
  weekLabel,
  weekRangeLabel,
} from "@/lib/commitments/shared"

const PARTIES = ["JOSE", "CHLOE", "CANDY"] as const
type Party = (typeof PARTIES)[number]

// ─── Standing grid ───────────────────────────────────────────────────

function CellButton({
  cell,
  isCurrentWeek,
  onClick,
}: {
  cell: StandingCell
  isCurrentWeek: boolean
  onClick: () => void
}) {
  const face =
    cell.met === true ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-light text-sm font-bold text-green-text">
        Y
      </span>
    ) : cell.met === false ? (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-light text-sm font-bold text-red-text">
        N
      </span>
    ) : (
      <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-muted-foreground">
        —
      </span>
    )
  return (
    <button
      onClick={onClick}
      title={cell.note ?? undefined}
      className={`relative mx-auto flex h-11 w-11 items-center justify-center rounded-lg border transition hover:bg-muted/60 ${
        isCurrentWeek ? "border-foreground/25" : "border-transparent"
      }`}
    >
      {face}
      {cell.source === "auto" && (
        <Sparkles className="absolute -right-0.5 -top-0.5 h-3 w-3 text-muted-foreground" />
      )}
      {cell.source === "manual" && cell.note && (
        <span className="absolute -right-0 -top-0 h-1.5 w-1.5 rounded-full bg-foreground/50" />
      )}
    </button>
  )
}

// ─── Root dashboard ──────────────────────────────────────────────────

export function CommitmentsDashboard({ board }: { board: CommitmentsBoard }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Standing-cell editor state
  const [cellEdit, setCellEdit] = useState<{
    commitmentId: string
    title: string
    autoSource: string | null
    week: string
    cell: StandingCell
  } | null>(null)
  const [cellMet, setCellMet] = useState<boolean | null>(null)
  const [cellNote, setCellNote] = useState("")

  // One-off dialogs
  const [oneOffForm, setOneOffForm] = useState<{
    mode: "add" | "edit"
    row?: OneOffRow
  } | null>(null)
  const [reschedule, setReschedule] = useState<OneOffRow | null>(null)

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn()
      router.refresh()
    })

  const openCell = (
    row: (typeof board.standing)[number],
    week: string
  ) => {
    const cell = row.cells[week]
    setCellEdit({
      commitmentId: row.id,
      title: row.title,
      autoSource: row.autoSource,
      week,
      cell,
    })
    setCellMet(cell.source === "manual" ? cell.met : null)
    setCellNote(cell.source === "manual" ? (cell.note ?? "") : "")
  }

  const photosByWeek = new Map<string, typeof board.photos>()
  for (const p of board.photos) {
    photosByWeek.set(p.weekStart, [...(photosByWeek.get(p.weekStart) ?? []), p])
  }

  return (
    <div className="space-y-10">
      {/* ── Standing commitments ─────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Standing commitments</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              One tap per week — tap a cell to mark Y/N or add a note.{" "}
              <Sparkles className="inline h-3 w-3" /> = filled automatically
              from app data (a manual mark overrides it).
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 z-10 min-w-[220px] bg-muted/50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  Commitment
                </th>
                {board.weeks.map((w) => (
                  <th
                    key={w}
                    className={`px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide ${
                      w === board.currentWeekStart
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {weekLabel(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.standing.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="sticky left-0 z-10 bg-background px-4 py-2 font-medium">
                    {row.title}
                    {row.description && (
                      <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                        {row.description}
                      </div>
                    )}
                  </td>
                  {board.weeks.map((w) => (
                    <td key={w} className="px-1 py-1 text-center">
                      <CellButton
                        cell={row.cells[w]}
                        isCurrentWeek={w === board.currentWeekStart}
                        onClick={() => openCell(row, w)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── One-off commitments ──────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">One-off commitments</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Firm promises with a firm date. Overdue = past due and not done.
            </p>
          </div>
          <Button size="sm" onClick={() => setOneOffForm({ mode: "add" })}>
            <Plus className="mr-1.5 h-4 w-4" /> Add
          </Button>
        </div>

        {board.oneOffs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing here yet — add the first promise from the meeting sheet.
          </div>
        ) : (
          <div className="space-y-2">
            {board.oneOffs.map((o) => {
              const due = effectiveDueOn(o)
              return (
                <div
                  key={o.id}
                  className={`rounded-lg border p-4 ${
                    o.status === "overdue"
                      ? "border-red-text/40 bg-red-light/40"
                      : "bg-card"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {o.status === "overdue" ? (
                          <Badge variant="red">Overdue</Badge>
                        ) : o.status === "done" ? (
                          <Badge variant="green">Done</Badge>
                        ) : (
                          <Badge variant="secondary">Open</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {COMMITMENT_PARTY_LABEL[o.saidBy]} · agreed{" "}
                          {formatDayMonth(o.agreedOn)}
                        </span>
                      </div>
                      <p className="mt-1.5 font-medium">{o.promise}</p>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {o.newDueOn ? (
                          <>
                            Due{" "}
                            <s className="opacity-70">
                              {formatDayMonth(o.dueOn)}
                            </s>{" "}
                            → <strong>{formatDayMonth(o.newDueOn)}</strong>
                            {o.missedReason ? ` — ${o.missedReason}` : ""}
                          </>
                        ) : (
                          <>Due {formatDayMonth(due)}</>
                        )}
                        {o.doneOn && <> · done {formatDayMonth(o.doneOn)}</>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {o.status !== "done" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(() => markOneOffDone({ id: o.id }))}
                        >
                          <Check className="mr-1 h-4 w-4" /> Done
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => reopenOneOff({ id: o.id }))}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Reopen
                        </Button>
                      )}
                      {o.status !== "done" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setReschedule(o)}
                          title="Missed — set new date + why"
                        >
                          <CalendarClock className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOneOffForm({ mode: "edit", row: o })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          if (confirm("Delete this commitment?"))
                            run(() => deleteOneOff({ id: o.id }))
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Paper sheets ─────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Paper sheets</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Photos of Jose&apos;s paper sheets, filed by week. Upload happens
              on the kitchen iPad page.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/kitchen/commitments/photos">
              <Camera className="mr-1.5 h-4 w-4" /> Open upload page
            </Link>
          </Button>
        </div>
        {board.photos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No sheets photographed yet.
          </div>
        ) : (
          <div className="space-y-4">
            {[...photosByWeek.entries()].map(([week, photos]) => (
              <div key={week}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Week of {weekRangeLabel(week)}
                </div>
                <div className="flex flex-wrap gap-3">
                  {photos.map((p) => (
                    <a
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group w-28"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.caption ?? photoKindLabel(p.kind)}
                        className="h-28 w-28 rounded-lg border object-cover transition group-hover:opacity-90"
                      />
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">
                        {photoKindLabel(p.kind)}
                        {p.caption ? ` · ${p.caption}` : ""}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Standing-cell dialog ─────────────────────────────────── */}
      <Dialog open={cellEdit !== null} onOpenChange={(o) => !o && setCellEdit(null)}>
        <DialogContent className="max-w-md">
          {cellEdit && (
            <>
              <DialogHeader>
                <DialogTitle>{cellEdit.title}</DialogTitle>
                <DialogDescription>
                  Week of {weekRangeLabel(cellEdit.week)}
                  {cellEdit.cell.source === "auto" && cellEdit.cell.note
                    ? ` · auto: ${cellEdit.cell.note}`
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={cellMet === true ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setCellMet(true)}
                  >
                    <Check className="mr-1.5 h-4 w-4" /> Yes
                  </Button>
                  <Button
                    variant={cellMet === false ? "destructive" : "outline"}
                    className="flex-1"
                    onClick={() => setCellMet(false)}
                  >
                    <X className="mr-1.5 h-4 w-4" /> No
                  </Button>
                </div>
                <div>
                  <Label htmlFor="cell-note">Note (optional)</Label>
                  <Textarea
                    id="cell-note"
                    value={cellNote}
                    onChange={(e) => setCellNote(e.target.value)}
                    placeholder="Anything worth remembering about this week"
                    className="mt-1.5"
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                {cellEdit.cell.source === "manual" ? (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await clearStandingMark({
                          commitmentId: cellEdit.commitmentId,
                          weekStart: cellEdit.week,
                        })
                        setCellEdit(null)
                      })
                    }
                  >
                    {cellEdit.autoSource ? "Back to auto" : "Clear mark"}
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  disabled={pending || cellMet === null}
                  onClick={() =>
                    run(async () => {
                      await setStandingMark({
                        commitmentId: cellEdit.commitmentId,
                        weekStart: cellEdit.week,
                        met: cellMet!,
                        note: cellNote,
                      })
                      setCellEdit(null)
                    })
                  }
                >
                  {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── One-off add/edit dialog ──────────────────────────────── */}
      <OneOffFormDialog
        state={oneOffForm}
        pending={pending}
        onClose={() => setOneOffForm(null)}
        onSave={(values) =>
          run(async () => {
            if (oneOffForm?.mode === "edit" && oneOffForm.row) {
              await updateOneOff({ id: oneOffForm.row.id, ...values })
            } else {
              await createOneOff(values)
            }
            setOneOffForm(null)
          })
        }
        todayYmd={board.todayYmd}
      />

      {/* ── Reschedule dialog ────────────────────────────────────── */}
      <RescheduleDialog
        row={reschedule}
        pending={pending}
        onClose={() => setReschedule(null)}
        onSave={(newDueOn, missedReason) =>
          run(async () => {
            await rescheduleOneOff({ id: reschedule!.id, newDueOn, missedReason })
            setReschedule(null)
          })
        }
      />
    </div>
  )
}

// ─── One-off form dialog ─────────────────────────────────────────────

function OneOffFormDialog({
  state,
  pending,
  onClose,
  onSave,
  todayYmd,
}: {
  state: { mode: "add" | "edit"; row?: OneOffRow } | null
  pending: boolean
  onClose: () => void
  onSave: (values: {
    promise: string
    saidBy: Party
    agreedOn: string
    dueOn: string
  }) => void
  todayYmd: string
}) {
  const [promise, setPromise] = useState("")
  const [saidBy, setSaidBy] = useState<Party>("JOSE")
  const [agreedOn, setAgreedOn] = useState(todayYmd)
  const [dueOn, setDueOn] = useState("")

  // Reset the form each time the dialog opens for a different target.
  const [seenKey, setSeenKey] = useState<string | null>(null)
  const key = state ? `${state.mode}:${state.row?.id ?? "new"}` : null
  if (key !== seenKey) {
    setSeenKey(key)
    if (state) {
      setPromise(state.row?.promise ?? "")
      setSaidBy((state.row?.saidBy as Party) ?? "JOSE")
      setAgreedOn(state.row?.agreedOn ?? todayYmd)
      setDueOn(state.row?.dueOn ?? "")
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "edit" ? "Edit commitment" : "New commitment"}
          </DialogTitle>
          <DialogDescription>
            What was promised, by whom, and the firm date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="oo-promise">What was promised</Label>
            <Textarea
              id="oo-promise"
              value={promise}
              onChange={(e) => setPromise(e.target.value)}
              placeholder="e.g. New prep list template in use"
              className="mt-1.5"
              rows={2}
            />
          </div>
          <div>
            <Label>Who said it</Label>
            <div className="mt-1.5 flex gap-2">
              {PARTIES.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={saidBy === p ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSaidBy(p)}
                >
                  {COMMITMENT_PARTY_LABEL[p]}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="oo-agreed">Date agreed</Label>
              <Input
                id="oo-agreed"
                type="date"
                value={agreedOn}
                onChange={(e) => setAgreedOn(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="oo-due">Due date</Label>
              <Input
                id="oo-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !promise.trim() || !agreedOn || !dueOn}
            onClick={() => onSave({ promise, saidBy, agreedOn, dueOn })}
          >
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {state?.mode === "edit" ? "Save changes" : "Add commitment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Reschedule dialog ───────────────────────────────────────────────

function RescheduleDialog({
  row,
  pending,
  onClose,
  onSave,
}: {
  row: OneOffRow | null
  pending: boolean
  onClose: () => void
  onSave: (newDueOn: string, missedReason: string) => void
}) {
  const [newDueOn, setNewDueOn] = useState("")
  const [why, setWhy] = useState("")

  const [seenId, setSeenId] = useState<string | null>(null)
  if (row && row.id !== seenId) {
    setSeenId(row.id)
    setNewDueOn("")
    setWhy(row.missedReason ?? "")
  }

  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Missed — set a new date</DialogTitle>
          <DialogDescription>{row?.promise}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="rs-date">New due date</Label>
            <Input
              id="rs-date"
              type="date"
              value={newDueOn}
              onChange={(e) => setNewDueOn(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="rs-why">Why was it missed?</Label>
            <Textarea
              id="rs-why"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="Honest one-liner — this shows on the sheet"
              className="mt-1.5"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !newDueOn || !why.trim()}
            onClick={() => onSave(newDueOn, why)}
          >
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save new date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
