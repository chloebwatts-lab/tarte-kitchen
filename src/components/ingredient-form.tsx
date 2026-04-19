"use client"

import { useState, useMemo, useCallback, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

import { createIngredient, updateIngredient } from "@/lib/actions/ingredients"
import { AllergenPicker } from "@/components/allergen-picker"
import type { Allergen } from "@/generated/prisma"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  id: string
  name: string
}

interface Ingredient {
  id: string
  name: string
  category: string
  baseUnitType: string
  supplierId: string | null
  supplier: { id: string; name: string } | null
  supplierProductCode: string | null
  purchaseQuantity: number
  purchaseUnit: string
  purchasePrice: number
  baseUnitsPerPurchase: number
  gramsPerUnit: number | null
  wastePercentage: number
  parLevel: number | null
  parUnit: string | null
  notes: string | null
  allergens?: Allergen[]
  createdAt: Date | string
  updatedAt: Date | string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: "MEAT", label: "Meat" },
  { value: "SEAFOOD", label: "Seafood" },
  { value: "DAIRY", label: "Dairy" },
  { value: "CHEESE", label: "Cheese" },
  { value: "VEGETABLE", label: "Vegetable" },
  { value: "FRUIT", label: "Fruit" },
  { value: "HERB", label: "Herb" },
  { value: "MUSHROOM", label: "Mushroom" },
  { value: "SPICE", label: "Spice" },
  { value: "DRY_GOOD", label: "Dry Good" },
  { value: "GRAIN", label: "Grain" },
  { value: "FLOUR", label: "Flour" },
  { value: "OIL", label: "Oil" },
  { value: "VINEGAR", label: "Vinegar" },
  { value: "BREAD", label: "Bread" },
  { value: "BAKERY", label: "Bakery" },
  { value: "EGG", label: "Egg" },
  { value: "CONDIMENT", label: "Condiment" },
  { value: "FROZEN", label: "Frozen" },
  { value: "SALAD", label: "Salad" },
  { value: "OTHER", label: "Other" },
]

const BASE_UNIT_TYPES = [
  { value: "WEIGHT", label: "Weight (grams)" },
  { value: "VOLUME", label: "Volume (millilitres)" },
  { value: "COUNT", label: "Count (each)" },
]

const PURCHASE_UNITS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  WEIGHT: [
    { value: "g", label: "g (grams)" },
    { value: "kg", label: "kg (kilograms)" },
    { value: "oz", label: "oz (ounces)" },
    { value: "lb", label: "lb (pounds)" },
    { value: "bag", label: "bag" },
    { value: "box", label: "box" },
    { value: "packet", label: "packet" },
    { value: "case", label: "case" },
    { value: "tub", label: "tub" },
  ],
  VOLUME: [
    { value: "ml", label: "ml (millilitres)" },
    { value: "cl", label: "cl (centilitres)" },
    { value: "l", label: "l (litres)" },
    { value: "bottle", label: "bottle" },
    { value: "carton", label: "carton" },
    { value: "tub", label: "tub" },
  ],
  COUNT: [
    { value: "ea", label: "each" },
    { value: "dozen", label: "dozen" },
    { value: "box", label: "box" },
    { value: "bag", label: "bag" },
    { value: "bunch", label: "bunch" },
    { value: "packet", label: "packet" },
    { value: "case", label: "case" },
  ],
}

const BASE_UNIT_LABELS: Record<string, string> = {
  WEIGHT: "g",
  VOLUME: "ml",
  COUNT: "ea",
}

// Unit-to-base conversion factors (for auto-calculating baseUnitsPerPurchase)
const UNIT_TO_BASE: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  ml: 1,
  cl: 10,
  l: 1000,
  ea: 1,
  dozen: 12,
}

// ---------------------------------------------------------------------------
// Auto-calculate base units per purchase
// ---------------------------------------------------------------------------

function autoCalcBaseUnits(
  purchaseQuantity: number,
  purchaseUnit: string
): number | null {
  const factor = UNIT_TO_BASE[purchaseUnit.toLowerCase()]
  if (factor == null) return null
  return purchaseQuantity * factor
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IngredientFormProps {
  ingredient?: Ingredient
  suppliers: Supplier[]
  onSuccess?: () => void
}

export function IngredientForm({ ingredient, suppliers, onSuccess }: IngredientFormProps) {
  const isEditing = !!ingredient
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [baseUnitType, setBaseUnitType] = useState("WEIGHT")
  const [supplierId, setSupplierId] = useState("")
  const [supplierProductCode, setSupplierProductCode] = useState("")
  const [purchaseQuantity, setPurchaseQuantity] = useState("")
  const [purchaseUnit, setPurchaseUnit] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [baseUnitsPerPurchase, setBaseUnitsPerPurchase] = useState("")
  const [baseUnitsManuallySet, setBaseUnitsManuallySet] = useState(false)
  const [gramsPerUnit, setGramsPerUnit] = useState("")
  const [wastePercentage, setWastePercentage] = useState("")
  const [notes, setNotes] = useState("")
  const [allergens, setAllergens] = useState<Allergen[]>([])
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (ingredient) {
        setName(ingredient.name)
        setCategory(ingredient.category)
        setBaseUnitType(ingredient.baseUnitType)
        setSupplierId(ingredient.supplierId || "")
        setSupplierProductCode(ingredient.supplierProductCode || "")
        setPurchaseQuantity(String(ingredient.purchaseQuantity))
        setPurchaseUnit(ingredient.purchaseUnit)
        setPurchasePrice(String(ingredient.purchasePrice))
        setBaseUnitsPerPurchase(String(ingredient.baseUnitsPerPurchase))
        setBaseUnitsManuallySet(true)
        setGramsPerUnit(ingredient.gramsPerUnit != null ? String(ingredient.gramsPerUnit) : "")
        setWastePercentage(String(ingredient.wastePercentage))
        setNotes(ingredient.notes || "")
        setAllergens(ingredient.allergens ?? [])
      } else {
        setName("")
        setCategory("")
        setBaseUnitType("WEIGHT")
        setSupplierId("")
        setSupplierProductCode("")
        setPurchaseQuantity("")
        setPurchaseUnit("")
        setPurchasePrice("")
        setBaseUnitsPerPurchase("")
        setBaseUnitsManuallySet(false)
        setGramsPerUnit("")
        setWastePercentage("")
        setNotes("")
        setAllergens([])
      }
      setError(null)
    }
  }, [open, ingredient])

  // Auto-calculate baseUnitsPerPurchase
  useEffect(() => {
    if (baseUnitsManuallySet) return
    const qty = Number(purchaseQuantity)
    if (!qty || !purchaseUnit) return
    const calc = autoCalcBaseUnits(qty, purchaseUnit)
    if (calc != null) {
      setBaseUnitsPerPurchase(String(calc))
    }
  }, [purchaseQuantity, purchaseUnit, baseUnitsManuallySet])

  // Set default purchase unit when baseUnitType changes
  useEffect(() => {
    const units = PURCHASE_UNITS_BY_TYPE[baseUnitType]
    if (units && !purchaseUnit) {
      // Don't auto-set if editing
      if (!isEditing) {
        setPurchaseUnit(units[0].value)
      }
    }
  }, [baseUnitType, isEditing, purchaseUnit])

  // Calculated costs
  const costCalc = useMemo(() => {
    const price = Number(purchasePrice)
    const base = Number(baseUnitsPerPurchase)
    const waste = Number(wastePercentage) || 0

    if (!price || !base) return null

    const costPerUnit = price / base
    const wasteFactor = 1 - waste / 100
    const usable = base * wasteFactor
    const costPerUsableUnit = usable > 0 ? price / usable : 0
    const unitLabel = BASE_UNIT_LABELS[baseUnitType] || "unit"

    return { costPerUnit, costPerUsableUnit, unitLabel }
  }, [purchasePrice, baseUnitsPerPurchase, wastePercentage, baseUnitType])

  // Submit
  const handleSubmit = useCallback(async () => {
    setError(null)

    if (!name.trim()) {
      setError("Name is required")
      return
    }
    if (!category) {
      setError("Category is required")
      return
    }
    if (!purchaseUnit) {
      setError("Purchase unit is required")
      return
    }
    if (!purchasePrice || Number(purchasePrice) <= 0) {
      setError("Purchase price must be greater than 0")
      return
    }
    if (!baseUnitsPerPurchase || Number(baseUnitsPerPurchase) <= 0) {
      setError("Base units per purchase must be greater than 0")
      return
    }

    const data = {
      name: name.trim(),
      category,
      baseUnitType,
      supplierId: supplierId || null,
      supplierProductCode: supplierProductCode.trim() || null,
      purchaseQuantity: Number(purchaseQuantity) || 1,
      purchaseUnit,
      purchasePrice: Number(purchasePrice),
      baseUnitsPerPurchase: Number(baseUnitsPerPurchase),
      gramsPerUnit: gramsPerUnit && Number(gramsPerUnit) > 0 ? Number(gramsPerUnit) : null,
      wastePercentage: Number(wastePercentage) || 0,
      notes: notes.trim() || null,
      allergens,
    }

    startTransition(async () => {
      try {
        if (isEditing) {
          await updateIngredient(ingredient.id, data)
        } else {
          await createIngredient(data)
        }
        setOpen(false)
        router.refresh()
        onSuccess?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    })
  }, [
    name, category, baseUnitType, supplierId, supplierProductCode,
    purchaseQuantity, purchaseUnit, purchasePrice, baseUnitsPerPurchase,
    gramsPerUnit, wastePercentage, notes, allergens, isEditing, ingredient, router, onSuccess,
  ])

  const purchaseUnits = PURCHASE_UNITS_BY_TYPE[baseUnitType] || PURCHASE_UNITS_BY_TYPE.WEIGHT

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditing ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Ingredient
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update ingredient details and pricing."
              : "Add a new ingredient to your kitchen inventory."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="ing-name">Name</Label>
            <Input
              id="ing-name"
              placeholder="e.g. Striploin, Sourdough, Vanilla Extract"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Category + Base Unit Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base Unit Type</Label>
              <Select
                value={baseUnitType}
                onValueChange={(val) => {
                  setBaseUnitType(val)
                  setPurchaseUnit("")
                  setBaseUnitsManuallySet(false)
                  setBaseUnitsPerPurchase("")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASE_UNIT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Supplier */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ing-code">Supplier Product Code</Label>
              <Input
                id="ing-code"
                placeholder="Optional"
                value={supplierProductCode}
                onChange={(e) => setSupplierProductCode(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Purchase details */}
          <div>
            <p className="text-sm font-medium mb-3">Purchase Details</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ing-qty">Quantity</Label>
                <Input
                  id="ing-qty"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1"
                  value={purchaseQuantity}
                  onChange={(e) => {
                    setPurchaseQuantity(e.target.value)
                    setBaseUnitsManuallySet(false)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={purchaseUnit}
                  onValueChange={(val) => {
                    setPurchaseUnit(val)
                    setBaseUnitsManuallySet(false)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseUnits.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ing-price">Price ($)</Label>
                <Input
                  id="ing-price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Base units */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="ing-base">
                Base units per purchase ({BASE_UNIT_LABELS[baseUnitType] || "unit"})
              </Label>
              {!baseUnitsManuallySet && baseUnitsPerPurchase && (
                <span className="text-[11px] text-muted-foreground">auto-calculated</span>
              )}
            </div>
            <Input
              id="ing-base"
              type="number"
              min="0"
              step="any"
              placeholder={`e.g. 1000 for 1kg = 1000${BASE_UNIT_LABELS[baseUnitType]}`}
              value={baseUnitsPerPurchase}
              onChange={(e) => {
                setBaseUnitsPerPurchase(e.target.value)
                setBaseUnitsManuallySet(true)
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              How many {BASE_UNIT_LABELS[baseUnitType] || "units"} you get from one purchase.
              {baseUnitType === "WEIGHT" && " e.g. 1 kg = 1000g, 15 dozen = 180ea"}
              {baseUnitType === "VOLUME" && " e.g. 1 l = 1000ml"}
              {baseUnitType === "COUNT" && " e.g. 1 dozen = 12ea"}
            </p>
          </div>

          {/* Grams per unit — COUNT ingredients only */}
          {baseUnitType === "COUNT" && (
            <div className="space-y-2">
              <Label htmlFor="ing-gpu">
                Grams per unit
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="ing-gpu"
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 200 for avocado, 300 for cos lettuce"
                value={gramsPerUnit}
                onChange={(e) => setGramsPerUnit(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Set this when recipes measure this ingredient by weight (g/kg). Enables correct
                cost calculation — e.g. avocado 1&nbsp;ea&nbsp;≈&nbsp;200g means 180g costs
                (180÷200)&nbsp;×&nbsp;price instead of 180&nbsp;×&nbsp;price.
              </p>
            </div>
          )}

          {/* Waste */}
          <div className="space-y-2">
            <Label htmlFor="ing-waste">Waste / Trim %</Label>
            <Input
              id="ing-waste"
              type="number"
              min="0"
              max="100"
              step="0.5"
              placeholder="0"
              value={wastePercentage}
              onChange={(e) => setWastePercentage(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Percentage lost to trimming, peeling, or bones. A 38% waste on striploin means you
              only use 62% of what you buy.
            </p>
          </div>

          {/* Allergens */}
          <div className="space-y-2">
            <Label>Allergens</Label>
            <AllergenPicker value={allergens} onChange={setAllergens} />
            <p className="text-[11px] text-muted-foreground">
              Declared allergens (FSANZ 1.2.3). Rolls up to any preparation
              and dish that uses this ingredient, including printable recipe
              cards.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="ing-notes">Notes</Label>
            <Textarea
              id="ing-notes"
              placeholder="Seasonal availability, handling notes, alternatives..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Cost summary */}
          {costCalc && (
            <>
              <Separator />
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cost Summary
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Cost per {costCalc.unitLabel}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      ${costCalc.costPerUnit < 0.01 && costCalc.costPerUnit > 0
                        ? costCalc.costPerUnit.toFixed(4)
                        : costCalc.costPerUnit.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Cost per usable {costCalc.unitLabel}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      ${costCalc.costPerUsableUnit < 0.01 && costCalc.costPerUsableUnit > 0
                        ? costCalc.costPerUsableUnit.toFixed(4)
                        : costCalc.costPerUsableUnit.toFixed(2)}
                      {Number(wastePercentage) > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (after {wastePercentage}% waste)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save Changes"
                : "Create Ingredient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
