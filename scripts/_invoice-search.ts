// READ-ONLY: free-text search of ALL invoice line descriptions for the unmapped
// flagged ingredients, to recover the actual brand purchased.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

// term label -> list of ILIKE patterns
const TERMS: [string, string[]][] = [
  ["Sriracha", ["%sriracha%"]],
  ["BBQ sauce", ["%bbq%"]],
  ["Chimichurri", ["%chimichurri%"]],
  ["Hangover Sauce", ["%hangover%"]],
  ["Mirin (generic)", ["%mirin%"]],
  ["Mortadella", ["%mortadella%"]],
  ["Muesli", ["%muesli%"]],
  ["Guacamole", ["%guacamole%"]],
  ["Guanciale", ["%guanciale%"]],
  ["Jamon/Serrano", ["%jamon%", "%serrano%", "%serano%"]],
  ["Italian Herb", ["%italian herb%"]],
  ["Curry Powder", ["%curry powder%", "%curry pwd%"]],
  ["Bread improver", ["%improver%"]],
  ["Roti", ["%roti%"]],
  ["Miso", ["%miso%"]],
  ["Malt milk", ["%malt milk%", "%malted milk%"]],
  ["Ice Cream Vanilla", ["%ice cream%vanilla%", "%vanilla%ice cream%"]],
  ["Choc Calypso/Compound", ["%calypso%", "%compound%"]],
  ["Choc Buttons White", ["%button%white%", "%white%button%", "%white%melt%"]],
  ["Veliche batons/choc", ["%veliche%", "%batons%"]],
  ["Chocolate Powder", ["%chocolate powder%", "%choc powder%", "%drinking choc%"]],
  ["Hazelnut praline", ["%praline%"]],
  ["Hot Honey", ["%hot honey%"]],
  ["Nutritional yeast", ["%nutritional yeast%", "%savoury yeast%", "%savory yeast%"]],
  ["Puffed Grain", ["%puffed%", "%rice bubble%", "%rice puff%"]],
  ["Chocolate Sorbet", ["%sorbet%"]],
  ["Tamarind", ["%tamarind%"]],
  ["Vincotto", ["%vincotto%"]],
  ["Xantana/Xanthan", ["%xantana%", "%xanthan%"]],
  ["Harissa", ["%harissa%", "%harrissa%"]],
  ["Tapenade", ["%tapenade%"]],
  ["Pernod", ["%pernod%"]],
  ["St Germain", ["%germain%", "%elderflower%"]],
  ["Pancake Mix Dry", ["%pancake%"]],
  ["Garam Masala", ["%garam%"]],
]

async function main() {
  for (const [label, pats] of TERMS) {
    const rows = await db.invoiceLineItem.findMany({
      where: { OR: pats.map((p) => ({ description: { contains: p.replace(/%/g, ""), mode: "insensitive" as const } })) },
      select: { description: true, invoice: { select: { supplierName: true } } },
      take: 200,
    })
    const seen = new Set<string>()
    for (const r of rows) seen.add(`${r.invoice?.supplierName ?? "?"} :: ${r.description}`)
    console.log(`\n■ ${label}`)
    if (seen.size === 0) { console.log("    (none found in invoices)"); continue }
    for (const s of Array.from(seen).slice(0, 8)) console.log(`    • ${s}`)
  }
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
