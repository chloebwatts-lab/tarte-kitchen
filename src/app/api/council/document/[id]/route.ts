import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isCouncilAuthed } from "@/lib/council-auth"
import { getPerson, isOwnerSession } from "@/lib/person-session"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewing needs no extra prompt (per Chloe 2026-08-05) so the folder opens
  // instantly in front of an EHO: the council folder they are looking at
  // already carries the council cookie, and Inspection view carries a staff
  // sign-in. Since 12 Oct 2026 one of those, or the office login, is
  // required; a bare link from outside gets nothing. Upload/delete stay
  // behind the council password, see council-documents.ts.
  if (!(await isCouncilAuthed()) && !(await getPerson()) && !(await isOwnerSession())) {
    return new NextResponse("Not found", { status: 404 })
  }
  const { id } = await params
  const doc = await db.councilDocument.findUnique({ where: { id } })
  if (!doc) return new NextResponse("Not found", { status: 404 })

  const body = new Uint8Array(doc.data)
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.fileSize),
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
