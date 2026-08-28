// THE KIT IS A DEPENDENCY, AND A DEPENDENCY IS NOT EDITED IN PLACE.
//
// shared/ui/ is the kwapso design system (github.com/Kwapso/kwapso-ui-ux), vendored
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
    expect(v.repo).toBe("Kwapso/kwapso-ui-ux")
    expect(v.tag, "the pin must be a real tag (vX.Y.Z)").toMatch(/^v\d+\.\d+\.\d+$/)
    expect(v.sha, "the pin must carry the tag's commit").toMatch(/^[0-9a-f]{40}$/)
    expect(v.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  /* AN ASSET IMPORT DOES NOT MEAN ONE THING, AND THE BUILD THAT CATCHES IT IS OURS.
   *
   * `import mark from "./logo.svg"` evaluates to a URL STRING under Vite — what
   * the kit is developed and checked with — and to a `StaticImageData` OBJECT
   * under Next, which is what both front doors ship. shared/ui/lib/asset-url.ts
   * settles it: every asset import is read through `assetUrl()`, which returns
   * the URL whichever shape arrived.
   *
   * THIS CHECK LIVES HERE RATHER THAN UPSTREAM BECAUSE UPSTREAM CANNOT RUN IT.
   * The kit's own `npm run check` builds with Vite, where the unguarded form is
   * correct — so a regression is invisible in the repository that would
   * introduce it, and arrives here through a sync. This is the sync boundary,
   * beside the hash that already polices it.
   *
   * AND NOTHING ELSE WOULD SAY A WORD. Measured on 2026-08-28 by reverting both
   * files to the unguarded form and running the full static export: `npm run
   * build` PASSED, and web/out/kit-proof.html carried `src="[object Object]"`
   * seven times — on a sign-in screen with nothing else on it. `next build` is
   * green because Next declares `*.svg` as `any`. A type-check cannot see it, a
   * build cannot see it, and the screen looks finished until somebody opens it.
   *
   * POSITIONAL, the way R20 reads a validated field: every mention of an
   * asset-import binding, other than the import itself, must sit in the first
   * argument of an `assetUrl(` call. A cast is not a guard and a truthy check is
   * not one either — the pre-fix code read `const x = xSrc` and type-checked. */
  it("vendored-kit: every asset the kit imports is read through assetUrl", () => {
    const ASSET = /\.(svg|png|jpe?g|webp|gif|avif)$/i

    const sources: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d).sort()) {
        const full = join(d, e)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx?$/.test(e)) sources.push(full)
      }
    }
    walk(KIT)

    // The helper the whole rule stands on. If it is renamed or dropped upstream
    // this check would quietly pass by finding no guarded call, so assert it.
    expect(
      existsSync(join(KIT, "lib", "asset-url.ts")),
      "shared/ui/lib/asset-url.ts is gone — the guard every asset import depends on"
    ).toBe(true)

    const offenders: string[] = []
    let guarded = 0

    for (const file of sources) {
      const src = readFileSync(file, "utf8")
      const where = relative(ROOT, file)

      // Default-imported asset bindings in this file: `import x from "….svg"`.
      const bindings: string[] = []
      for (const m of src.matchAll(/^import\s+(\w+)\s+from\s+["']([^"']+)["']/gm)) {
        if (ASSET.test(m[2])) bindings.push(m[1])
      }
      if (bindings.length === 0) continue

      for (const name of bindings) {
        // Every mention of the binding, minus the import line that declares it.
        const mentions = [...src.matchAll(new RegExp(`\\b${name}\\b`, "g"))]
        for (const mention of mentions) {
          const line = src.slice(0, mention.index).split("\n").length
          const lineText = src.split("\n")[line - 1]
          if (/^import\s/.test(lineText.trim())) continue
          if (new RegExp(`assetUrl\\(\\s*${name}\\b`).test(lineText)) {
            guarded += 1
            continue
          }
          offenders.push(`${where}:${line} — \`${name}\` is used without assetUrl(): ${lineText.trim()}`)
        }
      }
    }

    // Rot check: if the kit stops importing assets altogether this test is
    // vacuous, and a vacuous check reads exactly like a passing one.
    expect(
      guarded,
      "no guarded asset import found in shared/ui/ — this check has stopped checking anything"
    ).toBeGreaterThan(0)

    expect(
      offenders,
      `An asset import in the vendored kit is used without assetUrl(). Under Next it is a StaticImageData object, so it renders src="[object Object]" and NOTHING goes red — not tsc, not next build. Fix it upstream in Kwapso/kwapso-ui-ux (read it through assetUrl from lib/asset-url.ts), tag, and re-sync.\n${offenders.join("\n")}`
    ).toEqual([])
  })

  it("vendored-kit: nothing under shared/ui/ has been hand-edited since the sync", () => {
    const v = JSON.parse(readFileSync(versionPath, "utf8"))
    expect(
      contentHash(KIT),
      `shared/ui/ differs from what sync-design.mjs vendored at ${v.tag}. The kit is a dependency: make the change upstream in Kwapso/kwapso-ui-ux, tag it, and re-run scripts/sync-design.mjs — never edit the vendored copy.`
    ).toBe(v.hash)
  })
})
