// READ-ONLY: for dishes that rolled up to ZERO allergens, show exactly why —
// list every leaf ingredient and whether its allergens field is empty.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const ings = await db.ingredient.findMany({ select: { id: true, name: true, allergens: true } })
  const ingById = new Map(ings.map((i) => [i.id, i]))
  const preps = await db.preparation.findMany({
    select: { id: true, name: true, items: { select: { ingredientId: true, subPreparationId: true } } },
  })
  const prepById = new Map(preps.map((p) => [p.id, p]))

  // collect leaf ingredient ids under a prep (recursive)
  function leafIngs(prepId: string, seen = new Set<string>()): string[] {
    if (seen.has(prepId)) return []
    seen.add(prepId)
    const out: string[] = []
    const p = prepById.get(prepId)
    if (!p) return out
    for (const it of p.items) {
      if (it.ingredientId) out.push(it.ingredientId)
      if (it.subPreparationId) out.push(...leafIngs(it.subPreparationId, seen))
    }
    return out
  }

  const dishes = await db.dish.findMany({
    where: { isActive: true },
    select: {
      name: true, venue: true,
      components: { select: { ingredientId: true, preparationId: true, preparation: { select: { name: true } } } },
    },
  })

  // total ingredient allergen-fill stats
  const totalIng = ings.length
  const emptyIng = ings.filter((i) => i.allergens.length === 0).length
  console.log(`INGREDIENTS: ${totalIng} total, ${emptyIng} with EMPTY allergen field (${Math.round(emptyIng/totalIng*100)}%)\n`)

  for (const d of dishes) {
    // gather leaf ingredient ids
    const leaves: string[] = []
    let hasComponents = d.components.length > 0
    for (const c of d.components) {
      if (c.ingredientId) leaves.push(c.ingredientId)
      if (c.preparationId) leaves.push(...leafIngs(c.preparationId))
    }
    const allergens = new Set<string>()
    for (const id of leaves) for (const a of ingById.get(id)?.allergens ?? []) allergens.add(a)
    if (allergens.size > 0) continue // only show the zero-allergen dishes

    console.log(`■ ${d.venue}  ${d.name}`)
    if (!hasComponents) { console.log("    └─ NO recipe components linked at all\n"); continue }
    const uniq = Array.from(new Set(leaves))
    if (uniq.length === 0) { console.log("    └─ components exist but resolve to no ingredients\n"); continue }
    for (const id of uniq) {
      const ing = ingById.get(id)
      console.log(`    └─ ${ing?.name}  ::  ${ing?.allergens.length ? ing.allergens.join(",") : "(empty)"}`)
    }
    console.log()
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
