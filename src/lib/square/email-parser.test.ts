import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseSubject,
  parseMoney,
  htmlToLines,
  parseSquareDailySummaryText,
  parseSquareDailySummaryHtml,
  parseSquareDailySummaryMessage,
  isSquareReportSender,
} from "./email-parser"

const b64url = (s: string) =>
  Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

// Text of the real Tarte Beach House email for Thu 1 Oct 2026 (Square's
// first Currumbin trading day), as Gmail renders it.
const BH_TEXT = `Thursday 1 Oct, Tarte Beach House
Thursday 1 Oct, 12:00 AM - Thursday 1 Oct, 11:59 PM AEST
This report only considers closed orders and sales made during business hours.
Visit the Reconciliation Report for more detail on past payments and transfers.
Download the Dashboard app

Net sales
$11,611.52
n/a WoW
n/a YoY
Average order
$33.65
n/a WoW
n/a YoY

Sales¹ See more →

Description

Amount

WoW

Product sales

$12,354.45

n/a

Item sales

$12,354.45

n/a

Gross service charges

$0.00

+0.0%

Returns

($341.01)

n/a

Discounts and comps

($401.92)

n/a

Net sales

$11,611.52

n/a

Taxes

$1,152.06

n/a

Gross sales

$12,763.58

n/a

Tips

$0.00

+0.0%

Gift card sales

$0.00

+0.0%

Refunds by amount

($5.00)

n/a

Cash rounding

$0.00

Total sales

$12,758.58

n/a

Fees² →

($81.29)

Orders

Total orders

345

n/a

Average order

$33.65

n/a

Total covers

154

n/a

Customers

Total customers
259
n/a WoW
New customers
259
n/a WoW
Returning customers
0
+0.0% WoW

Sales breakdown

Category

Items sold

Net sales

Restaurant Food

134.0

$3,153.49
n/a

Cafe Food

142.0

$2,799.71
n/a

Cafe Coffee & Tea

321.0

$1,883.82
n/a

Pastries

192.0

$1,546.61
n/a

Juice Bar

83.0

$856.16
n/a

SUP

14.0

$354.55
n/a

Retail

6.0

$316.99
n/a

Cafe Alcohol

16.0

$187.27
n/a

Restaurant Drinks

17.0

$160.83
n/a

Restaurant Starters

7.0

$129.46
n/a

Restaurant Wine & Beer

13.0

$110.36
n/a

Restaurant Cocktails

7.0

$85.00
n/a

Uncategorised

1.0

$18.18
n/a

Staff Meals

4.0

$9.09
n/a

Order source

Orders

Net sales

Avg. order

Point of Sale

340

$11,443.79

$33.65

Bopple

5

$167.73

$33.54

Square AU Pty. Ltd.
(ABN 38 167 106 176)
¹Does not include transfers; partial, uncompleted, or unsettled payments or refunds; or sales taken with no internet connection
²Includes Square processing fees and any third-party fees (e.g. courier fees)
Privacy Policy
Unsubscribe or manage your preferences`

const SUBJECT = "Tarte Beach House – your daily sales summary report for 1 October 2026"

// Wrap every text line in a table cell with Square-ish markup + entities so
// the HTML path is exercised, not just the text path.
function asHtml(text: string): string {
  const rows = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const enc = l
        .replace(/&/g, "&amp;")
        .replace(/–/g, "&#8211;")
        .replace(/→/g, "&rarr;")
        .replace(/ /g, (m, i) => (i % 7 === 0 ? "&nbsp;" : m))
      return `<tr><td style="padding:4px"><span class="x">${enc}</span></td></tr>`
    })
    .join("\n")
  return `<!doctype html><html><head><style>td{color:#000}</style></head><body><table>${rows}</table><!-- footer --></body></html>`
}

test("subject: location + date, en dash", () => {
  assert.deepEqual(parseSubject(SUBJECT), { locationName: "Tarte Beach House", date: "2026-10-01" })
})

test("subject: hyphen and Tea Gardens", () => {
  assert.deepEqual(
    parseSubject("Tea Gardens - your daily sales summary report for 30 November 2026"),
    { locationName: "Tea Gardens", date: "2026-11-30" }
  )
  assert.equal(parseSubject("Square just sent you $11,502.29"), null)
})

test("money: parentheses are negative, commas stripped", () => {
  assert.equal(parseMoney("($341.01)").toNumber(), -341.01)
  assert.equal(parseMoney("$11,611.52").toNumber(), 11611.52)
  assert.equal(parseMoney("-$5.00").toNumber(), -5)
  assert.equal(parseMoney("$0.00").toNumber(), 0)
})

test("text: Beach House 1 Oct 2026 headline figures", () => {
  const r = parseSquareDailySummaryText(BH_TEXT, { subject: SUBJECT })
  assert.equal(r.locationName, "Tarte Beach House")
  assert.equal(r.date, "2026-10-01")
  assert.equal(r.netSalesExGst.toNumber(), 11611.52)
  assert.equal(r.taxes.toNumber(), 1152.06)
  assert.equal(r.grossSales.toNumber(), 12763.58)
  assert.equal(r.totalSales.toNumber(), 12758.58)
  assert.equal(r.returns.toNumber(), 341.01)
  assert.equal(r.discountsAndComps.toNumber(), 401.92)
  assert.equal(r.refundsByAmount.toNumber(), 5)
  assert.equal(r.fees.toNumber(), 81.29)
  assert.equal(r.totalOrders, 345)
  assert.equal(r.averageOrder.toNumber(), 33.65)
  assert.equal(r.totalCovers, 154)
})

test("text: categories and order sources", () => {
  const r = parseSquareDailySummaryText(BH_TEXT, { subject: SUBJECT })
  assert.equal(r.categories.length, 14)
  assert.deepEqual(
    r.categories.map((c) => c.name),
    [
      "Restaurant Food", "Cafe Food", "Cafe Coffee & Tea", "Pastries", "Juice Bar", "SUP",
      "Retail", "Cafe Alcohol", "Restaurant Drinks", "Restaurant Starters",
      "Restaurant Wine & Beer", "Restaurant Cocktails", "Uncategorised", "Staff Meals",
    ]
  )
  const coffee = r.categories.find((c) => c.name === "Cafe Coffee & Tea")!
  assert.equal(coffee.itemsSold.toNumber(), 321)
  assert.equal(coffee.netSalesExGst.toNumber(), 1883.82)
  // Category net sales add up to the net sales headline.
  const sum = r.categories.reduce((s, c) => s.plus(c.netSalesExGst), parseMoney("$0"))
  assert.equal(sum.toNumber(), 11611.52)

  assert.deepEqual(
    r.orderSources.map((o) => [o.name, o.orders, o.netSalesExGst.toNumber()]),
    [["Point of Sale", 340, 11443.79], ["Bopple", 5, 167.73]]
  )
})

test("html: same figures through the tag stripper with entities", () => {
  const html = asHtml(BH_TEXT)
  const lines = htmlToLines(html)
  assert.ok(lines.includes("Fees² →"))
  assert.ok(lines.includes("Cafe Coffee & Tea"))
  const r = parseSquareDailySummaryHtml(html, { subject: SUBJECT })
  assert.equal(r.netSalesExGst.toNumber(), 11611.52)
  assert.equal(r.fees.toNumber(), 81.29)
  assert.equal(r.categories.length, 14)
  assert.equal(r.orderSources.length, 2)
})

test("no subject: date + location from the body header, year from the email date", () => {
  const r = parseSquareDailySummaryText(BH_TEXT, { emailDate: new Date("2026-10-01T14:34:00Z") })
  assert.equal(r.locationName, "Tarte Beach House")
  assert.equal(r.date, "2026-10-01")
  // 31 Dec report emailed on 1 Jan belongs to the previous year.
  const r2 = parseSquareDailySummaryText(
    BH_TEXT.replace("Thursday 1 Oct, Tarte Beach House", "Wednesday 31 Dec, Tea Gardens"),
    { emailDate: new Date("2027-01-01T14:34:00Z") }
  )
  assert.equal(r2.date, "2026-12-31")
  assert.equal(r2.locationName, "Tea Gardens")
})

test("quiet day: zero figures and no categories still parse", () => {
  const text = `Monday 5 Oct, Tea Gardens\nNet sales\n$0.00\nn/a WoW\nAverage order\n$0.00\nTotal sales\n$0.00\nFees² →\n$0.00\nTotal orders\n0\nTotal covers\n0\nSales breakdown\nCategory\nItems sold\nNet sales\nSquare AU Pty. Ltd.`
  const r = parseSquareDailySummaryText(text, { emailDate: new Date("2026-10-05T14:30:00Z") })
  assert.equal(r.netSalesExGst.toNumber(), 0)
  assert.equal(r.grossSales.toNumber(), 0)
  assert.equal(r.totalOrders, 0)
  assert.deepEqual(r.categories, [])
  assert.deepEqual(r.orderSources, [])
})

test("rejects an email with no net sales figure", () => {
  assert.throws(
    () => parseSquareDailySummaryText("Square just sent you $11,502.29\nYour transfer is on its way", { subject: SUBJECT }),
    /no Net sales/
  )
})

test("gmail message: html part + subject + date header", () => {
  const msg = {
    id: "m1",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "Subject", value: SUBJECT },
        { name: "From", value: "Square Reports <noreply@messaging.squareup.com>" },
        { name: "Date", value: "Fri, 2 Oct 2026 00:34:12 +1000" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64url("Daily summary attached") } },
        { mimeType: "text/html", body: { data: b64url(asHtml(BH_TEXT)) } },
      ],
    },
  }
  const r = parseSquareDailySummaryMessage(msg)
  assert.equal(r.date, "2026-10-01")
  assert.equal(r.grossSales.toNumber(), 12763.58)
  assert.equal(r.categories.length, 14)
})

test("sender allowlist is exact", () => {
  assert.equal(isSquareReportSender("Square Reports <noreply@messaging.squareup.com>"), true)
  assert.equal(isSquareReportSender("noreply@messaging.squareup.com"), true)
  assert.equal(isSquareReportSender("Square <messenger@messaging.squareup.com>"), false)
  assert.equal(isSquareReportSender("x <noreply@messaging.squareup.com.evil.io>"), false)
  assert.equal(isSquareReportSender(undefined), false)
})
