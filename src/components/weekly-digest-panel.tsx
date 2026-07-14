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
    timeZone: "Australia/Brisbane",
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
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-green-text" />
          Weekly digest — {fmtDate(digest.weekStart)} to{" "}
          {fmtDate(digest.weekEnd)}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {digest.emailedAt ? (
            <>
              <Mail className="h-3.5 w-3.5" />
              emailed {fmtDate(digest.emailedAt)}
            </>
          ) : (
            <span className="text-amber-text">not emailed yet</span>
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
        <summary className="cursor-pointer text-xs font-medium text-green-text hover:underline">
          Read the full digest
        </summary>
        {/* body is generated server-side HTML from our own renderer — safe to inject */}
        <div
          className="mt-3 max-h-[640px] overflow-auto rounded-md bg-muted/50 p-3"
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
    <div className="rounded-xl border-[1.5px] border-border bg-card p-4">
      <div className="font-serif text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
      {delta && (
        <div className="text-[11px] text-muted-foreground">{delta}</div>
      )}
    </div>
  )
}
