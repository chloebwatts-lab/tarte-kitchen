const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me"

export function getGmailRedirectUri(): string {
  return (
    process.env.GMAIL_REDIRECT_URI ??
    "https://kitchen.tarte.com.au/api/gmail/callback"
  )
}

interface GmailMessagePart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: Array<{ name: string; value: string }>
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: GmailMessagePart[]
}

interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  payload: {
    partId?: string
    mimeType?: string
    filename?: string
    headers: Array<{ name: string; value: string }>
    body?: { size?: number; data?: string }
    parts?: GmailMessagePart[]
  }
  internalDate: string
}

export function getHeader(message: GmailMessage, name: string): string | undefined {
  return message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value
}

/**
 * Searches Gmail. `maxResults` is the hard cap on what we'll return —
 * we paginate via Gmail's `nextPageToken` to collect up to that many
 * messages. The 500-page per request hard cap from Gmail still applies
 * per page, so for `maxResults=500` we make 1-5 round trips. Important
 * for backfills: the previous "first 50 only" behaviour silently
 * dropped older invoices when there were more than 50 unread.
 */
export async function searchMessages(
  accessToken: string,
  query: string,
  maxResults = 50
): Promise<Array<{ id: string; threadId: string }>> {
  const out: Array<{ id: string; threadId: string }> = []
  let pageToken: string | undefined

  while (out.length < maxResults) {
    const url = new URL(`${GMAIL_API}/messages`)
    url.searchParams.set("q", query)
    // Gmail's per-request max is 500; ask for what we need vs that cap.
    const remaining = maxResults - out.length
    url.searchParams.set("maxResults", String(Math.min(remaining, 500)))
    if (pageToken) url.searchParams.set("pageToken", pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      throw new Error(`Gmail search failed: ${res.status} ${await res.text()}`)
    }
    const data = (await res.json()) as {
      messages?: Array<{ id: string; threadId: string }>
      nextPageToken?: string
    }
    if (data.messages?.length) {
      out.push(...data.messages)
    }
    if (!data.nextPageToken || !data.messages?.length) break
    pageToken = data.nextPageToken
  }

  return out.slice(0, maxResults)
}

export async function getMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Gmail getMessage failed: ${res.status} ${await res.text()}`)
  }

  return res.json()
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const res = await fetch(
    `${GMAIL_API}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    throw new Error(`Gmail getAttachment failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  // Gmail uses URL-safe base64
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(base64, "base64")
}

export interface PdfAttachmentInfo {
  attachmentId: string
  filename: string
  mimeType: string
}

export function extractPdfAttachments(message: GmailMessage): PdfAttachmentInfo[] {
  const attachments: PdfAttachmentInfo[] = []
  const pdfTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ])

  // Some suppliers (Pacific Wholesale, The Provedores, etc.) send PDF
  // attachments with mimeType "application/octet-stream" instead of
  // "application/pdf". Trust the filename in that case so we don't
  // silently drop the invoice. Discovered 2026-05-17 — both suppliers'
  // invoice flows had broken on 14/15 Apr when their billing provider
  // switched mimetype headers.
  function isPdfAttachment(part: GmailMessagePart): boolean {
    if (!part.body?.attachmentId || !part.mimeType) return false
    if (pdfTypes.has(part.mimeType)) return true
    if (
      part.mimeType === "application/octet-stream" &&
      /\.(pdf|xlsx?)$/i.test(part.filename ?? "")
    ) {
      return true
    }
    return false
  }

  function walkParts(parts: GmailMessagePart[]) {
    for (const part of parts) {
      if (isPdfAttachment(part)) {
        attachments.push({
          attachmentId: part.body!.attachmentId!,
          filename: part.filename || "invoice.pdf",
          mimeType: part.mimeType!,
        })
      }
      if (part.parts) {
        walkParts(part.parts)
      }
    }
  }

  if (message.payload.parts) {
    walkParts(message.payload.parts)
  }

  return attachments
}

export function extractSenderEmail(message: GmailMessage): string | null {
  const from = getHeader(message, "From")
  if (!from) return null
  // Extract email from "Name <email>" or bare "email"
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : from.toLowerCase().trim()
}

export function extractSenderName(message: GmailMessage): string | null {
  const from = getHeader(message, "From")
  if (!from) return null
  // Extract display name from "Name <email>" format
  const match = from.match(/^(.+?)\s*</)
  if (!match) return null
  // Strip surrounding quotes if present
  return match[1].replace(/^["']|["']$/g, "").trim() || null
}
