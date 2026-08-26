// EVERY ACT-AS-USER HOP GOES THROUGH THE ONE SEAM. `forwardToDoor` carries the
// trace id BY CONSTRUCTION (a required field) and can carry a deadline — but
// "by construction" binds only the seam's users. The import executors proved
// that: two hand-built `{Cookie}` fetches sat beside the seam for weeks, so a
// failing import landed error rows unjoinable to their batch and a hung door
// held the whole run (round-two architecture review). This census closes the
// class: any internal fetch that forwards a caller's Cookie either IS the seam
// or is pinned here with its reason.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const ROOT = join(__dirname, "..", "..", "..")

/** Hand-built cookie-forwarding fetches that are allowed to exist, each with
 * the decision. Rot-checked: an entry no scan finds any more turns red. */
const HAND_BUILT_OK: Record<string, string> = {
  "workers/data-ops/src/lib/agent.ts":
    "the confirm panel's id→name resolver — a COSMETIC read with a deliberate " +
    "3s ceiling (its own comment: slow tenancy costs the panel its names, never " +
    "the turn its answer) and traceHeaders spread by hand. The seam's contract " +
    "(throw on abort) is the wrong one here; nulls are the design.",
  "workers/realtime/src/index.ts":
    "the socket handshake's identity read — carries trace + AUTH_UNAVAILABLE_MS " +
    "and tells an auth OUTAGE (503, keep the socket path honest) apart from a " +
    "signed-out caller (401), a distinction the seam's plain response passthrough " +
    "was not built to make.",
}

describe("no hand-built act-as-user hop", () => {
  it("every fetch that forwards a Cookie is forwardToDoor, or pinned", () => {
    const offenders: string[] = []
    const stale = new Set(Object.keys(HAND_BUILT_OK))
    let seamCalls = 0
    for (const worker of ["tenancy", "content", "data-ops", "mcp", "auth", "realtime"]) {
      for (const { path, source } of sourceFiles(join(ROOT, "workers", worker, "src"), {
        extensions: [".ts"],
      })) {
        const code = stripComments(source)
        seamCalls += (code.match(/forwardToDoor\(/g) ?? []).length
        // A hand-built hop: a .fetch( whose init mentions a Cookie header. The
        // seam's own body lives in shared/, so nothing here matches it.
        for (const m of code.matchAll(/\.fetch\([\s\S]{0,400}?Cookie[\s\S]{0,120}?\)/g)) {
          const key = path.slice(ROOT.length + 1)
          stale.delete(key)
          if (!(key in HAND_BUILT_OK)) offenders.push(`${key} → ${m[0].slice(0, 80).replace(/\s+/g, " ")}…`)
        }
      }
    }
    expect(seamCalls, "the seam-usage count went blind").toBeGreaterThan(3)
    expect(
      offenders,
      `these forward a caller's Cookie with a hand-built fetch — use forwardToDoor ` +
        `(trace id + deadline come with it), or pin the file in HAND_BUILT_OK with the ` +
        `decision: ${offenders.join(", ")}`
    ).toEqual([])
    expect([...stale], `HAND_BUILT_OK names files with no hand-built hop left — delete: ${[...stale].join(", ")}`).toEqual([])
  })
})
