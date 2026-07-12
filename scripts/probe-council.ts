import "dotenv/config"
import { createHmac } from "node:crypto"

const secret = process.env.NEXTAUTH_SECRET || process.env.COUNCIL_PASSWORD
if (!secret) throw new Error("no secret")
const expiresAt = String(Date.now() + 3600_000)
const sig = createHmac("sha256", secret).update(expiresAt).digest("hex")
const cookie = `council_session=${expiresAt}.${sig}`

const base = "http://localhost:3000"
const paths = ["/council", "/council/BURLEIGH", "/council/BEACH_HOUSE", "/council/TEA_GARDEN"]

async function main() {
  for (const p of paths) {
    try {
      const res = await fetch(base + p, { headers: { cookie }, redirect: "manual" })
      const body = await res.text()
      const errMatch = body.match(/(Error:[^<\n]{0,200}|Application error|digest[^<\n]{0,80})/i)
      console.log(`${p}  ->  ${res.status} ${res.statusText}  (${body.length} bytes)${errMatch ? "  ⚠ " + errMatch[0] : ""}`)
    } catch (e) {
      console.log(`${p}  ->  FETCH FAILED: ${(e as Error).message}`)
    }
  }
}
main()
