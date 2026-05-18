export const dynamic = "force-dynamic"

import { getGbpRedirectUri } from "@/lib/gbp/token"

export async function POST() {
  const clientId = process.env.GMAIL_CLIENT_ID
  if (!clientId) {
    return Response.json(
      { error: "Google OAuth client is not configured" },
      { status: 500 }
    )
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", getGbpRedirectUri())
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/business.manage")
  authUrl.searchParams.set("access_type", "offline")
  // Force consent so Google issues a refresh token even if this Google
  // account previously authorised this client (refresh_token only comes
  // back on the first consent unless we explicitly re-prompt).
  authUrl.searchParams.set("prompt", "consent")

  return Response.json({ url: authUrl.toString() })
}
