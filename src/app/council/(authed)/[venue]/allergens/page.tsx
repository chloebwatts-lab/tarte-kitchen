export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma/enums"
import { SINGLE_VENUES, VENUE_LABEL } from "@/lib/venues"
import { PrintButton } from "@/components/council/print-button"

type SingleVenue = (typeof SINGLE_VENUES)[number]

function isSingleVenue(v: string): v is SingleVenue {
  return (SINGLE_VENUES as readonly string[]).includes(v)
}

const ALLERGEN_COLUMNS: { key: string; label: string }[] = [
  { key: "GLUTEN", label: "Gluten" },
  { key: "WHEAT", label: "Wheat" },
  { key: "MILK", label: "Milk" },
  { key: "EGG", label: "Egg" },
  { key: "SOY", label: "Soy" },
  { key: "SESAME", label: "Sesame" },
  { key: "PEANUT", label: "Peanut" },
  { key: "TREE_NUT", label: "Tree nut" },
  { key: "FISH", label: "Fish" },
  { key: "CRUSTACEAN", label: "Crust." },
  { key: "SHELLFISH", label: "Shellfish" },
  { key: "MOLLUSC", label: "Mollusc" },
  { key: "LUPIN", label: "Lupin" },
  { key: "SULPHITE", label: "Sulphite" },
]

export default async function CouncilAllergenMatrixPage({
  params,
}: {
  params: Promise<{ venue: string }>
}) {
  const { venue: venueParam } = await params
  if (!isSingleVenue(venueParam)) notFound()
  const venue: Venue = venueParam

  const dishes = await db.dish.findMany({
    where: { isActive: true, venue: { in: [venue, "BOTH" as Venue] } },
    include: {
      components: {
        include: {
          ingredient: { select: { allergens: true } },
          preparation: {
            include: {
              items: { include: { ingredient: { select: { allergens: true } } } },
            },
          },
        },
      },
    },
    orderBy: [{ menuCategory: "asc" }, { name: "asc" }],
  })

  // Roll up allergens across ingredients + preparation ingredients (1 level),
  // same as the dish print sheet.
  const rows = dishes.map((dish) => {
    const allergens = new Set<string>()
    for (const c of dish.components) {
      for (const a of c.ingredient?.allergens ?? []) allergens.add(a)
      if (c.preparation) {
        for (const it of c.preparation.items) {
          for (const a of it.ingredient?.allergens ?? []) allergens.add(a)
        }
      }
    }
    return { id: dish.id, name: dish.name, category: dish.menuCategory, allergens }
  })

  const byCategory = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byCategory.get(r.category) ?? []
    list.push(r)
    byCategory.set(r.category, list)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/council/${venue}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {VENUE_LABEL[venue]}
        </Link>
        <PrintButton />
      </div>

      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" />
          GCCC Inspection Folder
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          Allergen matrix
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-600">
          {VENUE_LABEL[venue]} - active dishes with allergens rolled up from the
          ingredient database (including sub-recipes). This is the kitchen&apos;s
          working reference; ingredient label verification is ongoing, so staff
          confirm against the current label before making any &ldquo;free
          from&rdquo; claim to a customer.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
          No active dishes recorded for this venue.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="bg-stone-100 text-stone-600">
                <th className="sticky left-0 bg-stone-100 px-3 py-2 text-left font-semibold">
                  Dish
                </th>
                {ALLERGEN_COLUMNS.map((a) => (
                  <th key={a.key} className="px-1.5 py-2 text-center font-semibold">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            {Array.from(byCategory.entries()).map(([category, list]) => (
              <tbody key={category} className="divide-y divide-stone-100">
                <tr>
                  <td
                    colSpan={ALLERGEN_COLUMNS.length + 1}
                    className="bg-emerald-50/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900"
                  >
                    {category.replace(/_/g, " ")}
                  </td>
                </tr>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-stone-900">
                      {r.name}
                    </td>
                    {ALLERGEN_COLUMNS.map((a) => (
                      <td key={a.key} className="px-1.5 py-1.5 text-center">
                        {r.allergens.has(a.key) ? (
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-stone-800" />
                        ) : (
                          <span className="text-stone-300">·</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-stone-400">
        Generated live from the Tarte Kitchen ingredient database.
      </p>
    </div>
  )
}
