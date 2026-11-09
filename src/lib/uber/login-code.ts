/**
 * Uber's "log in with email" sends a 4-digit code to the account's mailbox
 * (accounts@tarte.com.au, which Kitchen already reads for invoices). The
 * self-sign-in job (tools/uber-login) asks Kitchen for that code through
 * /api/internal/uber-login-code, so the code never passes through a person.
 * Pure helpers here, no I/O, so they can be unit-tested.
 */

/** True for mail from Uber itself (admin@uber.com, noreply@uber.com, ...). */
export function isUberSender(from: string | null | undefined): boolean {
  if (!from) return false
  const m = from.match(/<([^>]+)>/)
  const addr = (m ? m[1] : from).trim().toLowerCase()
  return /@(?:[a-z0-9-]+\.)*uber\.com$/.test(addr)
}

/**
 * The 4-digit code out of an Uber login email. Uber has worded it
 * "Do not share: 1234", "1234 is your Uber code" and "Your code is 1234";
 * the subject often carries it too. Prefers a code next to the words
 * code / share / verification, else the only standalone 4-digit number.
 * Returns null when nothing looks like a code (so a marketing email never
 * yields a "code").
 */
export function extractUberLoginCode(subject: string | null | undefined, body: string | null | undefined): string | null {
  const texts = [subject ?? "", body ?? ""]
  for (const t of texts) {
    const near = t.match(/(?:do not share|don't share|code(?: is)?|verification)[^0-9]{0,40}?\b(\d{4})\b/i)
    if (near) return near[1]
    const before = t.match(/\b(\d{4})\b[^0-9]{0,30}?is your(?: uber)? (?:code|verification)/i)
    if (before) return before[1]
  }
  for (const t of texts) {
    const all = Array.from(new Set((t.match(/(?<![\d.,$])\b\d{4}\b(?![\d.,%])/g) ?? []).filter((n) => !/^(19|20)\d{2}$/.test(n))))
    if (all.length === 1) return all[0]
  }
  return null
}

export interface LoginCodeCandidate { id: string; receivedAt: number; from: string | null; subject: string | null; body: string }

/**
 * Picks the newest Uber login code received at or after `sinceMs`. Older
 * codes (an earlier attempt today) are ignored so a stale one is never typed.
 */
export function pickLoginCode(messages: LoginCodeCandidate[], sinceMs: number): { code: string; receivedAt: number; subject: string | null } | null {
  const fresh = messages
    .filter((m) => m.receivedAt >= sinceMs && isUberSender(m.from))
    .sort((a, b) => b.receivedAt - a.receivedAt)
  for (const m of fresh) {
    const code = extractUberLoginCode(m.subject, m.body)
    if (code) return { code, receivedAt: m.receivedAt, subject: m.subject }
  }
  return null
}
