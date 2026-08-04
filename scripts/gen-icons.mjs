// Regenerates the PWA PNG icons (manifest + iOS apple-touch) from the brand
// monogram SVGs (web/public/icons/*.svg). The PNGs are committed as static
// assets, so this is NOT part of build/deploy and `sharp` stays out of the
// project deps (used transitively here). Re-run after editing the SVGs or
// dropping in a real brand logo:  node scripts/gen-icons.mjs
import sharp from "sharp"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// THE BRAND MARK IS NEVER CLIPPED: every surface that shows the logo puts it in
// a ROUNDED box, so a mark drawn near full-bleed loses its corners. The mark is
// drawn at this ratio of its square — inside the largest circle the square
// contains (~0.707) with breathing room — and every renderer uses object-contain
// (never object-cover). Any logged percentage below DERIVES from this constant,
// so the log cannot lie about what was generated.
const LOGO_SAFE_RATIO = 0.76

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "public", "icons")
const rounded = readFileSync(join(dir, "icon.svg"))
const maskable = readFileSync(join(dir, "icon-maskable.svg"))

const jobs = [
  [rounded, 192, "icon-192.png"],
  [rounded, 512, "icon-512.png"],
  [maskable, 512, "icon-maskable-512.png"],
  [maskable, 180, "apple-touch-icon.png"], // iOS rounds it itself
]

for (const [svg, size, name] of jobs) {
  // The mark renders at LOGO_SAFE_RATIO of the square; the rest is safe margin
  // that survives every platform's corner rounding.
  const inner = Math.round(size * LOGO_SAFE_RATIO)
  const pad = Math.round((size - inner) / 2)
  const mark = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toFile(join(dir, name))
  console.log(`wrote ${name} ${size}x${size} (mark at ${Math.round(LOGO_SAFE_RATIO * 100)}% of square)`)
}
console.log("done")
