/**
 * Upload compliance documents into CouncilDocument for the /council folder.
 *
 * Additive + idempotent: skips any row where the same (venue, type, fileName,
 * fileSize) already exists. Never deletes or overwrites.
 *
 * Reads files + manifest from the session scratchpad (see DOCS_DIR below).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/upload-council-docs.ts [--write]
 */
import "dotenv/config"
import { Pool } from "pg"
import { readFileSync } from "node:fs"
import { basename, join } from "node:path"

const WRITE = process.argv.includes("--write")
const DOCS_DIR =
  "/private/tmp/claude-501/-Users-chris-C/b79f8f87-9cd3-4f66-9a1a-bd8f8194cb11/scratchpad/council-docs"

type Spec = {
  venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
  type: string
  title: string
  description: string | null
  issuedOn: string | null // YYYY-MM-DD
  expiresOn: string | null
  path: string // relative to DOCS_DIR
}

const VENUES = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as const
const VENUE_LABEL: Record<string, string> = {
  BURLEIGH: "Burleigh",
  BEACH_HOUSE: "Beach House",
  TEA_GARDEN: "Tea Garden",
}

const specs: Spec[] = []

// ---- generated working documents, one row per venue ----
for (const v of VENUES) {
  specs.push(
    {
      venue: v,
      type: "CLEANING_SCHEDULE",
      title: `Cleaning & sanitising schedule (${VENUE_LABEL[v]})`,
      description:
        "Generated from the live Tarte Kitchen checklist system (completion records held in the app). Working document.",
      issuedOn: "2026-07-14",
      expiresOn: null,
      path: `generated/cleaning-schedule-${v}.pdf`,
    },
    {
      venue: v,
      type: "CALIBRATION_RECORD",
      title: "Probe calibration procedure + log (blank)",
      description:
        "Procedure plus blank log sheet. Monthly ice point and boil point checks; completed sheets will be filed here as they accrue.",
      issuedOn: "2026-07-14",
      expiresOn: null,
      path: "generated/probe-calibration-procedure-log.pdf",
    },
    {
      venue: v,
      type: "TRAINING_RECORD",
      title: "Food handler training record (form + register)",
      description:
        "Blank form and register. Rollout to all current staff in progress (July 2026); completed forms will be filed here.",
      issuedOn: "2026-07-14",
      expiresOn: null,
      path: "generated/food-handler-training-record.pdf",
    },
    {
      venue: v,
      type: "SUPPLIER_APPROVAL",
      title: "Approved supplier list (Tarte Group)",
      description:
        "All venues. Categories from purchasing records; item level purchasing history held in Tarte Kitchen.",
      issuedOn: "2026-07-14",
      expiresOn: null,
      path: "generated/approved-supplier-list.pdf",
    },
    {
      venue: v,
      type: "RECALL_PROCEDURE",
      title: "Food recall & withdrawal procedure",
      description: "Tarte Group, all venues.",
      issuedOn: "2026-07-14",
      expiresOn: null,
      path: "generated/food-recall-procedure.pdf",
    },
    {
      venue: v,
      type: "HACCP_PLAN",
      title: "Food Safety Program v1.0 DRAFT (working document)",
      description:
        "HACCP based working document covering all venues. Pending director and Food Safety Supervisor review and sign off. Not an accredited program under Food Act 2006 Part 5.",
      issuedOn: "2026-07-14",
      expiresOn: null,
      path: "generated/food-safety-program-tarte.pdf",
    }
  )
}

// ---- licences ----
specs.push(
  {
    venue: "BURLEIGH",
    type: "FOOD_BUSINESS_LICENCE",
    title: "Food business licence FBFIX-8032605 (2025-26)",
    description:
      "Current licence, Tarte Pty Ltd, issued 1 Aug 2025. NOTE: 2026-27 renewal notice received 1 Jul 2026 is awaiting action.",
    issuedOn: "2025-08-01",
    expiresOn: "2026-08-31",
    path: "licence-burleigh-FBFIX-8032605-2025-26.pdf",
  },
  {
    venue: "BEACH_HOUSE",
    type: "FOOD_BUSINESS_LICENCE",
    title: "Licence FBFIX-8039032 - 2025 renewal notice",
    description:
      "Renewal notice for the Currumbin premises licence (renewed manually via GCCC, Aug 2025). The renewed certificate was posted, not emailed: replace this notice with a copy of the certificate displayed at the premises.",
    issuedOn: "2025-07-01",
    expiresOn: null,
    path: "licence-beachhouse-FBFIX-8039032-renewal-notice-2025.pdf",
  },
  {
    venue: "TEA_GARDEN",
    type: "FOOD_BUSINESS_LICENCE",
    title: "Licence FBFIX-8039032 - 2025 renewal notice (shared premises licence)",
    description:
      "Tea Garden operates under the Tarte Currumbin premises licence FBFIX-8039032 (Shop 1, 2-4 Thrower Drive).",
    issuedOn: "2025-07-01",
    expiresOn: null,
    path: "licence-beachhouse-FBFIX-8039032-renewal-notice-2025.pdf",
  }
)

// ---- pest control ----
type ManifestEntry = {
  file: string
  supplier: string
  invoiceOrJob: string
  venue: string
  emailDate: string
  workDate?: string
  status: string
}
const manifest = JSON.parse(
  readFileSync(join(DOCS_DIR, "manifest-harvest.json"), "utf8")
) as { entries: ManifestEntry[] }

for (const e of manifest.entries) {
  if (e.status !== "ok") continue
  if (!e.file.startsWith("pest/")) continue
  if (e.venue !== "BURLEIGH" && e.venue !== "BEACH_HOUSE") continue
  const when = e.workDate || e.emailDate
  specs.push({
    venue: e.venue as Spec["venue"],
    type: "PEST_CONTROL_REPORT",
    title: `Crisis Pest Management - service invoice #${e.invoiceOrJob}`,
    description:
      "Service visit record (tax invoice from licensed pest controller). Detailed treatment report available from Crisis Pest Management on request.",
    issuedOn: when,
    expiresOn: null,
    path: e.file,
  })
}

specs.push({
  venue: "BEACH_HOUSE",
  type: "PEST_CONTROL_REPORT",
  title: "Visual termite inspection report (AS 3660.2) - Oct 2025",
  description: "Crisis Pest Management, u1 2/4 Thrower Dr, Currumbin.",
  issuedOn: "2025-10-08",
  expiresOn: null,
  path: "pest/termite-inspection-report-2025-10-BEACH_HOUSE.pdf",
})

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  let inserted = 0
  let skipped = 0
  try {
    for (const s of specs) {
      const bytes = readFileSync(join(DOCS_DIR, s.path))
      const fileName = basename(s.path)
      const existing = await pool.query(
        'SELECT id FROM "CouncilDocument" WHERE venue = $1::"Venue" AND type = $2::"CouncilDocumentType" AND "fileName" = $3 AND "fileSize" = $4',
        [s.venue, s.type, fileName, bytes.length]
      )
      if (existing.rows.length > 0) {
        skipped++
        console.log(`skip   ${s.venue} ${s.type} ${fileName} (exists)`)
        continue
      }
      console.log(
        `${WRITE ? "insert" : "would insert"} ${s.venue} ${s.type} ${fileName} (${bytes.length} B)`
      )
      if (WRITE) {
        await pool.query(
          `INSERT INTO "CouncilDocument"
             (id, venue, type, title, description, "issuedOn", "expiresOn",
              "fileName", "mimeType", "fileSize", data, "uploadedBy", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1::"Venue", $2::"CouncilDocumentType", $3, $4,
                   $5::date, $6::date, $7, 'application/pdf', $8, $9, $10, now(), now())`,
          [
            s.venue,
            s.type,
            s.title,
            s.description,
            s.issuedOn,
            s.expiresOn,
            fileName,
            bytes.length,
            bytes,
            "Assistant upload for Chris (14 Jul 2026)",
          ]
        )
        inserted++
      }
    }
  } finally {
    await pool.end()
  }
  console.log(`\ndone. inserted=${inserted} skipped=${skipped} total specs=${specs.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
