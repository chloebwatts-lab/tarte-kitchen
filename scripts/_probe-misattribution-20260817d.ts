// READ-ONLY: replay the live disambiguateSupplier() against the real candidate
// sets + the real PDF letterheads, to prove which branch mis-fires.
import "dotenv/config"
import Fuse from "fuse.js"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

interface SupplierRef { id: string; name: string }

// ── verbatim copy of the shipped matcher, instrumented ──────────────────
const SENDER_PROBE_HINTS = [
  { probe: "ka wai chan", supplier: "Breadtop" },
  { probe: "eac business group", supplier: "Breadtop" },
  { probe: "coastal fresh", supplier: "Coastal Fresh" },
  { probe: "dave's wholesale", supplier: "Coastal Fresh" },
]

function disambiguate(candidates: SupplierRef[], parsedSupplierName: string | null, senderDisplayName: string | null) {
  if (candidates.length === 1) return { pick: candidates[0], via: "SINGLE-CANDIDATE (letterhead never consulted)" }
  const probes = [parsedSupplierName, senderDisplayName].filter((s): s is string => !!s)

  const probeStrAll = probes.join(" ").toLowerCase()
  for (const hint of SENDER_PROBE_HINTS) {
    if (probeStrAll.includes(hint.probe)) {
      const hit = candidates.find((c) => c.name.toLowerCase() === hint.supplier.toLowerCase())
      if (hit) return { pick: hit, via: `HINT "${hint.probe}"` }
    }
  }

  if (probes.length > 0) {
    const probeStr = probes.join(" ").toLowerCase()
    const hits = candidates.filter((c) =>
      c.name.toLowerCase().split(/\s+/).filter((t) => t.length >= 4).some((t) => probeStr.includes(t))
    )
    if (hits.length === 1) return { pick: hits[0], via: "TOKEN fast-path" }
    if (hits.length > 1)
      return tryFuse(candidates, probes, `TOKEN tie (${hits.map((h) => h.name).join(" / ")}) → fell through to Fuse`)
  }
  return tryFuse(candidates, probes, "no token hit → Fuse")
}

function tryFuse(candidates: SupplierRef[], probes: string[], note: string) {
  for (const probe of probes) {
    const fuse = new Fuse(candidates, { keys: ["name"], threshold: 0.4, includeScore: true })
    const results = fuse.search(probe)
    if (results.length > 0) {
      const top = results.slice(0, 3).map((r) => `${r.item.name}=${r.score?.toFixed(3)}`).join(", ")
      return { pick: results[0].item, via: `${note}; FUSE ranked [${top}]` }
    }
  }
  return { pick: null, via: `${note}; Fuse found nothing` }
}

async function main() {
  const emailRows: any[] = await db.$queryRawUnsafe(`
    SELECT email, array_agg(json_build_object('id', id, 'name', name) ORDER BY name) cands FROM (
      SELECT lower(se.email) email, s.id, s.name FROM "SupplierEmail" se JOIN "Supplier" s ON s.id = se."supplierId"
      UNION
      SELECT lower(s.email), s.id, s.name FROM "Supplier" s WHERE s.email IS NOT NULL
    ) x GROUP BY email`)
  const byEmail = new Map<string, SupplierRef[]>(emailRows.map((r) => [r.email, r.cands]))

  // For each mis-attributed row we know the stored supplier; look up the
  // address(es) that supplier receives on and replay the match.
  const cases: Array<{ label: string; email: string; letterhead: string; senderDisplay: string | null; expected: string; stored: string }> = [
    { label: "CN1515 chai credit",     email: "notifications@ordermentum.com",     letterhead: "Single Origin Wholesale Pty Ltd", senderDisplay: null, expected: "(no Supplier row)", stored: "Cheese Time" },
    { label: "CN306 Pixel dupe",       email: "notifications@ordermentum.com",     letterhead: "Pixel Bakehouse Pty Ltd",        senderDisplay: null, expected: "Pixel Bakehouse", stored: "Cheese Time" },
    { label: "INV13553 coffee",        email: "notifications@ordermentum.com",     letterhead: "Blackboard Coffee Roasters",     senderDisplay: null, expected: "Parallel Roasters", stored: "Cheese Time" },
    { label: "OMI313",                 email: "notifications@ordermentum.com",     letterhead: "The Limpopo Project",            senderDisplay: null, expected: "(no Supplier row)", stored: "Cheese Time" },
    { label: "Cookers oil",            email: "shawna@tarte.com.au",               letterhead: "Cookers Bulk Oil System Pty Ltd", senderDisplay: null, expected: "Cookers", stored: "Paramount Liquor" },
    { label: "IKEA",                   email: "shawna@tarte.com.au",               letterhead: "IKEA Pty Ltd",                   senderDisplay: null, expected: "(no Supplier row)", stored: "Paramount Liquor" },
    { label: "Breadtop via Xero",      email: "messaging-service@post.xero.com",   letterhead: "BREADTOP AUS FAIR",              senderDisplay: null, expected: "Breadtop", stored: "Pixel Bread" },
    { label: "Breadtop w/ Xero name",  email: "messaging-service@post.xero.com",   letterhead: "BREADTOP AUS FAIR",              senderDisplay: "Ka Wai Chan", expected: "Breadtop", stored: "Pixel Bread" },
    { label: "Eustralis via Xero",     email: "messaging-service@post.xero.com",   letterhead: "EUSTRALIS FOOD QLD PTY LTD",     senderDisplay: null, expected: "Eustralis", stored: "Pixel Bread" },
    { label: "Marrow via Xero",        email: "messaging-service@post.xero.com",   letterhead: "Marrow Meats",                   senderDisplay: null, expected: "Marrow Meats", stored: "Pixel Bread" },
    { label: "Salumi via Xero",        email: "messaging-service@post.xero.com",   letterhead: "Salumi Australia Pty Ltd",       senderDisplay: null, expected: "Salumi", stored: "Pixel Bread" },
    { label: "MYOB relay",             email: "invoices@apps.myob.com",            letterhead: "My Venue Clean",                 senderDisplay: null, expected: "(no Supplier row)", stored: "Son Of A Bunn" },
    { label: "EasyVend relay",         email: "mailer@mailer.easyvend.com.au",     letterhead: "Independent Dairy Co",           senderDisplay: null, expected: "(alias of EasyVend?)", stored: "EasyVend" },
  ]

  console.log("■ replaying the shipped matcher\n")
  for (const c of cases) {
    const cands = byEmail.get(c.email) ?? []
    const r = disambiguate(cands, c.letterhead, c.senderDisplay)
    const ok = r.pick?.name === c.expected
    console.log(`   ${c.label}`)
    console.log(`      from      : ${c.email}  (${cands.length} candidate${cands.length === 1 ? "" : "s"})`)
    console.log(`      letterhead: "${c.letterhead}"${c.senderDisplay ? `   display: "${c.senderDisplay}"` : ""}`)
    console.log(`      → picked  : ${r.pick?.name ?? "(none)"}   ${ok ? "✓" : `✗ stored as ${c.stored}, should be ${c.expected}`}`)
    console.log(`      → via     : ${r.via}\n`)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
