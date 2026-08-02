// READ-ONLY: aggregate review themes, staff mentions, sample review quotes,
// and top-seller data as source material for staff training booklets.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const reviews = await db.googleReview.findMany({
    select: {
      venue: true, rating: true, sentiment: true, themes: true,
      staffMentions: true, taggedSummary: true, publishTime: true,
    },
    orderBy: { publishTime: "desc" },
  })

  const byVenue: Record<string, any> = {}
  for (const r of reviews) {
    const v = (byVenue[r.venue] ??= {
      count: 0, avg: 0, ratings: [0, 0, 0, 0, 0],
      themesPos: {} as Record<string, number>,
      themesNeg: {} as Record<string, number>,
      staff: {} as Record<string, number>,
    })
    v.count++
    v.ratings[r.rating - 1]++
    const bucket = r.rating >= 4 ? v.themesPos : v.themesNeg
    for (const t of r.themes) bucket[t] = (bucket[t] ?? 0) + 1
    for (const s of r.staffMentions) v.staff[s] = (v.staff[s] ?? 0) + 1
  }
  for (const v of Object.values(byVenue) as any[]) {
    v.avg = (v.ratings.reduce((a: number, n: number, i: number) => a + n * (i + 1), 0) / v.count).toFixed(2)
    v.staff = Object.fromEntries(Object.entries(v.staff).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15))
  }

  // Recent negative summaries (what goes wrong) and glowing summaries (what "great" looks like)
  const negSamples = reviews.filter((r) => r.rating <= 3 && r.taggedSummary).slice(0, 40)
    .map((r) => ({ venue: r.venue, rating: r.rating, s: r.taggedSummary }))
  const posSamples = reviews.filter((r) => r.rating === 5 && r.taggedSummary).slice(0, 40)
    .map((r) => ({ venue: r.venue, s: r.taggedSummary }))

  // Top sellers: last 8 weeks of DailyCategoryTopItem
  const since = new Date(Date.now() - 56 * 86400 * 1000)
  const top = await db.dailyCategoryTopItem.findMany({
    where: { date: { gte: since } },
    select: { venue: true, categoryName: true, productName: true, quantity: true },
  })
  const topAgg: Record<string, Record<string, number>> = {}
  for (const t of top) {
    const key = `${t.venue}|${t.categoryName}`
    const m = (topAgg[key] ??= {})
    m[t.productName] = (m[t.productName] ?? 0) + Number(t.quantity ?? 0)
  }
  const topOut: Record<string, any[]> = {}
  for (const [key, m] of Object.entries(topAgg)) {
    topOut[key] = Object.entries(m)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 10)
  }

  console.log(JSON.stringify({ byVenue, negSamples, posSamples, topSellers: topOut }, null, 2))
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
