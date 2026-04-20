"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { triggerDeputySync } from "@/lib/actions/deputy"

interface Props {
  lastSyncedAt: string | null
}

export function LabourRefreshButton({ lastSyncedAt }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function handleRefresh() {
    setMsg(null)
    startTransition(async () => {
      try {
        const r = await triggerDeputySync()
        setMsg(
          `Synced ${r.upserted} shifts${r.skipped ? ` (${r.skipped} skipped — unmapped venue)` : ""}`
        )
      } catch (e) {
        setMsg(`Error: ${(e as Error).message}`)
      }
      router.refresh()
    })
  }

  const last = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "never"

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRefresh}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
        />
        {isPending ? "Refreshing…" : "Refresh now"}
      </button>
      <span className="text-[10px] text-muted-foreground">
        {msg ?? `Last sync: ${last}`}
      </span>
    </div>
  )
}
