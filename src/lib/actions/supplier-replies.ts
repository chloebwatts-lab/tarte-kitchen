"use server"

import { db } from "@/lib/db"
import { getValidGmailAccessToken, getActiveGmailConnection } from "@/lib/gmail/token"
import {
  searchMessages,
  getMessage,
  getHeader,
  extractSenderEmail,
  extractSenderName,
} from "@/lib/gmail/client"

export interface SupplierReply {
  messageId: string
  threadId: string
  /** ISO timestamp from Gmail's internalDate. */
  sentAt: string
  fromName: string | null
  fromEmail: string | null
  /** Supplier we matched on (by email-domain heuristic), or null if no match. */
  supplierName: string | null
  subject: string | null
  snippet: string
  /** Built so the UI can deep-link straight to Gmail. */
  gmailUrl: string
}

export interface SupplierRepliesResult {
  connected: boolean
  /** Gmail account used for the query — useful when staff hot-swap accounts. */
  account: string | null
  daysBack: number
  domainsSearched: string[]
  replies: SupplierReply[]
  /** Set when the Gmail call threw — surfaces the reason without crashing the page. */
  error: string | null
}

/**
 * Pull recent emails from supplier domains so the user can scan for
 * price-quote replies without leaving the app. Domains are derived
 * from the live Supplier table — whatever's in `Supplier.email`
 * becomes a domain filter. That way new suppliers don't need a code
 * change to start showing up here.
 */
export async function getSupplierReplies(params?: {
  daysBack?: number
  maxResults?: number
}): Promise<SupplierRepliesResult> {
  const daysBack = params?.daysBack ?? 14
  const maxResults = params?.maxResults ?? 40

  const connection = await getActiveGmailConnection()
  if (!connection) {
    return {
      connected: false,
      account: null,
      daysBack,
      domainsSearched: [],
      replies: [],
      error: null,
    }
  }

  // Unique domains from active supplier emails. We dedupe so a supplier
  // with multiple contacts at the same domain doesn't blow up the query.
  const suppliers = await db.supplier.findMany({
    where: { email: { not: null } },
    select: { name: true, email: true },
  })
  const domainToSupplier = new Map<string, string>()
  for (const s of suppliers) {
    const domain = s.email?.split("@")[1]?.toLowerCase().trim()
    if (!domain) continue
    // Skip Google's catch-all and personal domains — they'd return too
    // much noise (a personal gmail contact ≠ a supplier).
    if (
      domain === "gmail.com" ||
      domain === "googlemail.com" ||
      domain === "outlook.com" ||
      domain === "hotmail.com" ||
      domain === "icloud.com"
    ) {
      continue
    }
    if (!domainToSupplier.has(domain)) domainToSupplier.set(domain, s.name)
  }
  const domains = Array.from(domainToSupplier.keys())

  if (domains.length === 0) {
    return {
      connected: true,
      account: connection.email,
      daysBack,
      domainsSearched: [],
      replies: [],
      error: null,
    }
  }

  try {
    const accessToken = await getValidGmailAccessToken()
    const fromClause = domains.map((d) => `from:${d}`).join(" OR ")
    const query = `(${fromClause}) newer_than:${daysBack}d -category:promotions`
    const ids = await searchMessages(accessToken, query, maxResults)

    const messages = await Promise.all(
      ids.map((m) => getMessage(accessToken, m.id)),
    )

    const replies: SupplierReply[] = messages.map((m) => {
      const fromEmail = extractSenderEmail(m)
      const domain = fromEmail?.split("@")[1]?.toLowerCase() ?? null
      const supplierName = domain ? (domainToSupplier.get(domain) ?? null) : null
      const subject = getHeader(m, "Subject") ?? null
      // `snippet` isn't in our local GmailMessage type but Gmail returns it.
      const snippet = (m as unknown as { snippet?: string }).snippet ?? ""
      return {
        messageId: m.id,
        threadId: m.threadId,
        sentAt: new Date(Number(m.internalDate)).toISOString(),
        fromName: extractSenderName(m),
        fromEmail,
        supplierName,
        subject,
        snippet,
        gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${m.threadId}`,
      }
    })

    replies.sort((a, b) => b.sentAt.localeCompare(a.sentAt))

    return {
      connected: true,
      account: connection.email,
      daysBack,
      domainsSearched: domains,
      replies,
      error: null,
    }
  } catch (err) {
    return {
      connected: true,
      account: connection.email,
      daysBack,
      domainsSearched: domains,
      replies: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
