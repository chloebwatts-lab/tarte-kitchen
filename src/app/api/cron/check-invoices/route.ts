export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
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

interface SupplierRef {
  id: string
  name: string
}

/**
 * Build a map of email address → supplier(s).
 * Uses SupplierEmail table first, then falls back to Supplier.email for
 * suppliers that haven't been migrated to the new table yet.
 */
async function buildSupplierEmailMap(): Promise<{
  emailMap: Map<string, SupplierRef[]>
  allEmails: string[]
}> {
  const emailMap = new Map<string, SupplierRef[]>()

  // Primary source: SupplierEmail table (supports many-to-many)
  const supplierEmails = await db.supplierEmail.findMany({
    include: { supplier: { select: { id: true, name: true } } },
  })

  for (const se of supplierEmails) {
    const email = se.email.toLowerCase()
    const existing = emailMap.get(email) ?? []
    // Avoid duplicate supplier entries for the same email
    if (!existing.some((s) => s.id === se.supplier.id)) {
      existing.push({ id: se.supplier.id, name: se.supplier.name })
    }
    emailMap.set(email, existing)
  }

  // Fallback: Supplier.email field for suppliers not yet in SupplierEmail table
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

/**
 * When a sender email maps to multiple suppliers, use the parsed invoice's
 * supplierName (from Claude) or the sender display name to pick the best match.
 */
function disambiguateSupplier(
  candidates: SupplierRef[],
  parsedSupplierName: string | null,
  senderDisplayName: string | null
): SupplierRef | null {
  if (candidates.length === 1) return candidates[0]

  // Try parsed supplier name first (most reliable — from the actual invoice)
  if (parsedSupplierName) {
    const fuse = new Fuse(candidates, {
      keys: ["name"],
      threshold: 0.4,
      includeScore: true,
    })
    const results = fuse.search(parsedSupplierName)
    if (results.length > 0) return results[0].item
  }

  // Fall back to sender display name
  if (senderDisplayName) {
    const fuse = new Fuse(candidates, {
      keys: ["name"],
      threshold: 0.4,
      includeScore: true,
    })
    const results = fuse.search(senderDisplayName)
    if (results.length > 0) return results[0].item
  }

  return null
}

export async function GET(request: Request) {
  // Verify cron secret
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
    return Response.json({
      success: true,
      message: "No supplier email addresses configured",
      invoicesProcessed: 0,
    })
  }

  // Capture the start instant BEFORE we issue the Gmail search. The
  // watermark we persist at the end is this value, not Date.now() — any
  // supplier email that lands DURING the loop (a 30+ invoice backfill can
  // take 5–10 min with Claude parsing each PDF) would otherwise be
  // silently skipped by the next run because the watermark jumped past
  // its arrival time. Bug observed 2026-05-21: watermark advanced 4 days
  // without ingesting the Pixel, Bidfood, Pacific, Son of a Bunn, etc.
  // emails Gmail clearly had on file.
  const runStart = new Date()

  try {
    const accessToken = await getValidGmailAccessToken()

    // Build search query from all known supplier emails
    const fromQuery = `from:(${allEmails.join(" OR ")})`

    // Only fetch messages after last check. Step back 1 hour to give
    // Gmail's "after:" filter slack — its second-precision granularity
    // plus our seconds-since-epoch rounding can shave a borderline
    // message off the result list.
    let afterQuery = ""
    if (connection.lastScanAt) {
      const slackMs = 60 * 60 * 1000
      const epochSec = Math.floor((connection.lastScanAt.getTime() - slackMs) / 1000)
      afterQuery = ` after:${epochSec}`
    }

    const query = `${fromQuery} has:attachment filename:pdf${afterQuery}`

    // 500 cap — invoice volume can spike on Mondays / after backfills.
    // searchMessages paginates internally so this is safe.
    const messageRefs = await searchMessages(accessToken, query, 500)

    let invoicesProcessed = 0
    let priceChangesDetected = 0
    const errors: string[] = []

    for (const ref of messageRefs) {
      try {
        // Skip if already processed
        const existing = await db.invoice.findUnique({
          where: { gmailMessageId: ref.id },
        })
        if (existing) continue

        const message = await getMessage(accessToken, ref.id)
        const senderEmail = extractSenderEmail(message)
        const senderName = extractSenderName(message)

        if (!senderEmail) continue

        // Look up candidate suppliers for this sender email
        const candidates = emailMap.get(senderEmail)
        if (!candidates || candidates.length === 0) continue

        // Extract PDF attachments
        const attachments = extractPdfAttachments(message)
        if (attachments.length === 0) continue

        // Process each PDF attachment
        for (const attachment of attachments) {
          const pdfBuffer = await getAttachment(
            accessToken,
            ref.id,
            attachment.attachmentId
          )

          // Parse with Claude API first — we need supplierName for disambiguation
          let parsed
          try {
            parsed = await parseInvoicePdf(pdfBuffer)
          } catch (parseErr) {
            const errMsg =
              parseErr instanceof Error ? parseErr.message : String(parseErr)
            errors.push(`Message ${ref.id}: parse failed — ${errMsg}`)
            continue
          }

          // Resolve supplier: single match is fast, multiple needs disambiguation
          const supplier = disambiguateSupplier(
            candidates,
            parsed.supplierName,
            senderName
          )

          if (!supplier) {
            errors.push(
              `Message ${ref.id}: could not match sender "${senderEmail}" ` +
                `(display: "${senderName}", invoice: "${parsed.supplierName}") ` +
                `to any of: ${candidates.map((c) => c.name).join(", ")}`
            )
            continue
          }

          // Save to filesystem
          const pdfPath = await saveInvoicePdf(
            supplier.name,
            pdfBuffer,
            ref.id
          )

          // Create invoice record
          const invoice = await db.invoice.create({
            data: {
              supplierId: supplier.id,
              supplierName: supplier.name,
              gmailMessageId: ref.id,
              pdfUrl: pdfPath,
              status: "PENDING",
            },
          })

          // Monthly statements (e.g. Provedores "MAY 2026") summarise the
          // month's deliveries; running them through processInvoice would
          // double-count spend and try to fuzzy-match "INVOICE CHxxxxxx"
          // line descriptions against ingredients. Short-circuit to
          // STATEMENT status — stored for audit, excluded from totals.
          if (parsed.documentType === "STATEMENT") {
            await db.invoice.update({
              where: { id: invoice.id },
              data: {
                status: "STATEMENT",
                invoiceNumber: parsed.invoiceNumber,
                invoiceDate: parsed.invoiceDate
                  ? new Date(parsed.invoiceDate)
                  : null,
                total: parsed.total,
                extractedData: JSON.parse(JSON.stringify(parsed)),
                processedAt: new Date(),
              },
            })
            continue
          }

          // Content-level dedup: catches the same invoice arriving from
          // multiple Gmail addresses (forwards). The gmailMessageId @unique
          // constraint only catches the exact same email twice. Match on
          // (supplierId, invoiceNumber) — the strongest signal — and fall
          // back to (supplierId, invoiceDate, total) when invoiceNumber is
          // missing.
          if (parsed.invoiceNumber || (parsed.invoiceDate && parsed.total != null)) {
            const existing = await db.invoice.findFirst({
              where: {
                id: { not: invoice.id },
                supplierId: supplier.id,
                status: { notIn: ["ERROR", "DUPLICATE"] },
                ...(parsed.invoiceNumber
                  ? { invoiceNumber: parsed.invoiceNumber }
                  : {
                      invoiceNumber: null,
                      invoiceDate: parsed.invoiceDate
                        ? new Date(parsed.invoiceDate)
                        : null,
                      total: parsed.total,
                    }),
              },
              select: { id: true, invoiceNumber: true },
            })
            if (existing) {
              await db.invoice.update({
                where: { id: invoice.id },
                data: {
                  status: "DUPLICATE",
                  invoiceNumber: parsed.invoiceNumber,
                  invoiceDate: parsed.invoiceDate
                    ? new Date(parsed.invoiceDate)
                    : null,
                  total: parsed.total,
                  extractedData: JSON.parse(JSON.stringify(parsed)),
                  processedAt: new Date(),
                  errorMessage: `Duplicate of invoice ${existing.id}${existing.invoiceNumber ? ` (${existing.invoiceNumber})` : ""}`,
                },
              })
              continue
            }
          }

          try {
            // Process line items, detect price changes
            const result = await processInvoice(
              invoice.id,
              supplier.id,
              parsed
            )

            invoicesProcessed++
            priceChangesDetected += result.priceChanges
          } catch (procErr) {
            const errMsg =
              procErr instanceof Error ? procErr.message : String(procErr)
            await db.invoice.update({
              where: { id: invoice.id },
              data: {
                status: "ERROR",
                errorMessage: errMsg,
              },
            })
            errors.push(`Invoice ${invoice.id}: ${errMsg}`)
          }
        }
      } catch (msgErr) {
        const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr)
        errors.push(`Message ${ref.id}: ${msgErr}`)
      }
    }

    // Persist the START-of-run timestamp, not Date.now(). Anything that
    // arrived AFTER runStart is still in the inbox waiting for the next
    // cron, rather than being silently jumped over.
    await db.gmailConnection.update({
      where: { id: connection.id },
      data: { lastScanAt: runStart },
    })

    return Response.json({
      success: true,
      messagesFound: messageRefs.length,
      invoicesProcessed,
      priceChangesDetected,
      scanningFrom: connection.lastScanAt?.toISOString() ?? "all time",
      supplierEmailsConfigured: allEmails.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error("Invoice check error:", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
