export const dynamic = "force-dynamic"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { db } from "@/lib/db"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { CommitmentPhotoSheet } from "@/components/kitchen/CommitmentPhotoSheet"
import {
  addDays,
  currentWeekStart,
  ymd,
  COMMITMENTS_EPOCH,
} from "@/lib/commitments/weeks"
import { weekRangeLabel } from "@/lib/commitments/shared"
import type { CommitmentPhotoRow } from "@/lib/actions/commitments"

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Kiosk page for photographing paper sheets (weekly update, issue +
 * solution, fault report) into a Mon-anchored week. Defaults to the
 * current week; arrows step through past weeks back to the reset
 * meeting.
 */
export default async function CommitmentPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const thisWeek = currentWeekStart()
  const weekParam = typeof sp.week === "string" ? sp.week : null
  const week =
    weekParam &&
    YMD_RE.test(weekParam) &&
    weekParam >= COMMITMENTS_EPOCH &&
    weekParam <= thisWeek
      ? weekParam
      : thisWeek

  const prevWeek = ymd(addDays(new Date(week), -7))
  const nextWeek = ymd(addDays(new Date(week), 7))
  const hasPrev = prevWeek >= COMMITMENTS_EPOCH
  const hasNext = nextWeek <= thisWeek

  const photos = await db.commitmentWeekPhoto.findMany({
    where: { weekStart: new Date(week) },
    orderBy: { uploadedAt: "desc" },
  })
  const rows: CommitmentPhotoRow[] = photos.map((p) => ({
    id: p.id,
    weekStart: ymd(p.weekStart),
    kind: p.kind,
    url: p.url,
    caption: p.caption,
    uploadedBy: p.uploadedBy,
    uploadedAt: p.uploadedAt.toISOString(),
  }))

  return (
    <div className="space-y-8">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Said + Done", href: "/kitchen/commitments" },
          { label: "Paper sheets" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Paper sheets
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Working on paper is fine. Photograph the sheet and it&apos;s filed
          against the week so nothing gets lost.
        </p>
      </div>

      {/* Week stepper */}
      <div className="flex items-center justify-between rounded-[16px] border border-[var(--tk-line)] bg-white px-3 py-3">
        {hasPrev ? (
          <Link
            href={`/kitchen/commitments/photos?week=${prevWeek}`}
            replace
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition active:scale-95"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        ) : (
          <div className="h-11 w-11" />
        )}
        <div className="text-center">
          <div className="text-[17px] font-bold text-[var(--tk-charcoal)]">
            Week of {weekRangeLabel(week)}
          </div>
          {week === thisWeek && (
            <div className="text-[12px] font-semibold text-[var(--tk-ink-mute)]">
              This week
            </div>
          )}
        </div>
        {hasNext ? (
          <Link
            href={`/kitchen/commitments/photos?week=${nextWeek}`}
            replace
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition active:scale-95"
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
        ) : (
          <div className="h-11 w-11" />
        )}
      </div>

      <CommitmentPhotoSheet weekStart={week} photos={rows} />
    </div>
  )
}
