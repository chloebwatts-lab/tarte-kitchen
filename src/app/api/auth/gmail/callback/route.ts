export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/encryption"
import { getGmailRedirectUri } from "@/lib/gmail/client"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=no_code", request.url)
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
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
        new URL("/settings/integrations?error=token_exchange_failed", request.url)
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
        new URL("/settings/integrations?error=profile_fetch_failed", request.url)
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
      new URL("/settings/integrations?gmail_connected=true", request.url)
    )
  } catch (err) {
    console.error("Gmail OAuth callback error:", err)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=unexpected", request.url)
    )
  }
}
