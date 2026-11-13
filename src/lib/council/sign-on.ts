/**
 * Council sign-ons: Burleigh venue owners backing the joint letter to Council
 * on the light rail roadside dining fee (Chloe, 13 Nov 2026). Oliver collects
 * them door to door on the iPad from the GM desk (/kitchen/gm/council).
 *
 * Pure helpers only (no db), so the rules can be tested.
 */

export const CAMPAIGN = "roadside-dining-2026"

/** Signed sheets are due back to Chloe on this day; the letter goes on 30 Nov. */
export const DUE_ON = "2026-11-27"

export const STATUSES = ["todo", "signed", "later", "no", "skip"] as const
export type SignOnStatus = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<SignOnStatus, string> = {
  todo: "To visit",
  signed: "Signed",
  later: "Come back",
  no: "Said no",
  skip: "No footpath tables",
}

export function isStatus(s: unknown): s is SignOnStatus {
  return typeof s === "string" && (STATUSES as readonly string[]).includes(s)
}

/**
 * The key a business is filed and de-duplicated under: lower case, a leading
 * "The" dropped, punctuation and spacing folded. "The Pantry" and "pantry"
 * are the same business.
 */
export function sortKey(name: string): string {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/^the\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export const FIELD_LIMITS = {
  owner: 80,
  permit: 40,
  worksPct: 60,
  openedPct: 60,
  nowPct: 60,
  setupHours: 20,
  email: 120,
  note: 300,
} as const

export type SignOnField = keyof typeof FIELD_LIMITS
export type SignOnFields = Record<SignOnField, string>
export const FIELD_NAMES = Object.keys(FIELD_LIMITS) as SignOnField[]

/** Trims every field, drops control characters and caps the length. Unknown keys are ignored. */
export function cleanFields(input: Record<string, unknown> | null | undefined): SignOnFields {
  const out = {} as SignOnFields
  for (const f of FIELD_NAMES) {
    const raw = input && typeof input[f] === "string" ? (input[f] as string) : ""
    out[f] = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, FIELD_LIMITS[f])
  }
  return out
}

/** Largest signature image the server accepts (a 600px wide PNG is about 20 to 40 KB). */
export const SIGNATURE_MAX_CHARS = 400_000

export function isSignaturePng(s: unknown): s is string {
  if (typeof s !== "string") return false
  const prefix = "data:image/png;base64,"
  if (!s.startsWith(prefix) || s.length > SIGNATURE_MAX_CHARS) return false
  const body = s.slice(prefix.length)
  return body.length >= 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(body)
}

/** What a business needs before it can be saved as signed. */
export function signProblem(p: { owner: string; hasSignature: boolean }): string | null {
  if (!p.owner.trim()) return "Add the owner or manager's name first."
  if (!p.hasSignature) return "Ask them to sign in the box first."
  return null
}

/** The iPad's signing time, if it is believable (not more than 10 minutes ahead, not older than 30 days), else now. */
export function signedTime(iso: unknown, now: number = Date.now()): Date {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN
  return Number.isFinite(t) && t <= now + 10 * 60_000 && t >= now - 30 * 86_400_000 ? new Date(t) : new Date(now)
}

/** What the owner is signing, shown above the signature box. */
export const ASKS = [
  "Hold the light rail fee moratorium on roadside dining until 31 December 2027.",
  "Bring fees back at 50% in 2028 and the full rate from 2029.",
  "Review the per m2 rate using 2027 trading and the daily cost of packing furniture away.",
]

/** Oliver's door-to-door script (Chloe: short, he is not stupid). */
export const SCRIPT: { heading: string; points: string[] }[] = [
  {
    heading: "The pitch",
    points: [
      "Council's fee holiday on footpath dining ends 31 Dec. Fees start again in January.",
      "The tram works hurt all of us. Tarte lost 14% of its customers over two years.",
      "The tram helped when it opened (sales +17%), but that's gone. November is barely up.",
      "We're asking Council to hold the fee holiday to Dec 2027, then 50% in 2028, and review the rate: about $200 per m2 a year, on top of staff time to set up and pack away every day.",
    ],
  },
  {
    heading: "What we need",
    points: [
      "Their signature.",
      "Optional: a rough % for during the works, after the tram opened, and now. No dollars.",
      "Optional: staff hours a day spent setting up and packing away.",
    ],
  },
  {
    heading: "If they push back",
    points: [
      "Numbers are optional, just sign.",
      "It goes to the Mayor and Cr Josh Martin, % only.",
      "Not ready? Mark them Come back and go back before 27 Nov.",
    ],
  },
]
