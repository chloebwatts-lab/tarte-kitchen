export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { getChecklistRun } from "@/lib/actions/checklists"
import { KitchenRunView } from "@/components/kitchen-run-view"

export default async function KitchenRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const run = await getChecklistRun(id)
  if (!run) notFound()
  return <KitchenRunView initial={run} />
}
