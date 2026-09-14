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

  const byArea = new Map<string, typeof lineUp.shifts>()
  for (const s of lineUp.shifts) {
    const key = s.area ?? "Unassigned area"
    const list = byArea.get(key) ?? []
    list.push(s)
    byArea.set(key, list)
  }
  const unfilled = lineUp.shifts.filter((s) => s.unfilled).length

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
        {lineUp.shifts.length === 0 ? (
          <p className="text-[17px] text-[var(--tk-ink-soft)]">
            No roster synced for today. Talk through sections from the printed
            roster.
          </p>
        ) : (
          <>
            {unfilled > 0 && (
              <p className="mb-3 rounded-[12px] bg-[var(--tk-amber-light,#FBF0E4)] px-4 py-2.5 text-[16px] font-semibold text-[var(--tk-charcoal)]">
                {unfilled} shift{unfilled === 1 ? "" : "s"} still unfilled today.
                Ask the room before you ring around.
              </p>
            )}
            <div className="space-y-2.5">
              {[...byArea.entries()].map(([area, shifts]) => (
                <div key={area} className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="min-w-[150px] text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
                    {area}
                  </span>
                  <span className="text-[17px] text-[var(--tk-charcoal)]">
                    {shifts
                      .map(
                        (s) =>
                          `${s.name} ${time.format(new Date(s.start))}–${time.format(new Date(s.end))}`
                      )
                      .join(" · ")}
                  </span>
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
