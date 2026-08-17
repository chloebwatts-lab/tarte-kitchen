import type { OrderDept } from "@/generated/prisma/client"

/**
 * Ordering departments. Each department has its own order form in staff
 * tools; the department head approves it at close and the approved lines
 * from every department are regrouped by supplier into one order each.
 *
 * The split is Chloe's (2026-08-17):
 *   Kitchen  — meat, dairy, pantry, spices, oils, savoury frozen, fresh
 *              fruit & veg, and cleaning & chemicals
 *   Pastry   — baking, nuts, chocolate
 *   Coffee & bar — beverages, barista milk, alcohol
 *   Front of house — packaging, takeaway, disposables, and juice-bar style
 *              frozen product (ice cream, acai, frozen fruit)
 */
export const ORDER_DEPTS = [
  "KITCHEN",
  "PASTRY",
  "COFFEE_BAR",
  "FRONT_OF_HOUSE",
] as const satisfies readonly OrderDept[]

export const DEPT_LABEL: Record<OrderDept, string> = {
  KITCHEN: "Kitchen",
  PASTRY: "Pastry",
  COFFEE_BAR: "Coffee & bar",
  FRONT_OF_HOUSE: "Front of house",
}

/** One line, shown on the department card so staff pick the right form. */
export const DEPT_BLURB: Record<OrderDept, string> = {
  KITCHEN:
    "Meat, dairy, pantry, spices, oils, frozen, fruit & veg, cleaning & chemicals",
  PASTRY: "Baking, flour, chocolate, nuts",
  COFFEE_BAR: "Coffee, tea, milk, juice, soft drink, alcohol",
  FRONT_OF_HOUSE:
    "Packaging, takeaway, disposables, ice cream, acai, frozen fruit",
}

/** Card accent, reusing the kitchen palette tokens. */
export const DEPT_COLOR: Record<OrderDept, { bg: string; fg: string }> = {
  KITCHEN: { bg: "var(--tk-sage-soft)", fg: "var(--tk-sage)" },
  PASTRY: { bg: "var(--tk-gold-soft)", fg: "#8a6d1f" },
  COFFEE_BAR: { bg: "var(--tk-charcoal-soft)", fg: "var(--tk-charcoal)" },
  FRONT_OF_HOUSE: { bg: "var(--tk-done-soft)", fg: "var(--tk-done)" },
}

export function isOrderDept(v: string | null | undefined): v is OrderDept {
  return (
    v === "KITCHEN" ||
    v === "PASTRY" ||
    v === "COFFEE_BAR" ||
    v === "FRONT_OF_HOUSE"
  )
}

/** URL slug ↔ enum, so the route reads /kitchen/order/coffee-bar. */
export const DEPT_SLUG: Record<OrderDept, string> = {
  KITCHEN: "kitchen",
  PASTRY: "pastry",
  COFFEE_BAR: "coffee-bar",
  FRONT_OF_HOUSE: "front-of-house",
}

export function deptFromSlug(slug: string): OrderDept | null {
  const hit = ORDER_DEPTS.find((d) => DEPT_SLUG[d] === slug)
  return hit ?? null
}

// ─── Default department for an item ─────────────────────────────────────────
// ApprovedSupplierItem.dept is the truth once someone sets it in admin. Until
// then we infer from the supplier form's own category, with two name-level
// splits that category alone can't express:
//   • Frozen splits by what it is — savoury frozen is Kitchen, juice-bar
//     frozen (ice cream, acai, frozen fruit) is Front of house.
//   • Dairy splits by use — barista/drinking milk is Coffee & bar, cooking
//     dairy (butter, cream, cheese) is Kitchen.

const CATEGORY_DEPT: Record<string, OrderDept> = {
  meat: "KITCHEN",
  dairy: "KITCHEN",
  pantry: "KITCHEN",
  spices: "KITCHEN",
  oils: "KITCHEN",
  cleaning: "KITCHEN",
  produce: "KITCHEN",
  "fruit & veg": "KITCHEN",
  frozen: "KITCHEN",
  "pastry/baking": "PASTRY",
  baking: "PASTRY",
  nuts: "PASTRY",
  chocolate: "PASTRY",
  beverages: "COFFEE_BAR",
  coffee: "COFFEE_BAR",
  alcohol: "COFFEE_BAR",
  packaging: "FRONT_OF_HOUSE",
  disposables: "FRONT_OF_HOUSE",
}

/** Juice-bar style frozen product, ordered by front of house. */
const FOH_FROZEN =
  /ice ?cream|gelato|sorbet|a[cç]a[ií]|frozen fruit|frozen berr|berries|berry|mango cheek|smoothie|juice|banana|dragon ?fruit|pitaya|coconut chunk/i

/**
 * Drinking milk for the coffee machine, as opposed to cooking dairy.
 *
 * Deliberately narrow. Matching bare alt-milk words instead ("oat",
 * "almond", "soy") sent Goat Feta and flaked almonds to the bar, so the
 * name has to actually say milk or barista.
 */
const BAR_MILK = /\bmilk\b|\bmylk\b|barista|bonsoy/i
const COOKING_MILK = /powder|condensed|evaporated|buttermilk|coconut milk|milk solid/i

export function defaultDeptForItem(item: {
  category?: string | null
  name?: string | null
}): OrderDept {
  const name = item.name ?? ""
  const category = (item.category ?? "").trim().toLowerCase()

  if (category === "frozen" && FOH_FROZEN.test(name)) return "FRONT_OF_HOUSE"
  if (
    category === "dairy" &&
    BAR_MILK.test(name) &&
    !COOKING_MILK.test(name)
  ) {
    return "COFFEE_BAR"
  }
  // Alt milks show up under Pantry or Beverages on some forms.
  if (BAR_MILK.test(name) && !COOKING_MILK.test(name) && category !== "dairy") {
    return "COFFEE_BAR"
  }

  return CATEGORY_DEPT[category] ?? "KITCHEN"
}

/** Item's department: explicit assignment wins, else the category default. */
export function deptForItem(item: {
  dept?: OrderDept | null
  category?: string | null
  name?: string | null
}): OrderDept {
  return item.dept ?? defaultDeptForItem(item)
}
