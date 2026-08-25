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

// THE KIT SHIPS ICON NAMES; AT v1.0.0 IT SHIPS NO ICON ART.
//
// shared/ui/icons/ICON-LANGUAGE.md, the kit's own paper: "Status: analysis and
// specification only. No glyph has been drawn." All 96 .svg files were the same
// placeholder — a rounded square with dots — and the app draws icons at 138
// call sites, so every one of them rendered unfinished. scripts/icon-art.mjs
// stands lucide's art in front of any name still carrying that placeholder,
// through the kit's own documented swap procedure, as a stage of the sync (so
// the hash above covers the result and a hand-edit still goes red).
//
// This is the ratchet. It fails two ways:
//   · a placeholder reaching the app  — the thing the substitution exists to stop
//   · the count drifting from VERSION.json — the record going stale
// and when `drawn` is non-zero it says so, because that is the day the
// machinery can be deleted rather than maintained.
describe("the kit's icon art", () => {
  const ICONS = join(KIT, "icons")

  /** The placeholder's rounded square, and the stand-in's own <g>. */
  const PLACEHOLDER = "M6.6 1.5h15.15a5.1 5.1 0 0 1 5.1 5.1v15.15"
  const STAND_IN = '<g fill="none" stroke="currentColor" stroke-width="2"'

  const art = readdirSync(ICONS)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => ({ name: f.slice(0, -4), raw: readFileSync(join(ICONS, f), "utf8") }))

  it("icon-art: the census still finds icons at all", () => {
    // A walk that stops matching must not report an all-clear.
    expect(art.length).toBeGreaterThan(80)
  })

  it("icon-art: no glyph ships as the kit's placeholder", () => {
    const placeholders = art.filter((a) => a.raw.includes(PLACEHOLDER)).map((a) => a.name)
    expect(
      placeholders,
      `${placeholders.length} icons still draw the placeholder square. Run \`node scripts/icon-art.mjs\`, ` +
        `then update shared/ui/VERSION.json's hash — or pull a kit tag whose art is drawn.`
    ).toEqual([])
  })

  it("icon-art: VERSION.json records how many glyphs are stood in, not drawn", () => {
    const v = JSON.parse(readFileSync(join(KIT, "VERSION.json"), "utf8"))
    const stoodIn = art.filter((a) => a.raw.includes(STAND_IN)).length
    const drawn = art.length - stoodIn

    expect(v.iconArt?.source).toBe("lucide-react")
    expect(v.iconArt?.stoodIn, "the record disagrees with the art on disk").toBe(stoodIn)
    expect(
      v.iconArt?.drawn,
      drawn > 0
        ? `${drawn} glyphs are now the kit's own. When drawn reaches ${art.length}, delete ` +
          `scripts/icon-art.mjs, its stage in scripts/sync-design.mjs, and this block.`
        : "the record disagrees with the art on disk"
    ).toBe(drawn)
  })
})
