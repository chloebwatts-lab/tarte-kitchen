/**
 * One-off: tag historical Invoice rows with `venue` by re-fetching the
 * PDF from Gmail and extracting the "Ship To" / "Deliver To" block with
 * pdftotext. Zero Claude tokens — everything runs locally.
 *
 * Run inside the app container (needs Gmail creds + pdftotext):
 *   docker exec tarte-kitchen-app-1 npx tsx scripts/backfill-invoice-venues.ts
 */
import "dotenv/config"
import { execFile } from "node:child_process"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { db } from "@/lib/db"
import { getValidGmailAccessToken } from "@/lib/gmail/token"
import {
  getMessage,
  getAttachment,
  extractPdfAttachments,
} from "@/lib/gmail/client"
import { venueFromDeliveryAddress } from "@/lib/invoices/venue-from-address"

const execFileP = promisify(execFile)

async function pdfToText(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "inv-"))
  const pdfPath = path.join(dir, "in.pdf")
  try {
    await writeFile(pdfPath, buffer)
    const { stdout } = await execFileP("pdftotext", ["-layout", pdfPath, "-"])
    return stdout
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Pull the Ship To / Deliver To block from pdftotext output. Different
 * suppliers label it differently; we grab the first ~6 lines after the
 * header and collapse whitespace.
 */
function extractShipTo(text: string): string | null {
  const pattern =
    /(?:ship\s*to|deliver\s*to|delivery\s*address|delivered\s*to|customer\s*address)[\s:]*\n((?:.+\n){1,6})/i
  const m = text.match(pattern)
  if (!m) return null
  return m[1].replace(/\s+/g, " ").trim()
}

async function main() {
  const token = await getValidGmailAccessToken()

  const invoices = await db.invoice.findMany({
    where: { venue: null, gmailMessageId: { not: "" } },
    select: { id: true, gmailMessageId: true, supplierName: true },
  })

  console.log(`Found ${invoices.length} untagged invoices`)

  let tagged = 0
  let skipped = 0
  let errors = 0
  const venueCounts: Record<string, number> = {}

  for (const inv of invoices) {
    try {
      const msg = await getMessage(token, inv.gmailMessageId)
      const attachments = extractPdfAttachments(msg).filter((a) =>
        a.mimeType === "application/pdf"
      )
      if (attachments.length === 0) {
        skipped++
        continue
      }

      let resolved: ReturnType<typeof venueFromDeliveryAddress> = null
      let address: string | null = null

      for (const att of attachments) {
        const buf = await getAttachment(token, inv.gmailMessageId, att.attachmentId)
        const text = await pdfToText(buf)
        address = extractShipTo(text) ?? text.slice(0, 2000)
        resolved = venueFromDeliveryAddress(address)
        if (resolved) break
      }

      if (!resolved) {
        skipped++
        console.log(`  ? ${inv.supplierName} (${inv.id}) — no venue match`)
        continue
      }

      await db.invoice.update({
        where: { id: inv.id },
        data: { venue: resolved },
      })
      tagged++
      venueCounts[resolved] = (venueCounts[resolved] ?? 0) + 1
      if (tagged % 10 === 0) console.log(`  ${tagged} tagged…`)
    } catch (e) {
      errors++
      console.error(`  ! ${inv.id}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log("\nDone.")
  console.log(`  tagged:  ${tagged}`, venueCounts)
  console.log(`  skipped: ${skipped}`)
  console.log(`  errors:  ${errors}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
