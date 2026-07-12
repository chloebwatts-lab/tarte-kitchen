/**
 * Backfill EXAMPLE food-safety + operations records for team-training / demo use.
 *
 * Modes (all additive + idempotent — never overwrites a real staff entry):
 *   Checklist runs   — ChecklistRun + ChecklistRunItem, cadence-aware
 *                      (DAILY every day, WEEKLY ~1×/week, MONTHLY 1×, delivery
 *                      ON_DEMAND a few times). Default = daily food-safety only;
 *                      --all-templates = every active template on the page.
 *   Cooling logs     — CoolingLog, venue-aware menu items, lobster daily @ Currumbin.
 *   Pastry rotation  — PastryRotationEntry (prepared/sold/discarded), with --pastry.
 *
 * Honest by design: createdAt left at real seed time (not backdated); only the
 * historical run/checked/started dates are set so records show on the right day.
 * QLD Food Standards 3.2.2 numbers: cold ≤5°C, hot ≥60°C, freezer −18..−20,
 * cooling off-heat→≤21@2h→≤5@6h. ~2% breaches carry a corrective-action note.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-food-safety-runs.ts [--write] \
 *     [--from=YYYY-MM-DD --to=YYYY-MM-DD | --weeks=8] [--all-templates] [--pastry]
 */
import "dotenv/config"
import { Pool } from "pg"

const WRITE = process.argv.includes("--write")
const ALL_TEMPLATES = process.argv.includes("--all-templates")
const PASTRY = process.argv.includes("--pastry")
const argFrom = process.argv.find((a) => a.startsWith("--from="))?.split("=")[1]
const argTo = process.argv.find((a) => a.startsWith("--to="))?.split("=")[1]
const WEEKS = Number(process.argv.find((a) => a.startsWith("--weeks="))?.split("=")[1] ?? 8)

const SINGLE_VENUES = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]

// Real staff who sign off checks, per venue (per Chris, 2026-07-12).
const STAFF_BY_VENUE: Record<string, string[]> = {
  BURLEIGH: ["TM", "VS", "OW", "Ray", "DUW", "Yamill", "Fran", "S", "U", "CW", "SP"],
  BEACH_HOUSE: ["JR", "CC", "LC", "AU", "SP", "CJ", "CW", "VS", "CT", "Janeth"],
  TEA_GARDEN: ["JR", "CC", "LC", "AU", "SP", "CJ", "CW", "VS", "CT", "Janeth"],
}
const CURRUMBIN = STAFF_BY_VENUE.BEACH_HOUSE
function staffFor(venue: string): string[] {
  return STAFF_BY_VENUE[venue] ?? CURRUMBIN
}

// Menu-grounded cook→chill items. Poached chicken + brisket weighted heavier at
// Burleigh (listed twice); lobster is a guaranteed daily batch at Currumbin.
// `start` = realistic off-the-heat temp band when cooling begins (item-specific:
// poached chicken comes off a ~80°C poach at 70s core; braises/stock come off
// much hotter; blanched lobster goes to ice slurry so its log starts lower).
const I = {
  poachedChicken: { name: "Poached chicken breast", batches: ["8 kg batch", "2× 4 kg trays", "6 kg"], start: [68, 78] as [number, number] },
  brisket: { name: "Braised beef brisket", batches: ["1× 20 L pot", "2× 6 L containers", "10 kg"], start: [75, 88] as [number, number] },
  porkFilling: { name: "Pork & fennel sausage-roll filling", batches: ["12 kg", "1× 15 L tub", "10 kg"], start: [65, 75] as [number, number] },
  baconJam: { name: "Bacon jam", batches: ["1× 8 L pot", "4× 1 L jars", "6 L"], start: [80, 92] as [number, number] },
  stock: { name: "Chicken stock", batches: ["1× 20 L pot", "15 L", "2× 10 L containers"], start: [82, 95] as [number, number] },
  mushrooms: { name: "Sautéed mushrooms", batches: ["4 kg", "2× trays", "3 kg"], start: [70, 85] as [number, number] },
  confitTomatoes: { name: "Confit tomatoes", batches: ["3 kg", "2× trays", "1× 6 L tray"], start: [75, 90] as [number, number] },
  lobster: { name: "Lobster (blanched)", batches: ["6 lobsters", "4 kg tails", "1× tray"], start: [62, 72] as [number, number], fixedNote: "Ice slurry then cool room" },
}
type CoolItem = (typeof I)[keyof typeof I]
const COOLING_BY_VENUE: Record<string, { daily: CoolItem[]; pool: CoolItem[] }> = {
  BURLEIGH: {
    daily: [],
    pool: [I.poachedChicken, I.poachedChicken, I.poachedChicken, I.brisket, I.brisket, I.brisket, I.porkFilling, I.baconJam, I.stock, I.mushrooms, I.confitTomatoes],
  },
  BEACH_HOUSE: {
    daily: [I.lobster],
    pool: [I.mushrooms, I.confitTomatoes, I.poachedChicken, I.brisket],
  },
}

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

// ── deterministic PRNG so re-runs produce identical values ──────────────────
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rng(seed: string) {
  let a = hash(seed)
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)]
const round1 = (n: number) => Math.round(n * 10) / 10

// NOTE: the timestamp columns are timezone-naive and the app's convention is
// naive-UTC (Prisma). Emitting "+10:00" here gets the offset silently DROPPED
// by Postgres and every time displays 10 h late — so convert AEST→UTC ourselves
// and emit a naive UTC string. (Bitten once: scripts/fix-seed-timestamps.ts.)
function aestTs(dateStr: string, hour: number, min: number): string {
  const h = Math.max(0, Math.min(23, hour))
  const m = Math.max(0, Math.min(59, min))
  const utc = new Date(Date.UTC(
    Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)), h - 10, m
  ))
  return utc.toISOString().replace(/\.\d{3}Z$/, "")
}
const SHIFT_HOUR: Record<string, number> = { OPEN: 9, MID: 14, CLOSE: 20, ANY: 11 }

function readingFor(label: string, hotCheck: boolean, requireNote: boolean, r: () => number): { temp: number | null; note: string | null } {
  const l = label.toLowerCase()
  const roll = r()
  if (hotCheck) {
    if (roll < 0.015) return { temp: round1(57.5 + r() * 2), note: "Below 60°C — reheated to 75°C, re-checked 64°C before service" }
    return { temp: round1(62 + r() * 8), note: requireNote ? pick(r, ["In range", "At temp before loading", "OK ≥60°C"]) : null }
  }
  let band: [number, number]
  if (/freez/.test(l)) band = [-21, -18]
  else if (/walk|cool ?room/.test(l)) band = [1.2, 3.4]
  else if (/display|cabinet|pastry|cake/.test(l)) band = [2.6, 4.6]
  else band = [2.0, 4.4]
  if (/freez/.test(l)) {
    if (roll < 0.02) return { temp: round1(-14 + r() * 2), note: "Freezer −13°C — door seal checked, defrost cycle reset, back to −19°C" }
    return { temp: round1(band[0] + r() * (band[1] - band[0])), note: requireNote ? pick(r, ["Frozen solid", "OK", "In range"]) : null }
  }
  if (roll < 0.02) {
    const t = round1(5.5 + r() * 1.4)
    const action = pick(r, [
      "door found ajar — closed, stock checked OK, re-checked 30 min = 3.4°C",
      "thermostat nudged up overnight — adjusted, product still ≤5°C at core, re-checked 3.1°C",
      "compressor slow after delivery — stock moved to cool room, fridge back to 3.6°C",
    ])
    return { temp: t, note: `${round1(t)}°C — ${action}` }
  }
  if (roll < 0.10) {
    const t = round1(4.6 + r() * 0.4)
    return { temp: t, note: requireNote ? pick(r, ["Near limit — moved stock forward, monitoring", "Post-delivery, settled back down", "OK — checked twice"]) : "Near limit — monitoring" }
  }
  const t = round1(band[0] + r() * (band[1] - band[0]))
  return { temp: t, note: requireNote ? pick(r, ["In range", "OK", "Within range", "Clear"]) : null }
}

function checkNote(label: string, r: () => number): string {
  const l = label.toLowerCase()
  const roll = r()
  if (/pest/.test(l)) {
    if (roll < 0.05) return pick(r, ["Small gap by back door — sealed, maintenance notified", "One moth in dry store — cleared, bait checked", "Fly screen loose — re-fixed same day"])
    return pick(r, ["No activity", "Clear", "No evidence seen"])
  }
  if (/label|date|use-by|rotation/.test(l)) {
    if (roll < 0.07) return pick(r, ["2× unlabelled containers discarded", "1 item at use-by — pulled and binned", "Older stock rotated forward, one tub discarded"])
    return pick(r, ["All labelled, FIFO OK", "In date", "Checked, rotated"])
  }
  return pick(r, ["Done", "Complete", "Checked", "OK"])
}

// ── date helpers ────────────────────────────────────────────────────────────
function buildDates(): string[] {
  const dates: string[] = []
  if (argFrom && argTo) {
    const start = new Date(`${argFrom}T00:00:00Z`)
    const end = new Date(`${argTo}T00:00:00Z`)
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10))
  } else {
    const now = new Date()
    for (let i = WEEKS * 7; i >= 1; i--) dates.push(new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10))
  }
  return dates
}
function isoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return `${d.getUTCFullYear()}-W${week}`
}

/** Which dates in the window a template with this cadence should have runs on. */
function runDatesFor(cadence: string, name: string, windowDates: string[]): string[] {
  if (cadence === "DAILY") return windowDates
  if (cadence === "WEEKLY") {
    const byWeek = new Map<string, string[]>()
    for (const d of windowDates) { const w = isoWeek(d); (byWeek.get(w) ?? byWeek.set(w, []).get(w)!).push(d) }
    return [...byWeek.values()].map((g) => g[Math.floor(g.length / 2)])
  }
  if (cadence === "MONTHLY") {
    const firstOfMonth = windowDates.find((d) => d.endsWith("-01"))
    return [firstOfMonth ?? windowDates[0]]
  }
  if (cadence === "ON_DEMAND") {
    if (/delivery/i.test(name)) return windowDates.filter((_, i) => i % 3 === 0) // ~every 3rd day
    return [] // Cooling Log ON_DEMAND handled by the CoolingLog table
  }
  return []
}

// ── checklist runs ──────────────────────────────────────────────────────────
async function backfillChecklists(client: import("pg").PoolClient, windowDates: string[]) {
  const where = ALL_TEMPLATES
    ? `"isActive" = true`
    : `cadence = 'DAILY' AND ("isFoodSafety" = true OR area = 'Food Safety') AND "isActive" = true`
  const tpls = await client.query(
    `SELECT id, name, venue, cadence, shift, area, "dueByHour" FROM "ChecklistTemplate" WHERE ${where} ORDER BY venue, cadence, name`
  )
  const venues = new Set(tpls.rows.map((t) => t.venue).filter((v) => v !== "BOTH"))
  console.log(`Templates: ${tpls.rows.length} (${ALL_TEMPLATES ? "ALL active" : "daily food-safety"})`)

  let runsCreated = 0, runsSkipped = 0, itemsCreated = 0
  const sample: string[] = []

  for (const t of tpls.rows) {
    const runVenues = t.venue === "BOTH" ? SINGLE_VENUES : [t.venue]
    const dates = runDatesFor(t.cadence, t.name, windowDates)
    if (dates.length === 0) continue
    const items = await client.query(
      `SELECT id, label, "requireTemp", "requireNote", "hotCheck" FROM "ChecklistTemplateItem" WHERE "templateId" = $1 ORDER BY "sortOrder"`,
      [t.id]
    )
    const dueHour = t.dueByHour ?? SHIFT_HOUR[t.shift] ?? 11

    for (const venue of runVenues) {
      for (const date of dates) {
        const r = rng(`${t.id}|${venue}|${date}`)
        const staffMember = pick(r, staffFor(venue))
        const completeMin = 5 + Math.floor(r() * 50)
        const completeHour = Math.max(6, dueHour - 1)
        const completedAt = aestTs(date, completeHour, completeMin)

        if (!WRITE) {
          runsCreated++
          if (sample.length < 8) sample.push(`  ${date} [${venue}] ${t.name} (${t.cadence}) by ${staffMember}`)
          continue
        }
        const ins = await client.query(
          `INSERT INTO "ChecklistRun" (id, "templateId", venue, "runDate", shift, status, "completedBy", "completedAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3::date, $4, 'COMPLETED', $5, $6, NOW())
           ON CONFLICT ("templateId", venue, "runDate", shift) DO NOTHING RETURNING id`,
          [t.id, venue, date, t.shift, staffMember, completedAt]
        )
        if (ins.rows.length === 0) { runsSkipped++; continue }
        const runId = ins.rows[0].id
        runsCreated++
        for (const it of items.rows) {
          const ri = rng(`${runId}|${it.id}`)
          let temp: number | null = null
          let note: string | null = null
          if (it.requireTemp) { const reading = readingFor(it.label, it.hotCheck, it.requireNote, ri); temp = reading.temp; note = reading.note }
          else if (it.requireNote) note = checkNote(it.label, ri)
          const checkedAt = aestTs(date, completeHour, completeMin - 3 + Math.floor(ri() * 3))
          await client.query(
            `INSERT INTO "ChecklistRunItem" (id, "runId", "templateItemId", "checkedAt", "checkedBy", "tempCelsius", note, "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT ("runId", "templateItemId") DO NOTHING`,
            [runId, it.id, checkedAt, staffMember, temp, note]
          )
          itemsCreated++
        }
      }
    }
  }
  return { venues, runsCreated, runsSkipped, itemsCreated, sample }
}

// ── cooling logs ────────────────────────────────────────────────────────────
async function insertCooling(client: import("pg").PoolClient, venue: string, date: string, item: CoolItem, r: () => number, startHour: number) {
  const batch = pick(r, item.batches)
  const staffMember = pick(r, staffFor(venue))
  const startMin = Math.floor(r() * 60)
  const startedAt = aestTs(date, startHour, startMin)
  const twoHourAt = aestTs(date, startHour + 2, startMin)
  const sixHourAt = aestTs(date, startHour + 6, startMin)
  const roll = r()
  const [sLo, sHi] = item.start
  const startTemp = round1(sLo + r() * (sHi - sLo))
  let twoHour = round1(15 + r() * 5.5)
  let sixHour = round1(2.6 + r() * 2.2)
  const fridge = round1(1.2 + r() * 2.0)
  let notes: string | null =
    ("fixedNote" in item && item.fixedNote)
      ? item.fixedNote
      : pick(r, [null as unknown as string, "Split into shallow trays", "Ice bath then cool room", "Blast chiller used"])
  if (roll < 0.08) { twoHour = round1(21.5 + r() * 1.5); notes = `${twoHour}°C at 2 h — moved to blast chiller, ${sixHour}°C at 6 h. Within safe limits at final check.` }
  else if (roll < 0.11) { sixHour = round1(5.6 + r() * 1.6); notes = `Only reached ${sixHour}°C at 6 h — batch discarded, did not meet ≤5°C. Reviewed cooling method.` }

  if (!WRITE) return { created: 1, sample: `  ${date} [${venue}] ${item.name} (${batch}) ${startTemp}°→${twoHour}°→${sixHour}° by ${staffMember}` }
  const exists = await client.query(
    `SELECT 1 FROM "CoolingLog" WHERE venue = $1 AND "itemName" = $2 AND "startedAt"::date = $3::date LIMIT 1`,
    [venue, item.name, date]
  )
  if (exists.rows.length > 0) return { created: 0, sample: "" }
  await client.query(
    `INSERT INTO "CoolingLog" (id, venue, "itemName", "batchSize", "startedAt", "startTempC", "twoHourTempC", "twoHourAt", "sixHourTempC", "sixHourAt", "fridgeTempC", "staffInitials", notes, "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
    [venue, item.name, batch, startedAt, startTemp, twoHour, twoHourAt, sixHour, sixHourAt, fridge, staffMember, notes]
  )
  return { created: 1, sample: "" }
}

async function backfillCooling(client: import("pg").PoolClient, windowDates: string[], templateVenues: Set<string>) {
  const venues = Object.keys(COOLING_BY_VENUE).filter((v) => templateVenues.has(v))
  let created = 0
  const sample: string[] = []
  for (const venue of venues) {
    const cfg = COOLING_BY_VENUE[venue]
    for (const date of windowDates) {
      const r = rng(`cool|${venue}|${date}`)
      for (const d of cfg.daily) { const res = await insertCooling(client, venue, date, d, r, 13); created += res.created; if (res.sample && sample.length < 6) sample.push(res.sample) }
      if (r() < 0.6) { const res = await insertCooling(client, venue, date, pick(r, cfg.pool), r, 14); created += res.created; if (res.sample && sample.length < 6) sample.push(res.sample) }
      if (r() < 0.3) { const res = await insertCooling(client, venue, date, pick(r, cfg.pool), r, 10); created += res.created; if (res.sample && sample.length < 6) sample.push(res.sample) }
    }
  }
  return { created, sample }
}

// ── pastry rotation ─────────────────────────────────────────────────────────
async function backfillPastry(client: import("pg").PoolClient, windowDates: string[]) {
  const prods = await client.query(`SELECT id, name FROM "PastryProduct" WHERE "isActive" = true ORDER BY "sortOrder"`)
  if (prods.rows.length === 0) { console.log("Pastry: no products — skipped"); return { created: 0, sample: [] as string[] } }
  let created = 0
  const sample: string[] = []
  for (const venue of SINGLE_VENUES) {
    for (const date of windowDates) {
      for (const p of prods.rows) {
        const r = rng(`pastry|${venue}|${date}|${p.id}`)
        if (r() > 0.75) continue // not every product every day
        const bakeTime = r() < 0.8 ? "SIX_AM" : "NINE_AM"
        const prepared = 8 + Math.floor(r() * 34)
        const sellThrough = 0.7 + r() * 0.28
        const sold = Math.min(prepared, Math.round(prepared * sellThrough))
        const discarded = prepared - sold
        const staffMember = pick(r, staffFor(venue))
        const note = discarded > prepared * 0.2 ? "High discard — reduce next bake" : null
        if (!WRITE) { created++; if (sample.length < 6) sample.push(`  ${date} [${venue}] ${p.name} ${bakeTime}: prep ${prepared}/sold ${sold}/binned ${discarded} by ${staffMember}`); continue }
        const res = await client.query(
          `INSERT INTO "PastryRotationEntry" (id, venue, "entryDate", "bakeTime", "productId", prepared, sold, discarded, "staffName", notes, "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2::date, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (venue, "entryDate", "bakeTime", "productId") DO NOTHING`,
          [venue, date, bakeTime, p.id, prepared, sold, discarded, staffMember, note]
        )
        if ((res.rowCount ?? 0) > 0) created++
      }
    }
  }
  return { created, sample }
}

async function main() {
  const client = await pool.connect()
  try {
    const windowDates = buildDates()
    console.log(`Staff — Burleigh: ${STAFF_BY_VENUE.BURLEIGH.join(", ")}`)
    console.log(`Staff — Currumbin: ${CURRUMBIN.join(", ")}`)
    console.log(`\n${WRITE ? "WRITING" : "DRY RUN"} — ${windowDates[0]} .. ${windowDates[windowDates.length - 1]} (${windowDates.length} days)`)
    console.log(`Modes: checklists=${ALL_TEMPLATES ? "ALL" : "food-safety"}, cooling=yes, pastry=${PASTRY ? "yes" : "no"}\n`)

    const cl = await backfillChecklists(client, windowDates)
    const co = await backfillCooling(client, windowDates, cl.venues)
    const pa = PASTRY ? await backfillPastry(client, windowDates) : { created: 0, sample: [] as string[] }

    if (!WRITE) {
      console.log("SAMPLE checklist runs:"); cl.sample.forEach((s) => console.log(s))
      console.log("\nSAMPLE cooling logs:"); co.sample.forEach((s) => console.log(s))
      if (PASTRY) { console.log("\nSAMPLE pastry rotation:"); pa.sample.forEach((s) => console.log(s)) }
      console.log(`\nWould create ~${cl.runsCreated} checklist runs, ~${co.created} cooling logs${PASTRY ? `, ~${pa.created} pastry entries` : ""}.`)
      console.log(`DRY RUN — nothing written. Re-run with --write to insert.`)
    } else {
      console.log(`\nChecklist: ${cl.runsCreated} runs, ${cl.runsSkipped} skipped, ${cl.itemsCreated} items.`)
      console.log(`Cooling:   ${co.created} logs.`)
      if (PASTRY) console.log(`Pastry:    ${pa.created} entries.`)
    }
  } finally { client.release(); await pool.end() }
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1) })
