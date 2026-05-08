import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ShieldCheck,
  FileText,
  AlertTriangle,
  Bug,
  ClipboardList,
  Snowflake,
  Sparkles,
  ChefHat,
  Truck,
  Award,
  Map as MapIcon,
  GraduationCap,
  Thermometer,
  ArrowLeft,
} from "lucide-react"
import { db } from "@/lib/db"
import { CouncilDocumentType, Venue } from "@/generated/prisma/enums"
import { SINGLE_VENUES, VENUE_LABEL } from "@/lib/venues"
import { UploadDocumentDialog } from "@/components/council/upload-document-dialog"
import { DeleteDocumentButton } from "@/components/council/delete-document-button"
import { PrintButton } from "@/components/council/print-button"

export const dynamic = "force-dynamic"

type SingleVenue = (typeof SINGLE_VENUES)[number]

function isSingleVenue(v: string): v is SingleVenue {
  return (SINGLE_VENUES as readonly string[]).includes(v)
}

const SECTION_ORDER: {
  key: string
  title: string
  blurb: string
  Icon: typeof FileText
  types: CouncilDocumentType[]
  legal: string
}[] = [
  {
    key: "licence",
    title: "Licence & Food Safety Supervisor",
    blurb: "Current GCCC food business licence and FSS certificate.",
    Icon: Award,
    types: [
      CouncilDocumentType.FOOD_BUSINESS_LICENCE,
      CouncilDocumentType.FSS_CERTIFICATE,
      CouncilDocumentType.FSS_NOTIFICATION,
    ],
    legal: "Food Act 2006 (Qld) s.50 · Std 3.2.2A Tool 1",
  },
  {
    key: "pest",
    title: "Pest control",
    blurb: "Quarterly service reports from licensed pest controller.",
    Icon: Bug,
    types: [CouncilDocumentType.PEST_CONTROL_REPORT],
    legal: "FSANZ Std 3.2.2 cl.24",
  },
  {
    key: "training",
    title: "Training records",
    blurb: "Food handler training records — every staff member.",
    Icon: GraduationCap,
    types: [
      CouncilDocumentType.TRAINING_RECORD,
      CouncilDocumentType.ALLERGEN_TRAINING,
    ],
    legal: "Std 3.2.2A Tool 2",
  },
  {
    key: "cleaning",
    title: "Cleaning & calibration",
    blurb: "Cleaning schedule, sanitisation logs, probe calibration records.",
    Icon: Sparkles,
    types: [
      CouncilDocumentType.CLEANING_SCHEDULE,
      CouncilDocumentType.CALIBRATION_RECORD,
    ],
    legal: "FSANZ Std 3.2.2 cl.20",
  },
  {
    key: "structure",
    title: "Floor plan & structure",
    blurb: "Approved kitchen fitout / floor plan on file with Council.",
    Icon: MapIcon,
    types: [CouncilDocumentType.FLOOR_PLAN],
    legal: "FSANZ Std 3.2.3",
  },
  {
    key: "supplier",
    title: "Suppliers & traceability",
    blurb: "Approved supplier list, recall procedure, grease trap records.",
    Icon: Truck,
    types: [
      CouncilDocumentType.SUPPLIER_APPROVAL,
      CouncilDocumentType.RECALL_PROCEDURE,
      CouncilDocumentType.GREASE_TRAP_RECORD,
    ],
    legal: "FSANZ Std 3.2.2 cl.5 / 12",
  },
  {
    key: "haccp",
    title: "Food safety program (Cat-1)",
    blurb: "HACCP / accredited program, incident logs, EatSafe rating.",
    Icon: ShieldCheck,
    types: [
      CouncilDocumentType.HACCP_PLAN,
      CouncilDocumentType.INCIDENT_LOG,
      CouncilDocumentType.EAT_SAFE_RATING,
    ],
    legal: "Food Act 2006 Part 5",
  },
  {
    key: "other",
    title: "Other",
    blurb: "Anything else the EHO has requested.",
    Icon: FileText,
    types: [CouncilDocumentType.OTHER],
    legal: "—",
  },
]

const TYPE_LABEL: Record<CouncilDocumentType, string> = {
  FOOD_BUSINESS_LICENCE: "Food business licence",
  FSS_CERTIFICATE: "FSS certificate",
  FSS_NOTIFICATION: "FSS notification to Council",
  PEST_CONTROL_REPORT: "Pest control report",
  FLOOR_PLAN: "Floor plan",
  TRAINING_RECORD: "Training record",
  CALIBRATION_RECORD: "Probe calibration",
  CLEANING_SCHEDULE: "Cleaning schedule",
  ALLERGEN_TRAINING: "Allergen training",
  HACCP_PLAN: "HACCP / food safety program",
  RECALL_PROCEDURE: "Recall procedure",
  GREASE_TRAP_RECORD: "Grease trap record",
  EAT_SAFE_RATING: "Eat Safe rating",
  SUPPLIER_APPROVAL: "Approved supplier list",
  INCIDENT_LOG: "Incident log",
  OTHER: "Other",
}

const TODAY = () => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function expiryStatus(expiresOn: Date | null): {
  label: string
  tone: "ok" | "warn" | "expired" | "none"
} {
  if (!expiresOn) return { label: "", tone: "none" }
  const today = TODAY().getTime()
  const exp = new Date(expiresOn).getTime()
  const days = Math.round((exp - today) / 86400000)
  if (days < 0) return { label: `Expired ${-days}d ago`, tone: "expired" }
  if (days <= 30) return { label: `Expires in ${days}d`, tone: "warn" }
  return { label: `Valid · ${days}d to expiry`, tone: "ok" }
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  })
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default async function CouncilVenuePage({
  params,
}: {
  params: Promise<{ venue: string }>
}) {
  const { venue: venueParam } = await params
  if (!isSingleVenue(venueParam)) notFound()
  const venue: Venue = venueParam

  const [docs, recentCooling, recentChecklists, dishesCount] = await Promise.all([
    db.councilDocument.findMany({
      where: { venue },
      orderBy: [{ type: "asc" }, { issuedOn: "desc" }, { createdAt: "desc" }],
    }),
    db.coolingLog.count({
      where: {
        venue,
        startedAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
    }),
    db.checklistRun.count({
      where: {
        venue,
        runDate: { gte: new Date(Date.now() - 30 * 86400000) },
      },
    }),
    db.dish.count({ where: { venue, isActive: true } }),
  ])

  const docsByType = new Map<CouncilDocumentType, typeof docs>()
  for (const d of docs) {
    const arr = docsByType.get(d.type) ?? []
    arr.push(d)
    docsByType.set(d.type, arr)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/council"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          All venues
        </Link>
        <PrintButton />
      </div>

      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" />
          GCCC Inspection Folder
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          {VENUE_LABEL[venue]}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Tap any document to open. Hand the iPad to the EHO or hit print for a
          paper pack.
        </p>
      </header>

      {/* Live data shortcuts */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <LiveTile
          href={`/kitchen/inspection?venue=${venue}&days=30`}
          label="Cooling logs (30d)"
          value={recentCooling}
          Icon={Snowflake}
        />
        <LiveTile
          href={`/kitchen/inspection?venue=${venue}&days=30`}
          label="Checklist runs (30d)"
          value={recentChecklists}
          Icon={ClipboardList}
        />
        <LiveTile
          href={`/dishes/allergen-matrix?venue=${venue}`}
          label="Active dishes"
          value={dishesCount}
          Icon={ChefHat}
          subtitle="Allergen matrix"
        />
        <LiveTile
          href={`/kitchen/inspection?venue=${venue}&days=30`}
          label="Temp & inspection"
          value={null}
          Icon={Thermometer}
          subtitle="Live records"
        />
      </div>

      {/* Document sections */}
      <div className="space-y-6">
        {SECTION_ORDER.map((s) => {
          const sectionDocs = s.types.flatMap((t) => docsByType.get(t) ?? [])
          return (
            <section
              key={s.key}
              className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm print:break-inside-avoid"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <s.Icon className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900">
                      {s.title}
                    </h2>
                    <p className="text-sm text-stone-500">{s.blurb}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-stone-400">
                      {s.legal}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 print:hidden">
                  <UploadDocumentDialog venue={venue} types={s.types} />
                </div>
              </div>

              {sectionDocs.length === 0 ? (
                <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                  No documents uploaded yet.
                </div>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {sectionDocs.map((d) => {
                    const status = expiryStatus(d.expiresOn)
                    return (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={`/api/council/document/${d.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-stone-900 hover:text-emerald-700 hover:underline"
                            >
                              {d.title}
                            </a>
                            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-stone-600">
                              {TYPE_LABEL[d.type]}
                            </span>
                            {status.tone !== "none" && (
                              <span
                                className={
                                  status.tone === "expired"
                                    ? "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800"
                                    : status.tone === "warn"
                                      ? "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                                      : "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                                }
                              >
                                {status.tone === "expired" && (
                                  <AlertTriangle className="mr-0.5 inline h-3 w-3" />
                                )}
                                {status.label}
                              </span>
                            )}
                          </div>
                          {d.description && (
                            <p className="mt-0.5 text-sm text-stone-500">
                              {d.description}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-stone-400">
                            Issued {fmtDate(d.issuedOn)} · Expires{" "}
                            {fmtDate(d.expiresOn)} · {fmtSize(d.fileSize)} ·{" "}
                            {d.fileName}
                            {d.uploadedBy ? ` · uploaded by ${d.uploadedBy}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 print:hidden">
                          <DeleteDocumentButton id={d.id} title={d.title} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <p className="mt-10 text-center text-xs text-stone-400">
        Tarte Kitchen — generated{" "}
        {new Date().toLocaleString("en-AU", {
          timeZone: "Australia/Sydney",
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>
    </div>
  )
}

function LiveTile({
  href,
  label,
  value,
  Icon,
  subtitle,
}: {
  href: string
  label: string
  value: number | null
  Icon: typeof FileText
  subtitle?: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-stone-200 bg-white p-3 shadow-sm transition hover:border-emerald-400 hover:shadow"
    >
      <div className="flex items-center gap-2 text-stone-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      {value !== null ? (
        <div className="mt-1 text-2xl font-semibold text-stone-900">
          {value}
        </div>
      ) : (
        <div className="mt-1 text-base font-semibold text-stone-900">
          {subtitle ?? "Open →"}
        </div>
      )}
      {subtitle && value !== null && (
        <div className="mt-0.5 text-xs text-stone-500">{subtitle}</div>
      )}
    </Link>
  )
}

