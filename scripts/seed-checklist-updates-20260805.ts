/**
 * Checklist additions from the Burleigh team's end-of-day procedures note
 * (via Chloe, 2026-08-05):
 *
 *  - Takeaway — Daily Clean: containers, powder top-ups, packaging restock
 *  - Takeaway — Weekly Deep Clean: bring in line with Barista — Weekly Deep
 *    Clean ("same as FOH barista option"), skipping items the takeaway list
 *    already covers in its own words
 *  - FOH — Daily Tasks: leftover croissants to pastry fridge (end of day),
 *    full restock, water the inside plant
 *  - FOH — Weekly Clean: deep clean under till area
 *  - FOH KP — Daily Close: pastry room floors + dough machine
 *  - KP — Daily Close: push built-up mop water down the outside drain
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-checklist-updates-20260805.ts
 *
 * Safe to re-run — skips any item whose label already exists (non-archived)
 * on the target template. Appends after the current max sortOrder.
 */
import "dotenv/config"
import { Pool } from "pg"

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

interface NewItem {
  label: string
  instructions?: string
}

interface TemplateUpdate {
  templateName: string
  venue: string
  items: NewItem[]
}

const UPDATES: TemplateUpdate[] = [
  {
    templateName: "Takeaway — Daily Clean",
    venue: "BURLEIGH",
    items: [
      { label: "Clean all containers" },
      {
        label: "Top up powders and chocolate sauce",
        instructions: "Chai, chocolate and matcha powders, plus chocolate sauce.",
      },
      {
        label: "Restock packaging and miscellaneous",
        instructions: "Handled bags, napkins, boxes, cups and anything else running low.",
      },
    ],
  },
  {
    // "Same as FOH barista option" — the barista weekly items not already
    // covered by the takeaway weekly list's existing wording.
    templateName: "Takeaway — Weekly Deep Clean",
    venue: "BURLEIGH",
    items: [
      { label: "Clean back wall behind bins" },
      { label: "Clean ice machine filters" },
      { label: "Clean coffee sign" },
      { label: "Sanitise and reorganise cupboards" },
      { label: "Descale Breville" },
      { label: "Clean out drain" },
      { label: "Gumption bench" },
      { label: "Soak and scrub milk jugs" },
      { label: "Deep clean knock box and bins" },
      { label: "Dust and polish brass ornaments" },
      { label: "Wash coffee storage containers" },
      { label: "Restock tea, powders and syrups" },
    ],
  },
  {
    templateName: "FOH — Daily Tasks",
    venue: "BURLEIGH",
    items: [
      {
        label: "Put leftover croissants in the pastry fridge",
        instructions: "End of day: move any unsold croissants into the pastry fridge.",
      },
      {
        label: "Full restock",
        instructions: "Packaging, bowls, waters, takeaway cutlery, napkins.",
      },
      { label: "Water the inside plant (1 cup)" },
    ],
  },
  {
    templateName: "FOH — Weekly Clean",
    venue: "BURLEIGH",
    items: [{ label: "Deep clean under till area" }],
  },
  {
    templateName: "FOH KP — Daily Close",
    venue: "BURLEIGH",
    items: [
      { label: "Clean pastry room floors" },
      { label: "Clean pastry room dough machine" },
    ],
  },
  {
    templateName: "KP — Daily Close",
    venue: "BURLEIGH",
    items: [
      {
        label: "Push built-up mop water down the outside drain",
        instructions:
          "Dirty water from floor cleaning pools near the outside plants. Squeegee it down the drain.",
      },
    ],
  },
]

async function main() {
  const client = await pool.connect()
  let added = 0
  let skipped = 0
  try {
    for (const u of UPDATES) {
      const tpl = await client.query(
        `SELECT id FROM "ChecklistTemplate" WHERE name = $1 AND venue = $2`,
        [u.templateName, u.venue]
      )
      if (tpl.rows.length === 0) {
        console.error(`  MISSING TEMPLATE  ${u.venue} / ${u.templateName}`)
        process.exitCode = 1
        continue
      }
      const templateId = tpl.rows[0].id

      const maxRow = await client.query(
        `SELECT COALESCE(MAX("sortOrder"), -1) AS max FROM "ChecklistTemplateItem" WHERE "templateId" = $1`,
        [templateId]
      )
      let sort = Number(maxRow.rows[0].max) + 1

      for (const item of u.items) {
        const exists = await client.query(
          `SELECT id FROM "ChecklistTemplateItem"
           WHERE "templateId" = $1 AND label = $2 AND archived = false`,
          [templateId, item.label]
        )
        if (exists.rows.length > 0) {
          console.log(`  SKIP  ${u.templateName} :: ${item.label}`)
          skipped++
          continue
        }
        await client.query(
          `INSERT INTO "ChecklistTemplateItem"
            (id, "templateId", "sortOrder", label, instructions, "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())`,
          [templateId, sort++, item.label, item.instructions ?? null]
        )
        console.log(`  ADD   ${u.templateName} :: ${item.label}`)
        added++
      }
    }
    console.log(`\nDone. ${added} added, ${skipped} skipped.`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
