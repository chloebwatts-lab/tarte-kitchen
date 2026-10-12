/**
 * Sunday "how much have we got left to spend this week" email.
 *
 * Deliberately deterministic: NO LLM narrative. It renders straight off
 * `getCurrentWeekSpend()` (the same snapshot the /spend page shows), so the
 * numbers in the email are identical to the live tracker and can be handed
 * to staff as-is. Accuracy over flourish: the only prose is computed.
 *
 * Sent Sunday mornings 08:30 AEST (see the crontab in docker-compose.yml)
 * so the team heads into the final three days of the trading week
 * (Wed→Tue) knowing exactly how much room is left per venue.
 *
 * Recipient is owner-only (chloe@) per tarte_recipients.md, it carries
 * forecast revenue + supplier spend, which is sensitive.
 */

import { getCurrentWeekSpend } from "./current-week"
import { checkSpendSnapshot } from "./guards"
import type { BucketSpendData, CurrentWeekSpendSnapshot } from "./types"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { button, callout, list, section, shell, table, type Tone } from "@/lib/email/brand"

const money0 = (n: number | null): string => {
  if (n == null) return "—"
  const r = Math.round(n) || 0 // normalise -0
  return r < 0
    ? `-$${Math.abs(r).toLocaleString("en-AU")}`
    : `$${r.toLocaleString("en-AU")}`
}

const PACE_LABEL: Record<BucketSpendData["paceStatus"], string> = {
  "on-track": "On track",
  watch: "Watch",
  over: "Over pace",
  "no-forecast": "No forecast",
}

const PACE_TONE: Record<BucketSpendData["paceStatus"], Tone> = {
  "on-track": "done",
  watch: "gold",
  over: "warn",
  "no-forecast": "neutral",
}

/** "Sunday" from an AEST yyyy-mm-dd, "" when unknown. */
function dayName(iso: string | null): string {
  if (!iso) return ""
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long" })
}

/** Pretty "10 Jun" from an AEST yyyy-mm-dd. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

/**
 * Per-venue one-liner staff can act on, derived purely from the numbers.
 */
function bucketLine(b: BucketSpendData, daysLeft: number): string {
  if (b.budget == null) {
    return `${b.label}: ${money0(b.spentToDate)} spent so far. No sales forecast loaded, so no budget to compare against.`
  }
  // Same basis as the /spend headline: invoices in hand grossed up for
  // deliveries made but not yet invoiced (arrival-lag profile).
  const left = b.leftToSpend ?? 0
  const used = money0(b.estimatedSpentToDate)
  const usedDetail =
    b.estimatedUninvoiced > 0
      ? `: ${money0(b.spentToDate)} invoiced plus about ${money0(b.estimatedUninvoiced)} delivered but not invoiced yet`
      : ""
  if (left <= 0) {
    return `${b.label}: ${used} spent of a ${money0(b.budget)} budget${usedDetail ? ` (${usedDetail.slice(2)})` : ""}, ${money0(-left)} OVER. Hold all non-essential orders for the rest of the week.`
  }
  const tail =
    daysLeft > 1
      ? ` That's about ${money0(left / daysLeft)}/day for the ${daysLeft} days left.`
      : daysLeft === 1
        ? ` That's the whole budget for today, the last day of the week.`
        : ""
  return `${b.label}: ${money0(left)} left to spend (${used} of ${money0(b.budget)} used${usedDetail}).${tail}`
}

/** Projected full-week COGS % against live revenue pace, else forecast. */
function projectedCogsPct(b: BucketSpendData): number | null {
  if (b.projectedRevenueExGst && b.projectedRevenueExGst > 0)
    return (b.projectedEndOfWeek / b.projectedRevenueExGst) * 100
  if (b.forecastRevenue && b.forecastRevenue > 0)
    return (b.projectedEndOfWeek / b.forecastRevenue) * 100
  return null
}

/** One line on takings and where COGS lands. Empty string if no data. */
function takingsLine(b: BucketSpendData): string {
  if (b.revenueToDateExGst == null) return ""
  const pace =
    b.projectedRevenueExGst && b.forecastRevenue && b.forecastRevenue > 0
      ? `, pacing ${Math.round((b.projectedRevenueExGst / b.forecastRevenue) * 100)}% of forecast`
      : ""
  const cogs = projectedCogsPct(b)
  const cogsPart =
    cogs == null
      ? ""
      : ` On that pace the week finishes near ${cogs.toFixed(1)}% COGS (target ${Number(b.targetPct).toFixed(0)}%).`
  const through = b.lastRevenueDate ? ` to ${dayName(b.lastRevenueDate)} close` : ""
  const today =
    b.todaySoFarExGst != null && b.todaySoFarExGst > 0
      ? ` Plus ${money0(b.todaySoFarExGst)} so far today, not in the pace yet.`
      : ""
  const notes = b.revenueNotes.length ? ` ${b.revenueNotes.join(" ")}` : ""
  return `Takings${through} ${money0(b.revenueToDateExGst)} ex GST${pace}.${cogsPart}${today}${notes}`
}

export interface WeeklySpendEmailResult {
  weekStartWed: string
  weekEndTue: string
  daysLeft: number
  recipient: string
  sent: boolean
  subject: string
  text: string
  html: string
  /// Set when the numbers failed their own consistency check: the spend
  /// email was NOT sent, an alert naming the problems went instead.
  withheld?: string[]
}

/** Thrown by render() when the snapshot fails checkSpendSnapshot. */
export class SpendSnapshotInconsistent extends Error {
  constructor(public readonly problems: string[]) {
    super(`Spend snapshot failed its consistency check: ${problems.join("; ")}`)
    this.name = "SpendSnapshotInconsistent"
  }
}

/**
 * The alert that goes out instead of the numbers when they do not add up.
 * Deliberately number-free apart from the problems themselves.
 */
export function renderWithheld(
  snapshot: Pick<CurrentWeekSpendSnapshot, "weekStartWed" | "weekEndTue">,
  problems: string[]
): { subject: string; text: string; html: string } {
  const range = `${shortDate(snapshot.weekStartWed)} – ${shortDate(snapshot.weekEndTue)}`
  const subject = `COGS TRACKING (${range}): numbers withheld, check needed`
  const text = [
    `TARTE: SPEND EMAIL WITHHELD`,
    `The Sunday spend figures for ${range} failed their own consistency check, so they were not sent.`,
    ``,
    ...problems.map((p) => `• ${p}`),
    ``,
    `The live tracker may show the same fault: https://kitchen.tarte.com.au/spend`,
  ].join("\n")
  const html = shell({
    kicker: "Weekly spend",
    title: "Spend email withheld",
    subtitle: `Trading week ${range} (Wed→Tue)`,
    preheader: `Spend figures failed their consistency check`,
    sections: [
      section(
        "Why nothing was sent",
        callout(
          `The figures failed their own consistency check, so rather than send something wrong they were held back.`,
          "warn"
        ) +
          list(problems.map((p) => ({ text: p, tone: "warn" as Tone }))) +
          button("Open the live spend tracker →", "https://kitchen.tarte.com.au/spend")
      ),
    ],
  })
  return { subject, text, html }
}

export function render(snapshot: CurrentWeekSpendSnapshot): {
  subject: string
  text: string
  html: string
} {
  const problems = checkSpendSnapshot(snapshot)
  if (problems.length) throw new SpendSnapshotInconsistent(problems)
  // Days remaining INCLUDING the send day: this goes out in the morning,
  // so today's trading is still ahead. dayOfWeek is 1-7 with Wed = 1.
  const daysLeft = Math.max(0, 8 - snapshot.dayOfWeek)
  const range = `${shortDate(snapshot.weekStartWed)} – ${shortDate(snapshot.weekEndTue)}`
  const subject = `COGS TRACKING (${range}): ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`

  const unassignedTotal = snapshot.unassigned.reduce(
    (s, u) => s + (u.total ?? 0),
    0
  )

  // ---- Plain text (also the email fallback) ----
  const textLines: string[] = [
    `TARTE: SPEND LEFT THIS WEEK`,
    `Trading week ${range} (Wed→Tue). ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`,
    ``,
  ]
  for (const b of snapshot.buckets) {
    textLines.push(`• ${bucketLine(b, daysLeft)}`)
    textLines.push(
      `   pace: ${PACE_LABEL[b.paceStatus]}, projected full-week spend ${money0(b.projectedEndOfWeek)} vs ${money0(b.budget)} budget.`
    )
    const takings = takingsLine(b)
    if (takings) textLines.push(`   ${takings}`)
    textLines.push(``)
  }
  if (unassignedTotal > 0) {
    textLines.push(
      `Note: ${money0(unassignedTotal)} of invoices this week aren't tagged to a venue yet (${snapshot.unassigned
        .map((u) => u.supplierName)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ")}), usually liquor. Not counted in the per-venue figures above.`
    )
    textLines.push(``)
  }
  textLines.push(`Live tracker: https://kitchen.tarte.com.au/spend`)
  const text = textLines.join("\n")

  // ---- HTML ----
  const daysLabel = `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
  const tableRows = snapshot.buckets.map((b) => {
    const left = b.leftToSpend
    const remainTone: Tone = left == null ? "neutral" : left <= 0 ? "red" : "done"
    const cogs = projectedCogsPct(b)
    const cogsTone: Tone =
      cogs == null
        ? "neutral"
        : cogs <= Number(b.targetPct) + 0.5
          ? "done"
          : cogs <= Number(b.targetPct) + 2.5
            ? "gold"
            : "red"
    return [
      { text: b.label, strong: true },
      money0(b.budget == null ? b.spentToDate : b.estimatedSpentToDate),
      money0(b.budget),
      { text: money0(left), tone: remainTone, strong: true },
      { text: PACE_LABEL[b.paceStatus], tone: PACE_TONE[b.paceStatus], strong: true },
      { text: `${cogs == null ? "n/a" : `${cogs.toFixed(1)}%`} / ${Number(b.targetPct).toFixed(0)}%`, tone: cogsTone, strong: true },
    ]
  })

  const spendTable = table(
    [
      { header: "Venue" },
      { header: "Spent (incl. uninvoiced)", align: "right" },
      { header: "Budget", align: "right" },
      { header: "Left", align: "right" },
      { header: "Pace", align: "right" },
      { header: "COGS proj.", align: "right" },
    ],
    tableRows
  )

  const lineItems = list(
    snapshot.buckets.map((b) => {
      const takings = takingsLine(b)
      return { text: bucketLine(b, daysLeft), detail: takings || undefined, tone: PACE_TONE[b.paceStatus] }
    })
  )

  const unassignedNote =
    unassignedTotal > 0
      ? `<div style="margin-top:14px;">${callout(
          `Note: ${money0(unassignedTotal)} of invoices this week aren't tagged to a venue yet (${snapshot.unassigned
            .map((u) => u.supplierName)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(", ")}), usually liquor, so they're not in the per-venue figures.`,
          "gold"
        )}</div>`
      : ""

  const html = shell({
    kicker: "Weekly spend",
    title: "Spend left this week",
    subtitle: `Trading week ${range} (Wed→Tue) · ${daysLabel}`,
    preheader: `${daysLabel} in the trading week ${range}`,
    sections: [
      section("Where each venue sits", spendTable),
      section(
        "What that means",
        lineItems + unassignedNote + button("Open the live spend tracker →", "https://kitchen.tarte.com.au/spend")
      ),
    ],
  })

  return { subject, text, html }
}

export interface RunWeeklySpendEmailArgs {
  recipient: string
  /** When true, render only, do not send. Used for previews. */
  dryRun?: boolean
}

export async function runWeeklySpendEmail(
  args: RunWeeklySpendEmailArgs
): Promise<WeeklySpendEmailResult> {
  const snapshot = await getCurrentWeekSpend()
  // Same morning-send semantics as render(): today still counts.
  const daysLeft = Math.max(0, 8 - snapshot.dayOfWeek)
  const base = {
    weekStartWed: snapshot.weekStartWed,
    weekEndTue: snapshot.weekEndTue,
    daysLeft,
    recipient: args.recipient,
  }

  let rendered: { subject: string; text: string; html: string }
  let withheld: string[] | undefined
  try {
    rendered = render(snapshot)
  } catch (e) {
    if (!(e instanceof SpendSnapshotInconsistent)) throw e
    // Never send wrong numbers as if they were right: alert instead.
    withheld = e.problems
    rendered = renderWithheld(snapshot, e.problems)
  }

  let sent = false
  if (!args.dryRun) {
    await sendHtmlEmail({ to: args.recipient, ...rendered })
    sent = true
  }

  return { ...base, sent, ...rendered, ...(withheld ? { withheld } : {}) }
}
