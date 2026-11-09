export const dynamic = "force-dynamic"

import { expectedGmailMailbox, getGmailRedirectUri } from "@/lib/gmail/client"

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
      "https://www.googleapis.com/auth/gmail.send",
      // Trash only: lets the apps trash their own Sent copies of profit and
      // earnings emails from the shared accounts@ mailbox (Chloe's rule 5,
      // 9 Nov 2026). See src/lib/gmail/sent-tidy.ts. Nothing permanently
      // deletes; Gmail empties Trash after 30 days.
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ].join(" ")
  )
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent") // Force consent to ensure refresh token
  // Pre-select the shared mailbox so a signed-in owner account is not
  // picked by mistake (the callback also refuses a different mailbox).
  authUrl.searchParams.set("login_hint", expectedGmailMailbox())

  return Response.json({ url: authUrl.toString() })
}
