import { Mail, Sparkles } from "lucide-react"

interface DigestRow {
  id: string
  weekStart: Date
  weekEnd: Date
  body: string
  reviewCount: number
  salesTotal: unknown
  salesWowPct: unknown
  cogsAvgPct: unknown
  labourAvgPct: unknown
  wastageTotal: unknown
  emailedAt: Date | null
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Sydney",
  })
}

function fmtMoney(v: unknown): string {
  const n = v == null ? null : Number(v)
  if (n == null || Number.isNaN(n)) return "—"
  return `$${n.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`
}

function fmtPct(v: unknown): string {
  const n = v == null ? null : Number(v)
  if (n == null || Number.isNaN(n)) return "—"
  return `${n.toFixed(1)}%`
}

function fmtSignedPct(v: unknown): string {
  const n = v == null ? null : Number(v)
  if (n == null || Number.isNaN(n)) return "—"
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
}

export function WeeklyDigestPanel({ digest }: { digest: DigestRow }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          Weekly digest — {fmtDate(digest.weekStart)} to{" "}
          {fmtDate(digest.weekEnd)}
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-400">
          {digest.emailedAt ? (
            <>
              <Mail className="h-3.5 w-3.5" />
              emailed {fmtDate(digest.emailedAt)}
            </>
          ) : (
            <span className="text-amber-700">not emailed yet</span>
          )}
        </div>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <Metric label="Sales" value={fmtMoney(digest.salesTotal)} delta={fmtSignedPct(digest.salesWowPct)} />
        <Metric label="Labour %" value={fmtPct(digest.labourAvgPct)} />
        <Metric label="COGS %" value={fmtPct(digest.cogsAvgPct)} />
        <Metric label="Wastage" value={fmtMoney(digest.wastageTotal)} />
        <Metric label="Reviews" value={String(digest.reviewCount)} />
      </div>

      <details>
        <summary className="cursor-pointer text-xs font-medium text-emerald-700 hover:underline">
          Read the full digest
        </summary>
        {/* body is generated server-side HTML from our own renderer — safe to inject */}
        <div
          className="mt-3 max-h-[640px] overflow-auto rounded-md bg-stone-50 p-3"
          dangerouslySetInnerHTML={{ __html: digest.body }}
        />
      </details>
    </section>
  )
}

function Metric({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta?: string
}) {
  return (
    <div className="rounded-md border border-stone-100 bg-stone-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-stone-500">
        {label}
      </div>
      <div className="text-sm font-semibold text-stone-900">{value}</div>
      {delta && (
        <div className="text-[11px] text-stone-500">{delta}</div>
      )}
    </div>
  )
}
