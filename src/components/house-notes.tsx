"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Lightbulb, StickyNote, Trash2 } from "lucide-react"
import {
  addHouseNote,
  removeHouseNote,
  type HouseNote,
} from "@/lib/actions/house-notes"

const NOTE_MAX = 500
const SUGGESTION_MAX = 1000

function fmtRelative(d: Date): string {
  const ms = Date.now() - new Date(d).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

export function HouseNotesSection({
  notes,
  suggestions,
}: {
  notes: HouseNote[]
  suggestions: HouseNote[]
}) {
  const [author, setAuthor] = useState("")
  useEffect(() => {
    const saved = window.localStorage.getItem("tk-house-notes-author")
    if (saved) setAuthor(saved)
  }, [])
  function saveAuthor(name: string) {
    setAuthor(name)
    window.localStorage.setItem("tk-house-notes-author", name)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <NoteBox
        kind="note"
        title="House notes (live)"
        icon={<StickyNote className="h-4 w-4 text-green-text" />}
        blurb={
          "New facts, tone or phrasing for the email agent. Whatever you add here is used on every draft from the next tick (~2 min), no deploy needed. Notes can't override the fixed rules (the sign-off, no freebies or vouchers, no AI-sounding dashes)."
        }
        placeholder={
          'e.g. "The Tea Garden is closed the first week of September for repairs, offer the following week instead."'
        }
        max={NOTE_MAX}
        items={notes}
        author={author}
        onAuthorChange={saveAuthor}
      />
      <NoteBox
        kind="suggestion"
        title="Suggestion box"
        icon={<Lightbulb className="h-4 w-4 text-amber-text" />}
        blurb={
          "Bigger ideas, new features, or anything you're not sure about. Nothing here changes the agent by itself, it's parked for review (flagged in the daily digest) and actioned by Chloe or Claude."
        }
        placeholder={
          'e.g. "Could the agent also handle voucher purchase emails?" or "Not sure the deposit wording is right, can someone check?"'
        }
        max={SUGGESTION_MAX}
        items={suggestions}
        author={author}
        onAuthorChange={saveAuthor}
        doneLabel="Mark handled"
      />
    </div>
  )
}

function NoteBox({
  kind,
  title,
  icon,
  blurb,
  placeholder,
  max,
  items,
  author,
  onAuthorChange,
  doneLabel,
}: {
  kind: "note" | "suggestion"
  title: string
  icon: React.ReactNode
  blurb: string
  placeholder: string
  max: number
  items: HouseNote[]
  author: string
  onAuthorChange: (name: string) => void
  doneLabel?: string
}) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await addHouseNote({ kind, body, author })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setBody("")
      router.refresh()
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      await removeHouseNote(id, author || "?")
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {title}
        {items.length > 0 && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {items.length}
          </span>
        )}
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{blurb}</p>

      <div className="mt-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, max))}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-y rounded-lg border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center gap-2">
          <input
            value={author}
            onChange={(e) => onAuthorChange(e.target.value)}
            placeholder="Your name"
            className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={submit}
            disabled={isPending || !body.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Add"}
          </button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {body.length}/{max}
          </span>
        </div>
        {error && <p className="text-xs text-red-text">{error}</p>}
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className="group flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {n.body}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {n.author} · {fmtRelative(n.created_at)}
                </p>
              </div>
              <button
                onClick={() => remove(n.id)}
                disabled={isPending}
                title={doneLabel ?? "Remove"}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-red-light hover:text-red-text disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
