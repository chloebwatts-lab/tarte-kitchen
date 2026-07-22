"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  setPrepStockItemActive,
  upsertPrepStockItem,
  type CatalogItem,
  type RestockReport,
} from "@/lib/actions/restock"
import { STATION_LABEL, STATION_SHORT_LABEL, VENUE_STATIONS } from "@/lib/stations"
import type { KitchenStation } from "@/generated/prisma"
import { Check, Loader2, Plus, Star } from "lucide-react"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

export function RestockAdminView({
  venue,
  items,
  report,
}: {
  venue: Venue
  items: CatalogItem[]
  report: RestockReport
}) {
  return (
    <Tabs defaultValue="report">
      <TabsList>
        <TabsTrigger value="report">Daily report</TabsTrigger>
        <TabsTrigger value="catalogue">Item catalogue</TabsTrigger>
      </TabsList>
      <TabsContent value="report" className="mt-4">
        <ReportTab venue={venue} report={report} />
      </TabsContent>
      <TabsContent value="catalogue" className="mt-4">
        <CatalogueTab venue={venue} items={items} />
      </TabsContent>
    </Tabs>
  )
}

// ------------------------------------------------------------------
// Daily report
// ------------------------------------------------------------------

function ReportTab({ venue, report }: { venue: Venue; report: RestockReport }) {
  const router = useRouter()

  function go(date: string) {
    router.push(`/restock?venue=${venue}&date=${date}`)
  }
  function shift(days: number) {
    const d = new Date(report.date)
    d.setUTCDate(d.getUTCDate() + days)
    go(d.toISOString().split("T")[0])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shift(-1)}>
            ← Prev
          </Button>
          <Input
            type="date"
            value={report.date}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" size="sm" onClick={() => shift(1)}>
            Next →
          </Button>
        </div>
        <div className="flex gap-2 text-sm text-muted-foreground">
          <span>{report.totals.itemsCounted} counted</span>
          <span>· {report.totals.itemsRequested} requested</span>
          <span
            className={
              report.totals.shortfalls.length > 0
                ? "font-medium text-red-600"
                : ""
            }
          >
            · {report.totals.shortfalls.length} shortfalls
          </span>
        </div>
      </div>

      {report.missingStations.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No count submitted for:{" "}
          {report.missingStations.map((s) => STATION_LABEL[s]).join(", ")}
        </div>
      )}

      {report.sheets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No counts were taken on this date.
          </CardContent>
        </Card>
      ) : (
        report.sheets.map((sheet) => (
          <Card key={sheet.sheetId}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span>{STATION_LABEL[sheet.station]}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {sheet.countedBy
                    ? `Counted by ${sheet.countedBy}`
                    : "Unsigned"}
                  {sheet.restockedBy
                    ? ` · restocked by ${sheet.restockedBy}`
                    : sheet.status === "SUBMITTED"
                      ? " · awaiting restock"
                      : sheet.status === "IN_PROGRESS"
                        ? " · in progress"
                        : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sheet.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing counted or requested.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3 text-right">Left at close</th>
                        <th className="py-2 pr-3 text-right">Requested</th>
                        <th className="py-2 pr-3 text-right">Supplied</th>
                        <th className="py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.lines.map((l, i) => {
                        const short =
                          (l.requested ?? 0) > 0 &&
                          sheet.status === "RESTOCKED" &&
                          (l.supplied == null || l.supplied < l.requested!)
                        return (
                          <tr key={`${l.name}-${i}`} className="border-b last:border-0">
                            <td className="py-2 pr-3">
                              <span className="inline-flex items-center gap-1.5">
                                {l.priority && (
                                  <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
                                )}
                                {l.name}
                                {l.unit && (
                                  <span className="text-xs text-muted-foreground">
                                    {l.unit}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                              {l.available ?? "—"}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {l.requested ?? "—"}
                            </td>
                            <td
                              className={`py-2 pr-3 text-right tabular-nums ${short ? "font-semibold text-red-600" : ""}`}
                            >
                              {l.supplied ?? (short ? 0 : "—")}
                            </td>
                            <td className="py-2 text-xs italic text-muted-foreground">
                              {l.note ?? ""}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Catalogue
// ------------------------------------------------------------------

function CatalogueTab({ venue, items }: { venue: Venue; items: CatalogItem[] }) {
  const stations = VENUE_STATIONS[venue]
  const [station, setStation] = useState<KitchenStation>(stations[0])
  const stationItems = useMemo(
    () => items.filter((i) => i.station === station),
    [items, station]
  )
  const categories = useMemo(() => {
    const map = new Map<string, CatalogItem[]>()
    for (const i of stationItems) {
      const arr = map.get(i.category) ?? []
      arr.push(i)
      map.set(i.category, arr)
    }
    // Same order as the kiosk count sheet: Station restock leads.
    const rank = (c: string) => (c === "Station restock" ? 0 : 1)
    return Array.from(map.entries()).sort(
      (a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])
    )
  }, [stationItems])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {stations.map((s) => (
          <Button
            key={s}
            variant={s === station ? "default" : "outline"}
            size="sm"
            onClick={() => setStation(s)}
          >
            {STATION_SHORT_LABEL[s]}
          </Button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">
          {stationItems.filter((i) => i.isActive).length} active items
        </span>
      </div>

      <AddItemRow venue={venue} station={station} />

      {categories.map(([category, catItems]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {catItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AddItemRow({
  venue,
  station,
}: {
  venue: Venue
  station: KitchenStation
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [unit, setUnit] = useState("")
  const [category, setCategory] = useState("Station restock")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (!name.trim()) return
    startTransition(async () => {
      const res = await upsertPrepStockItem({
        venue,
        station,
        name,
        unit: unit || null,
        category,
      })
      if (res.ok) {
        setName("")
        setUnit("")
        setError(null)
        router.refresh()
      } else {
        setError(res.error ?? "Couldn't add item")
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
      <Input
        placeholder="New item name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        className="w-56"
      />
      <Input
        placeholder="Unit (tub, bottle…)"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        className="w-36"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="h-9 rounded-md border bg-transparent px-2 text-sm"
      >
        <option>Station restock</option>
        <option>Daily prep</option>
      </select>
      <Button size="sm" onClick={add} disabled={pending || !name.trim()}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Add
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  )
}

function ItemRow({ item }: { item: CatalogItem }) {
  const router = useRouter()
  const [unit, setUnit] = useState(item.unit ?? "")
  const [par, setPar] = useState(item.parLevel == null ? "" : String(item.parLevel))
  const [dirty, setDirty] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const parsedPar = par.trim() === "" ? null : Number(par)
      await upsertPrepStockItem({
        id: item.id,
        venue: item.venue,
        station: item.station,
        name: item.name,
        unit: unit || null,
        category: item.category,
        parLevel:
          parsedPar != null && Number.isFinite(parsedPar) ? parsedPar : null,
        notes: item.notes,
        preparationId: item.preparationId,
      })
      setDirty(false)
      router.refresh()
    })
  }

  function toggleActive() {
    startTransition(async () => {
      await setPrepStockItemActive({ id: item.id, isActive: !item.isActive })
      router.refresh()
    })
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 ${item.isActive ? "" : "opacity-50"}`}
    >
      <span className="w-52 truncate text-sm font-medium">{item.name}</span>
      <Input
        value={unit}
        placeholder="unit"
        onChange={(e) => {
          setUnit(e.target.value)
          setDirty(true)
        }}
        className="h-8 w-28 text-sm"
      />
      <Input
        value={par}
        placeholder="par"
        inputMode="decimal"
        onChange={(e) => {
          setPar(e.target.value)
          setDirty(true)
        }}
        className="h-8 w-20 text-sm"
      />
      {item.preparationName && (
        <Badge variant="secondary" className="text-xs">
          recipe: {item.preparationName}
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <Button size="sm" variant="outline" onClick={save} disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleActive}
          disabled={pending}
          className="text-xs text-muted-foreground"
        >
          {item.isActive ? "Retire" : "Restore"}
        </Button>
      </div>
    </div>
  )
}
