export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { getChecklistRun } from "@/lib/actions/checklists"
import { ChecklistRunView } from "@/components/checklist-run-view"

export default async function ChecklistRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const run = await getChecklistRun(id)
  if (!run) notFound()
  return <ChecklistRunView initial={run} />
}
