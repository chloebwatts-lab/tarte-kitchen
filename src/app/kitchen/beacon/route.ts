import { getPerson, logAccess } from "@/lib/person-session"

export const dynamic = "force-dynamic"

/** View and capture-attempt beacon from StaffShellClient. Sits under /kitchen so the staff gate covers it. */
export async function POST(req: Request) {
  const person = await getPerson()
  if (!person) return new Response(null, { status: 204 })
  let body: { kind?: string; path?: string } = {}
  try {
    body = await req.json()
  } catch {
    return new Response(null, { status: 204 })
  }
  const path = String(body.path ?? "").slice(0, 300)
  if (!path.startsWith("/")) return new Response(null, { status: 204 })
  await logAccess(body.kind === "capture" ? "CAPTURE_ATTEMPT" : "VIEW", { staffId: person.id, staffName: person.name, path })
  return new Response(null, { status: 204 })
}
