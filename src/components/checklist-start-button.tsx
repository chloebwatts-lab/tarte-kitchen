"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { Play } from "lucide-react"
import { startChecklistRun } from "@/lib/actions/checklists"
import type { Venue } from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"

export function ChecklistStartButton({
  templateId,
  defaultVenue,
}: {
  templateId: string
  defaultVenue: Venue
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [venue, setVenue] = useState<Venue>(defaultVenue)
  const [isPending, startTransition] = useTransition()

  function go() {
    startTransition(async () => {
      const id = await startChecklistRun({ templateId, venue })
      setOpen(false)
      router.push(`/checklists/runs/${id}`)
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
          <Play className="h-3.5 w-3.5" />
          Start today&apos;s run
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="z-50 w-56 rounded-md border border-border bg-popover p-3 shadow-md outline-none"
      >
        <div className="mb-2 text-xs font-medium">Venue</div>
        <div className="grid grid-cols-1 gap-1">
          {SINGLE_VENUES.map((v) => (
            <button
              key={v}
              onClick={() => setVenue(v)}
              className={cn(
                "rounded-md border px-2 py-1 text-left text-xs",
                venue === v
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              )}
            >
              {VENUE_SHORT_LABEL[v]}
            </button>
          ))}
        </div>
        <button
          onClick={go}
          disabled={isPending}
          className="mt-3 w-full rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Starting…" : "Start"}
        </button>
      </PopoverContent>
    </Popover>
  )
}
