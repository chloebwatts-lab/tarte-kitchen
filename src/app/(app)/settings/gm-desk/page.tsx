export const dynamic = "force-dynamic"

import { gmPasswordIsSet } from "@/lib/gm-auth"
import { getGmEmail } from "@/lib/gm/board"
import { GmDeskSettingsForm } from "@/components/gm-desk-settings-form"

export default async function GmDeskSettingsPage() {
  const [isSet, email] = await Promise.all([gmPasswordIsSet(), getGmEmail()])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">GM desk (Oliver)</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Oliver&apos;s own tile on Staff tools, at kitchen.tarte.com.au/kitchen/gm. It has its own password, separate
          from the managers one, and stays unlocked on his device for 30 days. Anyone signed in here on the office
          side gets through without it, so you can open his desk any time.
        </p>
      </div>
      <GmDeskSettingsForm isSet={isSet} email={email} />
    </div>
  )
}
