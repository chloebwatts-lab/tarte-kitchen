export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/encryption"
import { getGbpRedirectUri } from "@/lib/gbp/token"

function absoluteUrl(path: string, request: NextRequest): string {
  const base =
    process.env.NEXTAUTH_URL ??
    (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : null) ??
    request.nextUrl.origin
  return new URL(path, base).toString()
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(
      absoluteUrl("/settings/integrations?error=no_code", request)
    )
  }

  const clientId = process.env.GBP_CLIENT_ID!
  const clientSecret = process.env.GBP_CLIENT_SECRET!

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getGbpRedirectUri(),
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenRes.ok) {
      console.error("GBP token exchange failed:", await tokenRes.text())
      return NextResponse.redirect(
        absoluteUrl("/settings/integrations?error=gbp_token_exchange_failed", request)
      )
    }

    const tokenData = await tokenRes.json()

    if (!tokenData.refresh_token) {
      // Without a refresh token the cron can't run unattended. Google
      // omits it on consent re-grants when prompt=consent isn't honoured,
      // but the /auth route always passes prompt=consent so this should
      // only happen if the user denied offline access.
      return NextResponse.redirect(
        absoluteUrl("/settings/integrations?error=gbp_no_refresh_token", request)
      )
    }

    // Look up the email of the authorising user (display only). Userinfo
    // is the cheapest endpoint that works with any Google OAuth scope —
    // no extra scope needed beyond what we already requested.
    let email = "unknown"
    try {
      const userRes = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      )
      if (userRes.ok) {
        const u = await userRes.json()
        email = u.email ?? email
      }
    } catch {
      // Non-fatal — the connection still works without a known email.
    }

    // Single-tenant: drop any existing connection.
    await db.gbpConnection.deleteMany()
    await db.gbpConnection.create({
      data: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
        email,
      },
    })

    return NextResponse.redirect(
      absoluteUrl("/settings/integrations?gbp_connected=true", request)
    )
  } catch (err) {
    console.error("GBP OAuth callback error:", err)
    return NextResponse.redirect(
      absoluteUrl("/settings/integrations?error=gbp_unexpected", request)
    )
  }
}
