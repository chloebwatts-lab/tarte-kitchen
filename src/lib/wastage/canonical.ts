// Wastage reports group by `WasteEntry.itemName`, which is a free-text copy of
// whatever Dish/Preparation the staffer picked when logging. Because the same
// physical item exists in three places — Dish ("Croissant - Almond"),
// per-piece Preparation ("Almond Croissant - Each"), and batch Preparation
// ("Almond Croissant") — and staff pick any of them, the same waste shows up
// under multiple names and reports look fragmented.
//
// This helper builds a soft-key → canonical-name map so the report code can
// collapse variants into one row at read time without touching historical
// data. Canonical priority is Dish name → bare Prep name → "- Each"-stripped
// input.

const PER_PIECE_SUFFIX = /\s*-?\s*each\s*$/i

function tokens(name: string): { words: string[]; isMini: boolean } {
  const stripped = name.toLowerCase().trim().replace(PER_PIECE_SUFFIX, "")
  const isMini = /\bmini\b/i.test(stripped)
  const words = stripped
    .replace(/\bmini\b/gi, "")
    .replace(/[-–_]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  return { words, isMini }
}

function softKey(name: string): string {
  const { words, isMini } = tokens(name)
  return (isMini ? "mini::" : "") + words.sort().join(" ")
}

function stripPerPiece(name: string): string {
  return name.replace(PER_PIECE_SUFFIX, "").trim()
}

export type NameRow = { name: string }

export function buildCanonicalizer(
  dishes: NameRow[],
  preps: NameRow[],
): (itemName: string) => string {
  const byKey = new Map<string, string>()

  // Preps fill the map first so dishes override.
  for (const p of preps) {
    const k = softKey(p.name)
    const bare = stripPerPiece(p.name)
    const existing = byKey.get(k)
    if (!existing || bare.length < existing.length) byKey.set(k, bare)
  }
  for (const d of dishes) {
    byKey.set(softKey(d.name), d.name)
  }

  return (itemName: string) => byKey.get(softKey(itemName)) ?? stripPerPiece(itemName)
}
