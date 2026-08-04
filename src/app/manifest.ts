import type { MetadataRoute } from "next"

// Web app manifest for the staff home-screen app. start_url points at the
// /staffaccess hub (every staff tool on one page); scope is "/" so hub
// links outside /kitchen (e.g. /log wastage) stay inside the installed app.
// Admin pages stay behind basic auth either way. id stays "/kitchen" so
// existing installs keep their identity and pick up the new start URL.
//
// Served at /manifest.webmanifest — kept outside Caddy basic auth (with
// /icons/*) so install works from the public staff area without a login
// prompt. It contains branding only, no data.
export default function manifest(): MetadataRoute.Manifest {
  return {
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
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
