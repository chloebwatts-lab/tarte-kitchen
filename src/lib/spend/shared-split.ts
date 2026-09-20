/**
 * How a shared invoice (venue BOTH) is divided between the two spend
 * buckets. Default is half each (Breadtop, per Chloe 2026-07-14). A supplier
 * listed here gets its own ratio.
 *
 * Parallel Roasters (coffee): since August 2026 they send ONE invoice a week
 * covering both venues instead of one each. Chloe's rule, 2026-09-20:
 * 55% Burleigh, 45% Currumbin (Beach House).
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
const SUPPLIER_SPLITS: Array<{ prefix: string; split: SharedSplit }> = [
  { prefix: "parallel roasters", split: { BURLEIGH: 0.55, CURRUMBIN: 0.45 } },
]

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

/**
 * Parallel Roasters invoices dated on or after this day are single weekly
 * invoices for both venues (first one that landed unassigned: 12 Aug 2026).
 * Earlier ones were handled by the larger to Burleigh, smaller to Beach House
 * pair rule, which still applies to any older row that turns up.
 */
export const PARALLEL_SINGLE_INVOICE_FROM = new Date("2026-08-12T00:00:00Z")
