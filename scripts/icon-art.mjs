#!/usr/bin/env node
/**
 * icon-art.mjs — stand real art in front of the kit's undrawn icons.
 *
 * WHY THIS EXISTS
 * The kit at v1.0.0 ships 96 icon NAMES and no icon ART. Its own
 * icons/ICON-LANGUAGE.md says so in bold — "Status: analysis and
 * specification only. No glyph has been drawn." — and its verdict line reads
 * "13 REUSE · 7 SUBSTITUTE · 73 DRAW". Every one of the 96 .svg files is the
 * same placeholder: a rounded square with a few dots in it. Rendered, an app
 * with 138 icon call sites looks unfinished at every one of them.
 *
 * The kit anticipated this. generate-icons.mjs states the swap procedure —
 * "drop the real <Name>.svg files over the placeholders, run this script,
 * done" — and notes the art may arrive on ANY grid, naming lucide's 24 as an
 * example. This script is that swap, performed with lucide's art, which is
 * what both front doors drew with before the swap and what CLAUDE.md's action
 * mapping still names.
 *
 * WHY IT IS A STAGE OF THE SYNC AND NOT A HAND-EDIT
 * web/test/vendored-kit.test.ts hashes shared/ui/ and goes red on a byte that
 * sync-design.mjs did not write. That guard is right, and this does not defeat
 * it: sync-design.mjs runs this stage itself, before it takes the hash, so the
 * recorded hash covers the substituted art and a genuine hand-edit still goes
 * red. Re-running the sync reproduces the same bytes.
 *
 * IT REMOVES ITSELF
 * Substitution is keyed on the placeholder's own signature. When Aurora ships
 * drawn art in v1.1.0, the signature stops matching, nothing is substituted,
 * and `substituted: 0` lands in VERSION.json — at which point this file and
 * its test can be deleted. It cannot silently paint over real art.
 *
 *     node scripts/icon-art.mjs           substitute, then regenerate
 *     node scripts/icon-art.mjs --check   report only, write nothing
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ICONS = join(ROOT, "shared", "ui", "icons")
/** lucide ships one ES module per glyph, each exporting its `__iconNode`. */
const LUCIDE = join(ROOT, "node_modules", "lucide-react", "dist", "esm", "icons")

/**
 * The placeholder's signature: the opening of the rounded-square outline every
 * one of the 96 files draws. Matched as a substring of the file, not as a
 * whole-file compare, because each placeholder scatters a different number of
 * dots inside the same square — the square is the constant.
 */
const PLACEHOLDER = "M6.6 1.5h15.15a5.1 5.1 0 0 1 5.1 5.1v15.15"

/**
 * The signature this script's own output carries. Named so a later reader can
 * tell a stood-in glyph from a drawn one WITHOUT consulting VERSION.json —
 * three states, not two, because "not a placeholder" and "Aurora drew it" are
 * different sentences and only one of them means the commission is finished.
 */
const STAND_IN = '<g fill="none" stroke="currentColor" stroke-width="2"'


/**
 * The three commission names lucide has since RENAMED. The old names are the
 * ones the kit fixed, so the alias is read here rather than anywhere downstream.
 */
const ALIAS = {
  Home: "house",            // lucide deprecated Home in favour of House
  Loader2: "loader-circle", // Loader2 -> LoaderCircle
  MoreHorizontal: "ellipsis",
}

/** `Building2` -> `building-2`, `UserRound` -> `user-round`. lucide's own file naming. */
export const kebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d)/g, "$1-$2")
    .toLowerCase()

/** One lucide node -> one SVG element. `key` is React's, never SVG's. */
function element([tag, attrs]) {
  const at = Object.entries(attrs)
    .filter(([k]) => k !== "key")
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ")
  return `<${tag} ${at}/>`
}

/**
 * lucide art is STROKED; the kit's component sets `fill="currentColor"` on the
 * root <svg>. So the art is wrapped in a <g> that names its own fill and
 * stroke — a child's attributes beat an inherited one, which is how stroked
 * art rides a component built for filled art without touching the component.
 */
function svgFor(nodes) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    nodes.map(element).join("") +
    `</g></svg>\n`
  )
}

export async function substitute({ check = false } = {}) {
  const names = readdirSync(ICONS)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.slice(0, -4))
    .sort()

  const done = []
  const stoodIn = []
  const drawn = []
  const missing = []

  for (const name of names) {
    const path = join(ICONS, `${name}.svg`)
    const raw = readFileSync(path, "utf8")
    if (raw.includes(STAND_IN)) {
      stoodIn.push(name)
      continue
    }
    if (!raw.includes(PLACEHOLDER)) {
      drawn.push(name)
      continue
    }
    const art = join(LUCIDE, `${ALIAS[name] ?? kebab(name)}.mjs`)
    if (!existsSync(art)) {
      missing.push(name)
      continue
    }
    const { __iconNode: nodes } = await import(pathToFileURL(art).href)
    if (!Array.isArray(nodes) || nodes.length === 0) {
      missing.push(name)
      continue
    }
    if (!check) writeFileSync(path, svgFor(nodes))
    done.push(name)
  }

  return { total: names.length, substituted: done, stoodIn, drawn, missing }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check")
  const r = await substitute({ check })

  console.log("\nicon-art: " + (check ? "CHECK" : "OK") + "\n" + "-".repeat(17))
  console.log(`  icon names              ${r.total}`)
  console.log(`  placeholder             ${r.substituted.length}  -> lucide art ${check ? "(would be) " : ""}stood in`)
  console.log(`  already stood in        ${r.stoodIn.length}`)
  console.log(`  DRAWN BY THE KIT        ${r.drawn.length}`)
  if (r.missing.length) console.log(`  NO LUCIDE MATCH         ${r.missing.length}  (${r.missing.join(", ")})`)

  if (r.substituted.length === 0 && r.stoodIn.length === 0) {
    console.log("\n  Every glyph is drawn. Delete scripts/icon-art.mjs, its test,\n  and the sync stage that calls it.\n")
  } else if (!check) {
    execFileSync("node", [join(ICONS, "generate-icons.mjs")], { stdio: "inherit" })
  }
}
