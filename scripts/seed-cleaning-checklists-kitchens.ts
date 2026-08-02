/**
 * Seed BOH kitchen cleaning checklists for Beach House (Currumbin) —
 * Restaurant Kitchen + Cafe Kitchen — and add a weekly dishwasher-descale
 * item to Burleigh's existing "KP — Weekly Deep Clean" template.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-cleaning-checklists-kitchens.ts
 *
 * Safe to re-run — skips any template whose name already exists for that
 * venue, and skips the Burleigh descale item if one is already present.
 *
 * Note: floors at Currumbin are deep-cleaned by an external contractor, so
 * these lists only cover a daily sweep/spot-mop — no weekly/monthly floor
 * scrub items for Beach House.
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
  // ─── BEACH HOUSE — RESTAURANT KITCHEN ────────────────────────────────────
  {
    name: "Restaurant Kitchen — Daily Clean",
    area: "Restaurant Kitchen",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Scrape and degrease grill; empty grease trays" },
      { label: "Clean burners, trivets and cooktop; wipe stove front and knobs" },
      { label: "Wipe down oven doors and exterior" },
      { label: "Filter fryer oil; wipe down fryer exterior", instructions: "Skim throughout service. At close, filter oil and check quality — change if dark or foaming. Skip if fryer not in use." },
      { label: "Wipe splashbacks and walls behind cookline", instructions: "Hot soapy water then sanitiser on all wall areas behind and beside cooking equipment." },
      { label: "Wipe down exhaust canopy exterior" },
      { label: "Sanitise all benches and prep surfaces" },
      { label: "Wash and sanitise chopping boards" },
      { label: "Clean and sanitise sinks and taps; clear drains" },
      { label: "Clean dishwasher — drain, remove and rinse filters, wipe inside and out" },
      { label: "Empty and reline all bins; wipe lids" },
      { label: "Wipe fridge and cool room door handles and seals" },
      { label: "Cling wrap, label and date all food; store correctly" },
      { label: "Sweep floors and spot-mop spills", instructions: "Sweep and spot-mop only — full floor scrub is done by the external cleaning company." },
    ],
  },
  {
    name: "Restaurant Kitchen — Weekly Deep Clean",
    area: "Restaurant Kitchen",
    venue: "BEACH_HOUSE",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Deep clean grill — empty completely, degrease, scrub grates and burners underneath" },
      { label: "Remove burner grates and caps; soak in degreaser, scrub and refit" },
      { label: "Exhaust canopy — remove filters, soak in degreaser or run through dishwasher, refit", instructions: "Remove all canopy filters. Soak in hot water and degreaser (or dishwasher cycle), scrub, dry and refit." },
      { label: "Empty exhaust canopy grease cups and wipe out channels" },
      { label: "Degrease inside of exhaust canopy" },
      { label: "Run oven auto-clean cycle; wipe out residue and clean racks", instructions: "Start the self-clean cycle at close so it runs overnight. Next morning wipe out ash/residue and wash racks." },
      { label: "Descale dishwasher", instructions: "Run descaler through 2 cycles, then drain, rinse and refill." },
      { label: "Wash walls behind and around cookline — hot soapy water and sanitise" },
      { label: "Pull out cookline equipment; degrease behind and underneath" },
      { label: "Deep clean fridges — empty shelves, hot soapy water, sanitise; clean door seals" },
      { label: "Clean fridge condenser filters" },
      { label: "Clean and reorganise shelving; wipe storage containers" },
      { label: "Clear and flush floor drains" },
    ],
  },
  {
    name: "Restaurant Kitchen — Monthly Deep Clean",
    area: "Restaurant Kitchen",
    venue: "BEACH_HOUSE",
    cadence: "MONTHLY",
    shift: "ANY",
    items: [
      { label: "Deep clean cool room — rotate stock, clean shelves, walls and door seals" },
      { label: "Deep clean ovens — door glass, seals and interior" },
      { label: "Wash all walls top to bottom; spot-check for grease build-up" },
      { label: "Clean ceiling vents, fans and light fittings" },
      { label: "Deep clean dry store — empty shelves, wipe, restock and rotate" },
      { label: "Deep clean freezer — defrost if iced up, clean seals" },
      { label: "Descale taps and boiling water unit" },
      { label: "Clean behind and under all fridges" },
      { label: "Check exhaust ducting for grease build-up", instructions: "Visual check above the filters. Ducts and fan are professionally cleaned by contractor — flag to management if build-up is visible before the next scheduled service." },
    ],
  },

  // ─── BEACH HOUSE — CAFE KITCHEN ──────────────────────────────────────────
  {
    name: "Cafe Kitchen — Daily Clean",
    area: "Cafe Kitchen",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "CLOSE",
    dueByHour: 16,
    items: [
      { label: "Scrape and degrease grill; empty grease tray" },
      { label: "Clean burners and cooktop; wipe stove front and knobs" },
      { label: "Wipe down oven doors and exterior" },
      { label: "Wipe splashbacks and walls behind cookline", instructions: "Hot soapy water then sanitiser on all wall areas behind and beside cooking equipment." },
      { label: "Wipe down exhaust canopy exterior" },
      { label: "Empty and clean toaster and sandwich press crumb trays" },
      { label: "Sanitise all benches and prep surfaces" },
      { label: "Wash and sanitise chopping boards" },
      { label: "Clean and sanitise sinks and taps; clear drains" },
      { label: "Clean dishwasher — drain, remove and rinse filters, wipe inside and out" },
      { label: "Empty and reline all bins; wipe lids" },
      { label: "Cling wrap, label and date all food; store correctly" },
      { label: "Sweep floors and spot-mop spills", instructions: "Sweep and spot-mop only — full floor scrub is done by the external cleaning company." },
    ],
  },
  {
    name: "Cafe Kitchen — Weekly Deep Clean",
    area: "Cafe Kitchen",
    venue: "BEACH_HOUSE",
    cadence: "WEEKLY",
    shift: "ANY",
    items: [
      { label: "Deep clean grill — empty completely, degrease, scrub grates" },
      { label: "Remove burner grates and caps; soak in degreaser, scrub and refit" },
      { label: "Exhaust canopy — remove filters, soak in degreaser or run through dishwasher, refit", instructions: "Remove all canopy filters. Soak in hot water and degreaser (or dishwasher cycle), scrub, dry and refit." },
      { label: "Empty exhaust canopy grease cups and degrease inside of canopy" },
      { label: "Run oven auto-clean cycle; wipe out residue and clean racks", instructions: "Start the self-clean cycle at close so it runs overnight. Next morning wipe out ash/residue and wash racks." },
      { label: "Descale dishwasher", instructions: "Run descaler through 2 cycles, then drain, rinse and refill." },
      { label: "Wash walls behind and around cookline — hot soapy water and sanitise" },
      { label: "Pull out equipment; degrease behind and underneath" },
      { label: "Deep clean fridges — empty shelves, hot soapy water, sanitise; clean door seals" },
      { label: "Clean fridge condenser filters" },
      { label: "Clean and reorganise shelving; wipe storage containers" },
      { label: "Clear and flush floor drains" },
    ],
  },
]

/** Weekly descale item to append to Burleigh's existing KP weekly template. */
const BURLEIGH_DESCALE = {
  templateName: "KP — Weekly Deep Clean",
  venue: "BURLEIGH" as Venue,
  item: {
    label: "Descale dishwasher",
    instructions: "Run descaler through 2 cycles, then drain, rinse and refill.",
  },
}

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

    // ── Burleigh: add weekly dishwasher descale to existing KP template ──
    const tpl = await client.query(
      `SELECT id FROM "ChecklistTemplate" WHERE name = $1 AND venue = $2`,
      [BURLEIGH_DESCALE.templateName, BURLEIGH_DESCALE.venue]
    )
    if (tpl.rows.length === 0) {
      console.log(`  WARN  ${BURLEIGH_DESCALE.venue} / ${BURLEIGH_DESCALE.templateName} not found — descale item not added`)
    } else {
      const templateId = tpl.rows[0].id
      const dup = await client.query(
        `SELECT id FROM "ChecklistTemplateItem"
         WHERE "templateId" = $1 AND label ILIKE '%descale%dishwasher%'`,
        [templateId]
      )
      if (dup.rows.length > 0) {
        console.log(`  SKIP  Burleigh descale item already present`)
      } else {
        await client.query(
          `INSERT INTO "ChecklistTemplateItem"
            (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "createdAt", "updatedAt")
           SELECT gen_random_uuid()::text, $1,
                  COALESCE(MAX("sortOrder"), -1) + 1, $2, $3, false, false, NOW(), NOW()
           FROM "ChecklistTemplateItem" WHERE "templateId" = $1`,
          [templateId, BURLEIGH_DESCALE.item.label, BURLEIGH_DESCALE.item.instructions]
        )
        console.log(`  ADD   Burleigh / ${BURLEIGH_DESCALE.templateName} ← "${BURLEIGH_DESCALE.item.label}"`)
      }
    }
  } finally {
    client.release()
    await pool.end()
  }

  console.log(`\nDone — ${created} templates created, ${skipped} skipped`)
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e)
  process.exit(1)
})
