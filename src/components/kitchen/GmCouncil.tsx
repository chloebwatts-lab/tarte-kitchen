"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { cn } from "@/lib/utils"
import {
  addSignOn,
  getSignOnSignature,
  saveSignOn,
  type SaveSignOnInput,
  type SignOnRow,
} from "@/lib/actions/council"
import {
  ASKS,
  FIELD_NAMES,
  STATUS_LABEL,
  signProblem,
  sortKey,
  type SignOnField,
  type SignOnStatus,
} from "@/lib/council/sign-on"

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
const PENDING_KEY = "tk-council-pending"
const FAILED_KEY = "tk-council-failed"
const draftKey = (id: string) => `tk-council-draft:${id}`

/** A save waiting on this iPad. Kept in order and sent in order; never replaced by a later save. */
type QueueItem = { qid: string; input: SaveSignOnInput }
type FailedItem = QueueItem & { error: string }
const newQid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

const PILL: Record<SignOnStatus, string> = {
  todo: "bg-[var(--tk-sage-soft)] text-[var(--tk-ink-soft)]",
  signed: "bg-[var(--tk-done-soft)] text-[var(--tk-done)]",
  later: "bg-[var(--tk-gold-soft)] text-[var(--tk-ink)]",
  no: "bg-[var(--tk-warn-soft)] text-[var(--tk-warn)]",
  skip: "bg-[var(--tk-line)] text-[var(--tk-ink-mute)]",
}
const FILTERS: [SignOnStatus | "all", string][] = [
  ["all", "All"], ["todo", "To visit"], ["later", "Come back"], ["signed", "Signed"], ["no", "Said no"], ["skip", "No footpath"],
]
const LABELS: Record<SignOnField, { label: string; hint?: string; placeholder?: string; inputMode?: "text" | "decimal" | "email" }> = {
  owner: { label: "Owner or manager", hint: "print name" },
  permit: { label: "Roadside dining permit no.", hint: "if known" },
  worksPct: { label: "During the works", placeholder: "e.g. down 15%" },
  openedPct: { label: "First weeks after the tram opened", placeholder: "e.g. up 10%" },
  nowPct: { label: "Now", placeholder: "e.g. flat" },
  setupHours: { label: "Staff hours a day to set up and pack away", placeholder: "e.g. 3", inputMode: "decimal" },
  email: { label: "Email for a copy of the letter", hint: "optional", inputMode: "email" },
  note: { label: "Note", hint: "e.g. come back Tue after 2pm" },
}

type Fields = Record<SignOnField, string>
const emptyFields = (): Fields => Object.fromEntries(FIELD_NAMES.map((f) => [f, ""])) as Fields

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: the server save is the record */
  }
}

async function uploadSignature(dataUrl: string): Promise<string | null> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) return null
  try {
    const form = new FormData()
    form.append("file", dataUrl)
    form.append("upload_preset", UPLOAD_PRESET)
    form.append("folder", "tarte-kitchen/council-signons")
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10000)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: form, signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const data = (await res.json()) as { secure_url?: string }
    return data.secure_url ?? null
  } catch {
    return null
  }
}

/** Oliver's iPad sign-on list for the Council footpath fee letter. */
export function GmCouncil({ initial }: { initial: SignOnRow[] }) {
  const [rows, setRows] = useState(initial)
  const [filter, setFilter] = useState<SignOnStatus | "all">("all")
  const [q, setQ] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState<QueueItem[]>([])
  const [failed, setFailed] = useState<FailedItem[]>([])
  const [locked, setLocked] = useState(false)
  const flushing = useRef(false)
  const [toast, setToast] = useState("")
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((t: string) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(""), 3200)
  }, [])

  const mergeRow = useCallback((row: SignOnRow) => {
    setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row]))
  }, [])

  // Saves made while the iPad was offline wait here and send themselves, in order, when it is back.
  const flush = useCallback(async (): Promise<Set<string>> => {
    const done = new Set<string>()
    if (flushing.current) return done
    flushing.current = true
    try {
      const queue = readJson<QueueItem[]>(PENDING_KEY, [])
      const refused: FailedItem[] = []
      let sent = 0
      for (const item of queue) {
        let r: Awaited<ReturnType<typeof saveSignOn>>
        try {
          r = await saveSignOn(item.input)
        } catch {
          break // still offline: stop here so nothing is sent out of order
        }
        if (r.ok) {
          mergeRow(r.row)
          done.add(item.qid)
          sent++
        } else if (r.code === "locked") {
          setLocked(true)
          break
        } else {
          refused.push({ ...item, error: r.error })
          done.add(item.qid)
        }
      }
      // Re-read: a save queued while this was running must stay.
      const left = readJson<QueueItem[]>(PENDING_KEY, []).filter((i) => !done.has(i.qid))
      writeJson(PENDING_KEY, left.length ? left : null)
      setPending(left)
      if (refused.length) {
        const all = [...readJson<FailedItem[]>(FAILED_KEY, []), ...refused]
        writeJson(FAILED_KEY, all)
        setFailed(all)
      }
      if (sent) {
        setLocked(false)
        flash(`${sent} saved sign-on${sent === 1 ? "" : "s"} sent.`)
      }
      return done
    } finally {
      flushing.current = false
    }
  }, [flash, mergeRow])

  const enqueue = useCallback((input: SaveSignOnInput): string => {
    const item = { qid: newQid(), input }
    const queue = [...readJson<QueueItem[]>(PENDING_KEY, []), item]
    writeJson(PENDING_KEY, queue)
    setPending(queue)
    return item.qid
  }, [])

  useEffect(() => {
    setPending(readJson<QueueItem[]>(PENDING_KEY, []))
    setFailed(readJson<FailedItem[]>(FAILED_KEY, []))
    void flush()
    const on = () => void flush()
    window.addEventListener("online", on)
    const timer = setInterval(on, 60000)
    return () => {
      window.removeEventListener("online", on)
      clearInterval(timer)
    }
  }, [flush])

  const counts = useMemo(() => {
    const c: Record<SignOnStatus, number> = { todo: 0, signed: 0, later: 0, no: 0, skip: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows
      .filter((r) => (filter === "all" || r.status === filter) && (!needle || `${r.name} ${r.street} ${r.owner}`.toLowerCase().includes(needle)))
      .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
  }, [rows, filter, q])

  const open = rows.find((r) => r.id === openId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([["signed", "signed"], ["todo", "to visit"], ["later", "come back"], ["no", "said no"]] as const).map(([k, label]) => (
          <span key={k} className={cn("rounded-full px-3 py-1.5 text-[15px] tabular-nums", PILL[k])}>
            <b className="text-[17px]">{counts[k]}</b> {label}
          </span>
        ))}
      </div>

      {locked ? (
        <p className="rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[16px] text-[var(--tk-warn)]" role="alert">
          The desk locked itself. <a className="font-semibold underline" href="/kitchen/gm/unlock?next=%2Fkitchen%2Fgm%2Fcouncil">Unlock it</a> and come back here. Every save is kept on this iPad until then.
        </p>
      ) : null}

      {pending.length ? (
        <p className="rounded-[12px] bg-[var(--tk-gold-soft)] px-4 py-3 text-[16px]" role="status">
          {pending.length} save{pending.length === 1 ? " is" : "s are"} kept on this iPad and will send by itself when the wifi is back. Don&rsquo;t clear Safari.
        </p>
      ) : null}

      {failed.length ? (
        <div className="space-y-2 rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[16px] text-[var(--tk-warn)]" role="alert">
          {failed.map((f) => (
            <p key={f.qid}>
              <b>{rows.find((r) => r.id === f.input.id)?.name ?? "A business"}:</b> {f.error} Open it and save again.
            </p>
          ))}
          <KitchenButton
            variant="secondary"
            size="sm"
            onClick={() => {
              writeJson(FAILED_KEY, null)
              setFailed([])
            }}
          >
            Done, I&rsquo;ve redone these
          </KitchenButton>
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a business"
          aria-label="Find a business"
          className="h-[52px] min-w-0 flex-1 rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-4 text-[17px]"
        />
        <KitchenButton variant="secondary" size="md" onClick={() => setAdding(true)}>Add a business</KitchenButton>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={cn(
              "h-10 flex-none rounded-full border px-4 text-[15px] tabular-nums",
              filter === k ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white" : "border-[var(--tk-line)] text-[var(--tk-ink-soft)]",
            )}
          >
            {label} {k === "all" ? rows.length : counts[k]}
          </button>
        ))}
      </div>

      <ol className="space-y-1.5">
        {shown.map((r, i) => {
          const letter = /[a-z]/.test(sortKey(r.name).charAt(0)) ? sortKey(r.name).charAt(0).toUpperCase() : "#"
          const prev = i > 0 ? shown[i - 1] : null
          const prevLetter = prev ? (/[a-z]/.test(sortKey(prev.name).charAt(0)) ? sortKey(prev.name).charAt(0).toUpperCase() : "#") : null
          const meta = [r.street, r.status === "signed" && r.owner ? `Signed by ${r.owner}` : "", r.status !== "signed" ? r.note : ""].filter(Boolean).join(" · ")
          return (
            <li key={r.id}>
              {letter !== prevLetter ? <div className="tk-display px-1 pb-1 pt-3 text-[18px] text-[var(--tk-sage)]" aria-hidden>{letter}</div> : null}
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="flex min-h-[64px] w-full items-center gap-3 rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-2.5 text-left active:bg-[var(--tk-sage-soft)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold [overflow-wrap:anywhere]">
                    {r.name}
                    {r.unsure && r.status === "todo" ? <span className="ml-2 rounded-[6px] border border-dashed border-[var(--tk-line)] px-1.5 align-[2px] text-[12px] font-medium text-[var(--tk-ink-mute)]">check</span> : null}
                  </span>
                  {meta ? <span className="block text-[14px] text-[var(--tk-ink-soft)] [overflow-wrap:anywhere]">{meta}</span> : null}
                </span>
                <span className={cn("flex-none rounded-full px-3 py-1 text-[13px] font-semibold", PILL[r.status])}>{STATUS_LABEL[r.status]}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {!shown.length ? <p className="py-8 text-center text-[16px] text-[var(--tk-ink-soft)]">No businesses match this view.</p> : null}

      {open ? (
        <SignSheet
          key={open.id}
          row={open}
          queueBusy={pending.length > 0}
          onClose={() => setOpenId(null)}
          onSaved={(row, msg) => {
            mergeRow(row)
            setOpenId(null)
            flash(msg)
          }}
          onQueued={async (item, optimistic, msg, isLocked) => {
            const m = typeof msg === "string" ? { sent: msg, kept: msg } : msg
            const qid = enqueue(item)
            mergeRow(optimistic)
            setOpenId(null)
            if (isLocked) {
              setLocked(true)
              flash(m.kept)
              return
            }
            const sent = await flush()
            flash(sent.has(qid) ? m.sent : m.kept)
          }}
        />
      ) : null}

      {adding ? (
        <AddSheet
          initialName={q}
          onClose={() => setAdding(false)}
          onAdded={(row) => {
            mergeRow(row)
            setAdding(false)
            setOpenId(row.id)
          }}
        />
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-[60] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-[14px] bg-[var(--tk-charcoal)] px-5 py-3 text-[16px] font-semibold text-white">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function SignSheet({
  row,
  queueBusy,
  onClose,
  onSaved,
  onQueued,
}: {
  row: SignOnRow
  /** Older saves are still waiting: this one goes in the queue behind them so order is kept. */
  queueBusy: boolean
  onClose: () => void
  onSaved: (row: SignOnRow, msg: string) => void
  onQueued: (item: SaveSignOnInput, optimistic: SignOnRow, msg: { sent: string; kept: string } | string, locked?: boolean) => void
}) {
  const [fields, setFields] = useState<Fields>(() => {
    const draft = readJson<Partial<Fields>>(draftKey(row.id), {})
    const f = emptyFields()
    for (const k of FIELD_NAMES) f[k] = draft[k] ?? row[k] ?? ""
    return f
  })
  const [savedSig, setSavedSig] = useState<string | null>(row.signatureUrl)
  const [resign, setResign] = useState(!row.hasSignature)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState<SignOnStatus | null>(null)
  const pad = useSignaturePad(resign)

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])
  useEffect(() => {
    if (row.hasSignature && !row.signatureUrl) void getSignOnSignature(row.id).then(setSavedSig).catch(() => {})
  }, [row.id, row.hasSignature, row.signatureUrl])

  function set(k: SignOnField, v: string) {
    setFields((prev) => {
      const next = { ...prev, [k]: v }
      writeJson(draftKey(row.id), next)
      return next
    })
  }

  async function save(status: SignOnStatus) {
    setError("")
    // A business that has signed only comes off the signed list on a second tap.
    if (row.status === "signed" && status !== "signed" && confirm !== status) {
      setConfirm(status)
      return setError(`${row.name} has signed. Tap "${STATUS_LABEL[status]}" again to change it. The signature is kept either way.`)
    }
    let signature: string | null = null
    if (status === "signed") {
      const hasFresh = resign && pad.inked()
      const problem = signProblem({ owner: fields.owner, hasSignature: hasFresh || (row.hasSignature && !resign) })
      if (problem) return setError(problem)
      if (hasFresh) signature = pad.image()
    }
    setBusy(true)
    const signatureUrl = signature ? await uploadSignature(signature) : null
    const item: SaveSignOnInput = {
      id: row.id,
      status,
      fields,
      ...(signature ? { signature, signatureUrl, signedAt: new Date().toISOString() } : {}),
    }
    const okMsg = status === "signed" ? `${row.name} signed. Thank you.` : `${row.name}: ${STATUS_LABEL[status]}`
    const keptMsg = `${row.name} saved on this iPad. It will send when the wifi is back.`
    const optimistic: SignOnRow = {
      ...row,
      ...fields,
      status,
      hasSignature: row.hasSignature || !!signature,
      signatureUrl: signature ? signatureUrl : row.signatureUrl,
      signedAt: signature ? item.signedAt ?? null : row.signedAt,
    }
    writeJson(draftKey(row.id), null)
    if (queueBusy) return onQueued(item, optimistic, { sent: okMsg, kept: keptMsg })
    try {
      const r = await saveSignOn(item)
      if (r.ok) return onSaved(r.row, okMsg)
      if (r.code === "locked") return onQueued(item, optimistic, `${row.name} kept on this iPad. Unlock the desk to send it.`, true)
      writeJson(draftKey(row.id), fields)
      setBusy(false)
      return setError(r.error)
    } catch {
      // No connection: keep it on the iPad and send it later. Nothing is lost.
      onQueued(item, optimistic, { sent: okMsg, kept: keptMsg })
    }
  }

  const field = (k: SignOnField, full = false) => {
    const meta = LABELS[k]
    return (
      <label key={k} className={cn("grid min-w-0 gap-1.5", full && "sm:col-span-2")}>
        <span className="text-[15px] font-semibold">
          {meta.label} {meta.hint ? <span className="font-normal text-[var(--tk-ink-soft)]">({meta.hint})</span> : null}
        </span>
        <input
          value={fields[k]}
          onChange={(e) => set(k, e.target.value)}
          placeholder={meta.placeholder}
          inputMode={meta.inputMode}
          type={k === "email" ? "email" : "text"}
          autoComplete="off"
          autoCapitalize={k === "email" ? "off" : k === "owner" ? "words" : "sentences"}
          className="h-[52px] w-full min-w-0 rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-3.5 text-[17px]"
        />
      </label>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--tk-bg)] pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)]" role="dialog" aria-modal="true" aria-label={row.name}>
      <div className="mx-auto grid max-w-[860px] gap-4 px-[max(16px,env(safe-area-inset-left,0px))] pb-10 pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <KitchenButton variant="secondary" size="md" onClick={onClose}>Back to list</KitchenButton>
          <div className="min-w-0 flex-1">
            <h2 className="tk-display text-[30px] leading-tight [overflow-wrap:anywhere]">{row.name}</h2>
            {row.street ? <p className="text-[15px] text-[var(--tk-ink-soft)]">{row.street}</p> : null}
          </div>
          <span className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", PILL[row.status])}>{STATUS_LABEL[row.status]}</span>
        </div>

        <section className="rounded-[14px] border border-[var(--tk-line)] border-l-4 border-l-[var(--tk-gold)] bg-[var(--tk-card)] px-4 py-3.5">
          <p className="tk-caps text-[var(--tk-ink-soft)]">We are asking Council to</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[16px] leading-snug">
            {ASKS.map((a) => <li key={a}>{a}</li>)}
          </ol>
          <p className="mt-2 text-[14px] text-[var(--tk-ink-soft)]">Figures are optional and go to Council as approximate percentages only. No dollar figures.</p>
        </section>

        <div className="grid gap-4 rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("owner")}
            {field("permit")}
            <p className="tk-caps text-[var(--tk-ink-soft)] sm:col-span-2">Customers or sales, rough % against a year earlier</p>
            {field("worksPct")}
            {field("openedPct")}
            {field("nowPct")}
            {field("setupHours")}
            {field("email")}
            {field("note")}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-semibold">Signature</span>
              {resign ? <KitchenButton variant="secondary" size="sm" onClick={pad.clear}>Clear</KitchenButton> : null}
            </div>
            {resign ? (
              <div className="relative overflow-hidden rounded-[14px] border border-[var(--tk-line)] bg-white">
                <canvas ref={pad.ref} className="block h-[230px] w-full touch-none" aria-label="Signature pad. Sign with a finger or stylus." />
                <span aria-hidden className="pointer-events-none absolute bottom-[50px] left-6 font-serif text-[22px] text-[#9aa5a2]">&times;</span>
                <span aria-hidden className="pointer-events-none absolute bottom-[44px] left-6 right-6 border-t border-[#c9d2d0]" />
              </div>
            ) : (
              <div className="grid gap-2">
                {savedSig ? <img src={savedSig} alt="Saved signature" className="max-w-full rounded-[14px] border border-[var(--tk-line)] bg-white" /> : <p className="text-[15px] text-[var(--tk-ink-soft)]">Signature saved.</p>}
                <p className="text-[14px] text-[var(--tk-ink-soft)]">
                  Signed{row.signedAt ? ` ${new Date(row.signedAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}{row.owner ? ` by ${row.owner}` : ""}
                </p>
                <div><KitchenButton variant="secondary" size="sm" onClick={() => setResign(true)}>Sign again</KitchenButton></div>
              </div>
            )}
            <p className="text-[14px] text-[var(--tk-ink-soft)]">By signing I support the letter to Council above.</p>
          </div>

          {error ? <p className="rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[16px] font-medium text-[var(--tk-warn)]" role="alert">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <KitchenButton size="lg" className="flex-[1_1_240px]" disabled={busy} onClick={() => void save("signed")}>
              {busy ? "Saving..." : row.hasSignature && !resign ? "Save changes" : "Save signature"}
            </KitchenButton>
            <KitchenButton variant="secondary" size="lg" disabled={busy} onClick={() => void save("later")}>Come back later</KitchenButton>
            <KitchenButton variant="secondary" size="lg" disabled={busy} onClick={() => void save("no")}>Said no</KitchenButton>
            <KitchenButton variant="secondary" size="lg" disabled={busy} onClick={() => void save("skip")}>No footpath tables</KitchenButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddSheet({ initialName, onClose, onAdded }: { initialName: string; onClose: () => void; onAdded: (row: SignOnRow) => void }) {
  const [name, setName] = useState(initialName)
  const [street, setStreet] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const r = await addSignOn({ name, street })
      if (!r.ok) setError(r.error)
      else onAdded(r.row)
    } catch {
      setError("That did not save. Check the wifi and try again.")
    }
    setBusy(false)
  }
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--tk-bg)] pt-[env(safe-area-inset-top,0px)]" role="dialog" aria-modal="true" aria-label="Add a business">
      <form onSubmit={submit} className="mx-auto grid max-w-[640px] gap-4 px-[max(16px,env(safe-area-inset-left,0px))] pb-10 pt-3">
        <div className="flex items-center gap-3">
          <KitchenButton variant="secondary" size="md" type="button" onClick={onClose}>Back to list</KitchenButton>
          <h2 className="tk-display text-[30px]">Add a business</h2>
        </div>
        <label className="grid gap-1.5">
          <span className="text-[15px] font-semibold">Business name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="words" className="h-[52px] rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-3.5 text-[17px]" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[15px] font-semibold">Street</span>
          <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="e.g. James St" autoComplete="off" autoCapitalize="words" className="h-[52px] rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-card)] px-3.5 text-[17px]" />
        </label>
        {error ? <p className="rounded-[12px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[16px] text-[var(--tk-warn)]" role="alert">{error}</p> : null}
        <KitchenButton size="lg" type="submit" disabled={busy}>{busy ? "Adding..." : "Add and open"}</KitchenButton>
      </form>
    </div>
  )
}

/** Finger or stylus signature pad on a canvas. */
function useSignaturePad(active: boolean) {
  const ref = useRef<HTMLCanvasElement>(null)
  const inkedRef = useRef(false)

  useEffect(() => {
    const canvas = ref.current
    if (!active || !canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = 2.6
    ctx.strokeStyle = "#1d1f20"
    ctx.fillStyle = "#1d1f20"
    inkedRef.current = false
    let drawing = false
    let last = { x: 0, y: 0 }
    const pt = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      drawing = true
      last = pt(e)
      ctx.beginPath()
      ctx.arc(last.x, last.y, 1.3, 0, Math.PI * 2)
      ctx.fill()
      inkedRef.current = true
    }
    const move = (e: PointerEvent) => {
      if (!drawing) return
      e.preventDefault()
      const evs = typeof e.getCoalescedEvents === "function" && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e]
      for (const ev of evs) {
        const p = pt(ev)
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        last = p
      }
    }
    const up = () => {
      drawing = false
    }
    canvas.addEventListener("pointerdown", down)
    canvas.addEventListener("pointermove", move)
    canvas.addEventListener("pointerup", up)
    canvas.addEventListener("pointercancel", up)
    return () => {
      canvas.removeEventListener("pointerdown", down)
      canvas.removeEventListener("pointermove", move)
      canvas.removeEventListener("pointerup", up)
      canvas.removeEventListener("pointercancel", up)
    }
  }, [active])

  return {
    ref,
    inked: () => inkedRef.current,
    clear: () => {
      const c = ref.current
      const ctx = c?.getContext("2d")
      if (c && ctx) {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, c.width, c.height)
        ctx.restore()
      }
      inkedRef.current = false
    },
    image: () => {
      const c = ref.current!
      const w = 600
      const h = Math.max(1, Math.round((600 * c.height) / c.width))
      const out = document.createElement("canvas")
      out.width = w
      out.height = h
      const o = out.getContext("2d")!
      o.fillStyle = "#ffffff"
      o.fillRect(0, 0, w, h)
      o.drawImage(c, 0, 0, w, h)
      return out.toDataURL("image/png")
    },
  }
}
