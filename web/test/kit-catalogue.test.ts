// THE SCREEN BUILDER OFFERS WHAT THE KIT HAS, AND NOTHING ELSE.
//
// The owner, verbatim: "Don't magically add configurations on the components or
// collections that Aurora has not put in the UI/UX kit. You should only show me
// what is there as of this moment, live." tools/screen-builder/ is a sandbox
// that assembles kit parts; every option it offers comes from
// tools/screen-builder/catalogue.json, and that file is DERIVED from
// shared/ui/ by scripts/build-kit-catalogue.mjs. This suite is what makes
// "derived" a fact rather than a claim:
//
//   1. the committed catalogue equals a fresh derivation from the kit on disk,
//      so syncing a new kit tag without regenerating turns the build red — the
//      same shape as R28's translation catalogue;
//   2. an INDEPENDENT oracle (a comment-stripped scan for `cva(` through the one
//      shared walker) finds exactly the sites the parser catalogued, so the
//      parser cannot quietly skip a component;
//   3. no option is guessed: every variant option carries the class string the
//      kit wrote, or is listed by name under `unresolved`;
//   4. every drawable part has dummy data in the tool, or a written reason why
//      it cannot be drawn — and a reason for a part that IS drawn rots red.
//
// Not a law in the registry: this is a developer tool outside both front doors'
// import closure, and RULES.md is about the app. It is a seam test, like the
// per-worker publish-seam suites.
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { describe, expect, it } from "vitest"

import { CATALOGUE_PATH, KIT, buildCatalogue, stableCatalogue } from "../../scripts/build-kit-catalogue.mjs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const SAMPLES = join(ROOT, "tools", "screen-builder", "samples")

type Option = { name: string; classes: string | null }
type Group = { name: string; options: Option[] }
type Site = { file: string; name: string | null; groups: Group[]; unresolved: { what: string }[] }
type Part = { name: string; kind: "component" | "hook"; cva: Site[] }
type Catalogue = { counts: Record<string, number>; components: Part[] }

const fresh = buildCatalogue() as Catalogue

describe("the kit catalogue is derived, current, and unguessed", () => {
  it("tools/screen-builder/catalogue.json is current against shared/ui", () => {
    expect(existsSync(CATALOGUE_PATH), "run node scripts/build-kit-catalogue.mjs").toBe(true)
    const onDisk = JSON.parse(readFileSync(CATALOGUE_PATH, "utf8"))
    expect(
      stableCatalogue(onDisk) === stableCatalogue(fresh),
      "catalogue.json is stale against shared/ui — run node scripts/build-kit-catalogue.mjs",
    ).toBe(true)
  })

  it("every cva() call in the kit is a catalogued site (independent oracle)", () => {
    const seen = new Set<string>()
    for (const f of sourceFiles(join(KIT, "components"), { extensions: [".tsx"], relativeTo: KIT })) {
      const src = stripComments(f.source)
      for (const m of src.matchAll(/const\s+(\w+)\s*=\s*cva\s*\(/g)) seen.add(`${f.rel}:${m[1]}`)
      // A cva() that is not `const x = cva(` would be invisible to the line above
      // and to the catalogue's naming; the count must still agree.
      const bare = (src.match(/(?<![\w$.])cva\s*\(/g) ?? []).length
      const named = (src.match(/const\s+\w+\s*=\s*cva\s*\(/g) ?? []).length
      expect(bare, `${f.rel} has a cva() call that is not a named const`).toBe(named)
    }
    const catalogued = new Set(fresh.components.flatMap((c) => c.cva.map((s) => `${s.file}:${s.name}`)))
    expect([...catalogued].sort()).toEqual([...seen].sort())
    expect(fresh.counts.cvaSites).toBe(seen.size)
  })

  it("no variant option is guessed: a class string from the source, or a named unresolved entry", () => {
    for (const c of fresh.components)
      for (const s of c.cva) {
        for (const g of s.groups) {
          expect(g.options.length, `${c.name} ${s.name}.${g.name} has no options`).toBeGreaterThan(0)
          for (const o of g.options)
            if (o.classes === null)
              expect(
                s.unresolved.some((u) => u.what === `${g.name}.${o.name}`),
                `${c.name} ${s.name}.${g.name}.${o.name} has no class string and is not reported`,
              ).toBe(true)
        }
      }
  })

  it("names every folder under shared/ui/components/ exactly once", () => {
    const folders = new Set(
      sourceFiles(join(KIT, "components"), { extensions: [".ts", ".tsx"], relativeTo: join(KIT, "components") }).map((f) => f.rel.split("/")[0]),
    )
    expect(fresh.components.map((c) => c.name).sort()).toEqual([...folders].sort())
  })

  it("every drawable part has dummy data in the tool, or a written reason", () => {
    // A static census — the samples import every kit part, and loading all of
    // them into jsdom here would make this the slowest test in the suite for a
    // question a regex answers: which keys does the registry declare?
    const files = sourceFiles(SAMPLES, { extensions: [".ts", ".tsx"] })
    const sampled = new Set<string>()
    const reasoned = new Map<string, string>()
    for (const f of files) {
      const src = stripComments(f.source)
      // The registry object runs from `export const samples … = {` to the first
      // `}` at column 0; its keys sit at two-space indent. Helper data inside a
      // sample is deeper, so it is not read as a part name.
      const registry = src.match(/export const samples[^=]*=\s*\{([\s\S]*?)\n\}/)
      if (registry) for (const m of registry[1].matchAll(/^ {2}"?([a-z][a-z0-9-]*)"?:\s*\{/gm)) sampled.add(m[1])
      const block = src.match(/NO_SAMPLE[^=]*=\s*\{([\s\S]*?)\n\}/)
      if (block) for (const m of block[1].matchAll(/"?([a-z][a-z0-9-]*)"?:\s*"([^"]+)"/g)) reasoned.set(m[1], m[2])
    }
    for (const key of reasoned.keys()) sampled.delete(key)
    const parts = fresh.components.filter((c) => c.kind === "component").map((c) => c.name)
    const missing = parts.filter((p) => !sampled.has(p) && !reasoned.has(p))
    expect(missing, "parts with neither a sample nor a NO_SAMPLE reason").toEqual([])
    const all = new Set(fresh.components.map((c) => c.name))
    for (const [key, reason] of reasoned) {
      expect(all.has(key), `NO_SAMPLE names "${key}", which is not a kit part — delete the line`).toBe(true)
      expect(reason.length, `NO_SAMPLE "${key}" needs a reason`).toBeGreaterThan(10)
    }
    for (const key of sampled) expect(all.has(key), `samples draw "${key}", which is not a kit part`).toBe(true)
  })
})
