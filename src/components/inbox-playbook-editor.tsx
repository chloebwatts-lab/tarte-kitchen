"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Trash2,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Check,
  Forward,
} from "lucide-react"
import { saveInboxPlaybook, type InboxPlaybook } from "@/lib/actions/inbox-playbooks"

const CATEGORY_LABELS: Record<string, string> = {
  events_tea_garden_high_tea: "Tea Garden — High Tea",
  events_tea_garden_functions: "Tea Garden — Functions",
  events_beach_house_functions: "Beach House — Functions",
  suppliers: "Suppliers",
  reviews: "Reviews",
  bookings_dine_in: "Bookings (dine-in)",
  job_applications: "Job applications",
  marketing_cold_outreach: "Marketing / Cold outreach",
  accounts_invoices: "Accounts / Invoices",
  needs_human: "Needs human",
}

const CATEGORY_GROUP: Record<string, string> = {
  events_tea_garden_high_tea: "Events",
  events_tea_garden_functions: "Events",
  events_beach_house_functions: "Events",
  suppliers: "Operations",
  reviews: "Operations",
  bookings_dine_in: "Operations",
  job_applications: "Operations",
  marketing_cold_outreach: "Other",
  accounts_invoices: "Other",
  needs_human: "Other",
}

export function InboxPlaybookEditor({
  playbook,
  defaultOpen = false,
}: {
  playbook: InboxPlaybook
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [voice, setVoice] = useState(playbook.voice_guidance)
  const [template, setTemplate] = useState(playbook.reply_template ?? "")
  const [autoSend, setAutoSend] = useState(playbook.auto_send)
  const [minConf, setMinConf] = useState(playbook.min_confidence)
  const [examples, setExamples] = useState(playbook.examples ?? [])
  const [attachments, setAttachments] = useState<string[]>(
    playbook.default_attachment_paths ?? []
  )
  const [forwardTo, setForwardTo] = useState<string>(
    playbook.forward_to ?? ""
  )
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isPending, startTransition] = useTransition()

  function addExample() {
    setExamples((prev) => [...prev, { incoming: "", reply: "" }])
  }
  function removeExample(idx: number) {
    setExamples((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateExample(
    idx: number,
    patch: Partial<{ incoming: string; reply: string }>
  ) {
    setExamples((prev) =>
      prev.map((ex, i) => (i === idx ? { ...ex, ...patch } : ex))
    )
  }

  function save() {
    startTransition(async () => {
      await saveInboxPlaybook({
        ...playbook,
        voice_guidance: voice,
        reply_template: template || null,
        auto_send: autoSend,
        min_confidence: minConf,
        examples,
        default_attachment_paths: attachments
          .map((s) => s.trim())
          .filter(Boolean),
        forward_to: forwardTo.trim() || null,
      })
      setSavedAt(new Date())
      router.refresh()
    })
  }

  const label = CATEGORY_LABELS[playbook.category] ?? playbook.category
  const group = CATEGORY_GROUP[playbook.category] ?? "Other"

  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-stone-50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-stone-900">{label}</h3>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">
              {group}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-stone-500 line-clamp-1">
            {playbook.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {forwardTo && (
            <span
              className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200"
              title={`Forwards to ${forwardTo}`}
            >
              <Forward className="h-3 w-3" />
              {forwardTo}
            </span>
          )}
          {attachments.length > 0 && (
            <span
              className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200"
              title={`Attaches: ${attachments.join(", ")}`}
            >
              <Paperclip className="h-3 w-3" />
              {attachments.length}
            </span>
          )}
          {examples.length > 0 && (
            <span className="rounded-full bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200">
              {examples.length} example{examples.length === 1 ? "" : "s"}
            </span>
          )}
          {autoSend ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
              <Check className="h-3 w-3" />
              auto-send
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
              draft only
            </span>
          )}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-stone-200 bg-stone-50/50 px-5 py-5 space-y-5">
          <Field
            label="Voice guidance"
            hint="How Claude should write — tone, openers, sign-offs, do's and don'ts."
          >
            <textarea
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-400 focus:ring-0"
              rows={3}
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            />
          </Field>

          <Field
            label="Reply template"
            hint="Optional skeleton. Use {{first_name}} placeholders. Leave blank to let Claude draft from scratch each time."
          >
            <textarea
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-mono leading-relaxed focus:border-stone-400 focus:ring-0"
              rows={6}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Hey {{first_name}},&#10;&#10;…&#10;&#10;Kind regards,&#10;Tarte Team"
            />
          </Field>

          <Field
            label="Forward to (instead of drafting a reply)"
            hint="When set, the agent forwards the incoming email to this address rather than drafting a reply to the original sender. Leave blank for normal draft behaviour. Used for job applications going to work@tarte.com.au."
          >
            <input
              type="email"
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-400 focus:ring-0"
              value={forwardTo}
              onChange={(e) => setForwardTo(e.target.value)}
              placeholder="work@tarte.com.au"
            />
          </Field>

          <Field
            label="Default attachments"
            hint={
              <>
                Filenames in{" "}
                <code className="rounded bg-stone-100 px-1 py-0.5 text-[10px]">
                  /root/tarte-inbox/attachments/
                </code>{" "}
                — one per line. Attached only on our first reply in a thread.
              </>
            }
          >
            <textarea
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-mono focus:border-stone-400 focus:ring-0"
              rows={2}
              value={attachments.join("\n")}
              onChange={(e) =>
                setAttachments(
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              placeholder="functions-events-packages.pdf"
            />
          </Field>

          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-stone-800">
                Auto-send behaviour
              </h4>
              {autoSend ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  ⚠ live
                </span>
              ) : (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                  drafts only
                </span>
              )}
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={autoSend}
                onChange={(e) => setAutoSend(e.target.checked)}
              />
              <span>
                <span className="font-medium text-stone-800">
                  Auto-send replies in this category
                </span>
                <span className="block text-xs text-stone-500">
                  When confidence is at least the threshold below. Off by default — leave off until you trust the drafts.
                </span>
              </span>
            </label>
            <div className="mt-3 flex items-center gap-3">
              <label className="text-sm text-stone-700">
                Min confidence to auto-send:
              </label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                className="w-24 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm font-mono focus:border-stone-400 focus:ring-0"
                value={minConf}
                onChange={(e) => setMinConf(Number(e.target.value))}
              />
              <span className="text-xs text-stone-500">
                (Claude's confidence is 0–1; 0.95 = very confident)
              </span>
            </div>
          </div>

          {/* Examples */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-stone-800">
                Examples
                <span className="ml-1 text-xs font-normal text-stone-500">
                  — real past pairs Claude reads as reference
                </span>
              </h4>
              <button
                type="button"
                onClick={addExample}
                className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
              >
                <Plus className="h-3 w-3" /> Add example
              </button>
            </div>
            {examples.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-xs text-stone-500">
                No examples yet. Add a real past customer email + the reply you sent to teach Claude your tone for this category.
              </div>
            ) : (
              <ol className="space-y-2">
                {examples.map((ex, idx) => (
                  <ExampleRow
                    key={idx}
                    idx={idx}
                    example={ex}
                    onChange={(patch) => updateExample(idx, patch)}
                    onRemove={() => removeExample(idx)}
                  />
                ))}
              </ol>
            )}
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-between border-t border-stone-200 pt-4">
            <span className="text-xs text-stone-500">
              {savedAt ? (
                <span className="flex items-center gap-1 text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  Saved at {savedAt.toLocaleTimeString()}
                </span>
              ) : (
                "Changes take effect on the next tick (~2 min)"
              )}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-800">{label}</label>
      {hint ? <p className="mt-0.5 text-xs text-stone-500">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function firstLine(text: string): string {
  const t = (text ?? "").trim()
  // Use first non-empty line, capped
  const line = t.split(/\n/).find((l) => l.trim().length > 0) ?? ""
  return line.length > 110 ? line.slice(0, 110) + "…" : line
}

function ExampleRow({
  idx,
  example,
  onChange,
  onRemove,
}: {
  idx: number
  example: { incoming: string; reply: string }
  onChange: (patch: Partial<{ incoming: string; reply: string }>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const incomingPreview = firstLine(example.incoming) || "(empty)"
  const replyPreview = firstLine(example.reply) || "(empty)"

  return (
    <li className="rounded-md border border-stone-200 bg-white">
      {/* Compact preview row — click to expand */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-stone-50"
      >
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-semibold text-stone-600">
          {idx + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-xs text-stone-600">
            <span className="font-medium text-stone-500">From customer:</span>{" "}
            <span className="text-stone-800">{incomingPreview}</span>
          </p>
          <p className="truncate text-xs text-stone-600">
            <span className="font-medium text-stone-500">Our reply:</span>{" "}
            <span className="text-stone-800">{replyPreview}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-stone-400">
            {open ? "close" : "edit"}
          </span>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-stone-200 bg-stone-50/60 px-3 py-3 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                Incoming
              </span>
            </div>
            <textarea
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs leading-relaxed focus:border-stone-400 focus:ring-0"
              rows={4}
              placeholder="What the customer / supplier wrote…"
              value={example.incoming}
              onChange={(e) => onChange({ incoming: e.target.value })}
            />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
              Reply
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs leading-relaxed focus:border-stone-400 focus:ring-0"
              rows={4}
              placeholder="The reply we actually sent…"
              value={example.reply}
              onChange={(e) => onChange({ reply: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-rose-600"
            >
              <Trash2 className="h-3 w-3" />
              Remove this example
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
