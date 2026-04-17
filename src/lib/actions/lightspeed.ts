"use server"

import { db } from "@/lib/db"
import { getConnectionStatus, type ConnectionStatus } from "@/lib/lightspeed/token"
export type { ConnectionStatus } from "@/lib/lightspeed/token"
import { revalidatePath } from "next/cache"

export async function getLightspeedStatus(): Promise<ConnectionStatus> {
  return getConnectionStatus()
}

export async function disconnectLightspeed() {
  await db.lightspeedConnection.deleteMany()
  revalidatePath("/settings/integrations")
}

export async function updateLocationVenueMapping(
  locations: Array<{ id: string; name: string; venue: string }>
) {
  const connection = await db.lightspeedConnection.findFirst({
    orderBy: { connectedAt: "desc" },
  })
  if (!connection) throw new Error("No connection found")

  await db.lightspeedConnection.update({
    where: { id: connection.id },
    data: { businessLocations: locations },
  })
  revalidatePath("/settings/integrations")
}
