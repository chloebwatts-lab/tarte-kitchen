"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { createStocktakeDraft } from "@/lib/actions/stocktake"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Venue } from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"
import { cn } from "@/lib/utils"

export function NewStocktakeButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [venue, setVenue] = useState<Venue>("BURLEIGH")
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const id = await createStocktakeDraft({ date, venue })
      setOpen(false)
      router.push(`/stocktake/${id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
          <Plus className="h-4 w-4" />
          New stocktake
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a new stocktake</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Venue</label>
            <div className="grid grid-cols-3 gap-2">
              {SINGLE_VENUES.map((v) => (
                <button
                  key={v}
                  onClick={() => setVenue(v)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs font-medium",
                    venue === v
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {VENUE_SHORT_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={isPending}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? "Starting…" : "Start count"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
