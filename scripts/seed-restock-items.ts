/**
 * Seed the PrepStockItem catalogue from the head chef's paper sheets
 * (July 2026): "KITCHEN RESTOCK REQUEST (Restaurant)", "kitchen restock
 * cafe" and "lista de preps" for Tarte Beach House.
 *
 * Idempotent — upserts on (venue, station, name), preserves any edits to
 * unit/par/category made in admin after first run (update only touches
 * sortOrder), and never deletes.
 *
 * Run (against prod via SSH tunnel, see memory/tarte_deploy):
 *   npx tsx --env-file=.env.local scripts/seed-restock-items.ts
 */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

type Station = "RESTAURANT" | "CAFE"

const RESTOCK = "Station restock"
const DAILY = "Daily prep"

// Order matches the paper sheets so the walk order feels familiar.
const RESTAURANT_RESTOCK = [
  "Egg mix", "Hash", "H.C.C.", "Poach Chicken", "Salmon", "Fish",
  "Barramundi", "Pea Fritter", "Garlic Butter", "Mustard Butter",
  "Salted Butter", "Tortillas", "Confit Tomato", "Avocado", "Tasty Cheese",
  "Mozzarella Cheese", "Buffalo Cheese", "Chilli Oil", "Chilli Sauce",
  "Crispy Chilli", "L'Entrecote", "Green Curry", "Pickles",
  "Red Onion Pickle", "Steak", "Milanese", "Hash Wet Mix", "Onion Soup",
  "Tomato Soup", "Chips", "Cara. Peanuts", "Eggs (box)", "Ghee",
  "White Vinegar",
]

const CAFE_RESTOCK = [
  "Egg mix", "Chips", "H.C.C.", "Salmon", "Fish", "Pea Fritter",
  "Mustard Butter", "Tortillas", "Avocado", "Tasty Cheese", "Mozzarella",
  "Bacon", "Provolone", "Jalapeno Sauce", "BBQ Sauce", "Gochu Mayo",
  "Hot Honey", "Hash", "Pickles", "Tomato Soup", "Wombok", "Ghee",
  "White Vinegar", "Eggs (box)", "Poach Chicken",
]

const RESTAURANT_DAILY = [
  "Lime", "Lemon", "Chives", "Parsley", "Celery", "Iceberg", "Asparagus",
  "Broccolini", "Roasted Veggies", "Eggplant Parmy", "Jalapenos",
  "Lechuguita", "Crushed Garlic", "Diced PRO", "Parsley Oil",
  "Roast Hazelnut", "Chicken Skin", "Pancake Mix", "Fry OG Hash",
  "Lobster", "Lobster Mayo", "Winter Dressing", "Napoli Sauce",
  "Barramundi Sauce", "Dry Crumpets", "Crumpets", "Pasta", "Brulee",
  "Fry Capers", "Gruyere",
]

const CAFE_DAILY = [
  "Wash Lettuce", "Shallots", "Coriander", "W.C.", "Mushrooms Mix",
  "Fresh Salad", "Mint", "Guacamole", "P.D.G.", "Fry Wonton",
  "Avo Seasoning", "Tempura Mix", "Miso Dressing", "Diced Bacon",
  "Onion Burger", "Beef Patty", "Bagel Toastie", "Fry Hash Guzy",
  "Milk Buns", "Parmesan", "Halloumi", "Miso Mayo", "Lemon Dressing",
]

async function seedStation(
  station: Station,
  restock: string[],
  daily: string[]
) {
  let sort = 0
  let created = 0
  let existing = 0
  const seen = new Set<string>()

  for (const [category, names] of [
    [RESTOCK, restock],
    [DAILY, daily],
  ] as const) {
    for (const name of names) {
      const key = name.toLowerCase()
      // Items on both the restock sheet and the daily prep list (Salmon,
      // Fish, Wombok, Steak, Hash Wet Mix…) keep their restock-sheet slot.
      if (seen.has(key)) continue
      seen.add(key)
      sort += 1

      const found = await db.prepStockItem.findUnique({
        where: {
          venue_station_name: { venue: "BEACH_HOUSE", station, name },
        },
      })
      if (found) {
        existing += 1
        if (found.sortOrder !== sort) {
          await db.prepStockItem.update({
            where: { id: found.id },
            data: { sortOrder: sort },
          })
        }
        continue
      }
      await db.prepStockItem.create({
        data: {
          venue: "BEACH_HOUSE",
          station,
          name,
          category,
          sortOrder: sort,
        },
      })
      created += 1
    }
  }
  console.log(
    `${station}: ${created} created, ${existing} already present (${sort} total on sheet)`
  )
}

async function main() {
  await seedStation("RESTAURANT", RESTAURANT_RESTOCK, RESTAURANT_DAILY)
  await seedStation("CAFE", CAFE_RESTOCK, CAFE_DAILY)
  const total = await db.prepStockItem.count({
    where: { venue: "BEACH_HOUSE" },
  })
  console.log(`Beach House catalogue now holds ${total} items.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
