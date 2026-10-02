/**
 * One-off import of a Square daily summary email from its pasted text, for
 * days whose email never reached accounts@ (e.g. the first Currumbin days,
 * 1-2 Oct 2026, before the forward from chloe@ existed).
 *
 *   DATABASE_URL=... npx tsx scripts/square-import-text.ts <file.txt> "<subject>"
 *
 * The subject carries the location + date; the file is the email body as
 * Gmail renders it (select all, copy).
 */
import { readFileSync } from "node:fs"
import { parseSquareDailySummaryText } from "../src/lib/square/email-parser"
import { importSquareDailySummary } from "../src/lib/square/import"

async function main() {
  const [file, subject] = process.argv.slice(2)
  if (!file || !subject) {
    console.error('usage: square-import-text.ts <file.txt> "<email subject>"')
    process.exit(1)
  }
  const summary = parseSquareDailySummaryText(readFileSync(file, "utf-8"), { subject })
  console.log(
    `${summary.locationName} ${summary.date}: net $${summary.netSalesExGst} gross $${summary.grossSales} ` +
      `fees $${summary.fees} orders ${summary.totalOrders} covers ${summary.totalCovers} categories ${summary.categories.length}`
  )
  const result = await importSquareDailySummary(summary)
  console.log("imported", result)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  }
)
