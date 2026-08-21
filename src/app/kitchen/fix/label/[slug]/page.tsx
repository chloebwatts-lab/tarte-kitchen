export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { CheckCircle2, Printer, Wrench } from "lucide-react"
import { db } from "@/lib/db"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { PrintButton } from "@/components/print-button"
import { VENUE_SHORT_LABEL } from "@/lib/venues"

const BASE_URL = "https://kitchen.tarte.com.au"

/**
 * Single-machine QR label, staff-accessible (the admin /maintenance/labels
 * sheet needs an office login). Doubles as the success screen after the
 * quick-add form (?new=1). Prints one A4 page with three copies of the
 * label — laminate or clear-tape, spares live in the drawer.
 */
export default async function StaffLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const isNew = sp.new === "1"

  const asset = await db.maintenanceAsset.findUnique({
    where: { slug: slug.toUpperCase() },
  })
  if (!asset) notFound()

  const svg = await QRCode.toString(`${BASE_URL}/kitchen/fix/${asset.slug}`, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "H", // survives kitchen grime + partial damage
  })

  const labelCard = (
    <div className="flex break-inside-avoid flex-col items-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-5 text-center">
      <div className="text-[15px] font-bold uppercase tracking-wide text-black">
        Broken? Scan me
      </div>
      <div
        className="my-3 w-full max-w-[170px] [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="text-lg font-black tracking-widest text-black">{asset.slug}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-tight text-gray-600">{asset.name}</div>
      <div className="text-[10px] text-gray-400">
        {VENUE_SHORT_LABEL[asset.venue]} · {asset.location}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <KitchenBreadcrumb
          crumbs={[
            { label: "Staff tools", href: "/staffaccess" },
            { label: "Maintenance", href: "/kitchen/fix" },
            { label: `${asset.slug} label` },
          ]}
        />
      </div>

      {isNew && (
        <div className="flex items-start gap-3 rounded-2xl bg-[var(--tk-done-soft)] p-5 print:hidden">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--tk-done)]" />
          <div className="text-[16px] leading-snug text-[var(--tk-charcoal)]">
            <b>
              {asset.name} is on the register as {asset.slug}.
            </b>{" "}
            Print this label, laminate it (or use clear packing tape) and stick it
            on the machine at eye level. Scanning it opens the machine&apos;s fix page.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 print:hidden">
        <div>
          <div className="tk-caps text-[13px] text-[var(--tk-ink-mute)]">QR sticker</div>
          <div
            className="tk-display leading-none text-[var(--tk-charcoal)]"
            style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em" }}
          >
            {asset.slug} · {asset.name}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/kitchen/fix/${asset.slug}`}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--tk-line)] px-4 py-2.5 text-[15px] font-semibold text-[var(--tk-ink)]"
          >
            <Wrench className="h-4 w-4" /> Machine page
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* Three copies per sheet: one for the machine, two spares. */}
      <div className="grid max-w-xl grid-cols-1 gap-4 print:max-w-none print:grid-cols-3 print:gap-3">
        {labelCard}
        <div className="hidden print:block">{labelCard}</div>
        <div className="hidden print:block">{labelCard}</div>
      </div>

      <p className="max-w-xl text-[14px] leading-snug text-[var(--tk-ink-soft)] print:hidden">
        <Printer className="mr-1 inline h-4 w-4 -translate-y-[1px]" />
        The printed page has three copies, spares live in the office drawer. No
        printer nearby? The label is also on the office sheet at
        Maintenance → Print QR labels.
      </p>
    </div>
  )
}
