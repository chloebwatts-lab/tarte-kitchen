import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import {
  SEO_SCOREBOARD_KEY,
  buildSeoSection,
  parseSeoScoreboardPayload,
} from "@/lib/seo/scoreboard"

export const dynamic = "force-dynamic"

// Internal feed from the SEO engine (sibling service on this droplet): a
// small JSON snapshot of search numbers for the Friday digest. Same lock as
// the email relay next door, the CRON_SECRET bearer token, which only lives
// in the droplet .env files.
//
// POST stores the snapshot (one AppSetting row, overwritten each push).
// GET returns the section exactly as the digest will read it, for checking.
function authed(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization")
  return !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return new Response("Unauthorized", { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = parseSeoScoreboardPayload(body)
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 })

  const value = JSON.stringify(parsed)
  await db.appSetting.upsert({
    where: { key: SEO_SCOREBOARD_KEY },
    create: { key: SEO_SCOREBOARD_KEY, value },
    update: { value },
  })
  return Response.json({ ok: true, section: await buildSeoSection() })
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return new Response("Unauthorized", { status: 401 })
  return Response.json({ ok: true, section: await buildSeoSection() })
}
