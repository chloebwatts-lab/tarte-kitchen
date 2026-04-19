export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { RecipeCard } from "@/components/recipe-card"

export default async function PreparationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const prep = await db.preparation.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          ingredient: { select: { name: true, allergens: true, category: true } },
          subPreparation: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  })

  if (!prep) notFound()

  // Collect allergens from any ingredient used directly
  const allergens = new Set<string>()
  for (const it of prep.items) {
    if (it.ingredient?.allergens) {
      for (const a of it.ingredient.allergens) allergens.add(a)
    }
  }

  return (
    <RecipeCard
      kind="preparation"
      title={prep.name}
      subtitle={`${prep.category.replace(/_/g, " ")} · yields ${Number(prep.yieldQuantity)} ${prep.yieldUnit}`}
      cost={{
        batch: Number(prep.batchCost),
        per: prep.yieldUnit.toLowerCase().includes("serve")
          ? { value: Number(prep.costPerServe), unit: "serve" }
          : { value: Number(prep.costPerGram) * 100, unit: "100g" },
      }}
      method={prep.method}
      components={prep.items.map((it) => ({
        name:
          it.ingredient?.name ??
          it.subPreparation?.name ??
          "(unknown)",
        quantity: Number(it.quantity),
        unit: it.unit,
        isPrep: !!it.subPreparation,
      }))}
      allergens={Array.from(allergens)}
    />
  )
}
