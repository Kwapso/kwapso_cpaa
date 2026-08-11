// THE LINT STEP HAS TO BE PART OF THE GATE, AND IT HAS TO BITE.
//
// `npm run check` was types + tests only, so a whole class of defect was held by
// convention and review alone. Its first clean run found four: an ErrorBoundary
// imported into web/app/layout.tsx and never rendered (ERROR-HANDLING.md says in
// as many words that it IS mounted there — the containment half of the React
// white-screen guard was simply absent), a useMemo carrying a dependency it never
// read, a comma-operator assignment, and eleven dead imports.
//
// A lint step nobody runs is worse than none — it reads as covered. So this pins
// the three things that make it real: it is in the gate, it FAILS on a finding
// rather than warning, and its ignore list does not quietly exclude the app.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> }
const cfg = JSON.parse(read(".oxlintrc.json")) as {
  categories: Record<string, string>
  ignorePatterns: string[]
  plugins: string[]
}

describe("the lint gate", () => {
  it("runs as part of npm run check", () => {
    // CI runs `npm run check` (.github/workflows/ci.yml), so this is also what
    // puts the lint on every push and pull request.
    expect(pkg.scripts.lint, "there must be a lint script").toBeTruthy()
    expect(pkg.scripts.check, "check must run it").toContain("npm run lint")
  })

  it("FAILS the build on a finding, rather than printing a warning nobody reads", () => {
    expect(pkg.scripts.lint).toContain("--deny-warnings")
    expect(cfg.categories.correctness, "correctness is the gate, not advice").toBe("error")
  })

  it("covers both front ends, every worker, and shared/", () => {
    // The failure mode of a linter is not a false positive, it is a silent zero:
    // an ignore pattern that swallows the app scores a clean run over nothing.
    const swallowed = cfg.ignorePatterns.filter((p) =>
      ["web", "web-portal", "workers", "shared", "scripts"].some(
        (dir) => p === `${dir}/**` || p === dir || p === `**/${dir}/**`
      )
    )
    expect(swallowed, "these ignore patterns exclude real source").toEqual([])
  })

  it("keeps the React hook rules on — the crash class this repo has already paid for", () => {
    // web/test/hooks-order.test.ts guards one shape of it (a hook below an early
    // return) with fixtures proving its own blind spots; the plugin covers the
    // rest of the rules of hooks and the dependency arrays. Both, deliberately.
    expect(cfg.plugins).toContain("react")
  })
})
