export const dynamic = "force-dynamic"
export const maxDuration = 600

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma/client"
import { getActiveGmailConnection, getValidGmailAccessToken } from "@/lib/gmail/token"
import {
  searchMessages,
  getMessage,
  getAttachment,
  extractPdfAttachments,
  extractPlainTextBody,
  extractSenderEmail,
  getHeader,
} from "@/lib/gmail/client"
import { classifyServiceEmail } from "@/lib/services/classifier"
import {
  SERVICE_SEARCH_PHRASES,
  SERVICE_CATEGORY_BY_KEY,
  serviceCategoryLabel,
} from "@/lib/services/constants"

/**
 * Service-calendar email sweep. Finds grease trap / pest control /
 * canopy clean / fire inspection etc. invoices and booking emails in
 * accounts@ (including forwards from Chloe and Shawna and mail sent to
 * hello@ then forwarded), classifies each with Claude, and writes
 * ServiceVisit rows flagged needsReview for the admin /services page.
 *
 * Two Gmail queries per run, mirroring check-invoices:
 *   1. from known provider addresses (ServiceProgram.providerEmails)
 *   2. a generic full-text phrase sweep for unknown senders
 * Every message is classified at most once ever (ServiceEmailSeen) and
 * a re-processed message can't duplicate a visit (unique
 * [programId, gmailMessageId]).
 *
 * Params: ?preview=1 lists unprocessed candidates without classifying;
 * ?days=N widens the window (default 30, for backfills); ?limit=N caps
 * classifications per run (default 25).
 */

const DEFAULT_WINDOW_DAYS = 30
const DEFAULT_BATCH_LIMIT = 25

function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const url = new URL(request.url)
  const windowDays = Math.min(
    Math.max(parseInt(url.searchParams.get("days") ?? "", 10) || DEFAULT_WINDOW_DAYS, 1),
    365
  )
  const batchLimit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_BATCH_LIMIT, 1),
    200
  )
  const preview = url.searchParams.get("preview") === "1"

  try {
    const connection = await getActiveGmailConnection()
    if (!connection) {
      return Response.json({ ok: false, error: "No active Gmail connection" }, { status: 500 })
    }
    const accessToken = await getValidGmailAccessToken()

    const programs = await db.serviceProgram.findMany({ where: { active: true } })
    const providerEmails = Array.from(
      new Set(programs.flatMap((p) => p.providerEmails).filter(Boolean))
    )
    const programHints = programs
      .filter((p) => p.providerName)
      .map(
        (p) =>
          `- ${serviceCategoryLabel(p.category, p.label)} at ${p.venue}: ${p.providerName}` +
          (p.providerEmails.length ? ` (${p.providerEmails.join(", ")})` : "")
      )
      .join("\n")

    // Union of both queries, dedup on message id.
    const candidates = new Map<string, { id: string; threadId: string }>()
    if (providerEmails.length) {
      const q1 = `from:(${providerEmails.join(" OR ")}) newer_than:${windowDays}d`
      for (const m of await searchMessages(accessToken, q1, 500)) candidates.set(m.id, m)
    }
    const q2 = `(${SERVICE_SEARCH_PHRASES.join(" OR ")}) newer_than:${windowDays}d`
    for (const m of await searchMessages(accessToken, q2, 500)) candidates.set(m.id, m)

    // Skip anything already classified.
    const ids = Array.from(candidates.keys())
    const seen = await db.serviceEmailSeen.findMany({
      where: { gmailMessageId: { in: ids } },
      select: { gmailMessageId: true },
    })
    const seenSet = new Set(seen.map((s) => s.gmailMessageId))
    const fresh = ids.filter((id) => !seenSet.has(id))

    if (preview) {
      const sample = []
      for (const id of fresh.slice(0, 30)) {
        const msg = await getMessage(accessToken, id)
        sample.push({
          id,
          from: getHeader(msg, "From") ?? null,
          subject: getHeader(msg, "Subject") ?? null,
          date: getHeader(msg, "Date") ?? null,
        })
      }
      return Response.json({
        ok: true,
        preview: true,
        candidates: ids.length,
        unprocessed: fresh.length,
        sample,
      })
    }

    let created = 0
    let noService = 0
    let errors = 0
    const createdDetails: string[] = []

    for (const id of fresh.slice(0, batchLimit)) {
      try {
        const msg = await getMessage(accessToken, id)
        const subject = getHeader(msg, "Subject") ?? "(no subject)"
        const from = getHeader(msg, "From") ?? "(unknown)"
        const senderEmail = extractSenderEmail(msg)
        const received = new Date(parseInt(msg.internalDate, 10))
        const bodyText = extractPlainTextBody(msg)

        const pdfInfos = extractPdfAttachments(msg).filter(
          (a) => /\.pdf$/i.test(a.filename) || a.mimeType === "application/pdf"
        )
        const pdfs: Buffer[] = []
        for (const info of pdfInfos.slice(0, 2)) {
          pdfs.push(await getAttachment(accessToken, id, info.attachmentId))
        }

        // Nothing to read at all — skip without burning a Claude call.
        if (!bodyText && pdfs.length === 0) {
          await db.serviceEmailSeen.create({
            data: { gmailMessageId: id, outcome: "no-service", detail: "empty message" },
          })
          noService++
          continue
        }

        const result = await classifyServiceEmail({
          subject,
          from,
          receivedDate: dateStr(received),
          bodyText,
          pdfAttachments: pdfs,
          programHints,
        })

        if (!result.isService || result.visits.length === 0) {
          await db.serviceEmailSeen.create({
            data: { gmailMessageId: id, outcome: "no-service", detail: result.reason },
          })
          noService++
          continue
        }

        let visitCount = 0
        for (const visit of result.visits) {
          const venues: Venue[] =
            visit.venue === "BOTH" ? ["BURLEIGH", "BEACH_HOUSE"] : [visit.venue]
          for (const venue of venues) {
            const category = SERVICE_CATEGORY_BY_KEY[visit.category]
              ? visit.category
              : "other"
            let program =
              programs.find((p) => p.venue === venue && p.category === category) ?? null
            if (!program) {
              program = await db.serviceProgram.create({
                data: {
                  venue,
                  category,
                  label: category === "other" ? visit.category : null,
                  providerName: visit.providerName,
                  intervalDays: SERVICE_CATEGORY_BY_KEY[category]?.defaultIntervalDays ?? null,
                },
              })
              programs.push(program)
            }

            await db.serviceVisit.upsert({
              where: {
                programId_gmailMessageId: { programId: program.id, gmailMessageId: id },
              },
              update: {},
              create: {
                programId: program.id,
                kind: visit.kind,
                serviceDate: new Date(`${visit.serviceDate}T00:00:00`),
                providerName: visit.providerName,
                costCents:
                  visit.totalExGst != null ? Math.round(visit.totalExGst * 100) : null,
                source: "EMAIL",
                needsReview: true,
                gmailMessageId: id,
                emailSubject: subject,
                notes: visit.note,
              },
            })
            visitCount++

            // Learn the sender so future sweeps target it directly.
            if (
              senderEmail &&
              !senderEmail.endsWith("@tarte.com.au") &&
              !program.providerEmails.includes(senderEmail)
            ) {
              await db.serviceProgram.update({
                where: { id: program.id },
                data: { providerEmails: { push: senderEmail } },
              })
              program.providerEmails.push(senderEmail)
            }
          }
        }

        await db.serviceEmailSeen.create({
          data: {
            gmailMessageId: id,
            outcome: "created",
            detail: `${visitCount} visit(s): ${subject.slice(0, 140)}`,
          },
        })
        created += visitCount
        createdDetails.push(subject.slice(0, 100))
      } catch (e) {
        // No ServiceEmailSeen row on error: the next sweep retries it.
        console.error(`[check-service-emails] message ${id}:`, e)
        errors++
      }
    }

    console.log(
      `[check-service-emails] candidates=${ids.length} fresh=${fresh.length} created=${created} noService=${noService} errors=${errors}`
    )
    return Response.json({
      ok: true,
      candidates: ids.length,
      unprocessed: fresh.length,
      processed: Math.min(fresh.length, batchLimit),
      visitsCreated: created,
      noService,
      errors,
      createdDetails,
    })
  } catch (e) {
    console.error("[check-service-emails]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
