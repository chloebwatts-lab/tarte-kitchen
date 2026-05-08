import Link from "next/link"
import { ShieldCheck, AlertTriangle, FileText, ArrowRight } from "lucide-react"
import { db } from "@/lib/db"
import { SINGLE_VENUES, VENUE_LABEL } from "@/lib/venues"
import { Venue } from "@/generated/prisma"

export const dynamic = "force-dynamic"

const TODAY = () => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function expiryStatus(expiresOn: Date | null): {
  label: string
  tone: "ok" | "warn" | "expired" | "none"
} {
  if (!expiresOn) return { label: "—", tone: "none" }
  const today = TODAY().getTime()
  const exp = new Date(expiresOn).getTime()
  const days = Math.round((exp - today) / 86400000)
  if (days < 0) return { label: `Expired ${-days}d ago`, tone: "expired" }
  if (days <= 30) return { label: `Expires in ${days}d`, tone: "warn" }
  return { label: `${days}d to expiry`, tone: "ok" }
}

export default async function CouncilLandingPage() {
  const [docCounts, expirySnapshots] = await Promise.all([
    db.councilDocument.groupBy({
      by: ["venue"],
      _count: { _all: true },
    }),
    db.councilDocument.findMany({
      where: { expiresOn: { not: null } },
      select: { venue: true, type: true, title: true, expiresOn: true },
      orderBy: { expiresOn: "asc" },
    }),
  ])

  const byVenue = new Map<Venue, number>()
  for (const r of docCounts) byVenue.set(r.venue, r._count._all)

  const today = TODAY().getTime()
  const expiringSoon = expirySnapshots.filter((d) => {
    const t = new Date(d.expiresOn!).getTime()
    return t < today + 30 * 86400000
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            GCCC Inspection Folder
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            Tarte Kitchen — Council Folder
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Everything an Environmental Health Officer needs in one place.
            Choose a venue to view licences, FSS certificates, pest reports,
            cleaning &amp; cooling logs, allergen info and training records.
          </p>
        </div>
      </header>

      {expiringSoon.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {expiringSoon.length} document
            {expiringSoon.length === 1 ? "" : "s"} expiring or expired
          </div>
          <ul className="space-y-0.5 text-sm text-amber-900/90">
            {expiringSoon.slice(0, 6).map((d, i) => {
              const status = expiryStatus(d.expiresOn)
              return (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    <span className="font-medium">
                      {VENUE_LABEL[d.venue].replace(/^Tarte\s+/, "")}
                    </span>{" "}
                    — {d.title}
                  </span>
                  <span
                    className={
                      status.tone === "expired"
                        ? "shrink-0 text-rose-700"
                        : "shrink-0 text-amber-800"
                    }
                  >
                    {status.label}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SINGLE_VENUES.map((v) => {
          const count = byVenue.get(v) ?? 0
          return (
            <Link
              key={v}
              href={`/council/${v}`}
              className="group block rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-emerald-400 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50">
                  <FileText className="h-5 w-5 text-emerald-700" />
                </div>
                <ArrowRight className="h-5 w-5 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-700" />
              </div>
              <h2 className="text-lg font-semibold text-stone-900">
                {VENUE_LABEL[v].replace(/^Tarte\s+/, "")}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {count} document{count === 1 ? "" : "s"} on file
              </p>
            </Link>
          )
        })}
      </div>

      <p className="mt-10 text-center text-xs text-stone-400">
        Compliance under <em>Food Act 2006</em> (Qld) &amp; FSANZ Standard
        3.2.2A. Session expires 12 hours from login.
      </p>
    </div>
  )
}
