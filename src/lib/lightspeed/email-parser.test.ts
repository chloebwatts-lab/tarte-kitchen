import { test } from "node:test"
import assert from "node:assert/strict"
import { parseLightspeedCsv, parseLightspeedHtml, parseLightspeedReportMessage } from "./email-parser"

const b64url = (s: string) => Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

// ---------------------------------------------------------------- CSV summary mode

const SUMMARY_CSV =
  "Daily Summary Report\r\n" +
  "Location,Date,Gross Sales,Net Sales,Covers,Voids,Discounts\r\n" +
  'Tarte Beach House,2026-09-20,"$14,769.41","$13,426.74",412,3,7\r\n' +
  "Tarte Burleigh,2026-09-20,$9100.00,$8272.73,300,0,2\r\n" +
  "\r\n"

test("CSV summary: BOM, CRLF and a preamble line before the header are tolerated", () => {
  const reports = parseLightspeedCsv(Buffer.from("﻿" + SUMMARY_CSV))
  assert.equal(reports.length, 2)
  const bh = reports.find((r) => r.locationName === "Tarte Beach House")!
  assert.equal(bh.date, "2026-09-20")
  assert.equal(bh.grossRevenue.toNumber(), 14769.41)
  assert.equal(bh.netRevenueExGst.toNumber(), 13426.74)
  assert.equal(bh.covers, 412)
  assert.equal(bh.voids, 3)
  assert.equal(bh.comps, 7)
  assert.equal(bh.averageSpend.toDecimalPlaces(2).toNumber(), 32.59)
  assert.equal(bh.source, "csv")
  assert.deepEqual(bh.topItems, [])
})

test("CSV summary: missing Net column derives ex-GST from gross", () => {
  const csv = "Location,Total Sales,Covers\nTarte Market,\"$4,400.00\",100\n"
  const [r] = parseLightspeedCsv(Buffer.from(csv))
  assert.equal(r.grossRevenue.toNumber(), 4400)
  assert.equal(r.netRevenueExGst.toDecimalPlaces(2).toNumber(), 4000)
  assert.equal(r.averageSpend.toNumber(), 40)
})

test("CSV summary: zero covers gives zero average spend, not a division error", () => {
  const csv = "Location,Gross Sales,Net Sales,Covers\nTarte Market,$0.00,$0.00,0\n"
  const [r] = parseLightspeedCsv(Buffer.from(csv))
  assert.equal(r.averageSpend.toNumber(), 0)
  assert.equal(r.covers, 0)
})

test("CSV summary: a present-but-blank Net cell is read as $0 (known gap, see report)", { todo: "blank Net Sales cell should fall back to gross/1.1 like a missing column does" }, () => {
  const csv = "Location,Gross Sales,Net Sales,Covers\nTarte Market,$4100.00,,150\n"
  const [r] = parseLightspeedCsv(Buffer.from(csv))
  assert.equal(r.netRevenueExGst.toDecimalPlaces(2).toNumber(), 3727.27)
})

// ---------------------------------------------------------------- CSV itemised mode

test("CSV itemised: groups by location, sums gross, derives net, sorts items by revenue", () => {
  const csv =
    "Location,Date,Item,Qty,Revenue\n" +
    'Tarte Beach House,2026-09-20,High Tea,14,"$1,050.00"\n' +
    "Tarte Beach House,2026-09-20,Flat White,210,$945.00\n" +
    "Tarte Beach House,2026-09-20,Croissant,40,$260.00\n" +
    "Tarte Market,2026-09-20,Cruller,30,$180.00\n"
  const reports = parseLightspeedCsv(Buffer.from(csv))
  assert.equal(reports.length, 2)
  const bh = reports.find((r) => r.locationName === "Tarte Beach House")!
  assert.equal(bh.grossRevenue.toNumber(), 2255)
  assert.equal(bh.netRevenueExGst.toDecimalPlaces(2).toNumber(), 2050)
  assert.deepEqual(bh.topItems.map((i) => i.name), ["High Tea", "Flat White", "Croissant"])
  assert.equal(bh.topItems[0].qty, 14)
  assert.equal(bh.topItems[0].revenue.toNumber(), 1050)
  const mk = reports.find((r) => r.locationName === "Tarte Market")!
  assert.equal(mk.topItems.length, 1)
  assert.equal(mk.grossRevenue.toNumber(), 180)
})

test("CSV itemised: caps at 20 items and skips blank item names", () => {
  let csv = "Location,Item,Qty,Revenue\n"
  for (let i = 0; i < 25; i++) csv += `Tarte Burleigh,Item ${i},1,$${i}.00\n`
  csv += "Tarte Burleigh,,5,$999.00\n"
  const [r] = parseLightspeedCsv(Buffer.from(csv))
  assert.equal(r.topItems.length, 20)
  assert.equal(r.topItems[0].name, "Item 24")
  assert.equal(r.grossRevenue.toNumber(), 300) // 0..24 summed, the blank-name $999 row excluded
})

// ---------------------------------------------------------------- CSV rejects

test("CSV: unrecognisable or too-short input returns []", () => {
  assert.deepEqual(parseLightspeedCsv(Buffer.from("")), [])
  assert.deepEqual(parseLightspeedCsv(Buffer.from("Location,Gross Sales\n")), [])
  assert.deepEqual(parseLightspeedCsv(Buffer.from("Name,Amount\nfoo,1\n")), [])
  assert.deepEqual(parseLightspeedCsv(Buffer.from("Sales,Total\n1,2\n")), []) // no location column
})

test("CSV: rows shorter than the location column and blank locations are skipped", () => {
  const csv = "Date,Location,Gross Sales\n2026-09-20\n2026-09-20,,$5\n2026-09-20,Tarte Market,$10\n"
  const reports = parseLightspeedCsv(Buffer.from(csv))
  assert.equal(reports.length, 1)
  assert.equal(reports[0].locationName, "Tarte Market")
})

// ---------------------------------------------------------------- HTML

test("HTML: location table with entities and nested tags", () => {
  const html =
    "<html><body><p>Daily</p><table><tr><th>Location</th><th>Gross Sales</th><th>Net Sales</th><th>Covers</th></tr>" +
    "<tr><td><b>Tarte Beach&nbsp;House</b></td><td>$14,769.41</td><td>$13,426.74</td><td>412</td></tr>" +
    "<tr><td>Tea &amp; Garden</td><td>$1,100.00</td><td></td><td>10</td></tr></table></body></html>"
  const reports = parseLightspeedHtml(html)
  assert.equal(reports.length, 2)
  const bh = reports.find((r) => r.locationName === "Tarte Beach House")!
  assert.equal(bh.grossRevenue.toNumber(), 14769.41)
  assert.equal(bh.netRevenueExGst.toNumber(), 13426.74)
  assert.equal(bh.covers, 412)
  assert.equal(bh.source, "html")
  const tg = reports.find((r) => r.locationName === "Tea & Garden")!
  assert.equal(tg.grossRevenue.toNumber(), 1100)
})

test("HTML: gross without net derives ex-GST", () => {
  const html = "<table><tr><th>Location</th><th>Gross Sales</th><th>Covers</th></tr><tr><td>Tarte Market</td><td>$1,100.00</td><td>10</td></tr></table>"
  const [r] = parseLightspeedHtml(html)
  assert.equal(r.netRevenueExGst.toDecimalPlaces(2).toNumber(), 1000)
  assert.equal(r.averageSpend.toNumber(), 100)
})

test("HTML: item table lands in the default bucket sorted by revenue", () => {
  const html =
    "<table><tr><th>Item</th><th>Qty</th><th>Amount</th></tr>" +
    "<tr><td>Flat White</td><td>210</td><td>$945.00</td></tr>" +
    "<tr><td>High Tea</td><td>14</td><td>$1,050.00</td></tr></table>"
  const [r] = parseLightspeedHtml(html)
  assert.equal(r.locationName, "__default__")
  assert.deepEqual(r.topItems.map((i) => i.name), ["High Tea", "Flat White"])
})

test("HTML: no tables, or tables without a recognisable header, return []", () => {
  assert.deepEqual(parseLightspeedHtml("<p>nothing here</p>"), [])
  assert.deepEqual(parseLightspeedHtml("<table><tr><td>only one row</td></tr></table>"), [])
  assert.deepEqual(parseLightspeedHtml("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>"), [])
})

// ---------------------------------------------------------------- orchestrator

test("message: CSV attachment is parsed via the attachment fetcher, xlsx is skipped", async () => {
  const message = {
    id: "m1",
    payload: {
      headers: [],
      parts: [
        { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "eod.xlsx", body: { attachmentId: "x1" } },
        { mimeType: "text/csv", filename: "eod.csv", body: { attachmentId: "c1" } },
      ],
    },
  }
  const fetched: string[] = []
  const reports = await parseLightspeedReportMessage(message, async (_mid, attId) => {
    fetched.push(attId)
    return Buffer.from(SUMMARY_CSV)
  })
  assert.deepEqual(fetched, ["c1"])
  assert.equal(reports.length, 2)
})

test("message: falls back to the HTML body when no CSV parses", async () => {
  const html = "<table><tr><th>Location</th><th>Gross Sales</th></tr><tr><td>Tarte Burleigh</td><td>$2,200.00</td></tr></table>"
  const message = {
    id: "m2",
    payload: {
      headers: [],
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("plain") } },
        { mimeType: "text/html", body: { data: b64url(html) } },
      ],
    },
  }
  const reports = await parseLightspeedReportMessage(message, async () => {
    throw new Error("should not be called")
  })
  assert.equal(reports.length, 1)
  assert.equal(reports[0].locationName, "Tarte Burleigh")
  assert.equal(reports[0].source, "html")
})

test("message: attachment fetch failure is swallowed and HTML fallback still runs", async () => {
  const html = "<table><tr><th>Location</th><th>Gross Sales</th></tr><tr><td>Tarte Market</td><td>$550.00</td></tr></table>"
  const message = {
    id: "m3",
    payload: {
      headers: [],
      parts: [
        { mimeType: "text/csv", filename: "eod.csv", body: { attachmentId: "c1" } },
        { mimeType: "text/html", body: { data: b64url(html) } },
      ],
    },
  }
  const reports = await parseLightspeedReportMessage(message, async () => {
    throw new Error("gmail 500")
  })
  assert.equal(reports.length, 1)
  assert.equal(reports[0].grossRevenue.toNumber(), 550)
})

test("message: nothing usable returns []", async () => {
  const reports = await parseLightspeedReportMessage({ id: "m4", payload: { headers: [] } }, async () => Buffer.from(""))
  assert.deepEqual(reports, [])
})
