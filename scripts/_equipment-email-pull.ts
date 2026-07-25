// READ-ONLY Gmail pull: download equipment-supplier invoice/quote PDFs from
// accounts@ mailbox into scratch dir for the maintenance-module asset enrichment.
// Run: GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... ENCRYPTION_KEY=... \
//        npx tsx --env-file=.env.local scripts/_equipment-email-pull.ts <outdir>
import "dotenv/config"
// When run on the droplet host, the compose-internal hostname `db` doesn't
// resolve; the prod DB is reachable at the docker bridge IP instead.
if (process.env.DATABASE_URL?.includes("@db:5432")) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    "@db:5432",
    "@172.18.0.2:5432"
  )
}
import { writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { getValidGmailAccessToken } from "../src/lib/gmail/token"
import {
  searchMessages,
  getMessage,
  getAttachment,
  extractPdfAttachments,
  getHeader,
} from "../src/lib/gmail/client"

const OUT = process.argv[2]
if (!OUT) throw new Error("usage: ... <outdir>")

const QUERIES = [
  // Equipment suppliers — all CKC invoices + quotes since opening
  "from:commercialkitchencompany.com.au has:attachment after:2025/06/01",
  // Nisbets orders/invoices (originals came to hello@, forwarded to accounts@)
  '{from:nisbets.com.au subject:nisbets "nisbets"} has:attachment after:2025/06/01',
  // Forwards of equipment quotes/invoices (Shawna/Chloe forwards)
  'subject:{"ice machine" fryer dishwasher oven cooktop "coffee machine" equipment quote} has:attachment after:2025/06/01',
]

async function main() {
  await mkdir(OUT, { recursive: true })
  const token = await getValidGmailAccessToken()
  const seen = new Set<string>()
  const index: string[] = []

  for (const q of QUERIES) {
    const msgs = await searchMessages(token, q, 200)
    console.log(`query [${q}] -> ${msgs.length} messages`)
    for (const m of msgs) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      const full = (await getMessage(token, m.id)) as any
      const subject = getHeader(full, "Subject") ?? "(no subject)"
      const from = getHeader(full, "From") ?? "?"
      const date = getHeader(full, "Date") ?? "?"
      const pdfs = extractPdfAttachments(full)
      for (const p of pdfs) {
        if (!/\.pdf$/i.test(p.filename)) continue
        const buf = await getAttachment(token, m.id, p.attachmentId)
        const safe = `${m.id}_${p.filename.replace(/[^\w.\-]+/g, "_")}`
        await writeFile(join(OUT, safe), buf)
        index.push(`${safe}\t${date}\t${from}\t${subject}`)
        console.log(`  saved ${safe} (${buf.length}b) — ${subject}`)
      }
    }
  }
  await writeFile(join(OUT, "_index.tsv"), index.join("\n"))
  console.log(`\nDone: ${index.length} PDFs -> ${OUT}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
