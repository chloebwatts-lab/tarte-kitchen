import { cookies, headers } from "next/headers"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  DEVICE_COOKIE,
  PERSON_COOKIE,
  decodePerson,
  encodePerson,
  isManagerRole,
  personCookieOptions,
  type PersonSession,
} from "@/lib/person-auth"
import type { AccessEventKind } from "@/generated/prisma/client"

/** Server-side view of who is signed in to the staff area, or null. */
export async function getPerson(): Promise<PersonSession | null> {
  return decodePerson((await cookies()).get(PERSON_COOKIE)?.value)
}

/** Office login (Chloe) passes every staff gate without a staff session. */
export async function isOwnerSession(): Promise<boolean> {
  return !!(await getServerSession(authOptions))
}

export async function personIsManager(): Promise<boolean> {
  if (await isOwnerSession()) return true
  const p = await getPerson()
  return !!p && isManagerRole(p.role)
}

export async function setPersonCookie(p: PersonSession): Promise<void> {
  ;(await cookies()).set(PERSON_COOKIE, await encodePerson(p), personCookieOptions())
}

export async function clearPersonCookie(): Promise<void> {
  ;(await cookies()).delete(PERSON_COOKIE)
}

/** Best-effort audit write. Never throws: logging must not break a page. */
export async function logAccess(
  kind: AccessEventKind,
  extra: { staffId?: string | null; staffName?: string | null; attemptedName?: string | null; path?: string | null } = {}
): Promise<void> {
  try {
    const h = await headers()
    const jar = await cookies()
    await db.accessEvent.create({
      data: {
        kind,
        staffId: extra.staffId ?? null,
        staffName: extra.staffName ?? null,
        attemptedName: extra.attemptedName ?? null,
        path: extra.path ?? null,
        ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
        userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
        deviceId: jar.get(DEVICE_COOKIE)?.value ?? null,
      },
    })
  } catch (e) {
    console.error("[access-log]", e)
  }
}
