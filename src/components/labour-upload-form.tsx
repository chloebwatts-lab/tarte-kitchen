"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Upload, Check, AlertTriangle, FileText, X, Loader2 } from "lucide-react"
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
import {
  parseCogsXlsx,
  commitCogsXlsx,
  type ExtractedCogsWeek,
} from "@/lib/actions/cogs"
import { cn } from "@/lib/utils"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import type { Venue } from "@/generated/prisma"

type FileType = "mge" | "cogs" | "csv" | "unknown"
type FileStatus = "parsing" | "parsed" | "saving" | "saved" | "error"

interface FileEntry {
  id: string
  filename: string
  type: FileType
  status: FileStatus
  error: string | null
  mgeWeeks: ExtractedMgeWeek[] | null
  cogsWeeks: ExtractedCogsWeek[] | null
  csvRows: ParsedCsvRow[] | null
  csvRaw: string | null
  fixedVenues: Record<number, Venue>
  uploadId: string | null
}

function classifyFile(f: File): FileType {
  if (/\.xlsx$/i.test(f.name)) return "cogs"
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return "mge"
  if (/\.csv$/i.test(f.name) || f.type === "text/csv") return "csv"
  return "unknown"
}

async function fileToBase64(f: File): Promise<string> {
  const buf = await f.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function LabourUploadForm() {
  const router = useRouter()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [savingAll, startSaveAll] = useTransition()
  const [saveSummary, setSaveSummary] = useState<string | null>(null)

  function patchFile(id: string, patch: Partial<FileEntry>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  async function parseOne(entry: FileEntry, file: File) {
    try {
      if (entry.type === "cogs") {
        const base64 = await fileToBase64(file)
        const { weeks } = await parseCogsXlsx({ xlsxBase64: base64, filename: file.name })
        patchFile(entry.id, { status: "parsed", cogsWeeks: weeks })
      } else if (entry.type === "mge") {
        const base64 = await fileToBase64(file)
        const { weeks } = await parseLabourPdfRich({ pdfBase64: base64, filename: file.name })
        patchFile(entry.id, { status: "parsed", mgeWeeks: weeks })
      } else if (entry.type === "csv") {
        const text = await file.text()
        const { rows } = await parseLabourCsv(text)
        patchFile(entry.id, { status: "parsed", csvRows: rows, csvRaw: text })
      } else {
        patchFile(entry.id, { status: "error", error: "Unrecognised file type — need .pdf, .xlsx, or .csv" })
      }
    } catch (e) {
      patchFile(entry.id, { status: "error", error: (e as Error).message })
    }
  }

  function handleFiles(picked: FileList) {
    const newOnes: { entry: FileEntry; file: File }[] = []
    for (const file of Array.from(picked)) {
      const entry: FileEntry = {
        id: crypto.randomUUID(),
        filename: file.name,
        type: classifyFile(file),
        status: "parsing",
        error: null,
        mgeWeeks: null,
        cogsWeeks: null,
        csvRows: null,
        csvRaw: null,
        fixedVenues: {},
        uploadId: null,
      }
      newOnes.push({ entry, file })
    }
    setFiles((prev) => [...prev, ...newOnes.map((n) => n.entry)])
    setSaveSummary(null)
    // Parse all in parallel.
    for (const { entry, file } of newOnes) parseOne(entry, file)
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function setVenueForCsvRow(fileId: string, rowIdx: number, venue: Venue) {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, fixedVenues: { ...f.fixedVenues, [rowIdx]: venue } }
          : f
      )
    )
  }

  async function saveOne(entry: FileEntry): Promise<string> {
    patchFile(entry.id, { status: "saving", error: null })
    try {
      if (entry.type === "mge" && entry.mgeWeeks) {
        const missing = entry.mgeWeeks.filter((w) => w.venue === null || !w.weekStartWed)
        if (missing.length > 0) throw new Error(`${missing.length} week(s) missing venue or week-start`)
        const res = await commitLabourMgePdf({
          filename: entry.filename,
          rawPdfBase64: "",
          weeks: entry.mgeWeeks,
        })
        patchFile(entry.id, { status: "saved", uploadId: res.uploadId })
        return `${entry.filename}: saved ${res.weeks} week(s)`
      }
      if (entry.type === "cogs" && entry.cogsWeeks) {
        const missing = entry.cogsWeeks.filter((w) => w.venue === null || !w.weekStartWed)
        if (missing.length > 0) throw new Error(`${missing.length} week(s) missing venue or week-start`)
        const res = await commitCogsXlsx({ filename: entry.filename, weeks: entry.cogsWeeks })
        patchFile(entry.id, { status: "saved", uploadId: res.uploadId })
        return `${entry.filename}: saved ${res.weeks} COGS week(s)`
      }
      if (entry.type === "csv" && entry.csvRows && entry.csvRaw) {
        const resolved = entry.csvRows.map((r, idx) => ({
          ...r,
          venue: entry.fixedVenues[idx] ?? r.venue,
        }))
        if (!resolved.every((r) => r.venue !== null)) {
          throw new Error("CSV has rows with unresolved venues — pick one for each highlighted row")
        }
        const res = await commitLabourCsv({
          filename: entry.filename,
          rawCsv: entry.csvRaw,
          rows: resolved.map((r) => ({
            venue: r.venue as Venue,
            weekStartWed: r.weekStartWed,
            grossWages: r.grossWages,
            superAmount: r.superAmount,
            totalHours: r.totalHours,
            mForecast: r.mForecast,
          })),
        })
        patchFile(entry.id, { status: "saved", uploadId: res.uploadId })
        return `${entry.filename}: saved ${res.rows} CSV row(s)`
      }
      throw new Error("Nothing to save")
    } catch (e) {
      patchFile(entry.id, { status: "error", error: (e as Error).message })
      throw e
    }
  }

  function handleSaveAll() {
    setSaveSummary(null)
    const targets = files.filter((f) => f.status === "parsed")
    if (targets.length === 0) return
    startSaveAll(async () => {
      const messages: string[] = []
      let failed = 0
      for (const f of targets) {
        try {
          messages.push(await saveOne(f))
        } catch {
          failed++
        }
      }
      setSaveSummary(
        `${messages.length} saved${failed ? `, ${failed} failed` : ""}.${messages.length ? " " + messages.join(" · ") : ""}`
      )
      if (failed === 0 && messages.length > 0) {
        setTimeout(() => router.push("/labour"), 1500)
      }
    })
  }

  const parsedCount = files.filter((f) => f.status === "parsed").length
  const parsingCount = files.filter((f) => f.status === "parsing").length
  const savedCount = files.filter((f) => f.status === "saved").length

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
            Upload weekly reports (PDF / XLSX / CSV)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Upload className="h-3.5 w-3.5" />
              Add files
              <input
                type="file"
                multiple
                accept=".csv,text/csv,.pdf,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFiles(e.target.files)
                    e.target.value = ""
                  }
                }}
              />
            </label>
            {files.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"}
                {parsingCount > 0 && ` · ${parsingCount} parsing`}
                {parsedCount > 0 && ` · ${parsedCount} ready`}
                {savedCount > 0 && ` · ${savedCount} saved`}
              </span>
            )}
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <p className="font-medium">Drop in any combination</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>
                <strong>Mge PDF</strong> — weekly management report per venue. Extracts revenue, department wage breakdown, ex-admin totals, COGS.
              </li>
              <li>
                <strong>COGS xlsx</strong> — weekly Burleigh / Currumbin food-costs spreadsheet.
              </li>
              <li>
                <strong>Payroll CSV</strong> — columns: venue, week_start, gross_wages, super, hours, m_forecast.
              </li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Files parse in parallel — one slow PDF won&apos;t hold the others up.
            </p>
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((f) => (
            <FileCard
              key={f.id}
              entry={f}
              onRemove={() => removeFile(f.id)}
              onSetVenue={(idx, v) => setVenueForCsvRow(f.id, idx, v)}
            />
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSaveAll}
              disabled={savingAll || parsedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {savingAll
                ? "Saving…"
                : `Save all (${parsedCount} ready${parsingCount ? `, ${parsingCount} still parsing` : ""})`}
            </button>
            {saveSummary && (
              <span className="text-xs text-emerald-700">{saveSummary}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FileCard({
  entry,
  onRemove,
  onSetVenue,
}: {
  entry: FileEntry
  onRemove: () => void
  onSetVenue: (rowIdx: number, venue: Venue) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" />
            <span className="truncate">{entry.filename}</span>
            <StatusBadge status={entry.status} type={entry.type} />
          </CardTitle>
          {entry.status !== "saving" && entry.status !== "saved" && (
            <button
              onClick={onRemove}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {entry.status === "parsing" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {entry.type === "mge"
              ? "Extracting via Claude vision (~10s)…"
              : "Parsing…"}
          </p>
        )}

        {entry.status === "error" && entry.error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {entry.error}
          </div>
        )}

        {entry.status === "saved" && (
          <p className="text-xs text-emerald-700">
            Saved · upload id {entry.uploadId}
          </p>
        )}

        {entry.mgeWeeks && entry.status !== "saved" && (
          <MgePreview weeks={entry.mgeWeeks} />
        )}
        {entry.cogsWeeks && entry.status !== "saved" && (
          <CogsPreview weeks={entry.cogsWeeks} />
        )}
        {entry.csvRows && entry.status !== "saved" && (
          <CsvPreview rows={entry.csvRows} fixedVenues={entry.fixedVenues} onSetVenue={onSetVenue} />
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status, type }: { status: FileStatus; type: FileType }) {
  const variant: Record<FileStatus, "green" | "amber" | "red" | "neutral"> = {
    parsing: "amber",
    parsed: "neutral",
    saving: "amber",
    saved: "green",
    error: "red",
  }
  const label: Record<FileStatus, string> = {
    parsing: "parsing",
    parsed: type === "unknown" ? "unknown type" : "ready",
    saving: "saving",
    saved: "saved",
    error: "error",
  }
  // Cast — Badge accepts these via its variant union plus "neutral" fallback below.
  return (
    <Badge variant={variant[status] === "neutral" ? undefined : variant[status]}>
      {label[status]}
    </Badge>
  )
}

function MgePreview({ weeks }: { weeks: ExtractedMgeWeek[] }) {
  return (
    <div className="space-y-3">
      {weeks.map((w, i) => (
        <div key={i} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {w.venue ? VENUE_LABEL[w.venue] : <span className="text-red-600">⚠ Unknown venue</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                week of {w.weekStartWed || "—"} (Wed–Tue)
              </span>
            </div>
            {w.revenueExGst !== null && (
              <span className="text-xs text-muted-foreground">
                Revenue ex GST:{" "}
                <span className="font-medium text-foreground">
                  ${w.revenueExGst.toLocaleString()}
                </span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label="Total wages" value={w.grossWages} revenue={w.revenueExGst} />
            <Stat label="Ex-admin" value={w.grossWagesExAdmin} revenue={w.revenueExGst} />
            <Stat label="Ex-admin/leave/bkpay" value={w.grossWagesExAdminLeaveBackpay} revenue={w.revenueExGst} />
            <Stat label="COGS" value={w.cogsActual} pctOverride={w.cogsPct} />
          </div>
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
    </div>
  )
}

function CogsPreview({ weeks }: { weeks: ExtractedCogsWeek[] }) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/50">
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-2 py-1.5">Venue</th>
            <th className="px-2 py-1.5">Week (Wed)</th>
            <th className="px-2 py-1.5 text-right">Revenue</th>
            <th className="px-2 py-1.5 text-right">Food</th>
            <th className="px-2 py-1.5 text-right">Coffee</th>
            <th className="px-2 py-1.5 text-right">Cons.</th>
            <th className="px-2 py-1.5 text-right">Drinks</th>
            <th className="px-2 py-1.5 text-right">Pkg</th>
            <th className="px-2 py-1.5 text-right">Total</th>
            <th className="px-2 py-1.5 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="px-2 py-1 text-xs">
                {w.venue ? VENUE_LABEL[w.venue] : <span className="text-red-600">⚠ {w.venueRaw || "?"}</span>}
              </td>
              <td className="px-2 py-1 tabular-nums">{w.weekStartWed}</td>
              <td className="px-2 py-1 text-right tabular-nums">{w.revenueExGst != null ? `$${w.revenueExGst.toLocaleString()}` : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{w.cogsFood != null ? `$${w.cogsFood.toLocaleString()}` : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{w.cogsCoffee != null ? `$${w.cogsCoffee.toLocaleString()}` : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{w.cogsConsumables != null ? `$${w.cogsConsumables.toLocaleString()}` : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{w.cogsDrinks != null ? `$${w.cogsDrinks.toLocaleString()}` : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{w.cogsPackaging != null ? `$${w.cogsPackaging.toLocaleString()}` : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums font-medium">{w.totalCogs != null ? `$${w.totalCogs.toLocaleString()}` : "—"}</td>
              <td className="px-2 py-1 text-right">
                {w.cogsPct != null && (
                  <Badge variant={w.cogsPct < 28 ? "green" : w.cogsPct < 32 ? "amber" : "red"}>
                    {w.cogsPct.toFixed(1)}%
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CsvPreview({
  rows,
  fixedVenues,
  onSetVenue,
}: {
  rows: ParsedCsvRow[]
  fixedVenues: Record<number, Venue>
  onSetVenue: (rowIdx: number, venue: Venue) => void
}) {
  return (
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
        {rows.map((r, i) => {
          const resolvedVenue = fixedVenues[i] ?? r.venue
          const pct = r.mForecast && r.mForecast > 0 ? (r.grossWages / r.mForecast) * 100 : null
          return (
            <tr key={i} className={cn("border-b border-border/50", !resolvedVenue && "bg-amber-50")}>
              <td className="py-2">
                {resolvedVenue ? (
                  <span className="text-xs font-medium">{VENUE_LABEL[resolvedVenue]}</span>
                ) : (
                  <select
                    className="rounded border border-amber-300 bg-white px-1 py-0.5 text-xs"
                    value=""
                    onChange={(e) => onSetVenue(i, e.target.value as Venue)}
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
              <td className="py-2 text-right tabular-nums">${r.grossWages.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.superAmount ? `$${r.superAmount.toLocaleString()}` : "—"}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.totalHours ?? "—"}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.mForecast ? `$${r.mForecast.toLocaleString()}` : "—"}</td>
              <td className="py-2 text-right">
                {pct !== null && (
                  <Badge variant={pct < 28 ? "green" : pct < 34 ? "amber" : "red"}>
                    {pct.toFixed(1)}%
                  </Badge>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
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
  const pct = pctOverride ?? (revenue && revenue > 0 ? (value / revenue) * 100 : null)
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="tabular-nums font-medium">
        ${value.toLocaleString()}
        {pct !== null && (
          <span className="ml-1 text-[10px] text-muted-foreground">({pct.toFixed(2)}%)</span>
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
        {pct !== null && <span className="ml-1 text-[10px] text-muted-foreground/70">{pct.toFixed(2)}%</span>}
      </span>
    </div>
  )
}
