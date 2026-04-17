import { getXeroAuthUrl } from "@/lib/xero/client"
import { NextResponse } from "next/server"

export async function GET() {
  const url = getXeroAuthUrl()
  return NextResponse.redirect(url)
}
