export const SINGLE_VENUES = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as const

/**
 * Pure generators for the EXAMPLE food-safety / operations records.
 *
 * Extracted 2026-08-26 so the nightly seed-yesterday cron and the CLI
 * backfill script share ONE definition of the numbers. The bands here are
 * QLD Food Standards 3.2.2: cold ≤5°C, hot ≥60°C, freezer −18..−20, cooling
 * off-heat → ≤21°C @2h → ≤5°C @6h, with a small rate of deliberate breaches
 * that each carry a corrective-action note. If you change a band, you change
 * it for both callers — that is the point. No DB access in this file.
 */

// Real staff who sign off checks, per venue (per Chris, 2026-07-12).
export const STAFF_BY_VENUE: Record<string, string[]> = {
  BURLEIGH: ["TM", "VS", "OW", "Ray", "DUW", "Yamill", "Fran", "S", "U", "CW", "SP"],
  BEACH_HOUSE: ["JR", "CC", "LC", "AU", "SP", "CJ", "CW", "VS", "CT", "Janeth"],
  TEA_GARDEN: ["JR", "CC", "LC", "AU", "SP", "CJ", "CW", "VS", "CT", "Janeth"],
}
const CURRUMBIN = STAFF_BY_VENUE.BEACH_HOUSE
export function staffFor(venue: string): string[] {
  return STAFF_BY_VENUE[venue] ?? CURRUMBIN
}

// Menu-grounded cook→chill items. Poached chicken + brisket weighted heavier at
// Burleigh (listed twice); lobster is a guaranteed daily batch at Currumbin.
// `start` = realistic off-the-heat temp band when cooling begins (item-specific:
// poached chicken comes off a ~80°C poach at 70s core; braises/stock come off
// much hotter; blanched lobster goes to ice slurry so its log starts lower).
export const I = {
  poachedChicken: { name: "Poached chicken breast", batches: ["8 kg batch", "2× 4 kg trays", "6 kg"], start: [68, 78] as [number, number] },
  brisket: { name: "Braised beef brisket", batches: ["1× 20 L pot", "2× 6 L containers", "10 kg"], start: [75, 88] as [number, number] },
  porkFilling: { name: "Pork & fennel sausage-roll filling", batches: ["12 kg", "1× 15 L tub", "10 kg"], start: [65, 75] as [number, number] },
  baconJam: { name: "Bacon jam", batches: ["1× 8 L pot", "4× 1 L jars", "6 L"], start: [80, 92] as [number, number] },
  stock: { name: "Chicken stock", batches: ["1× 20 L pot", "15 L", "2× 10 L containers"], start: [82, 95] as [number, number] },
  mushrooms: { name: "Sautéed mushrooms", batches: ["4 kg", "2× trays", "3 kg"], start: [70, 85] as [number, number] },
  confitTomatoes: { name: "Confit tomatoes", batches: ["3 kg", "2× trays", "1× 6 L tray"], start: [75, 90] as [number, number] },
  lobster: { name: "Lobster (blanched)", batches: ["6 lobsters", "4 kg tails", "1× tray"], start: [62, 72] as [number, number], fixedNote: "Ice slurry then cool room" },
}
export type CoolItem = (typeof I)[keyof typeof I]
export const COOLING_BY_VENUE: Record<string, { daily: CoolItem[]; pool: CoolItem[] }> = {
  BURLEIGH: {
    daily: [],
    pool: [I.poachedChicken, I.poachedChicken, I.poachedChicken, I.brisket, I.brisket, I.brisket, I.porkFilling, I.baconJam, I.stock, I.mushrooms, I.confitTomatoes],
  },
  BEACH_HOUSE: {
    // Chloe 2026-08-12: chicken is poached DAILY at Beach House, same as
    // the lobster slurry batch — both are guaranteed daily entries.
    daily: [I.lobster, I.poachedChicken],
    pool: [I.mushrooms, I.confitTomatoes, I.brisket],
  },
}

// ── deterministic PRNG so re-runs produce identical values ──────────────────
export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function rng(seed: string) {
  let a = hash(seed)
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)]
export const round1 = (n: number) => Math.round(n * 10) / 10

// NOTE: the timestamp columns are timezone-naive and the app's convention is
// naive-UTC (Prisma). Emitting "+10:00" here gets the offset silently DROPPED
// by Postgres and every time displays 10 h late — so convert AEST→UTC ourselves
// and emit a naive UTC string. (Bitten once: scripts/fix-seed-timestamps.ts.)
export function aestTs(dateStr: string, hour: number, min: number): string {
  const h = Math.max(0, Math.min(23, hour))
  const m = Math.max(0, Math.min(59, min))
  const utc = new Date(Date.UTC(
    Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)), h - 10, m
  ))
  return utc.toISOString().replace(/\.\d{3}Z$/, "")
}
export const SHIFT_HOUR: Record<string, number> = { OPEN: 9, MID: 14, CLOSE: 20, ANY: 11 }

export function readingFor(label: string, hotCheck: boolean, requireNote: boolean, r: () => number): { temp: number | null; note: string | null } {
  const l = label.toLowerCase()
  const roll = r()
  if (hotCheck) {
    if (roll < 0.015) return { temp: round1(57.5 + r() * 2), note: "Below 60°C — reheated to 75°C, re-checked 64°C before service" }
    return { temp: round1(62 + r() * 8), note: requireNote ? pick(r, ["In range", "At temp before loading", "OK ≥60°C"]) : null }
  }
  let band: [number, number]
  if (/freez/.test(l)) band = [-21, -18]
  else if (/walk|cool ?room/.test(l)) band = [1.2, 3.4]
  else if (/display|cabinet|pastry|cake/.test(l)) band = [2.6, 4.6]
  else band = [2.0, 4.4]
  if (/freez/.test(l)) {
    if (roll < 0.02) return { temp: round1(-14 + r() * 2), note: "Freezer −13°C — door seal checked, defrost cycle reset, back to −19°C" }
    return { temp: round1(band[0] + r() * (band[1] - band[0])), note: requireNote ? pick(r, ["Frozen solid", "OK", "In range"]) : null }
  }
  if (roll < 0.02) {
    const t = round1(5.5 + r() * 1.4)
    const action = pick(r, [
      "door found ajar — closed, stock checked OK, re-checked 30 min = 3.4°C",
      "thermostat nudged up overnight — adjusted, product still ≤5°C at core, re-checked 3.1°C",
      "compressor slow after delivery — stock moved to cool room, fridge back to 3.6°C",
    ])
    return { temp: t, note: `${round1(t)}°C — ${action}` }
  }
  if (roll < 0.10) {
    const t = round1(4.6 + r() * 0.4)
    return { temp: t, note: requireNote ? pick(r, ["Near limit — moved stock forward, monitoring", "Post-delivery, settled back down", "OK — checked twice"]) : "Near limit — monitoring" }
  }
  const t = round1(band[0] + r() * (band[1] - band[0]))
  return { temp: t, note: requireNote ? pick(r, ["In range", "OK", "Within range", "Clear"]) : null }
}

export function checkNote(label: string, r: () => number): string {
  const l = label.toLowerCase()
  const roll = r()
  if (/pest/.test(l)) {
    if (roll < 0.05) return pick(r, ["Small gap by back door — sealed, maintenance notified", "One moth in dry store — cleared, bait checked", "Fly screen loose — re-fixed same day"])
    return pick(r, ["No activity", "Clear", "No evidence seen"])
  }
  if (/label|date|use-by|rotation/.test(l)) {
    if (roll < 0.07) return pick(r, ["2× unlabelled containers discarded", "1 item at use-by — pulled and binned", "Older stock rotated forward, one tub discarded"])
    return pick(r, ["All labelled, FIFO OK", "In date", "Checked, rotated"])
  }
  return pick(r, ["Done", "Complete", "Checked", "OK"])
}

