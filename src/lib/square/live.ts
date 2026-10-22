/**
 * Live day view from Square for the Sales insights page: fetches orders and
 * payments, resolves catalogue categories and team member names through the
 * DB caches, and returns a DayBreakdown. Cached in memory for 2 minutes per
 * venue/day so a floor full of phones does not hammer Square.
 */
import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { fetchDayOrders, listPayments, type SquareOrder, type SquarePayment } from "./client"
import { squareAccessFor } from "./token"
import { computeDayBreakdown, type DayBreakdown } from "./breakdown"
import { computeUpsell, type UpsellRow, type UnassignedModifier } from "@/lib/sales/upsell"
import { loadGroups } from "./upsell-store"

const SQUARE_API = "https://connect.squareup.com/v2"
const SQUARE_VERSION = "2025-07-16"

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Square-Version": SQUARE_VERSION, "Content-Type": "application/json" }
}

// ─── Catalogue cache ────────────────────────────────────────────────────────

type CatalogInfo = { itemName?: string; reportingCategory?: string }

/**
 * Resolve variation ids to item name + reporting category. Unknown ids are
 * fetched from Square in one batch (with related items), category names via
 * a category listing, then written to SquareCatalogItem for next time.
 */
export async function resolveCatalog(token: string, variationIds: string[]): Promise<Map<string, CatalogInfo>> {
  const ids = [...new Set(variationIds.filter(Boolean))]
  const out = new Map<string, CatalogInfo>()
  if (!ids.length) return out
  const cached = await db.squareCatalogItem.findMany({ where: { variationId: { in: ids } } })
  for (const c of cached) out.set(c.variationId, { itemName: c.itemName, reportingCategory: c.reportingCategory ?? undefined })
  const missing = ids.filter((id) => !out.has(id))
  if (!missing.length) return out

  // Categories: id -> name (one listing, paginated).
  const catNames = new Map<string, string>()
  let cursor: string | undefined
  do {
    const u = new URL(`${SQUARE_API}/catalog/list`)
    u.searchParams.set("types", "CATEGORY")
    if (cursor) u.searchParams.set("cursor", cursor)
    const res = await fetch(u, { headers: headers(token) })
    if (!res.ok) break
    const data = (await res.json()) as { objects?: Array<{ id: string; category_data?: { name?: string } }>; cursor?: string }
    for (const o of data.objects ?? []) if (o.category_data?.name) catNames.set(o.id, o.category_data.name)
    cursor = data.cursor
  } while (cursor)

  for (let i = 0; i < missing.length; i += 500) {
    const chunk = missing.slice(i, i + 500)
    const res = await fetch(`${SQUARE_API}/catalog/batch-retrieve`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({ object_ids: chunk, include_related_objects: true, include_deleted_objects: true }),
    })
    if (!res.ok) continue
    const data = (await res.json()) as {
      objects?: Array<{ id: string; type: string; item_variation_data?: { item_id?: string; name?: string } }>
      related_objects?: Array<{ id: string; type: string; item_data?: { name?: string; reporting_category?: { id?: string }; categories?: Array<{ id: string }> } }>
    }
    const items = new Map((data.related_objects ?? []).filter((o) => o.type === "ITEM").map((o) => [o.id, o]))
    for (const v of data.objects ?? []) {
      if (v.type !== "ITEM_VARIATION") continue
      const item = v.item_variation_data?.item_id ? items.get(v.item_variation_data.item_id) : undefined
      const catId = item?.item_data?.reporting_category?.id ?? item?.item_data?.categories?.[0]?.id
      const info: CatalogInfo = { itemName: item?.item_data?.name ?? v.item_variation_data?.name ?? "Item", reportingCategory: catId ? catNames.get(catId) : undefined }
      out.set(v.id, info)
      await db.squareCatalogItem.upsert({
        where: { variationId: v.id },
        update: { itemId: v.item_variation_data?.item_id ?? null, itemName: info.itemName ?? "Item", variationName: v.item_variation_data?.name ?? null, reportingCategory: info.reportingCategory ?? null },
        create: { variationId: v.id, itemId: v.item_variation_data?.item_id ?? null, itemName: info.itemName ?? "Item", variationName: v.item_variation_data?.name ?? null, reportingCategory: info.reportingCategory ?? null },
      })
    }
  }
  return out
}

// ─── Modifier cache ─────────────────────────────────────────────────────────

/**
 * Resolve order modifier ids to their modifier list name ("Food Sides").
 * Unknown ids are fetched in one batch with their related MODIFIER_LIST
 * objects and written to SquareCatalogModifier for next time.
 */
export async function resolveModifiers(token: string, modifierIds: string[]): Promise<Map<string, string | undefined>> {
  const ids = [...new Set(modifierIds.filter(Boolean))]
  const out = new Map<string, string | undefined>()
  if (!ids.length) return out
  const cached = await db.squareCatalogModifier.findMany({ where: { modifierId: { in: ids } } })
  for (const c of cached) out.set(c.modifierId, c.modifierListName ?? undefined)
  const missing = ids.filter((id) => !out.has(id))
  for (let i = 0; i < missing.length; i += 500) {
    const chunk = missing.slice(i, i + 500)
    const res = await fetch(`${SQUARE_API}/catalog/batch-retrieve`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({ object_ids: chunk, include_related_objects: true, include_deleted_objects: true }),
    })
    if (!res.ok) continue
    const data = (await res.json()) as {
      objects?: Array<{ id: string; type: string; modifier_data?: { name?: string; modifier_list_id?: string } }>
      related_objects?: Array<{ id: string; type: string; modifier_list_data?: { name?: string } }>
    }
    const lists = new Map((data.related_objects ?? []).filter((o) => o.type === "MODIFIER_LIST").map((o) => [o.id, o.modifier_list_data?.name]))
    // Lists Square did not send alongside: fetch them by id.
    const wantLists = [...new Set((data.objects ?? []).map((m) => m.modifier_data?.modifier_list_id ?? "").filter((id) => id && !lists.has(id)))]
    if (wantLists.length) {
      const lr = await fetch(`${SQUARE_API}/catalog/batch-retrieve`, {
        method: "POST", headers: headers(token),
        body: JSON.stringify({ object_ids: wantLists, include_deleted_objects: true }),
      })
      if (lr.ok) {
        const ld = (await lr.json()) as { objects?: Array<{ id: string; type: string; modifier_list_data?: { name?: string } }> }
        for (const l of ld.objects ?? []) if (l.type === "MODIFIER_LIST") lists.set(l.id, l.modifier_list_data?.name)
      }
    }
    for (const m of data.objects ?? []) {
      if (m.type !== "MODIFIER") continue
      const listId = m.modifier_data?.modifier_list_id
      const listName = listId ? lists.get(listId) : undefined
      out.set(m.id, listName)
      await db.squareCatalogModifier.upsert({
        where: { modifierId: m.id },
        update: { name: m.modifier_data?.name ?? "Modifier", modifierListId: listId ?? null, modifierListName: listName ?? null },
        create: { modifierId: m.id, name: m.modifier_data?.name ?? "Modifier", modifierListId: listId ?? null, modifierListName: listName ?? null },
      })
    }
  }
  return out
}

/** Every modifier id on the orders' line items. */
export function modifierIdsOf(orders: SquareOrder[]): string[] {
  return orders.flatMap((o) => (o.line_items ?? []).flatMap((l) => (l.modifiers ?? []).map((m) => m.catalog_object_id ?? ""))).filter(Boolean)
}

// ─── Team cache ─────────────────────────────────────────────────────────────

export async function resolveTeam(token: string, ids: string[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter(Boolean))]
  const out = new Map<string, string>()
  if (!want.length) return out
  const cached = await db.squareTeamMember.findMany({ where: { id: { in: want } } })
  for (const c of cached) out.set(c.id, c.name)
  const missing = want.filter((id) => !out.has(id))
  if (!missing.length) return out
  // Square has no bulk lookup that takes ids, so one GET per unknown member;
  // the cache means this only happens the first time someone takes a payment.
  for (const id of missing.slice(0, 60)) {
    try {
      const res = await fetch(`${SQUARE_API}/team-members/${encodeURIComponent(id)}`, { headers: headers(token) })
      if (!res.ok) continue
      const data = (await res.json()) as { team_member?: { id: string; given_name?: string; family_name?: string } }
      const m = data.team_member
      if (!m) continue
      const name = [m.given_name, m.family_name].filter(Boolean).join(" ").trim() || "Team member"
      out.set(m.id, name)
      await db.squareTeamMember.upsert({ where: { id: m.id }, update: { name }, create: { id: m.id, name } })
    } catch (err) {
      console.error("[square] team member lookup", id, err)
    }
  }
  return out
}

// ─── Day fetch ──────────────────────────────────────────────────────────────

export interface LiveDay {
  breakdown: DayBreakdown
  upsell: { rows: UpsellRow[]; unassigned: UnassignedModifier[] }
  fetchedAt: string
  orders: SquareOrder[]
  payments: SquarePayment[]
}

const cache = new Map<string, { at: number; value: LiveDay }>()
const TTL_MS = 20 * 1000

export async function fetchLiveDay(venue: Venue, dateStr: string, opts: { force?: boolean } = {}): Promise<LiveDay | null> {
  const key = `${venue}|${dateStr}`
  const hit = cache.get(key)
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.value
  const access = await squareAccessFor(venue)
  if (!access) return null
  const { locationId, token } = access
  const [{ sales, openUnpaid }, payments] = await Promise.all([
    fetchDayOrders(token, locationId, dateStr),
    listPayments(token, locationId, dateStr),
  ])
  const orders = [...sales, ...openUnpaid]
  const variationIds = orders.flatMap((o) => (o.line_items ?? []).map((l) => l.catalog_object_id ?? "")).filter(Boolean)
  const teamIds = [
    ...(payments as Array<SquarePayment & { team_member_id?: string }>).map((p) => p.team_member_id ?? ""),
    ...(orders as Array<SquareOrder & { created_by_team_member_id?: string }>).map((o) => o.created_by_team_member_id ?? ""),
  ].filter(Boolean)
  const [catalog, team, groups, modLists] = await Promise.all([resolveCatalog(token, variationIds), resolveTeam(token, teamIds), loadGroups(), resolveModifiers(token, modifierIdsOf(orders))])
  const breakdown = computeDayBreakdown(dateStr, orders, payments, (id) => (id ? catalog.get(id) : undefined), (id) => (id ? team.get(id) : undefined), null, (id) => (id ? modLists.get(id) : undefined))
  const upsell = computeUpsell(orders, payments, (id) => (id ? catalog.get(id)?.reportingCategory : undefined), (id) => (id ? team.get(id) : undefined), groups)
  const value: LiveDay = { breakdown, upsell, fetchedAt: new Date().toISOString(), orders, payments }
  cache.set(key, { at: Date.now(), value })
  return value
}

/** Write a day's hourly, channel and surcharge figures (used by the sync). */
export async function persistDayBreakdown(venue: Venue, dateStr: string, b: DayBreakdown) {
  const date = new Date(dateStr)
  await db.hourlySales.deleteMany({ where: { date, venue, source: "SQUARE" } })
  const rows = b.hourly.map((v, hour) => ({ date, venue, hour, revenueIncGst: v, orders: b.hourlyOrders[hour], source: "SQUARE" })).filter((r) => r.revenueIncGst !== 0 || r.orders !== 0)
  if (rows.length) {
    // Replace any ESTIMATE/LIGHTSPEED rows for the same hours too (Square is the truth from cutover).
    await db.hourlySales.deleteMany({ where: { date, venue } })
    await db.hourlySales.createMany({ data: rows })
  }
  await db.dailyChannelSales.deleteMany({ where: { date, venue } })
  const ch = Object.entries(b.channels).filter(([, v]) => v.orders > 0 || v.sales !== 0)
  if (ch.length) {
    await db.dailyChannelSales.createMany({ data: ch.map(([channel, v]) => ({ date, venue, channel, revenueIncGst: v.sales, orders: v.orders, source: "SQUARE" })) })
  }
  await db.dailySalesSummary.updateMany({ where: { date, venue }, data: { surchargeIncGst: b.surchargeIncGst } })
  // Per staff per channel, one transaction so a failed insert keeps the old rows.
  const staffRows = b.staffChannels.filter((s) => s.orders > 0).map((s) => ({ date, venue, teamMemberId: s.id, staffName: s.name, channel: s.channel, salesIncGst: s.sales, orders: s.orders }))
  await db.$transaction([
    db.dailyStaffSales.deleteMany({ where: { date, venue } }),
    ...(staffRows.length ? [db.dailyStaffSales.createMany({ data: staffRows, skipDuplicates: true })] : []),
  ])
}
