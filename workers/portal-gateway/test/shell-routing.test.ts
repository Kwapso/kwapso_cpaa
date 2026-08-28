// CAN A LINK WE EMAILED A CLIENT BE OPENED?
//
// The agency door's own shell-routing suite was earned on 17 Aug 2026 from a
// tester's sentence — "a systemic issue with deep links on how the pages are
// loading" — and it fixed exactly this fault: `run_worker_first` in
// wrangler.jsonc is an ARRAY, so every path NOT listed skips the Worker and is
// answered by the asset layer, which with `not_found_handling: "404-page"` is a
// 404. The array named a `/help/*` that was not a URL segment in the app.
//
// THE PORTAL WAS NEVER GIVEN THAT TEST, and three days later the owner pasted
// `staging-client.kwapso.app/tickets/01KZXD55…` and got the 404 page. The array
// here read `/support/*` — a path that appears nowhere in this codebase except
// that line — while the handler forwarded `/tickets/`. Same two halves, same
// disagreement, same 404, on the other front door.
//
// IT LOOKED FINE BECAUSE CLICKING NEVER LEAVES THE PAGE. In-app navigation is
// client-side, so the only ways to meet it were a reload, a pasted link, and
// every ticket-notification email a client has ever received —
// shared/workers/record-link.ts builds those as `/tickets/<id>`, which is to say
// the portal's emails have been linking to the 404 page.
//
// So this suite reads BOTH halves off disk and refuses to let them disagree, in
// EVERY environment, because wrangler envs do not inherit a parent's assets
// block. It is the agency suite's twin on purpose: a fault fixed on one front
// door and not the other is a fault waiting for the second door's turn.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments, stripJsoncComments } from "@shared/rules/source-scan"

import { SHELL_MODULES } from "../src/index"

const HERE = join(__dirname, "..")

type AssetsBlock = { run_worker_first?: string[] }
type PortalConfig = {
  assets?: AssetsBlock
  env?: Record<string, { assets?: AssetsBlock }>
}

const config: PortalConfig = JSON.parse(
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
 * never re-typed here. */
const handlerPrefixes = SHELL_MODULES.map((m) => `/${m}/*`)

describe("every path the portal handler owns is also worker-first", () => {
  it("declares an assets block in every environment", () => {
    expect(blocks.length).toBeGreaterThan(1)
    for (const [name, assets] of blocks)
      expect(assets?.run_worker_first, `${name} must declare run_worker_first`).toBeInstanceOf(Array)
  })

  for (const [name, assets] of blocks) {
    it(`${name}: serves the shell for every deep link`, () => {
      const listed = new Set(assets?.run_worker_first ?? [])
      const missing = handlerPrefixes.filter((p) => !listed.has(p))
      expect(
        missing,
        `${name}: these paths reach the deep-link shell in src/index.ts but are not in ` +
          `run_worker_first, so the asset layer 404s them before the Worker runs`
      ).toEqual([])
    })

    it(`${name}: lists no prefix the handler would not serve`, () => {
      const known = new Set([...handlerPrefixes, "/api/*", "/media/*", "/mcp"])
      const strays = (assets?.run_worker_first ?? []).filter((p) => !known.has(p))
      expect(
        strays,
        `${name}: run_worker_first names a path nothing in src/index.ts handles — ` +
          `a dead entry reads as coverage (this is how "/support/*" outlived the rename ` +
          `and took every ticket deep link down with it)`
      ).toEqual([])
    })
  }
})

// ── the other end of the same wire ───────────────────────────────────────────
//
// The suites above prove the gateway SERVES the shell. This proves the app
// EMITS the link that needs it: record-link.ts is what a client's email button
// points at, and a path it builds under a prefix the gateway does not forward is
// the same 404 arriving by post instead of by paste.

describe("every portal link an email can carry lands on a served path", () => {
  it("the ticket deep link sits under a shell prefix", () => {
    // COMMENTS OFF BEFORE THE SCAN, because the tripwire below is the whole
    // point of this test and prose can hold it up. Proved 27 Aug 2026: rename
    // every real deep link in record-link.ts and leave ONE comment showing the
    // shape — "a portal deep link looks like `/tickets/${ticketId}`" — and the
    // scan reports itself alive while matching nothing that ships. That is worse
    // than a check that simply passes: it launders an absence into a pass.
    const source = stripComments(
      readFileSync(join(HERE, "..", "..", "shared", "workers", "record-link.ts"), "utf8")
    )
    // The portal paths this file builds, read off its own source rather than
    // retyped: a template literal beginning `/…/${` is a deep link with an id in
    // it, and every one of them needs its prefix forwarded.
    const deepLinks = [...source.matchAll(/`\/([a-z-]+)\/\$\{/g)].map((m) => m[1])
    expect(deepLinks.length, "the link scan found nothing — it has gone blind").toBeGreaterThan(0)
    const served = new Set(SHELL_MODULES)
    // `t` is the agency's own grammar and is served by the agency gateway; only
    // the portal's own segments are this door's business.
    const portalDeepLinks = deepLinks.filter((seg) => seg !== "t")
    const unserved = portalDeepLinks.filter((seg) => !served.has(seg))
    expect(
      unserved,
      `record-link.ts builds a portal deep link under /${unserved.join(", /")}/ but the ` +
        `portal gateway serves no shell there — the button in a client's email is a 404`
    ).toEqual([])
  })
})
