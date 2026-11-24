/**
 * Chloe's Currumbin cafe opening and closing sheets (PDF, 24 Nov 2026) as app
 * checklists, Beach House, area "FOH Cafe":
 *
 *  - "Cafe — Opening"  -> renamed "Cafe Opening Checklist", lines replaced
 *  - "Cafe — Closing"  -> renamed "Cafe Closing Checklist", lines replaced
 *  - new "Cafe Quiet Time Jobs" (the sheet's "tick when done" block, its own
 *    list so opening can be signed off before the quiet part of the day)
 *
 * Both old lists had no runs since Aug/Sep 2026. Their old lines are archived,
 * not deleted, so past runs keep their history. Day-only lines (Sat and Sun
 * beach tables, Sunday surcharge, ordering days) use ChecklistTemplateItem.days,
 * 0 = Sunday to 6 = Saturday. The sheet's "only if Uber is on" weekend boxes
 * become one weekend line ("on only if quiet or raining"), so every line on
 * the list can be ticked truthfully.
 *
 * Run (needs the 20261124070000_checklist_item_days migration live):
 *   npx tsx --env-file=.env.local scripts/seed-currumbin-cafe-sheets-20261124.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/seed-currumbin-cafe-sheets-20261124.ts --apply
 *
 * Safe to re-run: a template that already has sectioned lines is left alone.
 */
import { Pool } from "pg"

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6
const WEEKDAYS = [MON, TUE, WED, THU, FRI]
const WEEKEND = [SAT, SUN]
const NOT_SUNDAY = [MON, TUE, WED, THU, FRI, SAT]

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

const PASS_SAUCES = [
  "Sweet chilli: pea fritters",
  "Tomato: kids fish and chips",
  "Guzzy (half BBQ, half buffalo): guzzy burrito",
  "Miso sesame: salad dressing",
  "Amazu: fish and chips + 2 green chilli",
  "Label every bottle: date made and initials of who bottled.",
].join("\n")

const OPENING: Sheet = {
  id: "6f41f08e-3daa-4a14-aa5f-568524a0f8e0",
  name: "Cafe Opening Checklist",
  shift: "OPEN",
  dueByHour: 9,
  sections: [
    {
      section: "Setup",
      lines: [
        { label: "Leaf blow astroturf" },
        { label: "Tables and chairs set up" },
        { label: "Extra tables out on the beach", days: WEEKEND },
        { label: "All tables sanitised" },
        { label: "Sugar pots out" },
        { label: "Umbrellas up" },
        { label: "Lights on, music on" },
        { label: "Brass sign out" },
        { label: "Menus out: current and clean" },
        { label: "Market sign (A-frame) out, if market open" },
        { label: "Paddle boards out: signage, 2 SUPs, 2 kayaks" },
        { label: "Water station: white cups only" },
        { label: "Bathrooms: toilet paper, soap, hand towel" },
        { label: "Retail drinks fridge rotated, topped up" },
        { label: "New stock put away and rotated" },
        { label: "Pass set up: sauces", instructions: PASS_SAUCES },
        { label: "Kids cookies on pass (not under heat lamp)" },
        { label: "KDS screens on and connected" },
        { label: "Docket printers on, paper loaded" },
        { label: "Bopple connected, accepting orders" },
        { label: "Sold out items reset: Square, Bopple, Uber" },
      ],
    },
    {
      section: "Surcharge",
      lines: [
        {
          label: "Surcharge on: Till 1, Till 2, Bopple, Uber",
          instructions: "Sunday 5%. Public holiday 17%, any day of the week.",
          days: [SUN],
          alsoOnPublicHolidays: true,
        },
        { label: "Surcharge sign out at counter", days: [SUN], alsoOnPublicHolidays: true },
      ],
    },
    {
      section: "Tills and pastry cabinet",
      lines: [
        { label: "Till 1 and Till 2 on, logged in, online" },
        { label: "Float $250 in Till 1 (Square: T1 $250, T2 $0)" },
        { label: "Till cash drawer stocked with change" },
        { label: "Till stations set up with menus out" },
        { label: "Pastry cabinet: tongs, retail bread" },
        { label: "Pastry boxes prepared" },
        { label: "Cutlery polished, stock under till" },
        { label: "All lantern lightbulbs on" },
      ],
    },
    {
      section: "Uber Eats",
      lines: [
        { label: "Uber Eats on, accepting orders", days: WEEKDAYS },
        { label: "Uber device charged, logged in", days: WEEKDAYS },
        { label: "Driver pickup cone out", days: WEEKDAYS },
        {
          label: "Uber Eats: on only if the cafe is quiet or raining",
          instructions:
            "If you turn it on: accepting orders, device charged and logged in, driver pickup cone out. Tick once you have made the call.",
          days: WEEKEND,
        },
      ],
    },
    {
      section: "Sign-off",
      lines: [{ label: "Opened by: sign off", instructions: "Your name is stamped on this tick." }],
    },
  ],
}

const QUIET: Sheet = {
  id: null,
  name: "Cafe Quiet Time Jobs",
  shift: "ANY",
  dueByHour: null,
  sections: [
    {
      section: "Tick when done",
      lines: [
        { label: "Pastry cabinet glass cleaned" },
        { label: "Glass doors cleaned" },
        { label: "Menus reprinted and refreshed" },
        { label: "Sand removed from table legs" },
        { label: "Napkins and cutlery restocked" },
        { label: "Skirting and walls wiped" },
        { label: "Round table screws checked and tightened" },
        { label: "Till frontage: marble bench and weatherboards" },
        { label: "Water station: marble cleaned, brass polished" },
        { label: "Weeding around the building" },
        { label: "Beach raked" },
      ],
    },
  ],
}

const CLOSING: Sheet = {
  id: "cf610c22-0d87-4bdf-8abd-a6b4482f09d7",
  name: "Cafe Closing Checklist",
  shift: "CLOSE",
  dueByHour: 17,
  sections: [
    {
      section: "Pack-down",
      lines: [
        { label: "2:00pm: afternoon menus out, all day away" },
        { label: "2:30pm: sugar pots in" },
        { label: "2:30pm: start bringing in round tables" },
        {
          label: "2:45pm: pastry boxed for promo or 5 Stars",
          instructions: "Sat and Sun: boxed pastry to restaurant.",
        },
        { label: "3:00pm: umbrellas down (weather dependent)" },
        {
          label: "3:00pm: picnic tables cleaning mix, hosed",
          instructions: "Cleaning mix: green Domestos with hot soapy water.",
        },
        { label: "Leftover croissants into walk-in freezer" },
        { label: "Leftover bread wrapped, dated, walk-in" },
        { label: "Pastry stands, marble, cabinet glass clean" },
        { label: "Pastry cabinet reset" },
        {
          label: "Pass cleaned down and decluttered",
          instructions:
            "Pass kept clean, organised and sanitised all day. One dedicated chux for wiping the pass, a separate dedicated chux for wiping plates.",
        },
        { label: "Pass sauces refilled, dated, initialled", instructions: PASS_SAUCES },
        { label: "Water cups in" },
        { label: "All plants and garden bed watered" },
        { label: "Used boards hosed of sand, stacked, locked up" },
        { label: "Fri: astroturf pressure washed for weekend", days: [FRI] },
        { label: "Tue: Tea Garden prep area cleaned for Wed", days: [TUE] },
      ],
    },
    {
      section: "Online and devices",
      lines: [
        {
          label: "Uber Eats closed, driver cone in",
          instructions: "Sat and Sun: if Uber stayed off today, check it is closed and tick.",
        },
        { label: "Bopple stopped accepting orders" },
        { label: "All devices on charge (tills, EFTPOS, Uber)" },
        { label: "Music off" },
      ],
    },
    {
      section: "Restock and ordering",
      lines: [
        { label: "Under till: packaging, napkins, cutlery" },
        {
          label: "Cupboard restocked, rotated",
          instructions: "Cupboard: packaging, paper towel, napkins, straws.",
        },
        { label: "Retail drinks fridge rotated, topped up" },
        { label: "Till fridge: water + alcohol (outdoor backup)" },
        { label: "Butter and jam portioned, in fridge" },
        { label: "All day menus back on tills and tables" },
        { label: "Cash-up: till cash drawer stocked with change" },
        { label: "Order: fresh milk (in by 2pm)", days: [WED, FRI, SAT, MON] },
        { label: "Order: packaging, alt milks, frozen", days: NOT_SUNDAY },
        { label: "Order: fruit and veg", days: NOT_SUNDAY },
        { label: "Order: alcohol", days: [WED, FRI, MON] },
        { label: "Order: up for the weekend", days: [THU, FRI] },
      ],
    },
    {
      section: "Lock up",
      lines: [
        { label: "Pastry window locked" },
        { label: "Juice bar sliding door locked" },
        { label: "Market door locked" },
        { label: "Side gate locked" },
        { label: "Paddle board gate locked (separate lock)" },
      ],
    },
    {
      section: "Sign-off",
      lines: [{ label: "Closed by: sign off", instructions: "Your name is stamped on this tick." }],
    },
  ],
}

const VENUE = "BEACH_HOUSE"
const AREA = "FOH Cafe"
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
  for (const s of [OPENING, QUIET, CLOSING]) preview(s)
  // House style: no em dashes in anything staff read.
  const text = JSON.stringify([OPENING, QUIET, CLOSING])
  if (text.includes("—")) throw new Error("em dash in sheet text")
  console.log(apply ? "\n== applying" : "\n== dry run (rolls back), pass --apply to write")
  for (const s of [OPENING, QUIET, CLOSING]) await writeSheet(s)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
