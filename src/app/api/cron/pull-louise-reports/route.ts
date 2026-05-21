/**
 * Thursday 07:00 AEST: poll accounts@tarte.com.au for Louise Kilgour's
 * weekly Mge / COGS report email (subject "Reports", 3 PDFs + 2 xlsx)
 * and push every attachment through the same parse + commit pipeline
 * the manual upload form uses.
 *
 * Routing: Louise can either send directly to accounts@, or chloe@ sets
 * up a Gmail filter forwarding `from:kilgour1@hotmail.com subject:Reports`
 * to accounts@. Either way this cron consumes the message and Chloe
 * gets a "done" email (failure → "needs your eyes" with the upload
 * link). Sensitive output stays out of accounts@ per the recipients
 * memory.
 *
 * Idempotency: each upload's filename embeds the Gmail message id,
 * so re-running on the same email skips already-ingested attachments.
 */

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getValidGmailAccessToken } from "@/lib/gmail/token"
import {
  searchMessages,
  getMessage,
  getAttachment,
  extractPdfAttachments,
  getHeader,
} from "@/lib/gmail/client"
import { sendHtmlEmail } from "@/lib/gmail/send"
import {
  parseLabourPdfRich,
  commitLabourMgePdf,
} from "@/lib/actions/labour"
import { parseCogsXlsx, commitCogsXlsx } from "@/lib/actions/cogs"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const SENDER = "kilgour1@hotmail.com"
const SUBJECT = "Reports"
const SEARCH_QUERY = `from:${SENDER} subject:${SUBJECT} newer_than:3d has:attachment`

// Sensitive output → chloe@ only (tarte_recipients.md).
const NOTIFY_RECIPIENT =
  process.env.WEEKLY_DIGEST_RECIPIENT || "chloe@tarte.com.au"

interface AttachmentOutcome {
  filename: string
  kind: "labour-pdf" | "cogs-xlsx" | "unknown"
  status: "ingested" | "skipped-duplicate" | "skipped-unknown" | "failed"
  weeks?: number
  error?: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const accessToken = await getValidGmailAccessToken()
    const messages = await searchMessages(accessToken, SEARCH_QUERY, 5)

    if (messages.length === 0) {
      // Quiet success — nothing to do. Don't email; cron runs weekly so
      // a missing report is noise unless we explicitly want to chase it.
      return Response.json({ ok: true, messagesFound: 0 })
    }

    const allOutcomes: Array<{
      messageId: string
      subject: string
      receivedAt: string | null
      outcomes: AttachmentOutcome[]
    }> = []

    for (const { id: messageId } of messages) {
      const message = await getMessage(accessToken, messageId)
      const subject = getHeader(message, "Subject") || "(no subject)"
      const dateHeader = getHeader(message, "Date") || null
      const attachments = extractPdfAttachments(message)

      const outcomes: AttachmentOutcome[] = []
      for (const att of attachments) {
        const outcome = await ingestOne(
          accessToken,
          messageId,
          att.attachmentId,
          att.filename,
          att.mimeType
        )
        outcomes.push(outcome)
      }

      allOutcomes.push({ messageId, subject, receivedAt: dateHeader, outcomes })
    }

    const summary = summarise(allOutcomes)
    await sendNotification(allOutcomes, summary)
    return Response.json({ ok: true, ...summary, details: allOutcomes })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    // Notify Chloe so a silent failure doesn't leave us without a digest.
    try {
      await sendHtmlEmail({
        to: NOTIFY_RECIPIENT,
        subject: "Tarte: Louise's report auto-pull failed",
        html: `<p>The Thursday auto-pull of Louise's reports hit an error.</p>
               <p><strong>Error:</strong> ${escape(errMsg)}</p>
               <p>You can still upload the files manually at <a href="https://kitchen.tarte.com.au/labour/upload">kitchen.tarte.com.au/labour/upload</a>.</p>`,
        text: `Auto-pull failed: ${errMsg}\nUpload manually at https://kitchen.tarte.com.au/labour/upload`,
      })
    } catch {
      // Notification itself failed — just log and surface.
      console.error("Failed to send failure notification", e)
    }
    return Response.json({ error: errMsg }, { status: 500 })
  }
}

async function ingestOne(
  accessToken: string,
  messageId: string,
  attachmentId: string,
  origFilename: string,
  mimeType: string
): Promise<AttachmentOutcome> {
  // Embed the Gmail message id so re-runs are idempotent.
  const tag = `[gmail:${messageId.slice(0, 12)}]`
  const filename = `${tag} ${origFilename}`

  const kind: AttachmentOutcome["kind"] =
    mimeType === "application/pdf"
      ? "labour-pdf"
      : mimeType.includes("spreadsheet") || mimeType.includes("excel")
      ? "cogs-xlsx"
      : "unknown"

  if (kind === "unknown") {
    return {
      filename: origFilename,
      kind,
      status: "skipped-unknown",
      error: `Unsupported mime type: ${mimeType}`,
    }
  }

  // Idempotency check — skip if we've already ingested THIS attachment
  // (by its full tagged filename). Bug fix 2026-05-21: previous version
  // matched on `startsWith: tag`, which silently dropped the 2nd, 3rd…
  // attachment of any email that bundled multiple files of the same kind
  // (e.g. Louise's Thursday email packs Burleigh + Currumbin + Tea Garden
  // labour PDFs *and* two COGS xlsx — only the first of each kind was
  // ingested, the rest were marked "duplicate"). Matching the full
  // filename means each attachment dedupes against itself only.
  if (kind === "labour-pdf") {
    const existing = await db.labourUpload.findFirst({
      where: { filename },
    })
    if (existing) {
      return {
        filename: origFilename,
        kind,
        status: "skipped-duplicate",
        weeks: existing.weekCount,
      }
    }
  } else {
    const existing = await db.cogsUpload.findFirst({
      where: { filename },
    })
    if (existing) {
      return {
        filename: origFilename,
        kind,
        status: "skipped-duplicate",
        weeks: existing.weekCount,
      }
    }
  }

  try {
    const buf = await getAttachment(accessToken, messageId, attachmentId)
    const base64 = buf.toString("base64")

    if (kind === "labour-pdf") {
      const { weeks } = await parseLabourPdfRich({
        pdfBase64: base64,
        filename,
      })
      const missing = weeks.filter(
        (w) => w.venue === null || !w.weekStartWed
      )
      if (missing.length > 0) {
        return {
          filename: origFilename,
          kind,
          status: "failed",
          error: `${missing.length}/${weeks.length} week(s) missing venue or week-start — needs manual review`,
        }
      }
      const res = await commitLabourMgePdf({
        filename,
        rawPdfBase64: "",
        weeks,
        uploadedBy: "cron:pull-louise-reports",
      })
      return {
        filename: origFilename,
        kind,
        status: "ingested",
        weeks: res.weeks,
      }
    }

    // COGS xlsx
    const { weeks } = await parseCogsXlsx({ xlsxBase64: base64, filename })
    const missing = weeks.filter((w) => w.venue === null || !w.weekStartWed)
    if (missing.length > 0) {
      return {
        filename: origFilename,
        kind,
        status: "failed",
        error: `${missing.length}/${weeks.length} COGS week(s) missing venue or week-start — needs manual review`,
      }
    }
    const res = await commitCogsXlsx({
      filename,
      weeks,
      uploadedBy: "cron:pull-louise-reports",
    })
    return {
      filename: origFilename,
      kind,
      status: "ingested",
      weeks: res.weeks,
    }
  } catch (e) {
    return {
      filename: origFilename,
      kind,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

function summarise(
  allOutcomes: Array<{ outcomes: AttachmentOutcome[] }>
): {
  messagesFound: number
  attachmentsTotal: number
  ingested: number
  duplicates: number
  failed: number
  unknown: number
} {
  const all = allOutcomes.flatMap((m) => m.outcomes)
  return {
    messagesFound: allOutcomes.length,
    attachmentsTotal: all.length,
    ingested: all.filter((o) => o.status === "ingested").length,
    duplicates: all.filter((o) => o.status === "skipped-duplicate").length,
    failed: all.filter((o) => o.status === "failed").length,
    unknown: all.filter((o) => o.status === "skipped-unknown").length,
  }
}

async function sendNotification(
  allOutcomes: Array<{
    messageId: string
    subject: string
    receivedAt: string | null
    outcomes: AttachmentOutcome[]
  }>,
  summary: ReturnType<typeof summarise>
) {
  // Skip the email when every attachment is a duplicate from a previous
  // run — that's just the cron checking idempotently, no news for Chloe.
  if (
    summary.ingested === 0 &&
    summary.failed === 0 &&
    summary.unknown === 0 &&
    summary.duplicates > 0
  ) {
    return
  }

  const hasFailure = summary.failed > 0 || summary.unknown > 0
  const subject = hasFailure
    ? `Tarte: Louise's reports auto-pull — ${summary.failed + summary.unknown} need your eyes`
    : `Tarte: Louise's reports ingested (${summary.ingested}/${summary.attachmentsTotal})`

  const rows = allOutcomes
    .flatMap((m) =>
      m.outcomes.map(
        (o) => `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escape(o.filename)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escape(o.kind)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escape(o.status)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${o.weeks ?? ""}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#9a2a2a;">${o.error ? escape(o.error) : ""}</td>
        </tr>`
      )
    )
    .join("")

  const html = `
    <p>Auto-pull of Louise's weekly reports ran from <code>${escape(SENDER)}</code>.</p>
    <p><strong>Summary:</strong> ${summary.ingested} ingested · ${summary.duplicates} duplicate (already in) · ${summary.failed} failed · ${summary.unknown} unsupported.</p>
    ${
      hasFailure
        ? `<p style="color:#9a2a2a;"><strong>Action needed:</strong> upload the failed files manually at <a href="https://kitchen.tarte.com.au/labour/upload">kitchen.tarte.com.au/labour/upload</a>.</p>`
        : `<p>Friday digest will pick these up automatically.</p>`
    }
    <table style="border-collapse:collapse;font-size:13px;font-family:-apple-system,sans-serif;">
      <thead><tr style="background:#f5f3ef;">
        <th style="padding:6px 10px;text-align:left;">Filename</th>
        <th style="padding:6px 10px;text-align:left;">Kind</th>
        <th style="padding:6px 10px;text-align:left;">Status</th>
        <th style="padding:6px 10px;text-align:left;">Weeks</th>
        <th style="padding:6px 10px;text-align:left;">Note</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`

  const text = allOutcomes
    .flatMap((m) =>
      m.outcomes.map(
        (o) =>
          `- ${o.filename} [${o.kind}] → ${o.status}${o.weeks ? ` (${o.weeks} weeks)` : ""}${o.error ? ` :: ${o.error}` : ""}`
      )
    )
    .join("\n")

  await sendHtmlEmail({
    to: NOTIFY_RECIPIENT,
    subject,
    html,
    text:
      `Auto-pull of Louise's reports.\n\n${summary.ingested} ingested, ${summary.duplicates} dup, ${summary.failed} failed, ${summary.unknown} unsupported.\n\n${text}`,
  })
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
