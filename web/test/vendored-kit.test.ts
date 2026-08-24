// THE KIT IS A DEPENDENCY, AND A DEPENDENCY IS NOT EDITED IN PLACE.
//
// shared/ui/ is the kwapso design system (github.com/Kwapso/design), vendored
// at a tag by scripts/sync-design.mjs. That script writes VERSION.json — the
// tag, the commit sha, and a content hash over every delivered file — and this
// test recomputes the hash on every check. A byte changed under shared/ui/
// turns the build red HERE, which is the entire point: a fix to the kit is
// made upstream and pulled by tag, or the vendored copy forks and every later
// sync silently reverts somebody's hand-edit. (The same reasoning excludes
// shared/ui/ from this repo's lint: its own repo lints it.)
//
// When Aurora ships v1.1.0: `node scripts/sync-design.mjs v1.1.0`, then
// `node scripts/design-imports.mjs`, then `npm run check` — OPERATIONS.md.
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const KIT = join(ROOT, "shared", "ui")

/** Byte-for-byte the same walk as scripts/sync-design.mjs `contentHash`. */
function contentHash(dir: string): string {
  const files: string[] = []
  const walk = (d: string) => {
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

describe("the vendored design kit", () => {
  const versionPath = join(KIT, "VERSION.json")

  it("vendored-kit: VERSION.json names the pinned tag and sha", () => {
    expect(existsSync(versionPath), "shared/ui/VERSION.json is missing — run scripts/sync-design.mjs").toBe(true)
    const v = JSON.parse(readFileSync(versionPath, "utf8"))
    expect(v.repo).toBe("Kwapso/design")
    expect(v.tag, "the pin must be a real tag (vX.Y.Z)").toMatch(/^v\d+\.\d+\.\d+$/)
    expect(v.sha, "the pin must carry the tag's commit").toMatch(/^[0-9a-f]{40}$/)
    expect(v.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("vendored-kit: nothing under shared/ui/ has been hand-edited since the sync", () => {
    const v = JSON.parse(readFileSync(versionPath, "utf8"))
    expect(
      contentHash(KIT),
      `shared/ui/ differs from what sync-design.mjs vendored at ${v.tag}. The kit is a dependency: make the change upstream in Kwapso/design, tag it, and re-run scripts/sync-design.mjs — never edit the vendored copy.`
    ).toBe(v.hash)
  })
})
