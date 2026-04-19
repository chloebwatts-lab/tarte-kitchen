import { db } from "@/lib/db"
import { decrypt } from "@/lib/encryption"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma"

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me"

/**
 * Send a plain-text email via the connected Gmail account. We already have
 * the OAuth infrastructure for reading invoices — the same tokens let us
 * send from accounts@tarte.com.au with `send` scope.
 *
 * Uses RFC 2822 encoded base64url per Gmail spec:
 *   https://developers.google.com/gmail/api/guides/sending
 *
 * Throws if no connection exists so the caller can log / surface a warning.
 */
export async function sendEmail(params: {
  to: string | string[]
  subject: string
  body: string
}) {
  const connection = await db.gmailConnection.findFirst()
  if (!connection) {
    throw new Error("No Gmail connection — connect in Settings → Integrations")
  }

  const accessToken = await getValidAccessToken(connection.id)
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

async function getValidAccessToken(connectionId: string): Promise<string> {
  const c = await db.gmailConnection.findUnique({ where: { id: connectionId } })
  if (!c) throw new Error("Gmail connection not found")

  // If the current token is still valid for more than 60 seconds, use it.
  if (c.tokenExpiry && c.tokenExpiry.getTime() > Date.now() + 60_000) {
    return decrypt(c.accessToken)
  }

  // Otherwise refresh.
  const refreshToken = decrypt(c.refreshToken)
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${await res.text()}`)
  }
  const data = (await res.json()) as {
    access_token: string
    expires_in: number
  }
  // Updating the stored token requires encryption; the existing gmail/token
  // helper handles that — but to keep this file self-contained and cheap to
  // reason about, we leave the existing connection untouched and just return
  // the fresh token. Refresh is idempotent, so next call does the same work.
  // For hot paths, swap this for a proper update.
  return data.access_token
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
