/**
 * Seed GCCC-compliant food safety checklist templates.
 * Covers Queensland Food Standards Code (Standard 3.2.2) requirements:
 *   - Temperature monitoring (cold ≤5°C, hot holding ≥60°C)
 *   - Delivery temperature records
 *   - Cooling records
 *   - Pest activity log
 *   - Date labelling check
 *
 * Run via: docker compose run --rm -v $(pwd)/scripts:/app/scripts migrate npx tsx scripts/seed-food-safety.ts
 * Safe to re-run — skips templates whose name already exists for that venue.
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

const TEMPLATES: Template[] = [
  // ─── BURLEIGH — AM TEMPERATURE CHECK ─────────────────────────────────────
  {
    name: "Temperature Check — AM",
    area: "Food Safety",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: true,
    dueByHour: 10,
    items: [
      {
        label: "Walk-in cool room — temperature check",
        instructions: "Use calibrated probe or wall thermometer. Must be ≤5°C. If above range, remove affected products, note quantity discarded.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Dairy/cream fridge — temperature check",
        instructions: "Must be ≤5°C. Check shelf temp near door (warmest point).",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Pastry display cabinet — temperature check",
        instructions: "Must be ≤5°C. Check at product level. If above range, move cold items to fridge and note.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Prep/ingredient fridge — temperature check",
        instructions: "Must be ≤5°C.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Pie warmer / food warmer — temperature check",
        instructions: "Must be ≥60°C before loading food. If below range, do not place food until warmer reaches temp. Note any issues.",
        requireTemp: true,
        requireNote: true,
        hotCheck: true,
      },
    ],
  },

  // ─── BURLEIGH — PM TEMPERATURE CHECK ─────────────────────────────────────
  {
    name: "Temperature Check — PM",
    area: "Food Safety",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "MID",
    isFoodSafety: true,
    dueByHour: 15,
    items: [
      {
        label: "Walk-in cool room — temperature check",
        instructions: "Must be ≤5°C. If above range, remove affected products, note quantity discarded.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Dairy/cream fridge — temperature check",
        instructions: "Must be ≤5°C.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Pastry display cabinet — temperature check",
        instructions: "Must be ≤5°C. Check at product level.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Pie warmer / food warmer — temperature check",
        instructions: "Must be ≥60°C. Food held below 60°C for more than 2 hours must be discarded.",
        requireTemp: true,
        requireNote: true,
        hotCheck: true,
      },
    ],
  },

  // ─── BURLEIGH — DELIVERY CHECK ────────────────────────────────────────────
  {
    name: "Delivery Temperature Check",
    area: "Food Safety",
    venue: "BURLEIGH",
    cadence: "ON_DEMAND",
    shift: "ANY",
    isFoodSafety: true,
    items: [
      {
        label: "Refrigerated delivery — temperature on arrival",
        instructions: "Check temp on arrival with probe thermometer. Refrigerated goods must be ≤5°C. Reject or quarantine if above 8°C. Record supplier and product.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Frozen delivery — temperature on arrival",
        instructions: "Frozen goods must arrive solid (≤-15°C). Reject if partially thawed. Record supplier and product.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Dry goods delivery — check for damage, pests, use-by dates",
        instructions: "Inspect packaging for damage, signs of pests, or expired dates. Reject any compromised stock.",
        requireNote: true,
      },
      {
        label: "Products stored promptly in correct location",
        instructions: "Refrigerated goods in fridge within 15 minutes. Frozen goods in freezer immediately. FIFO rotation applied.",
      },
    ],
  },

  // ─── BURLEIGH — COOLING LOG ───────────────────────────────────────────────
  {
    name: "Cooling Log",
    area: "Food Safety",
    venue: "BURLEIGH",
    cadence: "ON_DEMAND",
    shift: "ANY",
    isFoodSafety: true,
    items: [
      {
        label: "Product — temperature at start of cooling",
        instructions: "Record initial temperature when removed from heat (should be ≥60°C). Note product name in the note field.",
        requireTemp: true,
        requireNote: true,
        hotCheck: true,
      },
      {
        label: "Product — temperature at 2 hours",
        instructions: "Must reach ≤21°C within 2 hours. If not achieved, discard. Note product.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Product — temperature at 4 hours (final)",
        instructions: "Must reach ≤5°C within 4 hours total (from start). If not achieved, discard. Note product.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
    ],
  },

  // ─── BURLEIGH — PEST ACTIVITY LOG ────────────────────────────────────────
  {
    name: "Pest Activity Log",
    area: "Food Safety",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: false,
    dueByHour: 10,
    items: [
      {
        label: "No evidence of pests in food preparation areas",
        instructions: "Check for droppings, gnaw marks, nesting material. Check under equipment and in corners.",
        requireNote: true,
      },
      {
        label: "No evidence of pests in storage areas",
        instructions: "Inspect dry store, cool room and any bags/boxes stored near floor.",
        requireNote: true,
      },
      {
        label: "Fly screens and pest proofing intact",
        instructions: "Check door seals, screens, and gaps around pipes.",
        requireNote: true,
      },
      {
        label: "Bait stations checked — no evidence of activity",
        instructions: "Inspect all bait stations. If activity noted, contact pest controller and record in note.",
        requireNote: true,
      },
    ],
  },

  // ─── BURLEIGH — DATE LABELLING CHECK ─────────────────────────────────────
  {
    name: "Date Labelling & Stock Rotation Check",
    area: "Food Safety",
    venue: "BURLEIGH",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: false,
    dueByHour: 10,
    items: [
      {
        label: "All items in cool room have date labels and are within use-by",
        instructions: "Check every container. Items without labels must be labelled immediately or discarded. FIFO applied.",
        requireNote: true,
      },
      {
        label: "All items in prep fridge have date labels and are within use-by",
        requireNote: true,
      },
      {
        label: "All items in display cabinet are within date and correctly labelled",
        requireNote: true,
      },
      {
        label: "Expired or unlabelled items removed and discarded",
        instructions: "Note any items discarded and approximate quantity.",
        requireNote: true,
      },
    ],
  },

  // ─── TEA GARDEN — TEMPERATURE CHECK ──────────────────────────────────────
  {
    name: "Temperature Check — AM",
    area: "Food Safety",
    venue: "TEA_GARDEN",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: true,
    dueByHour: 10,
    items: [
      {
        label: "Milk/dairy fridge — temperature check",
        instructions: "Must be ≤5°C. If above range, note and move affected products.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Cake/pastry display — temperature check",
        instructions: "Must be ≤5°C. Check at product level.",
        requireTemp: true,
        requireNote: true,
        hotCheck: false,
      },
      {
        label: "Food warmer — temperature check (if in use)",
        instructions: "Must be ≥60°C before loading food. Skip if warmer not used today — note 'N/A'.",
        requireTemp: true,
        requireNote: true,
        hotCheck: true,
      },
    ],
  },

  // ─── TEA GARDEN — PEST ACTIVITY LOG ──────────────────────────────────────
  {
    name: "Pest Activity Log",
    area: "Food Safety",
    venue: "TEA_GARDEN",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: false,
    dueByHour: 10,
    items: [
      {
        label: "No evidence of pests in food preparation and storage areas",
        instructions: "Check for droppings, gnaw marks, nesting. Check under equipment and in corners.",
        requireNote: true,
      },
      {
        label: "Pest proofing intact — screens, door seals, gaps",
        requireNote: true,
      },
    ],
  },

  // ─── TEA GARDEN — DATE LABELLING ─────────────────────────────────────────
  {
    name: "Date Labelling & Stock Rotation Check",
    area: "Food Safety",
    venue: "TEA_GARDEN",
    cadence: "DAILY",
    shift: "OPEN",
    isFoodSafety: false,
    dueByHour: 10,
    items: [
      {
        label: "All items in fridge have date labels and are within use-by",
        instructions: "FIFO applied. Items without labels discarded or labelled immediately.",
        requireNote: true,
      },
      {
        label: "Display cabinet items within date and correctly labelled",
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
            (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive", "alertEmails", "createdAt", "updatedAt")
           VALUES
            (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, true, '{}', NOW(), NOW())
           RETURNING id`,
          [t.name, t.area, t.venue, t.cadence, t.shift, t.isFoodSafety ?? false, t.dueByHour ?? null]
        )
        const templateId = tRow.rows[0].id

        for (let i = 0; i < t.items.length; i++) {
          const item = t.items[i]
          await client.query(
            `INSERT INTO "ChecklistTemplateItem"
              (id, "templateId", "sortOrder", label, instructions, "requireTemp", "requireNote", "hotCheck", "createdAt", "updatedAt")
             VALUES
              (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
            [
              templateId,
              i,
              item.label,
              item.instructions ?? null,
              item.requireTemp ?? false,
              item.requireNote ?? false,
              item.hotCheck ?? false,
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
