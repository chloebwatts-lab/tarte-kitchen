"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Plus, Pencil, Trash2, Upload, Package } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  listApprovedItemsBySupplier,
  upsertApprovedItem,
  deleteApprovedItem,
  toggleApprovedItemActive,
  bulkImportApprovedItems,
  type ApprovedItemDTO,
} from "@/lib/actions/approved-supplier-items"

interface Supplier {
  id: string
  name: string
}

interface Props {
  suppliers: Supplier[]
}

export function SupplierOrderForms({ suppliers }: Props) {
  const [activeId, setActiveId] = useState<string>(suppliers[0]?.id ?? "")
  return (
    <Tabs value={activeId} onValueChange={setActiveId}>
      <TabsList className="flex-wrap">
        {suppliers.map((s) => (
          <TabsTrigger key={s.id} value={s.id}>
            {s.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {suppliers.map((s) => (
        <TabsContent key={s.id} value={s.id}>
          <SupplierFormTable supplier={s} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function SupplierFormTable({ supplier }: { supplier: Supplier }) {
  const [items, setItems] = useState<ApprovedItemDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState<ApprovedItemDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  const load = () => {
    setLoading(true)
    listApprovedItemsBySupplier(supplier.id).then((rows) => {
      setItems(rows)
      setLoading(false)
    })
  }

  useEffect(load, [supplier.id])

  const groups = useMemo(() => {
    const map = new Map<string, ApprovedItemDTO[]>()
    for (const it of items) {
      const key = it.category ?? "Uncategorised"
      const list = map.get(key) ?? []
      list.push(it)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"} on {supplier.name}&apos;s approved order form
          {items.filter((i) => !i.active).length > 0 &&
            ` (${items.filter((i) => !i.active).length} inactive)`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Bulk paste
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add item
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No items on {supplier.name}&apos;s form yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste the order form contents to seed it quickly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([category, rows]) => (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h3>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">Pack</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                      <th className="px-3 py-2 text-center font-medium">Active</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.name}</div>
                          {it.notes && (
                            <div className="text-xs text-muted-foreground">{it.notes}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {it.packSize ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          ${it.packPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Switch
                            checked={it.active}
                            onCheckedChange={(v) => {
                              startTransition(async () => {
                                await toggleApprovedItemActive(it.id, v)
                                load()
                              })
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(it)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (!confirm(`Delete ${it.name}?`)) return
                                startTransition(async () => {
                                  await deleteApprovedItem(it.id)
                                  load()
                                })
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <ItemDialog
          open={true}
          initial={editing ?? undefined}
          supplierId={supplier.id}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={load}
        />
      )}
      <BulkPasteDialog
        open={bulkOpen}
        supplierId={supplier.id}
        supplierName={supplier.name}
        onClose={() => setBulkOpen(false)}
        onSaved={load}
      />
    </div>
  )
}

function ItemDialog({
  open,
  initial,
  supplierId,
  onClose,
  onSaved,
}: {
  open: boolean
  initial?: ApprovedItemDTO
  supplierId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [packSize, setPackSize] = useState(initial?.packSize ?? "")
  const [packPrice, setPackPrice] = useState(initial?.packPrice.toString() ?? "")
  const [category, setCategory] = useState(initial?.category ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [saving, setSaving] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="name">Item</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="packSize">Pack</Label>
              <Input
                id="packSize"
                placeholder="e.g. 2kg"
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                inputMode="decimal"
                value={packPrice}
                onChange={(e) => setPackPrice(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cat">Category</Label>
            <Input
              id="cat"
              placeholder="e.g. Dairy"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !name || !packPrice}
            onClick={async () => {
              setSaving(true)
              await upsertApprovedItem({
                id: initial?.id,
                supplierId,
                name,
                packSize,
                packPrice: Number(packPrice),
                category,
                notes,
              })
              setSaving(false)
              onSaved()
              onClose()
            }}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BulkPasteDialog({
  open,
  supplierId,
  supplierName,
  onClose,
  onSaved,
}: {
  open: boolean
  supplierId: string
  supplierName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [raw, setRaw] = useState("")
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<number | null>(null)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk paste — {supplierName}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          One item per line. Tab- or comma-separated:{" "}
          <code>name, pack, price, category</code>. Lines starting with{" "}
          <code>#</code> are ignored.
        </p>
        <Textarea
          rows={14}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`SHREDDED TASTY CHEESE, 2kg, 14.50, Cheese\nPHILADELPHIA CREAM CHEESE, 12kg, 78.00, Cheese`}
        />
        {result !== null && (
          <Badge variant="green">Imported {result} item{result === 1 ? "" : "s"}</Badge>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={saving || raw.trim().length === 0}
            onClick={async () => {
              setSaving(true)
              const n = await bulkImportApprovedItems(supplierId, raw)
              setResult(n)
              setRaw("")
              setSaving(false)
              onSaved()
            }}
          >
            Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
