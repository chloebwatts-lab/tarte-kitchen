import "dotenv/config"
import { Pool } from "pg"

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

const TEMPLATES = [
  {
    name: "Opening",
    area: "FOH",
    venue: "TEA_GARDEN",
    cadence: "DAILY",
    shift: "OPEN",
    dueByHour: 9,
    items: [
      { label: "Set up all tables and chairs" },
      { label: "Sanitise all tables" },
      { label: "Put out all sugar pots" },
      { label: "Set up water station with cups" },
      { label: "Turn on music and all lights" },
      { label: "Set up pastry cabinet — tongs, retail bread" },
      { label: "Set up till station with menus out" },
      { label: "Polish cutlery and stock under till" },
      { label: "Prepare pastry boxes" },
      { label: "Check and restock bathroom" },
      { label: "Restock packaging under till" },
      { label: "Light watering of all plants" },
    ],
  },
  {
    name: "Closing",
    area: "FOH",
    venue: "TEA_GARDEN",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Bring in and stack all tables and chairs" },
      { label: "Bring in all sugar pots" },
      { label: "Clean pastry cabinet, stands and marble" },
      { label: "Wipe down pass and till areas" },
      { label: "Bring in water cups" },
      { label: "Cling wrap, date and store leftover bread in fridge" },
      { label: "Send leftover pastry to kitchen" },
      { label: "Restock mini fridge with water" },
      { label: "Top up cupboard stock" },
      { label: "Turn off music and all lights" },
      { label: "Put all devices on charge" },
      { label: "Lock up" },
    ],
  },
  {
    name: "FOH — Daily Tasks",
    area: "FOH",
    venue: "TEA_GARDEN",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Sanitise all tables and chairs (AM and PM)" },
      { label: "Wipe down all surfaces and benches" },
      { label: "Clean pastry cabinet glass" },
      { label: "Clean pastry stands and marble" },
      { label: "Wipe down till bench" },
      { label: "Clean pie/food warmer" },
      { label: "Wipe down pass area" },
      { label: "Refill sugar pots" },
      { label: "Top up bathroom" },
      { label: "Refresh menus" },
      { label: "Sweep and mop floors" },
      { label: "Light watering of all plants" },
    ],
  },
  {
    name: "Barista — Daily Clean",
    area: "Barista",
    venue: "TEA_GARDEN",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Clean grinders" },
      { label: "Disassemble and clean Puck Press" },
      { label: "Clean knock box" },
      { label: "Soak and clean group heads" },
      { label: "Clean shower screens" },
      { label: "Clean and polish swing arms" },
      { label: "Clean coffee drip tray" },
      { label: "Sanitise benches and shelves" },
      { label: "Pack down and clean batch brew" },
      { label: "Wipe down back wall and cupboards" },
      { label: "Clean front of machine and marble" },
      { label: "Vacuum and sanitise under machine" },
      { label: "Clean fridge glass" },
      { label: "Wipe down ice machine" },
      { label: "Soak and scrub jug rinser" },
      { label: "Restock chux, tea towels, spoons" },
      { label: "Restock and rotate milks and cold drinks" },
      { label: "Sanitise filter tap and restock TA cups" },
      { label: "Polish metal grinders, machine and docket rail" },
    ],
  },
  {
    name: "KP — Daily Close",
    area: "KP",
    venue: "TEA_GARDEN",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Rinse and scrub all glassware and crockery" },
      { label: "Wash and stack all cutlery through dishwasher" },
      { label: "Empty tea strainers, wash teapots — keep all parts together" },
      { label: "Clean and drain dishwasher; wipe inside and out" },
      { label: "Scrub sink and walls with soap and scourer, wipe with sanitiser" },
      { label: "Empty all bins and fit new bin bags" },
      { label: "Wash bins inside and out", instructions: "Take all bins outside (or to wash bay). Scrub inside and out with hot soapy water and sanitiser. Allow to dry before re-lining." },
      { label: "Flatten cardboard and put in recycling" },
      { label: "Sweep, mop and squeegee floors" },
      { label: "Fill soap bottles and prepare fresh buckets" },
      { label: "Lock everything up and put all items back in place" },
    ],
  },
  {
    name: "FOH — Weekly Deep Clean",
    area: "FOH",
    venue: "TEA_GARDEN",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Heavy watering of all plants — soak thoroughly" },
      { label: "Dust and wipe all homewares and decorative items" },
      { label: "Dust and wipe all shelves and display surfaces" },
      { label: "Wipe inside walls and skirting" },
      { label: "Clean all glass doors and windows" },
      { label: "Deep clean pastry cabinet inside and out" },
      { label: "Gumption plates, cups and crockery" },
      { label: "Clean sugar pots" },
      { label: "Clean till fridge inside" },
      { label: "Deep clean food warmer" },
      { label: "Organise storeroom" },
      { label: "Wipe retail shelves and rotate stock" },
      { label: "Deep clean outdoor furniture" },
      { label: "Refresh menus and menu boards" },
    ],
  },
  {
    name: "Barista — Weekly Deep Clean",
    area: "Barista",
    venue: "TEA_GARDEN",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Pull out fridges and mop underneath" },
      { label: "Clean back wall behind bins" },
      { label: "Clean ice machine filters" },
      { label: "Clean out all fridges with hot soapy water" },
      { label: "Clean top of machine" },
      { label: "Sanitise and reorganise shelves and cupboards" },
      { label: "Descale Breville" },
      { label: "Clean out drain" },
      { label: "Clean skirting and tiles in front of machine" },
      { label: "Gumption bench" },
      { label: "Soak and scrub milk jugs" },
      { label: "Deep clean knock box and bins" },
      { label: "Wash coffee storage containers" },
      { label: "Restock tea, powders and syrups" },
    ],
  },
  {
    name: "KP — Weekly Deep Clean",
    area: "KP",
    venue: "TEA_GARDEN",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Deep clean dishwasher — descale, drain, wipe inside and out", instructions: "Use DE SCALER product and run 2 cycles before draining" },
      { label: "Scrub juice jugs with hot soapy water, scourer and descaler" },
      { label: "Clean fridge filters — hot soapy water and dry out completely" },
      { label: "Gumption plates, cups and stainless steel" },
      { label: "Soak mop heads in bleach" },
      { label: "Deep clean all sinks and drains" },
      { label: "Clean under all equipment" },
      { label: "Organise and restock shelves — bin bags, paper towel, cleaning products" },
    ],
  },
  {
    name: "FOH — Monthly Tasks",
    area: "FOH",
    venue: "TEA_GARDEN",
    cadence: "MONTHLY",
    shift: "ANY",
    items: [
      { label: "Deep clean all light fixtures" },
      { label: "Clean ceiling fans" },
      { label: "Clean wall lights" },
      { label: "Wipe all inside walls" },
      { label: "Clean outside walls" },
      { label: "Clean outside floor and gardens — remove rubbish, sweep" },
      { label: "Deep clean highchairs" },
      { label: "Gumption and wash sugar pots" },
      { label: "Polish all glassware" },
      { label: "Deep clean bathroom thoroughly" },
      { label: "Clean front steps and entry mats" },
      { label: "Gumption pot plants and garden features" },
      { label: "Dust picture frames and wall art" },
      { label: "Polish Brasso sign" },
    ],
  },
]

async function main() {
  const client = await pool.connect()
  let created = 0
  let skipped = 0

  try {
    for (const t of TEMPLATES) {
      const exists = await client.query(
        `SELECT id FROM "ChecklistTemplate" WHERE name = $1 AND venue = $2`,
        [t.name, t.venue]
      )
      if (exists.rows.length > 0) {
        console.log(`  SKIP  ${t.venue} / ${t.name}`)
        skipped++
        continue
      }

      await client.query("BEGIN")
      try {
        const tRow = await client.query(
          `INSERT INTO "ChecklistTemplate"
            (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "createdAt", "updatedAt")
           VALUES
            (gen_random_uuid()::text, $1, $2, $3, $4, $5, false, $6, true, NOW(), NOW())
           RETURNING id`,
          [t.name, t.area, t.venue, t.cadence, t.shift, t.dueByHour ?? null]
        )
        const templateId = tRow.rows[0].id

        for (let i = 0; i < t.items.length; i++) {
          const item = t.items[i]
          await client.query(
            `INSERT INTO "ChecklistTemplateItem"
              (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "createdAt", "updatedAt")
             VALUES
              (gen_random_uuid()::text, $1, $2, $3, $4, false, false, NOW(), NOW())`,
            [templateId, i, item.label, item.instructions ?? null]
          )
        }

        await client.query("COMMIT")
        console.log(`  CREATE ${t.venue} / ${t.name} (${t.items.length} items)`)
        created++
      } catch (e) {
        await client.query("ROLLBACK")
        throw e
      }
    }
  } finally {
    client.release()
    await pool.end()
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped`)
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e)
  process.exit(1)
})
