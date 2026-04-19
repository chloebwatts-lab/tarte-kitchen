import { getActiveGmailConnection, getValidGmailAccessToken } from "@/lib/gmail/token"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma"

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me"

/**
 * Send a plain-text email via the connected Gmail account.
 *
 * Delegates to getValidGmailAccessToken() so the refreshed access token
 * gets persisted back to the GmailConnection row — otherwise every send
 * would re-refresh unnecessarily and the connection's tokenExpiry would
 * never advance.
 *
 * Uses RFC 2822 encoded base64url per Gmail spec:
 *   https://developers.google.com/gmail/api/guides/sending
 */
export async function sendEmail(params: {
  to: string | string[]
  subject: string
  body: string
}) {
  const connection = await getActiveGmailConnection()
  if (!connection) {
    throw new Error("No Gmail connection — connect in Settings → Integrations")
  }

  const accessToken = await getValidGmailAccessToken()
  const toList = Array.isArray(params.to) ? params.to.join(", ") : params.to
  const raw = [
    `To: ${toList}`,
    `From: ${connection.email}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    params.body,
  ].join("\r\n")

  // Gmail expects base64url of the entire MIME message
  const base64 = Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64 }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gmail send failed (${res.status}): ${text}`)
  }
}

export async function sendChecklistAlertEmail(params: {
  to: string[]
  templateName: string
  venue: Venue
  runDate: string
  completedItems: number
  totalItems: number
  minutesOverdue: number
}) {
  const venueLabel = VENUE_SHORT_LABEL[params.venue] ?? params.venue
  const overdueHuman =
    params.minutesOverdue >= 60
      ? `${Math.floor(params.minutesOverdue / 60)}h ${params.minutesOverdue % 60}m`
      : `${params.minutesOverdue}m`
  const body = [
    `The ${params.templateName} checklist at ${venueLabel} is incomplete.`,
    ``,
    `  ${params.completedItems} of ${params.totalItems} items ticked`,
    `  Overdue by ${overdueHuman}`,
    `  Date: ${params.runDate}`,
    ``,
    `Open in Tarte Kitchen:`,
    `https://kitchen.tarte.com.au/checklists`,
    ``,
    `— Tarte Kitchen alerts`,
  ].join("\n")
  return sendEmail({
    to: params.to,
    subject: `[Tarte] ${params.templateName} — ${venueLabel} — overdue`,
    body,
  })
}
