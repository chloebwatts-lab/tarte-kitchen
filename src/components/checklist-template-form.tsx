"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { GripVertical, Plus, Trash2, Thermometer, MessageSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { createChecklistTemplate } from "@/lib/actions/checklists"
import type {
  Venue,
  ChecklistCadence,
  ChecklistShift,
} from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"

interface LocalItem {
  key: string
  label: string
  instructions: string
  requireTemp: boolean
  requireNote: boolean
}

function mkKey() {
  return Math.random().toString(36).slice(2)
}

export function ChecklistTemplateForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [area, setArea] = useState("")
  const [venue, setVenue] = useState<Venue>("BOTH")
  const [cadence, setCadence] = useState<ChecklistCadence>("DAILY")
  const [shift, setShift] = useState<ChecklistShift>("OPEN")
  const [isFoodSafety, setIsFoodSafety] = useState(false)
  const [dueByHour, setDueByHour] = useState<string>("")
  const [alertEmails, setAlertEmails] = useState<string>("")
  const [items, setItems] = useState<LocalItem[]>([
    {
      key: mkKey(),
      label: "",
      instructions: "",
      requireTemp: false,
      requireNote: false,
    },
  ])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function updateItem(key: string, patch: Partial<LocalItem>) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it))
    )
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        key: mkKey(),
        label: "",
        instructions: "",
        requireTemp: false,
        requireNote: false,
      },
    ])
  }

  function submit() {
    setError(null)
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    const cleanItems = items
      .map((it) => ({
        label: it.label.trim(),
        instructions: it.instructions.trim() || undefined,
        requireTemp: it.requireTemp,
        requireNote: it.requireNote,
      }))
      .filter((it) => it.label)

    if (cleanItems.length === 0) {
      setError("Add at least one item")
      return
    }

    const parsedEmails = alertEmails
      .split(/[,\n;]/)
      .map((e) => e.trim())
      .filter(Boolean)
    const parsedDue =
      dueByHour.trim() === ""
        ? null
        : Math.max(0, Math.min(23, Math.round(Number(dueByHour) || 0)))

    startTransition(async () => {
      try {
        await createChecklistTemplate({
          name: name.trim(),
          area: area.trim() || undefined,
          venue,
          cadence,
          shift,
          isFoodSafety,
          dueByHour: parsedDue,
          alertEmails: parsedEmails,
          items: cleanItems,
        })
        router.push("/checklists")
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, idx) => (
            <div
              key={it.key}
              className="rounded-md border border-border bg-white p-3"
            >
              <div className="flex items-start gap-2">
                <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="mt-1 w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                  {idx + 1}.
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    value={it.label}
                    onChange={(e) =>
                      updateItem(it.key, { label: e.target.value })
                    }
                    placeholder='e.g. "Check walk-in fridge temp"'
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  />
                  <input
                    value={it.instructions}
                    onChange={(e) =>
                      updateItem(it.key, { instructions: e.target.value })
                    }
                    placeholder="Instructions (optional)"
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                  />
                  <div className="flex flex-wrap gap-3">
                    <label className="inline-flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={it.requireTemp}
                        onChange={(e) =>
                          updateItem(it.key, { requireTemp: e.target.checked })
                        }
                      />
                      <Thermometer className="h-3 w-3 text-emerald-600" />
                      Require temperature
                    </label>
                    <label className="inline-flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={it.requireNote}
                        onChange={(e) =>
                          updateItem(it.key, { requireNote: e.target.checked })
                        }
                      />
                      <MessageSquare className="h-3 w-3" />
                      Require note
                    </label>
                  </div>
                </div>
                <button
                  onClick={() => removeItem(it.key)}
                  className="mt-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={addItem}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Opening checklist — front of house"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Area</label>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Front of house, Pastry section…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Venue</label>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setVenue("BOTH")}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  venue === "BOTH"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white"
                )}
              >
                All venues
              </button>
              {SINGLE_VENUES.map((v) => (
                <button
                  key={v}
                  onClick={() => setVenue(v)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs",
                    venue === v
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white"
                  )}
                >
                  {VENUE_SHORT_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Cadence</label>
            <div className="grid grid-cols-2 gap-1">
              {(["DAILY", "WEEKLY", "MONTHLY", "ON_DEMAND"] as const).map(
                (c) => (
                  <button
                    key={c}
                    onClick={() => setCadence(c)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      cadence === c
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white"
                    )}
                  >
                    {c.replace("_", " ")}
                  </button>
                )
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Shift</label>
            <div className="grid grid-cols-4 gap-1">
              {(["OPEN", "MID", "CLOSE", "ANY"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setShift(s)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs",
                    shift === s
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
            <input
              type="checkbox"
              checked={isFoodSafety}
              onChange={(e) => setIsFoodSafety(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Food safety / HACCP</span>
              <span className="block text-muted-foreground">
                Completed runs surface in Reports → Food Safety for audits.
              </span>
            </span>
          </label>

          <div className="rounded-md border border-border bg-amber-50/50 p-2 space-y-2">
            <div className="text-xs font-medium">Alert if overdue</div>
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                value={dueByHour}
                onChange={(e) =>
                  setDueByHour(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))
                }
                placeholder="e.g. 15"
                className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
              />
              <span className="text-xs text-muted-foreground">
                due by (hour, 24h AEST)
              </span>
            </div>
            <textarea
              value={alertEmails}
              onChange={(e) => setAlertEmails(e.target.value)}
              placeholder="manager1@tarte.com.au, manager2@tarte.com.au"
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Leave both blank to disable alerts. When the hour passes and
              the checklist is still incomplete, an email goes to every
              listed address (one per template per day — no spam).
            </p>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
              {error}
            </p>
          )}

          <button
            onClick={submit}
            disabled={isPending}
            className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create template"}
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
