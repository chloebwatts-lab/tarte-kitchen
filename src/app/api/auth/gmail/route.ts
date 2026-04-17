export const dynamic = "force-dynamic"

import { getGmailRedirectUri } from "@/lib/gmail/client"

export async function POST() {
  const clientId = process.env.GMAIL_CLIENT_ID

  if (!clientId) {
    return Response.json(
      { error: "Gmail OAuth is not configured" },
      { status: 500 }
    )
  }

  const redirectUri = getGmailRedirectUri()

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set(
    "scope",
    [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ].join(" ")
  )
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent") // Force consent to ensure refresh token

  return Response.json({ url: authUrl.toString() })
}
