import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"

/** Slug series per venue: B01… Burleigh, C01… Beach House (Currumbin). */
const SLUG_PREFIX: Record<string, string> = {
  BURLEIGH: "B",
  BEACH_HOUSE: "C",
}

/**
 * Next free QR slug for a venue. Zero-padded to 2 digits like the existing
 * series but not capped at 99 — B100 is fine when we get there.
 */
export async function nextAssetSlug(venue: Venue): Promise<string> {
  const prefix = SLUG_PREFIX[venue] ?? "X"
  const existing = await db.maintenanceAsset.findMany({
    where: { slug: { startsWith: prefix } },
    select: { slug: true },
  })
  let max = 0
  for (const { slug } of existing) {
    const n = parseInt(slug.slice(prefix.length), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`
}
