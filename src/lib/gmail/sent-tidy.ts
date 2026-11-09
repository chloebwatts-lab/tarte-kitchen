import { getActiveGmailConnection, getValidGmailAccessToken } from "@/lib/gmail/token"
import { searchMessages } from "@/lib/gmail/client"
import {
  PRIVATE_SENT_PATTERNS,
  decideTrash,
  isTruthyFlag,
  matchPrivateSentSubject,
  sweepQuery,
  tidyLogLine,
  type SentMeta,
} from "@/lib/gmail/sent-tidy-rules"

/**
 * Trash the accounts@ Sent copy of private (profit or earnings) emails.
 * Rules and the subject list live in sent-tidy-rules.ts.
 *
 * Trashing needs the gmail.modify scope on the Kitchen Gmail connection
 * (added to the consent in /api/auth/gmail on 9 Nov 2026). Until the
 * mailbox is re-consented every trash call fails with 403 and is logged;
 * the send itself is never affected, and the weekly sweep picks the copy up
 * once the scope is there.
 *
 * Dry run: SENT_TIDY_DRY_RUN=1 in the app env logs "would trash" instead.
 * Only messages.trash is used (Gmail empties Trash after 30 days); nothing
 * here can permanently delete, and only the single Sent message is touched,
 * never the thread, so replies in the inbox stay put.
 */

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me"

export type TidyResult = {
  id: string
  action: "trashed" | "would trash" | "kept" | "failed"
  subject: string
  reason?: string
}

export function sentTidyDryRun(): boolean {
  return isTruthyFlag(process.env.SENT_TIDY_DRY_RUN)
}

async function getSentMeta(accessToken: string, id: string): Promise<SentMeta | null> {
  const url = new URL(`${GMAIL_API}/messages/${encodeURIComponent(id)}`)
  url.searchParams.set("format", "metadata")
  for (const h of ["Subject", "From", "To", "Cc"]) url.searchParams.append("metadataHeaders", h)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Gmail get ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const m = (await res.json()) as {
    id: string
    internalDate?: string
    labelIds?: string[]
    payload?: { headers?: Array<{ name: string; value: string }> }
  }
  const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? ""
  return { id: m.id, internalDate: Number(m.internalDate ?? 0), labelIds: m.labelIds ?? [], subject: h("Subject"), from: h("From"), to: h("To"), cc: h("Cc") }
}

function scopeHint(status: number, body: string): string {
  if (status === 403 && /insufficient|scope/i.test(body)) return "token lacks gmail.modify, re-consent needed"
  return `Gmail trash ${status}: ${body.replace(/\s+/g, " ").slice(0, 160)}`
}

/**
 * Check one message and trash it if it is a private Sent copy. Never throws.
 * `explicit`: the sending code marked it private, so the subject list is not
 * required. `via`: who asked, for the log line.
 */
export async function trashPrivateSentCopy(params: {
  id: string
  via: string
  explicit?: boolean
  dryRun?: boolean
  accessToken?: string
  mailbox?: string
}): Promise<TidyResult> {
  const dryRun = params.dryRun ?? sentTidyDryRun()
  let subject = ""
  try {
    let mailbox = params.mailbox
    if (!mailbox) {
      const conn = await getActiveGmailConnection()
      if (!conn) throw new Error("no Gmail connection")
      mailbox = conn.email
    }
    const accessToken = params.accessToken ?? (await getValidGmailAccessToken())
    const meta = await getSentMeta(accessToken, params.id)
    if (!meta) {
      const r: TidyResult = { id: params.id, action: "kept", subject, reason: "message not found" }
      console.log(tidyLogLine({ ...r, via: params.via }))
      return r
    }
    subject = meta.subject
    const decision = decideTrash(meta, mailbox, { explicit: params.explicit })
    if (!decision.trash) {
      const r: TidyResult = { id: params.id, action: "kept", subject, reason: decision.reason }
      console.log(tidyLogLine({ ...r, via: params.via }))
      return r
    }
    if (dryRun) {
      const r: TidyResult = { id: params.id, action: "would trash", subject }
      console.log(tidyLogLine({ ...r, via: params.via, reason: "dry run" }))
      return r
    }
    const res = await fetch(`${GMAIL_API}/messages/${encodeURIComponent(params.id)}/trash`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const r: TidyResult = { id: params.id, action: "failed", subject, reason: scopeHint(res.status, await res.text()) }
      console.warn(tidyLogLine({ ...r, via: params.via }))
      return r
    }
    const r: TidyResult = { id: params.id, action: "trashed", subject }
    console.log(tidyLogLine({ ...r, via: params.via }))
    return r
  } catch (e) {
    const r: TidyResult = { id: params.id, action: "failed", subject, reason: e instanceof Error ? e.message : String(e) }
    console.warn(tidyLogLine({ ...r, via: params.via }))
    return r
  }
}

/**
 * Called by the senders straight after a successful send. Does nothing for
 * mail that is not private (neither flagged nor on the subject list), so the
 * operational emails never even get a lookup.
 */
export async function tidyAfterSend(params: {
  id: string | undefined
  subject: string
  via: string
  privateCopy?: boolean
}): Promise<TidyResult | null> {
  if (!params.id) return null
  if (!params.privateCopy && !matchPrivateSentSubject(params.subject)) return null
  return trashPrivateSentCopy({ id: params.id, via: params.via, explicit: params.privateCopy === true })
}

export type SweepSummary = {
  dryRun: boolean
  checked: number
  trashed: number
  wouldTrash: number
  failed: number
  kept: Record<string, number>
  byPattern: Record<string, { found: number; trashed: number; wouldTrash: number }>
  errors: string[]
}

/**
 * Weekly safety sweep: find every Sent copy in accounts@ whose subject is on
 * the private list and trash the ones the senders missed (a connector send,
 * a Shifts send while Kitchen was down, anything before the scope existed).
 */
export async function sweepPrivateSent(opts: { dryRun?: boolean; newerThanDays?: number; maxPerPattern?: number } = {}): Promise<SweepSummary> {
  const dryRun = opts.dryRun ?? sentTidyDryRun()
  const summary: SweepSummary = { dryRun, checked: 0, trashed: 0, wouldTrash: 0, failed: 0, kept: {}, byPattern: {}, errors: [] }
  const conn = await getActiveGmailConnection()
  if (!conn) throw new Error("no Gmail connection")
  const accessToken = await getValidGmailAccessToken()
  const seen = new Set<string>()
  for (const p of PRIVATE_SENT_PATTERNS) {
    const row = { found: 0, trashed: 0, wouldTrash: 0 }
    summary.byPattern[p.key] = row
    let refs: Array<{ id: string }> = []
    try {
      refs = await searchMessages(accessToken, sweepQuery(p, opts.newerThanDays), opts.maxPerPattern ?? 500)
    } catch (e) {
      summary.errors.push(`${p.key}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    for (const ref of refs) {
      if (seen.has(ref.id)) continue
      seen.add(ref.id)
      summary.checked++
      const r = await trashPrivateSentCopy({ id: ref.id, via: "weekly-sweep", dryRun, accessToken, mailbox: conn.email })
      if (r.action === "kept") {
        const k = r.reason ?? "kept"
        summary.kept[k] = (summary.kept[k] ?? 0) + 1
        continue
      }
      row.found++
      if (r.action === "trashed") { summary.trashed++; row.trashed++ }
      else if (r.action === "would trash") { summary.wouldTrash++; row.wouldTrash++ }
      else { summary.failed++; if (summary.errors.length < 5) summary.errors.push(`${r.id}: ${r.reason}`) }
    }
  }
  console.log(
    `[sent-tidy] weekly sweep ${dryRun ? "(dry run) " : ""}checked=${summary.checked} trashed=${summary.trashed} wouldTrash=${summary.wouldTrash} failed=${summary.failed}`
  )
  return summary
}

/** Scopes on the stored Kitchen Gmail token (for the re-consent check). */
export async function gmailTokenScopes(): Promise<string[]> {
  const accessToken = await getValidGmailAccessToken()
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`)
  if (!res.ok) throw new Error(`tokeninfo ${res.status}`)
  const d = (await res.json()) as { scope?: string }
  return (d.scope ?? "").split(/\s+/).filter(Boolean)
}
