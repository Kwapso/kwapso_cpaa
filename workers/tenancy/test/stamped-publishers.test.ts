// HALF-STAMPED IS SILENTLY DEAF. A resource in SCOPE_STAMPED_RESOURCES is one
// whose pings a fenced portal listener may only hear when the publisher NAMED
// the account (`mayHearChange` fails closed on a missing scope) — so a publish
// site that forgets the sixth argument does not leak, it goes quiet: the
// client's screen simply stops updating, with no symptom anywhere. That is the
// exact no-alarm failure shape R15 exists for, one layer down.
//
// Earned on 26 Aug 2026, when `processes` and `account_rates` joined the
// stamped set so the portal's Impact screen could hear its own subject: the
// two resources had SIXTEEN publish sites between them, and a sweep that fixed
// fifteen would have shipped green. So the census is derived, not remembered:
// every `publishChange` whose resource literal is in the stamped set must pass
// a sixth argument, read straight off the workers' source.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const ROOT = join(__dirname, "..", "..", "..")

/** The stamped set, read off the fence's own file so the two cannot drift. */
function stampedResources(): string[] {
  const src = readFileSync(join(ROOT, "shared", "workers", "account-scope.ts"), "utf8")
  const m = /const SCOPE_STAMPED_RESOURCES = \[([\s\S]*?)\] as const/.exec(src)
  expect(m, "SCOPE_STAMPED_RESOURCES moved — re-read this census").toBeTruthy()
  return [...(m as RegExpExecArray)[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1])
}

describe("every stamped resource's publisher names the account", () => {
  it("no publishChange on a stamped resource stops at five arguments", () => {
    const stamped = new Set(stampedResources())
    expect(stamped.size, "the stamped set did not parse").toBeGreaterThan(5)
    const offenders: string[] = []
    let sites = 0
    for (const worker of ["tenancy", "content", "data-ops"]) {
      for (const { path, source } of sourceFiles(join(ROOT, "workers", worker, "src"), {
        extensions: [".ts"],
      })) {
        const code = stripComments(source)
        // Each call, captured to its closing paren (publish calls here are one
        // statement; nesting inside the args is only ever `?? undefined`).
        for (const m of code.matchAll(/publishChange\(([^)]*)\)/g)) {
          const args = m[1]
          const resource = /,\s*"([a-z_]+)"/.exec(args)?.[1]
          if (!resource || !stamped.has(resource)) continue
          sites++
          // Six argument slots: env, team, resource, id, op, scope. Count the
          // top-level commas — five commas = six args = a stamp is present.
          //
          // TWO legal shapes, not one. A ROW ping (an id in slot four) must
          // stamp — that is this census's whole point. A COARSE ping (three
          // args, no id) is the documented set-shaped pattern: it refreshes
          // the staff-wide list, and the fenced side is served by the
          // per-account ping published BESIDE it (see postBulkHelpStatus) —
          // an id-less ping with no stamp reaches no fenced listener and
          // misleads nobody. Flag the middle: an id without a stamp.
          const commas = args.split(",").length - 1
          if (commas >= 3 && commas < 5)
            offenders.push(`${path.slice(ROOT.length + 1)} → publishChange(…"${resource}"…)`)
        }
      }
    }
    expect(sites, "the census found no stamped publishes — it has gone blind").toBeGreaterThan(15)
    expect(
      offenders,
      `these publish a STAMPED resource without naming the account — the fenced side goes ` +
        `silently deaf, not loud: pass the account as the sixth argument (or take the resource ` +
        `out of SCOPE_STAMPED_RESOURCES with the portal listener that reads it): ${offenders.join(", ")}`
    ).toEqual([])
  })
})
