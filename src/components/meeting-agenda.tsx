"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { closeAgendaItem, addMeetingAction } from "@/lib/actions/meetings"
import type { AgendaBoard, AgendaItem } from "@/lib/actions/meetings"

const day = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "Australia/Brisbane",
})

function Row({ item, meetingDate }: { item: AgendaItem; meetingDate: string }) {
  const [outcome, setOutcome] = useState("")
  const [action, setAction] = useState("")
  const [owner, setOwner] = useState("")
  const [due, setDue] = useState("")
  const [error, setError] = useState("")
  const [busy, start] = useTransition()

  function close(status: "DISCUSSED" | "DROPPED") {
    setError("")
    if (status === "DISCUSSED" && !outcome.trim()) {
      setError("Record what was decided before closing it")
      return
    }
    start(async () => {
      try {
        if (action.trim()) {
          if (!owner.trim()) throw new Error("An action needs an owner")
          if (!due) throw new Error("An action needs a due date")
          await addMeetingAction({
            action,
            owner,
            dueOn: new Date(due),
            meetingDate: new Date(meetingDate),
          })
        }
        await closeAgendaItem(item.id, status, outcome)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that")
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">{item.topic}</p>
            {item.detail ? (
              <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
            ) : null}
          </div>
          <p className="flex-shrink-0 text-xs text-muted-foreground">
            {item.raisedBy ?? "unattributed"} · {item.ageDays}d
            {item.venue ? ` · ${item.venue.replace("_", " ").toLowerCase()}` : ""}
          </p>
        </div>

        <input
          type="text"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="What was decided?"
          className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-base sm:text-sm"
        />

        <div className="grid gap-2 sm:grid-cols-[1fr_140px_150px]">
          <input
            type="text"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Action (optional)"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Owner"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        <div className="flex items-center gap-2">
          <button
            onClick={() => close("DISCUSSED")}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Discussed
          </button>
          <button
            onClick={() => close("DROPPED")}
            disabled={busy}
            className="min-h-[40px] rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground disabled:opacity-50"
          >
            Drop it
          </button>
          <span className="text-xs text-muted-foreground">
            Discussed needs an outcome recorded.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function MeetingAgenda({
  board,
  meetingDate,
}: {
  board: AgendaBoard
  meetingDate: string
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold">
          On the agenda ({board.open.length})
        </h2>
        {board.open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing raised yet. Staff add items from Tarte Kitchen on the iPad,
            under Raise something.
          </p>
        ) : (
          board.open.map((i) => (
            <Row key={i.id} item={i} meetingDate={meetingDate} />
          ))
        )}
      </section>

      {board.recentlyClosed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold">Already dealt with</h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {board.recentlyClosed.map((i) => (
              <div key={i.id} className="px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {i.topic}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {i.status === "DROPPED" ? "dropped" : "discussed"} ·{" "}
                    {day.format(new Date(i.createdAt))}
                    {i.raisedBy ? ` · raised by ${i.raisedBy}` : ""}
                  </span>
                </p>
                {i.outcome ? (
                  <p className="mt-1 text-sm text-muted-foreground">{i.outcome}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
