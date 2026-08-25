// A FINISHED COMPONENT NOTHING MOUNTS IS NOT A FEATURE, IT IS A RUMOUR.
//
// Found twice on 26 Aug 2026, both by outside review rather than by any check:
// portal-access-dialog (121 lines, superseded by PortalAccessPanel in the panel
// pivot, then unmounted for weeks) and mail-reply-dialog (deliberately parked —
// see PARKED below). The reachable-screens suite walks DOORS to controls; it
// never asked whether a component file is reachable AT ALL, so a superseded
// dialog looked exactly like a live one. This census closes that: every file
// under web/components is imported by something — statically, or through the
// one dynamic() split the bundle-size work introduced — or it is PARKED here
// with the reason, rot-checked so the list can only shrink.

import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

const WEB = join(__dirname, "..")
const ROOTS = ["components", "app", "lib", "test"].map((d) => join(WEB, d))
ROOTS.push(join(WEB, "..", "shared", "web"))

/** Components that are unmounted ON PURPOSE, each with the decision that parks
 * it. Rot-checked below: a line whose file has gained an importer (or lost its
 * file) turns the build red, so the list records real decisions only. */
const PARKED: Record<string, string> = {
  "mail-reply-dialog":
    "the only place either front end ever holds a Gmail draft id. Parked, not dead: " +
    "the reachable-screens exemption for POST /google/gmail/trash names this file as " +
    "where a person's own 'bin it' belongs the day a screen opens it — delete this " +
    "line and the dialog together with that one.",
}

describe("every component file is mounted, or parked with a reason", () => {
  const files = ROOTS.flatMap((r) => sourceFiles(r, { extensions: [".ts", ".tsx"] }))
  const sources = files.map((f) => f.source)
  // Everything any file imports — static `from "…"`, and the dynamic()/import()
  // strings the code-split chart module is reached through.
  const imported = new Set<string>()
  for (const src of sources) {
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) imported.add(m[1])
    for (const m of src.matchAll(/import\(\s*"([^"]+)"\s*\)/g)) imported.add(m[1])
  }
  const importedBases = new Set(
    [...imported].map((s) => s.replace(/\.(ts|tsx)$/, "").split("/").pop() ?? s)
  )

  it("web/components holds no unmounted file outside PARKED", () => {
    const offenders: string[] = []
    const parkedStillParked: string[] = []
    for (const { path: file } of sourceFiles(join(WEB, "components"), { extensions: [".ts", ".tsx"] })) {
      const rel = relative(join(WEB, "components"), file).replace(/\.(ts|tsx)$/, "")
      const base = rel.split("/").pop() ?? rel
      const mounted = importedBases.has(base)
      if (rel in PARKED) {
        if (mounted) parkedStillParked.push(rel)
        continue
      }
      if (!mounted) offenders.push(rel)
    }
    expect(
      offenders,
      `no screen, lib or test imports these component files — wire them up, delete them, ` +
        `or park them in PARKED with the decision: ${offenders.join(", ")}`
    ).toEqual([])
    // The ratchet: a parked file something now imports is no longer parked.
    expect(
      parkedStillParked,
      `PARKED names components that are mounted now — delete these lines: ${parkedStillParked.join(", ")}`
    ).toEqual([])
    // Tripwire: an import scan that found nothing passes exactly like a clean one.
    expect(importedBases.size, "the import scan went blind").toBeGreaterThan(50)
  })

  it("every PARKED entry still names a real file", () => {
    const files = new Set(
      sourceFiles(join(WEB, "components"), { extensions: [".ts", ".tsx"] }).map((f) =>
        f.rel.replace(/\.(ts|tsx)$/, "")
      )
    )
    for (const rel of Object.keys(PARKED))
      expect(files.has(rel), `PARKED names "${rel}" and no such component exists — delete the line`).toBe(true)
  })
})
