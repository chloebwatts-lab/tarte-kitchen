import type { PastryBakeTime } from "@/generated/prisma"

export const BAKE_ORDER: PastryBakeTime[] = ["SIX_AM", "NINE_AM", "TWELVE_PM"]

export const BAKE_LABEL: Record<PastryBakeTime, string> = {
  SIX_AM: "6 AM bake",
  NINE_AM: "9 AM bake",
  TWELVE_PM: "12 PM bake",
}
