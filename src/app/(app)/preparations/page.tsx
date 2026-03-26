import { getPreparations } from "@/lib/actions/preparations"
import { PreparationsGrid } from "@/components/preparations-grid"
import { PreparationForm } from "@/components/preparation-form"

export default async function PreparationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { search, category } = await searchParams

  const preparations = await getPreparations({
    search: typeof search === "string" ? search : undefined,
    category: typeof category === "string" ? category : undefined,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Preparations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {preparations.length} preparation{preparations.length !== 1 ? "s" : ""} in your kitchen
          </p>
        </div>
        <PreparationForm />
      </div>

      <PreparationsGrid
        preparations={preparations}
        initialSearch={typeof search === "string" ? search : ""}
        initialCategory={typeof category === "string" ? category : "ALL"}
      />
    </div>
  )
}
