import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { DEFAULT_GROUPS, type GroupDef, type UpsellRow } from "@/lib/sales/upsell"

/** Active upsell groups; seeds the defaults the first time. */
export async function loadGroups(): Promise<GroupDef[]> {
  let rows = await db.upsellGroup.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] })
  if (rows.length === 0 && (await db.upsellGroup.count()) === 0) {
    await db.upsellGroup.createMany({
      data: DEFAULT_GROUPS.map((g) => ({
        key: g.key, label: g.label, blurb: g.blurb ?? null, itemNames: g.itemNames, itemCategories: g.itemCategories,
        modifierNames: g.modifierNames, baseCategories: g.baseCategories, channel: g.channel ?? null, sortOrder: g.sortOrder ?? 0,
      })),
      skipDuplicates: true,
    })
    rows = await db.upsellGroup.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] })
  }
  return rows.map((r) => ({
    key: r.key, label: r.label, blurb: r.blurb, itemNames: r.itemNames, itemCategories: r.itemCategories,
    modifierNames: r.modifierNames, baseCategories: r.baseCategories, channel: r.channel, sortOrder: r.sortOrder,
  }))
}

/**
 * Replace a venue-day's upsell rows. One transaction: if the insert fails
 * the old rows stay (on 5 Oct 2026 a failed insert after the delete left
 * the day's challenge empty until the next sync).
 */
export async function persistUpsell(venue: Venue, dateStr: string, rows: UpsellRow[]) {
  const date = new Date(dateStr)
  const data = rows.map((r) => ({
    date, venue, teamMemberId: r.teamMemberId, staffName: r.staffName, groupKey: r.groupKey,
    eligibleOrders: r.eligibleOrders, ordersWith: r.ordersWith, units: r.units, salesIncGst: r.sales,
    breakdown: r.breakdown ?? {},
  }))
  await db.$transaction([
    db.dailyStaffUpsell.deleteMany({ where: { date, venue } }),
    ...(data.length ? [db.dailyStaffUpsell.createMany({ data, skipDuplicates: true })] : []),
  ])
}
