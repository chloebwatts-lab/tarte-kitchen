export const dynamic = "force-dynamic"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listSuppliersWithForms } from "@/lib/actions/supplier-order"

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"]

export default async function NewOrderLandingPage() {
  const suppliers = await listSuppliersWithForms()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a supplier. You&apos;ll see every item on their order form
          with a suggested quantity (from par or recent invoices), and you
          can send the order straight from the page.
        </p>
      </div>

      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No suppliers have an order form set up yet. Add items to a
            supplier on the <Link href="/suppliers" className="underline">Suppliers</Link>{" "}
            page first.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <Link
              key={s.id}
              href={`/orders/new/${s.id}`}
              className="group rounded-md border bg-card p-4 transition hover:border-foreground/40 hover:shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold tracking-tight">{s.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {s.itemCount} item{s.itemCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                {s.deliveryDays.length === 0 ? (
                  <span>No delivery days set</span>
                ) : (
                  <>
                    {DAY_LETTERS.map((letter, idx) => {
                      const dayNum = idx === 0 ? 7 : idx // ISO 1=Mon..7=Sun
                      const active = s.deliveryDays.includes(dayNum)
                      return (
                        <span
                          key={idx}
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] " +
                            (active
                              ? "bg-foreground text-background"
                              : "border border-muted text-muted-foreground/70")
                          }
                        >
                          {letter}
                        </span>
                      )
                    })}
                  </>
                )}
              </div>
              {s.email && (
                <p className="mt-2 truncate text-xs text-muted-foreground">{s.email}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
