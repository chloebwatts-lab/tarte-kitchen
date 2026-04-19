export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import {
  getStocktake,
  getIngredientsForCount,
} from "@/lib/actions/stocktake"
import { StocktakeCount } from "@/components/stocktake-count"

export default async function StocktakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getStocktake(id)
  if (!detail) notFound()
  const ingredients = await getIngredientsForCount(id)
  return <StocktakeCount detail={detail} ingredients={ingredients} />
}
