export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getActiveGmailConnection, getValidGmailAccessToken } from "@/lib/gmail/token"
import { searchMessages, getMessage, getHeader, extractPlainTextBody } from "@/lib/gmail/client"
import { pickLoginCode, type LoginCodeCandidate } from "@/lib/uber/login-code"

/**
 * The 4-digit code Uber emails accounts@tarte.com.au when the self-sign-in
 * job chooses "Log in with email" (tools/uber-login, 9 Nov 2026). Bearer =
 * CRON_SECRET. ?since=<ms since epoch> (required, within the last hour):
 * only a code received at or after that moment is returned, so an older
 * attempt's code is never typed. ?dry=1 reports whether a code was found
 * without returning it (for checks by hand). Only found / receivedAt /
 * code come back: Uber repeats the code in the subject line.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 })
  const since = Number(req.nextUrl.searchParams.get("since"))
  const dry = req.nextUrl.searchParams.get("dry") === "1"
  if (!Number.isFinite(since) || since < Date.now() - 3600_000 || since > Date.now() + 60_000) {
    return Response.json({ error: "since must be a ms timestamp within the last hour" }, { status: 400 })
  }
  if (!(await getActiveGmailConnection())) return Response.json({ error: "Gmail not connected" }, { status: 400 })

  const token = await getValidGmailAccessToken()
  const afterSec = Math.floor(since / 1000) - 120
  const refs = await searchMessages(token, `from:uber.com after:${afterSec}`, 10)
  const candidates: LoginCodeCandidate[] = []
  for (const ref of refs) {
    const m = await getMessage(token, ref.id)
    candidates.push({
      id: ref.id,
      receivedAt: Number(m.internalDate),
      from: getHeader(m, "From") ?? null,
      subject: getHeader(m, "Subject") ?? null,
      body: extractPlainTextBody(m),
    })
  }
  const picked = pickLoginCode(candidates, since)
  if (!picked) return Response.json({ found: false, searched: candidates.length })
  // Uber puts the code in the subject line too, so the subject is never returned.
  const receivedAt = new Date(picked.receivedAt).toISOString()
  return Response.json(dry ? { found: true, receivedAt } : { found: true, receivedAt, code: picked.code })
}
