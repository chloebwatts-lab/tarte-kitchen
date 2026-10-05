// Home-screen icons for the single-purpose apps, drawn as one family with
// the "Ta." staff and office icons (scripts/generate-pwa-icons.mjs): same
// serif wordmark, one word each, told apart by colour (Chloe, 5 Oct 2026).
//
//   Prep   white on deep duck egg     -> public/icons/prep-*
//   Sales  gold $$ on charcoal        -> public/icons/sales-*
//   Shifts deep duck egg on white     -> ../tarte-shifts/public/icons/*
//
// Run from the repo root:  node scripts/generate-app-icons.mjs
import sharp from "sharp"
import path from "node:path"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEEP_DUCK_EGG = "#6fa8a1"
const CHARCOAL = "#3c3e3f"
const GOLD = "#dfc566"
const WHITE = "#ffffff"

// widthFrac: how much of the icon the word spans; maskable icons shrink it
// into the safe zone.
function svg(size, { text, bg, fg, emPerChar, widthFrac }) {
  const fontSize = Math.round((size * widthFrac) / (text.length * emPerChar))
  const baselineY = Math.round(size * 0.5 + fontSize * 0.33)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <text x="${size / 2}" y="${baselineY}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-weight="600"
        font-size="${fontSize}" letter-spacing="${-fontSize * 0.02}" fill="${fg}">${text}</text>
</svg>`
}

async function render(dir, name, size, spec, shrink = 1) {
  const s = { ...spec, widthFrac: spec.widthFrac * shrink }
  await sharp(Buffer.from(svg(size, s)), { density: 300 }).resize(size, size).png().toFile(path.join(dir, name))
  console.log(`wrote ${path.relative(root, path.join(dir, name))}`)
}

async function family(dir, prefix, spec, maskableName = (n) => `${prefix}maskable-${n}.png`) {
  await render(dir, `${prefix}icon-192.png`, 192, spec)
  await render(dir, `${prefix}icon-512.png`, 512, spec)
  await render(dir, maskableName(192), 192, spec, 0.8)
  await render(dir, maskableName(512), 512, spec, 0.8)
  await render(dir, `${prefix}apple-touch-icon.png`, 180, spec)
}

const kitchenIcons = path.join(root, "public", "icons")
await family(kitchenIcons, "prep-", { text: "Prep", bg: DEEP_DUCK_EGG, fg: WHITE, emPerChar: 0.56, widthFrac: 0.7 })
await family(kitchenIcons, "sales-", { text: "$$", bg: CHARCOAL, fg: GOLD, emPerChar: 0.6, widthFrac: 0.56 })

const shiftsIcons = path.join(root, "..", "tarte-shifts", "public", "icons")
if (existsSync(shiftsIcons)) {
  await family(shiftsIcons, "", { text: "Shifts", bg: WHITE, fg: DEEP_DUCK_EGG, emPerChar: 0.5, widthFrac: 0.76 }, (n) => `icon-maskable-${n}.png`)
}
