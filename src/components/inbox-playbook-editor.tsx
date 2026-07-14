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
  HelpCircle,
  AlertCircle,
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
  const [faq, setFaq] = useState<Array<{ question: string; answer: string }>>(
    playbook.faq ?? []
  )
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isPending, startTransition] = useTransition()

  function addExample() {
    setExamples((prev) => [...prev, { incoming: "", reply: "" }])
  }
  function addFaq() {
    setFaq((prev) => [...prev, { question: "", answer: "" }])
  }
  function removeFaq(idx: number) {
    setFaq((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateFaq(
    idx: number,
    patch: Partial<{ question: string; answer: string }>
  ) {
    setFaq((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f))
    )
  }
  const unansweredFaqCount = faq.filter(
    (f) => f.question.trim() && !f.answer.trim()
  ).length
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
        faq: faq
          .map((f) => ({
            question: f.question.trim(),
            answer: f.answer.trim(),
          }))
          .filter((f) => f.question), // drop entries with no question
      })
      setSavedAt(new Date())
      router.refresh()
    })
  }

  const label = CATEGORY_LABELS[playbook.category] ?? playbook.category
  const group = CATEGORY_GROUP[playbook.category] ?? "Other"

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{label}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {group}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
            {playbook.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {unansweredFaqCount > 0 && (
            <span
              className="flex items-center gap-1 rounded-full bg-red-light px-2 py-0.5 text-[11px] font-medium text-red-text ring-1 ring-red-text/20"
              title={`${unansweredFaqCount} FAQ question${unansweredFaqCount === 1 ? "" : "s"} need answers`}
            >
              <AlertCircle className="h-3 w-3" />
              {unansweredFaqCount} need answers
            </span>
          )}
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
            <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
              {examples.length} example{examples.length === 1 ? "" : "s"}
            </span>
          )}
          {autoSend ? (
            <span className="flex items-center gap-1 rounded-full bg-green-light px-2 py-0.5 text-[11px] font-medium text-green-text">
              <Check className="h-3 w-3" />
              auto-send
            </span>
          ) : (
            <span className="rounded-full bg-amber-light px-2 py-0.5 text-[11px] font-medium text-amber-text ring-1 ring-amber-text/20">
              draft only
            </span>
          )}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-border bg-muted/30 px-5 py-5 space-y-5">
          <Field
            label="Voice guidance"
            hint="How Claude should write — tone, openers, sign-offs, do's and don'ts."
          >
            <textarea
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-sage-deep focus:ring-0"
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
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-mono leading-relaxed focus:border-sage-deep focus:ring-0"
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
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-sage-deep focus:ring-0"
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
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                  /root/tarte-inbox/attachments/
                </code>{" "}
                — one per line. Attached only on our first reply in a thread.
              </>
            }
          >
            <textarea
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-mono focus:border-sage-deep focus:ring-0"
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

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">
                Auto-send behaviour
              </h4>
              {autoSend ? (
                <span className="rounded-full bg-green-light px-2 py-0.5 text-[11px] font-medium text-green-text">
                  ⚠ live
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
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
                <span className="font-medium text-foreground">
                  Auto-send replies in this category
                </span>
                <span className="block text-xs text-muted-foreground">
                  When confidence is at least the threshold below. Off by default — leave off until you trust the drafts.
                </span>
              </span>
            </label>
            <div className="mt-3 flex items-center gap-3">
              <label className="text-sm text-foreground">
                Min confidence to auto-send:
              </label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                className="w-24 rounded-md border border-input bg-card px-2 py-1 text-sm font-mono focus:border-sage-deep focus:ring-0"
                value={minConf}
                onChange={(e) => setMinConf(Number(e.target.value))}
              />
              <span className="text-xs text-muted-foreground">
                (Claude's confidence is 0–1; 0.95 = very confident)
              </span>
            </div>
          </div>

          {/* FAQ / cheat sheet */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                Cheat sheet
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  — Q&amp;A the agent uses as authoritative facts
                </span>
              </h4>
              <button
                type="button"
                onClick={addFaq}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Plus className="h-3 w-3" /> Add question
              </button>
            </div>
            {faq.length === 0 ? (
              <div className="rounded-lg border border-dashed border-input bg-card px-4 py-6 text-center text-xs text-muted-foreground">
                No cheat sheet yet. Add common questions + answers so the agent can quote them directly.
              </div>
            ) : (
              <ol className="space-y-2">
                {faq.map((f, idx) => {
                  const needsAnswer = f.question.trim() && !f.answer.trim()
                  return (
                    <li
                      key={idx}
                      className={`rounded-lg border bg-card p-3 ${needsAnswer ? "border-red-text/20 bg-red-light/30" : "border-border"}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-serif text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Q&amp;A {idx + 1}
                          {needsAnswer && (
                            <span className="ml-2 rounded-full bg-red-light px-1.5 py-0.5 text-red-text">
                              needs answer
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFaq(idx)}
                          className="text-muted-foreground hover:text-red-text"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        className="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs focus:border-sage-deep focus:ring-0"
                        placeholder="Question (e.g. How much is a kids high tea?)"
                        value={f.question}
                        onChange={(e) =>
                          updateFaq(idx, { question: e.target.value })
                        }
                      />
                      <textarea
                        className="mt-1.5 w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs leading-relaxed focus:border-sage-deep focus:ring-0"
                        rows={3}
                        placeholder="Answer (leave blank to flag for review)"
                        value={f.answer}
                        onChange={(e) =>
                          updateFaq(idx, { answer: e.target.value })
                        }
                      />
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          {/* Examples */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">
                Examples
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  — real past pairs Claude reads as reference
                </span>
              </h4>
              <button
                type="button"
                onClick={addExample}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Plus className="h-3 w-3" /> Add example
              </button>
            </div>
            {examples.length === 0 ? (
              <div className="rounded-lg border border-dashed border-input bg-card px-4 py-6 text-center text-xs text-muted-foreground">
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
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              {savedAt ? (
                <span className="flex items-center gap-1 text-green-text">
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
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
      <label className="block text-sm font-medium text-foreground">{label}</label>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
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
    <li className="rounded-lg border border-border bg-card">
      {/* Compact preview row — click to expand */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50"
      >
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {idx + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-medium text-muted-foreground">From customer:</span>{" "}
            <span className="text-foreground">{incomingPreview}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-medium text-muted-foreground">Our reply:</span>{" "}
            <span className="text-foreground">{replyPreview}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {open ? "close" : "edit"}
          </span>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/40 px-3 py-3 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-serif text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Incoming
              </span>
            </div>
            <textarea
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs leading-relaxed focus:border-sage-deep focus:ring-0"
              rows={4}
              placeholder="What the customer / supplier wrote…"
              value={example.incoming}
              onChange={(e) => onChange({ incoming: e.target.value })}
            />
          </div>
          <div>
            <span className="font-serif text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Reply
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-xs leading-relaxed focus:border-sage-deep focus:ring-0"
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
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-text"
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
