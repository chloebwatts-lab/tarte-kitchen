export const dynamic = "force-dynamic"
export const maxDuration = 600

import { db } from "@/lib/db"
import { Prisma, Venue } from "@/generated/prisma/client"
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
 * canopy clean / fire inspection etc. invoices and booking emails,
 * classifies each with Claude, and writes ServiceVisit rows flagged
 * needsReview for the admin /services page.
 *
 * Sweeps TWO mailboxes:
 *   - accounts@ via the app's own Gmail connection
 *   - hello@ via the tarte-inbox app's stored Google token
 *     (inbox_oauth_tokens, same Postgres). If that token is expired we
 *     refresh it ourselves when INBOX_GMAIL_CLIENT_ID/SECRET are set,
 *     else hello@ is skipped this run and reported in the response.
 *
 * Per mailbox, two Gmail queries (mirroring check-invoices): from known
 * provider addresses (ServiceProgram.providerEmails) + a generic
 * full-text phrase sweep. Every message is classified at most once ever
 * (ServiceEmailSeen; hello@ ids are stored prefixed "hello:") and the
 * same visit arriving through both mailboxes or as invoice + reminder +
 * forward is collapsed by the same-event guard (same program + kind
 * ±3 days, same cost).
 *
 * Params: ?preview=1 lists unprocessed candidates without classifying;
 * ?days=N widens the window (default 30, for backfills); ?limit=N caps
 * classifications per run (default 25, shared across mailboxes).
 */

const DEFAULT_WINDOW_DAYS = 30
const DEFAULT_BATCH_LIMIT = 25

function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

interface InboxTokenRow {
  access_token: string | null
  refresh_token: string | null
  expiry: Date | null
}

/**
 * Access token for hello@ from the tarte-inbox app's token store.
 * Reuses the stored token while fresh; refreshes (and persists the
 * refreshed token back for tarte-inbox) when we have that app's OAuth
 * client credentials in env.
 */
async function getHelloAccessToken(): Promise<string | null> {
  let rows: InboxTokenRow[]
  try {
    rows = await db.$queryRaw<InboxTokenRow[]>(
      Prisma.sql`SELECT access_token, refresh_token, expiry FROM inbox_oauth_tokens WHERE provider = 'google'`
    )
  } catch {
    // Table absent (tarte-inbox not installed) — nothing to sweep.
    return null
  }
  if (!rows.length) return null
  const { access_token, refresh_token, expiry } = rows[0]

  if (access_token && expiry && expiry.getTime() > Date.now() + 2 * 60 * 1000) {
    return access_token
  }

  const clientId = process.env.INBOX_GMAIL_CLIENT_ID
  const clientSecret = process.env.INBOX_GMAIL_CLIENT_SECRET
  if (!refresh_token || !clientId || !clientSecret) return null

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) {
    console.error("[check-service-emails] hello@ token refresh failed:", await res.text())
    return null
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  await db.$executeRaw(
    Prisma.sql`UPDATE inbox_oauth_tokens
      SET access_token = ${data.access_token},
          expiry = ${new Date(Date.now() + data.expires_in * 1000)},
          updated_at = now()
      WHERE provider = 'google'`
  )
  return data.access_token
}

interface MailboxStats {
  candidates: number
  unprocessed: number
  processed: number
  visitsCreated: number
  noService: number
  errors: number
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
  let batchBudget = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_BATCH_LIMIT, 1),
    200
  )
  const preview = url.searchParams.get("preview") === "1"

  try {
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

    // Mailboxes to sweep. Seen/visit ids for accounts@ stay bare for
    // back-compat with rows written before hello@ support.
    const mailboxes: Array<{ key: string; idPrefix: string; token: string }> = []
    const connection = await getActiveGmailConnection()
    if (connection) {
      mailboxes.push({
        key: "accounts",
        idPrefix: "",
        token: await getValidGmailAccessToken(),
      })
    }
    const helloToken = await getHelloAccessToken()
    if (helloToken) {
      mailboxes.push({ key: "hello", idPrefix: "hello:", token: helloToken })
    }
    if (!mailboxes.length) {
      return Response.json({ ok: false, error: "No mailbox tokens available" }, { status: 500 })
    }

    const stats: Record<string, MailboxStats> = {}
    const createdDetails: string[] = []
    const previewSample: Array<Record<string, string | null>> = []

    for (const mailbox of mailboxes) {
      const candidates = new Map<string, true>()
      if (providerEmails.length) {
        const q1 = `from:(${providerEmails.join(" OR ")}) newer_than:${windowDays}d`
        for (const m of await searchMessages(mailbox.token, q1, 500)) candidates.set(m.id, true)
      }
      // -from:accounts@ keeps our own app's emails (checklist nudges,
      // digests, which mention "deep clean" etc.) out of the sweep.
      const q2 = `(${SERVICE_SEARCH_PHRASES.join(" OR ")}) -from:accounts@tarte.com.au newer_than:${windowDays}d`
      for (const m of await searchMessages(mailbox.token, q2, 500)) candidates.set(m.id, true)

      const ids = Array.from(candidates.keys())
      const storedIds = ids.map((id) => mailbox.idPrefix + id)
      const seen = await db.serviceEmailSeen.findMany({
        where: { gmailMessageId: { in: storedIds } },
        select: { gmailMessageId: true },
      })
      const seenSet = new Set(seen.map((s) => s.gmailMessageId))
      const fresh = ids.filter((id) => !seenSet.has(mailbox.idPrefix + id))

      const s: MailboxStats = {
        candidates: ids.length,
        unprocessed: fresh.length,
        processed: 0,
        visitsCreated: 0,
        noService: 0,
        errors: 0,
      }
      stats[mailbox.key] = s

      if (preview) {
        for (const id of fresh.slice(0, 15)) {
          const msg = await getMessage(mailbox.token, id)
          previewSample.push({
            mailbox: mailbox.key,
            id,
            from: getHeader(msg, "From") ?? null,
            subject: getHeader(msg, "Subject") ?? null,
            date: getHeader(msg, "Date") ?? null,
          })
        }
        continue
      }

      for (const id of fresh) {
        if (batchBudget <= 0) break
        batchBudget--
        s.processed++
        const storedId = mailbox.idPrefix + id
        try {
          const msg = await getMessage(mailbox.token, id)
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
            pdfs.push(await getAttachment(mailbox.token, id, info.attachmentId))
          }

          // Nothing to read at all — skip without burning a Claude call.
          if (!bodyText && pdfs.length === 0) {
            await db.serviceEmailSeen.create({
              data: { gmailMessageId: storedId, outcome: "no-service", detail: "empty message" },
            })
            s.noService++
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
              data: { gmailMessageId: storedId, outcome: "no-service", detail: result.reason },
            })
            s.noService++
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
                    intervalDays:
                      SERVICE_CATEGORY_BY_KEY[category]?.defaultIntervalDays ?? null,
                  },
                })
                programs.push(program)
              }

              // Same-event guard: the one invoice often arrives several
              // times (Xero copy + provider's own email, reminders,
              // forwards, and via BOTH mailboxes). Same program + kind
              // within 3 days with the same cost (or no cost recorded)
              // is the same visit, skip it.
              const windowStart = new Date(`${visit.serviceDate}T00:00:00`)
              windowStart.setDate(windowStart.getDate() - 3)
              const windowEnd = new Date(`${visit.serviceDate}T00:00:00`)
              windowEnd.setDate(windowEnd.getDate() + 3)
              const costCents =
                visit.totalExGst != null ? Math.round(visit.totalExGst * 100) : null
              const dupe = await db.serviceVisit.findFirst({
                where: {
                  programId: program.id,
                  kind: visit.kind,
                  serviceDate: { gte: windowStart, lte: windowEnd },
                  ...(costCents != null
                    ? { OR: [{ costCents }, { costCents: null }] }
                    : {}),
                },
              })
              if (dupe) continue

              await db.serviceVisit.upsert({
                where: {
                  programId_gmailMessageId: {
                    programId: program.id,
                    gmailMessageId: storedId,
                  },
                },
                update: {},
                create: {
                  programId: program.id,
                  kind: visit.kind,
                  serviceDate: new Date(`${visit.serviceDate}T00:00:00`),
                  providerName: visit.providerName,
                  costCents,
                  source: "EMAIL",
                  needsReview: true,
                  gmailMessageId: storedId,
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
              gmailMessageId: storedId,
              outcome: "created",
              detail: `${visitCount} visit(s): ${subject.slice(0, 140)}`,
            },
          })
          s.visitsCreated += visitCount
          createdDetails.push(`[${mailbox.key}] ${subject.slice(0, 100)}`)
        } catch (e) {
          // No ServiceEmailSeen row on error: the next sweep retries it.
          console.error(`[check-service-emails] ${mailbox.key} message ${id}:`, e)
          s.errors++
        }
      }
    }

    const totals = Object.values(stats).reduce(
      (a, b) => ({
        candidates: a.candidates + b.candidates,
        unprocessed: a.unprocessed + b.unprocessed,
        processed: a.processed + b.processed,
        visitsCreated: a.visitsCreated + b.visitsCreated,
        noService: a.noService + b.noService,
        errors: a.errors + b.errors,
      }),
      { candidates: 0, unprocessed: 0, processed: 0, visitsCreated: 0, noService: 0, errors: 0 }
    )
    const helloSkipped = !mailboxes.some((m) => m.key === "hello")

    console.log(
      `[check-service-emails] mailboxes=${mailboxes.map((m) => m.key).join(",")} ` +
        `candidates=${totals.candidates} fresh=${totals.unprocessed} created=${totals.visitsCreated} ` +
        `noService=${totals.noService} errors=${totals.errors}`
    )
    if (preview) {
      return Response.json({
        ok: true,
        preview: true,
        helloSkipped,
        stats,
        ...totals,
        sample: previewSample,
      })
    }
    return Response.json({ ok: true, helloSkipped, stats, ...totals, createdDetails })
  } catch (e) {
    console.error("[check-service-emails]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
