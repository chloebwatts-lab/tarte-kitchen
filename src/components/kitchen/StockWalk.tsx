"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, ClipboardList, Loader2, Minus, Plus, Settings2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { recordSignal, recordCount } from "@/lib/actions/venue-stock"
import { seedStarterStockList } from "@/lib/actions/venue-stock-setup"
import type { RoundArea, RoundItem } from "@/lib/actions/venue-stock"
import type { Venue, VenueStockSignal } from "@/generated/prisma/client"

const SECTION_LABEL =
  "text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]"
const SAVE_FAILED = "Didn't save. Check the wifi and tap again."

const timeFmt = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Australia/Brisbane",
})

/** "checked 9:12 am" or "flagged by Sam 9:12 am" under an item name. */
function Meta({ item }: { item: RoundItem }) {
  if (!item.checkedToday || !item.checkedAt) return null
  const at = timeFmt.format(new Date(item.checkedAt)).toLowerCase()
  const who = item.signalBy ? ` by ${item.signalBy}` : ""
  return (
    <span className="mt-0.5 block text-[13px] text-[var(--tk-ink-mute)]">
      {item.signal === "OK" ? `Checked${who}, ${at}` : `Flagged${who}, ${at}`}
    </span>
  )
}

/** Fine / Low / Out. One tap, saved straight away, shown as saved. */
function SignalRow({ item, name }: { item: RoundItem; name: string }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState("")
  const set = (s: VenueStockSignal) => {
    setError("")
    start(async () => {
      try {
        await recordSignal(item.id, s, name)
      } catch {
        setError(SAVE_FAILED)
      }
    })
  }
  const opt = (s: VenueStockSignal, label: string) => {
    const active = item.checkedToday && item.signal === s
    const warn = s !== "OK"
    return (
      <button
        key={s}
        type="button"
        role="radio"
        aria-checked={active}
        disabled={busy}
        onClick={() => set(s)}
        className={`min-h-[44px] flex-1 rounded-[10px] px-3 text-[15px] font-semibold transition active:scale-[0.97] sm:min-w-[64px] sm:flex-none ${
          active
            ? warn
              ? "bg-[var(--tk-warn)] text-white"
              : "bg-[var(--tk-done)] text-white"
            : "border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)]"
        }`}
      >
        {active && !warn ? <Check className="mr-1 inline h-4 w-4 align-[-2px]" strokeWidth={2.5} /> : null}
        {label}
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span className="min-w-[160px] flex-1 text-[17px] leading-tight text-[var(--tk-charcoal)]">
        {item.name}
        <Meta item={item} />
        {error ? <span className="mt-0.5 block text-[13px] font-medium text-[var(--tk-warn)]">{error}</span> : null}
      </span>
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--tk-ink-mute)]" /> : null}
      <div className="flex w-full gap-1.5 sm:w-auto" role="radiogroup" aria-label={item.name}>
        {opt("OK", "Fine")}
        {opt("LOW", "Low")}
        {opt("OUT", "Out")}
      </div>
    </div>
  )
}

/** A number with a par. Minus, plus, or type it. Saves on Enter or blur. */
function CountRow({ item, name }: { item: RoundItem; name: string }) {
  const saved = item.onHand?.toString() ?? ""
  const [val, setVal] = useState(saved)
  const [busy, start] = useTransition()
  const [error, setError] = useState("")
  const [justSaved, setJustSaved] = useState(false)
  const dirty = val !== saved

  const save = (next?: string) => {
    const raw = next ?? val
    const n = Number(raw)
    if (raw === "" || !Number.isFinite(n) || n < 0) return
    if (next === undefined && !dirty) return
    setError("")
    start(async () => {
      try {
        await recordCount(item.id, n, name)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 1500)
      } catch {
        setError(SAVE_FAILED)
      }
    })
  }
  const step = (d: number) => {
    const n = Math.max(0, (Number(val) || 0) + d)
    const s = String(n)
    setVal(s)
    save(s)
  }
  const below = item.parLevel !== null && item.onHand !== null && item.onHand <= item.parLevel

  const stepBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)] transition active:scale-95 disabled:opacity-40"
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span className="min-w-[160px] flex-1 text-[17px] leading-tight text-[var(--tk-charcoal)]">
        {item.name}
        <span className="mt-0.5 block text-[13px] text-[var(--tk-ink-mute)]">
          Reorder at {item.parLevel ?? "?"}{item.unit ? ` ${item.unit}` : ""}
          {item.onHand === null ? " · not counted yet" : ""}
          {below ? <span className="font-semibold text-[var(--tk-warn)]"> &middot; on the order list</span> : null}
        </span>
        <Meta item={item} />
        {error ? <span className="mt-0.5 block text-[13px] font-medium text-[var(--tk-warn)]">{error}</span> : null}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="One less" disabled={busy} onClick={() => step(-1)} className={stepBtn}>
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          enterKeyHint="done"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
          aria-label={`${item.name} on hand`}
          placeholder="?"
          className={`h-11 w-[72px] rounded-[10px] border-[1.5px] bg-[var(--tk-card)] px-2 text-center text-[17px] font-semibold text-[var(--tk-charcoal)] outline-none transition focus:border-[var(--tk-charcoal)] ${
            dirty ? "border-[var(--tk-charcoal)]" : "border-[var(--tk-line)]"
          }`}
        />
        <button type="button" aria-label="One more" disabled={busy} onClick={() => step(1)} className={stepBtn}>
          <Plus className="h-4 w-4" />
        </button>
        <span className="flex w-5 shrink-0 items-center justify-center">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--tk-ink-mute)]" />
          ) : justSaved ? (
            <Check className="h-5 w-5 text-[var(--tk-done)]" strokeWidth={2.5} />
          ) : null}
        </span>
      </div>
    </div>
  )
}

/**
 * No list yet. Two ways out: load a sensible starter list in one tap (a
 * manager trims it later), or set it up by hand under Managers.
 */
function EmptyWalk({ venue }: { venue: Venue }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState("")
  const seed = () => {
    setError("")
    start(async () => {
      try {
        await seedStarterStockList(venue)
        router.refresh()
      } catch {
        setError("That didn't load. Check the wifi and try again.")
      }
    })
  }
  return (
    <div className="rounded-[18px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-sage-soft)] text-[var(--tk-charcoal)]">
          <ClipboardList className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="tk-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-[var(--tk-charcoal)]">
            Nothing to walk yet
          </p>
          <p className="mt-1 text-[16px] leading-snug text-[var(--tk-ink-soft)]">
            This venue has no stock list. Load the usual one (cups, lids, napkins,
            cleaning gear, four areas in walk order) and a manager trims it under
            Managers, Stock list. Or build it from scratch there.
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-4 rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[15px] font-medium text-[var(--tk-warn)]">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <KitchenButton variant="primary" size="lg" onClick={seed} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {busy ? "Loading the list" : "Load the starter list"}
        </KitchenButton>
        <KitchenButton variant="secondary" size="lg" href={`/kitchen/managers/stock-setup?venue=${venue}`} className="flex-1">
          <Settings2 className="h-5 w-5" strokeWidth={1.8} />
          Set it up by hand
        </KitchenButton>
      </div>
    </div>
  )
}

export function StockWalk({ areas, venue }: { areas: RoundArea[]; venue: Venue }) {
  const [name, setName] = useRememberedName()

  const { total, checked, flagged } = useMemo(() => {
    const all = areas.flatMap((a) => a.items.map((i) => ({ ...i, area: a.name })))
    return {
      total: all.length,
      checked: all.filter((i) => i.checkedToday).length,
      flagged: all.filter((i) => i.belowPar),
    }
  }, [areas])

  if (areas.length === 0) return <EmptyWalk venue={venue} />

  const pct = total === 0 ? 0 : Math.round((checked / total) * 100)
  const allDone = total > 0 && checked === total

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block sm:max-w-[260px] sm:flex-1">
          <span className={SECTION_LABEL}>Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="So the order list says who saw it"
            autoCapitalize="words"
            className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)] outline-none transition focus:border-[var(--tk-charcoal)]"
          />
        </label>
        <div className="sm:w-[260px]">
          <div className="flex items-baseline justify-between">
            <span className={SECTION_LABEL}>Today</span>
            <span className="text-[15px] font-semibold text-[var(--tk-charcoal)]">
              {allDone ? "All checked" : `${checked} of ${total} checked`}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--tk-line)]">
            <div className="h-full rounded-full bg-[var(--tk-done)] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Jump strip: one tap to any area, with what's left in it. */}
      <div className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <div className="flex gap-2 pb-1">
          {areas.map((a) => {
            const left = a.items.filter((i) => !i.checkedToday).length
            return (
              <a
                key={a.id}
                href={`#area-${a.id}`}
                className={`shrink-0 rounded-full border-[1.5px] px-3.5 py-2 text-[14px] font-semibold ${
                  left === 0
                    ? "border-[var(--tk-done-soft)] bg-[var(--tk-done-soft)] text-[var(--tk-done)]"
                    : "border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)]"
                }`}
              >
                {a.name}
                <span className="ml-1.5 text-[13px] font-normal opacity-70">{left === 0 ? "done" : left}</span>
              </a>
            )
          })}
        </div>
      </div>

      {areas.map((a, idx) => {
        const left = a.items.filter((i) => !i.checkedToday).length
        return (
          <section key={a.id} id={`area-${a.id}`} className="scroll-mt-4 border-t-[1.5px] border-[var(--tk-line)]">
            <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 bg-[var(--tk-bg)] py-3">
              <h2 className="tk-display text-[22px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
                <span className="mr-2 text-[var(--tk-ink-mute)]">{idx + 1}</span>
                {a.name}
              </h2>
              <span className={`text-[14px] font-semibold ${left === 0 ? "text-[var(--tk-done)]" : "text-[var(--tk-ink-soft)]"}`}>
                {left === 0 ? "Done" : `${left} to go`}
              </span>
            </div>
            <div className="divide-y divide-[var(--tk-line)]">
              {a.items.map((i) =>
                i.tracking === "SIGNAL" ? (
                  <SignalRow key={i.id} item={i} name={name} />
                ) : (
                  <CountRow key={i.id} item={i} name={name} />
                )
              )}
            </div>
          </section>
        )
      })}

      {/* The output. What the walker just put on the order list. */}
      <section className="rounded-[18px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="tk-display text-[22px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
            On the order list
          </h2>
          <span className="text-[14px] font-semibold text-[var(--tk-ink-soft)]">
            {flagged.length === 0 ? "Nothing" : `${flagged.length} item${flagged.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {flagged.length === 0 ? (
          <p className="mt-2 text-[16px] text-[var(--tk-ink-soft)]">
            Nothing flagged. Anything you mark Low or Out, or count at or below its reorder point, shows up here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--tk-line)]">
            {flagged.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[16px] font-semibold text-[var(--tk-charcoal)]">{i.name}</span>
                  <span className="block text-[13px] text-[var(--tk-ink-soft)]">{i.area}</span>
                </span>
                <span className="shrink-0 rounded-full bg-[var(--tk-warn-soft)] px-2.5 py-1 text-[13px] font-semibold text-[var(--tk-warn)]">
                  {i.tracking === "SIGNAL" ? (i.signal === "OUT" ? "Out" : "Low") : `${i.onHand ?? 0}${i.unit ? ` ${i.unit}` : ""} left`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[14px] text-[var(--tk-ink-mute)]">
          The manager sees this on the morning board. Nothing else to do.
        </p>
        <Link
          href={`/kitchen/report?venue=${venue}`}
          className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[var(--tk-charcoal)]"
        >
          Spotted something that isn&apos;t on the list? <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  )
}
