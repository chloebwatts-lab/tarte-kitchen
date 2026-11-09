import { NextRequest } from "next/server"
import { trashPrivateSentCopy } from "@/lib/gmail/sent-tidy"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Tarte Shifts sends its owner and payroll emails from accounts@ with its own
// Gmail token, which cannot trash. After such a send it posts the message id
// here and Kitchen (whose token has gmail.modify) trashes the Sent copy.
//
// Narrow on purpose: bearer CRON_SECRET (same secret as the mail relay), one
// message id per call, and the message must be a plain Sent copy from
// accounts@ whose subject is on the private list in sent-tidy-rules.ts.
// Anything else is kept and reported back. Trash only, never delete.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  let body: { id?: unknown; via?: unknown; dryRun?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const id = typeof body.id === "string" ? body.id.trim() : ""
  if (!/^[A-Za-z0-9]{8,40}$/.test(id)) {
    return Response.json({ error: "id must be a Gmail message id" }, { status: 400 })
  }
  const via = typeof body.via === "string" && /^[a-z0-9-]{1,40}$/.test(body.via) ? body.via : "internal"
  const result = await trashPrivateSentCopy({
    id,
    via,
    explicit: false, // the subject list decides, whatever the caller says
    dryRun: body.dryRun === true ? true : undefined,
  })
  return Response.json({ ok: result.action !== "failed", ...result })
}
