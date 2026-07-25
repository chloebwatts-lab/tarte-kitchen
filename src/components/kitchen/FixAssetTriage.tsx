"use client"

import { useMemo, useState, useTransition } from "react"
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  History,
  Phone,
  ShieldCheck,
  Wrench,
} from "lucide-react"
import type { SymptomDef } from "@/lib/maintenance/constants"
import { addIssueComment, markIssueFixed, reportIssue } from "@/lib/actions/maintenance"

interface ContactRow {
  id: string
  name: string
  company: string | null
  phone: string | null
  notes: string | null
}

interface IssueRow {
  id: string
  ref: string | null
  title: string
  description: string | null
  status: "OPEN" | "FIXED" | "DISMISSED"
  isSafety: boolean
  reportedBy: string | null
  createdAt: string
  fixedAt: string | null
  fixedBy: string | null
  fixSummary: string | null
  wasWarranty: boolean
  costCents: number | null
  contactName: string | null
  events: Array<{ author: string | null; body: string; at: string }>
}

interface AssetView {
  slug: string
  name: string
  venueLabel: string
  location: string
  category: string
  manufacturer: string | null
  model: string | null
  serial: string | null
  year: string | null
  photoUrl: string | null
  status: "ACTIVE" | "RETIRED"
  notes: string | null
  supplier: string | null
  warrantyProvider: string | null
  warrantyNotes: string | null
  warrantyEnd: string | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

interface ErrorCodeRow {
  code: string
  meaning: string
  action: string
}

export function FixAssetTriage({
  asset,
  symptoms,
  suggestedContacts,
  warrantyContact,
  issues,
  errorCodes = [],
}: {
  asset: AssetView
  symptoms: SymptomDef[]
  suggestedContacts: ContactRow[]
  warrantyContact: ContactRow | null
  issues: IssueRow[]
  errorCodes?: ErrorCodeRow[]
}) {
  const [symptomKey, setSymptomKey] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [name, setName] = useState("")
  const [detail, setDetail] = useState("")
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const symptom = symptoms.find((s) => s.key === symptomKey) ?? null
  const openIssues = issues.filter((i) => i.status === "OPEN")
  const fixedIssues = issues.filter((i) => i.status !== "OPEN")
  const shownFixed = showAllHistory ? fixedIssues : fixedIssues.slice(0, 3)

  const underWarranty = useMemo(() => {
    if (!asset.warrantyEnd) return null
    return new Date(asset.warrantyEnd).getTime() > Date.now()
  }, [asset.warrantyEnd])

  // Recurrence intelligence: has this symptom/machine been fixed before?
  const lastFix = fixedIssues.find((i) => i.fixSummary)

  function submitReport() {
    setError(null)
    startTransition(async () => {
      try {
        await reportIssue({
          assetSlug: asset.slug,
          symptomKey,
          title: symptom ? symptom.label : detail.slice(0, 80) || "Problem reported",
          description: detail,
          reportedBy: name,
        })
        setDone(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* ── Header card ── */}
      <div className="overflow-hidden rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] shadow-sm">
        <div className="flex items-start gap-5 p-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--tk-sage-soft)]">
            {asset.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Wrench className="h-9 w-9 text-[var(--tk-charcoal)]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold tracking-wide text-[var(--tk-ink-mute)]">
              {asset.slug} · {asset.venueLabel} · {asset.location}
            </div>
            <h1 className="mt-1 text-[26px] font-bold leading-tight text-[var(--tk-charcoal)]">
              {asset.name}
            </h1>
            <div className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">
              {[asset.manufacturer, asset.model, asset.serial ? `SN ${asset.serial}` : null, asset.year]
                .filter(Boolean)
                .join(" · ") || "No plate details recorded yet"}
            </div>
          </div>
        </div>

        {/* Warranty banner — deliberately loud so nobody pays for a free repair */}
        {underWarranty === true && (
          <div className="bg-[#0e9f5c] px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-9 w-9 shrink-0" strokeWidth={2.2} />
              <div className="min-w-0">
                <div className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-white/80">
                  Under warranty
                </div>
                <div className="text-[22px] font-extrabold leading-tight">
                  Covered until {fmtDate(asset.warrantyEnd!)}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="text-[16px] font-semibold leading-snug">
                Don't pay a trade — this repair should be FREE. Call{" "}
                {asset.warrantyProvider ?? warrantyContact?.name ?? "the supplier"}.
              </div>
              {warrantyContact?.phone && (
                <a
                  href={`tel:${warrantyContact.phone.replace(/\s+/g, "")}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[16px] font-extrabold text-[#0e7a47] shadow-sm active:scale-95"
                >
                  <Phone className="h-4 w-4" /> {warrantyContact.phone}
                </a>
              )}
            </div>
          </div>
        )}
        {underWarranty === false && asset.warrantyProvider && (
          <div className="px-6 py-3 text-[13px] text-[var(--tk-ink-mute)]">
            Warranty expired {asset.warrantyEnd ? fmtDate(asset.warrantyEnd) : ""} ·
            was via {asset.warrantyProvider}
          </div>
        )}
        {asset.warrantyNotes && (
          <div className="border-t border-[var(--tk-line)] px-6 py-3 text-[13px] text-[var(--tk-ink-soft)]">
            {asset.warrantyNotes}
          </div>
        )}
      </div>

      {/* ── Open issues on this machine ── */}
      {openIssues.length > 0 && (
        <div className="space-y-3">
          {openIssues.map((i) => (
            <OpenIssueCard key={i.id} issue={i} />
          ))}
        </div>
      )}

      {/* ── Last fix (the "who fixed it last time" answer) ── */}
      {lastFix && (
        <div className="rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-5">
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--tk-ink-mute)]">
            <History className="h-4 w-4" /> Last time this machine broke
          </div>
          <div className="mt-2 text-[15px] text-[var(--tk-charcoal)]">
            <b>{lastFix.title}</b>{" "}
            <span className="text-[var(--tk-ink-soft)]">
              ({lastFix.fixedAt ? fmtDate(lastFix.fixedAt) : fmtDate(lastFix.createdAt)})
            </span>
          </div>
          <div className="mt-1 text-[15px] text-[var(--tk-ink-soft)]">{lastFix.fixSummary}</div>
        </div>
      )}

      {/* ── Symptom picker ── */}
      <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
        <h2 className="text-[20px] font-bold text-[var(--tk-charcoal)]">What's it doing?</h2>
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {symptoms.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setSymptomKey(s.key === symptomKey ? null : s.key)
                setShowReport(false)
                setDone(false)
              }}
              className={`rounded-xl border px-4 py-3 text-left text-[16px] font-medium transition ${
                s.key === symptomKey
                  ? s.safety
                    ? "border-[#b3362a] bg-[#fdecea] text-[#b3362a]"
                    : "border-[var(--tk-sage)] bg-[var(--tk-sage-soft)] text-[var(--tk-charcoal)]"
                  : "border-[var(--tk-line)] text-[var(--tk-ink)] hover:border-[var(--tk-sage)]"
              }`}
            >
              {s.safety && <AlertTriangle className="mr-2 inline h-4 w-4 -translate-y-[1px]" />}
              {s.label}
            </button>
          ))}
        </div>

        {symptom && (
          <div className="mt-5 space-y-4">
            {symptom.safety && (
              <div className="flex items-start gap-3 rounded-xl bg-[#fdecea] p-4 text-[15px] font-semibold text-[#b3362a]">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                Safety issue — stop using the machine and tell the manager now. Then log it below.
              </div>
            )}
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-wide text-[var(--tk-ink-mute)]">
                Try this first — before anyone gets paid a callout
              </div>
              <ol className="mt-2 space-y-2">
                {symptom.quickFixes.map((f, idx) => (
                  <li key={idx} className="flex gap-3 text-[15px] leading-snug text-[var(--tk-ink)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--tk-sage-soft)] text-[13px] font-bold text-[var(--tk-charcoal)]">
                      {idx + 1}
                    </span>
                    {f}
                  </li>
                ))}
              </ol>
            </div>

            {!done && !showReport && (
              <button
                onClick={() => setShowReport(true)}
                className="w-full rounded-xl bg-[var(--tk-charcoal)] py-4 text-[17px] font-bold text-white"
              >
                Still broken — log it
              </button>
            )}
          </div>
        )}

        {!symptom && !done && !showReport && (
          <button
            onClick={() => setShowReport(true)}
            className="mt-4 w-full rounded-xl border border-[var(--tk-line)] py-3 text-[15px] font-semibold text-[var(--tk-ink-soft)]"
          >
            None of these — describe it myself
          </button>
        )}

        {/* Report form */}
        {showReport && !done && (
          <div className="mt-5 space-y-3 border-t border-[var(--tk-line)] pt-5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (required)"
              className="w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
            />
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder={
                symptom
                  ? "Anything extra the fixer should know? (error codes, when it happens…)"
                  : "What's wrong? Be specific — error codes, what you tried…"
              }
              className="w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
            />
            {error && <div className="text-[14px] font-semibold text-[#b3362a]">{error}</div>}
            <button
              onClick={submitReport}
              disabled={pending || !name.trim() || (!symptom && !detail.trim())}
              className="w-full rounded-xl bg-[var(--tk-charcoal)] py-4 text-[17px] font-bold text-white disabled:opacity-40"
            >
              {pending ? "Logging…" : "Log the problem"}
            </button>
          </div>
        )}

        {done && (
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-[var(--tk-done-soft)] p-4 text-[16px] font-semibold text-[var(--tk-done)]">
            <CheckCircle2 className="h-6 w-6" /> Logged. It's on the maintenance board —
            no WhatsApp message needed.
          </div>
        )}
      </div>

      {/* ── Error codes ── */}
      {errorCodes.length > 0 && (
        <ErrorCodeLookup
          codes={errorCodes}
          autoOpen={!!symptom && /error|code/i.test(symptom.label)}
        />
      )}

      {/* ── Who to call ── */}
      <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
        <h2 className="text-[20px] font-bold text-[var(--tk-charcoal)]">
          Who fixes this {underWarranty ? "(after checking warranty!)" : ""}
        </h2>
        <div className="mt-4 space-y-3">
          {underWarranty && warrantyContact && (
            <ContactCard contact={warrantyContact} badge="WARRANTY — call first" highlight />
          )}
          {suggestedContacts
            .filter((c) => c.id !== (underWarranty ? warrantyContact?.id : ""))
            .map((c) => (
              <ContactCard key={c.id} contact={c} />
            ))}
          {suggestedContacts.length === 0 && !warrantyContact && (
            <div className="text-[15px] text-[var(--tk-ink-soft)]">
              No contact on file for this kind of machine yet — tell Chloe so it gets added.
            </div>
          )}
        </div>
      </div>

      {/* ── History ── */}
      {fixedIssues.length > 0 && (
        <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
          <h2 className="text-[20px] font-bold text-[var(--tk-charcoal)]">
            Repair history{" "}
            <span className="text-[15px] font-medium text-[var(--tk-ink-mute)]">
              ({fixedIssues.length})
            </span>
          </h2>
          <div className="mt-4 space-y-4">
            {shownFixed.map((i) => (
              <div key={i.id} className="border-l-2 border-[var(--tk-line)] pl-4">
                <div className="text-[15px] font-semibold text-[var(--tk-charcoal)]">
                  {i.title}
                  {i.wasWarranty && (
                    <span className="ml-2 rounded-full bg-[var(--tk-done-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--tk-done)]">
                      WARRANTY
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-[var(--tk-ink-mute)]">
                  {i.fixedAt ? `Fixed ${fmtDate(i.fixedAt)}` : fmtDate(i.createdAt)}
                  {i.fixedBy ? ` · closed by ${i.fixedBy}` : ""}
                  {i.contactName ? ` · trade: ${i.contactName}` : ""}
                  {i.costCents ? ` · $${(i.costCents / 100).toFixed(0)}` : ""}
                </div>
                {(i.fixSummary || i.description) && (
                  <div className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">
                    {i.fixSummary ?? i.description}
                  </div>
                )}
              </div>
            ))}
          </div>
          {fixedIssues.length > 3 && !showAllHistory && (
            <button
              onClick={() => setShowAllHistory(true)}
              className="mt-4 flex items-center gap-1 text-[14px] font-semibold text-[var(--tk-ink-soft)]"
            >
              Show all {fixedIssues.length} <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ErrorCodeLookup({
  codes,
  autoOpen,
}: {
  codes: ErrorCodeRow[]
  autoOpen: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [picked, setPicked] = useState<number | null>(null)
  const isOpen = open || autoOpen
  const filtered = q.trim()
    ? codes.filter((c) =>
        (c.code + " " + c.meaning).toLowerCase().includes(q.trim().toLowerCase())
      )
    : codes

  return (
    <div className="rounded-3xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-6 shadow-sm">
      <button
        onClick={() => setOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-[20px] font-bold text-[var(--tk-charcoal)]">
          Error code on the display?
        </h2>
        <ChevronDown
          className={`h-5 w-5 text-[var(--tk-ink-mute)] transition ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="mt-4 space-y-4">
          {codes.length > 8 && (
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPicked(null) }}
              placeholder="Type the code — e.g. 032, Er04, AF02…"
              className="w-full rounded-xl border border-[var(--tk-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--tk-sage)]"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {filtered.map((c, i) => {
              const active = picked === i
              return (
                <button
                  key={i}
                  onClick={() => setPicked(active ? null : i)}
                  className={`min-h-[52px] rounded-xl border-2 px-4 py-2 font-mono text-[17px] font-bold transition active:scale-95 ${
                    active
                      ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
                      : "border-[var(--tk-line)] bg-[var(--tk-bg)] text-[var(--tk-charcoal)] hover:border-[var(--tk-sage)]"
                  }`}
                >
                  {c.code}
                </button>
              )
            })}
          </div>
          {picked !== null && filtered[picked] && (
            <div className="rounded-2xl border-2 border-[var(--tk-charcoal)] bg-[var(--tk-bg)] p-5">
              <div className="text-[13px] font-bold uppercase tracking-wide text-[var(--tk-ink-mute)]">
                {filtered[picked].code}
              </div>
              <div className="mt-1 text-[19px] font-bold leading-snug text-[var(--tk-charcoal)]">
                {filtered[picked].meaning}
              </div>
              <div className="mt-2 text-[16px] leading-snug text-[var(--tk-ink)]">
                {filtered[picked].action}
              </div>
            </div>
          )}
          {picked === null && (
            <div className="text-[13px] text-[var(--tk-ink-mute)]">
              Tap the code you see on the display. Not listed? Photo the screen and log
              it below — the exact code halves the tech's diagnosis time.
            </div>
          )}
          {filtered.length === 0 && (
            <div className="text-[14px] text-[var(--tk-ink-soft)]">
              Code not in the list — photo the screen and log it below.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ContactCard({
  contact,
  badge,
  highlight,
}: {
  contact: ContactRow
  badge?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${
        highlight
          ? "border-[var(--tk-done)] bg-[var(--tk-done-soft)]"
          : "border-[var(--tk-line)]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[16px] font-semibold text-[var(--tk-charcoal)]">
          {contact.name}
          {badge && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--tk-done)] px-2 py-0.5 text-[11px] font-bold text-white">
              <BadgeCheck className="h-3 w-3" /> {badge}
            </span>
          )}
        </div>
        {contact.notes && (
          <div className="mt-0.5 line-clamp-2 text-[13px] text-[var(--tk-ink-soft)]">
            {contact.notes}
          </div>
        )}
      </div>
      {contact.phone ? (
        <a
          href={`tel:${contact.phone.replace(/\s+/g, "")}`}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--tk-charcoal)] px-4 py-3 text-[15px] font-bold text-white"
        >
          <Phone className="h-4 w-4" /> {contact.phone}
        </a>
      ) : (
        <span className="shrink-0 text-[13px] text-[var(--tk-ink-mute)]">no number yet</span>
      )}
    </div>
  )
}

function OpenIssueCard({ issue }: { issue: IssueRow }) {
  const [comment, setComment] = useState("")
  const [who, setWho] = useState("")
  const [showFix, setShowFix] = useState(false)
  const [fixSummary, setFixSummary] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <div
      className={`rounded-2xl border p-5 ${
        issue.isSafety
          ? "border-[#b3362a] bg-[#fdecea]"
          : "border-[var(--tk-warn)] bg-[var(--tk-warn-soft)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`text-[13px] font-bold uppercase tracking-wide ${
              issue.isSafety ? "text-[#b3362a]" : "text-[var(--tk-warn)]"
            }`}
          >
            {issue.isSafety ? "⚠ Safety fault — logged" : "Already logged — being handled"}
          </div>
          <div className="mt-1 text-[16px] font-semibold text-[var(--tk-charcoal)]">
            {issue.title}
          </div>
          <div className="text-[13px] text-[var(--tk-ink-soft)]">
            {issue.reportedBy ? `${issue.reportedBy} · ` : ""}
            {fmtDate(issue.createdAt)}
            {issue.contactName ? ` · trade: ${issue.contactName}` : ""}
          </div>
        </div>
      </div>

      {issue.events.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-black/10 pt-3">
          {issue.events.slice(-3).map((e, i) => (
            <div key={i} className="text-[13px] text-[var(--tk-ink-soft)]">
              <b>{e.author ?? "?"}:</b> {e.body}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-black/10 pt-3 md:flex-row">
        <input
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-[14px] outline-none md:w-36"
        />
        {!showFix ? (
          <>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add an update (tech booked, tried X…)"
              className="w-full flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-[14px] outline-none"
            />
            <div className="flex gap-2">
              <button
                disabled={pending || !comment.trim()}
                onClick={() =>
                  startTransition(async () => {
                    await addIssueComment(issue.id, who, comment)
                    setComment("")
                  })
                }
                className="rounded-lg bg-[var(--tk-charcoal)] px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40"
              >
                Add
              </button>
              <button
                onClick={() => setShowFix(true)}
                className="whitespace-nowrap rounded-lg border border-[var(--tk-charcoal)] px-4 py-2 text-[14px] font-bold text-[var(--tk-charcoal)]"
              >
                It's fixed
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              value={fixSummary}
              onChange={(e) => setFixSummary(e.target.value)}
              placeholder="What fixed it? Who did it? (required — future-you will thank you)"
              className="w-full flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-[14px] outline-none"
            />
            <div className="flex gap-2">
              <button
                disabled={pending || !fixSummary.trim() || !who.trim()}
                onClick={() =>
                  startTransition(async () => {
                    await markIssueFixed({
                      issueId: issue.id,
                      fixedBy: who,
                      fixSummary,
                    })
                  })
                }
                className="rounded-lg bg-[var(--tk-done)] px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {pending ? "Saving…" : "Mark fixed"}
              </button>
              <button
                onClick={() => setShowFix(false)}
                className="rounded-lg px-2 py-2 text-[14px] text-[var(--tk-ink-soft)]"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
