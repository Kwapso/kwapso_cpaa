// THE LAW MACHINERY'S OWN GUARD.
//
// Every law in this repo is a source scan, and every source scan stands on two
// things: a walk that finds the files, and a stripper that removes the prose. Both
// used to exist in many copies.
//
// The walk: thirteen test files hand-rolled a recursive readdirSync, filtering
// differently. web/test/rules.test.ts enforced R3/R4/R7/R16 over a RECURSIVE walk
// of web/components (three subdirectories); web-portal/test/rules.test.ts enforced
// the same four laws over a FLAT read of web-portal/components. Both said "every
// component". The portal's folder is flat, so both were green — and the first
// portal component to move into a subdirectory would have left them green and
// wrong.
//
// The stripper: `stripComments` existed EIGHT times — three named copies (one of
// them guarding the mcp worker, the external machine surface) and five inline
// repetitions of the same two regexes. Harden one and the other seven are checks
// that only look like it.
//
// So this file guards the guard: the walker behaves as its options say, there is
// exactly ONE stripComments, and the one genuinely different stripper (JSONC, for
// JSON.parse) is proved to be a different job rather than a straggler.

import { describe, expect, it } from "vitest"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { sourceFiles, stripComments, stripJsoncComments } from "@shared/rules/source-scan"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const ROOT = join(WEB, "..")
const COMPONENTS = join(WEB, "components")

describe("the one walker every law reads source through", () => {
  it("RECURSES by default — the whole reason it exists", () => {
    const all = sourceFiles(COMPONENTS, { extensions: [".tsx"] })
    const nested = all.filter((f) => f.rel.includes("/"))
    // web/components has subdirectories (deep-link, screens, temp). A walk that
    // stopped at the top level would enforce the UI laws on part of the app and
    // report success for all of it.
    expect(
      nested.length,
      "web/components has subdirectories — a default walk must reach into them"
    ).toBeGreaterThan(0)
    expect(all.length).toBeGreaterThan(nested.length)
  })

  it("`recursive: false` means flat, and the difference is real", () => {
    const deep = sourceFiles(COMPONENTS, { extensions: [".tsx"] })
    const flat = sourceFiles(COMPONENTS, { extensions: [".tsx"], recursive: false })
    expect(flat.every((f) => !f.rel.includes("/")), "a flat walk returns no nested file").toBe(true)
    // If these two ever agreed, this suite would be asserting nothing.
    expect(flat.length).toBeLessThan(deep.length)
  })

  it("takes exactly the extensions it is given", () => {
    const tsx = sourceFiles(join(WEB, "lib"), { extensions: [".tsx"] })
    const ts = sourceFiles(join(WEB, "lib"), { extensions: [".ts"] })
    expect(ts.length, "web/lib is full of .ts").toBeGreaterThan(5)
    expect(tsx.every((f) => f.rel.endsWith(".tsx"))).toBe(true)
    expect(ts.every((f) => f.rel.endsWith(".ts"))).toBe(true)
    expect(sourceFiles(join(WEB, "lib"), { extensions: [".ts", ".tsx"] }).length).toBe(
      ts.length + tsx.length
    )
  })

  it("`skipTests` leaves the checks out of what is being checked", () => {
    const withTests = sourceFiles(HERE, { extensions: [".ts"] })
    const without = sourceFiles(HERE, { extensions: [".ts"], skipTests: true })
    expect(withTests.length, "web/test is full of .test.ts").toBeGreaterThan(10)
    expect(without.some((f) => f.rel.endsWith(".test.ts"))).toBe(false)
    expect(without.length).toBeLessThan(withTests.length)
  })

  it("never wanders into node_modules or a build directory", () => {
    // A walk that descends into node_modules is not a slow check, it is a hung
    // one — and every hand-rolled walker had to remember this separately.
    const files = sourceFiles(WEB, { extensions: [".json"] })
    expect(files.length, "web/ has package.json at least").toBeGreaterThan(0)
    const strayed = files.filter((f) => /(^|\/)(node_modules|\.next|out|dist)\//.test(f.rel))
    expect(strayed.map((f) => f.rel), "the walk escaped into a skipped directory").toEqual([])
  })

  it("reports a stable order, so a failure names its offenders the same way twice", () => {
    const once = sourceFiles(COMPONENTS, { extensions: [".tsx"] }).map((f) => f.rel)
    expect(once).toEqual([...once].sort())
  })
})

describe("there is exactly one comment stripper", () => {
  /** Every .ts/.tsx in the repo's own source — both front ends, every worker, and
   * shared/. Uses the walker under test, which is fine: if the walk were broken
   * the suite above is already red. */
  const repoSources = () =>
    sourceFiles(
      [join(ROOT, "web"), join(ROOT, "web-portal"), join(ROOT, "workers"), join(ROOT, "shared")],
      { extensions: [".ts", ".tsx"], relativeTo: ROOT }
    )

  it("only shared/rules/source-scan.ts declares one", () => {
    const declared = repoSources()
      .filter((f) => /(?:function|const)\s+stripComments\b/.test(f.source))
      .map((f) => f.rel)
    expect(declared.length, "the scan found no declaration at all — it has gone blind").toBe(1)
    expect(declared).toEqual(["shared/rules/source-scan.ts"])
  })

  it("nobody re-types its regexes inline instead", () => {
    // The five inline copies were the ones nothing named, so nothing could find
    // them. This is the pattern itself, matched anywhere it is written out.
    const LINE_COMMENT_RE = /replace\(\/\(\^\|\[\^:\]\)\\\/\\\/\[\^\\n\]\*\/gm/
    const offenders = repoSources()
      .filter((f) => LINE_COMMENT_RE.test(f.source) && f.rel !== "shared/rules/source-scan.ts")
      .map((f) => f.rel)
    expect(
      offenders,
      `these re-type the shared stripper instead of importing it: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("the mcp worker's gating seam is one of the callers", () => {
    // Named on purpose. It is the check that guards the EXTERNAL machine surface,
    // and it is the copy that survived the last consolidation.
    const seam = repoSources().find((f) => f.rel === "workers/mcp/test/gating-seam.test.ts")
    expect(seam, "the mcp gating seam must exist").toBeDefined()
    expect(seam?.source).toContain('from "@shared/rules/source-scan"')
  })

})

// WHO MAY READ A DIRECTORY DIRECTLY.
//
// A hand-rolled walker can only appear where readdirSync is called, so that call
// is the choke point. Everything that reads SOURCE goes through sourceFiles();
// what is left is a handful of ROSTER reads — "which workers are on disk?" —
// which list directories and never descend. Each is a conscious line with a
// reason, exactly like every other deny-list in this codebase, and adding one is
// meant to be a decision somebody makes on purpose.
const DIRECT_READDIR: Record<string, string> = {
  "shared/rules/source-scan.ts": "the one walker itself — this is where the recursion lives",
  "web/test/rules.test.ts":
    "roster read: lists the worker directories to build the scan's roots, then hands them to sourceFiles",
  "web/test/config-vars.test.ts":
    "roster read: the same per-worker src/ roots for the server-side env-var scan",
  "web/test/doc-claims.test.ts":
    "the repo-root .md files (a deliberately flat set — the canon lives at the root) plus the worker roster",
  "workers/content/test/media-keys.test.ts":
    "roster read: the same per-worker src/ roots, for the media-key scan",
  "workers/data-ops/test/error-seam.test.ts":
    "roster read, and it defines a worker as a directory with a src/index.ts — which is the question this suite asks",
  "workers/gateway/test/public-surface.test.ts":
    "roster read, and it defines a worker as a directory with a wrangler.jsonc — which is the question this suite asks",
  "web/test/backup-covers-r2.test.ts":
    "roster read: the workers with a wrangler.jsonc, to build the src/ roots it then hands to sourceFiles and to find each one's r2_buckets",
}

describe("no law walks a directory tree by hand", () => {
  const callers = () =>
    sourceFiles(
      [join(ROOT, "web"), join(ROOT, "web-portal"), join(ROOT, "workers"), join(ROOT, "shared")],
      { extensions: [".ts", ".tsx"], relativeTo: ROOT }
    ).filter((f) => /(?<![\w$])readdirSync\s*\(/.test(stripComments(f.source)))

  it("finds the readdirSync callers (the scan itself must not go blind)", () => {
    expect(callers().length).toBeGreaterThan(3)
  })

  it("every direct readdirSync is one of the reviewed roster reads", () => {
    const unlisted = callers()
      .map((f) => f.rel)
      .filter((rel) => !DIRECT_READDIR[rel])
    expect(
      unlisted,
      `these read a directory themselves — read source through sourceFiles() from ` +
        `@shared/rules/source-scan, or add a reasoned DIRECT_READDIR line: ${unlisted.join(", ")}`
    ).toEqual([])
  })

  it("every reviewed line still names a file that really does it (no rotting entries)", () => {
    const actual = new Set(callers().map((f) => f.rel))
    for (const rel of Object.keys(DIRECT_READDIR))
      expect(actual.has(rel), `DIRECT_READDIR lists ${rel}, which no longer calls readdirSync`).toBe(
        true
      )
  })

  it("every reviewed line states a real reason", () => {
    for (const [rel, why] of Object.entries(DIRECT_READDIR))
      expect(why.length, `${rel} reads a directory directly — that needs a real reason`).toBeGreaterThan(20)
  })
})

describe("the two strippers are two jobs, and neither can do the other's", () => {
  // The gateway's public-surface suite parses every wrangler.jsonc to ask which
  // workers answer on a public address. It needs a stripper that keeps strings
  // byte-exact; the seam scans need one that is lossy and leaves template literals
  // alone. Both now live in source-scan.ts, named apart — these fixtures are the
  // reason, and they are what stops a later "tidy-up" folding them together.

  it("the seam-scan stripper would CORRUPT a config — it is not string-aware", () => {
    const src = '{ "note": "a // b", "ok": 1 }'
    expect(JSON.parse(stripJsoncComments(src)), "the JSONC one leaves the value alone").toEqual({
      note: "a // b",
      ok: 1,
    })
    expect(
      () => JSON.parse(stripComments(src)),
      "the seam-scan one eats the rest of the line and the parse fails"
    ).toThrow()
  })

  it("the JSONC stripper would BLIND a seam scan — one stray quote and it stops stripping", () => {
    // A template literal holding SQL with an unbalanced double quote. The JSONC
    // stripper reads that quote as the start of a string and never sees a comment
    // again — so `// requireRight(x)` below it survives, and a gate check would be
    // satisfied by a comment naming the gate. That is the exact failure the seam
    // scans strip comments to prevent.
    const src = 'const sql = `WHERE name = " `\n// requireRight(x)\nhandler()'
    expect(stripJsoncComments(src), "the JSONC one leaves the comment standing").toContain(
      "requireRight(x)"
    )
    expect(stripComments(src), "the seam-scan one removes it").not.toContain("requireRight(x)")
  })

  it("the real configs parse through the JSONC one", () => {
    // Not a fixture — the actual files the law reads.
    for (const cfg of sourceFiles(join(ROOT, "workers"), { extensions: ["wrangler.jsonc"] })) {
      const parsed = JSON.parse(stripJsoncComments(cfg.source)) as { name?: string }
      expect(typeof parsed.name, `${cfg.rel} must parse to a worker config`).toBe("string")
    }
  })
})
