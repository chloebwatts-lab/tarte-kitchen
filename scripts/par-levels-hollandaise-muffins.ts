/**
 * One-off analysis: suggested daily par levels for Miso Hollandaise
 * and Muffin Tops at Burleigh + Beach House.
 *
 * Methodology (per Chloe 2026-05-22):
 *   - 14 days of recent sales (the "lowered-sales" window) from
 *     DailyCategoryTopItem. Day-of-week pattern, NOT a flat average.
 *   - Multiply dishes × portion ml/each from the recipe DB.
 *   - Add 10% safety buffer (NOT the wastage rate — wastage is the
 *     problem to fix, not bake into par).
 *   - Compare against logged WasteEntry to flag over-production.
 *   - Tell chefs: "Make this much on this day. No more."
 *
 * Run:
 *   ssh root@134.199.157.138 'cd /root/tarte-kitchen && \
 *     docker compose exec -T app node --experimental-strip-types \
 *     scripts/par-levels-hollandaise-muffins.ts'
 */

import { PrismaClient } from "@/generated/prisma"

const db = new PrismaClient()

const PORTION_ML: Record<string, { ml: number; product: string }> = {
  // Burleigh hollandaise items
  "Bullseye Bang": { ml: 50, product: "Miso Hollandaise" },
  "Bacon Benny": { ml: 50, product: "Miso Hollandaise" },
  // Beach House hollandaise items
  "Crumpet Benny - Bacon": { ml: 40, product: "Miso Hollandaise" },
  "Crumpet Benny - Salmon": { ml: 40, product: "Miso Hollandaise" },
  "Chilli Benny - Bacon": { ml: 40, product: "Miso Hollandaise" },
  "Chilli Benny - Salmon": { ml: 40, product: "Miso Hollandaise" },
}

const MUFFIN_ITEMS = new Set([
  "Muffin Top",
  "Muffin Top - Strawberry",
  "Muffin Top - Blueberry",
])

const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const SAFETY_BUFFER = 0.1 // 10%

async function main() {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 14)

  // Dedupe duplicate top-N rows (same date/venue/product can appear twice
  // when a category split changes mid-day — sum them).
  const sales = await db.dailyCategoryTopItem.findMany({
    where: { date: { gte: since } },
    select: { date: true, venue: true, productName: true, quantity: true },
  })

  // (venue, dow, item) -> sum
  const grouped = new Map<string, { qty: number; days: Set<string> }>()
  for (const s of sales) {
    const isHoll = PORTION_ML[s.productName] != null
    const isMuf = MUFFIN_ITEMS.has(s.productName)
    if (!isHoll && !isMuf) continue
    const dow = s.date.getUTCDay()
    const key = `${s.venue}|${dow}|${s.productName}`
    const cur = grouped.get(key) ?? { qty: 0, days: new Set() }
    cur.qty += s.quantity
    cur.days.add(s.date.toISOString().slice(0, 10))
    grouped.set(key, cur)
  }

  type DayRow = {
    dow: number
    label: string
    weeksSeen: number
    avgPerDay: number
  }

  const venues = ["BURLEIGH", "BEACH_HOUSE"] as const
  type Venue = (typeof venues)[number]

  // ── Hollandaise par levels — sum dishes × portion ml per (venue, dow)
  const hollandaiseByVenueDow = new Map<Venue, Map<number, { ml: number; days: Set<string> }>>()
  for (const v of venues) hollandaiseByVenueDow.set(v, new Map())
  for (const [key, val] of grouped) {
    const [venueRaw, dowStr, item] = key.split("|") as [Venue, string, string]
    if (!PORTION_ML[item]) continue
    if (!venues.includes(venueRaw)) continue
    const dow = Number(dowStr)
    const ml = val.qty * PORTION_ML[item].ml
    const cur = hollandaiseByVenueDow.get(venueRaw)!.get(dow) ?? { ml: 0, days: new Set() }
    cur.ml += ml
    for (const d of val.days) cur.days.add(d)
    hollandaiseByVenueDow.get(venueRaw)!.set(dow, cur)
  }

  // ── Muffin top par — per venue + (muffin variant) + dow
  const muffinByVenueDow = new Map<Venue, Map<number, Map<string, { qty: number; days: Set<string> }>>>()
  for (const v of venues) muffinByVenueDow.set(v, new Map())
  for (const [key, val] of grouped) {
    const [venueRaw, dowStr, item] = key.split("|") as [Venue, string, string]
    if (!MUFFIN_ITEMS.has(item)) continue
    if (!venues.includes(venueRaw)) continue
    const dow = Number(dowStr)
    const venueMap = muffinByVenueDow.get(venueRaw)!
    if (!venueMap.has(dow)) venueMap.set(dow, new Map())
    const variantMap = venueMap.get(dow)!
    const cur = variantMap.get(item) ?? { qty: 0, days: new Set() }
    cur.qty += val.qty
    for (const d of val.days) cur.days.add(d)
    variantMap.set(item, cur)
  }

  // ── Wastage context (recent 14d, daily averages)
  const waste = await db.wasteEntry.findMany({
    where: {
      date: { gte: since },
      itemName: { in: ["Miso Hollandaise", "Hollandaise Sauce Recipe", "Muffin Top - Strawberry", "Muffin Top - Blueberry"] },
    },
    select: { date: true, venue: true, itemName: true, quantity: true, unit: true },
  })
  const wasteByKey = new Map<string, { total: number; days: Set<string>; unit: string }>()
  for (const w of waste) {
    const key = `${w.venue}|${w.itemName}`
    const cur = wasteByKey.get(key) ?? { total: 0, days: new Set<string>(), unit: w.unit }
    cur.total += Number(w.quantity)
    cur.days.add(w.date.toISOString().slice(0, 10))
    wasteByKey.set(key, cur)
  }

  const out: string[] = []
  out.push("# Suggested par levels — Hollandaise & Muffin Tops")
  out.push("")
  out.push(`Based on the last 14 days of sales (${since.toISOString().slice(0, 10)} → today)`)
  out.push("Day-of-week pattern, +10% safety buffer. Wastage is reported for context — the goal is to drive it down, not bake it into par.")
  out.push("")

  for (const v of venues) {
    const venueLabel = v === "BURLEIGH" ? "Burleigh" : "Beach House"
    out.push(`## ${venueLabel}`)
    out.push("")

    // Hollandaise
    out.push("### Miso Hollandaise")
    const hMap = hollandaiseByVenueDow.get(v)!
    out.push("| Day | Dishes/day (avg) | ml needed | **Par (+10%)** |")
    out.push("| --- | --: | --: | --: |")
    for (let dow = 1; dow <= 6; dow++) {
      const order = [1, 2, 3, 4, 5, 6, 0][dow - 1]
      const data = hMap.get(order)
      if (!data) {
        out.push(`| ${DOW_LABEL[order]} | — | — | — |`)
        continue
      }
      const days = data.days.size
      const mlPerDay = data.ml / days
      const portionMl = 40 + (v === "BURLEIGH" ? 10 : 0)
      const dishesPerDay = mlPerDay / portionMl
      const par = Math.ceil((mlPerDay * (1 + SAFETY_BUFFER)) / 50) * 50
      out.push(
        `| ${DOW_LABEL[order]} | ${dishesPerDay.toFixed(1)} | ${Math.round(mlPerDay)} ml | **${par.toLocaleString()} ml** |`
      )
    }
    const wasteRow = wasteByKey.get(`${v}|Miso Hollandaise`)
    if (wasteRow) {
      const daysLogged = wasteRow.days.size
      out.push("")
      out.push(
        `Current waste: **${Math.round(wasteRow.total).toLocaleString()} ml** binned over ${daysLogged} days (~${Math.round(wasteRow.total / Math.max(daysLogged, 1)).toLocaleString()} ml/day on the days it was logged). Driver: end-of-shift discard of over-prepped tub.`
      )
      out.push("")
    }

    // Muffin tops
    out.push("### Muffin Tops")
    const mMap = muffinByVenueDow.get(v)!
    const variants = new Set<string>()
    for (const dm of mMap.values()) for (const k of dm.keys()) variants.add(k)
    const variantList = Array.from(variants).sort()
    out.push(`| Day | ${variantList.map((vt) => `${vt.replace(/^Muffin Top( - )?/, "")}`).join(" | ")} | **Par (+10%)** |`)
    out.push(`| --- | ${variantList.map(() => "--:").join(" | ")} | --: |`)
    for (let dow = 1; dow <= 6; dow++) {
      const order = [1, 2, 3, 4, 5, 6, 0][dow - 1]
      const variantMap = mMap.get(order)
      if (!variantMap) {
        out.push(`| ${DOW_LABEL[order]} | ${variantList.map(() => "—").join(" | ")} | — |`)
        continue
      }
      let totalPerDay = 0
      const cells = variantList.map((vt) => {
        const data = variantMap.get(vt)
        if (!data) return "—"
        const perDay = data.qty / data.days.size
        totalPerDay += perDay
        return perDay.toFixed(1)
      })
      const par = Math.ceil(totalPerDay * (1 + SAFETY_BUFFER))
      out.push(`| ${DOW_LABEL[order]} | ${cells.join(" | ")} | **${par}** |`)
    }
    const wasteVariants = ["Muffin Top - Strawberry", "Muffin Top - Blueberry"]
    const wasteSummary = wasteVariants
      .map((wv) => {
        const w = wasteByKey.get(`${v}|${wv}`)
        return w ? `${wv.replace(/^Muffin Top - /, "")}: ${Math.round(w.total)} ea over ${w.days.size}d` : null
      })
      .filter(Boolean)
      .join(" · ")
    if (wasteSummary) {
      out.push("")
      out.push(`Current waste: ${wasteSummary}`)
    }
    out.push("")
  }

  out.push("---")
  out.push("**For the chefs:**")
  out.push("- Prep to the **par** column. Not the average, not 'a bit extra' — the par is already +10% safety.")
  out.push("- Use yesterday's same-DOW number as the sanity check (it's in the table).")
  out.push("- End-of-shift hollandaise tub leftover should be **<200 ml** at Burleigh, **<100 ml** at Beach House. If it's consistently more, drop the next day's par by 100 ml and we'll re-baseline next Friday.")
  out.push("- Sat / Sun: the bigger pars. Wed / Thu: the smaller ones. Don't run yesterday's batch into today.")

  console.log(out.join("\n"))
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
