/**
 * Pull the Crisis Pest Management invoices the service calendar has seen
 * since 1 Jul 2026 out of accounts@ Gmail and file them in the /council
 * folder as PEST_CONTROL_REPORT (same title/description shape as the
 * 14 Jul 2026 upload). Uses the stored (encrypted) accounts@ access token.
 * Additive + idempotent (venue, type, fileName).
 *   npx tsx --env-file=.env --env-file=.env.local scripts/_file-pest-invoices-20260907.ts [--write]
 */
import { Pool } from "pg"
import { randomUUID } from "node:crypto"
import { decrypt } from "../src/lib/encryption"
import { getMessage, getAttachment, extractPdfAttachments, getHeader } from "../src/lib/gmail/client"

const WRITE = process.argv.includes("--write")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

;(async () => {
  const conn = await pool.query(`select "accessToken", "tokenExpiry" from "GmailConnection" order by "createdAt" desc limit 1`)
  if (!conn.rowCount) throw new Error("no GmailConnection")
  const expiry = new Date(conn.rows[0].tokenExpiry)
  console.log("token expires", expiry.toISOString(), expiry > new Date() ? "(valid)" : "(EXPIRED - run on droplet to refresh)")
  const token = decrypt(conn.rows[0].accessToken)

  const visits = await pool.query(`select p.venue, v."serviceDate"::text as sd, v."gmailMessageId" as mid, v."emailSubject" as subj
    from "ServiceVisit" v join "ServiceProgram" p on p.id=v."programId"
    where p.category='pest-control' and v."serviceDate" >= '2026-07-01' and v."providerName" ilike 'Crisis Pest%'
      and v."emailSubject" not ilike '%Barracuda%'
    order by p.venue, v."serviceDate"`)
  for (const v of visits.rows) {
    const inv = /Invoice #(\d+)/.exec(v.subj)?.[1]
    if (!inv) { console.log("SKIP no invoice no:", v.subj); continue }
    const fileName = `crisis-pest-inv${inv}-${v.venue}.pdf`
    const dupe = await pool.query(`select id from "CouncilDocument" where venue=$1::"Venue" and type='PEST_CONTROL_REPORT' and "fileName"=$2`, [v.venue, fileName])
    if (dupe.rowCount) { console.log("SKIP filed", fileName); continue }
    const msg = await getMessage(token, v.mid)
    const pdfs = extractPdfAttachments(msg).filter((a) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.filename))
    console.log(`${v.venue} ${v.sd} #${inv} from=${getHeader(msg, "From")} pdfs=${pdfs.map((p) => p.filename).join(",") || "NONE"}`)
    if (!pdfs.length) continue
    const data = await getAttachment(token, v.mid, pdfs[0].attachmentId)
    if (!WRITE) { console.log(`  WOULD INSERT ${fileName} (${data.length} B)`); continue }
    await pool.query(
      `insert into "CouncilDocument" (id, venue, type, title, description, "issuedOn", "fileName", "mimeType", "fileSize", data, "uploadedBy", "updatedAt")
       values ($1,$2::"Venue",'PEST_CONTROL_REPORT',$3,$4,$5::date,$6,'application/pdf',$7,$8,$9, now())`,
      [randomUUID(), v.venue, `Crisis Pest Management - service invoice #${inv}`,
       "Service visit record (tax invoice from licensed pest controller). Detailed treatment report available from Crisis Pest Management on request.",
       v.sd, fileName, data.length, data, "Tarte admin (7 Sep 2026, from accounts@ Gmail)"],
    )
    console.log(`  INSERTED ${fileName} (${data.length} B)`)
  }
  await pool.end()
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
