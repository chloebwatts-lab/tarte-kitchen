export const dynamic = "force-dynamic"

import { requireGm } from "@/lib/gm-auth"
import { getGmBoard } from "@/lib/actions/gm"
import { GmDesk } from "@/components/kitchen/GmDesk"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export default async function GmDeskPage() {
  await requireGm("/kitchen/gm")
  const board = await getGmBoard()
  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver" }]} />
      <GmDesk board={board} />
    </div>
  )
}
