/**
 * The no-paste route for Uber Eats (8 Nov 2026). Uber logs the pasted
 * session out about every 30 days, and Chloe can't use Chrome's Developer
 * tools to copy a new one. So a scheduled Claude task reads Uber Eats
 * Manager inside her signed-in Chrome (scripts/uber-chrome-pull.browser.js)
 * and writes only the daily numbers here (scripts/uber-chrome-ingest.ts).
 * Pure helpers, no I/O, so the Settings card can import them too.
 */

export const UBER_CHROME_SCHEDULE = "weekdays at 10:30am, 4:30pm and 8:30pm"

/**
 * True when the stored session is dead (the UberAuthError wording). A dead
 * sid never comes back, so Kitchen stops calling Uber with it and reads the
 * table, which the Chrome pull keeps filled. A new paste makes a fresh row
 * with no error, so the cookie route picks up again by itself.
 */
export function isDeadSession(lastError: string | null | undefined): boolean {
  return !!lastError && /session has expired|login page/i.test(lastError)
}

export type ChromeUberVenue = "BURLEIGH" | "BEACH_HOUSE"
export interface ChromeUberRow { date: string; venue: ChromeUberVenue; sales: number; orders: number }

const VENUES = new Set<string>(["BURLEIGH", "BEACH_HOUSE"])

function realDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const t = new Date(`${d}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
}

/**
 * Accepts the object the browser script returns ({ rows: [...] }) or a bare
 * array. A row is either the compact tuple the browser sends
 * ([date, venue, sales, orders]) or an object with those keys. Keeps only
 * well-formed rows (real date, known venue, sane numbers, one per
 * venue-day) so nothing odd ever reaches the SQL.
 */
export function validateChromeRows(raw: unknown): { rows: ChromeUberRow[]; rejected: number } {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { rows?: unknown }).rows)
      ? (raw as { rows: unknown[] }).rows
      : []
  const rows: ChromeUberRow[] = []
  const seen = new Set<string>()
  let rejected = 0
  for (const item of list) {
    const x: Record<string, unknown> = Array.isArray(item)
      ? { date: item[0], venue: item[1], sales: item[2], orders: item[3] }
      : ((item ?? {}) as Record<string, unknown>)
    const { date, venue, sales, orders } = x
    if (typeof date !== "string" || !realDate(date)) { rejected++; continue }
    if (typeof venue !== "string" || !VENUES.has(venue)) { rejected++; continue }
    if (typeof sales !== "number" || !Number.isFinite(sales) || sales < 0 || sales >= 100000) { rejected++; continue }
    if (typeof orders !== "number" || !Number.isInteger(orders) || orders < 0 || orders >= 2000) { rejected++; continue }
    const key = `${date}|${venue}`
    if (seen.has(key)) { rejected++; continue }
    seen.add(key)
    rows.push({ date, venue: venue as ChromeUberVenue, sales: Math.round(sales * 100) / 100, orders })
  }
  return { rows, rejected }
}

/**
 * SQL for psql: upsert each venue-day, and stamp the connection's lastSyncAt
 * so the Settings card shows when Chrome last fed it. A $0 / 0-order figure
 * never overwrites a stored day that had orders (same rule as the live
 * view: Uber has been seen answering $0 for a real day). Values are
 * validated above, so they are safe to inline.
 */
export function chromeIngestSql(rows: ChromeUberRow[]): string {
  if (!rows.length) return ""
  const values = rows
    .map((r) => `(gen_random_uuid()::text, date '${r.date}', '${r.venue}', ${r.sales.toFixed(2)}, ${r.orders}, now())`)
    .join(",\n  ")
  return [
    `insert into "DailyUberSales" (id, date, venue, "salesIncGst", orders, "updatedAt") values`,
    `  ${values}`,
    `on conflict (date, venue) do update set "salesIncGst" = excluded."salesIncGst", orders = excluded.orders, "updatedAt" = now()`,
    `  where not (excluded.orders = 0 and "DailyUberSales".orders > 0);`,
    `update "UberEatsConnection" set "lastSyncAt" = now();`,
    "",
  ].join("\n")
}
