/**
 * Seed the Burleigh "Takeaway — Weekly Deep Clean" checklist, requested by
 * the takeaway team (via Chloe, 2026-08-04): scrub trolley, wipe out milk
 * fridge, clean top of machine, etc.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-takeaway-weekly.ts
 *
 * Safe to re-run — skips if a template with this name already exists for
 * the venue. Alert emails match the other Burleigh weekly templates.
 */
import "dotenv/config"
import { Pool } from "pg"

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

const TEMPLATE = {
  name: "Takeaway — Weekly Deep Clean",
  area: "Takeaway",
  venue: "BURLEIGH",
  cadence: "WEEKLY",
  shift: "ANY",
  alertEmails: ["chloe@tarte.com.au", "shawna@tarte.com.au"],
  items: [
    { label: "Scrub trolley" },
    { label: "Wipe out milk fridge", instructions: "Empty it first, wipe shelves and door seals with hot soapy water, check dates while restocking." },
    { label: "Clean top of machine" },
    { label: "Deep clean glass display inside and out", instructions: "Trays and runners out, wash and dry before restacking." },
    { label: "Pull out milk fridge and clean behind and underneath" },
    { label: "Sanitise and reorganise shelves" },
    { label: "Clean skirting" },
    { label: "Spot clean walls and tiles" },
  ],
}

async function main() {
  const client = await pool.connect()
  try {
    const exists = await client.query(
      `SELECT id FROM "ChecklistTemplate" WHERE name = $1 AND venue = $2`,
      [TEMPLATE.name, TEMPLATE.venue]
    )
    if (exists.rows.length > 0) {
      console.log(`  SKIP  ${TEMPLATE.venue} / ${TEMPLATE.name} — already exists`)
      return
    }

    await client.query("BEGIN")
    try {
      const tRow = await client.query(
        `INSERT INTO "ChecklistTemplate"
          (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "alertEmails", "isActive", "createdAt", "updatedAt")
         VALUES
          (gen_random_uuid()::text, $1, $2, $3, $4, $5, false, null, $6, true, NOW(), NOW())
         RETURNING id`,
        [TEMPLATE.name, TEMPLATE.area, TEMPLATE.venue, TEMPLATE.cadence, TEMPLATE.shift, TEMPLATE.alertEmails]
      )
      const templateId = tRow.rows[0].id

      for (let i = 0; i < TEMPLATE.items.length; i++) {
        const item = TEMPLATE.items[i]
        await client.query(
          `INSERT INTO "ChecklistTemplateItem"
            (id, "templateId", "sortOrder", label, instructions, "createdAt", "updatedAt")
           VALUES
            (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())`,
          [templateId, i, item.label, (item as { instructions?: string }).instructions ?? null]
        )
      }

      await client.query("COMMIT")
      console.log(`  CREATE ${TEMPLATE.venue} / ${TEMPLATE.name} (${TEMPLATE.items.length} items)`)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
