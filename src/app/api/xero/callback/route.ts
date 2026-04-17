import { NextRequest, NextResponse } from "next/server"
import { exchangeXeroCode, getXeroTenants } from "@/lib/xero/client"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?xero=error&reason=${error ?? "no_code"}`, request.url)
    )
  }

  try {
    const tokenData = await exchangeXeroCode(code)
    const tenants = await getXeroTenants(tokenData.access_token)

    if (!tenants.length) {
      return NextResponse.redirect(
        new URL("/settings/integrations?xero=error&reason=no_tenants", request.url)
      )
    }

    const tenant = tenants.find((t) => t.tenantType === "ORGANISATION") ?? tenants[0]

    const existing = await (db as any).xeroConnection.findFirst()
    const data = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      tenantId: tenant.tenantId,
      organisationName: tenant.tenantName,
    }

    if (existing) {
      await (db as any).xeroConnection.update({ where: { id: existing.id }, data })
    } else {
      await (db as any).xeroConnection.create({ data })
    }

    return NextResponse.redirect(
      new URL("/settings/integrations?xero=connected", request.url)
    )
  } catch (err) {
    console.error("[xero-callback]", err)
    return NextResponse.redirect(
      new URL("/settings/integrations?xero=error&reason=server_error", request.url)
    )
  }
}
