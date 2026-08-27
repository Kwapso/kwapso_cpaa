#!/usr/bin/env node
/**
 * kit-layout-codemod.mjs — move the app's imports onto the kit's v1.1.0+ layout.
 *
 *     node scripts/kit-layout-codemod.mjs --check   report only, write nothing
 *     node scripts/kit-layout-codemod.mjs           rewrite
 *
 * THE MOVE. The kit restructured after v1.0.0 to the four words the client uses:
 * `controls/` and `structures/` became one `components/`, and `tokens/`,
 * `icons/` and `motion/` moved under `foundations/`. Nothing inside those
 * folders was renamed — not one basename changed — so this is a pure folder
 * move and every one of the app's ~690 import sites follows it mechanically.
 *
 * WHY A SCRIPT AND NOT A `sed`. Because the interesting part is not the rewrite,
 * it is the PROOF. Every rewritten specifier is resolved against the vendored
 * tree on disk before anything is written, and a specifier that does not resolve
 * is a hard failure rather than a silently mangled import. A find-and-replace
 * would have produced a plausible diff and left the discovery to `tsc` — or, for
 * the CSS paths, to nobody at all.
 *
 * This is deliberately a ONE-SHOT migration script and not a permanent seam.
 * `scripts/design-imports.mjs` is the permanent one; this file can be deleted
 * once the tree is on the new layout and that script knows about it.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const KIT = join(ROOT, "shared", "ui")
const CHECK = process.argv.includes("--check")

const SKIP = new Set(["node_modules", ".next", "out", ".git"])
const walk = (d, out = []) => {
  if (!existsSync(d)) return out
  for (const e of readdirSync(d)) {
    if (SKIP.has(e)) continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|mjs|css)$/.test(e)) out.push(p)
  }
  return out
}

const files = ["web", "web-portal", "shared/web", "shared/rules"].flatMap((r) => walk(join(ROOT, r)))

/** Where each old tier went. Derived intent, verified below against the disk. */
const TIER = { controls: "components", structures: "components", icons: "foundations/icons" }

/** Does this specifier name something the vendored kit actually has? Import
 * specifiers carry no extension, so try the three shapes a bundler would. */
function resolves(spec) {
  const rel = spec.replace(/^@shared\/ui\//, "")
  const base = join(KIT, rel)
  return (
    existsSync(base) ||
    existsSync(base + ".ts") ||
    existsSync(base + ".tsx") ||
    existsSync(join(base, "index.ts")) ||
    existsSync(join(base, "index.tsx"))
  )
}

let rewritten = 0, filesTouched = 0
const unresolved = new Map()
const sourceLinesDropped = []

for (const path of files) {
  const before = readFileSync(path, "utf8")
  let after = before

  // 1 · module specifiers: @shared/ui/<tier>/… → @shared/ui/<new>/…
  after = after.replace(/@shared\/ui\/(controls|structures|icons)((?:\/[^"'`\s)]*)?)/g, (whole, tier, rest) => {
    const next = `@shared/ui/${TIER[tier]}${rest}`
    if (!resolves(next)) {
      unresolved.set(whole, (unresolved.get(whole) ?? 0) + 1)
      return whole
    }
    rewritten++
    return next
  })

  // 2 · the CSS @import paths into the foundations
  after = after.replace(/(shared\/ui\/)(tokens\/tokens\.css|motion\/motion\.css)/g, (_w, p, f) => {
    rewritten++
    return `${p}foundations/${f}`
  })

  /* 3 · THE @source LINES GO, and this is the one deletion in the migration.
     They told Tailwind which kit folders to scan for classes, and every consumer
     kept the list by hand — which is how this app came to list controls,
     structures and icons and NOT compositions, so a kit screen would have
     rendered with no classes at all. The kit ships its own @source list from
     v1.2.0 (foundations/tokens/tokens.css), resolved relative to itself, so
     importing the tokens now brings the scan with it. Keeping these would not
     break anything — Tailwind unions its sources — but a hand-kept copy of a
     list that now ships is exactly the thing that drifts. */
  after = after.replace(/^@source\s+"[^"]*shared\/ui\/[^"]*";\s*\n/gm, (m) => {
    sourceLinesDropped.push(`${path.replace(ROOT + "/", "")}: ${m.trim()}`)
    return ""
  })

  if (after !== before) {
    filesTouched++
    if (!CHECK) writeFileSync(path, after)
  }
}

console.log(`\nkit-layout-codemod${CHECK ? " (--check)" : ""}`)
console.log("-".repeat(30))
console.log(`  specifiers rewritten    ${rewritten}`)
console.log(`  files touched           ${filesTouched}`)
console.log(`  @source lines dropped   ${sourceLinesDropped.length}  (the kit ships its own now)`)
for (const l of sourceLinesDropped) console.log(`      ${l}`)

if (unresolved.size) {
  console.error(`\n  UNRESOLVED — these would not point at a real file, so they were LEFT ALONE:`)
  for (const [spec, n] of unresolved) console.error(`      ${spec}  ×${n}`)
  console.error(`\n  Nothing was half-written. Fix the mapping or the kit, then re-run.`)
  process.exit(1)
}
console.log(`\n  every rewritten specifier resolves against shared/ui on disk`)
console.log(CHECK ? "  --check: nothing written\n" : "  written\n")
