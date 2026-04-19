import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
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
    "/orders/:path*",
    "/labour/:path*",
    "/kitchen/:path*",
  ],
}
