/**
 * Council cleaning checklist updates requested by Chloe, 2026-07-21.
 *
 * - Chefs daily (Currumbin Restaurant Kitchen + new Burleigh Chefs list):
 *   pass bench / pass light top; light daily clean of sides + behind cookline.
 * - KP weekly: deep clean sides/behind cookline, walls, door seals;
 *   KP monthly: ceiling (Burleigh KP templates; Currumbin equivalents live on
 *   the Restaurant Kitchen weekly/monthly lists, tagged "(KP)").
 * - Cafe Kitchen (Currumbin) daily: grill fridge bin space + grease tubes;
 *   weekly fridge deep clean now covers the downstairs drawer fridges.
 * - Exhaust filter soak items ARCHIVED (external company cleans filters);
 *   new weekly "release oil from canopy valve" on Currumbin chefs.
 *
 * Idempotent — safe to re-run. Requires the `archived` column
 * (migration 20260721000000_checklist_item_archived).
 *
 * Run: npx tsx --env-file=.env.local scripts/update-council-cleaning-20260721.ts
 */
import "dotenv/config"
import { randomUUID } from "crypto"
import { Pool } from "pg"

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

async function templateId(venue: string, name: string): Promise<string> {
  const r = await pool.query(
    `SELECT id FROM "ChecklistTemplate" WHERE venue = $1 AND name = $2`,
    [venue, name]
  )
  if (r.rows.length !== 1) throw new Error(`Template not found: ${venue} / ${name}`)
  return r.rows[0].id
}

async function addItem(tplId: string, label: string, instructions?: string) {
  const exists = await pool.query(
    `SELECT 1 FROM "ChecklistTemplateItem" WHERE "templateId" = $1 AND label = $2`,
    [tplId, label]
  )
  if (exists.rows.length > 0) {
    console.log(`  = exists: ${label}`)
    return
  }
  const next = await pool.query(
    `SELECT COALESCE(MAX("sortOrder"), -1) + 1 AS n FROM "ChecklistTemplateItem" WHERE "templateId" = $1`,
    [tplId]
  )
  await pool.query(
    `INSERT INTO "ChecklistTemplateItem" (id, "templateId", "sortOrder", label, instructions, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [randomUUID(), tplId, next.rows[0].n, label, instructions ?? null]
  )
  console.log(`  + added: ${label}`)
}

async function relabel(tplId: string, oldLabel: string, newLabel: string) {
  const r = await pool.query(
    `UPDATE "ChecklistTemplateItem" SET label = $3, "updatedAt" = NOW()
     WHERE "templateId" = $1 AND label = $2`,
    [tplId, oldLabel, newLabel]
  )
  console.log(`  ~ relabel (${r.rowCount}): ${newLabel}`)
}

async function setInstructions(tplId: string, label: string, instructions: string) {
  const r = await pool.query(
    `UPDATE "ChecklistTemplateItem" SET instructions = $3, "updatedAt" = NOW()
     WHERE "templateId" = $1 AND label = $2`,
    [tplId, label, instructions]
  )
  console.log(`  ~ instructions (${r.rowCount}): ${label}`)
}

async function archiveItem(tplId: string, labelPrefix: string) {
  const r = await pool.query(
    `UPDATE "ChecklistTemplateItem" SET archived = true, "updatedAt" = NOW()
     WHERE "templateId" = $1 AND label LIKE $2 AND archived = false`,
    [tplId, labelPrefix + "%"]
  )
  console.log(`  - archived (${r.rowCount}): ${labelPrefix}…`)
}

const PASS_ITEM = "Wipe down pass bench and pass light top"
const SIDES_ITEM = "Light clean sides and behind cookline"
const SIDES_NOTE =
  "Quick wipe of equipment sides and reachable areas behind the cookline — no need to pull equipment out. KP does the full pull-out deep clean weekly."

async function main() {
  // ── Currumbin — Restaurant Kitchen (chefs) ────────────────────────────
  console.log("Restaurant Kitchen — Daily Clean (Currumbin)")
  const rkDaily = await templateId("BEACH_HOUSE", "Restaurant Kitchen — Daily Clean")
  await addItem(rkDaily, PASS_ITEM)
  await addItem(rkDaily, SIDES_ITEM, SIDES_NOTE)

  console.log("Restaurant Kitchen — Weekly Deep Clean (Currumbin)")
  const rkWeekly = await templateId("BEACH_HOUSE", "Restaurant Kitchen — Weekly Deep Clean")
  await archiveItem(rkWeekly, "Exhaust canopy — remove filters")
  await addItem(
    rkWeekly,
    "Release oil from exhaust canopy grease valve",
    "Open the valve on the canopy and drain collected oil into a container; dispose of it with the waste oil. The filters themselves are cleaned by the external contractor."
  )
  await relabel(
    rkWeekly,
    "Wash walls behind and around cookline — hot soapy water and sanitise",
    "Deep clean walls — hot soapy water and sanitise (KP)"
  )
  await relabel(
    rkWeekly,
    "Pull out cookline equipment; degrease behind and underneath",
    "Deep clean sides and behind cookline — pull out equipment, degrease behind and underneath (KP)"
  )

  console.log("Restaurant Kitchen — Monthly Deep Clean (Currumbin)")
  const rkMonthly = await templateId("BEACH_HOUSE", "Restaurant Kitchen — Monthly Deep Clean")
  await relabel(
    rkMonthly,
    "Clean ceiling vents, fans and light fittings",
    "Deep clean ceiling — including vents, fans and light fittings (KP)"
  )

  // ── Currumbin — Cafe Kitchen ──────────────────────────────────────────
  console.log("Cafe Kitchen — Daily Clean (Currumbin)")
  const cafeDaily = await templateId("BEACH_HOUSE", "Cafe Kitchen — Daily Clean")
  await addItem(cafeDaily, "Clean the bin space of the grill fridge")
  await addItem(
    cafeDaily,
    "Wipe down the grease-retaining tubes",
    "Wipe the tubes that catch and hold grease around the grill area."
  )

  console.log("Cafe Kitchen — Weekly Deep Clean (Currumbin)")
  const cafeWeekly = await templateId("BEACH_HOUSE", "Cafe Kitchen — Weekly Deep Clean")
  await archiveItem(cafeWeekly, "Exhaust canopy — remove filters")
  await setInstructions(
    cafeWeekly,
    "Deep clean fridges — empty shelves, hot soapy water, sanitise; clean door seals",
    "Includes the downstairs drawer fridges — pull the drawers right out and wash before sanitising."
  )

  // ── Burleigh — new Chefs daily list ───────────────────────────────────
  console.log("Chefs — Daily Clean (Burleigh)")
  const existing = await pool.query(
    `SELECT id FROM "ChecklistTemplate" WHERE venue = 'BURLEIGH' AND name = 'Chefs — Daily Clean'`
  )
  let burleighChefs: string
  if (existing.rows.length > 0) {
    burleighChefs = existing.rows[0].id
    console.log("  = template exists")
  } else {
    const kpDaily = await pool.query(
      `SELECT "dueByHour", "alertEmails" FROM "ChecklistTemplate" WHERE venue = 'BURLEIGH' AND name = 'KP — Daily Close'`
    )
    const dueByHour = kpDaily.rows[0]?.dueByHour ?? null
    const alertEmails = kpDaily.rows[0]?.alertEmails ?? []
    burleighChefs = randomUUID()
    await pool.query(
      `INSERT INTO "ChecklistTemplate" (id, name, area, venue, cadence, shift, "isFoodSafety", "dueByHour", "alertEmails", "isActive", "updatedAt")
       VALUES ($1, 'Chefs — Daily Clean', 'Kitchen', 'BURLEIGH', 'DAILY', 'CLOSE', false, $2, $3, true, NOW())`,
      [burleighChefs, dueByHour, alertEmails]
    )
    console.log(`  + created template (dueByHour=${dueByHour})`)
  }
  await addItem(burleighChefs, PASS_ITEM)
  await addItem(burleighChefs, SIDES_ITEM, SIDES_NOTE)

  // ── Burleigh — KP weekly / monthly ────────────────────────────────────
  console.log("KP — Weekly Deep Clean (Burleigh)")
  const kpWeekly = await templateId("BURLEIGH", "KP — Weekly Deep Clean")
  await addItem(
    kpWeekly,
    "Deep clean sides and behind cookline",
    "Pull out cookline equipment; degrease sides, behind and underneath."
  )
  await addItem(kpWeekly, "Deep clean walls — hot soapy water and sanitise")
  await addItem(kpWeekly, "Clean fridge and cool room door seals")

  console.log("KP — Monthly Deep Clean (Burleigh)")
  const kpMonthly = await templateId("BURLEIGH", "KP — Monthly Deep Clean")
  await addItem(kpMonthly, "Deep clean ceiling")

  await pool.end()
  console.log("Done.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
