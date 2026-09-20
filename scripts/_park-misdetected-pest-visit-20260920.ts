// Crisis Pest invoice #10163 (2 Sep 2026) is for a private address, not a
// Tarte premises, but the service-email sweep filed it under Burleigh pest
// control. That made the Burleigh "last done" read 2 Sep when the real last
// visit was 1 Sep (invoice #10143), and showed the address on the public
// staff calendar.
//
// Nothing is deleted. The visit is moved to an INACTIVE holding program
// ("Not a Tarte premises"), which the staff calendar, the due-date maths and
// the email sweep all ignore (they read active programs only). It still shows
// on the admin /services page, where Chloe can delete it with the row's own
// delete button if she wants it gone. Reversible: set programId back.
//
// DRY RUN BY DEFAULT, pass --apply to write.
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const APPLY = process.argv.includes("--apply")
const VISIT_ID = "cmtkm0rmof4hs01le008gh7g0"
const HOLD_LABEL = "Not a Tarte premises (misdetected email)"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const visit = await db.serviceVisit.findUnique({ where: { id: VISIT_ID }, include: { program: true } })
  if (!visit) throw new Error("visit not found")
  console.log(`visit: ${visit.serviceDate.toISOString().slice(0, 10)} "${visit.emailSubject}" in program ${visit.program.venue}/${visit.program.category} (active=${visit.program.active})`)
  if (!/Invoice #10163\b/.test(visit.emailSubject ?? "")) throw new Error("not invoice #10163, stopping")
  if (visit.program.label === HOLD_LABEL) { console.log("already parked"); return }
  if (visit.program.venue !== "BURLEIGH" || visit.program.category !== "pest-control") throw new Error("unexpected program, stopping")
  if (!APPLY) { console.log("DRY RUN, nothing written"); return }

  const hold =
    (await db.serviceProgram.findFirst({ where: { label: HOLD_LABEL } })) ??
    (await db.serviceProgram.create({
      data: {
        venue: "BURLEIGH",
        category: "other",
        label: HOLD_LABEL,
        active: false,
        notes: "Holding pen for email-detected visits that are not for a Tarte premises. Inactive on purpose: hidden from the staff calendar and ignored by the email sweep.",
      },
    }))
  await db.serviceVisit.update({
    where: { id: VISIT_ID },
    data: {
      programId: hold.id,
      needsReview: false,
      notes: `${visit.notes ?? ""} [2026-09-20: not a Tarte premises, moved out of Burleigh pest control (program ${visit.programId}).]`.trim(),
    },
  })
  console.log(`moved to holding program ${hold.id}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect(); await pool.end() })
