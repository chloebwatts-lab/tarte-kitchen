"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { saveInboxPlaybook, type InboxPlaybook } from "@/lib/actions/inbox-playbooks"

const CATEGORY_LABELS: Record<string, string> = {
  events_tea_garden_high_tea: "Events / Tea Garden – High Tea",
  events_tea_garden_functions: "Events / Tea Garden – Functions",
  events_beach_house_functions: "Events / Beach House – Functions",
  suppliers: "Suppliers",
  reviews: "Reviews",
  bookings_dine_in: "Bookings (dine-in)",
  job_applications: "Job applications",
  marketing_cold_outreach: "Marketing / Cold outreach",
  accounts_invoices: "Accounts / Invoices",
  needs_human: "Needs human",
}

export function InboxPlaybookEditor({ playbook }: { playbook: InboxPlaybook }) {
  const router = useRouter()
  const [voice, setVoice] = useState(playbook.voice_guidance)
  const [template, setTemplate] = useState(playbook.reply_template ?? "")
  const [autoSend, setAutoSend] = useState(playbook.auto_send)
  const [minConf, setMinConf] = useState(playbook.min_confidence)
  const [examples, setExamples] = useState(playbook.examples ?? [])
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isPending, startTransition] = useTransition()

  function addExample() {
    setExamples((prev) => [...prev, { incoming: "", reply: "" }])
  }
  function removeExample(idx: number) {
    setExamples((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateExample(idx: number, patch: Partial<{ incoming: string; reply: string }>) {
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
      })
      setSavedAt(new Date())
      router.refresh()
    })
  }

  const label = CATEGORY_LABELS[playbook.category] ?? playbook.category

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{label}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {playbook.category}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{playbook.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Voice guidance</label>
          <textarea
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
            rows={3}
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Reply template (optional)</label>
          <textarea
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
            rows={5}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Leave blank to let Claude draft from scratch each time"
          />
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoSend}
              onChange={(e) => setAutoSend(e.target.checked)}
            />
            Auto-send (skip human review when confidence is high enough)
          </label>
          <label className="flex items-center gap-2 text-sm">
            Min confidence:
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              className="w-20 rounded-md border px-2 py-1 text-sm"
              value={minConf}
              onChange={(e) => setMinConf(Number(e.target.value))}
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              Examples ({examples.length})
            </label>
            <button
              type="button"
              onClick={addExample}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> Add example
            </button>
          </div>
          <div className="mt-2 space-y-3">
            {examples.map((ex, idx) => (
              <div key={idx} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Example {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeExample(idx)}
                    className="text-destructive hover:opacity-80"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <textarea
                  className="w-full rounded-md border px-2 py-1 text-xs font-mono"
                  rows={3}
                  placeholder="Incoming email…"
                  value={ex.incoming}
                  onChange={(e) =>
                    updateExample(idx, { incoming: e.target.value })
                  }
                />
                <textarea
                  className="w-full rounded-md border px-2 py-1 text-xs font-mono"
                  rows={3}
                  placeholder="The reply Chloe / the team actually sent…"
                  value={ex.reply}
                  onChange={(e) =>
                    updateExample(idx, { reply: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {savedAt
              ? `Saved ${savedAt.toLocaleTimeString()}`
              : "Changes take effect on the next tick (~2 min)"}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
