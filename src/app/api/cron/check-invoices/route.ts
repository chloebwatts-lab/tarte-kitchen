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

  try {
    const accessToken = await getValidGmailAccessToken()

    // Build search query from all known supplier emails
    const fromQuery = `from:(${allEmails.join(" OR ")})`

    // Only fetch messages after last check
    let afterQuery = ""
    if (connection.lastScanAt) {
      const epochSec = Math.floor(connection.lastScanAt.getTime() / 1000)
      afterQuery = ` after:${epochSec}`
    }

    const query = `${fromQuery} has:attachment filename:pdf${afterQuery}`

    const messageRefs = await searchMessages(accessToken, query, 50)

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

    // Update last checked timestamp
    await db.gmailConnection.update({
      where: { id: connection.id },
      data: { lastScanAt: new Date() },
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
