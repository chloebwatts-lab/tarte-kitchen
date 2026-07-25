// One-off: enrich maintenance contacts with phone numbers (Chloe 25/07/26 +
// email-mined details) and log the UNOX Bakertop hood/firmware issue.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function upsert(name: string, data: Record<string, unknown>) {
  const existing = await db.maintenanceContact.findFirst({ where: { name } })
  if (existing) await db.maintenanceContact.update({ where: { id: existing.id }, data })
  else await db.maintenanceContact.create({ data: { name, ...data } as never })
  console.log(`✓ ${name}`)
}

async function main() {
  await upsert("Dishtec", {
    phone: "1300 300 131",
    email: "service@dishtec.com.au",
    specialties: ["dishwasher", "ice-machine", "gas", "general"],
    notes:
      "24/7 service line. Fixed: gas burners, Goldstein fryer, CHEFTOP capacitors ($155 callout + ~$44/capacitor, Mar 26). Installed Scotsman ice machine Feb 26. Admin: ar@dishtec.com.au. NOTE: their Quote #48041 for Currumbin (May 26) is still awaiting a yes/no. Number from dishtec.com.au — Shawna to confirm.",
  })
  await upsert("Chris — Optimize", {
    company: "Optimize Electrical and Gas Pty Ltd",
    phone: "0450 308 993",
    email: "service@optimizeelectricalandgas.com.au",
    specialties: ["oven", "dishwasher", "gas", "electrical", "general"],
    notes:
      "Chris Hodgson, Electrical & Gas Manager — the usual Unox tech. Fixed Unox 'Gas restart', Meiko error 202, condemned old Cookrite grill. Ben Hodgson (aircon/refrigeration) 0426 862 265. Accounts: Brittany, accounts@optimizeelectricalandgas.com.au.",
  })
  await upsert("Ben — Optimize (fridge/aircon)", {
    company: "Optimize Electrical and Gas Pty Ltd",
    phone: "0426 862 265",
    email: "service@optimizeelectricalandgas.com.au",
    specialties: ["refrigeration"],
    notes: "Ben Hodgson, Air Conditioning/Refrigeration Manager at Optimize.",
    sortOrder: 7,
  })
  await upsert("Marty — Gold Coast Commercial Services", {
    company: "Gold Coast Commercial Services (GCCS)",
    phone: "0486 006 839",
    email: "marty@gccs.net.au",
    specialties: ["dishwasher", "oven", "gas", "general"],
    notes:
      "Services commercial dishwashers, cooking equipment & water filtration. Did Unox servicing June 26 ('Unox Marty' invoice). gccs.net.au.",
    sortOrder: 8,
  })
  await upsert("Josh — Cooltech", {
    phone: "+61 449 584 747",
    notes:
      "Refrigeration. Fixed: milk fridge thermostat (Sep 25), walk-in cool room fan (Dec 25), Hoshizaki condenser (Nov 25).",
  })
  await upsert("Sam — electrician", {
    phone: "+61 426 291 800",
    specialties: ["electrical"],
    notes: "Electrician (per Chloe 25/07/26).",
    sortOrder: 9,
  })
  await upsert("Steve — electrician", {
    phone: "0416 207 585",
    specialties: ["electrical"],
    notes: "Second electrician (per Chloe 25/07/26).",
    sortOrder: 10,
  })
  await upsert("Antony — plumber", {
    phone: "+61 401 211 523",
    specialties: ["plumbing"],
    notes: "Plumber (per Chloe 25/07/26).",
    sortOrder: 11,
  })

  // UNOX Bakertop issue from Jose's photos (24/07/26)
  const bakertop = await db.maintenanceAsset.findFirst({
    where: { mxId: "10869242" },
  })
  if (bakertop) {
    const existing = await db.maintenanceIssue.findFirst({
      where: { assetId: bakertop.id, status: "OPEN", title: { contains: "hood" } },
    })
    if (!existing) {
      const issue = await db.maintenanceIssue.create({
        data: {
          assetId: bakertop.id,
          venue: "BURLEIGH",
          title: "Hood warnings + internal firmware error on display",
          description:
            "Display shows WARNINGS: WC01 FUME PROBE 1, WC05 INCOMING FUMES TOO HOT, WC06 HOOD LACK OF POWER (24/07/26 11:25am), plus an 'Internal Error!! FW vers=49023' crash screen. Try first: power-cycle at the wall for 60s; check the hood's own power switch/breaker (WC06 = hood not getting power). If warnings return: call Chris @ Optimize 0450 308 993 or Marty @ GCCS 0486 006 839.",
          reportedBy: "Jose (photos via Chloe)",
          createdAt: new Date("2026-07-24T11:25:00+10:00"),
        },
      })
      console.log("✓ UNOX issue logged", issue.id)
    }
    await db.maintenanceAsset.update({
      where: { id: bakertop.id },
      data: {
        notes:
          "SERIAL DISCREPANCY: display reports MODEL XEBC-10EU-EPLM.0 SN 2023E0047375 (ELECTRIC, 2023) but the recorded data plate said XEBC-10EU-GPR SN 2019H0063160 (gas, 2019). Verify on site — oven may have been replaced/updated in 2023; affects warranty position.",
      },
    })
    console.log("✓ Bakertop serial-discrepancy note added")
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
