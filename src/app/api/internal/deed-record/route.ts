import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { DEED_VERSION } from "@/lib/confidentiality/deed"

export const dynamic = "force-dynamic"

/**
 * Record a confidentiality deed that was signed somewhere else in the group —
 * today, inside Tarte Shifts onboarding, where a new hire signs it along with
 * their employment contract. Without this they would sign the same deed twice:
 * once at onboarding, again at the Kitchen deed gate on their first login.
 *
 * Locked to the CRON_SECRET bearer, same as the email relay, so only our own
 * services on the droplet can call it. Keyed on (staffId, version) and never
 * overwrites an existing signature.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  let b: Record<string, unknown>
  try {
    b = (await req.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : null)
  const staffId = str("staffId")
  const staffName = str("staffName")
  const version = str("version")
  const textHash = str("textHash")
  const signedName = str("signedName")
  const signatureImg = str("signatureImg")
  if (!staffId || !staffName || !version || !textHash || !signedName || !signatureImg)
    return Response.json({ error: "Required: staffId, staffName, version, textHash, signedName, signatureImg" }, { status: 400 })
  if (!signatureImg.startsWith("data:image/png;base64,") || signatureImg.length > 400_000)
    return Response.json({ error: "signatureImg must be a PNG data URL under 400 KB" }, { status: 400 })
  if (!/^[0-9a-f]{64}$/.test(textHash)) return Response.json({ error: "textHash must be a SHA-256 hex digest" }, { status: 400 })

  const signedAt = str("signedAt") ? new Date(str("signedAt")!) : new Date()
  if (Number.isNaN(signedAt.getTime())) return Response.json({ error: "signedAt is not a date" }, { status: 400 })

  const existing = await db.confidentialityDeed.findUnique({
    where: { staffId_version: { staffId, version } },
  })
  if (existing) return Response.json({ ok: true, already: true, current: DEED_VERSION })

  await db.confidentialityDeed.create({
    data: {
      staffId,
      staffName,
      version,
      textHash,
      signedName,
      signatureImg,
      guardianName: str("guardianName"),
      guardianSignatureImg: str("guardianSignatureImg"),
      ip: str("ip"),
      userAgent: str("userAgent")?.slice(0, 300) ?? "Tarte Shifts onboarding",
      copySentTo: str("copySentTo"),
      signedAt,
    },
  })
  // `current` tells the caller whether Kitchen's wording has moved on: if it
  // has, the hire will still be asked to sign the newer version at login.
  return Response.json({ ok: true, recorded: version, current: DEED_VERSION })
}
