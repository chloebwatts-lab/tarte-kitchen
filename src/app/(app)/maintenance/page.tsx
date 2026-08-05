export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { MaintenanceDashboard } from "@/components/maintenance-dashboard"

export default async function MaintenancePage() {
  const [assets, openIssues, contactCount] = await Promise.all([
    db.maintenanceAsset.findMany({
      orderBy: [{ location: "asc" }, { name: "asc" }],
      include: {
        issues: { select: { id: true, status: true } },
      },
    }),
    db.maintenanceIssue.findMany({
      where: { status: "OPEN" },
      orderBy: [{ isSafety: "desc" }, { createdAt: "asc" }],
      include: {
        asset: { select: { slug: true, name: true, photoUrl: true } },
        contact: { select: { name: true } },
      },
    }),
    db.maintenanceContact.count(),
  ])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Maintenance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Staff report faults by scanning the QR sticker on each machine.
          Click any row to open that machine&apos;s page.
        </p>
      </header>
      <MaintenanceDashboard
        contactCount={contactCount}
        assets={assets.map((a) => ({
          id: a.id,
          slug: a.slug,
          venue: a.venue,
          location: a.location,
          name: a.name,
          category: a.category,
          status: a.status,
          manufacturer: a.manufacturer,
          model: a.model,
          serial: a.serial,
          photoUrl: a.photoUrl,
          purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString() : null,
          warrantyMonths: a.warrantyMonths,
          warrantyProvider: a.warrantyProvider,
          issueCount: a.issues.length,
          openIssueCount: a.issues.filter((i) => i.status === "OPEN").length,
        }))}
        openIssues={openIssues.map((i) => ({
          id: i.id,
          title: i.title,
          legacyRef: i.legacyRef,
          isSafety: i.isSafety,
          createdAt: i.createdAt.toISOString(),
          reportedBy: i.reportedBy,
          venue: i.venue,
          contactName: i.contact?.name ?? null,
          assetSlug: i.asset?.slug ?? null,
          assetName: i.asset?.name ?? null,
          assetPhotoUrl: i.asset?.photoUrl ?? null,
        }))}
      />
    </div>
  )
}
