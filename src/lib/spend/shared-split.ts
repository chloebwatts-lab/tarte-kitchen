/**
 * How a shared invoice (venue BOTH) is divided between the two spend
 * buckets. Default is half each (Breadtop, per Chloe 2026-07-14). A supplier
 * listed here gets its own ratio.
 *
 * Parallel Roasters is NOT shared any more (it never was): they raise one
 * invoice per venue per week, Burleigh's via Unleashed and Currumbin's from
 * accounts@parallelroasters.com, which was not a mapped sender until
 * 2026-10-16. The 55/45 rule of 2026-09-20 split Burleigh's invoice across
 * both venues and left Currumbin's out entirely. Venue now comes from the
 * email (src/lib/invoices/venue-from-address.ts, venueHintFromEmail).
 *
 * Pure module, no DB, so the spend tracker, the invoice scan and one-off
 * scripts all read the same numbers.
 */

export interface SharedSplit {
  BURLEIGH: number
  CURRUMBIN: number
}

const EVEN_SPLIT: SharedSplit = { BURLEIGH: 0.5, CURRUMBIN: 0.5 }

/** Case-insensitive prefix match on the canonical supplier name. */
const SUPPLIER_SPLITS: Array<{ prefix: string; split: SharedSplit }> = []

export function sharedSplit(supplierName: string | null | undefined): SharedSplit {
  const s = (supplierName ?? "").trim().toLowerCase()
  for (const rule of SUPPLIER_SPLITS) {
    if (s.startsWith(rule.prefix)) return rule.split
  }
  return EVEN_SPLIT
}

/** "55/45" style label for buttons and notes, Burleigh first. */
export function sharedSplitLabel(supplierName: string | null | undefined): string {
  const sp = sharedSplit(supplierName)
  return `${Math.round(sp.BURLEIGH * 100)}/${Math.round(sp.CURRUMBIN * 100)}`
}
