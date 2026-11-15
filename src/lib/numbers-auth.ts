import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { mayTrustDevice } from "@/lib/person-auth"
import { getPerson, isOwnerDevice, isOwnerSession } from "@/lib/person-session"
import { requireManager } from "@/lib/manager-auth"
import { QUIET_LANDING } from "@/lib/manager-quiet"
import { NUMBERS_SETTING_KEY, isNumbersPerson } from "@/lib/numbers-access"

/**
 * Who may see live wages and COGS (see numbers-access.ts): the office login,
 * an owner's phone, Chloe and Shawna on their own sign in, and anyone on
 * the `wagesCogsStaff` list.
 */
export async function maySeeNumbers(): Promise<boolean> {
  if (await isOwnerSession()) return true
  if (await isOwnerDevice()) return true
  const person = await getPerson()
  if (!person) return false
  if (mayTrustDevice(person)) return true
  const row = await db.appSetting.findUnique({ where: { key: NUMBERS_SETTING_KEY } })
  return isNumbersPerson(row?.value, { id: person.id, name: person.name })
}

/**
 * Call at the top of the Wages + COGS page. The managers password first,
 * then the list; anyone else lands back on the Managers hub with nothing
 * said, the same as a quiet manager on a withheld page.
 */
export async function requireNumbers(next: string): Promise<void> {
  await requireManager(next)
  if (!(await maySeeNumbers())) redirect(QUIET_LANDING)
}
