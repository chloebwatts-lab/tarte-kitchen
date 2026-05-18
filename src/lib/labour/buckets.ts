/**
 * Maps Deputy operational-unit ("area") names to Tarte's department-wage
 * buckets per venue. The buckets line up with the targets in
 * `src/lib/weekly-digest/aggregator.ts` so the live tracker and the
 * Friday digest grade themselves against the same numbers.
 *
 * Areas not listed here fall through to "other" — usually the salary
 * placeholders themselves (kept in their bucket explicitly) or admin
 * roles that aren't part of dept-bucket targets.
 */

import type { Venue } from "@/generated/prisma"

export type Bucket = "chefsKp" | "fohBarista" | "pastry" | "other"

export interface BucketTarget {
  key: Bucket
  label: string
  min: number
  max: number
}

const BURLEIGH_AREAS: Record<string, Bucket> = {
  Kitchen: "chefsKp",
  KP: "chefsKp",
  PREP: "chefsKp",
  "Salary BOH BURLEIGH": "chefsKp",
  FOH: "fohBarista",
  Barista: "fohBarista",
  "Juice Bar": "fohBarista",
  "Takeaway Area": "fohBarista",
  "Salary FOH BURLEIGH": "fohBarista",
  Pastry: "pastry",
  "Salary PASTRY BURLEIGH": "pastry",
}

const BEACH_HOUSE_AREAS: Record<string, Bucket> = {
  "Restaurant Kitchen": "chefsKp",
  "Restaurant KP": "chefsKp",
  "Cafe Kitchen": "chefsKp",
  "Cafe KP": "chefsKp",
  "Food Prep": "chefsKp",
  "Salary Chef Currumbin": "chefsKp",
  "Restaurant FOH": "fohBarista",
  "Restaurant Bar": "fohBarista",
  "Restaurant Coffee": "fohBarista",
  "Cafe FOH": "fohBarista",
  "Cafe Coffee": "fohBarista",
  "Cafe Juice Bar": "fohBarista",
  Function: "fohBarista",
  "Salary Currumbin FOH": "fohBarista",
  Pastry: "pastry",
  "Salary Pastry Currumbin": "pastry",
}

const TEA_GARDEN_AREAS: Record<string, Bucket> = {
  "TG FOH": "fohBarista",
}

export function bucketFor(venue: Venue, area: string | null): Bucket {
  if (!area) return "other"
  const map =
    venue === "BURLEIGH"
      ? BURLEIGH_AREAS
      : venue === "BEACH_HOUSE"
        ? BEACH_HOUSE_AREAS
        : venue === "TEA_GARDEN"
          ? TEA_GARDEN_AREAS
          : null
  return map?.[area] ?? "other"
}

export function bucketTargets(venue: Venue): BucketTarget[] {
  // Mirrors WAGE_TARGETS in src/lib/weekly-digest/aggregator.ts. Kept
  // duplicated rather than imported to avoid the digest module pulling
  // in the labour-live module's prisma imports at build time.
  if (venue === "BURLEIGH") {
    return [
      { key: "chefsKp", label: "Chefs + KP", min: 11.5, max: 12.0 },
      { key: "fohBarista", label: "FOH + Barista", min: 20.5, max: 21.0 },
      { key: "pastry", label: "Pastry", min: 4.75, max: 5.25 },
    ]
  }
  if (venue === "BEACH_HOUSE") {
    return [
      { key: "chefsKp", label: "Chefs + KP", min: 12.5, max: 13.5 },
      { key: "fohBarista", label: "FOH (incl. Barista)", min: 21.5, max: 22.5 },
      { key: "pastry", label: "Pastry", min: 2.5, max: 3.0 },
    ]
  }
  // Tea Garden — no targets configured yet (only FOH mapped, kitchen
  // shared with Beach House). Returning an empty list hides the cards
  // until the venue has its own banding.
  return []
}

/**
 * Live wage-bucket status:
 *   - "ok" when projected % is at or under the band max
 *   - "amber" when within 0.5pp of the max
 *   - "red" beyond +0.5pp
 *   - "no-target" when no band is configured (e.g. Tea Garden)
 * One-sided like the digest — under-band is a win, not a flag.
 */
export function bucketStatus(
  pct: number | null,
  target: BucketTarget | null
): "ok" | "amber" | "red" | "no-target" {
  if (pct == null || target == null) return "no-target"
  if (pct <= target.max) return "ok"
  if (pct <= target.max + 0.5) return "amber"
  return "red"
}
