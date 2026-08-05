"use client"

import { useMemo, useRef, useState } from "react"
import { Check, Loader2, Send } from "lucide-react"
import {
  addCatalogItem,
  reopenCountSheet,
  saveCountLine,
  submitCountSheet,
  type CountSheet,
} from "@/lib/actions/restock"
import { STATION_SHORT_LABEL } from "@/lib/stations"

/**
 * Paper facsimile of the printed "Kitchen Restock Request": one ruled
 * table, every item visible, write-in boxes for coolroom count / need /
 * priority number / note. Built for Apple Pencil: Scribble converts
 * handwriting into the field, the chef sees the digit instantly and fixes
 * a bad conversion on the spot. Same sheet records and autosave as the
 * standard count; this is an alternative front-end, not a fork.
 */

interface Row {
  itemId: string
  name: string
  unit: string | null
  category: string
  available: string
  requested: string
  rank: string
  note: string
}

interface SibRow {
  itemId: string
  name: string
  unit: string | null
  theirAvailable: number | null
  theirCountedAt: string | null
  requested: string
  rank: string
}

/**
 * Forgiving number parse for handwriting conversions: Scribble sometimes
 * reads 0 as O and 1 as l/I. Returns undefined for garbage (kept on
 * screen, not saved), null for an empty box.
 */
function parseNum(raw: string): number | null | undefined {
  const t = raw.trim()
  if (t === "") return null
  const normalised = t
    .replace(/,/g, ".")
    .replace(/[Oo]/g, "0")
    .replace(/[lI]/g, "1")
  if (!/^\d*\.?\d*$/.test(normalised) || normalised === ".") return undefined
  const n = Number(normalised)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function parseRank(raw: string): number | null | undefined {
  const n = parseNum(raw)
  if (n === null || n === undefined) return n
  const i = Math.round(n)
  return i >= 1 && i <= 99 ? i : undefined
}

const num2str = (n: number | null): string => (n == null ? "" : String(n))

export function RestockPaperSheet({
  initialSheet,
}: {
  initialSheet: CountSheet
}) {
  const [sheet, setSheet] = useState(initialSheet)
  const [rows, setRows] = useState<Row[]>(
    initialSheet.lines.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      unit: l.unit,
      category: l.category,
      available: num2str(l.available),
      requested: num2str(l.requested),
      rank: num2str(l.priorityRank),
      note: l.note ?? "",
    }))
  )
  const [sibs, setSibs] = useState<SibRow[]>(
    initialSheet.siblingItems.map((s) => ({
      itemId: s.itemId,
      name: s.name,
      unit: s.unit,
      theirAvailable: s.theirAvailable,
      theirCountedAt: s.theirCountedAt,
      requested: num2str(s.requested),
      rank: num2str(s.priorityRank),
    }))
  )
  const [blanks, setBlanks] = useState<string[]>(["", "", ""])
  const [addingBlank, setAddingBlank] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [savingCount, setSavingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const readOnly = sheet.status === "RESTOCKED"
  const submitted = sheet.status === "SUBMITTED"

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of rows) {
      const arr = map.get(r.category) ?? []
      arr.push(r)
      map.set(r.category, arr)
    }
    return Array.from(map.entries())
  }, [rows])

  function persist(
    itemId: string,
    patch: {
      available?: number | null
      requested?: number | null
      priorityRank?: number | null
      note?: string | null
    },
    debounceKey: string
  ) {
    const run = () => {
      setSavingCount((n) => n + 1)
      saveCountLine({ sheetId: sheet.sheetId, itemId, ...patch })
        .then((res) => {
          if (!res.ok) setError(res.error ?? "Couldn't save. Try again.")
        })
        .catch(() => setError("Couldn't save. Check the connection."))
        .finally(() => setSavingCount((n) => n - 1))
    }
    const key = `${itemId}|${debounceKey}`
    const existing = timers.current.get(key)
    if (existing) clearTimeout(existing)
    timers.current.set(key, setTimeout(run, 600))
  }

  function editRow(itemId: string, field: "available" | "requested" | "rank" | "note", raw: string) {
    setRows((prev) =>
      prev.map((r) => (r.itemId === itemId ? { ...r, [field]: raw } : r))
    )
    saveField(itemId, field, raw)
  }

  function editSib(itemId: string, field: "requested" | "rank", raw: string) {
    setSibs((prev) =>
      prev.map((s) => (s.itemId === itemId ? { ...s, [field]: raw } : s))
    )
    saveField(itemId, field, raw)
  }

  function saveField(
    itemId: string,
    field: "available" | "requested" | "rank" | "note",
    raw: string
  ) {
    if (field === "note") {
      persist(itemId, { note: raw.trim() || null }, field)
      return
    }
    if (field === "rank") {
      const rank = parseRank(raw)
      if (rank !== undefined) persist(itemId, { priorityRank: rank }, field)
      return
    }
    const n = parseNum(raw)
    if (n === undefined) return // scribble garbage: leave on screen, don't save
    persist(itemId, field === "available" ? { available: n } : { requested: n }, field)
  }

  /** The blank rows at the bottom of the paper sheet: write a name, it
   *  becomes a real catalogue item on this station. */
  async function commitBlank(idx: number) {
    const itemName = blanks[idx].trim()
    if (!itemName || readOnly) return
    setAddingBlank(idx)
    const res = await addCatalogItem({
      venue: sheet.venue,
      station: sheet.station,
      name: itemName,
    })
    setAddingBlank(null)
    if (!res.ok || !res.itemId) {
      setError(res.error ?? "Couldn't add that item")
      return
    }
    const id = res.itemId
    setBlanks((prev) => prev.map((b, i) => (i === idx ? "" : b)))
    setRows((prev) =>
      prev.some((r) => r.itemId === id)
        ? prev
        : [
            ...prev,
            {
              itemId: id,
              name: itemName,
              unit: null,
              category: "Station restock",
              available: "",
              requested: "",
              rank: "",
              note: "",
            },
          ]
    )
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Sign the sheet (your name) before sending")
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await submitCountSheet({
      sheetId: sheet.sheetId,
      countedBy: name.trim(),
    })
    setSubmitting(false)
    if (res.ok) {
      setSheet((s) => ({ ...s, status: "SUBMITTED", countedBy: name.trim() }))
    } else {
      setError(res.error ?? "Couldn't send. Try again.")
    }
  }

  async function handleReopen() {
    const res = await reopenCountSheet(sheet.sheetId)
    if (res.ok) setSheet((s) => ({ ...s, status: "IN_PROGRESS" }))
    else setError(res.error ?? "Couldn't reopen")
  }

  const requestedCount =
    rows.filter((r) => (parseNum(r.requested) ?? 0) > 0).length +
    sibs.filter((s) => (parseNum(s.requested) ?? 0) > 0).length

  const boxClass =
    "h-12 w-full rounded-[8px] border border-[var(--tk-line)] bg-white text-center text-[20px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)] disabled:bg-[var(--tk-bg)]"
  const invalid = (v: string, rank = false) =>
    (rank ? parseRank(v) : parseNum(v)) === undefined

  return (
    <div className="space-y-6 pb-24">
      {submitted && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] px-5 py-4 text-[14px] font-medium"
          style={{ background: "var(--tk-done-soft)", color: "var(--tk-done)" }}
        >
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4" />
            Sent to the prep chef
            {sheet.countedBy ? ` by ${sheet.countedBy}` : ""}. You can still
            write on it, changes save straight onto the sent sheet.
          </span>
        </div>
      )}
      {readOnly && (
        <div className="rounded-[16px] bg-[var(--tk-bg)] px-5 py-4 text-[14px] font-medium text-[var(--tk-ink-soft)]">
          This sheet has been restocked. Start tonight&apos;s count from the
          restock page.
        </div>
      )}
      {error && (
        <div
          className="rounded-[16px] px-5 py-4 text-[14px] font-medium"
          style={{ background: "#fdecec", color: "#b3261e" }}
        >
          {error}
        </div>
      )}

      {/* The sheet */}
      <div className="overflow-hidden rounded-[20px] border border-[var(--tk-line)] bg-white">
        {/* Paper header */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[var(--tk-charcoal)] px-5 py-4">
          <div>
            <div
              className="tk-display text-[22px] font-bold text-[var(--tk-charcoal)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              Kitchen Restock Request
            </div>
            <div className="text-[13px] text-[var(--tk-ink-soft)]">
              {STATION_SHORT_LABEL[sheet.station]} · {sheet.sheetDate}
            </div>
          </div>
          <div className="text-[13px] tabular-nums text-[var(--tk-ink-soft)]">
            {savingCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}{" "}
            · {requestedCount} request{requestedCount === 1 ? "" : "s"}
          </div>
        </div>

        {/* Column headings */}
        <div className="sticky top-0 z-10 grid grid-cols-[3.5rem_minmax(8rem,2fr)_5.5rem_5.5rem_minmax(6rem,1.5fr)] gap-2 border-b border-[var(--tk-line)] bg-[var(--tk-bg)] px-5 py-2">
          {["#", "Item", "Coolroom", "Need", "Note"].map((h) => (
            <div key={h} className="tk-caps text-[11px] text-[var(--tk-ink-mute)]">
              {h}
            </div>
          ))}
        </div>

        {groups.map(([category, groupRows]) => (
          <div key={category}>
            <div className="border-b border-[var(--tk-line)] bg-[var(--tk-bg)] px-5 py-1.5">
              <span className="tk-caps text-[11px] text-[var(--tk-ink-soft)]">
                {category}
              </span>
            </div>
            {groupRows.map((r) => (
              <div
                key={r.itemId}
                className="grid grid-cols-[3.5rem_minmax(8rem,2fr)_5.5rem_5.5rem_minmax(6rem,1.5fr)] items-center gap-2 border-b border-dashed border-[var(--tk-line)] px-5 py-2"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.rank}
                  disabled={readOnly}
                  onChange={(e) => editRow(r.itemId, "rank", e.target.value)}
                  aria-label={`Priority number for ${r.name}`}
                  className={boxClass}
                  style={
                    r.rank && !invalid(r.rank, true)
                      ? { background: "var(--tk-gold)", borderColor: "var(--tk-gold)", fontWeight: 700 }
                      : invalid(r.rank, true)
                        ? { borderColor: "#b3261e" }
                        : undefined
                  }
                />
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-medium text-[var(--tk-charcoal)]">
                    {r.name}
                  </div>
                  {r.unit && (
                    <div className="text-[12px] text-[var(--tk-ink-soft)]">
                      {r.unit}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={r.available}
                  disabled={readOnly}
                  onChange={(e) => editRow(r.itemId, "available", e.target.value)}
                  aria-label={`Coolroom count for ${r.name}`}
                  className={boxClass}
                  style={invalid(r.available) ? { borderColor: "#b3261e" } : undefined}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={r.requested}
                  disabled={readOnly}
                  onChange={(e) => editRow(r.itemId, "requested", e.target.value)}
                  aria-label={`Amount needed for ${r.name}`}
                  className={boxClass}
                  style={
                    invalid(r.requested)
                      ? { borderColor: "#b3261e" }
                      : (parseNum(r.requested) ?? 0) > 0
                        ? { borderColor: "var(--tk-sage)", fontWeight: 600 }
                        : undefined
                  }
                />
                <input
                  type="text"
                  value={r.note}
                  disabled={readOnly}
                  onChange={(e) => editRow(r.itemId, "note", e.target.value)}
                  aria-label={`Note for ${r.name}`}
                  className="h-12 w-full rounded-[8px] border border-transparent border-b-[var(--tk-line)] bg-transparent px-2 text-[15px] italic text-[var(--tk-ink-soft)] outline-none focus:border-[var(--tk-sage)]"
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        ))}

        {/* Blank rows, like the bottom of the paper sheet */}
        {!readOnly && (
          <div>
            <div className="border-b border-[var(--tk-line)] bg-[var(--tk-bg)] px-5 py-1.5">
              <span className="tk-caps text-[11px] text-[var(--tk-ink-soft)]">
                Missing something? Write it in
              </span>
            </div>
            {blanks.map((b, i) => (
              <div
                key={i}
                className="grid grid-cols-[3.5rem_1fr] items-center gap-2 border-b border-dashed border-[var(--tk-line)] px-5 py-2"
              >
                <div className="text-center text-[13px] text-[var(--tk-ink-mute)]">
                  {addingBlank === i ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    "+"
                  )}
                </div>
                <input
                  type="text"
                  value={b}
                  onChange={(e) =>
                    setBlanks((prev) =>
                      prev.map((x, j) => (j === i ? e.target.value : x))
                    )
                  }
                  onBlur={() => commitBlank(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                  }}
                  placeholder="Write the item name, it joins the list above"
                  className="h-12 w-full rounded-[8px] border border-transparent border-b-[var(--tk-line)] bg-transparent px-2 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Other kitchen's items */}
      {sheet.siblingStation && sibs.length > 0 && (
        <div className="overflow-hidden rounded-[20px] border border-[var(--tk-line)] bg-white">
          <div className="border-b-2 border-[var(--tk-charcoal)] px-5 py-4">
            <div
              className="tk-display text-[18px] font-bold text-[var(--tk-charcoal)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              Need something the{" "}
              {STATION_SHORT_LABEL[sheet.siblingStation]} preps?
            </div>
            <div className="text-[13px] text-[var(--tk-ink-soft)]">
              Their latest coolroom count is shown. Write a number in Need
              and it lands on the same morning run.
            </div>
          </div>
          <div className="grid grid-cols-[3.5rem_minmax(8rem,2fr)_minmax(5rem,1fr)_5.5rem] gap-2 border-b border-[var(--tk-line)] bg-[var(--tk-bg)] px-5 py-2">
            {["#", "Item", "Their coolroom", "Need"].map((h) => (
              <div key={h} className="tk-caps text-[11px] text-[var(--tk-ink-mute)]">
                {h}
              </div>
            ))}
          </div>
          {sibs.map((s) => (
            <div
              key={s.itemId}
              className="grid grid-cols-[3.5rem_minmax(8rem,2fr)_minmax(5rem,1fr)_5.5rem] items-center gap-2 border-b border-dashed border-[var(--tk-line)] px-5 py-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={s.rank}
                disabled={readOnly}
                onChange={(e) => editSib(s.itemId, "rank", e.target.value)}
                aria-label={`Priority number for ${s.name}`}
                className={boxClass}
                style={
                  s.rank && !invalid(s.rank, true)
                    ? { background: "var(--tk-gold)", borderColor: "var(--tk-gold)", fontWeight: 700 }
                    : invalid(s.rank, true)
                      ? { borderColor: "#b3261e" }
                      : undefined
                }
              />
              <div className="min-w-0">
                <div className="truncate text-[16px] font-medium text-[var(--tk-charcoal)]">
                  {s.name}
                </div>
                {s.unit && (
                  <div className="text-[12px] text-[var(--tk-ink-soft)]">
                    {s.unit}
                  </div>
                )}
              </div>
              <div className="text-[14px] tabular-nums text-[var(--tk-ink-soft)]">
                {s.theirAvailable != null ? s.theirAvailable : "no count"}
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={s.requested}
                disabled={readOnly}
                onChange={(e) => editSib(s.itemId, "requested", e.target.value)}
                aria-label={`Amount needed of ${s.name}`}
                className={boxClass}
                style={
                  invalid(s.requested)
                    ? { borderColor: "#b3261e" }
                    : (parseNum(s.requested) ?? 0) > 0
                      ? { borderColor: "var(--tk-sage)", fontWeight: 600 }
                      : undefined
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* Signature + send */}
      {!readOnly && (
        <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="tk-caps text-[11px] text-[var(--tk-ink-mute)]">
                Counted by
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Write your name"
                autoCapitalize="words"
                className="mt-1 h-14 w-full rounded-[8px] border-b-2 border-[var(--tk-line)] bg-transparent px-2 text-[20px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex min-h-[56px] items-center justify-center gap-2.5 rounded-[14px] px-8 text-[17px] font-semibold text-white transition active:scale-[0.985] disabled:opacity-40"
              style={{ background: "var(--tk-charcoal)" }}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              {submitted ? "Send again" : "Send to prep chef"}
            </button>
          </div>
          {submitted && (
            <button
              onClick={handleReopen}
              className="mt-3 text-[13px] font-medium text-[var(--tk-ink-soft)] underline underline-offset-2"
            >
              Reopen as in-progress instead
            </button>
          )}
        </div>
      )}
    </div>
  )
}
