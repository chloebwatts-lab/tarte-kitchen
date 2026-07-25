export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle, ExternalLink, Printer, ShieldCheck, Users } from "lucide-react"
import { getMaintenanceOverview } from "@/lib/actions/maintenance"
import { warrantyEndDate } from "@/lib/maintenance/constants"
import { VENUE_SHORT_LABEL } from "@/lib/venues"

function fmt(d: Date | null) {
  return d
    ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "—"
}

export default async function MaintenancePage() {
  const { openIssues, assets, contacts } = await getMaintenanceOverview()

  const active = assets.filter((a) => a.status === "ACTIVE")
  const underWarranty = active.filter((a) => {
    const end = warrantyEndDate(a)
    return end && end.getTime() > Date.now()
  })
  const missingPlate = active.filter((a) => !a.manufacturer || !a.serial)

  return (
    <div className="container max-w-6xl py-6 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Maintenance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {active.length} active machines · {openIssues.length} open issues ·{" "}
            {underWarranty.length} under warranty. Staff report via QR stickers →{" "}
            <span className="font-mono">/kitchen/fix</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/maintenance/contacts"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Users className="h-4 w-4" /> Contacts ({contacts.length})
          </Link>
          <Link
            href="/maintenance/labels"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Printer className="h-4 w-4" /> Print QR labels
          </Link>
        </div>
      </header>

      {/* Open issues */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Open issues</h2>
        {openIssues.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing open. Enjoy it while it lasts.</p>
        ) : (
          <div className="space-y-2">
            {openIssues.map((i) => (
              <div
                key={i.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
                  i.isSafety ? "border-red-300 bg-red-50" : ""
                }`}
              >
                {i.isSafety && <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {i.title}
                    {i.legacyRef && (
                      <span className="ml-2 text-xs text-muted-foreground">{i.legacyRef}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {i.asset ? (
                      <Link className="underline" href={`/kitchen/fix/${i.asset.slug}`}>
                        {i.asset.name}
                      </Link>
                    ) : (
                      VENUE_SHORT_LABEL[i.venue]
                    )}{" "}
                    · reported {fmt(i.createdAt)}
                    {i.reportedBy ? ` by ${i.reportedBy}` : ""}
                    {i.contact ? ` · trade: ${i.contact.name}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Warranty positions */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Under warranty</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Machine</th>
                <th className="p-2">Venue</th>
                <th className="p-2">Purchased</th>
                <th className="p-2">Warranty ends</th>
                <th className="p-2">Claim via</th>
              </tr>
            </thead>
            <tbody>
              {underWarranty.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">
                    <Link className="font-medium underline-offset-2 hover:underline" href={`/kitchen/fix/${a.slug}`}>
                      {a.name}
                    </Link>
                  </td>
                  <td className="p-2">{VENUE_SHORT_LABEL[a.venue]}</td>
                  <td className="p-2">{fmt(a.purchaseDate)}</td>
                  <td className="p-2 font-medium text-green-700">
                    <ShieldCheck className="mr-1 inline h-4 w-4" />
                    {fmt(warrantyEndDate(a))}
                  </td>
                  <td className="p-2">{a.warrantyProvider ?? "—"}</td>
                </tr>
              ))}
              {underWarranty.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={5}>
                    No machines with a recorded warranty still running — add purchase
                    dates + warranty terms below to light this up.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Full register */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">Asset register</h2>
        {missingPlate.length > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            {missingPlate.length} machines are missing manufacturer or serial — worth a
            5-minute walk-around with the phone.
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Code</th>
                <th className="p-2">Machine</th>
                <th className="p-2">Venue · location</th>
                <th className="p-2">Make / model</th>
                <th className="p-2">Serial</th>
                <th className="p-2">Repairs</th>
                <th className="p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className={`border-t ${a.status === "RETIRED" ? "opacity-50" : ""}`}>
                  <td className="p-2 font-mono text-xs">{a.slug}</td>
                  <td className="p-2 font-medium">{a.name}</td>
                  <td className="p-2 text-muted-foreground">
                    {VENUE_SHORT_LABEL[a.venue]} · {a.location}
                  </td>
                  <td className="p-2">{[a.manufacturer, a.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="p-2 font-mono text-xs">{a.serial ?? "—"}</td>
                  <td className="p-2">{a._count.issues || ""}</td>
                  <td className="p-2">{a.status === "RETIRED" ? "Retired" : "Active"}</td>
                  <td className="p-2">
                    <Link
                      href={`/kitchen/fix/${a.slug}`}
                      className="text-muted-foreground hover:text-foreground"
                      title="Open staff page"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
