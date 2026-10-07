import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { DEED_VERSION } from "@/lib/confidentiality/deed"
import {
  OWNER_DEVICE_COOKIE,
  PERSON_COOKIE,
  decodeOwnerDevice,
  decodePerson,
  encodeOwnerDevice,
  encodePerson,
  ownerDeviceCookieOptions,
  personCookieOptions,
  personFromOwnerDevice,
} from "@/lib/person-auth"

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
    let person = await decodePerson(req.cookies.get(PERSON_COOKIE)?.value)
    // The owner's own phone: no session, or an expired one, signs her
    // straight back in. The page being rendered must see the new session
    // too, so it goes on the forwarded request as well as the response.
    let minted: string | null = null
    if (!person) {
      const device = await decodeOwnerDevice(req.cookies.get(OWNER_DEVICE_COOKIE)?.value)
      if (device) {
        person = personFromOwnerDevice(device, DEED_VERSION)
        minted = await encodePerson(person)
      }
    }
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
    if (minted) {
      const headers = new Headers(req.headers)
      const others = (headers.get("cookie") ?? "")
        .split(/;\s*/)
        .filter((c) => c && !c.startsWith(`${PERSON_COOKIE}=`))
      headers.set("cookie", [...others, `${PERSON_COOKIE}=${minted}`].join("; "))
      const fresh = NextResponse.next({ request: { headers } })
      fresh.cookies.set(PERSON_COOKIE, minted, personCookieOptions())
      // The phone stays trusted for 30 days from its last use, not forever.
      fresh.cookies.set(
        OWNER_DEVICE_COOKIE,
        await encodeOwnerDevice({ id: person.id, name: person.name, last: person.last, email: person.email ?? null, iat: Date.now() }),
        ownerDeviceCookieOptions()
      )
      return fresh
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

  // Office pass for Caddy (see Caddyfile): a browser with a real office
  // session carries tk_hq, so the extra password prompt stops for it and
  // nobody else. Only ever set behind a verified session, re-issued on use,
  // and it lapses after 30 days like the session itself.
  const res = NextResponse.next()
  const hqPass = process.env.HQ_PASS
  if (hqPass) {
    res.cookies.set(HQ_PASS_COOKIE, hqPass, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 3600,
    })
  }
  return res
}

const HQ_PASS_COOKIE = "tk_hq"

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
