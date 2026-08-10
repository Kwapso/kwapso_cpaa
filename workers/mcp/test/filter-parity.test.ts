// R19 — AGENT/MCP FILTER PARITY. Any tool sitting on a screen's list door must
// EXPOSE and FORWARD every filter that door parses — or the assistant falls back
// to free text and answers a DIFFERENT question (downstream: 3,465 descriptions
// that merely mentioned the words instead of the 134 records carrying the value).
// The required filter set is DERIVED from the door's own parameter parsing
// (searchParams.get calls in its handler) — never hand-listed here.
//
// THE SCAN STARTS AT THE DOORS, NOT THE TOOLS. It used to iterate SHARED_TOOLS,
// which means a door with NO tool was not a failure — it was invisible. That is
// how eleven capabilities across the customer spine sat outside the machine
// surface with a green R19 suite: `GET /api/tenancy/accounts` pages by cursor
// and parses q, type and parentId, and the law had nothing to check because
// nothing was checking it. A law that only inspects what you remembered to build
// measures your memory.
//
// So the target set is every FILTERED or PAGED door on the two workers the
// machine surface serves modules from (tenancy + content — the bindings the
// shared catalog can even name). A door that parses a query parameter must have
// a tool, and that tool must expose and forward every one of them — or be a
// named, reasoned line in TOOLLESS_DOORS below. Silence is not an option in
// either direction.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { SHARED_TOOLS } from "../../../shared/workers/tool-catalog"
import { MCP_TOOLS } from "../src/lib/tools"
import { TOOL_CATALOG } from "../../data-ops/src/lib/tools"

const ROOT = join(__dirname, "..", "..", "..")

/** The workers whose doors this law governs: the ones the shared catalog binds,
 * i.e. the ones that serve the app's MODULES. data-ops is the machine plumbing
 * itself (the import batch engine, the assistant's own bookkeeping) and is
 * covered by its own suites. */
const WORKERS = ["tenancy", "content"] as const
type Worker = (typeof WORKERS)[number]

/** A filtered/paged door that deliberately has no tool on either machine
 * surface. Each line is a decision someone made, in writing — the alternative is
 * a gap nobody ever sees, which is what this rewrite exists to end. */
const TOOLLESS_DOORS: Record<string, string> = {
  "/api/tenancy/roles/permissions":
    "the agent has get_role_permissions; the MCP reads the same matrix — every role, every module, flattened — through export_roles_csv, so a tool here would be a second way to ask one question.",
  "/api/tenancy/invites/audit":
    "the forensic trail behind ONE invite (who sent it, when it was opened, when it was revoked). The invite's own state — email, role, status, id — is already machine-readable through list_invites; this is the strip a person reads on the invite's detail when something looks wrong.",
  "/api/tenancy/activity":
    "the cross-module history feed, and the one door whose answer is assembled by SUBTRACTING the caller's denied modules (R18). Everything it reports is readable through the module's own tools, with that module's own gate; putting the merged stream on the machine surface is a separate decision for the owner, not a parity default.",
}

/** All route-handler source for a worker (its routes/ directory, concatenated
 * per file so a handler's params stay attributable). */
function routeSources(worker: string): [string, string][] {
  const dir = join(ROOT, "workers", worker, "src", "routes")
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, readFileSync(join(dir, f), "utf8")])
}

const indexSource = (worker: string) => readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")

/** The params a door's handler parses, derived from ITS OWN source: index.ts
 * names the handler for the path, and the handler's `searchParams.get` calls are
 * the truth. */
function doorParams(worker: Worker, path: string): string[] {
  const m = new RegExp(`"GET ${path.replaceAll("/", "\\/")}"\\s*:\\s*\\{\\s*handler:\\s*(\\w+)`).exec(
    indexSource(worker)
  )
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

/** Every GET door on these workers that takes at least one query parameter —
 * i.e. every door a caller can FILTER or PAGE. Read straight off each worker's
 * ROUTES table, so a door added tomorrow is in the set today. */
function filteredDoors(): { worker: Worker; path: string; params: string[] }[] {
  const out: { worker: Worker; path: string; params: string[] }[] = []
  for (const worker of WORKERS)
    for (const m of indexSource(worker).matchAll(/"GET (\/api\/[^"]+)"\s*:\s*\{\s*handler:\s*\w+/g)) {
      const params = doorParams(worker, m[1])
      if (params.length) out.push({ worker, path: m[1], params })
    }
  return out
}

/** Every READ tool on EITHER machine surface that forwards to a path — the
 * shared catalog, the MCP's own, and the agent's own. A capability reached from
 * one surface is not a gap; a capability reached from neither is.
 *
 * GET only, and de-duplicated by name: a POST tool can sit on the same path (a
 * ticket's stakeholders are read and added at one address) and it answers with a
 * body, not a query string — asking it to forward a filter would be asking the
 * wrong question. The three catalogs overlap by construction (each surface
 * PROJECTS the shared ones), so the same endpoint is checked once. */
type ToolView = { name: string; schema: unknown; buildQuery: string }
function toolsAt(path: string): ToolView[] {
  const all: ToolView[] = [
    ...SHARED_TOOLS.filter((t) => t.path === path && t.method === "GET").map((t) => ({
      name: t.name,
      schema: t.schema,
      buildQuery: t.buildQuery?.toString() ?? "",
    })),
    ...MCP_TOOLS.filter((t) => t.path === path && t.method === "GET").map((t) => ({
      name: t.name,
      schema: t.inputSchema,
      buildQuery: t.buildQuery?.toString() ?? "",
    })),
    ...TOOL_CATALOG.filter((t) => t.path === path && t.method === "GET").map((t) => ({
      name: t.name,
      schema: t.schema,
      buildQuery: t.buildQuery?.toString() ?? "",
    })),
  ]
  return [...new Map(all.map((t) => [t.name, t])).values()]
}

const DOORS = filteredDoors()

describe("agent-filter-parity (R19): the doors decide what the machine surface owes", () => {
  it("finds filtered doors to check (the scan must not silently go blind)", () => {
    expect(DOORS.length).toBeGreaterThanOrEqual(8)
    // The door whose absence this rewrite was earned by.
    expect(DOORS.map((d) => d.path)).toContain("/api/tenancy/accounts")
  })

  it("every reasoned gap still names a real filtered door (no rotting lines)", () => {
    for (const path of Object.keys(TOOLLESS_DOORS))
      expect(
        DOORS.some((d) => d.path === path),
        `${path} is excused in TOOLLESS_DOORS but is no longer a filtered door — delete the line`
      ).toBe(true)
  })

  it("a reasoned gap states a real reason", () => {
    for (const [path, why] of Object.entries(TOOLLESS_DOORS))
      expect(why.length, `${path} needs a reason someone can disagree with`).toBeGreaterThan(40)
  })

  it("every filtered door has a tool, or a named reasoned gap", () => {
    const silent = DOORS.filter((d) => !toolsAt(d.path).length && !(d.path in TOOLLESS_DOORS)).map(
      (d) => `${d.path} (parses ${d.params.join(", ")})`
    )
    expect(
      silent,
      `these doors filter or page for a person and reach no machine caller at all — add a tool, or a reasoned line in TOOLLESS_DOORS: ${silent.join(" · ")}`
    ).toEqual([])
  })

  for (const door of DOORS) {
    if (door.path in TOOLLESS_DOORS) continue
    for (const tool of toolsAt(door.path)) {
      it(`${tool.name} exposes + forwards every param its door (${door.path}) parses`, () => {
        const props = Object.keys(
          (tool.schema as { properties?: Record<string, unknown> }).properties ?? {}
        )
        for (const p of door.params) {
          expect(
            props.includes(p),
            `door ${door.path} parses "${p}" but tool ${tool.name}'s schema doesn't expose it — the model can't send a filter it can't see`
          ).toBe(true)
          expect(
            tool.buildQuery.includes(p),
            `tool ${tool.name} exposes "${p}" but its buildQuery never forwards it — the door would silently ignore the filter`
          ).toBe(true)
        }
      })
    }
  }
})
