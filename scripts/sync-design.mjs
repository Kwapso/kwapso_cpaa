#!/usr/bin/env node
/**
 * sync-design.mjs — pull the kwapso design system into shared/ui/ at a tag.
 *
 * The kit at github.com/Kwapso/design is a DEPENDENCY, vendored rather than
 * installed, so that `npm ci` and the Cloudflare build never need private-repo
 * credentials. This script is the only door new kit code enters through:
 *
 *     node scripts/sync-design.mjs v0.9.0
 *
 * It clones the repo at that tag (default: the tag pinned in
 * shared/ui/VERSION.json), replaces shared/ui/ with the kit's deliverable
 * directories, and writes VERSION.json with the tag, the commit sha, and a
 * content hash. `npm run check` recomputes that hash (web/test/vendored-kit
 * .test.ts) and goes red if anything under shared/ui/ was hand-edited since —
 * a local edit to the kit must be made upstream instead, or the fork drifts.
 *
 * shared/ui/ is also excluded from this repo's oxlint (.oxlintrc.json), for
 * the same reason node_modules is: it is a DEPENDENCY. Its own repo lints it;
 * linting a vendored copy we may not edit would only produce unactionable red.
 *
 * Cloning needs the `alaap-kwapso` GitHub identity (the machine's default
 * credential is a different account), which the REPO URL below carries.
 */

import { execSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { substitute } from "./icon-art.mjs"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TARGET = join(ROOT, "shared", "ui")
const REPO = "https://alaap-kwapso@github.com/Kwapso/design.git"

/** The kit's deliverable surface. demo/, verify/, mini-app/ and the GAPS
 * paper trail stay upstream — they are the workshop, not the product. */
const DELIVERED = [
  "tokens", "icons", "motion", "controls", "structures", "compositions",
  "lib", "assets", "manifest.json", "README.md", "CHANGELOG.md",
]

/** One hash over every delivered file's path + bytes, path-sorted, so the
 * hand-edit guard can recompute it without git. */
export function contentHash(dir) {
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d).sort()) {
      if (e === "VERSION.json") continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else files.push(p)
    }
  }
  walk(dir)
  const h = createHash("sha256")
  for (const f of files) {
    h.update(relative(dir, f))
    h.update("\0")
    h.update(readFileSync(f))
    h.update("\0")
  }
  return h.digest("hex")
}

const main = async () => {
  const pinned = existsSync(join(TARGET, "VERSION.json"))
    ? JSON.parse(readFileSync(join(TARGET, "VERSION.json"), "utf8")).tag
    : null
  const tag = process.argv[2] ?? pinned
  if (!tag) {
    console.error("usage: node scripts/sync-design.mjs <tag>   (no VERSION.json to default from)")
    process.exit(1)
  }

  const tmp = mkdtempSync(join(tmpdir(), "kwapso-design-"))
  try {
    console.log(`sync-design: cloning Kwapso/design at ${tag} …`)
    execSync(`git clone --quiet --depth 1 --branch ${tag} ${REPO} ${tmp}/kit`, { stdio: "inherit" })
    const sha = execSync(`git -C ${tmp}/kit rev-parse HEAD`).toString().trim()

    for (const entry of DELIVERED)
      if (!existsSync(join(tmp, "kit", entry)))
        throw new Error(`the kit at ${tag} is missing ${entry} — refusing a partial vendor`)

    rmSync(TARGET, { recursive: true, force: true })
    for (const entry of DELIVERED)
      cpSync(join(tmp, "kit", entry), join(TARGET, entry), { recursive: true })

    /* THE ART STAGE. The kit ships icon NAMES; at v1.0.0 it ships no icon
       ART, and its own ICON-LANGUAGE.md says so. This stands lucide's glyphs
       in front of any name still carrying the placeholder, using the kit's
       own documented swap procedure, and it runs BEFORE the hash so the guard
       covers the result and a real hand-edit still goes red. It is keyed on
       the placeholder's signature, so the day the art is drawn it substitutes
       nothing and `iconArt.substituted` lands at 0. See scripts/icon-art.mjs. */
    const art = await substitute()
    if (art.substituted.length)
      execSync(`node ${join(TARGET, "icons", "generate-icons.mjs")}`, { stdio: "inherit" })
    if (art.missing.length)
      console.warn(`sync-design: ${art.missing.length} placeholder icons have no stand-in (${art.missing.join(", ")})`)

    const hash = contentHash(TARGET)
    writeFileSync(
      join(TARGET, "VERSION.json"),
      JSON.stringify(
        {
          repo: "Kwapso/design",
          tag,
          sha,
          hash,
          syncedAt: new Date().toISOString().slice(0, 10),
          iconArt: { stoodIn: art.substituted.length + art.stoodIn.length, drawn: art.drawn.length, source: "lucide-react" },
        },
        null,
        2
      ) + "\n"
    )
    console.log(`sync-design: shared/ui is now ${tag} (${sha.slice(0, 9)}), hash ${hash.slice(0, 12)}…`)
    console.log("sync-design: now run `node scripts/design-imports.mjs`, then `npm run check`.")
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
