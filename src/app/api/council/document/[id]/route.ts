import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isCouncilAuthed } from "@/lib/council-auth"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isCouncilAuthed())) {
    return new NextResponse("Unauthorized", { status: 401 })
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
