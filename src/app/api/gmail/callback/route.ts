export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/encryption"
import { getGmailRedirectUri } from "@/lib/gmail/client"

/**
 * Behind the Caddy reverse proxy inside docker-compose, Next.js sees the
 * request as coming to its internal bind (0.0.0.0:3000) rather than the
 * public host. Building redirects with `new URL(path, request.url)` leaks
 * that internal address into the Location header and the browser then
 * fails with ERR_SSL_PROTOCOL_ERROR trying to reach 0.0.0.0. Use the
 * configured public base URL instead.
 */
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
    return NextResponse.redirect(absoluteUrl("/settings/integrations?error=no_code", request))
  }

  const clientId = process.env.GMAIL_CLIENT_ID!
  const clientSecret = process.env.GMAIL_CLIENT_SECRET!
  const redirectUri = getGmailRedirectUri()

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenRes.ok) {
      const error = await tokenRes.text()
      console.error("Gmail token exchange failed:", error)
      return NextResponse.redirect(
        absoluteUrl("/settings/integrations?error=token_exchange_failed", request)
      )
    }

    const tokenData = await tokenRes.json()

    // Fetch the authenticated user's email address
    const profileRes = await fetch(
      "https://www.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )

    if (!profileRes.ok) {
      console.error("Gmail profile fetch failed:", await profileRes.text())
      return NextResponse.redirect(
        absoluteUrl("/settings/integrations?error=profile_fetch_failed", request)
      )
    }

    const profile = await profileRes.json()

    // Delete any existing connections (single-tenant)
    await db.gmailConnection.deleteMany()

    // Store encrypted tokens
    await db.gmailConnection.create({
      data: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
        email: profile.emailAddress,
      },
    })

    return NextResponse.redirect(
      absoluteUrl("/settings/integrations?gmail_connected=true", request)
    )
  } catch (err) {
    console.error("Gmail OAuth callback error:", err)
    return NextResponse.redirect(
      absoluteUrl("/settings/integrations?error=unexpected", request)
    )
  }
}
