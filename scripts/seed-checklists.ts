/**
 * Seed cleaning checklists from existing paper/Google Doc templates.
 * Run: npx tsx scripts/seed-checklists.ts
 *
 * Safe to re-run — skips any template whose name already exists for that venue.
 */
import "dotenv/config"
import { Pool } from "pg"

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

type Shift = "OPEN" | "MID" | "CLOSE" | "ANY"
type Cadence = "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND"
type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN" | "BOTH"

interface Item {
  label: string
  instructions?: string
  requireTemp?: boolean
  requireNote?: boolean
}

interface Template {
  name: string
  area: string
  venue: Venue
  cadence: Cadence
  shift: Shift
  isFoodSafety?: boolean
  dueByHour?: number
  items: Item[]
}

const TEMPLATES: Template[] = [
  // ─── BURLEIGH — BARISTA ──────────────────────────────────────────────────
  {
    name: "Barista — Daily Clean",
    area: "Barista",
    venue: "BURLEIGH",
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
      { label: "Sanitise benches" },
      { label: "Sanitise shelves" },
      { label: "Pack down and clean batch brew" },
      { label: "Wipe down back wall" },
      { label: "Wipe down cupboards" },
      { label: "Clean front of machine and marble" },
      { label: "Vacuum and sanitise under machine" },
      { label: "Clean hoppers" },
      { label: "Clean and sanitise EK grinder" },
      { label: "Clean fridge glass" },
      { label: "Wipe down ice machine" },
      { label: "Soak jug rinser" },
      { label: "Sanitise and scrub jug rinser" },
      { label: "Restock chux, tea towels, spoons" },
      { label: "Restock and rotate milks and cold drinks" },
      { label: "Prep lemon slices and mint" },
      { label: "Sanitise filter tap and restock TA cups" },
      { label: "Polish metal grinders, machine and docket rail" },
    ],
  },
  {
    name: "Barista — Weekly Deep Clean",
    area: "Barista",
    venue: "BURLEIGH",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Pull out fridges and mop underneath" },
      { label: "Clean back wall behind bins" },
      { label: "Clean ice machine filters" },
      { label: "Clean out fridges with hot soapy water" },
      { label: "Clean top of machine" },
      { label: "Clean coffee sign" },
      { label: "Sanitise and reorganise shelves" },
      { label: "Sanitise and reorganise cupboards" },
      { label: "Descale Breville" },
      { label: "Clean out drain" },
      { label: "Clean skirting" },
      { label: "Clean tiles in front of machine" },
      { label: "Gumption bench" },
      { label: "Soak and scrub milk jugs" },
      { label: "Deep clean knock box and bins" },
      { label: "Dust and polish brass ornaments" },
      { label: "Wash coffee storage containers" },
      { label: "Restock tea, powders and syrups" },
    ],
  },

  // ─── BURLEIGH — FOH ──────────────────────────────────────────────────────
  {
    name: "FOH — Daily Tasks",
    area: "FOH",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Sanitise all tables and chairs" },
      { label: "Clean drinks fridge glass" },
      { label: "Wipe windowsills" },
      { label: "Wipe marble behind till" },
      { label: "Wipe till bench" },
      { label: "Clean pie warmer" },
      { label: "Clean pastry boards" },
      { label: "Clean pastry cabinet glass" },
      { label: "Wipe down pass area" },
      { label: "Vacuum inside" },
      { label: "Mop inside" },
      { label: "Tidy picnic area" },
      { label: "Water hanging plants" },
    ],
  },
  {
    name: "FOH — Weekly Clean",
    area: "FOH",
    venue: "BURLEIGH",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Deep clean drinks fridge inside" },
      { label: "Check and update pastry labels" },
      { label: "Wipe inside walls" },
      { label: "Clean inside skirting" },
      { label: "Tidy bread display" },
      { label: "Clean sugar pots" },
      { label: "Wipe table number labels" },
      { label: "Gumption plates, bowls, etc", instructions: "Use Gumption paste on ceramic surfaces" },
      { label: "Clean inside park bench" },
      { label: "Tidy and wipe retail shelves" },
      { label: "Refresh menus" },
    ],
  },
  {
    name: "FOH — Monthly Tasks",
    area: "FOH",
    venue: "BURLEIGH",
    cadence: "MONTHLY",
    shift: "ANY",
    items: [
      { label: "Deep clean pie warmer" },
      { label: "Clean big pot plant and marble table" },
      { label: "Clean hanging lights" },
      { label: "Clean ceiling fan" },
      { label: "Clean wall lights" },
      { label: "Clean feature wall" },
      { label: "Wipe all inside walls" },
      { label: "Clean outside walls" },
      { label: "Clean outside floor and remove rubbish from gardens" },
      { label: "Leaf blow outside" },
      { label: "Clean front steps and entry mats" },
    ],
  },

  // ─── BURLEIGH — MARKET ───────────────────────────────────────────────────
  {
    name: "Market — Daily Clean",
    area: "Market",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Clean straw holder" },
      { label: "Sanitise pass and display marble" },
      { label: "Scrub stainless benches — hot water and sanitise" },
      { label: "Clean fridge doors inside and out" },
      { label: "Sanitise inside drawer lips" },
      { label: "Wash blender jugs, lids and covers with hot soapy water" },
      { label: "Wipe blender base with sanitiser" },
      { label: "Change fruit banes — move current fruit into clean bane" },
      { label: "Change garnish banes — move fruit into clean bane with new chux" },
      { label: "Wipe walls behind all equipment — hot water and sanitise" },
      { label: "Wash squeeze bottles and tubs" },
      { label: "Wash all utensils — knives, spatulas, chopping boards" },
      { label: "Scrub long chopping board with hot soapy water and hose down" },
      { label: "Wash and sanitise containers and storage tubs" },
      { label: "Ensure all product is accurately labelled, dated and initialled" },
    ],
  },
  {
    name: "Market — Weekly Deep Clean",
    area: "Market",
    venue: "BURLEIGH",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Scrub juice jugs with hot soapy water, scourer and descaler" },
      { label: "Rotate fruit display — replace ripe fruit with fresh stock" },
      { label: "Deep clean acai fridge — remove all items, hot soapy water and sanitise" },
      { label: "Deep clean alcohol fridge — remove all items, hot soapy water and sanitise" },
      { label: "Deep clean fruit fridge — remove all items, hot soapy water and sanitise" },
    ],
  },

  // ─── BURLEIGH — TAKEAWAY ─────────────────────────────────────────────────
  {
    name: "Takeaway — Daily Clean",
    area: "Takeaway",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Clean glass display" },
      { label: "Wipe all surfaces" },
      { label: "Tidy and wipe shelves" },
      { label: "Wipe down benches" },
      { label: "Clean pastry boards" },
      { label: "Vacuum floor" },
    ],
  },

  // ─── BURLEIGH — KP ───────────────────────────────────────────────────────
  {
    name: "FOH KP — Daily Close",
    area: "KP",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Rinse and scrub glassware and crockery with hot soapy water" },
      { label: "Scrape, stack and send white plates to main kitchen" },
      { label: "Soak cutlery in hot soapy water, then put through main kitchen dishwasher" },
      { label: "Rinse teaspoons and put through dishwasher" },
      { label: "Empty tea strainers, put teapots through dishwasher — keep all parts together" },
      { label: "Mop bathrooms, check bins, top up paper towel" },
      { label: "Flatten cardboard and put in recycling" },
      { label: "Clean dishwasher throughout the day; close and drain at end of day" },
      { label: "Tidy floors throughout day; deep clean at close" },
      { label: "Clean last dishes and stack in clean tubs" },
      { label: "Put buckets through dishwasher and stack neatly" },
      { label: "Deep clean dishwasher — remove trays/filters, descale if needed, drain, wipe inside and out", instructions: "For deep clean: use DE SCALER and run 2 cycles before draining" },
      { label: "Scrub sink and walls with soap and scourer, wipe with sanitiser" },
      { label: "Fill soap bottles and prepare fresh buckets" },
      { label: "Empty all bins and fit new bin bags" },
      { label: "Sweep, scrub and squeegee floors; hose sliding door, rails and step", instructions: "Bucket with hot water and bleach or floor cleaner. Use squeegee to push water to drains." },
    ],
  },
  {
    name: "FOH KP — Weekly Tasks",
    area: "KP",
    venue: "BURLEIGH",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Scrub juice jugs with hot soapy water, scourer and descaler" },
      { label: "Gumption plates, cups, stainless steel, etc" },
      { label: "Clean fridge filters — hot soapy water and dry out completely" },
      { label: "Organise and restock shelves — bin bags, paper towel, cleaning products" },
      { label: "Tidy staff area — sweep or hose ground" },
    ],
  },
  {
    name: "KP — Daily Close",
    area: "KP",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Sweep and mop all floors" },
      { label: "Empty and reline all bins" },
      { label: "Clean all mats" },
      { label: "Clean and drain all sinks" },
      { label: "Clean and drain dishwasher" },
      { label: "Clear all drains" },
      { label: "Push bins back into place in carpark" },
      { label: "Flatten cardboard and put in recycling" },
      { label: "Lock up and put all items back in correct place" },
    ],
  },
  {
    name: "KP — Weekly Deep Clean",
    area: "KP",
    venue: "BURLEIGH",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Deep clean pastry section" },
      { label: "Clean outside canopy" },
      { label: "Deep clean dishwasher and surrounding area" },
      { label: "Clean takeaway prep stainless benches" },
      { label: "Clean takeaway area" },
      { label: "Clean under all sinks" },
      { label: "Clean market sink area and underneath" },
      { label: "Soak mop heads in bleach" },
      { label: "Gumption plates and bowls" },
      { label: "Deep clean back carpark (DS)" },
      { label: "Clean glass doors and roller tracks (DS)" },
    ],
  },
  {
    name: "KP — Monthly Deep Clean",
    area: "KP",
    venue: "BURLEIGH",
    cadence: "MONTHLY",
    shift: "ANY",
    items: [
      { label: "Pull pastry benches and fridges out, clean behind and underneath" },
      { label: "Deep clean takeaway cold floor" },
      { label: "Gumption all sinks" },
      { label: "Deep clean pastry room" },
      { label: "Clean outdoor cool room" },
      { label: "Clean all green containers" },
      { label: "Scrub larder thoroughly" },
      { label: "Clean inside canopy" },
      { label: "Clean pastry hand wash sink and step" },
      { label: "Clean cold room floor" },
      { label: "Clean dry storage area and smoker" },
      { label: "Deep clean market cool room" },
      { label: "Clean market cook line and fridges" },
      { label: "Clean all fridge filters" },
      { label: "Clean KP wall above dishwasher" },
      { label: "Deep clean walk-in cool room" },
      { label: "Clean plate shelves" },
      { label: "Clean KP shelves" },
      { label: "Deep clean pastry corner" },
      { label: "Clean chemical shed" },
      { label: "Clean all fans" },
    ],
  },

  // ─── BEACH HOUSE — CAFE ──────────────────────────────────────────────────
  {
    name: "Cafe — Opening",
    area: "Cafe",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "OPEN",
    dueByHour: 9,
    items: [
      { label: "Leaf blow astroturf" },
      { label: "Set up all tables and chairs" },
      { label: "Sanitise all tables" },
      { label: "Put out all sugar pots" },
      { label: "Take out market sign (if market is open)" },
      { label: "Set up water station with cups" },
      { label: "Turn on music and all lights" },
      { label: "Set up pastry cabinet — tongs and retail bread" },
      { label: "Set up till stations with menus out" },
      { label: "Polish cutlery and stock under till" },
      { label: "Prepare pastry boxes" },
      { label: "Check and restock all three bathrooms" },
      { label: "Restock packaging under till" },
      { label: "Weekend: set up pass with sauces, fruit and kids cookies" },
    ],
  },
  {
    name: "Cafe — Closing",
    area: "Cafe",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Restock mini fridge with water" },
      { label: "Top up all cupboard stock" },
      { label: "Clean pastry stands, marble and glass" },
      { label: "Reset pastry cabinet" },
      { label: "Bring in water cups" },
      { label: "Wipe down pass area" },
      { label: "Weekend: refill pass sauces and return to fridge" },
      { label: "Send leftover croissants to pastry room" },
      { label: "2:30pm — Bring in all sugar pots" },
      { label: "2:30pm — Start bringing in round tables and chairs" },
      { label: "2:45pm — Put all pastry in boxes for half price (Sat/Sun take to restaurant)" },
      { label: "3:00pm — Put all umbrellas down" },
      { label: "Cling wrap, date and store leftover bread in walk-in fridge" },
      { label: "Lock side gate and market door" },
      { label: "Turn off music" },
      { label: "Put all devices on charge" },
    ],
  },
  {
    name: "Cafe — Daily Clean",
    area: "Cafe",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "ANY",
    dueByHour: 16,
    items: [
      { label: "Sanitise all tables and chairs (AM and PM)" },
      { label: "Leaf blow astroturf" },
      { label: "Refill all sugar pots" },
      { label: "Top up all three bathrooms" },
      { label: "Clean water station" },
      { label: "Clean pastry stands and marble" },
      { label: "Clean pastry cabinet glass" },
      { label: "Clean underneath till" },
      { label: "Wipe down pass area" },
      { label: "Refresh menus" },
    ],
  },
  {
    name: "Cafe — Weekly Clean",
    area: "Cafe",
    venue: "BEACH_HOUSE",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Remove sand from table legs" },
      { label: "Gumption under pass" },
      { label: "Deep clean pass cabinet" },
      { label: "Wipe inside walls and skirting" },
      { label: "Clean all glass doors" },
      { label: "Clean blue walls" },
      { label: "Clean stair railing" },
      { label: "Organise storeroom and hallway" },
      { label: "Deep clean outdoor tables" },
      { label: "Clean food warmer above pass" },
      { label: "Deep clean white chairs" },
    ],
  },
  {
    name: "Cafe — Monthly Tasks",
    area: "Cafe",
    venue: "BEACH_HOUSE",
    cadence: "MONTHLY",
    shift: "ANY",
    items: [
      { label: "Tighten screws on all round tables" },
      { label: "Gumption and wash sugar pots" },
      { label: "Gumption plates and crockery" },
      { label: "Rake leaves on beach" },
      { label: "Sanitise staff table" },
      { label: "Clean bathroom hallway" },
      { label: "Deep clean highchairs" },
      { label: "Clean all lightbulbs" },
      { label: "Deep clean till fridge" },
      { label: "Clean retail shelf above till" },
      { label: "Clean back storage area" },
      { label: "Deep clean market fridge and freezer" },
      { label: "Gumption pot plants" },
      { label: "Weeding and gardening" },
      { label: "Polish Brasso sign" },
      { label: "Clean tin roof and railings" },
    ],
  },

  // ─── BEACH HOUSE — RESTAURANT ────────────────────────────────────────────
  {
    name: "Restaurant — Opening",
    area: "Restaurant",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "OPEN",
    dueByHour: 11,
    items: [
      { label: "Open up balcony and bathroom door" },
      { label: "Take all chairs off tables" },
      { label: "Sanitise all tables" },
      { label: "Complete all table settings" },
      { label: "Open all windows" },
      { label: "Light all candles" },
      { label: "Set up front door — candles, brass sign, market sign" },
      { label: "Turn on music and all lights (switch near bar)" },
      { label: "Set up pastry cabinet — tongs, boxes, plates" },
      { label: "Set up pass — sauces, chopping board, fruit, heat light on, chux, kids cookies" },
      { label: "Fill all water jugs" },
      { label: "Set up POS and EFTPOS station" },
      { label: "Allocate reservations" },
      { label: "Polish cutlery" },
      { label: "Prepare pastry boxes" },
      { label: "Check and restock bathrooms" },
      { label: "Check '86' list on whiteboard and amend" },
      { label: "Restock packaging next to pastries and pass" },
    ],
  },
  {
    name: "Restaurant — Closing",
    area: "Restaurant",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Clean pastry stands, marble and cloches" },
      { label: "2:30pm — Put pastries in boxes and take to cafe (weekends keep upstairs)" },
      { label: "Send leftover croissants to pastry room" },
      { label: "Inside: put all settings on edge of tables" },
      { label: "Outside: remove all settings from tables" },
      { label: "Refill all pass sauces and return to fridge" },
      { label: "Wipe down pass area" },
      { label: "Empty all water jugs and stack neatly" },
      { label: "Blow out all candles — bring inside with signs" },
      { label: "Polish enough cutlery for next day's setup" },
      { label: "3:00pm — Start putting up chairs" },
      { label: "Bring down balcony shades and awnings" },
      { label: "Lock all windows, front door and balcony door" },
      { label: "Turn off music" },
      { label: "Put all iPads and EFTPOS on charge" },
    ],
  },
  {
    name: "Restaurant — Daily Clean",
    area: "Restaurant",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "ANY",
    dueByHour: 16,
    items: [
      { label: "Sanitise all tables (AM and PM)" },
      { label: "Clean pastry stands and marble" },
      { label: "Wipe down drink menus" },
      { label: "Glass clean cloches" },
      { label: "Refill all sugar pots" },
      { label: "Top up bathrooms" },
      { label: "Refill salt and pepper pots" },
      { label: "Sanitise pass area" },
      { label: "Clean water station" },
      { label: "Refresh menus" },
    ],
  },
  {
    name: "Restaurant — Weekly Clean",
    area: "Restaurant",
    venue: "BEACH_HOUSE",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Rotate fruit displays" },
      { label: "Refresh display table" },
      { label: "Water all plants" },
      { label: "Deep clean pass cabinet" },
      { label: "Clean mirror" },
      { label: "Clean display shelf behind bar" },
      { label: "Clean all glass windows" },
      { label: "Deep clean all candle holders" },
      { label: "Organise storeroom and hallway" },
      { label: "Clean front door area including mats" },
    ],
  },
  {
    name: "Restaurant — Monthly Tasks",
    area: "Restaurant",
    venue: "BEACH_HOUSE",
    cadence: "MONTHLY",
    shift: "ANY",
    items: [
      { label: "Gumption skirting" },
      { label: "Gumption white walls" },
      { label: "Gumption and wash sugar pots" },
      { label: "Gumption plates and crockery" },
      { label: "Clean Hideout — walls, display, dust all surfaces" },
      { label: "Clean balcony railings" },
      { label: "Clean all window ledges" },
      { label: "Deep clean highchairs" },
      { label: "Polish Brasso sign and menus" },
      { label: "Gumption water jugs" },
      { label: "Clean front of coffee machine" },
      { label: "Reorganise pass area" },
      { label: "Deep clean all bifold doors" },
      { label: "Clean all light fixtures" },
      { label: "Deep clean chairs" },
      { label: "Clean all table legs" },
      { label: "Polish all glassware" },
      { label: "Clean beer lines" },
      { label: "Gumption pot plants" },
      { label: "Deep clean booth seating" },
      { label: "Deep clean bathroom hallway" },
      { label: "Dust all picture frames" },
    ],
  },

  // ─── BEACH HOUSE — PASTRY (HACCP) ────────────────────────────────────────
  {
    name: "Pastry — Temperature Check",
    area: "Pastry",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "ANY",
    isFoodSafety: true,
    dueByHour: 14,
    items: [
      {
        label: "Strawberry Tarte — temperature check",
        instructions: "Use clean sanitised probe thermometer. Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
      {
        label: "Blueberry Tarte — temperature check",
        instructions: "Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
      {
        label: "Raspberry Tarte — temperature check",
        instructions: "Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
      {
        label: "Rhubarb Tarte — temperature check",
        instructions: "Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
      {
        label: "Passionfruit Tarte — temperature check",
        instructions: "Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
      {
        label: "Vanilla Crueller — temperature check",
        instructions: "Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
      {
        label: "Ricotta Cheesecake — temperature check",
        instructions: "Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
      {
        label: "Blueberry Muffin — temperature check",
        instructions: "Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
      {
        label: "Almond Croissant — temperature check",
        instructions: "Cold foods ≤5°C. If out of range, discard and note quantity.",
        requireTemp: true,
        requireNote: true,
      },
    ],
  },
]

async function main() {
  const client = await pool.connect()
  let created = 0
  let skipped = 0

  try {
    for (const t of TEMPLATES) {
      // Check if already exists
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
            (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
           RETURNING id`,
          [t.name, t.area, t.venue, t.cadence, t.shift, t.isFoodSafety ?? false, t.dueByHour ?? null]
        )
        const templateId = tRow.rows[0].id

        for (let i = 0; i < t.items.length; i++) {
          const item = t.items[i]
          await client.query(
            `INSERT INTO "ChecklistTemplateItem"
              (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "createdAt", "updatedAt")
             VALUES
              (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
            [
              templateId,
              i,
              item.label,
              item.instructions ?? null,
              item.requireTemp ?? false,
              item.requireNote ?? false,
            ]
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
