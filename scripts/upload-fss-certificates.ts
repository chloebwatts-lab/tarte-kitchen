/**
 * Upload Food Safety Supervisor evidence into CouncilDocument (/council folder).
 *
 * People + venues (per Chloe, 22 Jul 2026): Tais = Burleigh; Julian = Burleigh
 * + Currumbin; Michelle / Alan / Lola / Candela = Currumbin. "Currumbin" files
 * under both BEACH_HOUSE and TEA_GARDEN (shared premises licence FBFIX-8039032).
 *
 * Additive + idempotent: skips any row where the same (venue, type, fileName,
 * fileSize) already exists. Never deletes or overwrites.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/upload-fss-certificates.ts [--write]
 */
import "dotenv/config"
import { Pool } from "pg"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const WRITE = process.argv.includes("--write")
const DOCS_DIR =
  "/private/tmp/claude-501/-Users-chris-C/85605354-84f3-4d77-9bf2-e182f7c76a7c/scratchpad/council-fss"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const BURLEIGH: Venue[] = ["BURLEIGH"]
const CURRUMBIN: Venue[] = ["BEACH_HOUSE", "TEA_GARDEN"]
const ALL: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]

type Doc = {
  venues: Venue[]
  type: "FSS_CERTIFICATE" | "TRAINING_RECORD"
  title: string
  description: string
  issuedOn: string | null
  expiresOn: string | null
  file: string
  mime: "application/pdf" | "image/jpeg"
}

const docs: Doc[] = [
  {
    venues: BURLEIGH,
    type: "FSS_CERTIFICATE",
    title: "FSS Certificate – Tais Lobianco Mansur",
    description:
      "Food Safety Supervisor certificate #F0229990, issued by InstaCert (RTO) under the NSW Food Authority scheme, 24 Apr 2023. The FSS units of competency are nationally recognised; refresher due 24 Apr 2028. Photo of the certificate displayed on site.",
    issuedOn: "2023-04-24",
    expiresOn: "2028-04-24",
    file: "fss-certificate-tais-lobianco-mansur.jpg",
    mime: "image/jpeg",
  },
  {
    venues: ALL,
    type: "FSS_CERTIFICATE",
    title: "FSS qualification – Julian Mauricio Vargas Torres (Cert IV Kitchen Management)",
    description:
      "SIT40521 Certificate IV in Kitchen Management #260612, Greenwich College, issued 27 Jun 2025. Qualification includes the Food Safety Supervisor units (SITXFSA005 + SITXFSA006). Statement of attainment / record of results to be added.",
    issuedOn: "2025-06-27",
    expiresOn: null,
    file: "cert-iv-kitchen-mgmt-julian-vargas-torres.pdf",
    mime: "application/pdf",
  },
  {
    venues: CURRUMBIN,
    type: "FSS_CERTIFICATE",
    title: "FSS qualification – Michelle Malbog (Cert IV Kitchen Management)",
    description:
      "SIT40521 Certificate IV in Kitchen Management #265784, Greenwich College, issued 26 Jun 2025. Qualification includes the Food Safety Supervisor units (SITXFSA005 + SITXFSA006). Statement of attainment / record of results to be added.",
    issuedOn: "2025-06-26",
    expiresOn: null,
    file: "cert-iv-kitchen-mgmt-michelle-malbog.pdf",
    mime: "application/pdf",
  },
  {
    venues: CURRUMBIN,
    type: "FSS_CERTIFICATE",
    title: "FSS qualification – Alan Nicolas Urquiza (Cert IV Kitchen Management)",
    description:
      "SIT40521 Certificate IV in Kitchen Management #257765, Greenwich College, issued 27 Jun 2025. Qualification includes the Food Safety Supervisor units (SITXFSA005 + SITXFSA006). Statement of attainment / record of results to be added.",
    issuedOn: "2025-06-27",
    expiresOn: null,
    file: "cert-iv-kitchen-mgmt-alan-urquiza.pdf",
    mime: "application/pdf",
  },
  {
    venues: CURRUMBIN,
    type: "FSS_CERTIFICATE",
    title: "FSS qualification – Lola Valentina Caballero (Cert IV Kitchen Management)",
    description:
      "SIT40521 Certificate IV in Kitchen Management, TAFE Queensland, doc #726971AWD101024, dated 1 Jul 2024. Record of results attached shows the Food Safety Supervisor units completed: SITXFSA005 Use hygienic practices for food safety and SITXFSA006 Participate in safe food handling practices.",
    issuedOn: "2024-07-01",
    expiresOn: null,
    file: "cert-iv-kitchen-mgmt-lola-caballero.pdf",
    mime: "application/pdf",
  },
  {
    venues: CURRUMBIN,
    type: "FSS_CERTIFICATE",
    title: "FSS evidence – Candela Caballero (USI VET transcript)",
    description:
      "Authenticated USI VET transcript (generated 12 Apr 2025). Shows the FSS units completed at Imagine Education: SITXFSA001 Use hygienic practices for food safety and SITXFSA002 Participate in safe food handling practices (superseded codes, still nationally recognised), plus Cert III (2022) and Cert IV (2022) in Commercial Cookery and Diploma of Hospitality Management (2023).",
    issuedOn: "2025-04-12",
    expiresOn: null,
    file: "vet-transcript-candela-caballero.pdf",
    mime: "application/pdf",
  },
  {
    venues: ALL,
    type: "TRAINING_RECORD",
    title: "Food safety questionnaire (staff knowledge check + answer key)",
    description:
      "Staff skills & knowledge questionnaire supporting the food handler training record (FSANZ 3.2.2A Tool 2). 14 questions across hygiene, temperature control, cross-contamination/allergens and cleaning/labelling/pests, with a managers-only answer key. Completed sheets are filed behind each staff member's training record.",
    issuedOn: "2026-07-22",
    expiresOn: null,
    file: "food-safety-questionnaire.pdf",
    mime: "application/pdf",
  },
  {
    venues: CURRUMBIN,
    type: "TRAINING_RECORD",
    title: "Cert III Commercial Cookery – Candela Caballero",
    description:
      "SIT30816 Certificate III in Commercial Cookery #100008572, Imagine Education Australia, issued 21 Jun 2022. Supporting qualification; FSS units are evidenced on her USI transcript filed under FSS certificates.",
    issuedOn: "2022-06-21",
    expiresOn: null,
    file: "cert-iii-commercial-cookery-candela-caballero.pdf",
    mime: "application/pdf",
  },
]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  let inserted = 0
  let skipped = 0
  try {
    for (const d of docs) {
      const bytes = readFileSync(join(DOCS_DIR, d.file))
      for (const venue of d.venues) {
        const existing = await pool.query(
          'SELECT id FROM "CouncilDocument" WHERE venue = $1::"Venue" AND type = $2::"CouncilDocumentType" AND "fileName" = $3 AND "fileSize" = $4',
          [venue, d.type, d.file, bytes.length]
        )
        if (existing.rows.length > 0) {
          skipped++
          console.log(`skip   ${venue} ${d.type} ${d.file} (exists)`)
          continue
        }
        console.log(
          `${WRITE ? "insert" : "would insert"} ${venue} ${d.type} ${d.file} (${bytes.length} B)`
        )
        if (WRITE) {
          await pool.query(
            `INSERT INTO "CouncilDocument"
               (id, venue, type, title, description, "issuedOn", "expiresOn",
                "fileName", "mimeType", "fileSize", data, "uploadedBy", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1::"Venue", $2::"CouncilDocumentType", $3, $4,
                     $5::date, $6::date, $7, $8, $9, $10, $11, now(), now())`,
            [
              venue,
              d.type,
              d.title,
              d.description,
              d.issuedOn,
              d.expiresOn,
              d.file,
              d.mime,
              bytes.length,
              bytes,
              "Assistant upload for Chloe (22 Jul 2026)",
            ]
          )
          inserted++
        }
      }
    }
  } finally {
    await pool.end()
  }
  console.log(`\ndone. inserted=${inserted} skipped=${skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
