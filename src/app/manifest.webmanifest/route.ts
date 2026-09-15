// Web app manifest for the STAFF home-screen app. start_url is the
// /staffaccess hub; scope "/" so hub links outside /kitchen (e.g. /log)
// stay inside the installed app. id stays "/kitchen" so existing installs
// keep their identity.
//
// Served as a plain route (not the app/manifest.ts convention) on purpose:
// the convention attaches <link rel="manifest"> to EVERY page, which put
// this staff manifest on the office pages too and made "Add to Home
// Screen" from /home install the staff app. Each section now links only
// its own manifest via its layout's metadata.
//
// Kept outside Caddy basic auth (with /icons/*); branding only, no data.
export const dynamic = "force-static"

export function GET() {
  const manifest = {
    name: "Tarte Kitchen",
    short_name: "Tarte",
    description: "Staff tools for Tarte Bakery & Cafe",
    id: "/kitchen",
    start_url: "/staffaccess",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#f6f5f2",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" },
  })
}
