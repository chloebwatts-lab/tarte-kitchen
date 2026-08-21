import { db } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"

interface InboxTokenRow {
  access_token: string | null
  refresh_token: string | null
  expiry: Date | null
}

/**
 * Access token for hello@ from the tarte-inbox app's token store
 * (inbox_oauth_tokens, same Postgres). Reuses the stored token while fresh;
 * refreshes (and persists the refreshed token back for tarte-inbox) when we
 * have that app's OAuth client credentials in env
 * (INBOX_GMAIL_CLIENT_ID/SECRET). Returns null when hello@ can't be swept
 * this run — callers should skip the mailbox and say so in their response.
 */
export async function getHelloAccessToken(logPrefix = "hello-token"): Promise<string | null> {
  let rows: InboxTokenRow[]
  try {
    rows = await db.$queryRaw<InboxTokenRow[]>(
      Prisma.sql`SELECT access_token, refresh_token, expiry FROM inbox_oauth_tokens WHERE provider = 'google'`
    )
  } catch {
    // Table absent (tarte-inbox not installed) — nothing to sweep.
    return null
  }
  if (!rows.length) return null
  const { access_token, refresh_token, expiry } = rows[0]

  if (access_token && expiry && expiry.getTime() > Date.now() + 2 * 60 * 1000) {
    return access_token
  }

  const clientId = process.env.INBOX_GMAIL_CLIENT_ID
  const clientSecret = process.env.INBOX_GMAIL_CLIENT_SECRET
  if (!refresh_token || !clientId || !clientSecret) return null

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) {
    console.error(`[${logPrefix}] hello@ token refresh failed:`, await res.text())
    return null
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  await db.$executeRaw(
    Prisma.sql`UPDATE inbox_oauth_tokens
      SET access_token = ${data.access_token},
          expiry = ${new Date(Date.now() + data.expires_in * 1000)},
          updated_at = now()
      WHERE provider = 'google'`
  )
  return data.access_token
}
