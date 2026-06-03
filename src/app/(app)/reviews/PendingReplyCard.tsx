"use client"

import { useState, useTransition } from "react"
import { Star, Check, X, Pencil } from "lucide-react"
import { approveReply, skipReply } from "@/lib/actions/review-replies"

export interface PendingReplyCardProps {
  id: string
  venueLabel: string
  rating: number
  authorName: string | null
  publishedLabel: string
  text: string | null
  initialDraft: string
  /** True if the review is in GBP format (so auto-posting will work). */
  isGbpFormat: boolean
}

export function PendingReplyCard(props: PendingReplyCardProps) {
  const [draft, setDraft] = useState(props.initialDraft)
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<
    | { kind: "idle" }
    | { kind: "posted" }
    | { kind: "skipped" }
    | { kind: "fallback"; reason: string }
    | { kind: "error"; error: string }
  >({ kind: "idle" })

  const onApprove = () => {
    startTransition(async () => {
      const r = await approveReply(props.id, draft)
      if (!r.ok) setResult({ kind: "error", error: r.error })
      else if (r.posted) setResult({ kind: "posted" })
      else setResult({ kind: "fallback", reason: r.reason })
    })
  }
  const onSkip = () => {
    startTransition(async () => {
      const r = await skipReply(props.id)
      if (!r.ok) setResult({ kind: "error", error: r.error })
      else setResult({ kind: "skipped" })
    })
  }

  if (result.kind === "posted") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Check className="h-4 w-4" /> Posted to Google
        </div>
        <p className="mt-1 text-xs text-emerald-700">
          {props.venueLabel} · {props.authorName ?? "Anonymous"}
        </p>
      </div>
    )
  }
  if (result.kind === "skipped") {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">
        Skipped · {props.venueLabel} · {props.authorName ?? "Anonymous"}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      {/* Review header */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-3.5 w-3.5 ${
                i < props.rating
                  ? "fill-amber-400 text-amber-400"
                  : "fill-stone-200 text-stone-200"
              }`}
            />
          ))}
        </div>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-stone-600">
          {props.venueLabel}
        </span>
        <span className="ml-auto text-xs text-stone-400">
          {props.publishedLabel} · {props.authorName ?? "Anonymous"}
        </span>
      </div>

      {/* Review text */}
      {props.text && (
        <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
          {props.text}
        </p>
      )}

      {/* Draft reply — view or edit */}
      <div className="mb-3 rounded-md border border-stone-200 bg-stone-50 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Suggested reply
          </span>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-stone-600 hover:bg-stone-200"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(4, Math.ceil(draft.length / 90))}
            className="w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed text-stone-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
            {draft}
          </p>
        )}
      </div>

      {/* Fallback note (if last action returned posted:false) */}
      {result.kind === "fallback" && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Couldn't auto-post: {result.reason}
        </div>
      )}
      {result.kind === "error" && (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {result.error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {isPending ? "Posting…" : "Approve & post"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Skip
        </button>
        {!props.isGbpFormat && (
          <span className="ml-2 text-[11px] text-amber-700">
            (Places-only review — approve will fall back to manual copy)
          </span>
        )}
      </div>
    </div>
  )
}
