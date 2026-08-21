"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Camera,
  Check,
  ClipboardList,
  Mail,
  Printer,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react"
import { confirmMaintenanceAsset } from "@/lib/actions/maintenance"

export interface MDAsset {
  id: string
  slug: string
  venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN" | "BOTH"
  location: string
  name: string
  category: string
  status: "ACTIVE" | "RETIRED"
  manufacturer: string | null
  model: string | null
  serial: string | null
  photoUrl: string | null
  needsReview: boolean
  source: string
  sourceEmailSubject: string | null
  addedBy: string | null
  supplier: string | null
  createdAt: string
  purchaseDate: string | null
  warrantyMonths: number | null
  warrantyProvider: string | null
  issueCount: number
  openIssueCount: number
}

export interface MDIssue {
  id: string
  title: string
  legacyRef: string | null
  isSafety: boolean
  createdAt: string
  reportedBy: string | null
  venue: string
  contactName: string | null
  assetSlug: string | null
  assetName: string | null
  assetPhotoUrl: string | null
}

const VENUE_TABS = [
  { key: "BURLEIGH", label: "Burleigh" },
  { key: "BEACH_HOUSE", label: "Beach House" },
] as const

function warrantyState(a: MDAsset): {
  kind: "active" | "expiring" | "expired" | "unknown"
  end: Date | null
  daysLeft: number | null
} {
  if (!a.purchaseDate || !a.warrantyMonths) return { kind: "unknown", end: null, daysLeft: null }
  const end = new Date(a.purchaseDate)
  end.setMonth(end.getMonth() + a.warrantyMonths)
  const days = Math.ceil((end.getTime() - Date.now()) / 86400000)
  if (days <= 0) return { kind: "expired", end, daysLeft: 0 }
  if (days <= 90) return { kind: "expiring", end, daysLeft: days }
  return { kind: "active", end, daysLeft: days }
}

function fmtShort(d: Date) {
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" })
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function Thumb({ src, size = 40 }: { src: string | null; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Camera className="h-4 w-4 text-muted-foreground/50" />
      )}
    </div>
  )
}

function WarrantyChip({ a }: { a: MDAsset }) {
  const w = warrantyState(a)
  if (w.kind === "active")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <ShieldCheck className="h-3 w-3" /> to {fmtShort(w.end!)}
      </span>
    )
  if (w.kind === "expiring")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        <AlertTriangle className="h-3 w-3" /> {w.daysLeft}d left!
      </span>
    )
  if (w.kind === "expired")
    return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">expired</span>
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
      <ShieldQuestion className="h-3 w-3" /> unknown
    </span>
  )
}

export function MaintenanceDashboard({
  assets,
  openIssues,
  contactCount,
}: {
  assets: MDAsset[]
  openIssues: MDIssue[]
  contactCount: number
}) {
  const [venue, setVenue] = useState<(typeof VENUE_TABS)[number]["key"]>("BURLEIGH")
  const [q, setQ] = useState("")
  const [showRetired, setShowRetired] = useState(false)
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  const pendingReview = assets.filter((a) => a.needsReview && !confirmedIds.has(a.id))

  function confirmAsset(id: string) {
    setConfirmedIds((prev) => new Set(prev).add(id))
    startTransition(() => {
      void confirmMaintenanceAsset(id)
    })
  }

  const active = assets.filter((a) => a.status === "ACTIVE")
  const safety = openIssues.filter((i) => i.isSafety)
  const expiring = active
    .map((a) => ({ a, w: warrantyState(a) }))
    .filter((x) => x.w.kind === "expiring")
    .sort((x, y) => (x.w.daysLeft ?? 0) - (y.w.daysLeft ?? 0))
  const underWarranty = active.filter((a) => ["active", "expiring"].includes(warrantyState(a).kind))
  const missingPlate = active.filter((a) => !a.manufacturer || !a.serial)
  const staleIssues = openIssues.filter(
    (i) => !i.isSafety && Date.now() - new Date(i.createdAt).getTime() > 30 * 86400000
  )

  const registerRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return assets
      .filter((a) => a.venue === venue)
      .filter((a) => (showRetired ? true : a.status === "ACTIVE"))
      .filter(
        (a) =>
          !needle ||
          [a.name, a.slug, a.location, a.manufacturer ?? "", a.model ?? "", a.serial ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(needle)
      )
  }, [assets, venue, q, showRetired])

  const byLocation = useMemo(() => {
    const m = new Map<string, MDAsset[]>()
    for (const a of registerRows) {
      const l = m.get(a.location) ?? []
      l.push(a)
      m.set(a.location, l)
    }
    return Array.from(m.entries())
  }, [registerRows])

  return (
    <div className="space-y-8">
      {/* ── Stat strip ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Open issues"
          value={openIssues.length}
          sub={safety.length ? `${safety.length} safety` : "none safety"}
          tone={safety.length ? "red" : openIssues.length ? "amber" : "green"}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatTile
          label="Under warranty"
          value={underWarranty.length}
          sub={expiring.length ? `${expiring.length} expiring soon` : "none expiring"}
          tone={expiring.length ? "amber" : "green"}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <StatTile
          label="Machines"
          value={active.length}
          sub={`${active.filter((a) => a.venue === "BURLEIGH").length} Burleigh · ${active.filter((a) => a.venue === "BEACH_HOUSE").length} Beach House`}
          tone="neutral"
          icon={<Wrench className="h-4 w-4" />}
        />
        <StatTile
          label="Missing plate data"
          value={missingPlate.length}
          sub="make or serial blank"
          tone={missingPlate.length ? "amber" : "green"}
          icon={<Camera className="h-4 w-4" />}
        />
      </div>

      {/* ── New machines to check ── */}
      {pendingReview.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> New machines, check the details
          </h2>
          {pendingReview.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3"
            >
              <Thumb src={a.photoUrl} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  <span className="font-mono">{a.slug}</span> · {a.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {a.venue === "BURLEIGH" ? "Burleigh" : "Beach House"} · {a.location}
                  {a.supplier ? ` · from ${a.supplier}` : ""}
                  {a.source === "email" && a.sourceEmailSubject ? (
                    <span className="inline-flex items-center gap-1">
                      {" · "}
                      <Mail className="inline h-3 w-3" /> {a.sourceEmailSubject}
                    </span>
                  ) : a.addedBy ? (
                    ` · added by ${a.addedBy}`
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/kitchen/fix/label/${a.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Printer className="h-3.5 w-3.5" /> QR label
                </Link>
                <Link
                  href={`/kitchen/fix/${a.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Wrench className="h-3.5 w-3.5" /> Open
                </Link>
                <button
                  onClick={() => confirmAsset(a.id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background"
                >
                  <Check className="h-3.5 w-3.5" /> Looks right
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Needs attention ── */}
      {(safety.length > 0 || expiring.length > 0 || staleIssues.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Needs attention
          </h2>
          {safety.map((i) => (
            <AttentionCard
              key={i.id}
              tone="red"
              icon={<AlertTriangle className="h-4 w-4" />}
              title={i.title}
              sub={`${i.assetName ?? i.venue} · reported ${ago(i.createdAt)}${i.reportedBy ? ` by ${i.reportedBy}` : ""}`}
              href={i.assetSlug ? `/kitchen/fix/${i.assetSlug}` : undefined}
            />
          ))}
          {expiring.map(({ a, w }) => (
            <AttentionCard
              key={a.id}
              tone="amber"
              icon={<CalendarClock className="h-4 w-4" />}
              title={`Warranty ends in ${w.daysLeft} days: ${a.name}`}
              sub={`Claim any faults with ${a.warrantyProvider ?? "the supplier"} before ${w.end!.toLocaleDateString("en-AU")}`}
              href={`/kitchen/fix/${a.slug}`}
            />
          ))}
          {staleIssues.map((i) => (
            <AttentionCard
              key={i.id}
              tone="neutral"
              icon={<ClipboardList className="h-4 w-4" />}
              title={`Open since ${new Date(i.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}: ${i.title}`}
              sub={`${i.assetName ?? i.venue}${i.contactName ? ` · trade: ${i.contactName}` : " · no trade assigned yet"}`}
              href={i.assetSlug ? `/kitchen/fix/${i.assetSlug}` : undefined}
            />
          ))}
        </section>
      )}

      {/* ── Open issues ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Open issues
        </h2>
        {openIssues.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nothing open. Enjoy it while it lasts.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {openIssues.map((i) => (
              <Link
                key={i.id}
                href={i.assetSlug ? `/kitchen/fix/${i.assetSlug}` : "#"}
                className={`group flex items-center gap-3 rounded-xl border p-3 transition hover:border-foreground/30 ${
                  i.isSafety ? "border-red-200 bg-red-50/60" : "bg-card"
                }`}
              >
                <Thumb src={i.assetPhotoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {i.isSafety && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-red-600" />}
                    {i.title}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {i.assetName ?? "General"} · {ago(i.createdAt)}
                    {i.reportedBy ? ` · ${i.reportedBy}` : ""}
                    {i.contactName ? ` · ${i.contactName}` : ""}
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Register ── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Machines
          </h2>
          <div className="flex rounded-lg border p-0.5">
            {VENUE_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setVenue(t.key)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                  venue === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, serial, code…"
              className="w-full rounded-lg border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={(e) => setShowRetired(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            retired
          </label>
        </div>

        <div className="space-y-4">
          {byLocation.map(([location, rows]) => (
            <div key={location}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {location}
              </div>
              <div className="overflow-hidden rounded-xl border">
                {rows.map((a, idx) => (
                  <Link
                    key={a.id}
                    href={`/kitchen/fix/${a.slug}`}
                    className={`group flex items-center gap-3 bg-card p-2.5 transition hover:bg-muted/50 ${
                      idx > 0 ? "border-t" : ""
                    } ${a.status === "RETIRED" ? "opacity-45" : ""}`}
                  >
                    <Thumb src={a.photoUrl} />
                    <div className="min-w-0 flex-[2]">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{a.slug}</span>
                        {a.manufacturer ? ` · ${a.manufacturer}` : ""}
                        {a.model ? ` ${a.model}` : ""}
                      </div>
                    </div>
                    <div className="hidden min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground md:block">
                      {a.serial ?? <span className="text-amber-600">no serial</span>}
                    </div>
                    <div className="hidden shrink-0 md:block">
                      {a.status === "RETIRED" ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">retired</span>
                      ) : (
                        <WarrantyChip a={a} />
                      )}
                    </div>
                    <div className="w-10 shrink-0 text-right">
                      {a.openIssueCount > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {a.openIssueCount}
                        </span>
                      ) : a.issueCount > 0 ? (
                        <span className="text-xs text-muted-foreground">{a.issueCount}×</span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {registerRows.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nothing matches, try the other venue tab or clear the search.
            </p>
          )}
        </div>
      </section>

      {/* ── Footer links ── */}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Link href="/maintenance/contacts" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
          <Users className="h-4 w-4" /> Trade contacts ({contactCount})
        </Link>
        <Link href="/maintenance/labels" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
          <Printer className="h-4 w-4" /> Print QR labels
        </Link>
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string
  value: number
  sub: string
  tone: "red" | "amber" | "green" | "neutral"
  icon: React.ReactNode
}) {
  const toneCls =
    tone === "red"
      ? "text-red-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "green"
          ? "text-emerald-600"
          : "text-foreground"
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {label} {icon}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function AttentionCard({
  tone,
  icon,
  title,
  sub,
  href,
}: {
  tone: "red" | "amber" | "neutral"
  icon: React.ReactNode
  title: string
  sub: string
  href?: string
}) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "bg-card"
  const body = (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${cls} ${href ? "transition hover:border-foreground/30" : ""}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-snug">{title}</div>
        <div className="mt-0.5 text-xs opacity-80">{sub}</div>
      </div>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}
