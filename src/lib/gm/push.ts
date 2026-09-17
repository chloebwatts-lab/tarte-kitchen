/**
 * Phone alerts for the GM desk: web push straight to the Tarte app on
 * Oliver's phone. No third-party account. Keys are VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY in the droplet .env; without them this quietly does
 * nothing and email carries on alone.
 */

import webpush from "web-push"
import { db } from "@/lib/db"

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null
}

export async function sendGmPush(title: string, body: string, url = "/kitchen/gm"): Promise<{ sent: number; devices: number }> {
  const pub = pushPublicKey()
  if (!pub) return { sent: 0, devices: 0 }
  webpush.setVapidDetails("mailto:accounts@tarte.com.au", pub, process.env.VAPID_PRIVATE_KEY as string)
  const subs = await db.gmPushSub.findMany()
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url }),
        { TTL: 6 * 60 * 60 }
      )
      sent++
    } catch (e) {
      // 404 / 410: the phone dropped the subscription. Forget it.
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.gmPushSub.delete({ where: { id: s.id } }).catch(() => undefined)
    }
  }
  return { sent, devices: subs.length }
}
