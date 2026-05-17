/**
 * Canonical list of suppliers Tarte expects to receive invoices from at
 * accounts@. Drives the coverage audit on the live spend page: anything
 * here without a recent invoice gets flagged so we can chase the
 * supplier to add accounts@ to their billing list.
 *
 * Categories and intervals come from chat with Chris 2026-05-16/17 and
 * the tarte_suppliers.md memory. `nameAliases` covers all the variants
 * we've seen come through Gmail (different casings, "The Provedores"
 * vs "Provedores", etc.) so the audit groups them under one canonical
 * row.
 */

export type SupplierCategory =
  | "broadline"
  | "fruit-veg"
  | "produce"
  | "meat"
  | "seafood"
  | "bread"
  | "pastry-supply"
  | "pastry-dry"
  | "dairy-specialty"
  | "milk"
  | "eggs"
  | "booze"
  | "specialty"
  | "unknown"

export interface ExpectedSupplier {
  canonicalName: string
  nameAliases: string[]
  category: SupplierCategory
  /// Typical days between invoices. Used to compute "overdue" — actual
  /// gap > 2× this triggers the amber/red flag.
  expectedIntervalDays: number
  /// If true, missing invoices block the spend tally from being credible
  /// (e.g. Bidfood, Pacific). Soft fail for the small ones.
  critical: boolean
  /// Free-text note shown next to the row (e.g. "booze — folded into
  /// Drinks line in COGS xlsx; needs accounts@ added").
  note?: string
}

export const EXPECTED_SUPPLIERS: ExpectedSupplier[] = [
  // ---- Confirmed invoicing today ----
  {
    canonicalName: "Bidfood",
    nameAliases: ["Bidfood"],
    category: "broadline",
    expectedIntervalDays: 3,
    critical: true,
  },
  {
    canonicalName: "Pixel Bread",
    nameAliases: ["Pixel Bread", "Pixel Bakehouse", "Pixel"],
    category: "bread",
    expectedIntervalDays: 1,
    critical: true,
  },
  {
    canonicalName: "Son of a Bunn",
    nameAliases: ["Son Of A Bunn", "Son of a Bunn"],
    category: "meat",
    expectedIntervalDays: 3,
    critical: true,
    note: "meats — not cleaning, not bakery",
  },
  {
    canonicalName: "Jensens",
    nameAliases: ["Jensens", "Jensen's"],
    category: "fruit-veg",
    expectedIntervalDays: 3,
    critical: true,
    note: "Fruit & veg (confirmed by Chris)",
  },
  {
    canonicalName: "Global Food & Wine",
    nameAliases: ["Global Food & Wine"],
    category: "seafood",
    expectedIntervalDays: 7,
    critical: true,
    note: "seafood + some wine",
  },
  {
    canonicalName: "EasyVend",
    nameAliases: ["EasyVend"],
    category: "milk",
    expectedIntervalDays: 7,
    critical: true,
    note: "Norco milk via EasyVend platform (confirmed by Chris)",
  },
  {
    canonicalName: "Marrow Meats",
    nameAliases: ["Marrow Meats"],
    category: "meat",
    expectedIntervalDays: 7,
    critical: true,
  },
  {
    canonicalName: "Fermex",
    nameAliases: ["Fermex"],
    category: "pastry-dry",
    expectedIntervalDays: 7,
    critical: false,
  },
  {
    canonicalName: "Coastal Fresh",
    nameAliases: ["Coastal Fresh"],
    category: "specialty",
    expectedIntervalDays: 14,
    critical: false,
  },
  {
    canonicalName: "Cheese Time",
    nameAliases: ["Cheese Time", "Cheese Time Pty Ltd"],
    category: "specialty",
    expectedIntervalDays: 14,
    critical: false,
  },

  // ---- Known to deliver but invoices NOT reaching accounts@ ----
  {
    canonicalName: "Pacific Wholesale",
    nameAliases: ["Pacific Wholesale", "Pacific Fruit & Veg"],
    category: "fruit-veg",
    expectedIntervalDays: 3,
    critical: true,
    note: "PDFs arrive as application/octet-stream — parser fixed 2026-05-17, flow should resume next cron run",
  },
  {
    canonicalName: "The Provedores",
    nameAliases: ["The Provedores", "Provedores"],
    category: "dairy-specialty",
    expectedIntervalDays: 7,
    critical: true,
    note: "Same octet-stream bug as Pacific — fixed 2026-05-17",
  },
  {
    canonicalName: "Eustralis",
    nameAliases: ["Eustralis", "EUSTRALIS FOODS QLD PTY LTD"],
    category: "pastry-supply",
    expectedIntervalDays: 7,
    critical: true,
    note: "Invoices come from messaging-service@post.xero.com (shared with Pixel); 2nd mapping added 2026-05-17",
  },
  {
    canonicalName: "Produce Oz",
    nameAliases: ["Produce Oz"],
    category: "produce",
    expectedIntervalDays: 7,
    critical: true,
    note: "Never invoiced to accounts@ — needs setup",
  },
  {
    canonicalName: "Gold Coast Eggs",
    nameAliases: ["Gold Coast Eggs"],
    category: "eggs",
    expectedIntervalDays: 14,
    critical: true,
    note: "Bi-weekly — never invoiced to accounts@",
  },
  {
    canonicalName: "Joval Wines",
    nameAliases: ["Joval Wines", "Joval", "Joval Wines Pty Ltd"],
    category: "booze",
    expectedIntervalDays: 7,
    critical: true,
    note: "Added 2026-05-17 — invoices from accountsreceivable@joval.com.au",
  },
  {
    canonicalName: "Paramount Liquor",
    nameAliases: ["Paramount Liquor", "Paramount"],
    category: "booze",
    expectedIntervalDays: 14,
    critical: true,
    note: "Forwarded via shawna@tarte.com.au — subject pattern 'Fwd: Invoice - …'. Added 2026-05-17.",
  },
  {
    canonicalName: "Breadtop",
    nameAliases: ["Breadtop"],
    category: "bread",
    expectedIntervalDays: 7,
    critical: false,
  },
  {
    canonicalName: "Panya",
    nameAliases: ["Panya"],
    category: "specialty",
    expectedIntervalDays: 7,
    critical: false,
  },
  {
    canonicalName: "Made Brands",
    nameAliases: ["Made Brands"],
    category: "specialty",
    expectedIntervalDays: 14,
    critical: false,
  },
]

/**
 * Lookup: any invoice supplierName string → its canonical expected
 * supplier (or null if it's not on the list).
 */
export function matchExpectedSupplier(
  invoiceSupplierName: string
): ExpectedSupplier | null {
  const lower = invoiceSupplierName.toLowerCase().trim()
  for (const s of EXPECTED_SUPPLIERS) {
    if (s.nameAliases.some((a) => a.toLowerCase() === lower)) return s
  }
  return null
}
