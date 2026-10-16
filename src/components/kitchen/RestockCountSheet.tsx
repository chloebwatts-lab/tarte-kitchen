"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Search,
  Send,
  Star,
  X,
} from "lucide-react"
import {
  addCatalogItem,
  reopenCountSheet,
  saveCountLine,
  saveCountRanks,
  submitCountSheet,
  type CountSheet,
  type CountSheetLine,
  type SiblingItem,
} from "@/lib/actions/restock"
import { PREP_SECTION_OWNER, prepSectionsFor, sectionHint, sectionPrompt, sectionTone, stationLabel, STATION_SHORT_LABEL, type SectionTone } from "@/lib/stations"
import { moveRank, nextPriorityRank, rankSequence } from "@/lib/restock-order"
import { SectionNav, WHOLE_LIST } from "@/components/kitchen/SectionNav"
import {
  NEEDED_BY_TIMES,
  formatNeededBy,
  neededByAt,
  neededByDays,
  splitNeededBy,
} from "@/lib/restock-needed-by"

type SortMode = "az" | "section"
const SORT_KEY = "tk-prep-sort"

/**
 * Closing chef's count sheet. Mirrors the paper "Kitchen Restock Request"
 * (same columns: available / amount required / note, same item order)
 * but autosaves every entry and can't get lost under a chopping board.
 */
export function RestockCountSheet({
  initialSheet,
  initialSection = null,
}: {
  initialSheet: CountSheet
  /** A section to open on (from ?section=), or null for the whole list. */
  initialSection?: string | null
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
  // A sectioned list (Beach House, Burleigh): a new prep goes into the
  // section the chef picks, who makes it or which station it is for.
  const sections = prepSectionsFor(initialSheet.venue)
  // Section buttons at the top (Chloe, 14 Oct 2026): a section shows only
  // its own items; Whole list shows everything. Kept in ?section= so a
  // kitchen can bookmark its own view.
  const [section, setSection] = useState<string>(
    initialSection && (sections as readonly string[]).includes(initialSection) ? initialSection : WHOLE_LIST
  )
  const [newItemSection, setNewItemSection] = useState<string>(
    initialSection && (sections as readonly string[]).includes(initialSection) ? initialSection : (sections[0] ?? "Station restock")
  )

  function pickSection(next: string) {
    setSection(next)
    if (next !== WHOLE_LIST) setNewItemSection(next)
    const url = new URL(window.location.href)
    if (next === WHOLE_LIST) url.searchParams.delete("section")
    else url.searchParams.set("section", next)
    window.history.replaceState(null, "", url.toString())
  }
  // Search box at the top (Chloe, 16 Oct 2026): type a few letters, the
  // list narrows to matching preps across every section.
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  // A to Z by default (Chloe, 16 Oct 2026): on the in-house iPad the chef
  // wants twenty items on one screen, found by name, tap tap tap. "By
  // section" keeps the paper sheet's grouping. The device remembers.
  const [sortMode, setSortMode] = useState<SortMode>("az")
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SORT_KEY)
      if (saved === "az" || saved === "section") setSortMode(saved)
    } catch {
      // private mode or storage blocked: default stands
    }
  }, [])
  function pickSort(next: SortMode) {
    setSortMode(next)
    try {
      window.localStorage.setItem(SORT_KEY, next)
    } catch {
      // ignore
    }
  }
  // Debounce timers per (itemId, field)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Never read-only: a sheet the morning run closed opens again on the
  // first edit (see saveCountLine) and becomes tonight's list.
  const readOnly = false
  const reopened = sheet.status === "RESTOCKED"
  const submitted = sheet.status === "SUBMITTED"

  // What the chef is looking at: a search ignores the section buttons (you
  // are hunting for one prep, wherever it lives); otherwise the picked
  // section, or everything. A to Z is one flat run; By section is the paper
  // sheet's groups in its order.
  const groups = useMemo((): [string, CountSheetLine[]][] => {
    const shown = lines.filter((l) =>
      searching ? l.name.toLowerCase().includes(q) : section === WHOLE_LIST || l.category === section
    )
    if (searching || sortMode === "az") {
      if (shown.length === 0) return []
      const sorted = [...shown].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }))
      const label = searching
        ? `${sorted.length} matching “${query.trim()}”`
        : section === WHOLE_LIST
          ? "A to Z"
          : `${section}, A to Z`
      return [[label, sorted]]
    }
    const map = new Map<string, CountSheetLine[]>()
    for (const l of shown) {
      const arr = map.get(l.category) ?? []
      arr.push(l)
      map.set(l.category, arr)
    }
    return Array.from(map.entries())
  }, [lines, section, q, query, searching, sortMode])
  // Section tags on rows make sense only when sections are mixed together.
  const showSectionTags = sections.length > 0 && (searching || (sortMode === "az" && section === WHOLE_LIST))

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of lines) counts[l.category] = (counts[l.category] ?? 0) + 1
    return counts
  }, [lines])

  const requestedCount =
    lines.filter((l) => l.requested != null && l.requested > 0).length +
    sibs.filter((s) => (s.requested ?? 0) > 0).length

  function patchLine(itemId: string, patch: Partial<CountSheetLine>) {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l))
    )
  }

  /** The + and − beside Need: one tap per unit, no keyboard. */
  function bump(line: CountSheetLine, delta: number) {
    if (readOnly) return
    const next = Math.max(0, (line.requested ?? 0) + delta)
    const value = next > 0 ? Math.round(next * 100) / 100 : null
    patchLine(line.itemId, { requested: value })
    persist(line.itemId, { requested: value }, "requested")
  }

  /**
   * Jose's priority system: a tap order, not a flag. First tap = 1,
   * next = 2, and so on; tapping a ranked item clears its number
   * (later numbers keep their value; gaps don't matter, order does).
   *
   * Each section numbers its own prep from 1 (Jose, 15 Oct 2026): the
   * Café's first priority is Café 1, not 18 after the Restaurant's
   * seventeen. A plain list is one sequence. Requests from the other
   * kitchen are their own sequence.
   */
  function nextRank(category: string) {
    const seq = rankSequence(sections.length > 0, category)
    return nextPriorityRank(
      lines
        .filter((l) => rankSequence(sections.length > 0, l.category) === seq)
        .map((l) => l.priorityRank)
    )
  }

  /** Star tap on an unnumbered prep: the next number in its section. */
  function giveRank(line: CountSheetLine) {
    const next = nextRank(line.category)
    patchLine(line.itemId, { priorityRank: next, priority: true })
    persist(line.itemId, { priorityRank: next })
  }

  /** Remove a number; the rest of its section closes up (1, 3 becomes 1, 2). */
  function clearRank(line: CountSheetLine) {
    const seq = rankSequence(sections.length > 0, line.category)
    const others = lines
      .filter((l) => l.itemId !== line.itemId && l.priorityRank != null && rankSequence(sections.length > 0, l.category) === seq)
      .sort((a, b) => (a.priorityRank as number) - (b.priorityRank as number))
    const changes: { itemId: string; priorityRank: number | null }[] = [{ itemId: line.itemId, priorityRank: null }]
    others.forEach((l, i) => {
      if (l.priorityRank !== i + 1) changes.push({ itemId: l.itemId, priorityRank: i + 1 })
    })
    setLines((prev) =>
      prev.map((l) => {
        const c = changes.find((x) => x.itemId === l.itemId)
        return c ? { ...l, priorityRank: c.priorityRank, priority: c.priorityRank != null } : l
      })
    )
    setSavingCount((n) => n + 1)
    saveCountRanks({ sheetId: sheet.sheetId, ranks: changes })
      .then((res) => {
        if (!res.ok) setError(res.error ?? "Couldn't save. Try again.")
      })
      .catch(() => setError("Couldn't save. Check the connection."))
      .finally(() => setSavingCount((n) => n - 1))
  }

  /**
   * Move a prep to a chosen number (Chloe, 15 Oct 2026): a 2 that should
   * be a 3 goes to 3 and the old 3 becomes 2, no clearing the list. The
   * rest of its section renumbers around it, 1..n with no gaps.
   */
  function moveRankTo(line: CountSheetLine, newRank: number) {
    const seq = rankSequence(sections.length > 0, line.category)
    const inSeq = lines
      .filter((l) => rankSequence(sections.length > 0, l.category) === seq)
      .map((l) => ({ id: l.itemId, priorityRank: l.priorityRank }))
    const changes = moveRank(inSeq, line.itemId, newRank)
    if (changes.length === 0) return
    setLines((prev) =>
      prev.map((l) => {
        const c = changes.find((x) => x.id === l.itemId)
        return c ? { ...l, priorityRank: c.priorityRank, priority: true } : l
      })
    )
    setSavingCount((n) => n + 1)
    saveCountRanks({
      sheetId: sheet.sheetId,
      ranks: changes.map((c) => ({ itemId: c.id, priorityRank: c.priorityRank })),
    })
      .then((res) => {
        if (!res.ok) setError(res.error ?? "Couldn't save. Try again.")
      })
      .catch(() => setError("Couldn't save. Check the connection."))
      .finally(() => setSavingCount((n) => n - 1))
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
      const next = nextPriorityRank(sibs.map((s) => s.priorityRank))
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
          {stationLabel(sheet.venue, sheet.station)}: {requestedCount} item
          {requestedCount === 1 ? "" : "s"} requested
          {sheet.countedBy ? ` · by ${sheet.countedBy}` : ""}.
        </p>
        <p className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">
          The prep chef will see this on tomorrow&apos;s Make prep list.
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
            Back to prep list
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-32">
      {/* Sticky toolbar: search, A to Z / By section, sections, save state */}
      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-[var(--tk-bg)] px-1 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tk-ink-mute)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search preps"
              aria-label="Search preps"
              autoCorrect="off"
              autoCapitalize="none"
              enterKeyHint="search"
              className="h-12 w-full rounded-full border border-[var(--tk-line)] bg-white pl-11 pr-11 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)] [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--tk-ink-mute)] hover:bg-[var(--tk-bg)]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div
            role="radiogroup"
            aria-label="Order of the list"
            className="flex h-12 shrink-0 items-center rounded-full border border-[var(--tk-line)] bg-white p-1"
          >
            {(["az", "section"] as const).map((mode) => {
              const on = sortMode === mode && !searching
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={searching}
                  onClick={() => pickSort(mode)}
                  className="h-full rounded-full px-4 text-[14px] font-semibold transition disabled:opacity-40"
                  style={{
                    background: on ? "var(--tk-charcoal)" : "transparent",
                    color: on ? "#fff" : "var(--tk-ink-soft)",
                  }}
                >
                  {mode === "az" ? "A to Z" : "By section"}
                </button>
              )
            })}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 pl-1 text-[12px] font-medium uppercase tracking-widest text-[var(--tk-ink-soft)] tabular-nums">
            {savingCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> saving
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--tk-done)]">
                <Check className="h-3.5 w-3.5" /> saved
              </span>
            )}
            · {requestedCount} requested
          </span>
        </div>
        {sections.length > 0 && !searching && (
          <SectionNav sections={sections} current={section} counts={sectionCounts} onPick={pickSection} sticky={false} dense />
        )}
      </div>

      {reopened && (
        <div
          className="flex items-center gap-3 rounded-[16px] px-5 py-4 text-[14px] font-medium"
          style={{ background: "var(--tk-sage-soft)", color: "var(--tk-charcoal)" }}
        >
          <Check className="h-5 w-5 shrink-0" />
          This morning&apos;s prep is finished. Change anything you like:
          whatever has a number in Need goes on the next Make prep list.
        </div>
      )}

      {groups.length === 0 && (
        <div className="rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-10 text-center text-[15px] text-[var(--tk-ink-soft)]">
          {searching ? (
            <>
              Nothing called &ldquo;{query.trim()}&rdquo; on this list. Add it at the
              bottom if it should be here.
            </>
          ) : (
            "Nothing in this section yet."
          )}
        </div>
      )}

      {groups.map(([category, groupLines]) => (
        <div key={category} className="space-y-2">
          {/* A to Z is one flat run, no caption needed; section groups and
              search results keep theirs */}
          {(searching || sortMode === "section") && (
            <div className="tk-caps flex items-baseline gap-2 px-1" style={{ color: "var(--tk-ink-mute)" }}>
              <span style={{ color: "var(--tk-charcoal)" }}>{category}</span>
              {!searching && sectionHint(sheet.venue, category) && (
                <span>· {sectionHint(sheet.venue, category)}</span>
              )}
              <span className="ml-auto tabular-nums">{groupLines.length}</span>
            </div>
          )}
          <div className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white">
            {/* Column headers, once per column on the two-column iPad layout */}
            <div className="grid border-b border-[var(--tk-line)] bg-[var(--tk-bg)] md:grid-cols-2">
              {[0, 1].map((col) => (
                <div
                  key={col}
                  className={`flex items-center gap-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)] ${col === 1 ? "hidden md:flex" : ""} ${col === 0 ? "md:border-r md:border-[var(--tk-line)]" : ""}`}
                >
                  <span className="min-w-0 flex-1">Item</span>
                  <span className="w-[140px] text-center">Need</span>
                  <span className="w-10 text-center">
                    <Star className="mx-auto h-3.5 w-3.5" />
                  </span>
                </div>
              ))}
            </div>
            {/* Two columns on an iPad either way up, so twenty odd preps
                fit on one screen: A to M runs down the left, then the right */}
            <div className="md:columns-2 md:gap-0 md:[column-rule:1px_solid_var(--tk-line)]">
            {groupLines.map((line) => (
              <CountRow
                key={line.itemId}
                line={line}
                tone={sectionTone(sheet.venue, line.category)}
                sectionName={sections.length > 0 ? line.category : null}
                showSection={showSectionTags}
                rankCount={
                  lines.filter(
                    (l) =>
                      l.priorityRank != null &&
                      rankSequence(sections.length > 0, l.category) === rankSequence(sections.length > 0, line.category)
                  ).length
                }
                readOnly={readOnly}
                onGiveRank={() => giveRank(line)}
                onClearRank={() => clearRank(line)}
                onMoveRank={(n) => moveRankTo(line, n)}
                onBump={(delta) => bump(line, delta)}
                onChange={(patch, debounceKey) => {
                  patchLine(line.itemId, patch)
                  persist(line.itemId, patch, debounceKey)
                }}
              />
            ))}
            </div>
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
              <div className="grid grid-cols-[1fr_88px_44px] items-center gap-2 border-y border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)] sm:grid-cols-[1fr_110px_52px]">
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
                  className="grid grid-cols-[1fr_88px_44px] items-center gap-2 border-b border-[var(--tk-line)] px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_110px_52px]"
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
          Anyone can add a prep; on a sectioned list they say which section. */}
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
              <span className="mr-1 text-[12px] text-[var(--tk-ink-soft)]">{sectionPrompt(sheet.venue)}</span>
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
            Done?
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
              ? "Nothing requested yet. You can still send it as all good."
              : `${requestedCount} item${requestedCount === 1 ? "" : "s"} will go on the prep chef's morning run.`}{" "}
            Forget to send? The list still reaches the prep chef. Sending
            just signs it off with your name. The prep chef makes exactly
            what is on it, in the order you number it: nothing here means
            nothing made.
          </p>
        </div>
      )}
    </div>
  )
}

function CountRow({
  line,
  tone,
  sectionName,
  showSection,
  rankCount,
  readOnly,
  onChange,
  onGiveRank,
  onClearRank,
  onMoveRank,
  onBump,
}: {
  line: CountSheetLine
  /** The section's colour for the priority number. */
  tone: SectionTone
  /** The section the number counts within, or null on a plain list. */
  sectionName: string | null
  /** Show the section after the name (A to Z mixes sections together). */
  showSection: boolean
  /** How many preps in that sequence have a number, for "2 of 5". */
  rankCount: number
  readOnly: boolean
  onChange: (patch: Partial<CountSheetLine>, debounceKey?: string) => void
  onGiveRank: () => void
  onClearRank: () => void
  onMoveRank: (newRank: number) => void
  /** +1 / -1 on Need. */
  onBump: (delta: number) => void
}) {
  // Closed until tapped, even with a note or time saved: those show inline
  // after the name, and a dense list needs every row the same height.
  const [showNote, setShowNote] = useState(false)
  // Tapping a number opens its editor instead of clearing it (Chloe, 15
  // Oct 2026): move it up or down, type the number it should be, or remove.
  const [rankOpen, setRankOpen] = useState(false)
  const [rankText, setRankText] = useState("")
  const rankShown = line.priorityRank != null && rankOpen

  function commitRankText() {
    const n = Number(rankText.trim())
    setRankText("")
    if (!rankText.trim() || !Number.isFinite(n)) return
    onMoveRank(Math.round(n))
  }
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

  const requested = line.requested ?? 0

  return (
    <div
      className="break-inside-avoid border-b border-[var(--tk-line)]"
      style={requested > 0 ? { background: "var(--tk-sage-soft)" } : undefined}
    >
      <div className="flex items-center gap-1 px-3 py-0.5">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => !readOnly && setShowNote((s) => !s)}
            className="block w-full py-1 text-left"
          >
            <span className="text-[15px] font-medium leading-tight text-[var(--tk-charcoal)]">
              {line.name}
            </span>
            {line.unit && (
              <span className="ml-1.5 text-[12px] text-[var(--tk-ink-soft)]">
                {line.unit}
              </span>
            )}
            {showSection && (
              <span className="ml-1.5 hidden text-[11px] text-[var(--tk-ink-mute)] lg:inline">
                {line.category}
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
        {/* Need: tap + or −, or type in the box */}
        <div className="flex w-[140px] shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={readOnly || requested === 0}
            onClick={() => onBump(-1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--tk-line)] bg-white text-[var(--tk-charcoal)] transition active:scale-90 disabled:opacity-25"
            aria-label={`One less ${line.name}`}
          >
            <Minus className="h-4 w-4" />
          </button>
          <QtyInput
            value={line.requested}
            disabled={readOnly}
            emphasis
            compact
            ariaLabel={`${line.name} needed`}
            onCommit={(v) => onChange({ requested: v }, "requested")}
          />
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onBump(1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-40"
            style={{ background: "var(--tk-charcoal)" }}
            aria-label={`One more ${line.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          disabled={readOnly}
          onClick={() => (line.priorityRank != null ? setRankOpen((o) => !o) : onGiveRank())}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-90"
          aria-label={line.priorityRank != null ? `${line.name} is priority ${line.priorityRank}, change it` : `${line.name} priority order`}
          aria-expanded={line.priorityRank != null ? rankOpen : undefined}
        >
          {line.priorityRank != null ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-bold tabular-nums"
              style={{ background: tone.bg, color: tone.fg, outline: rankShown ? "2px solid var(--tk-charcoal)" : "none", outlineOffset: 2 }}
            >
              {line.priorityRank}
            </span>
          ) : (
            <Star className="h-5 w-5" fill="none" stroke="var(--tk-ink-mute)" />
          )}
        </button>
      </div>
      {rankShown && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
          <span className="mr-1 text-[12px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)]">
            Priority {line.priorityRank} of {rankCount}
            {sectionName ? ` in ${sectionName}` : ""}
          </span>
          <Chip disabled={readOnly || line.priorityRank === 1} on={false} onClick={() => onMoveRank((line.priorityRank ?? 1) - 1)}>
            Up
          </Chip>
          <Chip disabled={readOnly || line.priorityRank === rankCount} on={false} onClick={() => onMoveRank((line.priorityRank ?? 1) + 1)}>
            Down
          </Chip>
          <input
            type="text"
            inputMode="numeric"
            value={rankText}
            onChange={(e) => setRankText(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitRankText}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitRankText()
              }
            }}
            placeholder="No."
            aria-label={`Make ${line.name} priority number`}
            className="min-h-[36px] w-[64px] rounded-full border border-[var(--tk-line)] bg-white text-center text-[14px] font-semibold tabular-nums text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
          />
          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              setRankOpen(false)
              onClearRank()
            }}
            className="ml-auto text-[13px] font-medium text-[var(--tk-ink-soft)] underline underline-offset-2"
          >
            Remove priority
          </button>
        </div>
      )}
      {showNote && (
        <div className="space-y-2 px-3 pb-3">
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
  compact,
  ariaLabel,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  disabled?: boolean
  emphasis?: boolean
  /** The 40px cell between + and − on the count sheet. */
  compact?: boolean
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
      className={`${compact ? "h-10 min-w-0 flex-1 rounded-[10px] text-[16px]" : "min-h-[48px] w-full rounded-[12px] text-[17px]"} border text-center font-semibold tabular-nums outline-none transition focus:border-[var(--tk-sage)] disabled:opacity-50`}
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
