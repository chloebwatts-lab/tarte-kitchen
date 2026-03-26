"use client"

import { useState } from "react"
import { Truck, Plus, Pencil, Trash2, Package } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { createSupplier, updateSupplier, deleteSupplier } from "@/lib/actions/suppliers"

interface Supplier {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  notes: string | null
  ingredientCount: number
}

export function SuppliersContent({ suppliers }: { suppliers: Supplier[] }) {
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Supplier</DialogTitle>
            </DialogHeader>
            <SupplierForm
              onSubmit={async (data) => {
                await createSupplier(data)
                setIsCreateOpen(false)
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Truck className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">No suppliers yet. Add your first supplier to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((supplier) => (
            <Card key={supplier.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <Truck className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">{supplier.name}</h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Package className="h-3 w-3" />
                        {supplier.ingredientCount} ingredient{supplier.ingredientCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingSupplier(supplier)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Supplier</DialogTitle>
                        </DialogHeader>
                        {editingSupplier && (
                          <SupplierForm
                            initialData={editingSupplier}
                            onSubmit={async (data) => {
                              await updateSupplier(editingSupplier.id, data)
                              setEditingSupplier(null)
                            }}
                          />
                        )}
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (supplier.ingredientCount > 0) {
                          alert(`Cannot delete ${supplier.name} — it has ${supplier.ingredientCount} ingredients assigned.`)
                          return
                        }
                        if (confirm(`Delete ${supplier.name}?`)) {
                          await deleteSupplier(supplier.id)
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {(supplier.contact || supplier.phone || supplier.email) && (
                  <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                    {supplier.contact && <p>{supplier.contact}</p>}
                    {supplier.phone && <p>{supplier.phone}</p>}
                    {supplier.email && <p>{supplier.email}</p>}
                  </div>
                )}

                {supplier.notes && (
                  <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-3">
                    {supplier.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function SupplierForm({
  initialData,
  onSubmit,
}: {
  initialData?: Supplier
  onSubmit: (data: { name: string; contact?: string; phone?: string; email?: string; notes?: string }) => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    try {
      await onSubmit({
        name: fd.get("name") as string,
        contact: (fd.get("contact") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        email: (fd.get("email") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" name="name" defaultValue={initialData?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact">Contact Person</Label>
        <Input id="contact" name="contact" defaultValue={initialData?.contact ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={initialData?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={initialData?.email ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={initialData?.notes ?? ""} rows={3} />
      </div>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  )
}
