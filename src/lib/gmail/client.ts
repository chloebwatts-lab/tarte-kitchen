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

export async function searchMessages(
  accessToken: string,
  query: string,
  maxResults = 50
): Promise<Array<{ id: string; threadId: string }>> {
  const url = new URL(`${GMAIL_API}/messages`)
  url.searchParams.set("q", query)
  url.searchParams.set("maxResults", String(maxResults))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Gmail search failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  return data.messages ?? []
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

  function walkParts(parts: GmailMessagePart[]) {
    for (const part of parts) {
      if (
        part.body?.attachmentId &&
        part.mimeType &&
        pdfTypes.has(part.mimeType)
      ) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename || "invoice.pdf",
          mimeType: part.mimeType,
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
