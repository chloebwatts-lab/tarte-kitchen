"use client"

import { Printer, ArrowLeft } from "lucide-react"

export interface RecipeCardProps {
  kind: "preparation" | "dish"
  title: string
  subtitle: string
  cost: {
    batch: number
    per: { value: number; unit: string }
  }
  method: string | null
  components: {
    name: string
    quantity: number
    unit: string
    isPrep: boolean
  }[]
  allergens: string[]
}

const ALLERGEN_LABEL: Record<string, string> = {
  MILK: "Milk",
  EGG: "Egg",
  FISH: "Fish",
  SHELLFISH: "Shellfish",
  CRUSTACEAN: "Crustacean",
  MOLLUSC: "Mollusc",
  TREE_NUT: "Tree nut",
  PEANUT: "Peanut",
  WHEAT: "Wheat",
  GLUTEN: "Gluten",
  SOY: "Soy",
  SESAME: "Sesame",
  LUPIN: "Lupin",
  SULPHITE: "Sulphite",
}

export function RecipeCard({
  kind,
  title,
  subtitle,
  cost,
  method,
  components,
  allergens,
}: RecipeCardProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Floating controls — hidden on print */}
      <div className="fixed right-4 top-4 z-10 flex gap-2 print:hidden">
        <button
          onClick={() => history.back()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-gray-800"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
      </div>

      <div className="mx-auto max-w-[720px] px-10 py-12 print:p-0">
        {/* Header */}
        <div className="flex items-baseline justify-between border-b-2 border-gray-900 pb-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              {kind === "preparation" ? "Preparation · SOP" : "Menu item · Recipe"}
            </div>
            <h1 className="mt-1 text-3xl font-bold leading-tight">{title}</h1>
            <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              Batch cost
            </div>
            <div className="text-2xl font-bold tabular-nums">
              ${cost.batch.toFixed(2)}
            </div>
            <div className="text-xs tabular-nums text-gray-600">
              ${cost.per.value.toFixed(2)} / {cost.per.unit}
            </div>
          </div>
        </div>

        {/* Allergens */}
        {allergens.length > 0 && (
          <div className="mt-6 rounded-md border-2 border-red-200 bg-red-50 p-4 print:border print:bg-white">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-700">
              Contains allergens
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {allergens.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center rounded-full border border-red-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-red-800"
                >
                  {ALLERGEN_LABEL[a] ?? a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Components */}
        <div className="mt-8">
          <h2 className="border-b border-gray-300 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Ingredients
          </h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {components.map((c, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-3 tabular-nums text-gray-600">
                    {Number.isInteger(c.quantity)
                      ? c.quantity
                      : c.quantity.toFixed(2)}{" "}
                    {c.unit}
                  </td>
                  <td className="py-2">
                    {c.name}
                    {c.isPrep && (
                      <span className="ml-1 inline-flex items-center rounded-sm bg-gray-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-600">
                        prep
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Method */}
        {method && (
          <div className="mt-8">
            <h2 className="border-b border-gray-300 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              Method
            </h2>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {method}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 border-t border-gray-200 pt-3 text-[10px] text-gray-500 print:fixed print:bottom-4 print:left-10 print:right-10">
          Tarte Kitchen — generated {new Date().toLocaleDateString("en-AU")}
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 18mm 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}
