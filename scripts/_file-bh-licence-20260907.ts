/**
 * File the Beach House 2026-27 food business licence (FBFIX-8039032, dated
 * 2 Sep 2026) into the /council folder for BEACH_HOUSE + TEA_GARDEN (shared
 * premises licence), retitle the 2025 renewal-notice rows as superseded, and
 * bring the service-calendar licence-renewal programs in line.
 * Additive + idempotent. Dry run by default:
 *   npx tsx --env-file=.env.local scripts/_file-bh-licence-20260907.ts [--write]
 */
import "dotenv/config"
import { Pool } from "pg"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"

const WRITE = process.argv.includes("--write")
const FILE = "/Users/chris/Downloads/548329093_20260902.pdf"
const data = readFileSync(FILE)
const fileName = "548329093_20260902.pdf"

const docs = [
  {
    venue: "BEACH_HOUSE",
    title: "Food business licence FBFIX-8039032 (2026-27)",
    description:
      "Tarte Currumbin Pty Ltd t/a Tarte Beach House, Shop 1, 2 Thrower Drive, Currumbin (Lot 5 SP230615). Cafe/Restaurant. Effective 1 September 2026, dated 2 September 2026. Includes Schedule 1 licence conditions of approval (display licence, Food Standards Code 3.2.2 and 3.2.3, Council access).",
  },
  {
    venue: "TEA_GARDEN",
    title: "Food business licence FBFIX-8039032 (2026-27, shared premises licence)",
    description:
      "Tea Garden operates under the Tarte Currumbin premises licence FBFIX-8039032 (Tarte Currumbin Pty Ltd, Shop 1, 2 Thrower Drive). Effective 1 September 2026 to 31 August 2027, dated 2 September 2026. Includes Schedule 1 licence conditions of approval.",
  },
] as const

const supersede = [
  {
    id: "507f168f-95df-4462-9e38-b1a39e909927", // BEACH_HOUSE 2025 renewal notice
    title: "Licence FBFIX-8039032 - 2025 renewal notice (2025-26, superseded)",
    description:
      "Renewal notice for the Currumbin premises licence, renewed manually via GCCC in Aug 2025 (that certificate was posted, never emailed). Superseded by the 2026-27 certificate dated 2 September 2026, filed above.",
    expiresOn: "2026-08-31",
  },
  {
    id: "821ca8a1-d887-4d94-8155-455f5c0bdf79", // TEA_GARDEN 2025 renewal notice
    title: "Licence FBFIX-8039032 - 2025 renewal notice (2025-26, superseded, shared premises licence)",
    description:
      "Tea Garden operates under the Tarte Currumbin premises licence FBFIX-8039032 (Shop 1, 2 Thrower Drive). 2025-26 renewal notice, superseded by the 2026-27 certificate dated 2 September 2026, filed above.",
    expiresOn: "2026-08-31",
  },
]

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
;(async () => {
  // 1. Certificates
  for (const d of docs) {
    const dupe = await pool.query(
      `select id from "CouncilDocument"
       where venue=$1::"Venue" and type='FOOD_BUSINESS_LICENCE' and "fileName"=$2 and "fileSize"=$3`,
      [d.venue, fileName, data.length],
    )
    if (dupe.rowCount) { console.log(`SKIP (already filed) ${d.venue} ${d.title}`); continue }
    if (!WRITE) { console.log(`WOULD INSERT ${d.venue} :: ${d.title} (${data.length} B)`); continue }
    await pool.query(
      `insert into "CouncilDocument"
        (id, venue, type, title, description, "issuedOn", "expiresOn",
         "fileName", "mimeType", "fileSize", data, "uploadedBy", "updatedAt")
       values ($1,$2::"Venue",'FOOD_BUSINESS_LICENCE',$3,$4,'2026-09-02'::date,'2027-08-31'::date,$5,'application/pdf',$6,$7,$8, now())`,
      [randomUUID(), d.venue, d.title, d.description, fileName, data.length, data, "Chloe (GCCC email 2 Sep 2026)"],
    )
    console.log(`INSERTED ${d.venue} :: ${d.title}`)
  }

  // 2. Retitle the 2025 renewal notices as superseded (title/description/expiry only)
  for (const s of supersede) {
    const cur = await pool.query(`select title from "CouncilDocument" where id=$1`, [s.id])
    if (!cur.rowCount) { console.log(`MISSING ${s.id}`); continue }
    if (cur.rows[0].title === s.title) { console.log(`SKIP (already retitled) ${s.title}`); continue }
    if (!WRITE) { console.log(`WOULD RETITLE "${cur.rows[0].title}" -> "${s.title}"`); continue }
    await pool.query(
      `update "CouncilDocument" set title=$2, description=$3, "expiresOn"=$4::date, "updatedAt"=now() where id=$1`,
      [s.id, s.title, s.description, s.expiresOn],
    )
    console.log(`RETITLED ${s.title}`)
  }

  // 3. Service calendar: Burleigh renewal was BOOKED 31 Aug, licence issued 24 Aug -> mark done
  const burBooked = await pool.query(
    `select v.id from "ServiceVisit" v join "ServiceProgram" p on p.id=v."programId"
     where p.venue='BURLEIGH' and p.label='Food business licence renewal' and v.kind='BOOKED' and v."serviceDate"='2026-08-31'`,
  )
  if (burBooked.rowCount) {
    if (!WRITE) console.log(`WOULD MARK Burleigh licence renewal booking ${burBooked.rows[0].id} COMPLETED on 2026-08-24`)
    else {
      await pool.query(
        `update "ServiceVisit" set kind='COMPLETED', "serviceDate"='2026-08-24'::date, "needsReview"=false, "recordedBy"='Tarte admin',
           notes=coalesce(notes,'') || ' Licence FBFIX-8032605 2026-27 issued 24 Aug 2026, filed in /council.' , "updatedAt"=now()
         where id=$1`, [burBooked.rows[0].id])
      console.log("MARKED Burleigh licence renewal done 2026-08-24")
    }
  } else console.log("SKIP Burleigh booking (not found / already done)")

  // 4. Service calendar: Beach House had no licence-renewal program at all
  const bhProg = await pool.query(
    `select id from "ServiceProgram" where venue='BEACH_HOUSE' and label='Food business licence renewal'`,
  )
  let bhId = bhProg.rows[0]?.id as string | undefined
  if (!bhId) {
    if (!WRITE) console.log("WOULD CREATE Beach House 'Food business licence renewal' program (other, 365d)")
    else {
      bhId = randomUUID()
      await pool.query(
        `insert into "ServiceProgram" (id, venue, category, label, "intervalDays", notes, active, "createdAt", "updatedAt")
         values ($1,'BEACH_HOUSE','other','Food business licence renewal',365,
           'Gold Coast City Council food business licence FBFIX-8039032 (Tarte Currumbin Pty Ltd, covers Beach House + Tea Garden). Expires 31 August each year; council posts/emails the renewal notice around July.', true, now(), now())`,
        [bhId],
      )
      console.log("CREATED Beach House licence renewal program")
    }
  } else console.log("SKIP BH program exists")
  if (bhId) {
    const done = await pool.query(
      `select id from "ServiceVisit" where "programId"=$1 and kind='COMPLETED' and "serviceDate"='2026-09-02'`, [bhId])
    if (done.rowCount) console.log("SKIP BH 2026 renewal visit exists")
    else if (!WRITE) console.log("WOULD ADD BH licence renewal COMPLETED 2026-09-02")
    else {
      await pool.query(
        `insert into "ServiceVisit" (id, "programId", kind, "serviceDate", "providerName", source, "needsReview", "recordedBy", notes, "createdAt", "updatedAt")
         values ($1,$2,'COMPLETED','2026-09-02'::date,'City of Gold Coast','MANUAL',false,'Tarte admin',
           'Licence FBFIX-8039032 2026-27 issued 2 Sep 2026 (effective 1 Sep 2026 to 31 Aug 2027), filed in /council.', now(), now())`,
        [randomUUID(), bhId],
      )
      console.log("ADDED BH licence renewal COMPLETED 2026-09-02")
    }
  }
  await pool.end()
})()
