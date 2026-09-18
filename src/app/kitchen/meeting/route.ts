import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * Management meeting deck. A plain HTML file (public/meeting/<slug>/index.html)
 * served from inside the staff gate so its showcase slides can frame the live
 * /kitchen pages same-origin, sharing the login cookie. Edit the HTML, redeploy.
 * ?deck=<slug> picks another month; default is the latest.
 */
const LATEST = "2026-09"

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("deck") ?? LATEST
  if (!/^[\w-]+$/.test(slug)) return new Response("Not found", { status: 404 })
  try {
    const file = path.join(process.cwd(), "public", "meeting", slug, "index.html")
    const html = await readFile(file, "utf8")
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
