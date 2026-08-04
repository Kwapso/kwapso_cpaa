// R19 — AGENT/MCP FILTER PARITY. Any tool sitting on a screen's list door must
// EXPOSE and FORWARD every filter that door parses — or the assistant falls back
// to free text and answers a DIFFERENT question (downstream: 3,465 descriptions
// that merely mentioned the words instead of the 134 records carrying the value).
// The required filter set is DERIVED from the door's own parameter parsing
// (searchParams.get calls in its handler) — never hand-listed here.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { SHARED_TOOLS } from "../../../shared/workers/tool-catalog"

const ROOT = join(__dirname, "..", "..", "..")

/** All route-handler source for a worker (its routes/ directory, concatenated
 * per file so a handler's params stay attributable). */
function routeSources(worker: string): [string, string][] {
  const dir = join(ROOT, "workers", worker, "src", "routes")
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, readFileSync(join(dir, f), "utf8")])
}

/** The params a door's handler parses, derived from ITS OWN source: find the
 * exported handler that mentions the route path's last segment… routes don't
 * carry their path, so we resolve handler→params via the worker's ROUTES table
 * source (index.ts) naming the handler per path. */
function doorParams(worker: "tenancy" | "content", path: string): string[] {
  const index = readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")
  const m = new RegExp(`"GET ${path.replaceAll("/", "\\/")}"\\s*:\\s*\\{\\s*handler:\\s*(\\w+)`).exec(index)
  if (!m) return []
  const handler = m[1]
  for (const [, src] of routeSources(worker)) {
    const at = src.indexOf(`function ${handler}(`)
    if (at === -1) continue
    const next = src.indexOf("\nexport ", at + 1)
    const body = src.slice(at, next === -1 ? undefined : next)
    return [...body.matchAll(/searchParams\.get\("(\w+)"\)/g)].map((x) => x[1])
  }
  return []
}

describe("agent-filter-parity (R19): tools forward every filter their door parses", () => {
  const listTools = SHARED_TOOLS.filter((t) => t.method === "GET")

  it("finds GET tools to check (the scan must not silently go blind)", () => {
    expect(listTools.length).toBeGreaterThanOrEqual(5)
  })

  for (const t of SHARED_TOOLS) {
    if (t.method !== "GET") continue
    it(`${t.name} exposes + forwards every param its door (${t.path}) parses`, () => {
      const params = doorParams(t.binding === "TENANCY" ? "tenancy" : "content", t.path)
      const props = Object.keys(
        (t.schema as { properties?: Record<string, unknown> }).properties ?? {}
      )
      const buildQuery = t.buildQuery?.toString() ?? ""
      for (const p of params) {
        expect(
          props.includes(p),
          `door ${t.path} parses "${p}" but tool ${t.name}'s schema doesn't expose it — the model can't send a filter it can't see`
        ).toBe(true)
        expect(
          buildQuery.includes(p),
          `tool ${t.name} exposes "${p}" but its buildQuery never forwards it — the door would silently ignore the filter`
        ).toBe(true)
      }
    })
  }
})
