export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  CheckCircle2,
  Clock,
  Truck,
  ShoppingCart,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  listSupplierOrderCards,
  type SupplierOrderCard,
} from "@/lib/actions/order-checklist"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma"

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"]

function VenuePicker({ active }: { active: Venue }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {SINGLE_VENUES.map((v) => (
        <Link
          key={v}
          href={`/order-checklists?venue=${v}`}
          className={
            "px-3 py-1.5 text-sm " +
            (v === active
              ? "bg-foreground text-background"
              : "bg-card hover:bg-muted")
          }
        >
          {VENUE_SHORT_LABEL[v]}
        </Link>
      ))}
    </div>
  )
}

function SupplierCard({ s, venue }: { s: SupplierOrderCard; venue: Venue }) {
  const draft = s.todayDraft
  const isSent = draft?.status === "SUBMITTED"

  let statusBadge
  if (isSent) {
    statusBadge = (
      <Badge variant="green" className="gap-1 text-[10px]">
        <CheckCircle2 className="h-3 w-3" />
        Sent
      </Badge>
    )
  } else if (draft) {
    statusBadge = (
      <Badge variant="amber" className="gap-1 text-[10px]">
        <Clock className="h-3 w-3" />
        {draft.lineCount} items · ${draft.total.toFixed(0)}
      </Badge>
    )
  } else {
    statusBadge = (
      <Badge variant="outline" className="text-[10px]">
        Not started
      </Badge>
    )
  }

  const href = draft
    ? `/order-checklists/${s.supplierId}?venue=${venue}`
    : `/order-checklists/${s.supplierId}?venue=${venue}`

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">{s.supplierName}</div>
            <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
              <span>{s.itemCount} items on form</span>
              {s.supplierEmail && <span>· {s.supplierEmail}</span>}
            </div>
          </div>
          {statusBadge}
        </div>

        {/* Delivery days strip */}
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Truck className="h-3 w-3" />
          {s.deliveryDays.length === 0 ? (
            <span>No delivery days set</span>
          ) : (
            <span className="flex gap-1">
              {DAY_LETTERS.map((letter, idx) => {
                const dayNum = idx === 0 ? 7 : idx // ISO 1=Mon..7=Sun
                const active = s.deliveryDays.includes(dayNum)
                return (
                  <span
                    key={idx}
                    className={
                      "inline-flex h-4 w-4 items-center justify-center rounded text-[9px] " +
                      (active
                        ? "bg-foreground text-background"
                        : "border border-muted text-muted-foreground/70")
                    }
                  >
                    {letter}
                  </span>
                )
              })}
            </span>
          )}
        </div>

        <div className="mt-3">
          <Link
            href={href}
            className={
              "block w-full rounded-md px-3 py-2 text-center text-sm font-medium " +
              (isSent
                ? "border border-border bg-card text-foreground hover:bg-muted/50"
                : draft
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border bg-card text-foreground hover:bg-muted/50")
            }
          >
            {isSent ? "View sent order" : draft ? "Continue order" : "Start order"}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function OrderChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>
}) {
  const { venue: venueParam } = await searchParams
  const VALID_VENUES = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN", "BOTH"] as const
  const venue: Venue = (VALID_VENUES as readonly string[]).includes(venueParam ?? "")
    ? (venueParam as Venue)
    : "BURLEIGH"
  const cards = await listSupplierOrderCards(venue)

  const withDraft = cards.filter((c) => c.todayDraft)
  const notStarted = cards.filter((c) => !c.todayDraft)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Order Checklists</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Digital order forms — pick a supplier, tick what you need, send.
            Drafts auto-save so you can come back to them mid-shift.
          </p>
        </div>
        <VenuePicker active={venue} />
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border py-14 text-center">
          <ShoppingCart className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No suppliers have an order form set up yet.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* In-progress drafts */}
          {withDraft.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                In progress · today
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {withDraft.map((s) => (
                  <SupplierCard key={s.supplierId} s={s} venue={venue} />
                ))}
              </div>
            </section>
          )}

          {/* Not started */}
          {notStarted.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Suppliers — no order today yet
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {notStarted.map((s) => (
                  <SupplierCard key={s.supplierId} s={s} venue={venue} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
