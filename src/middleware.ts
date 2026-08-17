import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { STAFF_COOKIE, isValidStaffCookie } from "@/lib/staff-auth"

/**
 * Staff areas: gated by the shared staff password (see src/lib/staff-auth.ts),
 * not by next-auth. An admin session gets through too, so nobody signed in to
 * the office side has to log in twice.
 */
const STAFF_PREFIXES = ["/kitchen", "/staffaccess", "/log"]

function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  const { pathname } = req.nextUrl

  if (isStaffPath(pathname)) {
    if (token) return NextResponse.next()
    const cookie = req.cookies.get(STAFF_COOKIE)?.value
    if (await isValidStaffCookie(cookie)) return NextResponse.next()
    const loginUrl = new URL("/staff-login", req.url)
    loginUrl.searchParams.set("next", pathname + req.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  if (!token) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/ingredients/:path*",
    "/preparations/:path*",
    "/dishes/:path*",
    "/suppliers/:path*",
    "/wastage/:path*",
    "/settings/:path*",
    "/reports/:path*",
    "/analysis/:path*",
    "/menu-engineering/:path*",
    "/prep-sheet/:path*",
    "/stocktake/:path*",
    "/checklists/:path*",
    "/cogs/:path*",
    "/orders/:path*",
    "/order-checklists/:path*",
    "/order-departments/:path*",
    "/par-levels/:path*",
    "/price-alerts/:path*",
    "/restock/:path*",
    "/spend/:path*",
    "/labour/:path*",
    "/maintenance/:path*",
    "/commitments/:path*",
    "/services/:path*",
    // Staff areas. Both forms listed so the bare path is covered as well as
    // everything under it.
    "/kitchen",
    "/kitchen/:path*",
    "/staffaccess",
    "/staffaccess/:path*",
    "/log",
    "/log/:path*",
  ],
}
