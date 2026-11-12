import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { getToken } from "next-auth/jwt"
import { db } from "@/lib/db"
import { isOwnerSession } from "@/lib/person-session"

export const dynamic = "force-dynamic"

/**
 * A supplier invoice PDF as Kitchen received it. Each Kitchen DRAFT bill in
 * Xero links here (its Url), so the approver can open the document before
 * the PDF is attached in Xero. Office login or the owner's session only.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const office = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!office && !(await isOwnerSession())) return new NextResponse("Not found", { status: 404 })
  const { id } = await params
  const inv = await db.invoice.findUnique({ where: { id }, select: { pdfUrl: true, supplierName: true, invoiceNumber: true } })
  if (!inv?.pdfUrl) return new NextResponse("Not found", { status: 404 })
  const root = path.resolve(process.cwd(), "data")
  const file = path.resolve(process.cwd(), inv.pdfUrl)
  if (!file.startsWith(root + path.sep)) return new NextResponse("Not found", { status: 404 })
  let data: Buffer
  try {
    data = await readFile(file)
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
  const name = `${inv.supplierName} ${inv.invoiceNumber ?? id}`.replace(/[^A-Za-z0-9 ._-]+/g, "-").slice(0, 100)
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
