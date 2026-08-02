export const dynamic = "force-dynamic"

import {
  ensureStandingCommitments,
  getCommitmentsBoard,
} from "@/lib/actions/commitments"
import { CommitmentsDashboard } from "@/components/commitments-dashboard"

export default async function CommitmentsPage() {
  await ensureStandingCommitments()
  const board = await getCommitmentsBoard()

  return (
    <div className="container max-w-6xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Commitments — Said + Done</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The kitchen reset sheet, digitised. Jose sees a read-only copy on the
          kitchen iPad at <span className="font-mono">/kitchen/commitments</span>.
        </p>
      </header>
      <CommitmentsDashboard board={board} />
    </div>
  )
}
