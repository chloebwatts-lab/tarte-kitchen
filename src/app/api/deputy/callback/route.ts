import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/encryption"

/**
 * Behind the Caddy reverse proxy inside docker-compose, Next.js sees the
 * request as coming to its internal bind (0.0.0.0:3000) rather than the
 * public host. Building redirects with `new URL(path, request.url)` leaks
 * that internal address into the Location header and the browser fails
 * with ERR_CONNECTION_REFUSED on 0.0.0.0. Use the configured public
 * base URL instead.
 */
function absoluteUrl(path: string, request: NextRequest): string {
  const base =
    process.env.NEXTAUTH_URL ||
    (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : null) ||
    request.nextUrl.origin
  return new URL(path, base).toString()
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const deputyError = request.nextUrl.searchParams.get("error")
  const deputyErrorDesc = request.nextUrl.searchParams.get("error_description")

  // Log everything we got — this is invaluable when Deputy redirects us
  // back with a non-standard error format.
  console.log("[deputy/callback] incoming", {
    code: code ? `${code.slice(0, 8)}…` : null,
    error: deputyError,
    error_description: deputyErrorDesc,
    allParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
  })

  if (deputyError) {
    const msg = deputyErrorDesc || deputyError
    return NextResponse.redirect(
      absoluteUrl(
        `/settings/integrations?error=deputy_${deputyError}&msg=${encodeURIComponent(msg.slice(0, 200))}`,
        request
      )
    )
  }

  if (!code) {
    return NextResponse.redirect(
      absoluteUrl("/settings/integrations?error=missing_code", request)
    )
  }

  const installHost = process.env.DEPUTY_INSTALL
  if (!installHost) {
    return NextResponse.redirect(
      absoluteUrl(
        "/settings/integrations?error=deputy_install_not_configured",
        request
      )
    )
  }

  const redirectUri =
    process.env.DEPUTY_REDIRECT_URI ||
    "https://kitchen.tarte.com.au/api/deputy/callback"

  // Install-local token endpoint. Per Deputy docs, path is
  // /oauth/access_token (no /exec/ prefix, unlike the authorize URL).
  const tokenRes = await fetch(
    `https://${installHost}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DEPUTY_CLIENT_ID ?? "",
        client_secret: process.env.DEPUTY_CLIENT_SECRET ?? "",
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "longlife_refresh_token",
      }).toString(),
    }
  )
  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return NextResponse.redirect(
      absoluteUrl(
        `/settings/integrations?error=token_exchange&msg=${encodeURIComponent(text.slice(0, 120))}`,
        request
      )
    )
  }
  const token = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    endpoint?: string
  }

  // Parse install + region from DEPUTY_INSTALL (the env var we trust) or
  // from Deputy's endpoint field if the env var isn't in the expected
  // {install}.{region}.deputy.com form.
  const hostMatch = installHost.match(/^([^.]+)\.([^.]+)\.deputy\.com$/i)
  let install = hostMatch?.[1] ?? "tarte"
  let region = hostMatch?.[2] ?? "au"
  if (!hostMatch && token.endpoint) {
    const m = token.endpoint.match(/^https?:\/\/([^.]+)\.([^.]+)\.deputy\.com/)
    if (m) {
      install = m[1]
      region = m[2]
    }
  }

  // Only one connection row — overwrite if it exists.
  const existing = await db.deputyConnection.findFirst()
  const data = {
    install,
    region,
    accessToken: encrypt(token.access_token),
    refreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
    tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
  }
  if (existing) {
    await db.deputyConnection.update({
      where: { id: existing.id },
      data,
    })
  } else {
    await db.deputyConnection.create({ data })
  }

  return NextResponse.redirect(
    absoluteUrl("/settings/integrations?connected=deputy", request)
  )
}
