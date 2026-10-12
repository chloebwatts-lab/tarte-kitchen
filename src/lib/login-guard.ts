/**
 * Brute-force lockout shared by every password gate: staff, managers,
 * gm (Oliver), council and the office login. Several of these passwords
 * are short and shared by design (iPads, mid-service), so the defence is
 * making guessing useless rather than making the passwords long.
 *
 *   - 5 wrong tries from one browser (its tk_device cookie) in 15 minutes:
 *     that browser waits.
 *   - 40 wrong tries from one address in 15 minutes: that address waits.
 *     Every phone and iPad on a venue's wifi shares one public address, so
 *     this is a backstop against scripts, not the first line (until 12 Oct
 *     2026 it was 5, and five mistyped PINs by anyone at a venue locked the
 *     whole venue out).
 *   - 150 wrong tries at one gate in an hour, from anywhere: the gate shuts
 *     to new logins for 30 minutes and Chloe gets one email.
 * Devices already signed in are never affected: this only guards the
 * login forms. Nothing typed is ever stored.
 */

import { cookies, headers } from "next/headers"
import { db } from "@/lib/db"
import { sendEmail } from "@/lib/gmail/send"
import { DEVICE_COOKIE } from "@/lib/person-auth"

export type Gate = "staff" | "managers" | "gm" | "council" | "admin"

export const PER_DEVICE_MAX = 5
export const PER_IP_MAX = 40
const PER_IP_WINDOW_MS = 15 * 60 * 1000
export const GATE_MAX = 150
const GATE_WINDOW_MS = 60 * 60 * 1000
const GATE_LOCK_MS = 30 * 60 * 1000
const ALERT_TO = process.env.SECURITY_ALERT_RECIPIENT || "chloe@tarte.com.au"

export const LOCKED_MESSAGE = "Too many wrong tries. Wait 15 minutes, then try again."

/** Caddy is the only thing in front of the app, so the first hop it
 *  reports is the real caller. */
export function ipFrom(h: { get(name: string): string | null | undefined }): string {
  const fwd = h.get("x-forwarded-for")
  return (fwd ? fwd.split(",")[0] : h.get("x-real-ip") ?? "unknown").trim().slice(0, 64) || "unknown"
}

export async function callerIp(): Promise<string> {
  return ipFrom(await headers())
}

/** The browser's device id, if it has one yet. Null outside a request. */
export async function callerDevice(): Promise<string | null> {
  try {
    return (await cookies()).get(DEVICE_COOKIE)?.value?.slice(0, 64) || null
  } catch {
    return null
  }
}

/** True when this caller must not even be checked right now. */
export async function isLockedOut(gate: Gate, ip: string, device?: string | null): Promise<boolean> {
  const now = Date.now()
  const since = new Date(now - PER_IP_WINDOW_MS)
  const [byDevice, byIp, all] = await Promise.all([
    device ? db.loginAttempt.count({ where: { gate, device, ok: false, createdAt: { gte: since } } }) : Promise.resolve(0),
    db.loginAttempt.count({ where: { gate, ip, ok: false, createdAt: { gte: since } } }),
    db.loginAttempt.findMany({
      where: { gate, ok: false, createdAt: { gte: new Date(now - GATE_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: GATE_MAX,
      select: { createdAt: true },
    }),
  ])
  if (byDevice >= PER_DEVICE_MAX) return true
  if (byIp >= PER_IP_MAX) return true
  // Gate-wide: shut for 30 minutes after the 150th miss inside an hour.
  if (all.length >= GATE_MAX && now - all[0].createdAt.getTime() < GATE_LOCK_MS) return true
  return false
}

export async function recordAttempt(gate: Gate, ip: string, ok: boolean, device?: string | null): Promise<void> {
  try {
    await db.loginAttempt.create({ data: { gate, ip, ok, device: device ?? null } })
    if (ok) return
    const since = new Date(Date.now() - GATE_WINDOW_MS)
    const misses = await db.loginAttempt.count({ where: { gate, ok: false, createdAt: { gte: since } } })
    // Exactly on the threshold, so one burst means one email.
    if (misses === GATE_MAX) {
      const ips = await db.loginAttempt.groupBy({ by: ["ip"], where: { gate, ok: false, createdAt: { gte: since } }, _count: true })
      await sendEmail({
        to: ALERT_TO,
        subject: `Tarte Kitchen: someone is guessing the ${gate} password`,
        body:
          `${GATE_MAX} wrong password tries on the "${gate}" login in the last hour.\n\n` +
          `New logins on that gate are paused for 30 minutes. Devices already signed in keep working.\n\n` +
          `Where from:\n${ips.map((i) => `- ${i.ip}: ${i._count} tries`).join("\n")}\n\n` +
          `If this was not one of us mistyping, change that password.`,
      }).catch(() => undefined)
    }
    // Light housekeeping, roughly one write in fifty.
    if (Math.random() < 0.02) {
      await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 14 * 86400000) } } })
    }
  } catch {
    /* the guard must never be the reason a real login fails */
  }
}

/**
 * Wrap a password check: refuses while locked out, records the result.
 * Returns "locked" | "wrong" | "ok". The device id is read from the
 * request's cookie unless given.
 */
export async function guardedCheck(
  gate: Gate,
  check: () => Promise<boolean> | boolean,
  ip?: string,
  device?: string | null
): Promise<"locked" | "wrong" | "ok"> {
  const who = ip ?? (await callerIp())
  const dev = device === undefined ? await callerDevice() : device
  if (await isLockedOut(gate, who, dev)) return "locked"
  const ok = await check()
  await recordAttempt(gate, who, ok, dev)
  return ok ? "ok" : "wrong"
}
