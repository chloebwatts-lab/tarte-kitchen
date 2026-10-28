// Email files from accounts@ (the Kitchen Gmail connection) with images shown inline
// and every file attached, so the recipient can forward them on.
//
// Run on the droplet from /root/tarte-kitchen:
//   npx tsx scripts/send-with-attachments.ts --to chloe@tarte.com.au \
//     --subject "Venue results w/e Tue 27 October" --body-file /root/body.txt \
//     /root/cards/burleigh.png /root/cards/currumbin.png
//
// --body-file is plain text: blank lines separate paragraphs. PNG/JPEG files are
// shown inline in order under the text and are also listed as attachments; any
// other file (pdf, xlsx) is attached only. Only tarte.com.au recipients are allowed.
import "dotenv/config"
import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"
import { getActiveGmailConnection, getValidGmailAccessToken } from "../src/lib/gmail/token"

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".pdf": "application/pdf", ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

function parseArgs(argv: string[]) {
  const to: string[] = []
  let subject = "", bodyFile = ""
  const files: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--to") to.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean))
    else if (a === "--subject") subject = argv[++i]
    else if (a === "--body-file") bodyFile = argv[++i]
    else files.push(a)
  }
  if (!to.length || !subject || !bodyFile || !files.length) {
    throw new Error("usage: --to a@tarte.com.au[,b@tarte.com.au] --subject \"...\" --body-file body.txt file1 [file2 ...]")
  }
  for (const t of to) if (!/^[^@\s]+@tarte\.com\.au$/i.test(t)) throw new Error(`refusing non-Tarte recipient ${t}`)
  return { to, subject, bodyFile, files }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const wrap76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n")

async function main() {
  const { to, subject, bodyFile, files } = parseArgs(process.argv.slice(2))
  const conn = await getActiveGmailConnection()
  if (!conn) throw new Error("no gmail connection")
  const token = await getValidGmailAccessToken()
  const text = (await readFile(bodyFile, "utf-8")).trim()
  if (/—/.test(text) || /—/.test(subject)) throw new Error("em dash in body or subject")

  const parts = await Promise.all(files.map(async (f) => {
    const ext = extname(f).toLowerCase()
    return { name: basename(f), mime: MIME[ext] ?? "application/octet-stream", inline: /^image\//.test(MIME[ext] ?? ""), data: await readFile(f) }
  }))
  const stamp = Date.now().toString(36)
  const cids = parts.map((_, i) => `card${i}.${stamp}@tarte.com.au`)

  const paragraphs = text.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 12px 0;font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#2b2520">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")
  const images = parts.map((p, i) => p.inline
    ? `<div style="margin:18px 0"><img src="cid:${cids[i]}" alt="${esc(p.name)}" style="display:block;width:100%;max-width:760px;height:auto;border:0"></div>`
    : "").join("")
  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#ffffff">${paragraphs}${images}</body></html>`

  const alt = `alt_${stamp}`, rel = `rel_${stamp}`, mixed = `mixed_${stamp}`
  const lines: string[] = [
    `To: ${to.join(", ")}`,
    `From: ${conn.email}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    ``,
    `--${mixed}`,
    `Content-Type: multipart/related; boundary="${rel}"; type="multipart/alternative"`,
    ``,
    `--${rel}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    ``,
    `--${alt}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    wrap76(Buffer.from(text + "\n", "utf-8").toString("base64")),
    ``,
    `--${alt}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    wrap76(Buffer.from(html, "utf-8").toString("base64")),
    ``,
    `--${alt}--`,
    ``,
  ]
  parts.forEach((p, i) => {
    if (!p.inline) return
    lines.push(
      `--${rel}`,
      `Content-Type: ${p.mime}; name="${p.name}"`,
      `Content-ID: <${cids[i]}>`,
      `Content-Disposition: inline; filename="${p.name}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      wrap76(p.data.toString("base64")),
      ``,
    )
  })
  lines.push(`--${rel}--`, ``)
  parts.forEach((p) => {
    if (p.inline) return
    lines.push(
      `--${mixed}`,
      `Content-Type: ${p.mime}; name="${p.name}"`,
      `Content-Disposition: attachment; filename="${p.name}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      wrap76(p.data.toString("base64")),
      ``,
    )
  })
  lines.push(`--${mixed}--`, ``)

  const raw = Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url")
  const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`gmail send ${res.status}: ${body}`)
  console.log(`sent to ${to.join(", ")}: "${subject}" with ${parts.length} file(s) (${parts.map((p) => p.name).join(", ")})`)
  console.log(body)
}
main().catch((e) => { console.error(e); process.exit(1) })
