/**
 * Cake order alerts: web push to every phone or iPad that turned them on at
 * /kitchen/pastry/cakes. Same VAPID keys and service worker (/gm-sw.js) as
 * the GM desk, so no new account or setup. Without the keys this quietly
 * does nothing and the list on the page still shows everything.
 */

import webpush from "web-push"
import { db } from "@/lib/db"
import { pushPublicKey } from "@/lib/gm/push"

export const CAKES_PATH = "/kitchen/pastry/cakes"

/** `only` sends to that one device (the "alerts are on" test), not everyone. */
export async function sendCakePush(title: string, body: string, url = CAKES_PATH, only?: string): Promise<{ sent: number; devices: number }> {
  const pub = pushPublicKey()
  if (!pub) return { sent: 0, devices: 0 }
  webpush.setVapidDetails("mailto:accounts@tarte.com.au", pub, process.env.VAPID_PRIVATE_KEY as string)
  const subs = await db.cakePushSub.findMany(only ? { where: { endpoint: only } } : undefined)
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url }),
        { TTL: 12 * 60 * 60 }
      )
      sent++
    } catch (e) {
      // 404 / 410: the device dropped the subscription. Forget it.
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.cakePushSub.delete({ where: { id: s.id } }).catch(() => undefined)
    }
  }
  console.log(`[cake-push] "${title}" to ${subs.length} devices, ${sent} sent`)
  return { sent, devices: subs.length }
}
