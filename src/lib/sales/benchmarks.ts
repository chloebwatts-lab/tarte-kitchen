/**
 * Lightspeed-era average sale per area at Tarte Beach House, the yardstick
 * the Sales page arrows point at (Shawna, 18 Oct 2026).
 */
export const LIGHTSPEED_AVG_SALE = { CAFE: 25.05, ONLINE: 36.3, RESTAURANT: 82.03 } as const

export type BenchmarkChannel = keyof typeof LIGHTSPEED_AVG_SALE

/** % above (+) or below (-) the Lightspeed average, 1dp; null with no orders. */
export function vsLightspeedPct(channel: BenchmarkChannel, avgSale: number, orders: number): number | null {
  if (orders <= 0) return null
  const base = LIGHTSPEED_AVG_SALE[channel]
  return Math.round(((avgSale - base) / base) * 1000) / 10
}
