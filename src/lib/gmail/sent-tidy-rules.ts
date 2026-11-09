/**
 * Which Sent copies in the shared accounts@ mailbox must be trashed.
 *
 * Chloe's rule (30 Oct 2026, scope clarified 9 Nov 2026): nothing about her
 * profit or earnings may sit in accounts@, which staff read. Every app that
 * emails her wages, COGS, sales, P&L, BAS or payroll figures from accounts@
 * trashes its own Sent copy right after sending, and a weekly sweep catches
 * any that were missed. The recipient's copy (chloe@, shawna@) lives in a
 * different mailbox and is never touched.
 *
 * Onboarding, PIN, time off, reviews, HACCP, checklists, end of day and
 * supplier mail are NOT on this list and stay in Sent.
 *
 * Source list: tarte-loose-ends/reference/accounts-sent-private-subjects.md
 * (kept by the CBK coordinator). Pure module, no IO, so it is unit tested.
 */

export type PrivateSentPattern = {
  key: string
  /** Who sends it, for logs and the weekly sweep summary. */
  sender: string
  /** Matched against the decoded Subject header. */
  re: RegExp
  /** Gmail search terms that find candidates; `re` has the final say. */
  query: string
}

export const PRIVATE_SENT_PATTERNS: PrivateSentPattern[] = [
  { key: "weekly-digest", sender: "Kitchen Friday digest", re: /^Tarte weekly: /, query: 'subject:"Tarte weekly"' },
  { key: "venue-results", sender: "Thursday venue cards task", re: /^Venue results w\/e /, query: 'subject:"Venue results"' },
  { key: "team-notes", sender: "Thursday venue cards task", re: /^Team notes\b/, query: 'subject:"Team notes"' },
  { key: "bookkeeping-week", sender: "CBK Wednesday report task", re: /^Bookkeeping this week, /, query: 'subject:"Bookkeeping this week"' },
  { key: "owner-daily", sender: "Shifts owner daily", re: /^Tarte today, .*: wages and COGS$/, query: 'subject:"wages and COGS"' },
  { key: "payroll-check", sender: "Shifts payroll check", re: /^Tarte Shifts payroll check, week ending /, query: 'subject:"payroll check"' },
  { key: "gm-rosters", sender: "Kitchen GM morning note", re: /^Today: Rosters and wages \(/, query: 'subject:"Rosters and wages"' },
  { key: "gm-money", sender: "Kitchen GM morning note", re: /^Today: Kitchen and money \(/, query: 'subject:"Kitchen and money"' },
  { key: "gm-report", sender: "Kitchen GM Monday report", re: /^Oliver's Monday report, /, query: 'subject:"Monday report"' },
  { key: "gm-no-report", sender: "Kitchen GM Monday wrap", re: /^No Monday report from Oliver, /, query: 'subject:"No Monday report"' },
  { key: "cogs-tracking", sender: "Kitchen Sunday COGS email", re: /^COGS TRACKING \(/, query: 'subject:"COGS TRACKING"' },
  { key: "bas", sender: "CBK BAS notes", re: /\bBAS\b/, query: "subject:BAS" },
  { key: "ias", sender: "CBK IAS notes", re: /\bIAS\b/, query: "subject:IAS" },
  { key: "payroll-tax", sender: "CBK payroll tax notes", re: /\bpayroll tax\b/i, query: 'subject:"payroll tax"' },
]

/** Decode RFC 2047 encoded words (=?UTF-8?B?...?= / =?UTF-8?Q?...?=). Gmail
 *  normally hands back decoded headers; this is a backstop. */
export function decodeMimeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, _charset: string, enc: string, data: string) => {
    try {
      if (enc.toUpperCase() === "B") return Buffer.from(data, "base64").toString("utf-8")
      const bytes = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
      return Buffer.from(bytes, "latin1").toString("utf-8")
    } catch {
      return whole
    }
  }).replace(/\?=\s+=\?/g, "?==?")
}

export function matchPrivateSentSubject(subject: string): PrivateSentPattern | null {
  const s = decodeMimeHeader(subject).trim()
  return PRIVATE_SENT_PATTERNS.find((p) => p.re.test(s)) ?? null
}

export function isPrivateSentSubject(subject: string): boolean {
  return matchPrivateSentSubject(subject) !== null
}

/** Pull bare addresses out of a To/Cc/From header value. */
export function addressesIn(header: string | undefined | null): string[] {
  if (!header) return []
  const out = header.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
  return out.map((a) => a.toLowerCase())
}

export type SentMeta = {
  id: string
  labelIds: string[]
  subject: string
  from: string
  to: string
  cc: string
}

export type TrashDecision =
  | { trash: true; pattern: PrivateSentPattern | null }
  | { trash: false; reason: string }

/**
 * Safety checks before trashing one message in the connected mailbox.
 * `explicit` = the sending code itself marked the email private, so the
 * subject list is not required (it still must be a plain Sent copy).
 */
export function decideTrash(meta: SentMeta, mailbox: string, opts: { explicit?: boolean } = {}): TrashDecision {
  const me = mailbox.toLowerCase()
  if (!meta.labelIds.includes("SENT")) return { trash: false, reason: "not a Sent message" }
  if (meta.labelIds.includes("TRASH")) return { trash: false, reason: "already in Trash" }
  // A message accounts@ sent to itself carries SENT and INBOX on the same
  // id: trashing it would also remove the inbox copy, so never.
  if (meta.labelIds.includes("INBOX")) return { trash: false, reason: "also in the Inbox" }
  const from = addressesIn(meta.from)
  if (!from.includes(me)) return { trash: false, reason: "not sent from this mailbox" }
  if ([...addressesIn(meta.to), ...addressesIn(meta.cc)].includes(me)) {
    return { trash: false, reason: "this mailbox is a recipient" }
  }
  const pattern = matchPrivateSentSubject(meta.subject)
  if (!pattern && !opts.explicit) return { trash: false, reason: "subject not on the private list" }
  return { trash: true, pattern }
}

/** One log line, no figures (subjects on the list carry dates only). */
export function tidyLogLine(p: { action: "trashed" | "would trash" | "kept" | "failed"; id: string; subject: string; via: string; reason?: string }): string {
  const subj = decodeMimeHeader(p.subject).replace(/[\r\n]+/g, " ").slice(0, 120)
  return `[sent-tidy] ${p.action} accounts@ Sent copy id=${p.id} subject="${subj}" via=${p.via}${p.reason ? ` reason=${p.reason}` : ""}`
}

export function isTruthyFlag(v: string | undefined | null): boolean {
  return !!v && /^(1|true|yes|on)$/i.test(v.trim())
}

/** Gmail search for the weekly sweep, one per pattern. */
export function sweepQuery(p: PrivateSentPattern, newerThanDays?: number): string {
  return `in:sent -in:trash ${p.query}${newerThanDays ? ` newer_than:${newerThanDays}d` : ""}`
}
