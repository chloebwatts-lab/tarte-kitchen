/**
 * Seed ONE day of example food-safety / operations records.
 *
 * Shared engine behind the nightly `seed-yesterday` cron. The CLI script
 * scripts/backfill-food-safety-runs.ts covers multi-day windows and pastry;
 * both import their numbers from ./seed-generators so the bands can never
 * drift apart.
 *
 * Two rules this file enforces and must keep enforcing:
 *  1. It refuses any date that is not strictly in the past (AEST). Pre-dated
 *     "completed" checklists get opened by staff as already signed off, and
 *     the real check gets skipped. That happened on 2026-08-12 and the rows
 *     had to be deleted.
 *  2. Every insert is ON CONFLICT DO NOTHING, so a real staff entry always
 *     wins and a re-run is a no-op.
 */
import {
  SINGLE_VENUES,
  staffFor,
  COOLING_BY_VENUE,
  type CoolItem,
  rng,
  pick,
  round1,
  aestTs,
  SHIFT_HOUR,
  readingFor,
  checkNote,
} from "./seed-generators"

export type Exec = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>

export function aestToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" })
}

export function aestYesterday(): string {
  const d = new Date(`${aestToday()}T00:00:00Z`)
  return new Date(d.getTime() - 86400000).toISOString().slice(0, 10)
}

/** Which cadences fire on a given single date. */
function cadenceRunsOn(cadence: string, name: string, date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 = Sunday
  if (cadence === "DAILY") return true
  if (cadence === "WEEKLY") return dow === 0
  if (cadence === "MONTHLY") return date.endsWith("-01")
  if (cadence === "ON_DEMAND") {
    // Delivery temp checks land a couple of times a week, nothing else does.
    return /delivery/i.test(name) && Number(date.slice(8, 10)) % 3 === 0
  }
  return false
}

export interface SeedDayOptions {
  date: string
  /** Skip non-food-safety templates whose area starts with one of these. */
  excludeAreaPrefixes?: string[]
  /** false = daily food-safety templates only. */
  allTemplates?: boolean
}

export interface SeedDayResult {
  date: string
  templates: number
  runsCreated: number
  runsSkipped: number
  itemsCreated: number
  coolingCreated: number
}

export async function seedDay(exec: Exec, opts: SeedDayOptions): Promise<SeedDayResult> {
  const { date, excludeAreaPrefixes = [], allTemplates = true } = opts

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad date: ${date}`)
  if (date >= aestToday()) {
    throw new Error(
      `refusing to seed ${date}: records must be strictly in the past (today AEST is ${aestToday()})`
    )
  }

  const base = allTemplates
    ? `"isActive" = true`
    : `cadence IN ('DAILY', 'ON_DEMAND') AND ("isFoodSafety" = true OR area = 'Food Safety') AND "isActive" = true`
  const excl = excludeAreaPrefixes
    .map((a) => a.replace(/[^A-Za-z0-9 &-]/g, ""))
    .filter(Boolean)
    .map((a) => ` AND NOT (COALESCE(area, '') ILIKE '${a}%' AND "isFoodSafety" = false)`)
    .join("")

  const tpls = await exec(
    `SELECT id, name, venue, cadence, shift, area, "dueByHour"
       FROM "ChecklistTemplate" WHERE ${base}${excl} ORDER BY venue, cadence, name`,
    []
  )

  let runsCreated = 0
  let runsSkipped = 0
  let itemsCreated = 0
  const venuesSeen = new Set<string>()

  for (const t of tpls as Array<Record<string, string | number | null>>) {
    const cadence = String(t.cadence)
    const name = String(t.name)
    if (!cadenceRunsOn(cadence, name, date)) continue

    const runVenues =
      t.venue === "BOTH" ? [...SINGLE_VENUES] : [String(t.venue)]
    const items = await exec(
      `SELECT id, label, "requireTemp", "requireNote", "hotCheck"
         FROM "ChecklistTemplateItem" WHERE "templateId" = $1 AND archived = false ORDER BY "sortOrder"`,
      [t.id]
    )
    const dueHour = (t.dueByHour as number | null) ?? SHIFT_HOUR[String(t.shift)] ?? 11

    for (const venue of runVenues) {
      venuesSeen.add(venue)
      const r = rng(`${t.id}|${venue}|${date}`)
      const staffMember = pick(r, staffFor(venue))
      const completeMin = 5 + Math.floor(r() * 50)
      const completeHour = Math.max(6, dueHour - 1)
      const completedAt = aestTs(date, completeHour, completeMin)

      const ins = await exec(
        `INSERT INTO "ChecklistRun" (id, "templateId", venue, "runDate", shift, status, "completedBy", "completedAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2::"Venue", $3::date, $4::"ChecklistShift", 'COMPLETED', $5, $6::timestamp, NOW())
         ON CONFLICT ("templateId", venue, "runDate", shift) DO NOTHING RETURNING id`,
        [t.id, venue, date, t.shift, staffMember, completedAt]
      )
      if (ins.length === 0) {
        runsSkipped++
        continue
      }
      const runId = String(ins[0].id)
      runsCreated++

      for (const it of items as Array<Record<string, string | boolean>>) {
        const ri = rng(`${runId}|${it.id}`)
        let temp: number | null = null
        let note: string | null = null
        if (it.requireTemp) {
          const reading = readingFor(
            String(it.label),
            Boolean(it.hotCheck),
            Boolean(it.requireNote),
            ri
          )
          temp = reading.temp
          note = reading.note
        } else if (it.requireNote) {
          note = checkNote(String(it.label), ri)
        }
        const checkedAt = aestTs(date, completeHour, completeMin - 3 + Math.floor(ri() * 3))
        await exec(
          `INSERT INTO "ChecklistRunItem" (id, "runId", "templateItemId", "checkedAt", "checkedBy", "tempCelsius", note, "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3::timestamp, $4, $5, $6, NOW())
           ON CONFLICT ("runId", "templateItemId") DO NOTHING`,
          [runId, it.id, checkedAt, staffMember, temp, note]
        )
        itemsCreated++
      }
    }
  }

  const coolingCreated = await seedCooling(exec, date, venuesSeen)

  return {
    date,
    templates: tpls.length,
    runsCreated,
    runsSkipped,
    itemsCreated,
    coolingCreated,
  }
}

async function insertCooling(
  exec: Exec,
  venue: string,
  date: string,
  item: CoolItem,
  r: () => number,
  startHour: number
): Promise<number> {
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
  const fridge = round1(Math.max(0.8, Math.min(1.2 + r() * 2.0, sixHour - 0.4)))
  let notes: string | null =
    "fixedNote" in item && item.fixedNote
      ? item.fixedNote
      : pick(r, [null as unknown as string, "Split into shallow trays", "Ice bath then cool room", "Blast chiller used"])
  if (roll < 0.08) {
    twoHour = round1(21.5 + r() * 1.5)
    notes = `${twoHour}°C at 2 h — moved to blast chiller, ${sixHour}°C at 6 h. Within safe limits at final check.`
  } else if (roll < 0.11) {
    sixHour = round1(5.6 + r() * 1.6)
    notes = `Only reached ${sixHour}°C at 6 h — batch discarded, did not meet ≤5°C. Reviewed cooling method.`
  }

  const exists = await exec(
    `SELECT 1 FROM "CoolingLog" WHERE venue = $1::"Venue" AND "itemName" = $2 AND "startedAt"::date = $3::date LIMIT 1`,
    [venue, item.name, date]
  )
  if (exists.length > 0) return 0

  await exec(
    `INSERT INTO "CoolingLog" (id, venue, "itemName", "batchSize", "startedAt", "startTempC", "twoHourTempC", "twoHourAt", "sixHourTempC", "sixHourAt", "fridgeTempC", "staffInitials", notes, "updatedAt")
     VALUES (gen_random_uuid()::text, $1::"Venue", $2, $3, $4::timestamp, $5, $6, $7::timestamp, $8, $9::timestamp, $10, $11, $12, NOW())`,
    [venue, item.name, batch, startedAt, startTemp, twoHour, twoHourAt, sixHour, sixHourAt, fridge, staffMember, notes]
  )
  return 1
}

async function seedCooling(exec: Exec, date: string, templateVenues: Set<string>): Promise<number> {
  const venues = Object.keys(COOLING_BY_VENUE).filter((v) => templateVenues.has(v))
  let created = 0
  for (const venue of venues) {
    const cfg = COOLING_BY_VENUE[venue]
    const r = rng(`cool|${venue}|${date}`)
    for (const d of cfg.daily) created += await insertCooling(exec, venue, date, d, r, 13)
    if (r() < 0.6) created += await insertCooling(exec, venue, date, pick(r, cfg.pool), r, 14)
    if (r() < 0.3) created += await insertCooling(exec, venue, date, pick(r, cfg.pool), r, 10)
  }
  return created
}
