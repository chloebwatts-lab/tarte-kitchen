// Seed the six compliance jobs Shawna owns, as scheduled board items and as
// responsibility areas.
//
// Why this exists: asked who does these, Georgia answered "nobody" for the
// extinguisher tags, test and tag, and allergen updates, and Savy answered
// "no idea" for the first two. Chloe confirmed all six are Shawna's. So the
// work was happening (or not) with neither manager able to say. Writing the
// owner down is the fix.
//
// Every schedule raises onto Georgia's morning board pointed at SHAWNA, never
// at the person reading. They appear there to be chased, not absorbed.
//
// nextDueAt is set to today deliberately, so all six surface on the first
// board load. Nobody currently knows the real due dates, and Shawna
// correcting them one by one is the point of the exercise.
//
// Idempotent: upserts on (venue, title) and (venue, name).
// Run vs prod:  npx tsx --env-file=.env.local scripts/seed-venue-compliance.ts
import "dotenv/config"
import { PrismaClient, Venue } from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

const OWNER = "Shawna"
const VENUE: Venue = "BURLEIGH"

// UTC midnight today: @db.Date keeps the calendar date.
const today = (() => {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
})()

const CONFIRM =
  "Due date is a placeholder. Shawna to confirm when this was last done and correct it."

const SCHEDULES = [
  {
    title: "Fire extinguisher and fire blanket tag dates",
    category: "BUILDING" as const,
    everyMonths: 12,
    leadDays: 30,
    detail: `Annual tagging. Needs a contractor booked, so it surfaces a month out. ${CONFIRM}`,
  },
  {
    title: "Test and tag electrical gear",
    category: "BUILDING" as const,
    everyMonths: 12,
    leadDays: 30,
    detail: `Annual. Needs a contractor booked. ${CONFIRM}`,
  },
  {
    title: "Book pest control and file the report",
    category: "BUILDING" as const,
    everyMonths: 3,
    leadDays: 21,
    detail: `Quarterly. The report gets filed, Georgia holds the forms. ${CONFIRM}`,
  },
  {
    title: "Restock the first aid kit",
    category: "MISC" as const,
    everyMonths: 3,
    leadDays: 14,
    detail: `Quarterly check and restock. ${CONFIRM}`,
  },
  {
    title: "Review allergen info against the current menu",
    category: "MISC" as const,
    everyMonths: 3,
    leadDays: 7,
    detail:
      "Backstop only. The real trigger is any menu or recipe change, and the " +
      "drafter refuses 'free from' claims when assessments are stale. " +
      CONFIRM,
  },
  {
    title: "Deep cleans with no schedule (extraction filters, ice machine, grinder)",
    category: "CLEANING" as const,
    everyMonths: 1,
    leadDays: 7,
    detail: `Monthly. ${CONFIRM}`,
  },
]

const AREAS = [
  {
    name: "Fire and electrical compliance",
    description: "Extinguisher and blanket tagging, test and tag.",
    youDecide: "Nothing. Book through Shawna.",
    youAsk: "Anything that looks out of date, tell Shawna the same day.",
    toTakeThisOn:
      "Know the tagging cycle, who the contractor is, and where the certificates are filed.",
  },
  {
    name: "Pest control",
    description: "Booking the visits and filing the report.",
    youDecide: "Nothing. Report sightings to Shawna or Georgia immediately.",
    youAsk: "Any sighting, any time. Never wait for the next visit.",
    toTakeThisOn: "Know the provider, the schedule, and where reports are kept.",
  },
  {
    name: "First aid",
    description: "Kit contents and restocking.",
    youDecide: "Use what you need from the kit, that is what it is for.",
    youAsk: "Tell Shawna when you use the last of something.",
    toTakeThisOn: "Know the required contents list and the supplier.",
  },
  {
    name: "Allergen information",
    description: "Keeping allergen data current when menus or recipes change.",
    youDecide:
      "Nothing. Never tell a guest an item is free from something unless Tarte Kitchen says so.",
    youAsk: "Any menu or recipe change goes to Shawna before it reaches a guest.",
    toTakeThisOn:
      "Understand the ingredient assessment flow and why an unassessed ingredient blocks a free-from claim.",
  },
  {
    name: "Scheduled deep cleans",
    description: "Extraction filters, ice machine, coffee grinder burrs.",
    youDecide: "Nothing scheduled. Normal cleaning is per your section.",
    youAsk: "Tell Shawna if one of these looks overdue.",
    toTakeThisOn: "Know the cycle for each machine and how each is cleaned.",
  },
]

async function main() {
  console.log(`Seeding compliance for ${VENUE}, owner ${OWNER}\n`)

  for (const s of SCHEDULES) {
    const row = await db.venueTaskSchedule.upsert({
      where: { venue_title: { venue: VENUE, title: s.title } },
      create: {
        venue: VENUE,
        title: s.title,
        detail: s.detail,
        category: s.category,
        defaultOwner: OWNER,
        everyMonths: s.everyMonths,
        leadDays: s.leadDays,
        nextDueAt: today,
      },
      // Never clobber a real due date somebody has since corrected.
      update: { defaultOwner: OWNER, category: s.category, detail: s.detail },
    })
    console.log(`  schedule  ${row.title}`)
  }

  for (const a of AREAS) {
    const row = await db.responsibilityArea.upsert({
      where: { venue_name: { venue: VENUE, name: a.name } },
      create: { venue: VENUE, ownerName: OWNER, ...a },
      update: { ownerName: OWNER, ...a },
    })
    console.log(`  area      ${row.name}`)
  }

  console.log(
    `\nDone. All six will appear on the ops board owned by ${OWNER}.` +
      `\nFirst job is confirming the real due dates.`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
    await pool.end()
  })
