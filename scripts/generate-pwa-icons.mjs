// Generate the PWA home-screen icons for the staff app (/kitchen).
//
// Renders a simple "Ta." wordmark in white on a duck egg background
// (Chloe's pick, 2026-08-05), using sharp (already present as Next's
// image-optimisation dependency) to rasterise an SVG at each size.
//
// Run from the repo root:  node scripts/generate-pwa-icons.mjs
// Output: public/icons/icon-192.png, icon-512.png,
//         icon-maskable-192.png, icon-maskable-512.png,
//         apple-touch-icon.png (180x180)
//
// Icons are committed, so this only needs re-running if the brand changes.

import sharp from "sharp"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "icons"
)

const DUCK_EGG = "#a9cdc9"
const WHITE = "#ffffff"

// scale < 1 shrinks the mark into the maskable safe zone (inner ~80%).
function markSvg(size, scale = 1) {
  const fontSize = Math.round(size * 0.5 * scale)
  // Nudge down slightly so the cap-height sits optically centred.
  const baselineY = Math.round(size * 0.5 + fontSize * 0.34)
  const centerX = Math.round(size * 0.5)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${DUCK_EGG}"/>
  <text x="${centerX}" y="${baselineY}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-weight="600"
        font-size="${fontSize}" letter-spacing="${-fontSize * 0.03}"
        fill="${WHITE}">Ta.</text>
</svg>`
}

async function render(name, size, scale) {
  const png = await sharp(Buffer.from(markSvg(size, scale)), { density: 300 })
    .resize(size, size)
    .png()
    .toBuffer()
  await sharp(png).toFile(path.join(outDir, name))
  console.log(`wrote public/icons/${name}`)
}

await mkdir(outDir, { recursive: true })
await render("icon-192.png", 192, 1)
await render("icon-512.png", 512, 1)
await render("icon-maskable-192.png", 192, 0.72)
await render("icon-maskable-512.png", 512, 0.72)
await render("apple-touch-icon.png", 180, 0.92)
console.log("done")
