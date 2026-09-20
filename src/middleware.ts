import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { DEED_VERSION } from "@/lib/confidentiality/deed"
import { PERSON_COOKIE, decodePerson, encodePerson, personCookieOptions } from "@/lib/person-auth"

/**
 * Staff areas: every person signs in as themselves (last name + Tarte Shifts
 * PIN, see src/lib/person-auth.ts) and must have signed the current
 * confidentiality deed before anything else opens. An office session gets
 * through too, so Chloe never signs in twice.
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
    const person = await decodePerson(req.cookies.get(PERSON_COOKIE)?.value)
    if (!person) {
      const loginUrl = new URL("/staff-login", req.url)
      loginUrl.searchParams.set("next", pathname + req.nextUrl.search)
      return NextResponse.redirect(loginUrl)
    }
    // No deed, no app. The deed page and its beacon are the only way through.
    const deedExempt = pathname.startsWith("/kitchen/confidentiality") || pathname === "/kitchen/beacon"
    if (person.deed !== DEED_VERSION && !deedExempt) {
      const deedUrl = new URL("/kitchen/confidentiality", req.url)
      deedUrl.searchParams.set("next", pathname + req.nextUrl.search)
      return NextResponse.redirect(deedUrl)
    }
    const res = NextResponse.next()
    // Sliding idle window. Rewritten at most once a minute, not per request.
    if (Date.now() - person.seen > 60_000) {
      res.cookies.set(PERSON_COOKIE, await encodePerson({ ...person, seen: Date.now() }), personCookieOptions())
    }
    return res
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
    "/home/:path*",
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
    "/pricing/:path*",
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
