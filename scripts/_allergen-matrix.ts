// READ-ONLY: builds an allergen matrix of all dishes, rolled up from ingredient
// allergens through preparation/sub-preparation trees. Writes JSON to stdout.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

// Non-FSANZ intolerance layer ("Other" column on the printed matrix), derived
// from ingredient names through the same prep roll-up. Added 2026-07-15 from
// the kitchen's handwritten matrix review (garlic/onion/peppers/seeds notes).
const OTHER_TOKENS: Array<[string, RegExp]> = [
  // bagel seasoning / everything bagel topping = sesame+poppy+garlic+onion;
  // bought-in chimichurri = parsley+garlic+chilli
  ["garlic", /garlic|bagel seasoning|bagel \(everything\)|chimichurri/i],
  ["onion", /onion|shallot|eshallot|leek|chive|bagel seasoning|bagel \(everything\)/i],
  ["chilli/capsicum", /chilli|jalapeno|capsicum|paprika|gochujang|cayenne|harissa|togarashi|sriracha|tabasco|sambal|chimichurri/i],
  ["pepper", /pepper ?corn|black pepper|white pepper|pepper - ground|ground pepper/i],
  ["seeds", /seed|sesame|poppy|pepita|sunflower|linseed|chia|quinoa|puffed grain|grain sliced|bagel seasoning|dukkah/i],
  ["barley", /barley|\bmalt\b/i],
]

function otherTokensFor(name: string): string[] {
  return OTHER_TOKENS.filter(([, re]) => re.test(name)).map(([t]) => t)
}

async function main() {
  // Pull everything once; resolve the prep tree in JS with memoisation so we
  // handle arbitrary nesting depth (sub-preparations of sub-preparations).
  const ingredients = await db.ingredient.findMany({
    select: { id: true, name: true, allergens: true },
  })
  const ingAllergens = new Map(ingredients.map((i) => [i.id, i.allergens]))
  const ingOther = new Map(ingredients.map((i) => [i.id, otherTokensFor(i.name)]))

  const preparations = await db.preparation.findMany({
    select: {
      id: true,
      items: {
        select: { ingredientId: true, subPreparationId: true },
      },
    },
  })
  const prepById = new Map(preparations.map((p) => [p.id, p]))

  const prepAllergenCache = new Map<string, Set<string>>()
  function prepAllergens(prepId: string, seen = new Set<string>()): Set<string> {
    if (prepAllergenCache.has(prepId)) return prepAllergenCache.get(prepId)!
    if (seen.has(prepId)) return new Set() // cycle guard
    seen.add(prepId)
    const out = new Set<string>()
    const prep = prepById.get(prepId)
    if (prep) {
      for (const item of prep.items) {
        if (item.ingredientId) {
          for (const a of ingAllergens.get(item.ingredientId) ?? []) out.add(a)
        }
        if (item.subPreparationId) {
          for (const a of prepAllergens(item.subPreparationId, seen)) out.add(a)
        }
      }
    }
    prepAllergenCache.set(prepId, out)
    return out
  }

  const prepOtherCache = new Map<string, Set<string>>()
  function prepOther(prepId: string, seen = new Set<string>()): Set<string> {
    if (prepOtherCache.has(prepId)) return prepOtherCache.get(prepId)!
    if (seen.has(prepId)) return new Set()
    seen.add(prepId)
    const out = new Set<string>()
    const prep = prepById.get(prepId)
    if (prep) {
      for (const item of prep.items) {
        if (item.ingredientId) {
          for (const t of ingOther.get(item.ingredientId) ?? []) out.add(t)
        }
        if (item.subPreparationId) {
          for (const t of prepOther(item.subPreparationId, seen)) out.add(t)
        }
      }
    }
    prepOtherCache.set(prepId, out)
    return out
  }

  const dishes = await db.dish.findMany({
    select: {
      name: true,
      venue: true,
      menuCategory: true,
      isActive: true,
      components: {
        select: { ingredientId: true, preparationId: true },
      },
    },
    orderBy: [{ venue: "asc" }, { menuCategory: "asc" }, { name: "asc" }],
  })

  const matrix = dishes.map((dish) => {
    const allergens = new Set<string>()
    const other = new Set<string>()
    for (const c of dish.components) {
      if (c.ingredientId) {
        for (const a of ingAllergens.get(c.ingredientId) ?? []) allergens.add(a)
        for (const t of ingOther.get(c.ingredientId) ?? []) other.add(t)
      }
      if (c.preparationId) {
        for (const a of prepAllergens(c.preparationId)) allergens.add(a)
        for (const t of prepOther(c.preparationId)) other.add(t)
      }
    }
    return {
      name: dish.name,
      venue: dish.venue,
      menuCategory: dish.menuCategory,
      isActive: dish.isActive,
      componentCount: dish.components.length,
      allergens: Array.from(allergens).sort(),
      other: Array.from(other).sort(),
    }
  })

  console.log(JSON.stringify(matrix, null, 2))

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
