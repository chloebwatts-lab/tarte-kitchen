import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getPerson, isOwnerDevice, isOwnerSession } from "@/lib/person-session"
import {
  TIER_LANDING,
  TIER_OVERRIDES_KEY,
  meetsTier,
  parseTierOverrides,
  tierForHref,
  tierOfRole,
  tierWithOverrides,
  type Tier,
} from "@/lib/access/tiers"
import { COPY_QUIET_SETTING_KEY, isCopyQuietHref, isQuietPerson } from "@/lib/manager-quiet"

/**
 * Who is holding the device, as a tier (see src/lib/access/tiers.ts).
 * The office login and the owner's phone are OWNER whoever is signed in
 * underneath. Nobody signed in is null. The Shifts role is the base and
 * Chloe's override list can raise it.
 */
export async function getTier(): Promise<Tier | null> {
  if (await isOwnerSession()) return "OWNER"
  if (await isOwnerDevice()) return "OWNER"
  const person = await getPerson()
  if (!person) return null
  const base = tierOfRole(person.role)
  if (base === "OWNER") return base
  const row = await db.appSetting.findUnique({ where: { key: TIER_OVERRIDES_KEY } })
  return tierWithOverrides(base, parseTierOverrides(row?.value), { id: person.id, name: person.name })
}

export async function hasTier(need: Tier): Promise<boolean> {
  return meetsTier(await getTier(), need)
}

/**
 * Copy-quiet list (Chloe, 12 Oct 2026): a senior who should hold nothing a
 * competitor could copy. See manager-quiet.ts. Never the office login or
 * the owner's phone.
 */
export async function isCopyQuiet(): Promise<boolean> {
  if (await isOwnerSession()) return false
  if (await isOwnerDevice()) return false
  const person = await getPerson()
  if (!person) return false
  const row = await db.appSetting.findUnique({ where: { key: COPY_QUIET_SETTING_KEY } })
  return isQuietPerson(row?.value, { id: person.id, name: person.name })
}

/** Tier and copy-quiet together, for one page. */
export async function mayOpen(href: string): Promise<boolean> {
  if (!(await hasTier(tierForHref(href)))) return false
  if (isCopyQuietHref(href) && (await isCopyQuiet())) return false
  return true
}

/**
 * Call at the top of a page or layout. Below the tier, the person lands back
 * on Staff tools with nothing said; the tile was never on their grid.
 */
export async function requireTier(need: Tier): Promise<void> {
  if (!(await hasTier(need))) redirect(TIER_LANDING)
}

/** requireTier for the page's own href, plus the copy-quiet list. */
export async function requirePage(href: string): Promise<void> {
  if (!(await mayOpen(href))) redirect(TIER_LANDING)
}

/**
 * Call at the top of a server action behind a tiered page. Actions can be
 * invoked by id with only the staff cookie, so the page gate alone is not
 * enough.
 */
export async function assertTier(need: Tier): Promise<void> {
  if (!(await hasTier(need))) throw new Error("Not available on this sign in.")
}

/** assertTier for the page the action serves, plus the copy-quiet list. */
export async function assertPage(href: string): Promise<void> {
  if (!(await mayOpen(href))) throw new Error("Not available on this sign in.")
}
