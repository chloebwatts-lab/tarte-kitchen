/**
 * Sunday "how much have we got left to spend this week" email.
 *
 * Deliberately deterministic — NO LLM narrative. It renders straight off
 * `getCurrentWeekSpend()` (the same snapshot the /spend page shows), so the
 * numbers in the email are identical to the live tracker and can be handed
 * to staff as-is. Accuracy over flourish: the only prose is computed.
 *
 * Sent Sundays 17:00 AEST so the team heads into the last two days of the
 * trading week (Wed→Tue) knowing exactly how much room is left per venue.
 *
 * Recipient is owner-only (chloe@) per tarte_recipients.md — it carries
 * forecast revenue + supplier spend, which is sensitive.
 */

import { getCurrentWeekSpend } from "./current-week"
import type { BucketSpendData, CurrentWeekSpendSnapshot } from "./types"
import { sendHtmlEmail } from "@/lib/gmail/send"

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

const PACE_COLOUR: Record<BucketSpendData["paceStatus"], string> = {
  "on-track": "#1a7f37",
  watch: "#9a6700",
  over: "#cf222e",
  "no-forecast": "#57606a",
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
        ? ` That's the whole budget for tomorrow, the last day of the week.`
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

function render(snapshot: CurrentWeekSpendSnapshot): {
  subject: string
  text: string
  html: string
} {
  const daysLeft = Math.max(0, 7 - snapshot.dayOfWeek)
  const range = `${shortDate(snapshot.weekStartWed)} – ${shortDate(snapshot.weekEndTue)}`
  const subject = `Spend left this week (${range}): ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`

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
        .join(", ")}) — usually liquor. Not counted in the per-venue figures above.`
    )
    textLines.push(``)
  }
  textLines.push(`Live tracker: https://kitchen.tarte.com.au/spend`)
  const text = textLines.join("\n")

  // ---- HTML ----
  const rows = snapshot.buckets
    .map((b) => {
      const remaining = b.remaining
      const remainColour =
        remaining == null
          ? "#57606a"
          : remaining <= 0
            ? "#cf222e"
            : "#1a7f37"
      const cogs = projectedCogsPct(b)
      const cogsColour =
        cogs == null
          ? "#57606a"
          : cogs <= Number(b.targetPct) + 0.5
            ? "#1a7f37"
            : cogs <= Number(b.targetPct) + 2.5
              ? "#9a6700"
              : "#cf222e"
      return `
      <tr>
        <td style="padding:12px 10px;border-top:1px solid #eaeef2;font-weight:600;">${b.label}</td>
        <td style="padding:12px 10px;border-top:1px solid #eaeef2;text-align:right;">${money0(b.spentToDate)}</td>
        <td style="padding:12px 10px;border-top:1px solid #eaeef2;text-align:right;">${money0(b.budget)}</td>
        <td style="padding:12px 10px;border-top:1px solid #eaeef2;text-align:right;font-weight:700;color:${remainColour};">${money0(b.remaining)}</td>
        <td style="padding:12px 10px;border-top:1px solid #eaeef2;text-align:right;color:${PACE_COLOUR[b.paceStatus]};font-weight:600;">${PACE_LABEL[b.paceStatus]}</td>
        <td style="padding:12px 10px;border-top:1px solid #eaeef2;text-align:right;color:${cogsColour};font-weight:700;">${cogs == null ? "n/a" : `${cogs.toFixed(1)}%`}<span style="color:#57606a;font-weight:400;"> / ${Number(b.targetPct).toFixed(0)}%</span></td>
      </tr>`
    })
    .join("")

  const lineItems = snapshot.buckets
    .map((b) => {
      const takings = takingsLine(b)
      return `<li style="margin:6px 0;color:#24292f;">${bucketLine(b, daysLeft)}${takings ? `<br><span style="color:#57606a;">${takings}</span>` : ""}</li>`
    })
    .join("")

  const unassignedNote =
    unassignedTotal > 0
      ? `<p style="margin:16px 0 0;font-size:13px;color:#57606a;">Note: ${money0(
          unassignedTotal
        )} of invoices this week aren't tagged to a venue yet (${snapshot.unassigned
          .map((u) => u.supplierName)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(
            ", "
          )}) — usually liquor — so they're not in the per-venue figures.</p>`
      : ""

  const html = `<!doctype html><html><body style="margin:0;background:#f6f8fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <h1 style="margin:0 0 4px;font-size:20px;color:#1f2328;">Spend left this week</h1>
    <p style="margin:0 0 20px;color:#57606a;font-size:14px;">Trading week ${range} (Wed→Tue) · <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"} left</strong></p>

    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eaeef2;border-radius:8px;font-size:14px;">
      <thead>
        <tr style="background:#f6f8fa;">
          <th style="padding:10px;text-align:left;color:#57606a;font-weight:600;">Venue</th>
          <th style="padding:10px;text-align:right;color:#57606a;font-weight:600;">Spent</th>
          <th style="padding:10px;text-align:right;color:#57606a;font-weight:600;">Budget</th>
          <th style="padding:10px;text-align:right;color:#57606a;font-weight:600;">Left</th>
          <th style="padding:10px;text-align:right;color:#57606a;font-weight:600;">Pace</th>
          <th style="padding:10px;text-align:right;color:#57606a;font-weight:600;">COGS proj.</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <ul style="margin:18px 0 0;padding-left:18px;font-size:14px;line-height:1.5;">${lineItems}</ul>
    ${unassignedNote}

    <p style="margin:22px 0 0;font-size:13px;">
      <a href="https://kitchen.tarte.com.au/spend" style="color:#0969da;">Open the live spend tracker →</a>
    </p>
  </div>
</body></html>`

  return { subject, text, html }
}

export interface RunWeeklySpendEmailArgs {
  recipient: string
  /** When true, render only — do not send. Used for previews. */
  dryRun?: boolean
}

export async function runWeeklySpendEmail(
  args: RunWeeklySpendEmailArgs
): Promise<WeeklySpendEmailResult> {
  const snapshot = await getCurrentWeekSpend()
  const { subject, text, html } = render(snapshot)
  const daysLeft = Math.max(0, 7 - snapshot.dayOfWeek)

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
