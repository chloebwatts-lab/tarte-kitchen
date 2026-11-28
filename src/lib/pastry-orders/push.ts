/**
 * Pastry Orders alerts go to the same phones and iPads that turned on cake
 * order alerts (CakePushSub): one "alerts on" switch for pastry, whichever
 * page it was tapped on.
 */

import { sendCakePush } from "@/lib/cakes/push"

export const PASTRY_ORDERS_PATH = "/kitchen/pastry/orders"

export function sendPastryPush(title: string, body: string, url = PASTRY_ORDERS_PATH, only?: string) {
  return sendCakePush(title, body, url, only)
}
