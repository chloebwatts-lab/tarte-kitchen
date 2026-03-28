export const dynamic = "force-dynamic"

import { getDishes } from "@/lib/actions/dishes"
import { DishesTable } from "@/components/dishes-table"
import { DishForm } from "@/components/dish-form"
import { RecalculateButton } from "@/components/recalculate-button"

export default async function DishesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { search, menuCategory, venue } = await searchParams

  const dishes = await getDishes({
    search: typeof search === "string" ? search : undefined,
    menuCategory: typeof menuCategory === "string" ? menuCategory : undefined,
    venue: typeof venue === "string" ? venue : undefined,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Menu Items</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dishes.length} dish{dishes.length !== 1 ? "es" : ""} on your menu
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RecalculateButton />
          <DishForm />
        </div>
      </div>

      <DishesTable
        dishes={dishes}
        initialSearch={typeof search === "string" ? search : ""}
        initialCategory={typeof menuCategory === "string" ? menuCategory : "ALL"}
        initialVenue={typeof venue === "string" ? venue : "ALL"}
      />
    </div>
  )
}
