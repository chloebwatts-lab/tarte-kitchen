/**
 * One-off probe — search the connected Gmail for Lightspeed sender emails
 * and print the structure of the most recent one so we can design the
 * parser + UI around it.
 *
 * Run from inside the app container:
 *   docker exec tarte-kitchen-app-1 node /tmp/probe.cjs
 * Or locally with `tsx` if DATABASE_URL etc. are set.
 */
import { db } from "@/lib/db"
import { getValidGmailAccessToken } from "@/lib/gmail/token"
import { searchMessages, getMessage } from "@/lib/gmail/client"

const LIGHTSPEED_SENDERS = [
  "reports@lightspeed-hq.com",
  "no-reply@lightspeedhq.com",
  "noreply@lightspeedhq.com",
  "no-reply@lightspeed-retail.com",
  "noreply@lightspeed-retail.com",
  "no-reply@lightspeed.com",
  "noreply@lightspeed.com",
  "reports@lightspeedhq.com",
  "noreply@lsk.lightspeed.app",
  "reports@lsk.lightspeed.app",
]

;(async () => {
  try {
    const token = await getValidGmailAccessToken()

    // Try broad query first — any sender containing "lightspeed"
    const broadQuery = "from:lightspeed OR subject:(Lightspeed OR \"end of day\" OR EOD OR \"daily summary\")"
    const broad = await searchMessages(token, broadQuery, 10)
    console.log(`Broad query found ${broad.length} messages`)

    // Now the specific allowlist used by the cron
    const fromQuery = `from:(${LIGHTSPEED_SENDERS.join(" OR ")})`
    const specific = await searchMessages(token, fromQuery, 10)
    console.log(`Allowlist query found ${specific.length} messages`)

    const refs = broad.length > 0 ? broad : specific
    if (refs.length === 0) {
      console.log("\nNo Lightspeed emails found. Try searching manually with a different sender / subject.")
      return
    }

    // Fetch the most recent
    const msg = await getMessage(token, refs[0].id)
    const headers = msg.payload.headers
    const h = (name: string) =>
      headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value
    console.log("\n=== MOST RECENT LIGHTSPEED MESSAGE ===")
    console.log("From:   ", h("From"))
    console.log("Subject:", h("Subject"))
    console.log("Date:   ", h("Date"))
    console.log("To:     ", h("To"))

    // Walk MIME parts
    interface Part {
      mimeType?: string
      filename?: string
      body?: { size?: number; data?: string; attachmentId?: string }
      parts?: Part[]
    }
    const walk = (part: Part, depth = 0) => {
      const indent = "  ".repeat(depth)
      const size = part.body?.size ?? 0
      const att = part.body?.attachmentId ? " (attachment)" : ""
      console.log(
        `${indent}${part.mimeType ?? "?"} ${part.filename ? `[${part.filename}]` : ""} size=${size}${att}`
      )
      for (const sub of part.parts ?? []) walk(sub, depth + 1)
    }
    console.log("\nMIME tree:")
    walk(msg.payload as unknown as Part)

    // Peek HTML body if present
    const findHtml = (part: Part): string | null => {
      if (part.mimeType === "text/html" && part.body?.data) return part.body.data
      for (const sub of part.parts ?? []) {
        const found = findHtml(sub)
        if (found) return found
      }
      return null
    }
    const htmlB64 = findHtml(msg.payload as unknown as Part)
    if (htmlB64) {
      const html = Buffer.from(htmlB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
      console.log(`\n=== HTML body preview (first 4000 chars of ${html.length}) ===`)
      console.log(html.slice(0, 4000))
    }

    // Peek plaintext body if present
    const findText = (part: Part): string | null => {
      if (part.mimeType === "text/plain" && part.body?.data) return part.body.data
      for (const sub of part.parts ?? []) {
        const found = findText(sub)
        if (found) return found
      }
      return null
    }
    const textB64 = findText(msg.payload as unknown as Part)
    if (textB64) {
      const text = Buffer.from(textB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
      console.log(`\n=== PLAIN body preview (first 2000 chars of ${text.length}) ===`)
      console.log(text.slice(0, 2000))
    }
  } catch (err) {
    console.error("PROBE ERR:", (err as Error).message)
  } finally {
    await db.$disconnect()
  }
})()
