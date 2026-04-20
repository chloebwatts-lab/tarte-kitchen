"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { listOpUnits, syncDeputyTimesheets } from "@/lib/deputy/client"
import { encrypt } from "@/lib/encryption"
import type { Venue } from "@/generated/prisma"

export interface DeputyStatus {
  connected: boolean
  install: string | null
  region: string | null
  tokenHealthy: boolean
  lastSyncedAt: string | null
  locations:
    | {
        id: number
        name: string
        venue: Venue | null
      }[]
    | null
  unmappedCount: number
  superRate: number // decimal, e.g. 0.12
  defaultOpenShiftRate: number // $/hr
}

export async function getDeputyStatus(): Promise<DeputyStatus> {
  const connection = await db.deputyConnection.findFirst()
  if (!connection) {
    return {
      connected: false,
      install: null,
      region: null,
      tokenHealthy: false,
      lastSyncedAt: null,
      locations: null,
      unmappedCount: 0,
      superRate: 0.12,
      defaultOpenShiftRate: 30,
    }
  }
  // Three ways the connection can be healthy:
  //   1. Has a refresh token — we can refresh on demand (OAuth mode).
  //   2. Has no expiry at all — it's a permanent token (install-minted),
  //      which never expires.
  //   3. Has an expiry still in the future — OAuth token still valid.
  const tokenHealthy =
    connection.refreshToken !== null ||
    connection.tokenExpiresAt === null ||
    connection.tokenExpiresAt.getTime() > Date.now()

  const locs = (connection.locations as {
    id: number
    name: string
    venue: Venue | null
  }[] | null) ?? null
  const unmappedCount = locs ? locs.filter((l) => !l.venue).length : 0

  return {
    connected: true,
    install: connection.install,
    region: connection.region,
    tokenHealthy,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    locations: locs,
    unmappedCount,
    superRate: Number(connection.superRate ?? 0.12),
    defaultOpenShiftRate: Number(connection.defaultOpenShiftRate ?? 30),
  }
}

export async function setDeputyWageSettings(params: {
  superRate: number // decimal, e.g. 0.12
  defaultOpenShiftRate: number // $/hr
}) {
  const connection = await db.deputyConnection.findFirst()
  if (!connection) throw new Error("No Deputy connection")
  if (
    !Number.isFinite(params.superRate) ||
    params.superRate < 0 ||
    params.superRate > 1
  ) {
    throw new Error("Super rate must be between 0 and 1 (e.g. 0.12 for 12%)")
  }
  if (
    !Number.isFinite(params.defaultOpenShiftRate) ||
    params.defaultOpenShiftRate < 0
  ) {
    throw new Error("Open shift rate must be a non-negative dollar value")
  }
  await db.deputyConnection.update({
    where: { id: connection.id },
    data: {
      superRate: params.superRate,
      defaultOpenShiftRate: params.defaultOpenShiftRate,
    },
  })
  revalidatePath("/settings/integrations")
  revalidatePath("/labour")
}

/**
 * Hit Deputy, list their operational units, and stash them (merging with
 * existing venue mappings so we don't clobber admin work).
 */
export async function refreshDeputyLocations() {
  const connection = await db.deputyConnection.findFirst()
  if (!connection) throw new Error("No Deputy connection")

  const existing = new Map<number, Venue | null>()
  for (const l of (connection.locations as {
    id: number
    venue: Venue | null
  }[] | null) ?? []) {
    existing.set(l.id, l.venue)
  }

  const units = await listOpUnits()
  const merged = units.map((u) => ({
    id: u.Id,
    name: u.OperationalUnitName,
    venue: existing.get(u.Id) ?? null,
  }))

  await db.deputyConnection.update({
    where: { id: connection.id },
    data: { locations: merged },
  })
  revalidatePath("/settings/integrations")
  return merged.length
}

/**
 * Persist one venue mapping. Idempotent — sets the venue for a single
 * operational unit id.
 */
export async function setDeputyLocationVenue(params: {
  opUnitId: number
  venue: Venue | null
}) {
  const connection = await db.deputyConnection.findFirst()
  if (!connection) throw new Error("No Deputy connection")

  const locs = (connection.locations as
    | { id: number; name: string; venue: Venue | null }[]
    | null) ?? []
  const next = locs.map((l) =>
    l.id === params.opUnitId ? { ...l, venue: params.venue } : l
  )
  await db.deputyConnection.update({
    where: { id: connection.id },
    data: { locations: next },
  })
  revalidatePath("/settings/integrations")
  revalidatePath("/labour")
}

export async function triggerDeputySync() {
  const result = await syncDeputyTimesheets()
  revalidatePath("/labour")
  revalidatePath("/settings/integrations")
  return result
}

/**
 * Simpler alternative to the OAuth dance: Deputy supports long-lived
 * "Permanent Tokens" you can mint from your own install without any app
 * registration. The token doesn't expire and doesn't need a refresh —
 * perfect for a single-tenant server integration like this one.
 *
 * Given `https://tarte.au.deputy.com`, install = "tarte", region = "au".
 * We accept either the split values or a pasted full URL we parse out.
 */
export async function connectDeputyWithToken(params: {
  token: string
  installUrl: string // e.g. "https://tarte.au.deputy.com" or "tarte.au.deputy.com"
}) {
  const token = params.token.trim()
  if (!token) throw new Error("Token is required")

  const cleaned = params.installUrl
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
  const match = cleaned.match(/^([^.]+)\.([^.]+)\.deputy\.com$/i)
  if (!match) {
    throw new Error(
      `Install URL should look like "tarte.au.deputy.com" — got "${cleaned}"`
    )
  }
  const install = match[1].toLowerCase()
  const region = match[2].toLowerCase()

  // Quick sanity check — call Deputy once to verify the token works.
  const probe = await fetch(
    `https://${install}.${region}.deputy.com/api/v1/resource/OperationalUnit`,
    {
      headers: {
        Authorization: `OAuth ${token}`,
        Accept: "application/json",
      },
    }
  )
  if (!probe.ok) {
    throw new Error(
      `Deputy rejected the token (${probe.status}). Double-check the token and install URL.`
    )
  }

  const existing = await db.deputyConnection.findFirst()
  const data = {
    install,
    region,
    accessToken: encrypt(token),
    refreshToken: null, // permanent tokens don't refresh
    tokenExpiresAt: null,
  }
  if (existing) {
    await db.deputyConnection.update({ where: { id: existing.id }, data })
  } else {
    await db.deputyConnection.create({ data })
  }

  revalidatePath("/settings/integrations")
  revalidatePath("/labour")
  return { install, region }
}

export async function disconnectDeputy() {
  const connection = await db.deputyConnection.findFirst()
  if (connection) {
    await db.deputyConnection.delete({ where: { id: connection.id } })
  }
  revalidatePath("/settings/integrations")
  revalidatePath("/labour")
}
