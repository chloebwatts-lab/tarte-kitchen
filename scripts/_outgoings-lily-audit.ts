// READ-ONLY Gmail sweep: find every outgoings/rental invoice email from Lily
// Walden (landlord, dongyan729754@hotmail.com) in the connected mailbox, print
// date / subject / attachments / body amounts so we can reconcile against Xero.
// Run: GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... TOKEN_ENCRYPTION_KEY=... \
//        npx tsx --env-file=.env.local scripts/_outgoings-lily-audit.ts
import "dotenv/config"
if (process.env.DATABASE_URL?.includes("@db:5432")) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    "@db:5432",
    "@172.18.0.2:5432"
  )
}
import { getValidGmailAccessToken, getActiveGmailConnection } from "../src/lib/gmail/token"
import { searchMessages, getMessage, getHeader } from "../src/lib/gmail/client"

const QUERIES = [
  "from:dongyan729754@hotmail.com in:anywhere",
  "to:dongyan729754@hotmail.com in:anywhere",
  "dongyan729754 in:anywhere",
  "subject:outgoings in:anywhere",
  '"outgoings invoice" in:anywhere',
]

function decodeBody(part: any): string {
  if (!part) return ""
  let out = ""
  if (part.mimeType === "text/plain" && part.body?.data) {
    out += Buffer.from(part.body.data, "base64url").toString("utf8")
  }
  for (const p of part.parts ?? []) out += decodeBody(p)
  return out
}

function attachmentNames(part: any): string[] {
  if (!part) return []
  const names: string[] = []
  if (part.filename) names.push(part.filename)
  for (const p of part.parts ?? []) names.push(...attachmentNames(p))
  return names.filter(Boolean)
}

async function main() {
  const conn = await getActiveGmailConnection()
  console.log(`MAILBOX: ${(conn as any)?.email ?? "unknown"}`)
  const token = await getValidGmailAccessToken()
  const seen = new Set<string>()
  const rows: { date: string; from: string; subject: string; atts: string[]; amounts: string[] }[] = []

  for (const q of QUERIES) {
    const msgs = await searchMessages(token, q, 300)
    console.log(`query [${q}] -> ${msgs.length}`)
    for (const m of msgs) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      const full = (await getMessage(token, m.id)) as any
      const subject = getHeader(full, "Subject") ?? "(no subject)"
      const from = getHeader(full, "From") ?? "?"
      const date = getHeader(full, "Date") ?? "?"
      const body = decodeBody(full.payload)
      const amounts = [...new Set(body.match(/\$\s?[\d,]+(?:\.\d{2})?/g) ?? [])].slice(0, 12)
      rows.push({ date, from, subject, atts: attachmentNames(full.payload), amounts })
    }
  }

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  for (const r of rows) {
    console.log("—".repeat(70))
    console.log(`${r.date}\nFROM: ${r.from}\nSUBJ: ${r.subject}`)
    if (r.atts.length) console.log(`ATTS: ${r.atts.join(" | ")}`)
    if (r.amounts.length) console.log(`AMTS: ${r.amounts.join("  ")}`)
  }
  console.log(`\nTOTAL unique messages: ${rows.length}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
