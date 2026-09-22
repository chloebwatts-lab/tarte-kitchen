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
import type { BucketSpendData, CurrentWeekSpendSnapshot } from "./types"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { button, callout, list, section, shell, table, type Tone } from "@/lib/email/brand"

const money0 = (n: number | null): string => {
  if (n == null) return "—"
  const r = Math.round(n)
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
  const remaining = b.remaining ?? 0
  if (remaining <= 0) {
    return `${b.label}: ${money0(b.spentToDate)} spent of a ${money0(b.budget)} budget, ${money0(-remaining)} OVER. Hold all non-essential orders for the rest of the week.`
  }
  const tail =
    daysLeft > 1
      ? ` That's about ${money0(remaining / daysLeft)}/day for the ${daysLeft} days left.`
      : daysLeft === 1
        ? ` That's the whole budget for today, the last day of the week.`
        : ""
  return `${b.label}: ${money0(remaining)} left to spend (${money0(b.spentToDate)} of ${money0(b.budget)} used).${tail}`
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
  return `Takings so far ${money0(b.revenueToDateExGst)} ex GST${pace}.${cogsPart}`
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
}

export function render(snapshot: CurrentWeekSpendSnapshot): {
  subject: string
  text: string
  html: string
} {
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
    const remaining = b.remaining
    const remainTone: Tone = remaining == null ? "neutral" : remaining <= 0 ? "red" : "done"
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
      money0(b.spentToDate),
      money0(b.budget),
      { text: money0(b.remaining), tone: remainTone, strong: true },
      { text: PACE_LABEL[b.paceStatus], tone: PACE_TONE[b.paceStatus], strong: true },
      { text: `${cogs == null ? "n/a" : `${cogs.toFixed(1)}%`} / ${Number(b.targetPct).toFixed(0)}%`, tone: cogsTone, strong: true },
    ]
  })

  const spendTable = table(
    [
      { header: "Venue" },
      { header: "Spent", align: "right" },
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
  const { subject, text, html } = render(snapshot)
  // Same morning-send semantics as render(): today still counts.
  const daysLeft = Math.max(0, 8 - snapshot.dayOfWeek)

  let sent = false
  if (!args.dryRun) {
    await sendHtmlEmail({ to: args.recipient, subject, html, text })
    sent = true
  }

  return {
    weekStartWed: snapshot.weekStartWed,
    weekEndTue: snapshot.weekEndTue,
    daysLeft,
    recipient: args.recipient,
    sent,
    subject,
    text,
    html,
  }
}
