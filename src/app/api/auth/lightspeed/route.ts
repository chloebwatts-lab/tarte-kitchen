export const dynamic = "force-dynamic"

export async function POST() {
  const clientId = process.env.LIGHTSPEED_CLIENT_ID
  const redirectUri = process.env.LIGHTSPEED_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return Response.json(
      { error: "Lightspeed OAuth is not configured" },
      { status: 500 }
    )
  }

  const authUrl = new URL("https://cloud.lightspeedapp.com/oauth/authorize")
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("scope", "financial:read items:read")

  return Response.json({ url: authUrl.toString() })
}
