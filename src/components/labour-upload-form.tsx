"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Upload, Check, AlertTriangle, FileText } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  parseLabourCsv,
  parseLabourPdfRich,
  commitLabourCsv,
  commitLabourMgePdf,
  type ParsedCsvRow,
  type ExtractedMgeWeek,
} from "@/lib/actions/labour"
import { cn } from "@/lib/utils"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import type { Venue } from "@/generated/prisma"

const EXAMPLE_CSV = `venue,week_start,gross_wages,super,hours,m_forecast
Burleigh,2026-04-15,18750,2062,620,52000
Beach House,2026-04-15,39548,4350,1082,97000
Tea Garden,2026-04-15,9800,1078,280,28000`

export function LabourUploadForm() {
  const router = useRouter()
  const [raw, setRaw] = useState(EXAMPLE_CSV)
  const [filename, setFilename] = useState("payroll.csv")
  const [preview, setPreview] = useState<ParsedCsvRow[] | null>(null)
  const [mgePreview, setMgePreview] = useState<ExtractedMgeWeek[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [fixedVenues, setFixedVenues] = useState<Record<number, Venue>>({})
  const [isPending, startTransition] = useTransition()
  const [saveResult, setSaveResult] = useState<string | null>(null)

  async function handleFile(f: File) {
    setFilename(f.name)
    setSaveResult(null)
    setErrors([])
    setPreview(null)
    setMgePreview(null)
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const buf = await f.arrayBuffer()
      let binary = ""
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      setRaw(`# Extracting rich management-report data from ${f.name}… this takes ~10s.`)
      startTransition(async () => {
        try {
          const { weeks } = await parseLabourPdfRich({
            pdfBase64: base64,
            filename: f.name,
          })
          setMgePreview(weeks)
          setRaw(
            `# PDF parsed: ${weeks.length} week${weeks.length === 1 ? "" : "s"}. Review the preview below and click Save when ready.`
          )
        } catch (e) {
          setRaw("")
          setErrors([`PDF extraction failed: ${(e as Error).message}`])
        }
      })
      return
    }
    const text = await f.text()
    setRaw(text)
  }

  function handleParse() {
    setSaveResult(null)
    setMgePreview(null)
    startTransition(async () => {
      const { rows, errors } = await parseLabourCsv(raw)
      setPreview(rows)
      setErrors(errors)
      setFixedVenues({})
    })
  }

  function handleCommit() {
    if (!preview) return
    const resolved = preview.map((r, idx) => ({
      ...r,
      venue: fixedVenues[idx] ?? r.venue,
    }))
    const allValid = resolved.every((r) => r.venue !== null)
    if (!allValid) {
      setErrors([
        "Some rows have no venue — set each one using the dropdown before saving",
      ])
      return
    }
    startTransition(async () => {
      const res = await commitLabourCsv({
        filename,
        rawCsv: raw,
        rows: resolved.map((r) => ({
          venue: r.venue as Venue,
          weekStartWed: r.weekStartWed,
          grossWages: r.grossWages,
          superAmount: r.superAmount,
          totalHours: r.totalHours,
          mForecast: r.mForecast,
        })),
      })
      setSaveResult(`Saved ${res.rows} rows. Upload id: ${res.uploadId}`)
      setTimeout(() => router.push("/labour"), 1000)
    })
  }

  function handleCommitMge() {
    if (!mgePreview) return
    const missing = mgePreview.filter(
      (w) => w.venue === null || !w.weekStartWed
    )
    if (missing.length > 0) {
      setErrors([
        `${missing.length} week(s) missing venue or week-start — re-upload the PDF or edit manually via CSV`,
      ])
      return
    }
    startTransition(async () => {
      try {
        const res = await commitLabourMgePdf({
          filename,
          rawPdfBase64: "",
          weeks: mgePreview,
        })
        setSaveResult(`Saved ${res.weeks} week(s). Upload id: ${res.uploadId}`)
        setTimeout(() => router.push("/labour"), 1000)
      } catch (e) {
        setErrors([`Save failed: ${(e as Error).message}`])
      }
    })
  }

  return (
    <div className="space-y-6">
      <Link
        href="/labour"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to labour
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Upload Mge PDF or CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Upload className="h-3.5 w-3.5" />
              Upload CSV or PDF
              <input
                type="file"
                accept=".csv,text/csv,.pdf,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </label>
            <span className="text-xs text-muted-foreground">{filename}</span>
          </div>
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value)
              setMgePreview(null)
            }}
            rows={9}
            className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
            placeholder="venue,week_start,gross_wages,super,hours,m_forecast"
          />
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <p className="font-medium">Two upload modes</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>
                <strong>Mge PDF</strong> — uploads the weekly management
                report. Claude extracts revenue, department wage
                breakdown, ex-admin totals, and COGS automatically.
              </li>
              <li>
                <strong>CSV</strong> — paste or edit the textarea and
                click &ldquo;Parse & preview&rdquo;. Supports columns:
                venue, week_start, gross_wages, super, hours, m_forecast.
              </li>
            </ul>
          </div>
          {!mgePreview && (
            <button
              onClick={handleParse}
              disabled={isPending || !raw.trim() || raw.startsWith("#")}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? "Working…" : "Parse CSV"}
            </button>
          )}
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="text-xs text-red-800">
                {errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mgePreview && mgePreview.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Mge PDF preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mgePreview.map((w, i) => (
              <div
                key={i}
                className="rounded-lg border border-border p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {w.venue ? VENUE_LABEL[w.venue] : (
                        <span className="text-red-600">⚠ Unknown venue</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      week of {w.weekStartWed || "—"} (Wed–Tue)
                    </span>
                  </div>
                  {w.revenueExGst !== null && (
                    <span className="text-xs text-muted-foreground">
                      Revenue ex GST: <span className="font-medium text-foreground">${w.revenueExGst.toLocaleString()}</span>
                    </span>
                  )}
                </div>

                {/* Totals */}
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <Stat label="Total wages" value={w.grossWages} revenue={w.revenueExGst} />
                  <Stat label="Ex-admin" value={w.grossWagesExAdmin} revenue={w.revenueExGst} />
                  <Stat label="Ex-admin/leave/bkpay" value={w.grossWagesExAdminLeaveBackpay} revenue={w.revenueExGst} />
                  <Stat label="COGS" value={w.cogsActual} pctOverride={w.cogsPct} />
                </div>

                {/* Departments */}
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="mb-2 text-xs font-medium">Department breakdown</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                    <Dept label="Barista" value={w.wagesBarista} revenue={w.revenueExGst} />
                    <Dept label="Chef" value={w.wagesChef} revenue={w.revenueExGst} />
                    <Dept label="FOH" value={w.wagesFoh} revenue={w.revenueExGst} />
                    <Dept label="KP/Dishy" value={w.wagesKp} revenue={w.revenueExGst} />
                    <Dept label="Pastry" value={w.wagesPastry} revenue={w.revenueExGst} />
                    <Dept label="Admin" value={w.wagesAdmin} revenue={w.revenueExGst} />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <button
                onClick={handleCommitMge}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Save {mgePreview.length} week{mgePreview.length === 1 ? "" : "s"}
              </button>
              {saveResult && (
                <span className="text-xs text-emerald-700">{saveResult}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {preview && preview.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">CSV preview</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2">Venue</th>
                  <th className="py-2">Week (Wed)</th>
                  <th className="py-2 text-right">Wages</th>
                  <th className="py-2 text-right">Super</th>
                  <th className="py-2 text-right">Hours</th>
                  <th className="py-2 text-right">M. Forecast</th>
                  <th className="py-2 text-right">Implied %</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => {
                  const resolvedVenue = fixedVenues[i] ?? r.venue
                  const pct =
                    r.mForecast && r.mForecast > 0
                      ? (r.grossWages / r.mForecast) * 100
                      : null
                  return (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-border/50",
                        !resolvedVenue && "bg-amber-50"
                      )}
                    >
                      <td className="py-2">
                        {resolvedVenue ? (
                          <span className="text-xs font-medium">
                            {VENUE_LABEL[resolvedVenue]}
                          </span>
                        ) : (
                          <select
                            className="rounded border border-amber-300 bg-white px-1 py-0.5 text-xs"
                            value=""
                            onChange={(e) =>
                              setFixedVenues((s) => ({
                                ...s,
                                [i]: e.target.value as Venue,
                              }))
                            }
                          >
                            <option value="" disabled>
                              ⚠ pick — was &quot;{r.venueRaw}&quot;
                            </option>
                            {SINGLE_VENUES.map((v) => (
                              <option key={v} value={v}>
                                {VENUE_LABEL[v]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 text-xs">{r.weekStartWed}</td>
                      <td className="py-2 text-right tabular-nums">
                        ${r.grossWages.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {r.superAmount ? `$${r.superAmount.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {r.totalHours ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {r.mForecast ? `$${r.mForecast.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {pct !== null && (
                          <Badge
                            variant={
                              pct < 28 ? "green" : pct < 34 ? "amber" : "red"
                            }
                          >
                            {pct.toFixed(1)}%
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleCommit}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Save {preview.length} rows
              </button>
              {saveResult && (
                <span className="text-xs text-emerald-700">{saveResult}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  revenue,
  pctOverride,
}: {
  label: string
  value: number | null
  revenue?: number | null
  pctOverride?: number | null
}) {
  if (value === null) {
    return (
      <div>
        <div className="text-muted-foreground">{label}</div>
        <div className="text-muted-foreground/60">—</div>
      </div>
    )
  }
  const pct =
    pctOverride ??
    (revenue && revenue > 0 ? (value / revenue) * 100 : null)
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="tabular-nums font-medium">
        ${value.toLocaleString()}
        {pct !== null && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            ({pct.toFixed(2)}%)
          </span>
        )}
      </div>
    </div>
  )
}

function Dept({
  label,
  value,
  revenue,
}: {
  label: string
  value: number | null
  revenue: number | null
}) {
  if (value === null) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/60">—</span>
      </div>
    )
  }
  const pct = revenue && revenue > 0 ? (value / revenue) * 100 : null
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        ${value.toLocaleString()}
        {pct !== null && (
          <span className="ml-1 text-[10px] text-muted-foreground/70">
            {pct.toFixed(2)}%
          </span>
        )}
      </span>
    </div>
  )
}
