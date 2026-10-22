import { db } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"
import type { Prisma, Venue } from "@/generated/prisma/client"

/**
 * Square accounts. Tarte has one Square account per legal entity: Currumbin
 * (Beach House + Tea Garden) and Burleigh (Tarte Bakery), each with its own
 * production access token. One SquareConnection row per account; a venue is
 * served by the token on the row whose locations map to it, so the sync,
 * the live Sales page and the settings card never need a Square login
 * switch.
 */

export interface SquareLocationMapping {
  id: string
  name: string
  venue: string
}

export interface SquareAccount {
  id: string
  merchantId: string | null
  merchantName: string | null
  connectedAt: Date
  lastSyncAt: Date | null
  lastError: string | null
  locations: SquareLocationMapping[]
}

type ConnectionRow = {
  id: string
  accessToken: string
  merchantId: string | null
  merchantName: string | null
  connectedAt: Date
  lastSyncAt: Date | null
  lastError: string | null
  locations: unknown
}

/** Every connected Square account, oldest first. */
export async function getSquareConnections(): Promise<ConnectionRow[]> {
  return db.squareConnection.findMany({ orderBy: { connectedAt: "asc" } })
}

export function accessTokenOf(conn: { accessToken: string }): string {
  return decrypt(conn.accessToken)
}

export function squareLocations(conn: { locations: unknown } | null): SquareLocationMapping[] {
  return ((conn?.locations as SquareLocationMapping[] | null) ?? []).filter(
    (l) => l && typeof l.id === "string"
  )
}

export function toAccount(c: ConnectionRow): SquareAccount {
  return {
    id: c.id,
    merchantId: c.merchantId,
    merchantName: c.merchantName,
    connectedAt: c.connectedAt,
    lastSyncAt: c.lastSyncAt,
    lastError: c.lastError,
    locations: squareLocations(c),
  }
}

export interface SquareVenueAccess {
  connectionId: string
  locationId: string
  token: string
}

/**
 * The Square location + token for a venue, from whichever account maps it.
 * Null when no account has a location mapped to that venue.
 */
export async function squareAccessFor(venue: Venue): Promise<SquareVenueAccess | null> {
  const conns = await getSquareConnections()
  for (const c of conns) {
    const loc = squareLocations(c).find((l) => l.venue === venue)
    if (loc) return { connectionId: c.id, locationId: loc.id, token: accessTokenOf(c) }
  }
  return null
}

/**
 * Store an account's token. The same Square account (merchant id) pasted
 * again replaces its token and keeps its row; a new merchant id adds a row.
 * Other accounts are untouched.
 */
export async function saveSquareConnection(
  token: string,
  merchantId: string | null,
  merchantName: string | null,
  locations: SquareLocationMapping[]
) {
  const data = {
    accessToken: encrypt(token),
    merchantId,
    merchantName,
    locations: locations as unknown as Prisma.InputJsonValue,
    lastError: null,
  }
  const existing = merchantId ? await db.squareConnection.findFirst({ where: { merchantId } }) : null
  if (existing) {
    return db.squareConnection.update({ where: { id: existing.id }, data })
  }
  return db.squareConnection.create({ data })
}

export interface SquareStatus {
  connected: boolean
  accounts: SquareAccount[]
  /** Every mapped location across all accounts. */
  locations: SquareLocationMapping[]
  /** Venues no account maps yet (so the card can say "Burleigh not connected"). */
  unmappedVenues: Venue[]
}

const ALL_VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]

export async function getSquareStatus(): Promise<SquareStatus> {
  const conns = await getSquareConnections()
  const accounts = conns.map(toAccount)
  const locations = accounts.flatMap((a) => a.locations)
  const mapped = new Set(locations.map((l) => l.venue))
  return {
    connected: accounts.length > 0,
    accounts,
    locations,
    unmappedVenues: ALL_VENUES.filter((v) => !mapped.has(v)),
  }
}
