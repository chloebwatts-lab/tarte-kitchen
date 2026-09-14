export const dynamic = "force-dynamic"

import { managerPasswordIsSet } from "@/lib/manager-auth"
import { ManagerPasswordForm } from "@/components/manager-password-form"

export default async function ManagerPasswordPage() {
  const isSet = await managerPasswordIsSet()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Managers password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Second password inside Staff tools, for line-up, the morning board, Said + Done,
          the meeting agenda and training records. Anyone signed in here gets through without it.
        </p>
      </div>
      <ManagerPasswordForm isSet={isSet} />
    </div>
  )
}
