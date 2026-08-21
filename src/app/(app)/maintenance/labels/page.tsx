export const dynamic = "force-dynamic"

import Link from "next/link"
import QRCode from "qrcode"
import { ArrowLeft } from "lucide-react"
import { db } from "@/lib/db"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import { PrintButton } from "@/components/print-button"

const BASE_URL = "https://kitchen.tarte.com.au"

export default async function MaintenanceLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venue =
    sp.venue === "BURLEIGH" || sp.venue === "BEACH_HOUSE" ? sp.venue : undefined
  const slug = typeof sp.slug === "string" ? sp.slug.toUpperCase() : undefined

  const assets = await db.maintenanceAsset.findMany({
    where: { status: "ACTIVE", ...(venue ? { venue } : {}), ...(slug ? { slug } : {}) },
    orderBy: [{ venue: "asc" }, { location: "asc" }, { name: "asc" }],
  })

  // Auto-created (email sweep) and staff-added machines get a NEW flash for
  // a month so the next label print run can't miss them.
  // eslint-disable-next-line react-hooks/purity -- server component, evaluated per request
  const newCutoff = Date.now() - 30 * 86400000

  const labels = await Promise.all(
    assets.map(async (a) => ({
      ...a,
      svg: await QRCode.toString(`${BASE_URL}/kitchen/fix/${a.slug}`, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "H", // survives kitchen grime + partial damage
      }),
    }))
  )

  return (
    <div className="container max-w-5xl py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link
            href="/maintenance"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Maintenance
          </Link>
          <h1 className="text-2xl font-semibold">QR labels</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Print on A4, laminate (or use clear packing tape), stick at eye level on
            each machine. Scanning opens that machine's fix page, no login, no app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/maintenance/labels"
            className={`rounded-md border px-3 py-1.5 text-sm ${!venue ? "bg-muted font-medium" : ""}`}
          >
            All
          </Link>
          <Link
            href="/maintenance/labels?venue=BURLEIGH"
            className={`rounded-md border px-3 py-1.5 text-sm ${venue === "BURLEIGH" ? "bg-muted font-medium" : ""}`}
          >
            Burleigh
          </Link>
          <Link
            href="/maintenance/labels?venue=BEACH_HOUSE"
            className={`rounded-md border px-3 py-1.5 text-sm ${venue === "BEACH_HOUSE" ? "bg-muted font-medium" : ""}`}
          >
            Beach House
          </Link>
          <PrintButton />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 print:grid-cols-3 print:gap-3">
        {labels.map((a) => (
          <div
            key={a.id}
            className="relative flex break-inside-avoid flex-col items-center rounded-xl border-2 border-dashed border-gray-300 p-4 text-center"
          >
            {a.createdAt.getTime() > newCutoff && (
              <span className="absolute right-2 top-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 print:hidden">
                new
              </span>
            )}
            <div className="text-[15px] font-bold uppercase tracking-wide">
              Broken? Scan me
            </div>
            <div
              className="my-3 w-full max-w-[150px] [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: a.svg }}
            />
            <div className="text-lg font-black tracking-widest">{a.slug}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-tight text-gray-600">
              {a.name}
            </div>
            <div className="text-[10px] text-gray-400">
              {VENUE_SHORT_LABEL[a.venue]} · {a.location}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
