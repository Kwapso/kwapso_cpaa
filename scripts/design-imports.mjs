#!/usr/bin/env node
/**
 * design-imports.mjs — repoint the two front doors at the vendored design kit.
 *
 * Idempotent and re-runnable on purpose: other lanes keep creating files that
 * import the OLD paths (`@kwapso/ui/registry/…`, `@shared/ui/registry/…`,
 * `lucide-react`), and after any merge somebody runs this again and the new
 * files are converted too. Running it twice changes nothing the second time —
 * every rewrite removes the pattern it matches on. It prints per-file counts.
 *
 * The mapping, derived from the kit's own tree at run time (never hardcoded,
 * so a component moving tiers upstream is followed automatically):
 *
 *   @kwapso/ui/X                         → @shared/ui/X   (then the rules below)
 *   …/registry/primitives/<x>/<f>        → @shared/ui/controls|structures/<x>/<f>  (probed on disk)
 *   …/registry/collections/<x>/<f>       → @shared/ui/structures|controls/<x>/<f>  (probed on disk)
 *   …/registry/collections/screen-renderer/* → @shared/web/screen-engine/screen-renderer
 *   …/lib/config | …/lib/recipe          → @shared/web/screen-engine/{config,recipe}
 *   …/registry/tokens/theme-provider     → @shared/web/theme-provider
 *   …/registry/primitives/notes/notes    → @shared/web/notes-editor/notes-editor
 *       (the OLD Notes is a rich-text editor; the kit's Notes is remark rows)
 *   TabsView / defaultTabsConfig / TabsConfig / TabItem  (from …/tabs/tabs)
 *                                        → @shared/web/screen-engine/tabs-view
 *   lucide-react names                   → @shared/ui/icons  (ALL of them — see below)
 *   @import "…shared/ui/styles.css"      → tokens.css + motion.css
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const KIT = join(ROOT, "shared", "ui")

const walk = (d, out = []) => {
  for (const e of readdirSync(d)) {
    if (["node_modules", ".next", "out", "dist", ".git"].includes(e)) continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** Named exports of the kit's icon barrel, read off the generated file. */
const iconNames = new Set(
  [...readFileSync(join(KIT, "foundations", "icons", "icons.generated.tsx"), "utf8").matchAll(/export (?:const|function) ([A-Za-z0-9_]+)/g)].map((m) => m[1])
)

/** The symbols that live in the engine's config-driven TabsView, not the kit's. */
const ENGINE_TABS = new Set(["TabsView", "defaultTabsConfig", "TabsConfig", "TabItem"])

const probe = (tiers, x, f) => {
  for (const t of tiers)
    for (const ext of [".tsx", ".ts"])
      if (existsSync(join(KIT, t, x, f + ext))) return `@shared/ui/${t}/${x}/${f}`
  return null
}

const mapSpec = (spec) => {
  let m
  if ((m = spec.match(/^@shared\/ui\/registry\/collections\/screen-renderer\/.+$/)))
    return "@shared/web/screen-engine/screen-renderer"
  if (spec === "@shared/ui/lib/config") return "@shared/web/screen-engine/config"
  if (spec === "@shared/ui/lib/recipe") return "@shared/web/screen-engine/recipe"
  if (spec === "@shared/ui/registry/tokens/theme-provider") return "@shared/web/theme-provider"
  if (spec === "@shared/ui/registry/primitives/notes/notes") return "@shared/web/notes-editor/notes-editor"
  if (spec === "@shared/ui/registry/collections/list/list") return "@shared/web/list-compat"
  if ((m = spec.match(/^@shared\/ui\/registry\/primitives\/([^/]+)\/(.+)$/))) return probe(["components"], m[1], m[2])
  if ((m = spec.match(/^@shared\/ui\/registry\/collections\/([^/]+)\/(.+)$/))) return probe(["components"], m[1], m[2])
  return null // not ours to touch
}

const parseNamed = (list) =>
  list.split(",").map((s) => s.trim()).filter(Boolean)

const nameOf = (item) => item.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim()

const unresolved = new Map()
const strayLucide = new Map()
let filesChanged = 0
let totalEdits = 0

const targets = ["web", "web-portal", "shared/web"].flatMap((d) => walk(join(ROOT, d)))

for (const file of targets) {
  const ext = extname(file)
  if (![".ts", ".tsx", ".css"].includes(ext)) continue
  let src = readFileSync(file, "utf8")
  const before = src
  let edits = 0

  if (ext === ".css") {
    src = src.replace(/@import\s+"([./]*)shared\/ui\/styles\.css";/g, (_, prefix) => {
      edits++
      return `@import "${prefix}shared/ui/foundations/tokens/tokens.css";\n@import "${prefix}shared/ui/foundations/motion/motion.css";`
    })
  } else {
    // one pass over every import/export-from statement
    src = src.replace(
      /((?:import|export)\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?)["']([^"']+)["']/g,
      (whole, head, spec) => {
        let s = spec.startsWith("@kwapso/ui/") ? spec.replace("@kwapso/ui/", "@shared/ui/") : spec

        if (s === "lucide-react") {
          const named = whole.match(/\{([^}]*)\}/s)
          if (!named) return whole
          const items = parseNamed(named[1])
          const inKit = items.filter((i) => iconNames.has(nameOf(i)))
          const notInKit = items.filter((i) => !iconNames.has(nameOf(i)))
          /* NOTHING STAYS ON LUCIDE. This used to split the import and leave
             the names the kit lacked pointing at lucide-react, logged for
             Aurora — correct while the kit drew 96 glyphs. It draws 1,383 now
             and lucide is not installed, so a name left behind is a build
             error rather than a note. Record it and fail; the fix is a glyph
             upstream or a different name, never a second icon package. */
          notInKit.forEach((i) => strayLucide.set(nameOf(i), (strayLucide.get(nameOf(i)) ?? 0) + 1))
          if (!inKit.length) return whole
          edits++
          const typePrefix = /^\s*import\s+type\s/.test(whole) ? "import type " : "import "
          return `${typePrefix}{ ${inKit.join(", ")} } from "@shared/ui/icons"`
        }

        if (!s.startsWith("@shared/ui/")) return whole

        // the tabs split: engine symbols leave for the engine, the rest go to the kit
        if (/^@shared\/ui\/registry\/primitives\/tabs\/tabs$/.test(s)) {
          const named = whole.match(/\{([^}]*)\}/s)
          if (named) {
            const items = parseNamed(named[1])
            const engine = items.filter((i) => ENGINE_TABS.has(nameOf(i)))
            const kit = items.filter((i) => !ENGINE_TABS.has(nameOf(i)))
            if (engine.length) {
              edits++
              const typePrefix = /^\s*import\s+type\s/.test(whole) ? "import type " : "import "
              const lines = [`${typePrefix}{ ${engine.join(", ")} } from "@shared/web/screen-engine/tabs-view"`]
              if (kit.length) lines.push(`${typePrefix}{ ${kit.join(", ")} } from "@shared/ui/components/tabs/tabs"`)
              return lines.join("\n")
            }
          }
        }

        const mapped = mapSpec(s)
        if (mapped) {
          if (mapped !== spec) edits++
          return whole.replace(/["'][^"']+["']$/, `"${mapped}"`)
        }
        if (s !== spec) {
          // @kwapso→@shared normalization alone still counts
          edits++
          return whole.replace(/["'][^"']+["']$/, `"${s}"`)
        }
        if (/^@shared\/ui\/(registry|lib)\//.test(s) && !existsSync(join(ROOT, s.replace("@shared/", "shared/") + ".ts")) && !existsSync(join(ROOT, s.replace("@shared/", "shared/") + ".tsx"))) {
          unresolved.set(s, (unresolved.get(s) ?? 0) + 1)
        }
        return whole
      }
    )
  }

  if (src !== before) {
    writeFileSync(file, src)
    filesChanged++
    totalEdits += edits
    console.log(`  ${file.replace(ROOT + "/", "")}  (${edits})`)
  }
}

console.log(`\ndesign-imports: ${filesChanged} files changed, ${totalEdits} rewrites`)
if (strayLucide.size) {
  console.log(`NO KIT GLYPH for: ${[...strayLucide.keys()].join(", ")}`)
  console.log("  lucide is not a dependency any more. Add the glyph upstream in Kwapso/kwapso-ui-ux, or use a name the kit draws.")
  process.exitCode = 1
}
if (unresolved.size) {
  console.log("UNRESOLVED old-kit specifiers (no kit target found):")
  for (const [s, n] of unresolved) console.log(`  ${s} ×${n}`)
  process.exitCode = 1
}
