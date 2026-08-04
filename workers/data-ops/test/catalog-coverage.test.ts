// R13 — SHIPPING THE CODE SHIPS THE CAPABILITY, both halves, source-locked.
// Half 1: every team module is an import TargetDef or a reviewed, reasoned
// CATALOG_EXEMPT entry — a module can't quietly ship without its import/export story.
// Half 2 (the design flaw that earned the law): a TargetDef only becomes a target
// the picker OFFERS once a ROW exists in the core catalogue table — and rows are
// data, which no deploy carries. Staging could import modules production
// (byte-identical code) could not. So the catalogue must reconcile itself against
// the code on READ: INSERT-only (a deliberate off stays off), reachable from BOTH
// doors, with the picker filtering in memory (never a SQL is_active pre-filter —
// or "switched off" and "never existed" look identical).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { CATALOG_EXEMPT } from "../../../shared/rules/registry"
import { TEAM_MODULES } from "../../../shared/team-modules"
import { TARGETS } from "../src/lib/targets"

const importSrc = readFileSync(join(__dirname, "..", "src", "lib", "import.ts"), "utf8")

function fnBody(name: string): string {
  const start = importSrc.indexOf(`function ${name}`)
  expect(start, `${name} must exist in lib/import.ts`).toBeGreaterThan(-1)
  const next = importSrc.indexOf("\nexport ", start + 1)
  const alt = importSrc.indexOf("\nasync function ", start + 1)
  const end = Math.min(...[next, alt].filter((i) => i !== -1))
  return importSrc.slice(start, Number.isFinite(end) ? end : undefined)
}

describe("catalog-coverage (R13): every module has an import story", () => {
  it("every team module is a TargetDef or a reviewed CATALOG_EXEMPT entry", () => {
    const targetModules = new Set(Object.values(TARGETS).map((t) => t.module))
    for (const m of TEAM_MODULES) {
      const covered = targetModules.has(m) || m in CATALOG_EXEMPT
      expect(
        covered,
        `module "${m}" must be an import TargetDef or earn a reasoned CATALOG_EXEMPT line`
      ).toBe(true)
    }
    // Exemptions carry real reasons, never empty placeholders.
    for (const [k, why] of Object.entries(CATALOG_EXEMPT))
      expect(why.trim().length, `CATALOG_EXEMPT["${k}"] needs its reason`).toBeGreaterThan(10)
  })
})

describe("catalog-coverage (R13): the catalogue reconciles itself against the code", () => {
  it("reconcileCatalog exists and is INSERT-only (a deliberate off stays off)", () => {
    const body = fnBody("reconcileCatalog")
    expect(body).toContain("ON CONFLICT(table_key) DO NOTHING")
    // INSERT-only means NO update clause at all — reconciliation never edits a row.
    expect(body).not.toContain("DO UPDATE")
  })

  it("the reconcile is reachable from BOTH doors (the picker + the by-key lookup)", () => {
    expect(fnBody("getActiveCatalog"), "the picker heals on read").toContain("reconcileCatalog(")
    const byKey = fnBody("catalogByKey")
    expect(byKey, "the by-key door heals on a miss").toContain("reconcileCatalog(")
    // …but only on a MISS — the per-import happy path pays nothing.
    expect(byKey.indexOf("reconcileCatalog")).toBeGreaterThan(byKey.indexOf("await read()"))
  })

  it("the picker does NOT pre-filter is_active in SQL (off ≠ never-existed)", () => {
    const body = fnBody("getActiveCatalog")
    expect(body, "filter in memory, never in the SELECT").not.toMatch(/WHERE is_active = 1/)
    expect(body, "the in-memory filter still applies").toContain("is_active === 1")
  })

  it("the owner seed door refreshes labels WITHOUT re-activating a switched-off target", () => {
    const body = fnBody("seedDefaultCatalog")
    const conflictClause = body.slice(body.indexOf("ON CONFLICT"))
    expect(
      /is_active/.test(conflictClause.slice(0, conflictClause.indexOf(".run()"))),
      "the DO UPDATE must not touch is_active (a re-seed used to silently reactivate)"
    ).toBe(false)
  })
})
