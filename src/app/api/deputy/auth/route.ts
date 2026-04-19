import { NextResponse } from "next/server"

/**
 * Kick off Deputy OAuth. Deputy authorises at once.deputy.com — the staff
 * member picks which install (subdomain) to grant. The callback at
 * /api/deputy/callback exchanges the code for tokens.
 *
 * Env required:
 *   DEPUTY_CLIENT_ID
 *   DEPUTY_CLIENT_SECRET
 *   DEPUTY_REDIRECT_URI     (defaults to https://kitchen.tarte.com.au/api/deputy/callback)
 */
export async function GET() {
  const clientId = process.env.DEPUTY_CLIENT_ID
  const redirectUri =
    process.env.DEPUTY_REDIRECT_URI ??
    "https://kitchen.tarte.com.au/api/deputy/callback"
  if (!clientId) {
    return NextResponse.json(
      { error: "DEPUTY_CLIENT_ID not configured" },
      { status: 500 }
    )
  }
  const url = new URL("https://once.deputy.com/my/oauth/login")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "longlife_refresh_token")
  return NextResponse.redirect(url.toString())
}
