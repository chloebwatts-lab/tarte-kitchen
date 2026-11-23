import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { mayTrustDevice } from "@/lib/person-auth"
import { getPerson, isOwnerDevice, isOwnerSession } from "@/lib/person-session"
import { BURLEIGH_SALES_SETTING_KEY, isBurleighSalesPerson } from "@/lib/sales/burleigh-sales-access"
import { TIER_LANDING } from "@/lib/access/tiers"

/** Who may see Burleigh's basic daily sales (see burleigh-sales-access.ts). */
export async function mayOpenBurleighSales(): Promise<boolean> {
  if (await isOwnerSession()) return true
  if (await isOwnerDevice()) return true
  const person = await getPerson()
  if (!person) return false
  if (mayTrustDevice(person)) return true
  const row = await db.appSetting.findUnique({ where: { key: BURLEIGH_SALES_SETTING_KEY } })
  return isBurleighSalesPerson(row?.value, { id: person.id, name: person.name })
}

/** Top of the page: anyone else lands back on Staff tools with nothing said. */
export async function requireBurleighSales(): Promise<void> {
  if (!(await mayOpenBurleighSales())) redirect(TIER_LANDING)
}
