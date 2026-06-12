"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { Allergen } from "@/generated/prisma"

// The tarte-inbox email agent (separate repo, same Postgres) assesses
// ingredient allergens so it can answer customer dietary emails. Its
// inbox_allergen_assessments table is not in our Prisma schema, so we
// read/write it via raw SQL like inbox-playbooks does. A dish only earns
// "free from X" claims in customer emails once every leaf ingredient has
// a confident assessment.

const ALLERGEN_VALUES: Allergen[] = [
  "MILK",
  "EGG",
  "FISH",
  "SHELLFISH",
  "CRUSTACEAN",
  "MOLLUSC",
  "TREE_NUT",
  "PEANUT",
  "WHEAT",
  "GLUTEN",
  "SOY",
  "SESAME",
  "LUPIN",
  "SULPHITE",
]

export interface AllergenVerificationRow {
  id: string
  name: string
  supplierName: string | null
  category: string
  /** Allergens currently declared on Ingredient.allergens */
  currentAllergens: Allergen[]
  /** Best-guess allergens from the inbox assessment (jsonb) */
  guessAllergens: Allergen[]
  /** null = the inbox agent has no assessment row for this ingredient */
  confident: boolean | null
  rationale: string | null
  source: string | null
  assessedAt: string | null
}

interface AssessmentRow {
  ingredient_id: string
  allergens: string[]
  confident: boolean
  rationale: string | null
  source: string
  assessed_at: Date
}

export async function getAllergenVerificationRows(): Promise<
  AllergenVerificationRow[]
> {
  const [ingredients, assessments] = await Promise.all([
    db.ingredient.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        allergens: true,
        supplier: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.$queryRawUnsafe<AssessmentRow[]>(
      `SELECT ingredient_id, allergens, confident, rationale, source, assessed_at
         FROM inbox_allergen_assessments`
    ),
  ])

  const byIngredientId = new Map(assessments.map((a) => [a.ingredient_id, a]))

  return ingredients.map((i) => {
    const a = byIngredientId.get(i.id)
    return {
      id: i.id,
      name: i.name,
      supplierName: i.supplier?.name ?? null,
      category: i.category,
      currentAllergens: i.allergens,
      guessAllergens: (a?.allergens ?? []).filter((v): v is Allergen =>
        ALLERGEN_VALUES.includes(v as Allergen)
      ),
      confident: a?.confident ?? null,
      rationale: a?.rationale ?? null,
      source: a?.source ?? null,
      assessedAt: a ? a.assessed_at.toISOString() : null,
    }
  })
}

export interface AllergenProgress {
  totalIngredients: number
  verifiedIngredients: number
  totalDishes: number
  verifiedDishes: number
}

export async function getAllergenProgress(): Promise<AllergenProgress> {
  const [totalIngredients, [counts]] = await Promise.all([
    db.ingredient.count(),
    db.$queryRawUnsafe<
      Array<{
        verified_ingredients: number
        total_dishes: number
        verified_dishes: number
      }>
    >(
      // Leaf ingredients of a dish: direct DishComponent ingredients plus
      // everything reachable through preparations and sub-preparations.
      // UNION (not UNION ALL) so a sub-preparation cycle can't loop forever.
      `WITH RECURSIVE prep_leaves AS (
         SELECT pi."preparationId" AS root_prep_id,
                pi."ingredientId"  AS ingredient_id,
                pi."subPreparationId" AS sub_prep_id
           FROM "PreparationItem" pi
         UNION
         SELECT pl.root_prep_id, pi."ingredientId", pi."subPreparationId"
           FROM prep_leaves pl
           JOIN "PreparationItem" pi ON pi."preparationId" = pl.sub_prep_id
       ),
       dish_leaf_ingredients AS (
         SELECT dc."dishId" AS dish_id, dc."ingredientId" AS ingredient_id
           FROM "DishComponent" dc
          WHERE dc."ingredientId" IS NOT NULL
         UNION
         SELECT dc."dishId", pl.ingredient_id
           FROM "DishComponent" dc
           JOIN prep_leaves pl ON pl.root_prep_id = dc."preparationId"
          WHERE pl.ingredient_id IS NOT NULL
       )
       SELECT
         (SELECT count(*)::int
            FROM "Ingredient" i
            JOIN inbox_allergen_assessments a
              ON a.ingredient_id = i.id AND a.confident
         ) AS verified_ingredients,
         (SELECT count(*)::int FROM "Dish") AS total_dishes,
         (SELECT count(*)::int
            FROM "Dish" d
           WHERE EXISTS (
                   SELECT 1 FROM dish_leaf_ingredients dli
                    WHERE dli.dish_id = d.id
                 )
             AND NOT EXISTS (
                   SELECT 1 FROM dish_leaf_ingredients dli
                    WHERE dli.dish_id = d.id
                      AND NOT EXISTS (
                            SELECT 1 FROM inbox_allergen_assessments a
                             WHERE a.ingredient_id = dli.ingredient_id
                               AND a.confident
                          )
                 )
         ) AS verified_dishes`
    ),
  ])

  return {
    totalIngredients,
    verifiedIngredients: counts.verified_ingredients,
    totalDishes: counts.total_dishes,
    verifiedDishes: counts.verified_dishes,
  }
}

/**
 * Staff checked the physical product label. Writes the declared allergens
 * to Ingredient.allergens and marks the inbox assessment confident so the
 * email agent can use this ingredient in "free from" claims.
 */
export async function verifyIngredientAllergens(
  ingredientId: string,
  allergens: string[]
): Promise<void> {
  const invalid = allergens.filter(
    (a) => !ALLERGEN_VALUES.includes(a as Allergen)
  )
  if (invalid.length > 0) {
    throw new Error(`Unknown allergens: ${invalid.join(", ")}`)
  }

  const ingredient = await db.ingredient.update({
    where: { id: ingredientId },
    data: { allergens: allergens as Allergen[] },
    select: { name: true },
  })

  await db.$executeRawUnsafe(
    `INSERT INTO inbox_allergen_assessments
       (ingredient_id, ingredient_name, allergens, confident, rationale, assessed_at, source)
     VALUES ($1, $2, $3::jsonb, true, $4, now(), 'human')
     ON CONFLICT (ingredient_id) DO UPDATE
        SET ingredient_name = EXCLUDED.ingredient_name,
            allergens       = EXCLUDED.allergens,
            confident       = true,
            rationale       = EXCLUDED.rationale,
            assessed_at     = now(),
            source          = 'human'`,
    ingredientId,
    ingredient.name,
    JSON.stringify(allergens),
    "Verified from product label by kitchen staff"
  )

  revalidatePath("/ingredients/allergens")
  revalidatePath("/ingredients")
}
