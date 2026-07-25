export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound } from "next/navigation"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { FixAssetTriage } from "@/components/kitchen/FixAssetTriage"
import { getFixAsset } from "@/lib/actions/maintenance"

export default async function FixAssetPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getFixAsset(slug)
  if (!data) notFound()

  const { asset, symptoms, suggestedContacts, warrantyContact, warrantyEnd } = data
  const venueLabel = asset.venue === "BURLEIGH" ? "Burleigh" : "Beach House"

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: "Something broken?", href: `/kitchen/fix?venue=${asset.venue}` },
          { label: asset.slug },
        ]}
      />

      <FixAssetTriage
        asset={{
          slug: asset.slug,
          name: asset.name,
          venueLabel,
          location: asset.location,
          category: asset.category,
          manufacturer: asset.manufacturer,
          model: asset.model,
          serial: asset.serial,
          year: asset.year,
          photoUrl: asset.photoUrl,
          status: asset.status,
          notes: asset.notes,
          supplier: asset.supplier,
          warrantyProvider: asset.warrantyProvider,
          warrantyNotes: asset.warrantyNotes,
          warrantyEnd: warrantyEnd ? warrantyEnd.toISOString() : null,
        }}
        errorCodes={(asset.errorCodes as { code: string; meaning: string; action: string }[] | null) ?? []}
        symptoms={symptoms}
        suggestedContacts={suggestedContacts.map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company,
          phone: c.phone,
          notes: c.notes,
        }))}
        warrantyContact={
          warrantyContact
            ? {
                id: warrantyContact.id,
                name: warrantyContact.name,
                company: warrantyContact.company,
                phone: warrantyContact.phone,
                notes: warrantyContact.notes,
              }
            : null
        }
        issues={asset.issues.map((i) => ({
          id: i.id,
          ref: i.legacyRef,
          title: i.title,
          description: i.description,
          status: i.status,
          isSafety: i.isSafety,
          reportedBy: i.reportedBy,
          createdAt: i.createdAt.toISOString(),
          fixedAt: i.fixedAt ? i.fixedAt.toISOString() : null,
          fixedBy: i.fixedBy,
          fixSummary: i.fixSummary,
          wasWarranty: i.wasWarranty,
          costCents: i.costCents,
          contactName: i.contact?.name ?? null,
          events: i.events.map((e) => ({
            author: e.author,
            body: e.body,
            at: e.createdAt.toISOString(),
          })),
        }))}
      />

      <div className="pb-8 text-center text-[13px] text-[var(--tk-ink-mute)]">
        Wrong machine?{" "}
        <Link href={`/kitchen/fix?venue=${asset.venue}`} className="underline">
          Pick from the list
        </Link>
      </div>
    </div>
  )
}
