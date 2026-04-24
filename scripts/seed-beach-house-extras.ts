/**
 * Fill the gaps in Beach House's checklist coverage + align the Burleigh
 * temperature check with the paper sheet Tarte actually uses.
 *
 * Safe to re-run: template-level guard by (name, venue), item-level guard by
 * (templateId, label).
 *
 * Adds:
 *   - Missing fridges to existing Burleigh Temperature Check — AM / PM
 *     (Service fridge, Grill fridge, Pastry freezer — from the paper sheet)
 *   - Beach House Temperature Check — AM / PM (8-point sheet)
 *   - Beach House Pest Activity Log
 *   - Beach House Date Labelling & Stock Rotation Check
 *   - Beach House Delivery Temperature Check
 *   - Beach House "Currumbin Market — Daily Clean" (24 tasks from the FOH
 *     cleaning procedures doc; stored under area="Market")
 *
 * Run via:
 *   docker compose run --rm --build --profile tools migrate \
 *     npx tsx /workspace/scripts/seed-beach-house-extras.ts
 * or from the host inside the droplet:
 *   cd /root/tarte-kitchen && docker compose exec app npx tsx scripts/seed-beach-house-extras.ts
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
  hotCheck?: boolean
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

// ────────────────────────────────────────────────────────────────────────────
// Beach House food safety templates — mirror Burleigh structure + paper-sheet
// fridge list.
// ────────────────────────────────────────────────────────────────────────────

const BEACH_HOUSE_TEMP_AM_ITEMS: Item[] = [
  { label: "Service fridge — temperature check", instructions: "Must be ≤5°C. Check at product level.", requireTemp: true, requireNote: true },
  { label: "Grill fridge — temperature check", instructions: "Must be ≤5°C. Check at product level.", requireTemp: true, requireNote: true },
  { label: "Pastry fridge — temperature check", instructions: "Must be ≤5°C. Check at product level.", requireTemp: true, requireNote: true },
  { label: "Pastry freezer — temperature check", instructions: "Must be ≤-18°C.", requireTemp: true, requireNote: true },
  { label: "Walk-in — temperature check", instructions: "Must be ≤5°C. Check door seal and remove any spills.", requireTemp: true, requireNote: true },
  { label: "Coolroom — temperature check", instructions: "Must be ≤5°C.", requireTemp: true, requireNote: true },
  { label: "Kitchen freezer — temperature check", instructions: "Must be ≤-18°C.", requireTemp: true, requireNote: true },
  { label: "Milk fridge — temperature check", instructions: "Must be ≤5°C.", requireTemp: true, requireNote: true },
]

const BEACH_HOUSE_TEMPLATES: Template[] = [
  {
    name: "Temperature Check — AM",
    area: "Food Safety",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: true,
    dueByHour: 10,
    items: BEACH_HOUSE_TEMP_AM_ITEMS,
  },
  {
    name: "Temperature Check — PM",
    area: "Food Safety",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "MID",
    isFoodSafety: true,
    dueByHour: 15,
    items: BEACH_HOUSE_TEMP_AM_ITEMS,
  },
  {
    name: "Pest Activity Log",
    area: "Food Safety",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: true,
    dueByHour: 10,
    items: [
      { label: "No evidence of pests in food preparation areas", instructions: "Check for droppings, gnaw marks, nesting material. Check under equipment and in corners.", requireNote: true },
      { label: "No evidence of pests in storage areas", instructions: "Inspect dry store, cool room and any bags/boxes stored near floor.", requireNote: true },
      { label: "Fly screens and pest proofing intact", instructions: "Check door seals, screens, and gaps around pipes.", requireNote: true },
      { label: "Bait stations checked — no evidence of activity", instructions: "Inspect all bait stations. If activity noted, contact pest controller and record in note.", requireNote: true },
    ],
  },
  {
    name: "Date Labelling & Stock Rotation Check",
    area: "Food Safety",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: true,
    dueByHour: 10,
    items: [
      { label: "All items in cool room have date labels and are within use-by", instructions: "Check every container. Items without labels must be labelled immediately or discarded. FIFO applied.", requireNote: true },
      { label: "All items in prep fridge have date labels and are within use-by", requireNote: true },
      { label: "All items in pastry fridge/cabinet are within date and correctly labelled", requireNote: true },
      { label: "All items in freezer have date labels and are within use-by", requireNote: true },
    ],
  },
  {
    name: "Delivery Temperature Check",
    area: "Food Safety",
    venue: "BEACH_HOUSE",
    cadence: "ON_DEMAND",
    shift: "ANY",
    isFoodSafety: true,
    items: [
      { label: "Refrigerated delivery — temperature on arrival", instructions: "Check temp on arrival with probe thermometer. Refrigerated goods must be ≤5°C. Reject or quarantine if above 8°C. Record supplier and product.", requireTemp: true, requireNote: true },
      { label: "Frozen delivery — temperature on arrival", instructions: "Frozen goods must arrive solid (≤-15°C). Reject if partially thawed. Record supplier and product.", requireTemp: true, requireNote: true },
      { label: "Dry goods delivery — check for damage, pests, use-by dates", instructions: "Inspect packaging for damage, signs of pests, or expired dates. Reject any compromised stock.", requireNote: true },
      { label: "Products stored promptly in correct location", instructions: "Refrigerated goods in fridge within 15 minutes. Frozen goods in freezer immediately. FIFO rotation applied." },
    ],
  },

  // ─── Currumbin Market FOH cleaning — sits under BEACH_HOUSE, area="Market"
  {
    name: "Currumbin Market — Daily Clean",
    area: "Market",
    venue: "BEACH_HOUSE",
    cadence: "DAILY",
    shift: "ANY",
    isFoodSafety: false,
    dueByHour: 16,
    items: [
      { label: "Straw holder — glass cleaner + paper towel" },
      { label: "Pass / display marble — sanitise with chux (all day)" },
      { label: "Rotate fruit display — 3× per week", instructions: "Rotate ripe fruit from displays with fresh." },
      { label: "Stainless benches — hot water, scrub, sanitise" },
      { label: "Fridge doors in/out — hot water, scrub, sanitise" },
      { label: "Inside drawers lip — sanitise with chux" },
      { label: "Juice jugs — hot water, soap, scrub with scourer (weekly)" },
      { label: "Blender jugs / lid — hot water, soap, scrub with scourer" },
      { label: "Blender jug cover — hot water, soap, scrub with scourer" },
      { label: "Blender base — sanitise with chux" },
      { label: "Change fruit banes — move current fruit into clean new bane" },
      { label: "Change garnish banes — move fruit into clean bane w/ new chux" },
      { label: "Deep clean acai fridge (weekly)", instructions: "Take out everything and hot soapy water / sanitise." },
      { label: "Deep clean alcohol fridge (weekly)", instructions: "Take out everything and hot soapy water / sanitise." },
      { label: "Deep clean fruit fridge (weekly)", instructions: "Take out everything and hot soapy water / sanitise." },
      { label: "Wipe walls behind equipment — hot water, scrub, sanitise" },
      { label: "Juicer (all parts inc. chute) — hot water, soap, scrub with scourer" },
      { label: "Change squeeze bottles (when required)", instructions: "When using fresh product e.g. ginger, choc syrup." },
      { label: "Squeeze bottles + tubs — sanitise with chux" },
      { label: "Utensils — wash knives, spatulas, chopping boards etc. (all day)" },
      { label: "Long chopping board — hot soapy water scrub and hose down" },
      { label: "Containers — take out glasses, cups etc. and wash tub out" },
      { label: "Label, date + initial all stock accurately; inform manager when stock is low" },
      { label: "Wash bins inside and out", instructions: "Take bins outside or to wash bay. Scrub inside and out with hot soapy water and sanitiser. Allow to dry before re-lining." },
    ],
  },
]

// ────────────────────────────────────────────────────────────────────────────
// Item-level additions to templates that already exist (template-level seed
// is idempotent so we can't rely on it to mutate existing templates).
// ────────────────────────────────────────────────────────────────────────────

interface ItemAddition {
  venue: Venue
  templateName: string
  items: Item[]
}

const ITEM_ADDITIONS: ItemAddition[] = [
  {
    venue: "BURLEIGH",
    templateName: "Temperature Check — AM",
    items: [
      { label: "Service fridge — temperature check", instructions: "Must be ≤5°C. Check at product level.", requireTemp: true, requireNote: true },
      { label: "Grill fridge — temperature check", instructions: "Must be ≤5°C. Check at product level.", requireTemp: true, requireNote: true },
      { label: "Pastry freezer — temperature check", instructions: "Must be ≤-18°C.", requireTemp: true, requireNote: true },
    ],
  },
  {
    venue: "BURLEIGH",
    templateName: "Temperature Check — PM",
    items: [
      { label: "Service fridge — temperature check", instructions: "Must be ≤5°C.", requireTemp: true, requireNote: true },
      { label: "Grill fridge — temperature check", instructions: "Must be ≤5°C.", requireTemp: true, requireNote: true },
      { label: "Pastry freezer — temperature check", instructions: "Must be ≤-18°C.", requireTemp: true, requireNote: true },
    ],
  },
]

// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect()
  let createdTemplates = 0
  let skippedTemplates = 0
  let createdItems = 0
  let skippedItems = 0

  try {
    // Phase 1 — new templates
    for (const t of BEACH_HOUSE_TEMPLATES) {
      const exists = await client.query(
        `SELECT id FROM "ChecklistTemplate" WHERE name = $1 AND venue = $2`,
        [t.name, t.venue]
      )
      if (exists.rows.length > 0) {
        console.log(`  SKIP template   ${t.venue} / ${t.name}`)
        skippedTemplates++
        continue
      }

      await client.query("BEGIN")
      try {
        const tRow = await client.query(
          `INSERT INTO "ChecklistTemplate"
            (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "alertEmails", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, true, '{}', NOW(), NOW())
           RETURNING id`,
          [t.name, t.area, t.venue, t.cadence, t.shift, t.isFoodSafety ?? false, t.dueByHour ?? null]
        )
        const templateId = tRow.rows[0].id

        for (let i = 0; i < t.items.length; i++) {
          const item = t.items[i]
          await client.query(
            `INSERT INTO "ChecklistTemplateItem"
              (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
            [templateId, i, item.label, item.instructions ?? null, item.requireTemp ?? false, item.requireNote ?? false, item.hotCheck ?? false]
          )
        }
        await client.query("COMMIT")
        console.log(`  CREATE template ${t.venue} / ${t.name} (${t.items.length} items)`)
        createdTemplates++
      } catch (e) {
        await client.query("ROLLBACK")
        throw e
      }
    }

    // Phase 2 — item-level additions to existing templates
    for (const add of ITEM_ADDITIONS) {
      const tRow = await client.query(
        `SELECT id FROM "ChecklistTemplate" WHERE name = $1 AND venue = $2 AND "isActive" = true`,
        [add.templateName, add.venue]
      )
      if (tRow.rows.length === 0) {
        console.log(`  WARN: template not found — ${add.venue} / ${add.templateName}`)
        continue
      }
      const templateId = tRow.rows[0].id

      for (const item of add.items) {
        const exists = await client.query(
          `SELECT id FROM "ChecklistTemplateItem" WHERE "templateId" = $1 AND label = $2`,
          [templateId, item.label]
        )
        if (exists.rows.length > 0) {
          console.log(`  SKIP item       ${add.venue} / ${add.templateName} / ${item.label}`)
          skippedItems++
          continue
        }
        const nextOrder = await client.query(
          `SELECT COALESCE(MAX("sortOrder"), -1) + 1 AS n FROM "ChecklistTemplateItem" WHERE "templateId" = $1`,
          [templateId]
        )
        await client.query(
          `INSERT INTO "ChecklistTemplateItem"
            (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          [templateId, nextOrder.rows[0].n, item.label, item.instructions ?? null, item.requireTemp ?? false, item.requireNote ?? false, item.hotCheck ?? false]
        )
        console.log(`  CREATE item     ${add.venue} / ${add.templateName} / ${item.label}`)
        createdItems++
      }
    }
  } finally {
    client.release()
    await pool.end()
  }

  console.log(
    `\nDone — ${createdTemplates} templates created (${skippedTemplates} skipped), ${createdItems} items created (${skippedItems} skipped)`
  )
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e)
  process.exit(1)
})
