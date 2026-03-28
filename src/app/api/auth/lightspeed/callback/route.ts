export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/lightspeed/token"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=no_code", request.url)
    )
  }

  const clientId = process.env.LIGHTSPEED_CLIENT_ID!
  const clientSecret = process.env.LIGHTSPEED_CLIENT_SECRET!
  const redirectUri = process.env.LIGHTSPEED_REDIRECT_URI!
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://cloud.lightspeedapp.com/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      const error = await tokenRes.text()
      console.error("Lightspeed token exchange failed:", error)
      return NextResponse.redirect(
        new URL("/settings/integrations?error=token_exchange_failed", request.url)
      )
    }

    const tokenData = await tokenRes.json()

    // Delete any existing connections (single-tenant — one connection at a time)
    await db.lightspeedConnection.deleteMany()

    // Store encrypted tokens
    await db.lightspeedConnection.create({
      data: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        businessId: tokenData.business_id ?? null,
        businessLocations: tokenData.locations ?? null,
      },
    })

    return NextResponse.redirect(
      new URL("/settings/integrations?connected=true", request.url)
    )
  } catch (err) {
    console.error("Lightspeed OAuth callback error:", err)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=unexpected", request.url)
    )
  }
}
