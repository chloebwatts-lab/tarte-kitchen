export const dynamic = "force-dynamic"
export const maxDuration = 600

import { db } from "@/lib/db"
import type { InvoiceStatus } from "@/generated/prisma"
import { getActiveGmailConnection } from "@/lib/gmail/token"
import { getValidGmailAccessToken } from "@/lib/gmail/token"
import {
  searchMessages,
  getMessage,
  getAttachment,
  extractPdfAttachments,
  extractSenderEmail,
  extractSenderName,
  getHeader,
} from "@/lib/gmail/client"
import { saveInvoicePdf } from "@/lib/invoices/storage"
import { parseInvoicePdf } from "@/lib/invoices/parser"
import { processInvoice } from "@/lib/invoices/processor"
import Fuse from "fuse.js"
import { readFile } from "fs/promises"
import path from "path"

/**
 * Resilient supplier-invoice ingestion.
 *
 * Two queries per run, both relying on the `Invoice.gmailMessageId
 * @unique` constraint to dedupe — so re-scanning a window we've
 * already processed is free:
 *
 *   1. Incremental — `from:(supplier-emails) after:lastScanAt`. Fast
 *      path for normal daily ticks.
 *   2. Sweep — `from:(supplier-emails) newer_than:14d`. Catches anything
 *      a stale or jumped watermark would have skipped. Without this the
 *      pipeline silently lost ~30 invoices over 4 days in May 2026.
 *
 * Plus a separate query for *unknown* senders so PDFs from newly-onboarded
 * or renamed-email-from suppliers land in a review queue rather than
 * disappearing.
 *
 * Every run writes an `InvoiceSyncRun` audit row so the dashboard can
 * red-flag a 0-invoice streak or repeated errors within 24 h.
 */

interface SupplierRef {
  id: string
  name: string
}

async function buildSupplierEmailMap(): Promise<{
  emailMap: Map<string, SupplierRef[]>
  allEmails: string[]
}> {
  const emailMap = new Map<string, SupplierRef[]>()

  const supplierEmails = await db.supplierEmail.findMany({
    include: { supplier: { select: { id: true, name: true } } },
  })
  for (const se of supplierEmails) {
    const email = se.email.toLowerCase()
    const existing = emailMap.get(email) ?? []
    if (!existing.some((s) => s.id === se.supplier.id)) {
      existing.push({ id: se.supplier.id, name: se.supplier.name })
    }
    emailMap.set(email, existing)
  }

  const suppliers = await db.supplier.findMany({
    where: { email: { not: null } },
    select: { id: true, name: true, email: true },
  })
  for (const s of suppliers) {
    if (!s.email) continue
    const email = s.email.toLowerCase()
    const existing = emailMap.get(email) ?? []
    if (!existing.some((e) => e.id === s.id)) {
      existing.push({ id: s.id, name: s.name })
    }
    emailMap.set(email, existing)
  }

  return { emailMap, allEmails: Array.from(emailMap.keys()) }
}

// Some Xero-domain suppliers can't be matched from their invoices at all:
// Breadtop's legal entity is EAC BUSINESS GROUP PTY LTD, its Xero display
// name is the director ("Ka Wai Chan"), and its PDFs parse with the
// CUSTOMER (Tarte trust) as the supplier. Explicit probe→supplier hints
// break the tie (checked before token/fuzzy matching; only ever selects
// from the candidates already mapped to the sending address).
const SENDER_PROBE_HINTS: Array<{ probe: string; supplier: string }> = [
  { probe: "ka wai chan", supplier: "Breadtop" },
  { probe: "eac business group", supplier: "Breadtop" },
  // Coastal Fresh also sends via Xero's relay ("Accounts Receivable -
  // Coastal Fresh" from messaging-service@post.xero.com). The token
  // fast-path ties between "Coastal Fresh" and "Gold Coast Premium Foods"
  // ("coast" hits both), and Fuse then rejects the long display name, so
  // these invoices were never ingested. Their legal entity is The Dave's
  // Wholesale Trust.
  { probe: "coastal fresh", supplier: "Coastal Fresh" },
  { probe: "dave's wholesale", supplier: "Coastal Fresh" },
]

// Known NON-FOOD senders on the shared Xero address. Deliberately not
// ingested (overheads would distort the COGS spend tracker) — skip them
// silently instead of logging a "could not match" error on every sweep.
const IGNORED_SENDER_PROBES = [
  "here to help clean",
  "drive accountants",
]

function disambiguateSupplier(
  candidates: SupplierRef[],
  parsedSupplierName: string | null,
  senderDisplayName: string | null
): SupplierRef | null {
  if (candidates.length === 1) return candidates[0]
  const probes = [parsedSupplierName, senderDisplayName].filter(
    (s): s is string => !!s
  )

  const probeStrAll = probes.join(" ").toLowerCase()
  for (const hint of SENDER_PROBE_HINTS) {
    if (probeStrAll.includes(hint.probe)) {
      const hit = candidates.find(
        (c) => c.name.toLowerCase() === hint.supplier.toLowerCase()
      )
      if (hit) return hit
    }
  }

  // Token-overlap fast path. Fuse's char-level threshold rejects
  // "Pixel Bakehouse Pty Ltd" → "Pixel Bread" even though "Pixel"
  // matches cleanly, so we pre-check for distinctive shared tokens
  // (≥4 chars, skips "the"/"of"). If exactly one candidate has any
  // such token in either probe, pick it.
  if (probes.length > 0) {
    const probeStr = probes.join(" ").toLowerCase()
    const hits = candidates.filter((c) =>
      c.name
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 4)
        .some((t) => probeStr.includes(t))
    )
    if (hits.length === 1) return hits[0]
  }

  for (const probe of probes) {
    const fuse = new Fuse(candidates, { keys: ["name"], threshold: 0.4, includeScore: true })
    const results = fuse.search(probe)
    if (results.length > 0) return results[0].item
  }
  return null
}

interface ProcessStats {
  messagesFound: number
  invoicesIngested: number
  duplicates: number
  statements: number
  orderConfirmations: number
  rescued: number
  errors: string[]
}

/**
 * Shared post-parse pipeline for a freshly parsed PDF that already has an
 * Invoice row: classify statements and order confirmations, content-dedupe
 * against active invoices, otherwise run the full line-item processor.
 * Used by both the Gmail ingestion loop and the sweep rescue path.
 */
async function finalizeParsedInvoice(
  invoiceId: string,
  supplier: SupplierRef,
  parsed: Awaited<ReturnType<typeof parseInvoicePdf>>,
  stats: ProcessStats
): Promise<void> {
  const parsedMeta = {
    invoiceNumber: parsed.invoiceNumber,
    invoiceDate: parsed.invoiceDate ? new Date(parsed.invoiceDate) : null,
    total: parsed.total,
    extractedData: JSON.parse(JSON.stringify(parsed)),
    processedAt: new Date(),
  }

  if (parsed.documentType === "STATEMENT") {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: "STATEMENT", ...parsedMeta },
    })
    stats.statements++
    return
  }

  // Pre-delivery order confirmations (Fresho et al) share their order ref
  // with the tax invoice that follows. They must never count as spend and
  // must never sit in the dedupe candidate set — when they did, every real
  // Fresho invoice was marked DUPLICATE of its own confirmation and the
  // indicative total was kept instead of the actual one.
  if (parsed.documentType === "ORDER_CONFIRMATION") {
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "ORDER_CONFIRMATION",
        ...parsedMeta,
        errorMessage: null,
      },
    })
    stats.orderConfirmations++
    return
  }

  // Content-level dedup across multi-channel forwarding. Candidates exclude
  // non-invoice documents (STATEMENT / ORDER_CONFIRMATION) so a real invoice
  // is only ever a duplicate of another real invoice.
  if (parsed.invoiceNumber || (parsed.invoiceDate && parsed.total != null)) {
    const dup = await db.invoice.findFirst({
      where: {
        id: { not: invoiceId },
        supplierId: supplier.id,
        status: { notIn: ["ERROR", "DUPLICATE", "STATEMENT", "ORDER_CONFIRMATION"] },
        ...(parsed.invoiceNumber
          ? { invoiceNumber: parsed.invoiceNumber }
          : {
              invoiceNumber: null,
              invoiceDate: parsed.invoiceDate ? new Date(parsed.invoiceDate) : null,
              total: parsed.total,
            }),
      },
      select: { id: true, invoiceNumber: true },
    })
    if (dup) {
      await db.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "DUPLICATE",
          ...parsedMeta,
          errorMessage: `Duplicate of invoice ${dup.id}${dup.invoiceNumber ? ` (${dup.invoiceNumber})` : ""}`,
        },
      })
      stats.duplicates++
      return
    }
  }

  await processInvoice(invoiceId, supplier.id, parsed)
  stats.invoicesIngested++
}

async function processMessages(
  accessToken: string,
  emailMap: Map<string, SupplierRef[]>,
  messageRefs: Array<{ id: string; threadId: string }>
): Promise<ProcessStats> {
  const stats: ProcessStats = {
    messagesFound: messageRefs.length,
    invoicesIngested: 0,
    duplicates: 0,
    statements: 0,
    orderConfirmations: 0,
    rescued: 0,
    errors: [],
  }

  for (const ref of messageRefs) {
    try {
      // Per-message isolation — one bad parse can't kill the run.
      //
      // Deliberately NO message-level "already seen" fast-path here: dedupe
      // is per ATTACHMENT below. A bare `gmailMessageId: ref.id` skip meant
      // that if a run died after ingesting only the first PDF of a
      // multi-attachment email (GC Eggs sends 6-8 invoices per email), every
      // re-scan skipped the whole message and attachments 2..n were lost
      // for good.
      const message = await getMessage(accessToken, ref.id)
      const senderEmail = extractSenderEmail(message)
      const senderName = extractSenderName(message)
      if (!senderEmail) continue

      const candidates = emailMap.get(senderEmail)
      if (!candidates || candidates.length === 0) continue

      const attachments = extractPdfAttachments(message)
      if (attachments.length === 0) continue

      for (let attIdx = 0; attIdx < attachments.length; attIdx++) {
        const attachment = attachments[attIdx]
        // Invoice.gmailMessageId is @unique, but suppliers like GC Eggs
        // attach 6-8 invoice PDFs to ONE email. Key the first attachment
        // by the bare message id (back-compat with every existing row)
        // and subsequent ones as `id-a2`, `id-a3`… so each PDF gets its
        // own Invoice row instead of throwing a unique violation after
        // the first.
        const messageKey =
          attIdx === 0 ? ref.id : `${ref.id}-a${attIdx + 1}`
        const attExisting = await db.invoice.findUnique({
          where: { gmailMessageId: messageKey },
        })
        if (attExisting) continue
        const pdfBuffer = await getAttachment(accessToken, ref.id, attachment.attachmentId)
        let parsed
        try {
          parsed = await parseInvoicePdf(pdfBuffer)
        } catch (parseErr) {
          stats.errors.push(`Message ${ref.id}: parse failed — ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
          continue
        }

        const supplier = disambiguateSupplier(candidates, parsed.supplierName, senderName)
        if (!supplier) {
          const probeStr = `${parsed.supplierName ?? ""} ${senderName ?? ""}`.toLowerCase()
          if (IGNORED_SENDER_PROBES.some((p) => probeStr.includes(p))) continue
          stats.errors.push(
            `Message ${ref.id}: could not match sender "${senderEmail}" (display: "${senderName}", invoice: "${parsed.supplierName}") to any of: ${candidates.map((c) => c.name).join(", ")}`
          )
          continue
        }

        const pdfPath = await saveInvoicePdf(supplier.name, pdfBuffer, messageKey)
        const invoice = await db.invoice.create({
          data: {
            supplierId: supplier.id,
            supplierName: supplier.name,
            gmailMessageId: messageKey,
            pdfUrl: pdfPath,
            status: "PENDING",
          },
        })

        try {
          await finalizeParsedInvoice(invoice.id, supplier, parsed, stats)
        } catch (procErr) {
          const errMsg = procErr instanceof Error ? procErr.message : String(procErr)
          await db.invoice.update({
            where: { id: invoice.id },
            data: { status: "ERROR", errorMessage: errMsg },
          })
          stats.errors.push(`Invoice ${invoice.id}: ${errMsg}`)
        }
      }
    } catch (msgErr) {
      stats.errors.push(`Message ${ref.id}: ${msgErr instanceof Error ? msgErr.message : String(msgErr)}`)
    }
  }

  return stats
}

/**
 * Sweep-mode rescue for rows the pipeline abandoned:
 *  - PENDING stuck >2h — a run crashed between creating the Invoice row and
 *    finishing processInvoice. Previously invisible forever (the row exists,
 *    so Gmail-side dedupe skips the attachment on every re-scan).
 *  - ERROR rows — a transient parse/API failure was never retried.
 *
 * Re-parses the stored PDF from disk and pushes it through the same
 * finalize pipeline as fresh ingestion. Safe to re-run because
 * processInvoice deletes-and-recreates its line items transactionally.
 * Bounded per sweep so a poison PDF can't dominate a run; each attempt
 * bumps updatedAt, so a persistent failure retries at most once per sweep.
 */
async function rescueStuckInvoices(stats: ProcessStats): Promise<void> {
  const stuckCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const retryWindow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const stuck = await db.invoice.findMany({
    where: {
      supplierId: { not: null },
      OR: [
        { status: { in: ["PENDING", "PROCESSING"] }, createdAt: { lt: stuckCutoff } },
        {
          status: "ERROR",
          updatedAt: { lt: stuckCutoff },
          createdAt: { gt: retryWindow },
          pdfUrl: { not: null },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      pdfUrl: true,
      supplierId: true,
      supplierName: true,
      gmailMessageId: true,
    },
    orderBy: { createdAt: "asc" },
    take: 15,
  })

  for (const inv of stuck) {
    try {
      if (!inv.pdfUrl) {
        // Stuck PENDING with no stored PDF — nothing to re-parse from.
        await db.invoice.update({
          where: { id: inv.id },
          data: {
            status: "ERROR",
            errorMessage: `Stuck in ${inv.status} with no stored PDF — cannot retry. Re-ingest Gmail message ${inv.gmailMessageId} manually if needed.`,
          },
        })
        stats.errors.push(`rescue ${inv.id} (${inv.supplierName}): no stored PDF`)
        continue
      }
      const pdfBuffer = await readFile(path.resolve(process.cwd(), inv.pdfUrl))
      const parsed = await parseInvoicePdf(pdfBuffer)
      await finalizeParsedInvoice(
        inv.id,
        { id: inv.supplierId!, name: inv.supplierName },
        parsed,
        stats
      )
      stats.rescued++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await db.invoice
        .update({
          where: { id: inv.id },
          data: { status: "ERROR", errorMessage: `Rescue failed: ${errMsg}` },
        })
        .catch(() => {})
      stats.errors.push(`rescue ${inv.id} (${inv.supplierName}): ${errMsg}`)
    }
  }
}

/**
 * Standing venue-assignment rules from Chris (2026-07-14), applied after
 * every ingestion run so these suppliers never sit in the unassigned
 * panel:
 * - Breadtop is genuinely shared spend → venue BOTH (the spend tracker
 *   splits BOTH 50/50 between the Burleigh and Currumbin buckets).
 * - Parallel Roasters invoices arrive as a pair — the LARGER is
 *   Burleigh's coffee order, the smaller Currumbin's. Only fires when
 *   exactly two unassigned invoices are waiting; other counts stay
 *   manual so we never guess.
 */
async function applyStandingVenueRules(): Promise<string[]> {
  const notes: string[] = []
  const activeStatuses = {
    notIn: ["ERROR", "STATEMENT", "DUPLICATE", "ORDER_CONFIRMATION"] as InvoiceStatus[],
  }

  const breadtop = await db.invoice.updateMany({
    where: { supplierName: "Breadtop", venue: null, status: activeStatuses },
    data: { venue: "BOTH" },
  })
  if (breadtop.count > 0) notes.push(`Breadtop: ${breadtop.count} → BOTH (50/50 split)`)

  const parallel = await db.invoice.findMany({
    where: {
      supplierName: "Parallel Roasters",
      venue: null,
      status: activeStatuses,
      total: { not: null },
    },
    orderBy: { total: "desc" },
    select: { id: true, total: true },
  })
  if (parallel.length === 2) {
    await db.invoice.update({ where: { id: parallel[0].id }, data: { venue: "BURLEIGH" } })
    await db.invoice.update({ where: { id: parallel[1].id }, data: { venue: "BEACH_HOUSE" } })
    notes.push(
      `Parallel Roasters: $${Number(parallel[0].total)} → BURLEIGH, $${Number(parallel[1].total)} → BEACH_HOUSE`
    )
  }
  return notes
}

async function captureUnknownSenders(
  accessToken: string,
  knownEmails: Set<string>,
  runStart: Date
): Promise<number> {
  // Cheap, narrow query — PDFs whose subject smells like billing from
  // a sender we don't recognise. 30-day window so a missed-renamed
  // sender still gets found on the next nightly run.
  const since = Math.floor((runStart.getTime() - 30 * 24 * 60 * 60 * 1000) / 1000)
  const query = `subject:(invoice OR "tax invoice" OR statement) has:attachment filename:pdf after:${since}`
  const refs = await searchMessages(accessToken, query, 200)

  let logged = 0
  for (const ref of refs) {
    try {
      const existing = await db.unknownInvoiceSender.findUnique({
        where: { gmailMessageId: ref.id },
      })
      if (existing) {
        if (!existing.resolved) {
          await db.unknownInvoiceSender.update({
            where: { id: existing.id },
            data: { lastSeenAt: new Date(), occurrences: existing.occurrences + 1 },
          })
        }
        continue
      }
      const message = await getMessage(accessToken, ref.id)
      const senderEmail = extractSenderEmail(message)
      if (!senderEmail) continue
      if (knownEmails.has(senderEmail.toLowerCase())) continue
      const subject = getHeader(message, "Subject") ?? null
      const senderName = extractSenderName(message)
      await db.unknownInvoiceSender.create({
        data: {
          senderEmail,
          senderName,
          subject,
          gmailMessageId: ref.id,
        },
      })
      logged++
    } catch {
      // Non-fatal — unknown-sender capture is best-effort.
    }
  }
  return logged
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const connection = await getActiveGmailConnection()
  if (!connection) {
    return Response.json({ error: "Gmail not connected" }, { status: 400 })
  }

  const { emailMap, allEmails } = await buildSupplierEmailMap()
  if (allEmails.length === 0) {
    return Response.json({ success: true, message: "No supplier email addresses configured" })
  }

  const url = new URL(request.url)
  // Sweep mode: full 14-day rescan, trusting gmailMessageId dedupe. Run
  // once daily (cron passes ?mode=sweep) alongside the incremental
  // ticks. Manual invocation: ?mode=sweep for a forced full re-scan.
  const mode: "incremental" | "sweep" = url.searchParams.get("mode") === "sweep" ? "sweep" : "incremental"

  const runStart = new Date()
  const runRow = await db.invoiceSyncRun.create({
    data: { mode, startedAt: runStart },
  })

  try {
    const accessToken = await getValidGmailAccessToken()
    const fromQuery = `from:(${allEmails.join(" OR ")})`

    let messageRefs: Array<{ id: string; threadId: string }>
    if (mode === "sweep") {
      const query = `${fromQuery} has:attachment filename:pdf newer_than:14d`
      messageRefs = await searchMessages(accessToken, query, 500)
    } else {
      // Incremental — small slack on after: to absorb second-precision
      // rounding. gmailMessageId dedupe catches the resulting overlap.
      let afterClause = ""
      if (connection.lastScanAt) {
        const slackMs = 60 * 60 * 1000
        const epochSec = Math.floor((connection.lastScanAt.getTime() - slackMs) / 1000)
        afterClause = ` after:${epochSec}`
      }
      const query = `${fromQuery} has:attachment filename:pdf${afterClause}`
      messageRefs = await searchMessages(accessToken, query, 500)
    }

    const stats = await processMessages(accessToken, emailMap, messageRefs)

    // Sweep runs also rescue rows a crashed/errored run left behind.
    if (mode === "sweep") {
      try {
        await rescueStuckInvoices(stats)
      } catch (e) {
        stats.errors.push(`rescue pass: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    let venueRuleNotes: string[] = []
    try {
      venueRuleNotes = await applyStandingVenueRules()
    } catch (e) {
      stats.errors.push(
        `standing venue rules: ${e instanceof Error ? e.message : String(e)}`
      )
    }

    // Best-effort unknown-sender capture on every run — fast query.
    const knownSet = new Set(allEmails.map((e) => e.toLowerCase()))
    let unknownLogged = 0
    try {
      unknownLogged = await captureUnknownSenders(accessToken, knownSet, runStart)
    } catch (e) {
      stats.errors.push(`unknown-sender capture: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Only advance the incremental watermark to runStart (NOT new Date()
    // at the end of the loop — backfill runs can take 5–10 min and any
    // supplier email that arrives during that window would otherwise be
    // jumped over). Sweep mode never touches the watermark; it's a
    // safety net.
    if (mode === "incremental") {
      await db.gmailConnection.update({
        where: { id: connection.id },
        data: { lastScanAt: runStart },
      })
    }

    const healthy =
      stats.errors.length === 0 ||
      stats.errors.length < Math.max(1, stats.messagesFound / 2)

    await db.invoiceSyncRun.update({
      where: { id: runRow.id },
      data: {
        finishedAt: new Date(),
        messagesFound: stats.messagesFound,
        invoicesIngested: stats.invoicesIngested,
        duplicates: stats.duplicates,
        statements: stats.statements,
        orderConfirmations: stats.orderConfirmations,
        rescued: stats.rescued,
        errors: stats.errors.length,
        errorSummary: stats.errors.length > 0 ? stats.errors.join("\n").slice(0, 4000) : null,
        healthy,
      },
    })

    return Response.json({
      success: true,
      mode,
      messagesFound: stats.messagesFound,
      invoicesIngested: stats.invoicesIngested,
      duplicates: stats.duplicates,
      statements: stats.statements,
      orderConfirmations: stats.orderConfirmations,
      rescued: stats.rescued,
      unknownSendersLogged: unknownLogged,
      supplierEmailsConfigured: allEmails.length,
      venueRules: venueRuleNotes.length > 0 ? venueRuleNotes : undefined,
      errors: stats.errors.length > 0 ? stats.errors : undefined,
      runId: runRow.id,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await db.invoiceSyncRun.update({
      where: { id: runRow.id },
      data: {
        finishedAt: new Date(),
        errors: 1,
        errorSummary: errMsg.slice(0, 4000),
        healthy: false,
      },
    })
    console.error("Invoice check error:", err)
    return Response.json({ error: errMsg, runId: runRow.id }, { status: 500 })
  }
}
