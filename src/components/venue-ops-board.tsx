"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  assignTask,
  completeTask,
  dismissTask,
  overrideTaskPriority,
} from "@/lib/actions/venue-ops"
import type { BoardTask, MorningBoard } from "@/lib/actions/venue-ops"
import type { ReorderLine } from "@/lib/actions/venue-stock"
import type { VenueTaskPriority } from "@/generated/prisma/client"

const CATEGORY: Record<string, string> = {
  BROKEN_EQUIPMENT: "Broken equipment",
  LOW_STOCK: "Low stock",
  RUBBISH_REMOVAL: "Rubbish",
  CLEANING: "Cleaning",
  FURNITURE: "Furniture",
  BUILDING: "Building",
  MISC: "Misc",
}

const PRIORITY_CLASS: Record<VenueTaskPriority, string> = {
  URGENT: "bg-red-100 text-red-800",
  NORMAL: "bg-muted text-foreground",
  WHENEVER: "bg-muted text-muted-foreground",
}

function TaskRow({ task }: { task: BoardTask }) {
  const [owner, setOwner] = useState(task.ownedBy ?? "")
  const [busy, start] = useTransition()

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn() })

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{task.title}</p>
            {task.detail ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{task.detail}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {CATEGORY[task.category] ?? task.category}
              {task.reportedBy ? ` · ${task.reportedBy}` : ""} · {task.ageDays}d
              {task.dueAt ? ` · due ${task.dueAt.slice(0, 10)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {(["URGENT", "NORMAL", "WHENEVER"] as VenueTaskPriority[]).map((p) => (
              <button
                key={p}
                disabled={busy}
                onClick={() => run(() => overrideTaskPriority(task.id, p))}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                  task.priority === p ? PRIORITY_CLASS[p] : "text-muted-foreground"
                }`}
              >
                {p.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Who's on it?"
            className="w-40 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm"
          />
          <button
            disabled={busy}
            onClick={() => run(() => assignTask(task.id, owner))}
            className="rounded-md border border-border px-2.5 py-1.5 text-sm font-medium"
          >
            Assign
          </button>
          <span className="flex-1" />
          <button
            disabled={busy}
            onClick={() => run(() => completeTask(task.id, owner || "Board"))}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Done"}
          </button>
          <button
            disabled={busy}
            onClick={() => run(() => dismissTask(task.id))}
            className="rounded-md px-2 py-1.5 text-sm text-muted-foreground"
          >
            Dismiss
          </button>
          {task.maintenanceIssueId ? (
            <Link href="/maintenance" className="text-xs underline text-muted-foreground">
              maintenance
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function Section({ title, hint, tasks }: { title: string; hint?: string; tasks: BoardTask[] }) {
  if (tasks.length === 0) return null
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
        {hint ? <span className="text-xs text-muted-foreground">· {hint}</span> : null}
      </div>
      {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
    </section>
  )
}

export function VenueOpsBoard({
  board,
  belowPar,
}: {
  board: MorningBoard
  belowPar: ReorderLine[]
}) {
  // Assigned tasks grouped by owner, so "waiting on Shawna" reads as one block.
  const byOwner = new Map<string, BoardTask[]>()
  for (const t of board.waitingOn) {
    const k = t.ownedBy ?? "?"
    byOwner.set(k, [...(byOwner.get(k) ?? []), t])
  }

  const empty =
    board.unassigned.length + board.waitingOn.length + board.mine.length + board.stale.length === 0

  return (
    <div className="space-y-8">
      {empty ? (
        <p className="text-sm text-muted-foreground">
          Nothing open. {board.doneToday} closed today.
        </p>
      ) : null}

      <Section
        title="Needs an owner"
        hint="put a name on it, that is the whole morning job"
        tasks={board.unassigned}
      />

      {[...byOwner.entries()].map(([owner, tasks]) => (
        <Section key={owner} title={`Waiting on ${owner}`} hint="chase, don't do" tasks={tasks} />
      ))}

      <Section title="Mine" tasks={board.mine} />

      <Section
        title="Going stale"
        hint="open more than a week"
        tasks={board.stale}
      />

      {belowPar.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="font-serif text-lg font-semibold">To order</h2>
            <span className="text-xs text-muted-foreground">{belowPar.length} below par</span>
          </div>
          <div className="divide-y divide-border rounded-lg border border-border">
            {belowPar.map((l) => (
              <div key={l.itemId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>
                  {l.name}
                  <span className="ml-2 text-xs text-muted-foreground">{l.area}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {l.tracking === "SIGNAL"
                    ? `${l.signal.toLowerCase()}${l.flaggedBy ? ` · ${l.flaggedBy}` : ""}`
                    : `${l.onHand ?? "?"} / par ${l.parLevel ?? "?"}${l.unit ? ` ${l.unit}` : ""}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
