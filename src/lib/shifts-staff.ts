import type { PersonRole } from "@/lib/person-auth"

/**
 * Tarte Shifts is the source of truth for who works here. Kitchen never
 * stores names or PINs: it asks Shifts "is this last name + PIN a current
 * staff member" and gets back who it is. Same secret + host as the pay-run
 * feed (SHIFTS_SECRET, SHIFTS_PAYRUNS_URL).
 */

export interface ShiftsStaff {
  id: string
  firstName: string
  lastName: string
  role: "STAFF" | "SENIOR" | "MANAGER" | "OWNER"
  venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
  email?: string | null
  minor?: boolean
  hasPin?: boolean
}

/** Origin of the Tarte Shifts app (SHIFTS_BASE_URL, else the pay-runs URL's origin). */
export function shiftsBase(): string | null {
  const explicit = process.env.SHIFTS_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")
  const payruns = process.env.SHIFTS_PAYRUNS_URL?.trim()
  if (!payruns) return null
  try {
    return new URL(payruns).origin
  } catch {
    return null
  }
}

/** Shifts SENIOR is Kitchen's supervisor tier (they held the managers password). */
export function toPersonRole(role: ShiftsStaff["role"]): PersonRole {
  return role === "SENIOR" ? "SUPERVISOR" : role
}

/**
 * A surname the way a phone keyboard types it: lower case, accents dropped,
 * hyphens as spaces, one space between words. "Martínez Carretero" and
 * "martinez  carretero" fold to the same thing.
 */
export function foldName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-‐‑–]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

/** How many other spellings are sent to Shifts after the typed one misses. */
export const MAX_SURNAME_CANDIDATES = 3

/**
 * Other spellings of a typed surname worth sending to Shifts once the typed
 * one has not matched. Shifts compares what it holds ("Martínez Carretero")
 * with what was typed, and a phone keyboard drops the accent ("Martinez
 * Carretero"), or the person types one half of a two word surname
 * ("Martinez"). Fran could not sign in for exactly this (13 Oct 2026).
 *
 * Returns surnames as Shifts holds them: first those that fold to the typed
 * one (accents, case, hyphens aside), then those that contain every typed
 * word as a whole word, each spelling once, never the typed spelling itself,
 * and at most MAX_SURNAME_CANDIDATES so a stranger guessing cannot turn one
 * attempt into many against Shifts' own lockout.
 */
export function surnameCandidates(typed: string, staff: ReadonlyArray<Pick<ShiftsStaff, "lastName">>): string[] {
  const t = foldName(typed)
  if (!t) return []
  const typedWords = t.split(" ")
  const typedExact = typed.trim().replace(/\s+/g, " ").toLowerCase()
  const same: string[] = []
  const part: string[] = []
  const seen = new Set<string>()
  for (const { lastName } of staff) {
    const held = (lastName ?? "").trim().replace(/\s+/g, " ")
    if (!held || seen.has(held)) continue
    seen.add(held)
    if (held.toLowerCase() === typedExact) continue
    const f = foldName(held)
    if (f === t || joined(f) === joined(t)) {
      same.push(held)
      continue
    }
    const words = f.split(" ")
    if (words.length > typedWords.length && typedWords.every((w) => words.includes(w))) part.push(held)
    // "Tsaichi Wu" for "Tsai-Chi Wu": the typed words, run together, are a
    // run of the held words (Kim, 14 Oct 2026).
    else if (words.length > typedWords.length && typedWords.some((w) => w.length >= 4 && isRunOf(w, words))) part.push(held)
  }
  return [...same, ...part].slice(0, MAX_SURNAME_CANDIDATES)
}

/** A folded name with its spaces removed, so "tsai chi wu" and "tsaichi wu" agree. */
function joined(folded: string): string {
  return folded.replace(/ /g, "")
}

/** Is `w` two or more consecutive words of `words` written as one ("tsaichi" in tsai chi wu)? */
function isRunOf(w: string, words: string[]): boolean {
  for (let i = 0; i < words.length; i++) {
    let acc = ""
    for (let j = i; j < words.length; j++) {
      acc += words[j]
      if (j > i && acc === w) return true
      if (acc.length >= w.length) break
    }
  }
  return false
}

export type VerifyResult =
  | { ok: true; staff: ShiftsStaff }
  | { ok: false; reason: "nomatch" | "locked" | "unavailable" }

async function askVerify(base: string, secret: string, lastName: string, pin: string, ip: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${base}/api/internal/verify-staff`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ lastName, pin, ip }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 429) return { ok: false, reason: "locked" }
    if (!res.ok) return { ok: false, reason: "unavailable" }
    const data = (await res.json()) as { ok: boolean; staff?: ShiftsStaff }
    return data.ok && data.staff ? { ok: true, staff: data.staff } : { ok: false, reason: "nomatch" }
  } catch (e) {
    console.error("[shifts-staff] verify failed", e)
    return { ok: false, reason: "unavailable" }
  }
}

export async function verifyStaff(lastName: string, pin: string, ip: string): Promise<VerifyResult> {
  // Local development without a Shifts connection: one fixed dev identity.
  if (process.env.NODE_ENV !== "production" && process.env.PERSON_DEV_LOGIN === "1") {
    if (lastName.trim().toLowerCase() === "dev" && pin === "0000") {
      return { ok: true, staff: { id: "dev-staff", firstName: "Dev", lastName: "Tester", role: "STAFF", venue: "BURLEIGH", email: null } }
    }
    if (lastName.trim().toLowerCase() === "devmanager" && pin === "0000") {
      return { ok: true, staff: { id: "dev-manager", firstName: "Dev", lastName: "Manager", role: "MANAGER", venue: "BURLEIGH", email: null } }
    }
    return { ok: false, reason: "nomatch" }
  }
  const base = shiftsBase()
  const secret = process.env.SHIFTS_SECRET
  if (!base || !secret) return { ok: false, reason: "unavailable" }
  const first = await askVerify(base, secret, lastName, pin, ip)
  if (first.ok || first.reason !== "nomatch") return first
  // The typed spelling missed. Try the spellings Shifts actually holds that
  // the person could have meant (accent dropped, half of a two word surname).
  // Shifts still judges the PIN every time; this only fixes the spelling.
  const staff = await listActiveStaff()
  if (!staff) return first
  for (const alt of surnameCandidates(lastName, staff)) {
    const r = await askVerify(base, secret, alt, pin, ip)
    if (r.ok || r.reason !== "nomatch") return r
  }
  return first
}

export async function listActiveStaff(): Promise<ShiftsStaff[] | null> {
  const base = shiftsBase()
  const secret = process.env.SHIFTS_SECRET
  if (!base || !secret) return null
  try {
    const res = await fetch(`${base}/api/internal/staff-list`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok: boolean; staff?: ShiftsStaff[] }
    return data.ok ? (data.staff ?? []) : null
  } catch {
    return null
  }
}

/** Ask Shifts to email the PIN to the address already on that person's record. Says nothing either way. */
export async function remindPin(lastName: string, email: string, ip: string, signed = false): Promise<void> {
  const base = shiftsBase()
  const secret = process.env.SHIFTS_SECRET
  if (!base || !secret) return
  try {
    await fetch(`${base}/api/internal/remind-pin`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ lastName, email, ip, signed }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    console.error("[shifts-staff] remind-pin failed", e)
  }
}

async function askFind(base: string, secret: string, lastName: string, email: string, ip: string): Promise<ShiftsStaff | null> {
  try {
    const res = await fetch(`${base}/api/internal/find-staff`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ lastName, email, ip }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok: boolean; staff?: ShiftsStaff }
    return data.ok && data.staff ? data.staff : null
  } catch (e) {
    console.error("[shifts-staff] find failed", e)
    return null
  }
}

/**
 * Who is this, by last name + the email on their record? Never returns a
 * PIN. Same spelling fallback as sign in, so "Forgot your PIN, or never had
 * one?" finds Martínez Carretero when Martinez was typed; the email on the
 * record still has to match.
 */
export async function findStaff(lastName: string, email: string, ip: string): Promise<ShiftsStaff | null> {
  if (process.env.NODE_ENV !== "production" && process.env.PERSON_DEV_LOGIN === "1") {
    return lastName.trim().toLowerCase() === "dev"
      ? { id: "dev-staff", firstName: "Dev", lastName: "Tester", role: "STAFF", venue: "BURLEIGH", email }
      : null
  }
  const base = shiftsBase()
  const secret = process.env.SHIFTS_SECRET
  if (!base || !secret) return null
  const found = await askFind(base, secret, lastName, email, ip)
  if (found) return found
  const staff = await listActiveStaff()
  if (!staff) return null
  for (const alt of surnameCandidates(lastName, staff)) {
    const r = await askFind(base, secret, alt, email, ip)
    if (r) return r
  }
  return null
}
