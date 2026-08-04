import type { MetadataRoute } from "next"

// Web app manifest for the staff home-screen app. start_url/scope point at
// /kitchen (the staff tools area — checklists, prep, restock, serves, fix,
// training). Admin pages stay a normal browser URL; installing from any page
// still lands staff on /kitchen.
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
    start_url: "/kitchen",
    scope: "/kitchen",
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
