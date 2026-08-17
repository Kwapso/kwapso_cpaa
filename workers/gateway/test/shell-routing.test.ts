// CAN A LINK SOMEBODY SHARED BE OPENED?
//
// Earned on 17 Aug 2026, from a tester's sentence: "a systemic issue with deep
// links on how the pages are loading". Pasting /tickets/<id> into the address bar
// returned Next's 404 page. So did /stories/<id>, /tasks/<id>, /meetings/<id> and
// eleven more — every clean module URL except /learning/<id>.
//
// The routing code was right. The gateway's handler serves the module's shell for
// any depth under fifteen module prefixes, and has since those pages shipped. What
// was wrong was the OTHER half of the contract, one file along: `run_worker_first`
// in wrangler.jsonc is an ARRAY, and an array means every path not listed skips
// the Worker entirely and is answered by the asset layer — which, with
// `not_found_handling: "404-page"`, is a 404. That array still read
// `["/api/*", "/media/*", "/t/*", "/learning/*", "/help/*", "/mcp"]`: one live
// module, and a `/help/*` that is not a URL segment in this app at all (the
// section renamed to `tickets` long ago and the config was never told).
//
// Neither half can be read as wrong on its own, which is why nothing caught it —
// the loop looks complete, and the array looks like a deliberate short list. So
// this suite reads BOTH off disk and refuses to let them disagree, in EVERY
// environment, because wrangler envs do not inherit a parent's assets block.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripJsoncComments } from "@shared/rules/source-scan"

import { SHELL_MODULES } from "../src/index"

const HERE = join(__dirname, "..")

type AssetsBlock = { run_worker_first?: string[] }
type GatewayConfig = {
  assets?: AssetsBlock
  env?: Record<string, { assets?: AssetsBlock }>
}

const config: GatewayConfig = JSON.parse(
  stripJsoncComments(readFileSync(join(HERE, "wrangler.jsonc"), "utf8"))
)

/** Every assets block the config declares, named by the environment it governs.
 * Derived, so a third environment is covered the day somebody adds one. */
const blocks: [string, AssetsBlock | undefined][] = [
  ["production", config.assets],
  ...Object.entries(config.env ?? {}).map(
    ([name, e]) => [name, e.assets] as [string, AssetsBlock | undefined]
  ),
]

/** The prefixes the HANDLER claims — read from the same constant it loops over,
 * never re-typed here, plus the two roots it owns outright. */
const handlerPrefixes = ["/t/*", ...SHELL_MODULES.map((m) => `/${m}/*`)]

describe("every path the gateway handler owns is also worker-first", () => {
  it("declares an assets block in every environment", () => {
    expect(blocks.length).toBeGreaterThan(1)
    for (const [name, assets] of blocks)
      expect(assets?.run_worker_first, `${name} must declare run_worker_first`).toBeInstanceOf(Array)
  })

  for (const [name, assets] of blocks) {
    it(`${name}: serves the shell for every module deep link`, () => {
      const listed = new Set(assets?.run_worker_first ?? [])
      const missing = handlerPrefixes.filter((p) => !listed.has(p))
      expect(
        missing,
        `${name}: these paths reach the deep-link shell in src/index.ts but are not in ` +
          `run_worker_first, so the asset layer 404s them before the Worker runs`
      ).toEqual([])
    })

    it(`${name}: lists no module prefix the handler would not serve`, () => {
      const known = new Set([...handlerPrefixes, "/api/*", "/media/*", "/mcp"])
      const strays = (assets?.run_worker_first ?? []).filter((p) => !known.has(p))
      expect(
        strays,
        `${name}: run_worker_first names a path nothing in src/index.ts handles — ` +
          `a dead entry reads as coverage (this is how "/help/*" outlived the rename)`
      ).toEqual([])
    })
  }
})
