export const dynamic = "force-dynamic"

import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getIngredients } from "@/lib/actions/ingredients"
import { getSuppliers } from "@/lib/actions/suppliers"
import { IngredientsTable } from "@/components/ingredients-table"
import { IngredientForm } from "@/components/ingredient-form"

export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { search, category } = await searchParams

  const [ingredients, suppliers] = await Promise.all([
    getIngredients({
      search: typeof search === "string" ? search : undefined,
      category: typeof category === "string" ? category : undefined,
    }),
    getSuppliers(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ingredients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""} in your kitchen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/ingredients/allergens">
              <ShieldAlert className="mr-1.5 h-4 w-4" />
              Allergen verification
            </Link>
          </Button>
          <IngredientForm suppliers={suppliers} />
        </div>
      </div>

      <IngredientsTable
        ingredients={ingredients}
        suppliers={suppliers}
        initialSearch={typeof search === "string" ? search : ""}
        initialCategory={typeof category === "string" ? category : "ALL"}
      />
    </div>
  )
}
