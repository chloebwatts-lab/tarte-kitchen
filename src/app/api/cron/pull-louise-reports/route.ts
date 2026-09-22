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
import { button, callout, para, section, shell, table, tiles, type Tone } from "@/lib/email/brand"
import {
  parseLabourPdfRich,
  commitLabourMgePdf,
} from "@/lib/actions/labour"
import { parseCogsXlsx, commitCogsXlsx } from "@/lib/actions/cogs"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const SENDER = "kilgour1@hotmail.com"
const FORWARDER = "chloe@tarte.com.au"
const SUBJECT = "Reports"
// Louise sometimes leaves accounts@ off and Chloe forwards her email by hand
// (first seen 2026-07-16). Match either the direct email or the manual
// forward: subject:Reports also hits "Fwd: Reports", and the forwarded body
// always cites Louise's address, which keeps Chloe's other mail out.
const SEARCH_QUERY = `{from:${SENDER} (from:${FORWARDER} "${SENDER}")} subject:${SUBJECT} newer_than:7d has:attachment`

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
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const accessToken = await getValidGmailAccessToken()
    const messages = await searchMessages(accessToken, SEARCH_QUERY, 5)

    if (messages.length === 0) {
      // No Reports email this week. Tell Chloe so she can chase Louise or
      // upload manually; a silent skip meant Friday's digest quietly ran
      // without actuals.
      const noReportText =
        "Heads up, the Thursday auto-pull didn't find a Reports email from Louise this week, so Friday's digest may be missing the wages and COGS actuals. If she's sent it somewhere else, forward it to accounts@ or upload the files at https://kitchen.tarte.com.au/labour/upload and the digest will pick them up."
      await sendHtmlEmail({
        to: NOTIFY_RECIPIENT,
        subject: "Tarte: no Reports email from Louise this week",
        html: shell({
          kicker: "Louise's reports",
          title: "No Reports email this week",
          preheader: noReportText,
          sections: [
            section(null, para(noReportText) + button("Upload the files", "https://kitchen.tarte.com.au/labour/upload"), { tone: "gold" }),
          ],
        }),
        text: noReportText,
      })
      return Response.json({ ok: true, messagesFound: 0, notified: true })
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
        html: shell({
          kicker: "Louise's reports",
          title: "Auto-pull failed",
          preheader: `Auto-pull failed: ${errMsg}`,
          sections: [
            section(
              null,
              para("The Thursday auto-pull of Louise's reports hit an error.") +
                callout(errMsg, "red", { label: "Error" }) +
                `<div style="margin-top:12px;">${para("You can still upload the files manually at kitchen.tarte.com.au/labour/upload.")}</div>` +
                button("Upload manually", "https://kitchen.tarte.com.au/labour/upload"),
              { tone: "red" }
            ),
          ],
        }),
        text: `Auto-pull failed: ${errMsg}\nUpload manually at https://kitchen.tarte.com.au/labour/upload`,
      })
    } catch {
      // Notification itself failed, just log and surface.
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

  // Some mail clients label every attachment application/octet-stream.
  // extractPdfAttachments already lets those through on the filename, so
  // fall back to the extension here too rather than calling them unknown.
  const kind: AttachmentOutcome["kind"] =
    mimeType === "application/pdf"
      ? "labour-pdf"
      : mimeType.includes("spreadsheet") || mimeType.includes("excel")
      ? "cogs-xlsx"
      : mimeType === "application/octet-stream" && /\.pdf$/i.test(origFilename)
      ? "labour-pdf"
      : mimeType === "application/octet-stream" && /\.xlsx?$/i.test(origFilename)
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

  // Idempotency check, skip if we've already ingested THIS attachment
  // (by its full tagged filename). Bug fix 2026-05-21: previous version
  // matched on `startsWith: tag`, which silently dropped the 2nd, 3rd…
  // attachment of any email that bundled multiple files of the same kind
  // (e.g. Louise's Thursday email packs Burleigh + Currumbin + Tea Garden
  // labour PDFs *and* two COGS xlsx, only the first of each kind was
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
          error: `${missing.length}/${weeks.length} week(s) missing venue or week-start, needs manual review`,
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
        error: `${missing.length}/${weeks.length} COGS week(s) missing venue or week-start, needs manual review`,
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
  // run, that's just the cron checking idempotently, no news for Chloe.
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
    ? `Tarte: Louise's reports auto-pull: ${summary.failed + summary.unknown} need your eyes`
    : `Tarte: Louise's reports ingested (${summary.ingested}/${summary.attachmentsTotal})`

  const statusTone = (status: AttachmentOutcome["status"]): Tone =>
    status === "ingested" ? "done" : status === "failed" ? "red" : status === "skipped-unknown" ? "warn" : "neutral"

  const rows = allOutcomes.flatMap((m) =>
    m.outcomes.map((o) => [
      o.filename,
      o.kind,
      { text: o.status, tone: statusTone(o.status), strong: true },
      o.weeks != null ? String(o.weeks) : "",
      { text: o.error ?? "", tone: "red" as Tone },
    ])
  )

  const html = shell({
    kicker: "Louise's reports",
    title: hasFailure
      ? `${summary.failed + summary.unknown} need your eyes`
      : `${summary.ingested} of ${summary.attachmentsTotal} ingested`,
    subtitle: `Auto-pull of Louise's weekly reports ran from ${SENDER}.`,
    preheader: `${summary.ingested} ingested, ${summary.duplicates} duplicate, ${summary.failed} failed, ${summary.unknown} unsupported`,
    sections: [
      tiles([
        { label: "Ingested", value: String(summary.ingested), tone: summary.ingested > 0 ? "done" : "neutral" },
        { label: "Duplicate (already in)", value: String(summary.duplicates) },
        { label: "Failed", value: String(summary.failed), tone: summary.failed > 0 ? "red" : "neutral" },
        { label: "Unsupported", value: String(summary.unknown), tone: summary.unknown > 0 ? "warn" : "neutral" },
      ]),
      hasFailure
        ? section(
            null,
            callout("Action needed: upload the failed files manually at kitchen.tarte.com.au/labour/upload.", "red") +
              button("Upload manually", "https://kitchen.tarte.com.au/labour/upload"),
            { tone: "red" }
          )
        : callout("Friday digest will pick these up automatically.", "done"),
      section(
        "Attachments",
        table(
          [{ header: "Filename" }, { header: "Kind" }, { header: "Status" }, { header: "Weeks" }, { header: "Note" }],
          rows
        )
      ),
    ],
  })

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

