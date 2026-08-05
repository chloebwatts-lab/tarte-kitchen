import { NextRequest } from "next/server"
import { sendHtmlEmail } from "@/lib/gmail/send"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Internal email relay for sibling services on this droplet (currently the
// SEO engine's approval digest). Sends through the connected Gmail account
// so no third-party sender or DNS verification is needed.
//
// Locked down two ways: the CRON_SECRET bearer token, and recipients must be
// @tarte.com.au, this must never become an open relay.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  let body: { to?: unknown; subject?: unknown; html?: unknown; text?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { to, subject, html, text } = body
  if (typeof to !== "string" || typeof subject !== "string" || typeof html !== "string") {
    return Response.json(
      { error: "Required fields: to (string), subject (string), html (string)" },
      { status: 400 }
    )
  }

  // Header-injection guard: CR/LF in to/subject would let a caller smuggle
  // extra SMTP headers (Bcc, additional recipients) into the raw message.
  if (/[\r\n]/.test(to) || /[\r\n]/.test(subject)) {
    return Response.json(
      { error: "to and subject must not contain newline characters" },
      { status: 400 }
    )
  }

  // Each recipient must be a full, well-formed @tarte.com.au address, not
  // just a string that happens to end with the domain.
  const RECIPIENT_RE = /^[A-Za-z0-9._%+-]+@tarte\.com\.au$/
  const recipients = to.split(",").map((r) => r.trim()).filter(Boolean)
  if (
    recipients.length === 0 ||
    recipients.some((r) => !RECIPIENT_RE.test(r))
  ) {
    return Response.json(
      { error: "Recipients must all be @tarte.com.au addresses" },
      { status: 400 }
    )
  }

  try {
    await sendHtmlEmail({
      to: recipients,
      subject,
      html,
      text: typeof text === "string" && text.length > 0 ? text : subject,
    })
    return Response.json({ ok: true, to: recipients, subject })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
