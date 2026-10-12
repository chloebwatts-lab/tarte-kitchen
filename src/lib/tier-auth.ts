import { redirect } from "next/navigation"
import { getPerson, isOwnerDevice, isOwnerSession } from "@/lib/person-session"
import { TIER_LANDING, meetsTier, tierOfRole, type Tier } from "@/lib/access/tiers"

/**
 * Who is holding the device, as a tier (see src/lib/access/tiers.ts).
 * The office login and the owner's phone are OWNER whoever is signed in
 * underneath. Nobody signed in is null.
 */
export async function getTier(): Promise<Tier | null> {
  if (await isOwnerSession()) return "OWNER"
  if (await isOwnerDevice()) return "OWNER"
  const person = await getPerson()
  return person ? tierOfRole(person.role) : null
}

export async function hasTier(need: Tier): Promise<boolean> {
  return meetsTier(await getTier(), need)
}

/**
 * Call at the top of a page or layout. Below the tier, the person lands back
 * on Staff tools with nothing said; the tile was never on their grid.
 */
export async function requireTier(need: Tier): Promise<void> {
  if (!(await hasTier(need))) redirect(TIER_LANDING)
}

/**
 * Call at the top of a server action behind a tiered page. Actions can be
 * invoked by id with only the staff cookie, so the page gate alone is not
 * enough.
 */
export async function assertTier(need: Tier): Promise<void> {
  if (!(await hasTier(need))) throw new Error("Not available on this sign in.")
}
