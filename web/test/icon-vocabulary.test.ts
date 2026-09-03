// EVERY ICON NAME THE APP STORES AS DATA RESOLVES TO A GLYPH THE KIT DRAWS.
//
// Most of this app's icons are not imports. A tab carries a name, a nav page
// carries a name, a screen recipe carries a name, an empty state carries a
// name — because a recipe is serialisable and a component is not. The names
// were lucide's, and they were safe because `kitIcon` fell back to lucide's
// runtime `DynamicIcon` for anything the kit had not drawn.
//
// On 2026-08-27 the kit's art became the Iconoir pack, and on 2026-09-03 it
// became Phosphor (client ruling — see shared/ui/foundations/icons/
// ATTRIBUTION.md). Both times, some fraction of the stored names existed
// under the new pack's spelling or not at all, and the lucide fallback (now
// deleted) used to mean a name like that kept quietly rendering LUCIDE art —
// next to the new pack's art, on the same strip, with `npm run check` green.
// That is the failure this file exists to make impossible: an unresolvable
// name draws NOTHING, and a name that draws nothing turns the build red HERE
// rather than appearing as a hole on a screen.
//
// NO ALIAS TABLE any more (2026-09-03 client ruling, verbatim: "i don't want
// to keep translating — i want to be able to go on the website from phosphor
// and give you the name there"). Every name this file censuses IS a name on
// phosphor.dev, PascalCased by `kitExportName`
// (shared/web/screen-engine/icon-names.ts) — nothing sits between the two any
// more, so there is nothing left here to rot-check in a second direction.

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { iconComponent } from "@shared/web/screen-engine/icon"
import { kitExportName } from "@shared/web/screen-engine/icon-names"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const KIT_ICONS = join(ROOT, "shared", "ui", "foundations", "icons")

/** COMMENTS OFF, at the one seam every scan in this file reads through.
 *
 * `indirections()` builds an ALLOW-LIST — a name that is a CONCEPT_ICON key is
 * SKIPPED by the vocabulary check, because it resolves through the table rather
 * than naming a glyph directly — and it was reading pages.ts raw. So a block
 * comment inside CONCEPT_ICON granted any name it listed. Proved 27 Aug 2026:
 * an `icon: "zzznotaglyph"` in a component is caught ("the kit draws no such
 * glyph"), and stops being caught once pages.ts carries
 *   \/*
 *   zzznotaglyph: "home",
 *   *\/
 * inside that table. What it buys is a HOLE where a glyph should be, on screen.
 *
 * The other direction is fixed here too, for free: `vocabulary()` collects
 * `icon: "…"` off every component, so a commented-out icon name used to enter
 * the census and demand a glyph nothing draws — a false failure rather than a
 * silent pass, but noise in a law is how a law gets ignored.
 *
 * Every read in this file feeds a census or a table. None asserts absence, so
 * none of them wants the raw bytes. */
const read = (p: string) => stripComments(readFileSync(p, "utf8"))

/** Every glyph the kit actually draws, by its PascalCase export name. The one
 * walker reads the folder — the art is flat, so `recursive: false`. */
const drawn = new Set(
  sourceFiles(KIT_ICONS, { extensions: [".svg"], recursive: false }).map((f) => basename(f.path, ".svg"))
)

/** Source under a directory. Tests and e2e specs are excluded: a fixture may
 * name a glyph that deliberately does not exist. */
function sources(dir: string): string[] {
  return sourceFiles(dir, { extensions: [".ts", ".tsx"] })
    .filter((f) => !/(^|\/)(test|e2e)\//.test(f.rel))
    .map((f) => f.path)
}

/** Not every `icon:` field names a GLYPH. `web/lib/screens.ts` writes
 * `icon: "members"` and `screens.ts` resolves it through `CONCEPT_ICON` — the
 * field names a CONCEPT, and the concept's own glyph is censused above where
 * the table is read. The same goes for `NAV`, whose `icon` is one of three
 * section slugs that `SECTION_ICONS` maps to a component. Both indirections
 * are DERIVED here rather than listed, so a concept added tomorrow is covered
 * without anyone remembering this file. */
function indirections(): Set<string> {
  const pages = read(join(ROOT, "web", "lib", "pages.ts"))
  const at = pages.indexOf("CONCEPT_ICON")
  const body = pages.slice(at, pages.indexOf("\n}", at))
  const keys = [...body.matchAll(/^\s*"?([a-z][a-z0-9-]*)"?:/gm)].map((m) => m[1])
  const navUnion = [...(pages.match(/icon:\s*((?:"[a-z-]+"\s*\|\s*)*"[a-z-]+")/) ?? [])[1]?.matchAll(/"([a-z-]+)"/g) ?? []].map(
    (m) => m[1]
  )
  return new Set([...keys, ...navUnion])
}

/** The name positions, each read where it is WRITTEN rather than from a list
 * somebody maintains: the tab table and the concept table are whole objects of
 * `key: "name"`, and everywhere else an icon is an `icon: "name"` field. */
function vocabulary(): Map<string, string> {
  const found = new Map<string, string>()
  const note = (name: string, where: string) => {
    if (!found.has(name)) found.set(name, where)
  }

  const table = (src: string, marker: string, where: string) => {
    const at = src.indexOf(marker)
    if (at === -1) return 0
    const body = src.slice(at, src.indexOf("\n}", at))
    let n = 0
    for (const m of body.matchAll(/:\s*"([a-z][a-z0-9-]*)"/g)) {
      note(m[1], where)
      n++
    }
    return n
  }

  const tabs = read(join(ROOT, "shared", "web", "screen-engine", "tabs-view.tsx"))
  const tabCount = table(tabs, "export const TAB_ICONS", "TAB_ICONS")
  expect(tabCount, "TAB_ICONS went missing or unreadable").toBeGreaterThan(20)

  const pages = read(join(ROOT, "web", "lib", "pages.ts"))
  const conceptCount = table(pages, "CONCEPT_ICON", "CONCEPT_ICON")
  expect(conceptCount, "CONCEPT_ICON went missing or unreadable").toBeGreaterThan(10)

  // THE FOURTH TABLE — same `key: "value"` shape as the two above, and
  // invisible to the generic `icon: "…"` walk below for the same reason they
  // would be if they were not given their own `table()` call: the field name
  // here is the KNOWLEDGE KIND ("note", "ticket", "account" …), never the
  // literal word "icon". Missed for weeks under a green build — three of its
  // names (`note`, `file`, `article`) resolved to nothing on screen while
  // this census reported zero unresolved names, because it never read them.
  const shape = read(join(ROOT, "web", "components", "deep-link", "shape.tsx"))
  const knowledgeKindCount = table(shape, "export const KNOWLEDGE_KIND_ICON", "KNOWLEDGE_KIND_ICON")
  expect(knowledgeKindCount, "KNOWLEDGE_KIND_ICON went missing or unreadable").toBeGreaterThan(10)

  for (const f of [
    ...sources(join(ROOT, "web", "components")),
    ...sources(join(ROOT, "web", "lib")),
    ...sources(join(ROOT, "web-portal", "components")),
    ...sources(join(ROOT, "shared", "web")),
  ]) {
    const src = read(f)
    for (const m of src.matchAll(/\bicon:\s*"([a-z][a-z0-9-]*)"/g)) note(m[1], f.replace(ROOT + "/", ""))
  }
  return found
}

describe("the icon vocabulary", () => {
  it("icon-vocabulary: every name the app stores as data is a glyph the kit draws", () => {
    const vocab = vocabulary()
    expect(vocab.size, "found no icon names at all — the census stopped reading").toBeGreaterThan(50)

    const byConcept = indirections()
    expect(byConcept.size, "the CONCEPT_ICON keys went unread").toBeGreaterThan(10)

    const unresolved: string[] = []
    for (const [name, where] of vocab) {
      if (byConcept.has(name)) continue
      if (!drawn.has(kitExportName(name)))
        unresolved.push(`  "${name}" (${where}) → ${kitExportName(name)} — the kit draws no such glyph`)
    }
    expect(
      unresolved,
      `${unresolved.length} icon name(s) resolve to nothing and would render a HOLE:\n${unresolved.join("\n")}\n\n` +
        `Use a name the kit actually draws — read it off phosphor.dev — there is no alias table to bridge it any more.`
    ).toEqual([])
  })

  it("icon-vocabulary: every name actually RESOLVES to a component at runtime", () => {
    // The two checks above prove the name maps to a glyph that exists on disk
    // and that the map file is current. This one closes the loop the way a
    // screen does: it calls the function the components call, and asks for a
    // component back. A transform that disagreed with the generator — an alias
    // applied twice, a Pascal rule that drifted — would pass both of the others
    // and still draw nothing.
    const dead: string[] = []
    for (const [name, where] of vocabulary()) {
      if (indirections().has(name)) continue
      if (!iconComponent(name)) dead.push(`  "${name}" (${where}) → iconComponent() returned null`)
    }
    expect(dead, `${dead.length} name(s) would render nothing:\n${dead.join("\n")}`).toEqual([])
  })

  it("icon-vocabulary: the generated icon map is current", () => {
    // The map is what makes the bundle small: `import * as KitIcons` indexed by
    // a runtime string pins all 1,383 exports, and the first build after the
    // Iconoir swap shipped a 1.0 MB chunk to draw about eighty. icon-map.ts
    // names only what the app asks for — so it has to stay in step with the
    // four places a name is written, the way the translation catalogue does.
    const result = spawnSync("node", [join(ROOT, "scripts", "icon-map.mjs"), "--check"], { encoding: "utf8" })
    expect(
      result.status,
      `shared/web/screen-engine/icon-map.ts is stale — run \`node scripts/icon-map.mjs\`.\n${result.stderr}`
    ).toBe(0)
  })

  it("icon-vocabulary: nothing outside the kit supplies an icon", () => {
    const offenders: string[] = []
    for (const f of [
      ...sources(join(ROOT, "web")),
      ...sources(join(ROOT, "web-portal")),
      ...sources(join(ROOT, "shared", "web")),
    ]) {
      const src = read(f)
      for (const m of src.matchAll(/from\s+"(lucide[^"]*|@?heroicons[^"]*|react-icons[^"]*|@tabler\/icons[^"]*)"/g))
        offenders.push(`  ${f.replace(ROOT + "/", "")} imports ${m[1]}`)
    }
    expect(
      offenders,
      `an icon pack other than the kit is imported:\n${offenders.join("\n")}\n\n` +
        `The kit draws ${drawn.size} glyphs. Import from @shared/ui/foundations/icons, or add the glyph upstream.`
    ).toEqual([])
  })
})
