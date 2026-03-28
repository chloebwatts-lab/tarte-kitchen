"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { recalculateAll } from "@/lib/actions/ingredients"

export function RecalculateButton() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      await recalculateAll()
      router.refresh()
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="gap-1.5"
      title="Recalculate every preparation and dish cost from scratch"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Recalculating…" : "Recalculate All Costs"}
    </Button>
  )
}
