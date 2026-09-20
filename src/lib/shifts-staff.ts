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

function shiftsBase(): string | null {
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

export type VerifyResult =
  | { ok: true; staff: ShiftsStaff }
  | { ok: false; reason: "nomatch" | "locked" | "unavailable" }

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
export async function remindPin(lastName: string, email: string, ip: string): Promise<void> {
  const base = shiftsBase()
  const secret = process.env.SHIFTS_SECRET
  if (!base || !secret) return
  try {
    await fetch(`${base}/api/internal/remind-pin`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ lastName, email, ip }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    console.error("[shifts-staff] remind-pin failed", e)
  }
}
