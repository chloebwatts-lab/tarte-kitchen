import { getSuppliers } from "@/lib/actions/suppliers"
import { SuppliersContent } from "@/components/suppliers-content"

export default async function SuppliersPage() {
  const suppliers = await getSuppliers()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <SuppliersContent suppliers={suppliers} />
    </div>
  )
}
