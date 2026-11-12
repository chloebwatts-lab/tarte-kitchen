import { NextRequest } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { db } from "@/lib/db"
import { inboxBills, inboxBillsConfigured } from "@/lib/xero-bills/inbox"
import { runDraftBills, type RunSummary } from "@/lib/xero-bills/run"
import { summaryCsv, summaryFilename, summaryHtml, summarySubject, summaryText } from "@/lib/xero-bills/summary-email"
import type { BillOrg, KitchenInvoice } from "@/lib/xero-bills/plan"

export const dynamic = "force-dynamic"
export const maxDuration = 1200

/**
 * Kitchen to Xero DRAFT supplier bills (spec: tarte-loose-ends/reference/
 * kitchen-xero-draft-bills-spec.md; Chloe 12 Nov 2026).
 *
 *   GET ?summary=latest   the latest run (what the morning bill check reads)
 *   GET ?dry=1            plan only, nothing written to Xero
 *   GET                   live when XERO_BILLS_LIVE=1, else a dry run
 *   &cap=N                drafts per org this run (default XERO_BILLS_CAP or 40)
 *   &email=1              also email the summary to chloe@ (first live run)
 *   &cutoff=yyyy-mm-dd    dry runs only; live always uses XERO_BILLS_CUTOFF
 *   GET ?clear=<invoiceId> clear a failed push once a person has checked Xero
 *                         (a failed or unanswered push is held until then)
 *
 * Bearer CRON_SECRET. One run at a time.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 })
  const url = new URL(req.url)

  const clear = url.searchParams.get("clear")
  if (clear) {
    const inv = await db.invoice.findUnique({ where: { id: clear }, select: { xeroPushError: true, xeroInvoiceId: true } })
    if (!inv) return Response.json({ error: "no such invoice" }, { status: 404 })
    await db.invoice.update({ where: { id: clear }, data: { xeroPushError: null } })
    return Response.json({ ok: true, cleared: inv.xeroPushError, xeroInvoiceId: inv.xeroInvoiceId })
  }
  if (url.searchParams.get("summary") === "latest") {
    const last = await db.xeroBillRun.findFirst({ orderBy: { startedAt: "desc" } })
    return Response.json(last ?? { none: true })
  }
  if (!inboxBillsConfigured()) return Response.json({ error: "INBOX_BILLS_URL / INBOX_BILLS_KEY not set" }, { status: 503 })

  const live = process.env.XERO_BILLS_LIVE === "1" && url.searchParams.get("dry") !== "1"
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  const cutoff = live ? process.env.XERO_BILLS_CUTOFF ?? "" : url.searchParams.get("cutoff") ?? process.env.XERO_BILLS_CUTOFF ?? "2026-11-04"
  if (!ymd.test(cutoff)) return Response.json({ error: "a live run needs XERO_BILLS_CUTOFF (yyyy-mm-dd)" }, { status: 400 })
  const capRaw = Number(url.searchParams.get("cap") ?? process.env.XERO_BILLS_CAP ?? 40)
  const capPerOrg = Number.isInteger(capRaw) && capRaw >= 0 && capRaw <= 200 ? capRaw : 40

  // One run at a time (the nightly cron and a manual run must not overlap).
  const running = await db.xeroBillRun.findFirst({ where: { finishedAt: null, startedAt: { gt: new Date(Date.now() - 30 * 60_000) } } })
  if (running) return Response.json({ error: `a run started at ${running.startedAt.toISOString()} is still going` }, { status: 409 })
  const run = await db.xeroBillRun.create({ data: { live, cutoff, capPerOrg } })

  const today = new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10)
  const num = (d: { toNumber(): number } | null) => (d == null ? null : d.toNumber())
  const ymdOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  try {
    const summary: RunSummary = await runDraftBills(
      {
        inbox: inboxBills(),
        async loadInvoices(from) {
          // Pushed rows are left out (they are done; the Xero read still sees their bills).
          const rows = await db.invoice.findMany({
            where: { invoiceDate: { gte: new Date(`${from}T00:00:00Z`) }, xeroInvoiceId: null },
            select: { id: true, supplierName: true, venue: true, invoiceNumber: true, invoiceDate: true, dueDate: true, subtotal: true, gst: true, total: true, status: true, pdfUrl: true, xeroInvoiceId: true, xeroPushError: true, extractedData: true },
          })
          return rows.map((r): KitchenInvoice => {
            const x = (r.extractedData && typeof r.extractedData === "object" && !Array.isArray(r.extractedData) ? r.extractedData : {}) as Record<string, unknown>
            const money = (...keys: string[]) => {
              for (const k of keys) {
                const v = x[k]
                if (typeof v === "number" && Number.isFinite(v)) return v
                if (typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/[$,]/g, "")))) return Number(v.replace(/[$,]/g, ""))
              }
              return null
            }
            return {
              id: r.id,
              supplierName: r.supplierName,
              venue: r.venue,
              invoiceNumber: r.invoiceNumber,
              invoiceDate: ymdOf(r.invoiceDate),
              // The date as read off the document (Kitchen's own column may hold the email date).
              documentDate: typeof x.invoiceDate === "string" && x.invoiceDate.trim() ? x.invoiceDate.trim().slice(0, 10) : null,
              amountReceived: money("amountReceived", "amountPaid"),
              balanceDue: money("balanceDue", "balance", "amountDue"),
              dueDate: ymdOf(r.dueDate),
              subtotal: num(r.subtotal),
              gst: num(r.gst),
              total: num(r.total),
              status: r.status,
              hasPdf: !!r.pdfUrl,
              xeroInvoiceId: r.xeroInvoiceId,
              pushError: r.xeroPushError,
            }
          })
        },
        async loadHistory(since) {
          const rows = await db.invoice.findMany({
            where: { invoiceDate: { gte: new Date(`${since}T00:00:00Z`) }, invoiceNumber: { not: null } },
            select: { supplierName: true, venue: true, invoiceNumber: true, invoiceDate: true, total: true },
          })
          return rows.map((r) => ({ supplierName: r.supplierName, venue: r.venue, invoiceNumber: r.invoiceNumber, invoiceDate: ymdOf(r.invoiceDate), total: num(r.total) }))
        },
        async markPushed(id, org: BillOrg, xeroInvoiceId) {
          await db.invoice.update({ where: { id }, data: { xeroInvoiceId, xeroOrg: org, xeroPushedAt: new Date(), xeroPushError: null } })
        },
        async markError(id, error) {
          await db.invoice.update({ where: { id }, data: { xeroPushError: error.slice(0, 1000) } })
        },
        async markAttached(id) {
          await db.invoice.update({ where: { id }, data: { xeroAttachedAt: new Date() } })
        },
        async readPdf(id) {
          const inv = await db.invoice.findUnique({ where: { id }, select: { pdfUrl: true, supplierName: true, invoiceNumber: true } })
          if (!inv?.pdfUrl) return null
          const data = await readFile(path.resolve(process.cwd(), inv.pdfUrl))
          const safe = `${inv.supplierName} ${inv.invoiceNumber ?? id}`.replace(/[^A-Za-z0-9 ._-]+/g, "-").slice(0, 100).trim()
          return { filename: `${safe || id}.pdf`, contentBase64: data.toString("base64") }
        },
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      },
      {
        live,
        cutoff,
        capPerOrg,
        today,
        kitchenBaseUrl: process.env.KITCHEN_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://kitchen.tarte.com.au",
      }
    )
    let emailed: string | null = null
    if (url.searchParams.get("email") === "1") {
      const { sendHtmlEmail } = await import("@/lib/gmail/send")
      // Supplier figures: Chloe only, and the accounts@ Sent copy is trashed.
      // A few lines; the full list rides along as a CSV.
      const to = "chloe@tarte.com.au"
      try {
        await sendHtmlEmail({
          to,
          subject: summarySubject(summary, today),
          html: summaryHtml(summary),
          text: summaryText(summary),
          privateCopy: true,
          attachments: [{ filename: summaryFilename(today), mimeType: "text/csv", content: summaryCsv(summary) }],
        })
        emailed = to
      } catch (e) {
        emailed = `failed: ${e instanceof Error ? e.message : String(e)}`
      }
    }
    await db.xeroBillRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), summary: JSON.parse(JSON.stringify({ ...summary, emailed })) } })
    return Response.json({
      ok: true,
      run: run.id,
      live,
      cutoff,
      capPerOrg,
      drafted: summary.drafted,
      draftedTotal: summary.draftedTotal,
      held: summary.holds.length,
      skipped: summary.skipped.length,
      stopped: summary.stopped,
      attachFailures: summary.attachFailures.length,
      attachmentsGranted: summary.attachmentsGranted,
      resplitSuppliers: summary.resplitSuppliers,
      emailed,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await db.xeroBillRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), error } })
    return Response.json({ ok: false, run: run.id, error }, { status: 502 })
  }
}
