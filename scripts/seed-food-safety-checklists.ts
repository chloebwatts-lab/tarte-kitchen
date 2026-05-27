/**
 * Seed GCCC / FSANZ Standard 3.2.2A aligned food-safety checklists.
 *
 * Usage:
 *   npx tsx scripts/seed-food-safety-checklists.ts [--dry-run]
 *
 * Idempotent — skips templates whose (venue, name) already exists. Only creates
 * new ones, never overwrites existing content. Safe to re-run.
 *
 * After seeding, a manager can edit equipment lists, temp thresholds, and alert
 * emails in the admin app (Settings → Checklists).
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import type { Venue, ChecklistShift, ChecklistCadence } from "../src/generated/prisma"

type UnitDef = {
  label: string
  /** Inline hint shown under the label. */
  hint: string
  /** true = hot hold (≥60°C), false = cold storage (≤5°C or ≤-18°C frozen). */
  hotCheck: boolean
}

type VenueFoodSafety = {
  cold: UnitDef[]
  hot: UnitDef[]
}

/**
 * Per-venue equipment defaults. Reasonable first-pass guesses based on venue
 * type — managers should edit these in the admin app to match real equipment.
 */
const VENUE_UNITS: Record<Exclude<Venue, "BOTH">, VenueFoodSafety> = {
  BURLEIGH: {
    cold: [
      { label: "Pastry display cabinet", hint: "≤5°C for chilled pastry.", hotCheck: false },
      { label: "Sandwich / cold display", hint: "≤5°C.", hotCheck: false },
      { label: "Underbench prep fridge", hint: "≤5°C.", hotCheck: false },
      { label: "Cool room", hint: "≤5°C. Check door seals.", hotCheck: false },
      { label: "Freezer", hint: "≤-18°C.", hotCheck: false },
    ],
    hot: [
      { label: "Pie / sausage roll warmer", hint: "≥60°C core.", hotCheck: true },
    ],
  },
  BEACH_HOUSE: {
    cold: [
      { label: "Kitchen cool room", hint: "≤5°C. Check door seals & no spills.", hotCheck: false },
      { label: "Kitchen freezer", hint: "≤-18°C.", hotCheck: false },
      { label: "Pass fridge", hint: "≤5°C.", hotCheck: false },
      { label: "Undercounter prep fridge", hint: "≤5°C.", hotCheck: false },
      { label: "Dessert / pastry display fridge", hint: "≤5°C.", hotCheck: false },
      { label: "Bar fridge", hint: "≤5°C.", hotCheck: false },
    ],
    hot: [
      { label: "Bain-marie (line)", hint: "≥60°C core.", hotCheck: true },
      { label: "Soup / sauce hot hold", hint: "≥60°C core.", hotCheck: true },
    ],
  },
  TEA_GARDEN: {
    cold: [
      { label: "Display fridge (front)", hint: "≤5°C.", hotCheck: false },
      { label: "Undercounter prep fridge", hint: "≤5°C.", hotCheck: false },
      { label: "Freezer", hint: "≤-18°C.", hotCheck: false },
    ],
    hot: [
      { label: "Bain-marie / hot hold", hint: "≥60°C core. Remove row if not in use.", hotCheck: true },
    ],
  },
}

type TemplateDef = {
  name: string
  area: string
  shift: ChecklistShift
  cadence: ChecklistCadence
  dueByHour: number
  units: UnitDef[]
  extraItems?: {
    label: string
    instructions: string
    requireTemp: boolean
    requireNote: boolean
    hotCheck: boolean
  }[]
}

function buildVenueTemplates(venue: Exclude<Venue, "BOTH">): TemplateDef[] {
  const u = VENUE_UNITS[venue]
  return [
    {
      name: "Cold storage temps — Opening",
      area: "Cold storage",
      shift: "OPEN",
      cadence: "DAILY",
      dueByHour: 10,
      units: u.cold,
    },
    {
      name: "Cold storage temps — Midday",
      area: "Cold storage",
      shift: "MID",
      cadence: "DAILY",
      dueByHour: 14,
      units: u.cold,
    },
    {
      name: "Cold storage temps — Close",
      area: "Cold storage",
      shift: "CLOSE",
      cadence: "DAILY",
      dueByHour: 22,
      units: u.cold,
    },
    ...(u.hot.length > 0
      ? [
          {
            name: "Hot hold temps — Service",
            area: "Hot hold",
            shift: "MID" as ChecklistShift,
            cadence: "DAILY" as ChecklistCadence,
            dueByHour: 14,
            units: u.hot,
          },
        ]
      : []),
    {
      name: "Delivery receiving — Temp check",
      area: "Deliveries",
      shift: "ANY",
      cadence: "ON_DEMAND",
      dueByHour: 18,
      units: [],
      extraItems: [
        {
          label: "Chilled delivery core temp",
          instructions:
            "Check core temp of a representative chilled item on arrival. Reject if >5°C (GCCC / FSANZ 3.2.2A).",
          requireTemp: true,
          requireNote: true,
          hotCheck: false,
        },
        {
          label: "Frozen delivery temp",
          instructions: "Frozen stock should be ≤-15°C on arrival, ideally ≤-18°C.",
          requireTemp: true,
          requireNote: true,
          hotCheck: false,
        },
        {
          label: "Packaging intact & undamaged",
          instructions: "No punctures, no visible spoilage, no broken seals.",
          requireTemp: false,
          requireNote: false,
          hotCheck: false,
        },
        {
          label: "Supplier & batch recorded",
          instructions:
            "Note supplier name and invoice number in case of later recall.",
          requireTemp: false,
          requireNote: true,
          hotCheck: false,
        },
      ],
    },
  ]
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")

  const connectionString = process.env.DATABASE_URL
  const needsSsl = connectionString?.includes("sslmode=require")
  const pool = new Pool({
    connectionString,
    ...(needsSsl && { ssl: { rejectUnauthorized: false } }),
  })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  const venues: Exclude<Venue, "BOTH">[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
  let created = 0
  let skipped = 0

  for (const venue of venues) {
    const templates = buildVenueTemplates(venue)
    for (const t of templates) {
      const existing = await db.checklistTemplate.findFirst({
        where: { venue, name: t.name },
        select: { id: true },
      })
      if (existing) {
        console.log(`· ${venue} — "${t.name}" — skipped (already exists)`)
        skipped++
        continue
      }

      if (dryRun) {
        console.log(`+ ${venue} — "${t.name}" (${t.units.length + (t.extraItems?.length ?? 0)} items)`)
        created++
        continue
      }

      const items = [
        ...t.units.map((u, i) => ({
          sortOrder: i,
          label: u.label,
          instructions: u.hint,
          requireTemp: true,
          requireNote: false,
          hotCheck: u.hotCheck,
        })),
        ...(t.extraItems ?? []).map((item, idx) => ({
          sortOrder: t.units.length + idx,
          label: item.label,
          instructions: item.instructions,
          requireTemp: item.requireTemp,
          requireNote: item.requireNote,
          hotCheck: item.hotCheck,
        })),
      ]

      await db.checklistTemplate.create({
        data: {
          name: t.name,
          area: t.area,
          venue,
          cadence: t.cadence,
          shift: t.shift,
          isFoodSafety: true,
          dueByHour: t.dueByHour,
          items: { create: items },
        },
      })
      console.log(`+ ${venue} — "${t.name}" (${items.length} items) — created`)
      created++
    }
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}${created} template${created === 1 ? "" : "s"} ${dryRun ? "would be created" : "created"}, ${skipped} already existed.`
  )

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
