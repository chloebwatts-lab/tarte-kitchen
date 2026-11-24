/**
 * Burleigh opening and closing checklists, Chloe 24 Nov 2026: "do the same for
 * Burleigh but not the particular cleaning jobs as they differ per venue".
 * Built from the Currumbin cafe sheets (seed-currumbin-cafe-sheets-20261124.ts)
 * with the cleaning jobs and the Currumbin-only lines left out (beach, paddle
 * boards, astroturf, Tea Garden, Bopple, its doors, times and ordering days).
 * Burleigh facts used: Sunday surcharge 10%, public holiday 17% (Square);
 * Uber Eats weekdays only (Chloe 18 Nov: weekends too busy). Leftover
 * croissants and the full restock already sit in "FOH — Daily Tasks".
 *
 * Venue BURLEIGH, area "FOH" (excluded from the nightly auto-fill, the floor
 * team fills these in live). New templates, nothing archived.
 *
 * Run (dry run first):
 *   npx tsx --env-file=.env.local scripts/seed-burleigh-foh-sheets-20261124.ts
 *   npx tsx --env-file=.env.local scripts/seed-burleigh-foh-sheets-20261124.ts --apply
 *
 * Safe to re-run: a template that already has sectioned lines is left alone.
 */
import { Pool } from "pg"

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5
const WEEKDAYS = [MON, TUE, WED, THU, FRI]

interface Line {
  label: string
  instructions?: string
  days?: number[]
  alsoOnPublicHolidays?: boolean
}
interface Section {
  section: string | null
  lines: Line[]
}
interface Sheet {
  /** Existing template to rewrite, or null to create (matched by venue, area, name). */
  id: string | null
  name: string
  shift: "OPEN" | "MID" | "CLOSE" | "ANY"
  dueByHour: number | null
  sections: Section[]
}

const OPENING: Sheet = {
  id: null,
  name: "Opening Checklist",
  shift: "OPEN",
  dueByHour: 9,
  sections: [
    {
      section: "Setup",
      lines: [
        { label: "Tables and chairs set up" },
        { label: "All tables sanitised" },
        { label: "Sugar pots out" },
        { label: "Lights on, music on" },
        { label: "Menus out: current and clean" },
        { label: "Bathrooms: toilet paper, soap, hand towel" },
        { label: "Retail drinks fridge rotated, topped up" },
        { label: "New stock put away and rotated" },
        { label: "Pass set up: sauces" },
        { label: "Docket printers on, paper loaded" },
        { label: "Sold out items reset: Square, Uber" },
      ],
    },
    {
      section: "Surcharge",
      lines: [
        {
          label: "Surcharge on: all tills and Uber",
          instructions: "Sunday 10%. Public holiday 17%, any day of the week.",
          days: [SUN],
          alsoOnPublicHolidays: true,
        },
        { label: "Surcharge sign out at counter", days: [SUN], alsoOnPublicHolidays: true },
      ],
    },
    {
      section: "Tills and pastry cabinet",
      lines: [
        { label: "Tills on, logged in, online" },
        { label: "Cash float counted, change ready" },
        { label: "Till stations set up with menus out" },
        { label: "Pastry cabinet: tongs, retail bread" },
        { label: "Pastry boxes prepared" },
        { label: "Cutlery polished, stock under till" },
      ],
    },
    {
      section: "Uber Eats",
      lines: [
        {
          label: "Uber Eats on, accepting orders",
          instructions: "Weekdays only. Weekends are too busy for Uber.",
          days: WEEKDAYS,
        },
        { label: "Uber device charged, logged in", days: WEEKDAYS },
      ],
    },
    {
      section: "Sign-off",
      lines: [{ label: "Opened by: sign off", instructions: "Your name is stamped on this tick." }],
    },
  ],
}

const CLOSING: Sheet = {
  id: null,
  name: "Closing Checklist",
  shift: "CLOSE",
  dueByHour: 17,
  sections: [
    {
      section: "Pack-down",
      lines: [
        { label: "Afternoon menus out, all day menus away" },
        { label: "Sugar pots in" },
        { label: "Outdoor tables and chairs in" },
        { label: "Pastry boxed for promo or 5 Stars" },
        { label: "Pastry cabinet reset" },
        {
          label: "Pass sauces refilled, dated, initialled",
          instructions: "Label every bottle: date made and initials of who bottled.",
        },
      ],
    },
    {
      section: "Online and devices",
      lines: [
        { label: "Uber Eats closed", days: WEEKDAYS },
        { label: "All devices on charge (tills, EFTPOS, Uber)" },
        { label: "Music off" },
      ],
    },
    {
      section: "Restock",
      lines: [
        { label: "Under till: packaging, napkins, cutlery" },
        { label: "Retail drinks fridge rotated, topped up" },
        { label: "Butter and jam portioned, in fridge" },
        { label: "All day menus back on tills and tables" },
        { label: "Cash-up done, float ready for tomorrow" },
      ],
    },
    {
      section: "Lock up",
      lines: [{ label: "All doors, windows and gates locked" }],
    },
    {
      section: "Sign-off",
      lines: [{ label: "Closed by: sign off", instructions: "Your name is stamped on this tick." }],
    },
  ],
}

const VENUE = "BURLEIGH"
const AREA = "FOH"
const apply = process.argv.includes("--apply")

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

async function writeSheet(sheet: Sheet) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    let templateId = sheet.id
    if (templateId) {
      const t = await client.query(
        `SELECT id, name, venue, area FROM "ChecklistTemplate" WHERE id = $1`,
        [templateId]
      )
      if (t.rowCount !== 1 || t.rows[0].venue !== VENUE || t.rows[0].area !== AREA) {
        throw new Error(`${sheet.name}: template ${templateId} not found as ${VENUE} / ${AREA}`)
      }
    } else {
      const t = await client.query(
        `SELECT id FROM "ChecklistTemplate" WHERE venue = $1 AND area = $2 AND name = $3`,
        [VENUE, AREA, sheet.name]
      )
      templateId = t.rows[0]?.id ?? null
    }

    if (templateId) {
      const done = await client.query(
        `SELECT count(*)::int AS n FROM "ChecklistTemplateItem"
          WHERE "templateId" = $1 AND archived = false AND section IS NOT NULL`,
        [templateId]
      )
      if (done.rows[0].n > 0) {
        console.log(`= ${sheet.name}: already loaded (${done.rows[0].n} sectioned lines), left alone`)
        await client.query("ROLLBACK")
        return
      }
    }

    if (!templateId) {
      const created = await client.query(
        `INSERT INTO "ChecklistTemplate"
           (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "alertEmails", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3::"Venue", 'DAILY', $4::"ChecklistShift", false, $5, '{}', true, NOW(), NOW())
         RETURNING id`,
        [sheet.name, AREA, VENUE, sheet.shift, sheet.dueByHour]
      )
      templateId = created.rows[0].id as string
      console.log(`+ ${sheet.name}: new template ${templateId}`)
    } else {
      const archived = await client.query(
        `UPDATE "ChecklistTemplateItem" SET archived = true, "updatedAt" = NOW()
          WHERE "templateId" = $1 AND archived = false`,
        [templateId]
      )
      await client.query(
        `UPDATE "ChecklistTemplate"
            SET name = $2, shift = $3::"ChecklistShift", "dueByHour" = $4, "isActive" = true, "updatedAt" = NOW()
          WHERE id = $1`,
        [templateId, sheet.name, sheet.shift, sheet.dueByHour]
      )
      console.log(`~ ${sheet.name}: renamed, ${archived.rowCount} old lines archived`)
    }

    let sortOrder = 0
    for (const s of sheet.sections) {
      for (const line of s.lines) {
        await client.query(
          `INSERT INTO "ChecklistTemplateItem"
             (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck",
              archived, section, days, "alsoOnPublicHolidays", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, false, false, false, false, $5, $6::int[], $7, NOW(), NOW())`,
          [
            templateId,
            sortOrder++,
            line.label,
            line.instructions ?? null,
            s.section,
            line.days ?? [],
            line.alsoOnPublicHolidays ?? false,
          ]
        )
      }
    }
    console.log(`  ${sortOrder} lines written`)
    await client.query(apply ? "COMMIT" : "ROLLBACK")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

function preview(sheet: Sheet) {
  console.log(`\n${sheet.name} (${sheet.shift})`)
  for (const s of sheet.sections) {
    console.log(`  [${s.section ?? "-"}]`)
    for (const l of s.lines) {
      const d = l.days?.length ? ` {${l.days.map((x) => DAY[x]).join(" ")}${l.alsoOnPublicHolidays ? " + public holidays" : ""}}` : ""
      console.log(`    ${l.label}${d}`)
    }
  }
}

async function main() {
  for (const s of [OPENING, CLOSING]) preview(s)
  // House style: no em dashes in anything staff read.
  const text = JSON.stringify([OPENING, CLOSING])
  if (text.includes("—")) throw new Error("em dash in sheet text")
  console.log(apply ? "\n== applying" : "\n== dry run (rolls back), pass --apply to write")
  for (const s of [OPENING, CLOSING]) await writeSheet(s)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
