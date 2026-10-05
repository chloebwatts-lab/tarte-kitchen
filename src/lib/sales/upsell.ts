/**
 * Upsell tracking: which orders carried a side / coffee extra / pastry with
 * coffee / drink with food, and who rang them. Pure; fed by the same Square
 * orders + payments as the day breakdown.
 *
 * Groups match on item and modifier NAMES exactly as Square sends them
 * (case-insensitive, trailing full stop ignored), so nothing needs changing
 * in Square. Sides at Tarte are mostly modifiers on a dish ("Bacon" on Eggs
 * Your Way), with a few standalone items (Fries).
 */
import { cents, cleanItemName, isPaidOrder, type SquareOrder, type SquarePayment } from "@/lib/square/client"
import { channelForDevice, type Channel } from "@/lib/square/breakdown"

export interface GroupDef {
  key: string
  label: string
  blurb?: string | null
  itemNames: string[]
  itemCategories: string[]
  modifierNames: string[]
  /** Orders are eligible (the attach denominator) when they hold an item in one of these reporting categories. Empty = every order. */
  baseCategories: string[]
  channel?: string | null
  sortOrder?: number
}

const FOOD = ["Cafe Food", "Restaurant Food", "Restaurant Starters"]
const COFFEE = ["Cafe Coffee & Tea", "Restaurant Coffee & Tea", "COFFEE - TG"]

export const DEFAULT_GROUPS: GroupDef[] = [
  {
    key: "sides",
    label: "Sides",
    blurb: "Add-ons on a dish and standalone sides. Eligible orders are those with a food item.",
    itemNames: [
      "Fries", "Side Fries", "Toast - 2 Slices", "Sourdough Starter",
      "Avocado Side", "Bacon Side", "Brisket Side", "Broccolini Side", "Halloumi Side", "Mushroom Side", "Poached Chicken Side", "Salmon Side",
    ],
    itemCategories: [],
    modifierNames: [
      "Bacon", "Potato Hash", "Avo", "Poached Egg", "Fried egg", "Mushrooms", "Halloumi", "Smoked Salmon", "Poached Chicken",
      "1/2 Scramble", "Full Scramble", "Side Fries", "Sautéed Greens", "Roti", "Side Salad", "Burrata", "Prosciutto",
      "Tomato - Sliced", "Extra Toast", "Sourdough Starter", "Ice Cream", "Brisket", "Broccolini", "Salmon", "Wagyu",
    ],
    baseCategories: FOOD,
    sortOrder: 1,
  },
  {
    key: "coffee_extras",
    label: "Coffee extras",
    blurb: "Extra shots, syrups and cold foam. Alt milks and decaf are not counted (a need, not an upsell).",
    itemNames: [],
    itemCategories: [],
    modifierNames: ["Extra Shot", "Caramel", "Vanilla", "Hazelnut", "Honey", "Maple", "Cold Foam - Creme Brulee", "Cold Foam - Vanilla", "Cold Foam - Dulce de Leche"],
    baseCategories: COFFEE,
    sortOrder: 2,
  },
  {
    key: "pastry_with_coffee",
    label: "Pastry with coffee",
    blurb: "Coffee orders that also took a pastry.",
    itemNames: [],
    itemCategories: ["Pastries", "PASTRIES - TG"],
    modifierNames: [],
    baseCategories: COFFEE,
    channel: "CAFE",
    sortOrder: 3,
  },
  {
    key: "drinks_with_food",
    label: "Drinks with food",
    blurb: "Restaurant food orders: drinks sold per order (coffee, juice, soft, wine, beer, cocktails).",
    itemNames: [],
    itemCategories: ["Restaurant Drinks", "Restaurant Wine & Beer", "Restaurant Cocktails", "Restaurant Coffee & Tea", "Juice Bar", "Cafe Alcohol", "Cafe Coffee & Tea"],
    modifierNames: [],
    baseCategories: ["Restaurant Food", "Restaurant Starters"],
    channel: "RESTAURANT",
    sortOrder: 4,
  },
]

export const ONLINE_ID = "ONLINE"

export interface UpsellRow {
  teamMemberId: string
  staffName: string
  groupKey: string
  eligibleOrders: number
  ordersWith: number
  units: number
  sales: number
}
export interface UnassignedModifier { name: string; units: number; sales: number }

export const normName = (s: string | undefined | null) => cleanItemName(s ?? undefined).toLowerCase()

interface ModifierLike { name?: string; quantity?: string; base_price_money?: { amount?: number }; total_price_money?: { amount?: number } }
interface LineLike { name?: string; quantity?: string; catalog_object_id?: string; item_type?: string; total_money?: { amount?: number }; modifiers?: ModifierLike[] }
interface OrderLike extends SquareOrder { source?: { name?: string }; created_by_team_member_id?: string }

export function computeUpsell(
  orders: SquareOrder[],
  payments: SquarePayment[],
  categoryOf: (variationId: string | undefined) => string | undefined,
  nameOf: (teamMemberId: string | undefined) => string | undefined,
  groups: GroupDef[]
): { rows: UpsellRow[]; unassigned: UnassignedModifier[] } {
  const payByOrder = new Map<string, { device?: string; teamMemberId?: string }>()
  for (const p of payments as Array<SquarePayment & { order_id?: string; device_details?: { device_name?: string }; team_member_id?: string }>) {
    if (p.status && p.status !== "COMPLETED") continue
    if (p.order_id && !payByOrder.has(p.order_id)) payByOrder.set(p.order_id, { device: p.device_details?.device_name, teamMemberId: p.team_member_id })
  }
  const sets = groups.map((g) => ({
    g,
    items: new Set(g.itemNames.map(normName)),
    cats: new Set(g.itemCategories.map((c) => c.toLowerCase())),
    mods: new Set(g.modifierNames.map(normName)),
    base: new Set(g.baseCategories.map((c) => c.toLowerCase())),
  }))
  const allMods = new Set(sets.flatMap((s) => [...s.mods]))
  const foodBase = new Set(FOOD.map((c) => c.toLowerCase()))

  const acc = new Map<string, UpsellRow>()
  const unassigned = new Map<string, UnassignedModifier>()
  const seen = new Set<string>()

  for (const raw of orders) {
    if (seen.has(raw.id)) continue
    seen.add(raw.id)
    const o = raw as OrderLike
    if (!(o.state === "COMPLETED" || isPaidOrder(o))) continue
    const lines = (o.line_items ?? []) as LineLike[]
    if (!lines.length) continue
    const pay = payByOrder.get(o.id)
    const channel: Channel = channelForDevice(pay?.device, o.source?.name)
    const staffId = channel === "ONLINE" ? ONLINE_ID : (o.created_by_team_member_id ?? pay?.teamMemberId ?? ONLINE_ID)
    const staffName = staffId === ONLINE_ID ? "Bopple / no staff member" : (nameOf(staffId) ?? "Team member")
    const lineCats = lines.map((l) => (categoryOf(l.catalog_object_id) ?? "").toLowerCase())

    for (const s of sets) {
      if (s.g.channel && s.g.channel !== channel && staffId !== ONLINE_ID) continue
      if (s.g.channel && staffId === ONLINE_ID) continue
      const eligible = s.base.size === 0 || lineCats.some((c) => s.base.has(c))
      if (!eligible) continue
      let units = 0, sales = 0
      lines.forEach((li, i) => {
        if (li.item_type && li.item_type !== "ITEM") return
        const qty = Math.round(parseFloat(li.quantity ?? "1")) || 0
        if (s.items.has(normName(li.name)) || (lineCats[i] && s.cats.has(lineCats[i]))) {
          units += qty
          sales += cents(li.total_money).toNumber()
        }
        for (const m of li.modifiers ?? []) {
          if (!s.mods.has(normName(m.name))) continue
          const mq = (Math.round(parseFloat(m.quantity ?? "1")) || 1) * qty
          units += mq
          sales += m.total_price_money ? cents(m.total_price_money).toNumber() : cents(m.base_price_money).toNumber() * mq
        }
      })
      const k = `${staffId}|${s.g.key}`
      const row = acc.get(k) ?? { teamMemberId: staffId, staffName, groupKey: s.g.key, eligibleOrders: 0, ordersWith: 0, units: 0, sales: 0 }
      row.eligibleOrders++
      if (units > 0) row.ordersWith++
      row.units += units
      row.sales += sales
      acc.set(k, row)
    }

    // Paid add-ons on food that no group counts yet: suggestions for the Sides list.
    lines.forEach((li, i) => {
      if (!foodBase.has(lineCats[i])) return
      const qty = Math.round(parseFloat(li.quantity ?? "1")) || 0
      for (const m of li.modifiers ?? []) {
        const price = m.total_price_money ? cents(m.total_price_money).toNumber() : cents(m.base_price_money).toNumber()
        if (price < 2 || allMods.has(normName(m.name))) continue
        const name = cleanItemName(m.name)
        const u = unassigned.get(name) ?? { name, units: 0, sales: 0 }
        u.units += (Math.round(parseFloat(m.quantity ?? "1")) || 1) * qty
        u.sales += price
        unassigned.set(name, u)
      }
    })
  }

  return {
    rows: [...acc.values()].map((r) => ({ ...r, sales: Math.round(r.sales * 100) / 100 })),
    unassigned: [...unassigned.values()].map((u) => ({ ...u, sales: Math.round(u.sales * 100) / 100 })).sort((a, b) => b.units - a.units),
  }
}

// ─── Leaderboards ───────────────────────────────────────────────────────────

export type Metric = "UNITS" | "ATTACH" | "SALES"

export interface BoardRow {
  teamMemberId: string
  staffName: string
  eligibleOrders: number
  ordersWith: number
  units: number
  sales: number
  attachPct: number | null
  per100: number | null
  rank: number | null
}

/** Attach-rate rankings ignore anyone with fewer eligible orders than this. */
export const MIN_ORDERS_FOR_ATTACH = 10

export function sumRows(rows: Array<Omit<UpsellRow, "groupKey">>): Map<string, Omit<UpsellRow, "groupKey">> {
  const by = new Map<string, Omit<UpsellRow, "groupKey">>()
  for (const r of rows) {
    const a = by.get(r.teamMemberId) ?? { teamMemberId: r.teamMemberId, staffName: r.staffName, eligibleOrders: 0, ordersWith: 0, units: 0, sales: 0 }
    a.eligibleOrders += r.eligibleOrders; a.ordersWith += r.ordersWith; a.units += r.units; a.sales += r.sales
    a.staffName = r.staffName || a.staffName
    by.set(r.teamMemberId, a)
  }
  return by
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)

export function leaderboard(rows: Array<Omit<UpsellRow, "groupKey">>, metric: Metric): { board: BoardRow[]; team: BoardRow } {
  const by = sumRows(rows)
  const all = [...by.values()]
  const mk = (r: Omit<UpsellRow, "groupKey">): BoardRow => ({
    ...r, sales: Math.round(r.sales * 100) / 100,
    attachPct: pct(r.ordersWith, r.eligibleOrders),
    per100: r.eligibleOrders > 0 ? Math.round((r.units / r.eligibleOrders) * 1000) / 10 : null,
    rank: null,
  })
  const people = all.filter((r) => r.teamMemberId !== ONLINE_ID).map(mk)
  const score = (r: BoardRow) => (metric === "UNITS" ? r.units : metric === "SALES" ? r.sales : r.eligibleOrders >= MIN_ORDERS_FOR_ATTACH ? (r.attachPct ?? -1) : -1)
  people.sort((a, b) => score(b) - score(a) || b.units - a.units || a.staffName.localeCompare(b.staffName))
  let rank = 0
  for (const p of people) { if (score(p) > 0 || (metric !== "ATTACH" && score(p) === 0 && p.units > 0)) { rank++; p.rank = rank } }
  const t = all.reduce((s, r) => ({ ...s, eligibleOrders: s.eligibleOrders + r.eligibleOrders, ordersWith: s.ordersWith + r.ordersWith, units: s.units + r.units, sales: s.sales + r.sales }),
    { teamMemberId: "TEAM", staffName: "Whole team", eligibleOrders: 0, ordersWith: 0, units: 0, sales: 0 })
  return { board: people, team: mk(t) }
}
