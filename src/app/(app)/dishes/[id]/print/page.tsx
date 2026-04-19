export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { RecipeCard } from "@/components/recipe-card"

export default async function DishPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const dish = await db.dish.findUnique({
    where: { id },
    include: {
      components: {
        include: {
          ingredient: { select: { name: true, allergens: true } },
          preparation: {
            include: {
              items: {
                include: {
                  ingredient: { select: { allergens: true } },
                },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  })

  if (!dish) notFound()

  // Roll up allergens across ingredients + preparation ingredients (1 level)
  const allergens = new Set<string>()
  for (const c of dish.components) {
    if (c.ingredient?.allergens) {
      for (const a of c.ingredient.allergens) allergens.add(a)
    }
    if (c.preparation) {
      for (const it of c.preparation.items) {
        for (const a of it.ingredient?.allergens ?? []) allergens.add(a)
      }
    }
  }

  return (
    <RecipeCard
      kind="dish"
      title={dish.name}
      subtitle={`${dish.menuCategory.replace(/_/g, " ")} · ${dish.venue.replace(/_/g, " ")} · sell $${Number(dish.sellingPrice).toFixed(2)}`}
      cost={{
        batch: Number(dish.totalCost),
        per: {
          value: Number(dish.foodCostPercentage),
          unit: "% FC",
        },
      }}
      method={null}
      components={dish.components.map((c) => ({
        name: c.ingredient?.name ?? c.preparation?.name ?? "(unknown)",
        quantity: Number(c.quantity),
        unit: c.unit,
        isPrep: !!c.preparation,
      }))}
      allergens={Array.from(allergens)}
    />
  )
}
