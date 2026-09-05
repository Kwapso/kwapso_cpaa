// A HEALTH CHECK THAT NAMES A BINDING NOBODY PROVIDES IS WORSE THAN NO HEALTH CHECK.
//
// Earned on 5 Sep 2026, by the deploy that shipped the health doors themselves.
// `workers/realtime` declared `TEAM_CHANNEL` — the Durable Object's CLASS name,
// not the name it is BOUND as (`CHANNELS`). A worker with nothing wrong with it
// answered `{"ok":false,"config":{"missing":["TEAM_CHANNEL"]}}`, the staging smoke
// asserts `ok === true`, and a green build failed at its own last step. Four other
// workers were right and one was wrong; nothing could tell them apart, because the
// list is a string array and every string type-checks.
//
// The other direction is the worse one, and is why this is a test and not a note:
// a wrong name reports a HEALTHY worker as broken, and the second time somebody
// sees that they stop believing the door. A health check nobody believes is an
// outage nobody notices.
//
// TWO SUBTRACTIONS MAKE THE CENSUS HONEST, and the first two drafts each missed one.
//
//   1. The `healthBody(...)` CALL is cut from the evidence. Draft one read
//      `index.ts` whole, so every name proved itself: the mutation that put
//      `TEAM_CHANNEL` back ran GREEN, because the name was now inside the very
//      call being checked.
//   2. COMMENTS are cut. Draft two's fix wrote an explanatory comment INTO the
//      worker naming `TEAM_CHANNEL` in prose — and the census read the prose as
//      evidence the binding exists. A law that reads source off the disk reads
//      the comments too (CONVENTIONS.md says so; this is the third time).

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const ROOT = join(__dirname, "..", "..")
const WORKERS = join(ROOT, "workers")

/** The worker roster, DERIVED — every directory under `workers/` that has an
 * entry point. Through `sourceFiles` rather than a hand walk, per the house law
 * (`source-scan.test.ts`), and so a ninth worker is in the census the day it
 * lands rather than the day somebody remembers this file. */
const workers = [
  ...new Set(
    sourceFiles(WORKERS, { extensions: ["index.ts"], relativeTo: WORKERS })
      .filter((f) => f.rel.endsWith(join("src", "index.ts")))
      .map((f) => f.rel.split("/")[0])
  ),
].sort()

/** Every `healthBody("<worker>", env, ["A", "B"])` name, off the source. */
function declaredNames(worker: string): string[] {
  const p = join(WORKERS, worker, "src", "index.ts")
  if (!existsSync(p)) return []
  const m = /healthBody\(\s*"[a-z-]+"\s*,\s*env\s*,\s*\[([^\]]*)\]/.exec(readFileSync(p, "utf8"))
  return m ? [...m[1].matchAll(/"([A-Z_0-9]+)"/g)].map((x) => x[1]) : []
}

/** What the DEPLOYMENT actually provides. The wrangler file carries every
 * binding, service, Durable Object, bucket and var; a SECRET is write-only on
 * Cloudflare and appears in none of them, so the worker's own `Env` type is the
 * second oracle — which is why `index.ts` is read at all, minus the two
 * subtractions above. */
function providedNames(worker: string): string {
  const parts: string[] = []
  for (const f of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
    const p = join(WORKERS, worker, f)
    if (existsSync(p)) parts.push(readFileSync(p, "utf8"))
  }
  for (const f of ["env.d.ts", "env.ts", "types.ts", "index.ts"]) {
    const p = join(WORKERS, worker, "src", f)
    if (existsSync(p)) parts.push(readFileSync(p, "utf8"))
  }
  return stripComments(parts.join("\n")).replace(/healthBody\([\s\S]*?\]\s*\)/g, "")
}

describe("every worker's health door names something that exists", () => {
  it("finds the workers and their health declarations — the canary", () => {
    // Without this, a rename of `healthBody` leaves the assertion below iterating
    // an empty list and passing over nothing at all.
    expect(workers.length, "no workers found — the roster is broken").toBeGreaterThanOrEqual(8)
    expect(
      workers.filter((w) => declaredNames(w).length > 0).length,
      "no healthBody(...) declarations found — this census is broken, not the code"
    ).toBeGreaterThanOrEqual(4)
  })

  it("names a real binding, service, Durable Object, bucket, var or secret", () => {
    const wrong: string[] = []
    for (const w of workers) {
      const provided = providedNames(w)
      for (const n of declaredNames(w)) {
        // Word-boundary, so `AI` does not match inside `CHAIN`.
        if (!new RegExp(`\\b${n}\\b`).test(provided))
          wrong.push(`workers/${w}: health declares "${n}", which its config and env type never mention`)
      }
    }
    expect(
      wrong,
      "a health door naming a binding nobody provides reports a healthy worker as broken, and the smoke fails the deploy on it"
    ).toEqual([])
  })
})
