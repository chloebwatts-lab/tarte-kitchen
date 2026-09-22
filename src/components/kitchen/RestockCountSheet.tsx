"use client"

import { useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Plus,
  Send,
  Star,
} from "lucide-react"
import {
  addCatalogItem,
  reopenCountSheet,
  saveCountLine,
  submitCountSheet,
  type CountSheet,
  type CountSheetLine,
  type SiblingItem,
} from "@/lib/actions/restock"
import { PREP_SECTION_OWNER, prepSectionsFor, stationLabel, STATION_SHORT_LABEL, type PrepSection } from "@/lib/stations"
import {
  NEEDED_BY_TIMES,
  formatNeededBy,
  neededByAt,
  neededByDays,
  splitNeededBy,
} from "@/lib/restock-needed-by"

/**
 * Closing chef's count sheet. Mirrors the paper "Kitchen Restock Request"
 * (same columns: available / amount required / note, same item order)
 * but autosaves every entry and can't get lost under a chopping board.
 */
export function RestockCountSheet({
  initialSheet,
}: {
  initialSheet: CountSheet
}) {
  const [sheet, setSheet] = useState(initialSheet)
  const [lines, setLines] = useState<CountSheetLine[]>(initialSheet.lines)
  const [sibs, setSibs] = useState<SiblingItem[]>(initialSheet.siblingItems)
  const [sibsOpen, setSibsOpen] = useState(
    // Auto-open when a request is already on the sheet
    initialSheet.siblingItems.some((s) => (s.requested ?? 0) > 0)
  )
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingCount, setSavingCount] = useState(0)
  const [newItemName, setNewItemName] = useState("")
  const [addingItem, setAddingItem] = useState(false)
  // Beach House's one list: a new prep goes into the section responsible for it.
  const sections = prepSectionsFor(initialSheet.venue)
  const [newItemSection, setNewItemSection] = useState<string>(sections[0] ?? "Station restock")
  // Debounce timers per (itemId, field)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const readOnly = sheet.status === "RESTOCKED"
  const submitted = sheet.status === "SUBMITTED"

  const groups = useMemo(() => {
    const map = new Map<string, CountSheetLine[]>()
    for (const l of lines) {
      const arr = map.get(l.category) ?? []
      arr.push(l)
      map.set(l.category, arr)
    }
    return Array.from(map.entries())
  }, [lines])

  const countedCount = lines.filter((l) => l.available != null).length
  const requestedCount =
    lines.filter((l) => l.requested != null && l.requested > 0).length +
    sibs.filter((s) => (s.requested ?? 0) > 0).length

  function patchLine(itemId: string, patch: Partial<CountSheetLine>) {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l))
    )
  }

  /**
   * Jose's priority system: a tap order, not a flag. First tap = 1,
   * next = 2, and so on; tapping a ranked item clears its number
   * (later numbers keep their value; gaps don't matter, order does).
   */
  // Ranks form one sequence across the whole sheet, other-kitchen
  // requests included.
  function nextRank() {
    return (
      Math.max(
        0,
        ...lines.map((l) => l.priorityRank ?? 0),
        ...sibs.map((s) => s.priorityRank ?? 0)
      ) + 1
    )
  }

  function toggleRank(line: CountSheetLine) {
    if (line.priorityRank != null) {
      patchLine(line.itemId, { priorityRank: null, priority: false })
      persist(line.itemId, { priorityRank: null })
    } else {
      const next = nextRank()
      patchLine(line.itemId, { priorityRank: next, priority: true })
      persist(line.itemId, { priorityRank: next })
    }
  }

  function patchSib(itemId: string, patch: Partial<SiblingItem>) {
    setSibs((prev) =>
      prev.map((s) => (s.itemId === itemId ? { ...s, ...patch } : s))
    )
  }

  function toggleSibRank(item: SiblingItem) {
    if (item.priorityRank != null) {
      patchSib(item.itemId, { priorityRank: null })
      persist(item.itemId, { priorityRank: null })
    } else {
      const next = nextRank()
      patchSib(item.itemId, { priorityRank: next })
      persist(item.itemId, { priorityRank: next })
    }
  }

  function persist(
    itemId: string,
    patch: {
      available?: number | null
      requested?: number | null
      priority?: boolean
      priorityRank?: number | null
      neededBy?: string | null
      note?: string | null
    },
    debounceKey?: string
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
    if (debounceKey) {
      const key = `${itemId}|${debounceKey}`
      const existing = timers.current.get(key)
      if (existing) clearTimeout(existing)
      timers.current.set(key, setTimeout(run, 600))
    } else {
      run()
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Add your name before sending")
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

  async function handleAddItem() {
    const itemName = newItemName.trim()
    if (!itemName) return
    setAddingItem(true)
    const res = await addCatalogItem({
      venue: sheet.venue,
      station: sheet.station,
      name: itemName,
      category: newItemSection,
    })
    setAddingItem(false)
    if (res.ok && res.itemId) {
      if (!lines.some((l) => l.itemId === res.itemId)) {
        setLines((prev) => [
          ...prev,
          {
            itemId: res.itemId!,
            name: itemName,
            unit: null,
            category: res.category ?? newItemSection,
            parLevel: null,
            itemNotes: null,
            available: null,
            requested: null,
            priority: false,
            priorityRank: null,
            neededBy: null,
            note: null,
          },
        ])
      }
      setNewItemName("")
    } else if (!res.ok) {
      setError(res.error ?? "Couldn't add item")
    }
  }

  if (submitted) {
    return (
      <div className="rounded-[24px] border border-[var(--tk-line)] bg-white p-10 text-center">
        <div
          className="tk-display text-[var(--tk-done)]"
          style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.03em" }}
        >
          Sent to prep ✓
        </div>
        <p className="mt-3 text-[16px] text-[var(--tk-ink-soft)]">
          {stationLabel(sheet.venue, sheet.station)} count: {countedCount} item
          {countedCount === 1 ? "" : "s"} counted, {requestedCount} requested
          {sheet.countedBy ? ` · by ${sheet.countedBy}` : ""}.
        </p>
        <p className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">
          The prep chef will see this on tomorrow&apos;s restock run.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleReopen}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--tk-line)] bg-white px-5 py-2.5 text-[14px] font-medium text-[var(--tk-charcoal)] hover:bg-[var(--tk-bg)]"
          >
            <Pencil className="h-4 w-4" />
            Reopen &amp; edit
          </button>
          <a
            href={`/kitchen/restock?venue=${sheet.venue}`}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-white"
            style={{ background: "var(--tk-charcoal)" }}
          >
            Back to restock
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-32">
      {/* Progress strip */}
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-5">
        <div className="flex items-center justify-between text-[12px] font-medium uppercase tracking-widest text-[var(--tk-ink-soft)]">
          <span>{stationLabel(sheet.venue, sheet.station)}</span>
          <span className="flex items-center gap-2 tabular-nums">
            {savingCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[var(--tk-ink-soft)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> saving
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--tk-done)]">
                <Check className="h-3.5 w-3.5" /> saved
              </span>
            )}
            · {countedCount} counted · {requestedCount} requested
          </span>
        </div>
      </div>

      {readOnly && (
        <div
          className="flex items-center gap-3 rounded-[16px] px-5 py-4 text-[14px] font-medium"
          style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          This sheet was already restocked, so it&apos;s read-only now.
        </div>
      )}

      {!readOnly && (
        <div className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 text-[14px] leading-snug text-[var(--tk-ink-soft)]">
          <strong className="text-[var(--tk-charcoal)]">Why this sheet matters.</strong>{" "}
          The prep chef makes exactly what is on it, in the order you number it.
          Nothing here means nothing made, and a text at 6am means someone
          drops what they are doing. Tap an item&apos;s name to say when you
          need it and leave a note.
        </div>
      )}

      {groups.map(([category, groupLines]) => (
        <div key={category} className="space-y-2">
          <div className="tk-caps flex items-baseline gap-2 px-1" style={{ color: "var(--tk-ink-mute)" }}>
            <span style={{ color: "var(--tk-charcoal)" }}>{category}</span>
            {PREP_SECTION_OWNER[category as PrepSection] ? (
              <span>· {PREP_SECTION_OWNER[category as PrepSection]}</span>
            ) : sections.length ? (
              <span>· responsible</span>
            ) : null}
            <span className="ml-auto tabular-nums">{groupLines.length}</span>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_88px_88px_44px] items-center gap-2 border-b border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)] sm:grid-cols-[1fr_110px_110px_52px]">
              <span>Item</span>
              <span className="text-center">In coolroom</span>
              <span className="text-center">Need</span>
              <span className="text-center">
                <Star className="mx-auto h-3.5 w-3.5" />
              </span>
            </div>
            {groupLines.map((line) => (
              <CountRow
                key={line.itemId}
                line={line}
                readOnly={readOnly}
                onToggleRank={() => toggleRank(line)}
                onChange={(patch, debounceKey) => {
                  patchLine(line.itemId, patch)
                  persist(line.itemId, patch, debounceKey)
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Jose's one-kitchen model: see the sibling kitchen's prep stock
          and request from it without messaging anyone */}
      {sheet.siblingStation && sibs.length > 0 && (
        <div className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white">
          <button
            onClick={() => setSibsOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <div>
              <div
                className="text-[16px] font-semibold text-[var(--tk-charcoal)]"
                style={{ letterSpacing: "-0.01em" }}
              >
                Need something the {STATION_SHORT_LABEL[sheet.siblingStation]}{" "}
                preps?
              </div>
              <div className="mt-0.5 text-[13px] text-[var(--tk-ink-soft)]">
                Their coolroom count is shown. Add a &ldquo;Need&rdquo; and it
                lands on the same morning run.
              </div>
            </div>
            <span className="shrink-0 text-[13px] font-medium text-[var(--tk-ink-soft)]">
              {sibsOpen ? "Hide" : `Show ${sibs.length}`}
            </span>
          </button>
          {sibsOpen && (
            <div>
              <div className="grid grid-cols-[1fr_88px_88px_44px] items-center gap-2 border-y border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)] sm:grid-cols-[1fr_110px_110px_52px]">
                <span>Item</span>
                <span className="text-center">They have</span>
                <span className="text-center">Need</span>
                <span className="text-center">
                  <Star className="mx-auto h-3.5 w-3.5" />
                </span>
              </div>
              {sibs.map((item) => (
                <div
                  key={item.itemId}
                  className="grid grid-cols-[1fr_88px_88px_44px] items-center gap-2 border-b border-[var(--tk-line)] px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_110px_110px_52px]"
                >
                  <div className="min-w-0">
                    <span className="text-[16px] font-medium leading-snug text-[var(--tk-charcoal)]">
                      {item.name}
                    </span>
                    {item.unit && (
                      <span className="ml-1.5 text-[13px] text-[var(--tk-ink-soft)]">
                        {item.unit}
                      </span>
                    )}
                    <div className="text-[12px] text-[var(--tk-ink-mute)]">
                      {item.theirCountedAt
                        ? `counted ${new Date(item.theirCountedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`
                        : "no recent count"}
                    </div>
                  </div>
                  <div className="flex min-h-[48px] items-center justify-center rounded-[12px] bg-[var(--tk-bg)] text-[17px] font-semibold tabular-nums text-[var(--tk-ink-soft)]">
                    {item.theirAvailable ?? "—"}
                  </div>
                  <QtyInput
                    value={item.requested}
                    disabled={readOnly}
                    emphasis
                    ariaLabel={`${item.name} needed from ${STATION_SHORT_LABEL[item.station]}`}
                    onCommit={(v) => {
                      patchSib(item.itemId, { requested: v })
                      persist(item.itemId, { requested: v }, "requested")
                    }}
                  />
                  <button
                    disabled={readOnly}
                    onClick={() => toggleSibRank(item)}
                    className="flex h-11 w-11 items-center justify-center justify-self-center rounded-full transition active:scale-90"
                    aria-label={`${item.name} priority order`}
                  >
                    {item.priorityRank != null ? (
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-bold tabular-nums"
                        style={{ background: "var(--tk-gold)", color: "#5d4a12" }}
                      >
                        {item.priorityRank}
                      </span>
                    ) : (
                      <Star
                        className="h-5 w-5"
                        fill="none"
                        stroke="var(--tk-ink-mute)"
                      />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add missing item: the blank rows at the bottom of the paper sheet.
          Anyone can add a prep; on the one-list venue they say who makes it. */}
      {!readOnly && (
        <div className="space-y-3 rounded-[18px] border border-dashed border-[var(--tk-line)] bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 shrink-0 text-[var(--tk-ink-soft)]" />
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
              placeholder="Missing a prep? Add it here"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--tk-charcoal)] outline-none placeholder:text-[var(--tk-ink-mute)]"
            />
            <button
              onClick={handleAddItem}
              disabled={!newItemName.trim() || addingItem}
              className="shrink-0 rounded-full bg-[var(--tk-charcoal)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {sections.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-7">
              <span className="mr-1 text-[12px] text-[var(--tk-ink-soft)]">Who makes it:</span>
              {sections.map((sec) => {
                const active = newItemSection === sec
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setNewItemSection(sec)}
                    className="rounded-full px-3 py-1 text-[12px] font-semibold transition"
                    style={{
                      background: active ? "var(--tk-charcoal)" : "var(--tk-charcoal-soft)",
                      color: active ? "#fff" : "var(--tk-ink-soft)",
                    }}
                  >
                    {sec}
                    {PREP_SECTION_OWNER[sec] ? ` (${PREP_SECTION_OWNER[sec]})` : ""}
                  </button>
                )
              })}
            </div>
          )}
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

      {/* Submit bar */}
      {!readOnly && (
        <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-5">
          <div className="tk-caps mb-3" style={{ color: "var(--tk-ink-mute)" }}>
            Done counting?
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoCapitalize="words"
              className="min-h-[56px] flex-1 rounded-[14px] border border-[var(--tk-line)] bg-white px-4 text-[17px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="flex min-h-[56px] items-center justify-center gap-2.5 rounded-[14px] px-8 text-[17px] font-semibold text-white transition active:scale-[0.985] disabled:opacity-40"
              style={{ background: "var(--tk-done)" }}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              Send to prep chef
            </button>
          </div>
          <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">
            {requestedCount === 0
              ? "Nothing requested yet. You can still send an all-good count."
              : `${requestedCount} item${requestedCount === 1 ? "" : "s"} will go on the prep chef's morning run.`}{" "}
            Forget to send? The count still reaches the prep chef. Sending
            just signs it off with your name.
          </p>
        </div>
      )}
    </div>
  )
}

function CountRow({
  line,
  readOnly,
  onChange,
  onToggleRank,
}: {
  line: CountSheetLine
  readOnly: boolean
  onChange: (patch: Partial<CountSheetLine>, debounceKey?: string) => void
  onToggleRank: () => void
}) {
  const [showNote, setShowNote] = useState(!!line.note || !!line.neededBy)
  const days = useMemo(() => neededByDays(), [])
  const picked = line.neededBy ? splitNeededBy(line.neededBy) : null
  // Day defaults to tomorrow once a time is tapped; time defaults to open
  // once a day is tapped, so one tap is enough for the common case.
  function pick(ymd: string | null, hour: number | null) {
    const d = ymd ?? picked?.ymd ?? days[0].ymd
    const h = hour ?? picked?.hour ?? NEEDED_BY_TIMES[0].hour
    onChange({ neededBy: neededByAt(d, h).toISOString() })
  }
  const needsAttention =
    line.parLevel != null &&
    line.available != null &&
    line.available < line.parLevel &&
    (line.requested == null || line.requested === 0)

  return (
    <div className="border-b border-[var(--tk-line)] last:border-b-0">
      <div className="grid grid-cols-[1fr_88px_88px_44px] items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_110px_110px_52px]">
        <div className="min-w-0">
          <button
            onClick={() => !readOnly && setShowNote((s) => !s)}
            className="block w-full text-left"
          >
            <span className="text-[16px] font-medium leading-snug text-[var(--tk-charcoal)]">
              {line.name}
            </span>
            {line.unit && (
              <span className="ml-1.5 text-[13px] text-[var(--tk-ink-soft)]">
                {line.unit}
              </span>
            )}
            {line.parLevel != null && (
              <span className="ml-1.5 text-[12px] text-[var(--tk-ink-mute)]">
                par {line.parLevel}
              </span>
            )}
            {needsAttention && (
              <span
                className="ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
              >
                below par
              </span>
            )}
            {line.neededBy && (
              <span
                className="ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "var(--tk-sage-soft)", color: "var(--tk-charcoal)" }}
              >
                {formatNeededBy(line.neededBy)}
              </span>
            )}
            {!line.neededBy && !showNote && (line.requested ?? 0) > 0 && (
              <span className="ml-1.5 text-[12px] text-[var(--tk-ink-mute)]">
                when?
              </span>
            )}
            {line.note && !showNote && (
              <span className="ml-1.5 text-[12px] italic text-[var(--tk-ink-soft)]">
                “{line.note}”
              </span>
            )}
          </button>
        </div>
        <QtyInput
          value={line.available}
          disabled={readOnly}
          ariaLabel={`${line.name} left now`}
          onCommit={(v) => onChange({ available: v }, "available")}
        />
        <QtyInput
          value={line.requested}
          disabled={readOnly}
          emphasis
          ariaLabel={`${line.name} needed`}
          onCommit={(v) => onChange({ requested: v }, "requested")}
        />
        <button
          disabled={readOnly}
          onClick={onToggleRank}
          className="flex h-11 w-11 items-center justify-center justify-self-center rounded-full transition active:scale-90"
          aria-label={`${line.name} priority order`}
        >
          {line.priorityRank != null ? (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-bold tabular-nums"
              style={{ background: "var(--tk-gold)", color: "#5d4a12" }}
            >
              {line.priorityRank}
            </span>
          ) : (
            <Star className="h-5 w-5" fill="none" stroke="var(--tk-ink-mute)" />
          )}
        </button>
      </div>
      {showNote && (
        <div className="space-y-2 px-4 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)]">
              Needed by
            </span>
            {days.map((d) => (
              <Chip
                key={d.ymd}
                on={picked?.ymd === d.ymd}
                disabled={readOnly}
                onClick={() => pick(d.ymd, null)}
              >
                {d.label}
              </Chip>
            ))}
            <span className="mx-1 text-[var(--tk-ink-mute)]">·</span>
            {NEEDED_BY_TIMES.map((t) => (
              <Chip
                key={t.hour}
                on={picked?.hour === t.hour}
                disabled={readOnly}
                onClick={() => pick(null, t.hour)}
              >
                {t.label}
              </Chip>
            ))}
            {line.neededBy && !readOnly && (
              <button
                onClick={() => onChange({ neededBy: null })}
                className="ml-1 text-[12px] text-[var(--tk-ink-mute)] underline"
              >
                clear
              </button>
            )}
          </div>
          <input
            type="text"
            defaultValue={line.note ?? ""}
            disabled={readOnly}
            placeholder="Note for the prep chef (e.g. running low by lunch)"
            onChange={(e) =>
              onChange({ note: e.target.value.trim() || null }, "note")
            }
            className="w-full rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3 py-2.5 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
          />
        </div>
      )}
    </div>
  )
}

function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className="min-h-[36px] rounded-full border px-3 text-[13px] font-semibold transition active:scale-95 disabled:opacity-50"
      style={{
        borderColor: on ? "var(--tk-charcoal)" : "var(--tk-line)",
        background: on ? "var(--tk-charcoal)" : "white",
        color: on ? "#fff" : "var(--tk-charcoal)",
      }}
    >
      {children}
    </button>
  )
}

/**
 * Numeric cell: free typing plus a one-tap stepper feel. Tapping the empty
 * cell starts at 0 so a single "+1" tap covers the common case.
 */
function QtyInput({
  value,
  onCommit,
  disabled,
  emphasis,
  ariaLabel,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  disabled?: boolean
  emphasis?: boolean
  ariaLabel: string
}) {
  const [text, setText] = useState(value == null ? "" : String(value))
  // Keep local text in sync if the server state changes underneath (rare)
  const lastValue = useRef(value)
  if (lastValue.current !== value) {
    lastValue.current = value
    const asNum = text.trim() === "" ? null : Number(text)
    if (asNum !== value) setText(value == null ? "" : String(value))
  }

  function commit(raw: string) {
    const trimmed = raw.trim().replace(",", ".")
    if (trimmed === "") {
      onCommit(null)
      return
    }
    const n = Number(trimmed)
    if (Number.isFinite(n) && n >= 0) onCommit(Math.round(n * 100) / 100)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      disabled={disabled}
      placeholder="—"
      onChange={(e) => {
        setText(e.target.value)
        commit(e.target.value)
      }}
      className="min-h-[48px] w-full rounded-[12px] border text-center text-[17px] font-semibold tabular-nums outline-none transition focus:border-[var(--tk-sage)] disabled:opacity-50"
      style={{
        borderColor: "var(--tk-line)",
        background:
          emphasis && value != null && value > 0
            ? "var(--tk-gold-soft)"
            : "var(--tk-bg)",
        color: "var(--tk-charcoal)",
      }}
    />
  )
}
