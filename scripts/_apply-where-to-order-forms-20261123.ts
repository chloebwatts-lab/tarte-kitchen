/**
 * 23 Nov 2026: make the order forms match the 14 Nov "where to order it"
 * sheet (src/lib/where-to-order/sheet.ts), so the department order pages
 * only offer the supplier the sheet names. Writes a before-image to
 * scripts/_where-to-order-forms-before-20261123.json first; re-running is
 * a no-op once applied.
 *
 *   npx tsx --env-file=.env.local scripts/_apply-where-to-order-forms-20261123.ts         (dry run)
 *   npx tsx --env-file=.env.local scripts/_apply-where-to-order-forms-20261123.ts --apply
 */
import "dotenv/config"
import { existsSync, writeFileSync } from "node:fs"
import { PrismaClient, type OrderDept } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const APPLY = process.argv.includes("--apply")
const STAMP = "23 Nov 2026"

type Change = { id: string; active?: boolean; dept?: OrderDept | null; why: string }

const CHANGES: Change[] = [
  // Wrong supplier still switched on
  { id: "cmp2de7ecaa4093d2800e8d9b", active: false, why: "sheet says Bidfood Philly 2kg block; this $30 Fermex price was never confirmed" },
  { id: "cmp4fb848ca67e8a07f855f2b", active: false, why: "sheet says Bidfood Fresco ricotta basket" },
  { id: "cmp02213c11e012ce4e530b93", active: false, why: "sheet says Bidfood Fresco ricotta basket" },
  { id: "cmp28fca460ac34811e4ba0c5", active: false, why: "sheet says Fermex Maldon 1.4kg (chef-approved swap); pastry pars moved to Maldon" },
  { id: "cmpa80b7e82932c498f54e3d7", active: false, why: "sheet says Fermex Manildra plain flour ($1.18/kg vs $1.29/kg here)" },
  { id: "cmp73299a7da173bc5a4a4808", active: false, why: "sheet says Bidfood Nutella (Fermex +12%)" },
  { id: "cmpa6d3ac3ca26f2ba1904f06", active: false, why: "sheet says Bidfood IQF blueberries 1kg (cheaper net of rebate)" },
  { id: "de2c2a53-79d6-4276-899f-01de5b135cbb", active: false, why: "sheet says Bidfood clingwrap ($24.30 a roll vs about $34 here); pastry pars moved to it" },
  // Right supplier switched off
  { id: "cmp0b0d82265ebaab98d08f56", active: true, why: "sheet item, Bidfood is the supplier on the sheet" },
  { id: "cmp99c9dcd652ba7fcb61bd55", active: true, dept: "PASTRY", why: "sheet item, Bidfood is the supplier on the sheet; on Pastry's form, where the cling wrap pars are" },
  { id: "cmp7c08a3079e7f716a155021", active: true, why: "sheet item, Bidfood is the supplier on the sheet" },
  // Right supplier on the wrong department's form
  { id: "cmpab4174b3994225eadb301f", dept: "PASTRY", why: "Pastry orders salt flakes; Maldon was only on Kitchen's form, so Pastry saw only Bidfood Cornish" },
  { id: "cmp07e1a88fc3a3ccb7730207", dept: "PASTRY", why: "Pastry orders condensed milk; the Provedores tub was only on Kitchen's form, so Pastry saw only Bidfood" },
]

/** Pars follow the item they replace (same venue, same number of packs). */
const MOVE_PARS: { from: string; to: string }[] = [
  { from: "cmp28fca460ac34811e4ba0c5", to: "cmpab4174b3994225eadb301f" },
  { from: "de2c2a53-79d6-4276-899f-01de5b135cbb", to: "cmp99c9dcd652ba7fcb61bd55" },
]

/** Front of house buys frozen raspberries too, but the Fermex line sits on Pastry's form. */
const FOH_RASPBERRY = { copyOf: "cmp8ef60219dd04f847ff397c", name: "Raspberry Frozen IQF 1kg (front of house)" }

async function main() {
  const ids = [...new Set([...CHANGES.map((c) => c.id), ...MOVE_PARS.flatMap((m) => [m.from, m.to]), FOH_RASPBERRY.copyOf])]
  const before = await db.approvedSupplierItem.findMany({ where: { id: { in: ids } }, include: { pars: true, supplier: { select: { name: true } } } })
  if (before.length !== ids.length) throw new Error(`expected ${ids.length} rows, found ${before.length}`)
  const beforeFile = "scripts/_where-to-order-forms-before-20261123.json"
  if (APPLY && !existsSync(beforeFile)) writeFileSync(beforeFile, JSON.stringify(before, null, 1))
  const byId = new Map(before.map((r) => [r.id, r]))

  for (const c of CHANGES) {
    const r = byId.get(c.id)!
    const data: { active?: boolean; dept?: OrderDept | null; notes?: string } = {}
    if (c.active !== undefined && r.active !== c.active) data.active = c.active
    if (c.dept !== undefined && r.dept !== c.dept) data.dept = c.dept
    if (Object.keys(data).length === 0) {
      console.log(`  same   ${r.supplier.name} | ${r.name}`)
      continue
    }
    const tag = `${STAMP}: ${c.active === false ? "switched off" : c.active === true ? "switched on" : "moved to " + c.dept} to match the 14 Nov where-to-order sheet (${c.why}).`
    if (!(r.notes ?? "").includes(STAMP)) data.notes = [r.notes, tag].filter(Boolean).join(" ")
    console.log(`  ${APPLY ? "SET" : "would"} ${r.supplier.name} | ${r.name} | ${JSON.stringify({ active: data.active, dept: data.dept })}`)
    if (APPLY) await db.approvedSupplierItem.update({ where: { id: c.id }, data })
  }

  for (const m of MOVE_PARS) {
    const from = byId.get(m.from)!
    for (const p of from.pars) {
      const existing = await db.deptItemPar.findUnique({ where: { venue_approvedItemId: { venue: p.venue, approvedItemId: m.to } } })
      if (existing) {
        console.log(`  par kept ${p.venue} on ${byId.get(m.to)!.name} (${existing.par})`)
        continue
      }
      console.log(`  ${APPLY ? "MOVE" : "would move"} par ${p.venue}=${p.par} ${from.name} -> ${byId.get(m.to)!.name}`)
      if (APPLY) await db.deptItemPar.create({ data: { venue: p.venue, approvedItemId: m.to, par: p.par, updatedBy: "where-to-order sheet 23 Nov 2026" } })
    }
  }

  const src = byId.get(FOH_RASPBERRY.copyOf)!
  const dup = await db.approvedSupplierItem.findFirst({ where: { supplierId: src.supplierId, name: FOH_RASPBERRY.name } })
  if (dup) console.log(`  FOH raspberry line already there (${dup.id})`)
  else {
    console.log(`  ${APPLY ? "ADD" : "would add"} ${src.supplier.name} | ${FOH_RASPBERRY.name} | FRONT_OF_HOUSE | $${src.packPrice}`)
    if (APPLY)
      await db.approvedSupplierItem.create({
        data: {
          supplierId: src.supplierId,
          name: FOH_RASPBERRY.name,
          packSize: src.packSize,
          packPrice: src.packPrice,
          unit: src.unit,
          unitPrice: src.unitPrice,
          category: src.category,
          ingredientId: src.ingredientId,
          sortOrder: src.sortOrder,
          active: true,
          dept: "FRONT_OF_HOUSE",
          notes: `${STAMP}: Front of house copy of the Fermex IQF raspberries (Pastry's line has the pars). The sheet says Fermex, not Bidfood (+25%); FOH had no raspberry line, so it was bought from Bidfood outside the app.`,
        },
      })
  }
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
