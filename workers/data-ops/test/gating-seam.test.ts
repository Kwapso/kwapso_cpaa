// R10 — the gating seam for DATA-OPS. The scan itself is shared
// (shared/rules/seam-scan.ts); what lives here is the only thing that is
// genuinely this worker's — the reviewed exceptions.
//
// Data-ops has NONE on the write side: the import steps gate on an import right
// (confirm gates `create` on every destination module), the assistant gates on
// `agent:create`, and the owner endpoints (grant-credits, seed-targets,
// errors/resolve) gate on adminGuard. That empty object is a statement, not an
// oversight.
//
// AND ITS READS ARE SCANNED TOO, which R10 alone does not cover. `teamContext`
// proves signed-in + an active membership; it evaluates no right. That is the
// whole answer for a door serving the app's own SHAPE (the import catalogue, a
// blank sample file) and for one that reads only the caller's OWN rows. It was
// NOT the answer for `GET /import/batches`, which hands back the team's import
// history — uploaded file names, target tables, row counts — to anyone signed
// in, including a client login on the agency origin. So every read door either
// asks a permission question or is named below with the reason it needn't.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { gatingSeam, indexFunctions } from "@shared/rules/seam-scan"
import { stripComments } from "@shared/rules/source-scan"
import { ROUTES } from "../src/index"

const SRC = join(__dirname, "..", "src")

gatingSeam({
  name: "data-ops",
  routes: ROUTES,
  src: SRC,
  minRoutes: 8,
  identityGated: {},
})

/** The READ doors that legitimately ask no permission question, each with the
 * reason. Adding a line is a conscious decision — that is the point. */
const NO_RIGHT_NEEDED: Record<string, string> = {
  "GET /api/data-ops/import/targets":
    "the catalogue of importable tables — the app's own shape, not the team's rows; the picker needs it before any right is known",
  "GET /api/data-ops/import/sample":
    "a blank template CSV: column labels plus one invented example row, and no team data at all",
  "GET /api/data-ops/import/batch":
    "one working batch, CREATOR-SCOPED in loadBatch (WHERE creator_id = ?) — the caller's own rows are their own business",
  "GET /api/data-ops/agent/thread":
    "one saved conversation, gated on agent:read and then proved to be the caller's own",
}

/** What counts as asking a permission question. `teamContext` is deliberately
 * absent: it proves membership, never a right. */
const RIGHT_RE =
  /(?<![A-Za-z0-9_$.])(?:requireRight|gated|gatedBody|requireAnyImportRight|adminGuard|refusePortalCaller)\s*(?:<[^(<>]*>)?\s*\(/

describe("gating-seam (data-ops): every read door asks a permission question", () => {
  const routeFns = indexFunctions(join(SRC, "routes"))
  const reads = Object.entries(ROUTES).filter(([r]) => r.startsWith("GET "))

  it("finds the read routes (the scan itself must not go blind)", () => {
    expect(reads.length, "data-ops serves several read doors").toBeGreaterThanOrEqual(8)
  })

  it("every read either evaluates a right or is a reviewed exemption", () => {
    for (const [route, def] of reads) {
      if (NO_RIGHT_NEEDED[route]) continue
      const body = routeFns.get(def.handler.name)
      expect(body, `handler ${def.handler.name} (${route}) must be an exported async function in routes/`).toBeDefined()
      expect(
        RIGHT_RE.test(stripComments(body as string)),
        `${route} (${def.handler.name}) answers with team data behind teamContext alone — teamContext proves membership, not a right. Gate it, or add it to NO_RIGHT_NEEDED with a reason.`
      ).toBe(true)
    }
  })

  it("every exemption names a route that exists, and states a real reason", () => {
    for (const [route, why] of Object.entries(NO_RIGHT_NEEDED)) {
      expect(ROUTES[route], `NO_RIGHT_NEEDED lists ${route}, which is not a route`).toBeDefined()
      expect(why.length, `${route} is an exception — that needs a real reason`).toBeGreaterThan(20)
    }
  })

  // The exemption for the working batch rests entirely on loadBatch's WHERE
  // clause. If that clause goes, the exemption becomes a hole rather than a
  // reason, and this is the line that notices.
  it("the creator-scoped exemption is backed by a creator-scoped read", () => {
    const lib = stripComments(readFileSync(join(SRC, "lib", "import-batch.ts"), "utf8"))
    const start = lib.indexOf("async function loadBatch")
    expect(start, "loadBatch must exist").toBeGreaterThan(-1)
    expect(
      /creator_id\s*=\s*\?/.test(lib.slice(start, lib.indexOf("\nfunction ", start))),
      "GET /import/batch is exempt from a right BECAUSE loadBatch is creator-scoped — keep the WHERE clause or gate the door"
    ).toBe(true)
  })
})
