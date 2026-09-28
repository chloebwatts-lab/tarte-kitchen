/**
 * Deterministic clean-up applied to every drafted review reply before it is
 * stored, emailed or shown.
 *
 * The system prompt already forbids all of this, and the model still slips.
 * An audit of the 576 replies live on Google in September 2026 found 6 with a
 * real en dash, 49 using a spaced hyphen as a dash, and 2 calling a cruller a
 * churro. Those are the hardest voice rules and the ones that make a reply
 * read as machine-written, so they are enforced in code rather than asked for
 * politely. tarte-seo-engine has the same helper on its side.
 *
 * Everything here is a rule with one right answer. Anything needing judgement
 * stays in the prompt, and Chloe still reads and approves the final text.
 */

/** Names Google shows that are not a person, so a reply must not greet them. */
const NON_NAMES = new Set([
  "the", "a", "an", "no", "none", "user", "google", "local", "guide",
  "test", "me", "mr", "ms", "mrs", "anonymous", "customer",
])

/**
 * True when a reviewer's display name is safe to greet.
 *
 * Google truncates some display names to a single word, which is how a 1-star
 * Beach House review got the live reply "Hey The, I'm genuinely sorry..." in
 * September 2026.
 */
export function isUsableName(name: string | null | undefined): boolean {
  const n = name?.trim()
  if (!n || n.length < 3) return false
  if (NON_NAMES.has(n.toLowerCase())) return false
  return /[A-Za-z]{3}/.test(n)
}

/**
 * Phrases that read as a freebie, voucher or comp. Tarte never offers these
 * in a review reply (standing rule from Chloe: invite them back at full
 * price). The prompt says so, and this is the code backstop.
 */
const COMP_PHRASES: RegExp[] = [
  /\bon (us|the house)\b/i,
  // "free" as a giveaway, not "feel free", "free range" or "gluten free".
  /(?<!\b(?:feel|gluten|dairy|nut|sugar|lactose|hands)[ -])\bfree\b(?![ -](?:range|to\b|from\b))/i,
  /\bvouchers?\b/i,
  /\bgift ?cards?\b/i,
  /\bcomplimentary\b/i,
  /\bcomp(ed|s)?\b/i,
  /\bno charge\b/i,
  /\bat no cost\b/i,
  /\bour (shout|treat)\b/i,
  /\bwe'?ll (cover|pay for|take care of) (it|that|the)\b/i,
  /\brefund/i,
  /\bmoney back\b/i,
  /\bdiscount/i,
  /\b\d{1,3} ?% off\b/i,
  /\breplace (it|that|your)\b/i,
]

/**
 * The first freebie-style phrase in a reply, or null when it is clean.
 * Exported so the approve route can refuse to post a flagged reply.
 */
export function flagsComp(text: string): string | null {
  for (const re of COMP_PHRASES) {
    const m = text.match(re)
    if (m) return m[0]
  }
  return null
}

export function scrubReply(text: string): string {
  let out = text

  // Em and en dashes become a comma.
  out = out.replace(/\s*[—–]\s*/g, ", ")

  // A hyphen spaced out as a dash. Hyphenated words (well-made, drop-in)
  // have no spaces, so they are untouched.
  out = out.replace(/\s+-{1,2}\s+/g, ", ")

  // Ellipsis.
  out = out.replace(/\s*(\.{3}|…)\s*/g, ". ")

  // Product naming: Tarte sells crullers.
  out = out.replace(/\bchurros\b/gi, (m) =>
    m[0] === "C" ? "Crullers" : "crullers"
  )
  out = out.replace(/\bchurro\b/gi, (m) => (m[0] === "C" ? "Cruller" : "cruller"))

  // A comma swap can leave ", ." or double punctuation behind.
  out = out.replace(/,\s*([.!?,])/g, "$1")
  out = out.replace(/\s+([.,!?])/g, "$1")
  out = out.replace(/[ \t]{2,}/g, " ")

  return out.trim()
}
