import { db } from "@/lib/db"

/**
 * Collect allergens for a set of preparations by walking their full
 * sub-preparation trees (any depth, cycle-safe). Print cards previously
 * rolled up one level only, silently dropping allergens carried by
 * nested preps (e.g. a miso mayo base inside a sauce inside a dish),
 * which is a food-safety problem, not a cosmetic one.
 */
export async function collectPrepAllergens(
  prepIds: string[]
): Promise<Set<string>> {
  const allergens = new Set<string>()
  const visited = new Set<string>()
  let frontier = prepIds.filter(Boolean)

  while (frontier.length > 0) {
    const batch = frontier.filter((id) => !visited.has(id))
    if (batch.length === 0) break
    for (const id of batch) visited.add(id)

    const items = await db.preparationItem.findMany({
      where: { preparationId: { in: batch } },
      select: {
        subPreparationId: true,
        ingredient: { select: { allergens: true } },
      },
    })

    frontier = []
    for (const it of items) {
      for (const a of it.ingredient?.allergens ?? []) allergens.add(a)
      if (it.subPreparationId) frontier.push(it.subPreparationId)
    }
  }

  return allergens
}
