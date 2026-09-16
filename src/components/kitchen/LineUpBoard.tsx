"use client"

import { useState, useTransition } from "react"
import { Check, Loader2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { saveLineUp, markLineUpRan } from "@/lib/actions/lineup"
import type { LineUp } from "@/lib/actions/lineup"
import type { Venue } from "@/generated/prisma/client"

const time = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Brisbane",
})
/** "6am", "2:30pm": the way a roster is read out, not the way a clock prints. */
function shortTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Brisbane",
  }).formatToParts(new Date(iso))
  const h = parts.find((x) => x.type === "hour")?.value ?? ""
  const m = parts.find((x) => x.type === "minute")?.value ?? "00"
  const p = (parts.find((x) => x.type === "dayPeriod")?.value ?? "").replace(/\./g, "").toLowerCase()
  return `${h}${m === "00" ? "" : `:${m}`}${p}`
}

/**
 * Deputy's salary "cards" are rostered as if they were people ("Salary Chefs
 * Burleigh 9–10am") so payroll can allocate. At line-up they are noise, so
 * they are dropped; a real person rostered onto a salary area is re-homed to
 * the section the area name implies.
 */
const SALARY_PLACEHOLDER = /^salary\b/i
const VENUE_WORDS = /\b(burleigh|currumbin|beach house|tea garden|bakery)\b/gi

function sectionOf(area: string | null): string {
  if (!area) return "Unassigned"
  let a = area.replace(SALARY_PLACEHOLDER, "").replace(VENUE_WORDS, "").replace(/\s+/g, " ").trim()
  if (!a) return "Unassigned"
  if (/^boh$/i.test(a)) a = "Kitchen"
  if (/^foh$/i.test(a)) a = "FOH"
  if (/^kp/i.test(a)) a = "KP"
  return a.charAt(0).toUpperCase() + a.slice(1)
}

/** Read out front to back: floor first, then the kitchen, then the pastry team. */
const SECTION_ORDER = ["FOH", "Barista", "Takeaway area", "Juice bar", "Kitchen", "Prep", "Pastry", "KP"]
function sectionRank(name: string): number {
  const i = SECTION_ORDER.findIndex((s) => s.toLowerCase() === name.toLowerCase())
  return i === -1 ? SECTION_ORDER.length : i
}

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
})

function Step({
  n,
  title,
  aside,
  children,
}: {
  n: number
  title: string
  aside?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t-[1.5px] border-[var(--tk-line)] pt-6">
      <div className="flex items-baseline gap-3">
        <span className="tk-display text-[15px] font-bold text-[var(--tk-ink-soft)]">
          {n}
        </span>
        <h2 className="tk-display text-[22px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
          {title}
        </h2>
        {aside ? (
          <span className="ml-auto text-[13px] text-[var(--tk-ink-soft)]">{aside}</span>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function LineUpBoard({
  lineUp,
  streak,
}: {
  lineUp: LineUp
  streak: { date: string; ran: boolean }[]
}) {
  const [push, setPush] = useState(lineUp.pushItem ?? "")
  const [eightySix, setEightySix] = useState(lineUp.eightySixed ?? "")
  const [name, setName] = useRememberedName()
  const [saving, startSave] = useTransition()
  const [running, startRun] = useTransition()
  const [saved, setSaved] = useState(false)

  const ran = Boolean(lineUp.ranAt)

  function save() {
    startSave(async () => {
      await saveLineUp({
        venue: lineUp.venue as Venue,
        pushItem: push,
        eightySixed: eightySix,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function run() {
    startRun(async () => {
      await saveLineUp({
        venue: lineUp.venue as Venue,
        pushItem: push,
        eightySixed: eightySix,
      })
      await markLineUpRan(lineUp.venue as Venue, name)
    })
  }

  const shifts = lineUp.shifts.filter((s) => s.unfilled || !SALARY_PLACEHOLDER.test(s.name.trim()))
  const byArea = new Map<string, typeof lineUp.shifts>()
  for (const s of shifts) {
    const key = sectionOf(s.area)
    const list = byArea.get(key) ?? []
    list.push(s)
    byArea.set(key, list)
  }
  const sections = [...byArea.entries()].sort(
    ([a], [b]) => sectionRank(a) - sectionRank(b) || a.localeCompare(b)
  )
  for (const [, list] of sections) list.sort((a, b) => a.start.localeCompare(b.start))
  const unfilled = shifts.filter((s) => s.unfilled).length

  return (
    <div className="space-y-7">
      {/* 1. NUMBERS */}
      <Step n={1} title="Numbers" aside="30 seconds">
        {lineUp.yesterday ? (
          <p className="text-[19px] leading-snug text-[var(--tk-charcoal)]">
            Yesterday: <strong>{money.format(lineUp.yesterday.revenue ?? 0)}</strong>
            {lineUp.yesterday.covers ? (
              <>
                {" "}
                across <strong>{lineUp.yesterday.covers}</strong> covers, average{" "}
                {money.format(lineUp.yesterday.averageSpend ?? 0)}
              </>
            ) : null}
            .
          </p>
        ) : (
          <p className="text-[17px] text-[var(--tk-ink-soft)]">
            Yesterday&apos;s sales haven&apos;t landed yet. Say something else true
            about yesterday instead, it only needs one sentence.
          </p>
        )}
      </Step>

      {/* 2. TODAY */}
      <Step n={2} title="Today" aside="2 minutes">
        {shifts.length === 0 ? (
          <p className="text-[17px] text-[var(--tk-ink-soft)]">
            No roster synced for today. Talk through sections from the printed
            roster.
          </p>
        ) : (
          <>
            <p className="mb-3 text-[15px] text-[var(--tk-ink-soft)]">
              {shifts.length} on today across {sections.length} section{sections.length === 1 ? "" : "s"}.
              {unfilled > 0
                ? ` ${unfilled} shift${unfilled === 1 ? "" : "s"} still unfilled: ask the room before you ring around.`
                : ""}
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {sections.map(([area, list]) => (
                <div
                  key={area}
                  className="rounded-[14px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
                      {area}
                    </span>
                    <span className="text-[13px] text-[var(--tk-ink-mute)]">{list.length}</span>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {list.map((s, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 text-[17px] leading-snug">
                        <span
                          className={
                            s.unfilled
                              ? "font-semibold text-[var(--tk-warn)]"
                              : "font-semibold text-[var(--tk-charcoal)]"
                          }
                        >
                          {s.unfilled ? "Unfilled" : s.name.split(/\s+/)[0]}
                          {!s.unfilled && s.name.split(/\s+/).length > 1 ? (
                            <span className="font-normal text-[var(--tk-ink-soft)]"> {s.name.split(/\s+/).slice(1).join(" ")}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-[15px] text-[var(--tk-ink-soft)]">
                          {shortTime(s.start)}–{shortTime(s.end)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
        <label className="mt-5 block">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
            86s — what we&apos;re out of
          </span>
          <input
            type="text"
            value={eightySix}
            onChange={(e) => setEightySix(e.target.value)}
            placeholder="Nothing today"
            className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3 text-[17px] text-[var(--tk-charcoal)]"
          />
        </label>
      </Step>

      {/* 3. PUSH ITEM */}
      <Step n={3} title="Push item" aside="30 seconds">
        <p className="mb-2 text-[15px] text-[var(--tk-ink-soft)]">
          The one thing everyone names today. New bake? Everyone tastes it now.
        </p>
        <input
          type="text"
          value={push}
          onChange={(e) => setPush(e.target.value)}
          placeholder="What are we naming today?"
          className="w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3 text-[19px] font-semibold text-[var(--tk-charcoal)]"
        />
      </Step>

      {/* 4. ONE VALUE */}
      <Step n={4} title="One value" aside="90 seconds">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
          Tarte Ten · number {lineUp.value.number}
        </p>
        <p className="mt-2 text-[24px] font-semibold leading-[1.25] tracking-[-0.015em] text-[var(--tk-charcoal)]">
          {lineUp.value.text}
        </p>
        <p className="mt-3 text-[15px] text-[var(--tk-ink-soft)]">
          Read it, then one real example from this week. That&apos;s it.
        </p>
      </Step>

      {/* 5. SHOUT-OUT */}
      <Step n={5} title="Shout-out" aside="30 seconds">
        {lineUp.shoutOuts.length === 0 ? (
          <p className="text-[17px] text-[var(--tk-ink-soft)]">
            No staff named in reviews this week. Catch someone doing it right
            today instead and say it publicly.
          </p>
        ) : (
          <ul className="space-y-3">
            {lineUp.shoutOuts.map((s, i) => (
              <li key={i} className="rounded-[14px] bg-[var(--tk-card)] px-4 py-3">
                <p className="text-[18px] font-semibold text-[var(--tk-charcoal)]">
                  {s.staff} &nbsp;
                  <span className="text-[15px] font-normal text-[var(--tk-ink-soft)]">
                    {s.rating}★{s.authorName ? ` · ${s.authorName}` : ""}
                  </span>
                </p>
                {s.text ? (
                  <p className="mt-1 text-[16px] leading-snug text-[var(--tk-ink)]">
                    &ldquo;{s.text.length > 260 ? s.text.slice(0, 260) + "…" : s.text}&rdquo;
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Step>

      {lineUp.isFriday && (lineUp.bestReview || lineUp.worstReview) ? (
        <Step n={6} title="Friday: the week in reviews">
          {lineUp.bestReview ? (
            <div className="rounded-[14px] bg-[var(--tk-card)] px-4 py-3">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
                Best of the week · read in full
              </p>
              <p className="mt-1.5 text-[17px] leading-snug text-[var(--tk-charcoal)]">
                &ldquo;{lineUp.bestReview.text}&rdquo;
              </p>
            </div>
          ) : null}
          {lineUp.worstReview ? (
            <div className="mt-3 rounded-[14px] bg-[var(--tk-card)] px-4 py-3">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
                Worst of the week · no names
              </p>
              <p className="mt-1.5 text-[17px] leading-snug text-[var(--tk-charcoal)]">
                &ldquo;{lineUp.worstReview.text}&rdquo;
              </p>
            </div>
          ) : null}
        </Step>
      ) : null}

      {/* Ran it */}
      <section className="border-t-[1.5px] border-[var(--tk-line)] pt-6">
        {ran ? (
          <p className="flex items-center gap-2 text-[17px] font-semibold text-[var(--tk-charcoal)]">
            <Check className="h-5 w-5" />
            Line-up run{lineUp.ledBy ? ` by ${lineUp.ledBy}` : ""} at{" "}
            {time.format(new Date(lineUp.ranAt!))}.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[180px]">
              <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
                Who ran it
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-1.5 w-full rounded-[12px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-3 text-[17px]"
              />
            </label>
            <KitchenButton
              variant="secondary"
              size="md"
              onClick={save}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saved ? "Saved" : "Save for later"}
            </KitchenButton>
            <KitchenButton
              variant="primary"
              size="md"
              onClick={run}
              disabled={running || !name.trim()}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              We ran it
            </KitchenButton>
          </div>
        )}
        <div className="mt-5 flex items-center gap-1.5">
          {streak.map((d) => (
            <span
              key={d.date}
              title={d.date}
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: d.ran ? "var(--tk-charcoal)" : "var(--tk-line)",
              }}
            />
          ))}
          <span className="ml-2 text-[13px] text-[var(--tk-ink-soft)]">
            {streak.filter((d) => d.ran).length} of the last {streak.length} days
          </span>
        </div>
      </section>
    </div>
  )
}
