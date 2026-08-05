import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewing is passwordless (per Chloe 2026-08-05) so the folder opens
  // instantly in front of an EHO. Upload/delete stay behind the council
  // password — see council-documents.ts.
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
