import { NextResponse } from "next/server"

/**
 * Kick off Deputy OAuth.
 *
 * Deputy has two OAuth flavours:
 *   - Marketplace apps: authorise at once.deputy.com (user picks install).
 *   - Install-local apps (registered via {install}/exec/devapp/oauth_clients,
 *     which is what Tarte has): authorise at the install's own hostname.
 *
 * We use install-local because that's what the admin UI registered. Set
 * DEPUTY_INSTALL on the droplet to the hostname you see when logged in,
 * e.g. "6a528b02100903.au.deputy.com".
 *
 * Env:
 *   DEPUTY_CLIENT_ID       (required)
 *   DEPUTY_CLIENT_SECRET   (used in callback)
 *   DEPUTY_INSTALL         (required — hostname of your Deputy install)
 *   DEPUTY_REDIRECT_URI    (defaults to https://kitchen.tarte.com.au/api/deputy/callback)
 */
export async function GET() {
  const clientId = process.env.DEPUTY_CLIENT_ID
  const install = process.env.DEPUTY_INSTALL
  const redirectUri =
    process.env.DEPUTY_REDIRECT_URI ??
    "https://kitchen.tarte.com.au/api/deputy/callback"
  if (!clientId) {
    return NextResponse.json(
      { error: "DEPUTY_CLIENT_ID not configured" },
      { status: 500 }
    )
  }
  if (!install) {
    return NextResponse.json(
      {
        error:
          "DEPUTY_INSTALL not configured — set it to the hostname of your Deputy install, e.g. '6a528b02100903.au.deputy.com'",
      },
      { status: 500 }
    )
  }

  // Install-local authorise endpoint — /my/oauth/login on the install's
  // own hostname. Hitting this while logged-in to the install serves the
  // consent screen directly. Hitting the equivalent once.deputy.com URL
  // leaves Deputy unable to resolve which install the client belongs to
  // (empty "Select business" dropdown).
  const url = new URL(`https://${install}/my/oauth/login`)
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "longlife_refresh_token")
  return NextResponse.redirect(url.toString())
}
