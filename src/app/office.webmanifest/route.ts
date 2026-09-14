// Web app manifest for the OFFICE home-screen app (the admin side behind
// basic auth), separate from the staff one in src/app/manifest.ts so both
// can sit on one phone as two icons. start_url is the tiled /home page.
// Kept outside Caddy basic auth (see Caddyfile) so the install prompt
// works; branding only, no data.
export const dynamic = "force-static"

export function GET() {
  const manifest = {
    name: "Tarte HQ",
    short_name: "Tarte HQ",
    description: "Tarte Kitchen: costing, ordering, labour and spend",
    id: "/home",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#3c3e3f",
    icons: [
      { src: "/icons/office-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/office-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/office-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/office-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" },
  })
}
