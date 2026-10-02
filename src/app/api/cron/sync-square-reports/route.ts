export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { getActiveGmailConnection, getValidGmailAccessToken } from "@/lib/gmail/token"
import { searchMessages, getMessage, getHeader } from "@/lib/gmail/client"
import {
  parseSquareDailySummaryMessage,
  isSquareReportSender,
  SQUARE_REPORT_SENDERS,
  SQUARE_REPORT_SUBJECT,
} from "@/lib/square/email-parser"
import { importSquareDailySummary } from "@/lib/square/import"

/**
 * Pull Square "daily sales summary" emails (one per location, ~00:30 AEST for
 * the previous trading day) from the finance mailbox and write them into
 * DailySalesSummary + DailyCategorySales. Square went live at Currumbin on
 * 1 Oct 2026; Burleigh follows. The emails are addressed to chloe@ and reach
 * accounts@ by forward, hence the From check on the original sender rather
 * than the envelope.
 *
 * Idempotent: SquareReportImport dedupes by Gmail message id, and the import
 * itself upserts, so the fixed lookback window (default 5 days, ?days=N up
 * to 60 for a backfill) is safe to re-scan every run.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const connection = await getActiveGmailConnection()
  if (!connection) {
    return Response.json({ error: "Gmail not connected" }, { status: 400 })
  }

  const url = new URL(request.url)
  const daysParam = parseInt(url.searchParams.get("days") ?? "", 10)
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(60, daysParam)) : 5

  try {
    const accessToken = await getValidGmailAccessToken()
    const afterSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)
    // Forwarded copies keep the subject; the From may be Square's or the
    // forwarding mailbox's, so search on subject and verify the sender below
    // (either the From header or the forwarded "From:" line in the body).
    const query = `subject:"${SQUARE_REPORT_SUBJECT}" after:${afterSec}`
    const refs = await searchMessages(accessToken, query, 500)

    const imported: Array<{ venue: string; date: string; grossSales: number; categories: number }> = []
    const skipped: string[] = []
    const errors: string[] = []

    for (const ref of refs) {
      try {
        const done = await db.squareReportImport.findUnique({ where: { gmailMessageId: ref.id } })
        if (done) continue

        const message = await getMessage(accessToken, ref.id)
        const from = getHeader(message, "From")
        const senderOk =
          isSquareReportSender(from) ||
          // Gmail forward: original sender is quoted in the body header.
          SQUARE_REPORT_SENDERS.some((s) => JSON.stringify(message.payload).toLowerCase().includes(s))
        if (!senderOk) {
          skipped.push(`${ref.id}: sender "${from ?? "?"}" is not Square`)
          continue
        }

        const summary = parseSquareDailySummaryMessage(message)
        const result = await importSquareDailySummary(summary, { gmailMessageId: ref.id })
        imported.push(result)
      } catch (err) {
        errors.push(`Message ${ref.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return Response.json({
      success: true,
      days,
      messagesFound: refs.length,
      imported,
      skipped: skipped.length ? skipped : undefined,
      errors: errors.length ? errors : undefined,
    })
  } catch (err) {
    console.error("[sync-square-reports]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
