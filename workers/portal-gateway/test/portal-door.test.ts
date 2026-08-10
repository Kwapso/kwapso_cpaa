// THE CLOSED-DOOR SUITE — the portal gateway's own seam test.
//
// The agency gateway forwards by PREFIX; this one forwards by NAME. That choice
// is the whole security value of the second front door, and it is worth exactly
// as much as the test that proves it. So this suite drives the real worker with
// fake upstreams and asserts three things a reviewer would otherwise have to
// take on trust:
//
//   1. EVERY named door reaches the worker it names — a fan-out that quietly
//      dropped a route would look identical to a fence, and be a broken app.
//   2. EVERY unnamed door is refused, derived from the AGENCY gateway's own
//      surface rather than a hand-typed wish-list: every /api prefix and every
//      route the agency app actually calls is tried here, and must 404.
//   3. The refusal reveals nothing — the same "No such API." sentence a
//      genuinely absent route gets, so this surface is never an oracle for what
//      the agency app can do.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import worker, { PORTAL_DOORS } from "../src/index"

const ROOT = join(__dirname, "..", "..", "..")

/** A fake upstream that records what it was handed and answers 200. */
function spy(name: string, log: string[]) {
  return {
    fetch: async (request: Request) => {
      log.push(`${name} ${new URL(request.url).pathname}`)
      return new Response(name)
    },
  }
}

function makeEnv(log: string[]) {
  return {
    ASSETS: spy("ASSETS", log),
    AUTH: spy("AUTH", log),
    TENANCY: spy("TENANCY", log),
    CONTENT: spy("CONTENT", log),
    REALTIME: spy("REALTIME", log),
    MEDIA: { get: async () => null },
  } as unknown as Parameters<typeof worker.fetch>[1]
}

function call(method: string, path: string, log: string[]) {
  return worker.fetch(new Request(`https://client.kwapso.app${path}`, { method }), makeEnv(log))
}

describe("portal gateway — the named doors open", () => {
  for (const [door, upstream] of Object.entries(PORTAL_DOORS)) {
    const [method, path] = door.split(" ")
    it(`${door} → ${upstream}`, async () => {
      const log: string[] = []
      const res = await call(method, path, log)
      expect(res.status).toBe(200)
      expect(log).toEqual([`${upstream} ${path}`])
    })
  }
})

describe("portal gateway — everything else is closed", () => {
  /** The AGENCY app's whole /api surface, read off ITS source rather than
   * retyped: every path literal the agency's API client calls. A route the
   * agency gains tomorrow is in this set the moment it ships, so the portal can
   * never silently inherit it. */
  function agencyApiPaths(): string[] {
    const src = readFileSync(join(ROOT, "web", "lib", "api.ts"), "utf8")
    const found = new Set<string>()
    for (const m of src.matchAll(/["'`](\/api\/[a-z0-9\-/]*)/g)) {
      // Trim a trailing slash left by a template literal that continues into an id.
      found.add(m[1].replace(/\/$/, ""))
    }
    return [...found]
  }

  const named = new Set(Object.keys(PORTAL_DOORS))

  it("derives a real agency surface to attack (guards the derivation itself)", () => {
    const paths = agencyApiPaths()
    expect(paths.length).toBeGreaterThan(30)
    expect(paths).toContain("/api/tenancy/roles")
    expect(paths).toContain("/api/data-ops/agent/chat")
    expect(paths).toContain("/api/mcp/tokens")
  })

  for (const method of ["GET", "POST"]) {
    it(`refuses every agency ${method} door the portal does not name`, async () => {
      const leaked: string[] = []
      for (const path of agencyApiPaths()) {
        if (named.has(`${method} ${path}`)) continue
        const log: string[] = []
        const res = await call(method, path, log)
        if (res.status !== 404 || log.length) leaked.push(`${method} ${path} → ${res.status} ${log.join()}`)
      }
      expect(leaked, `these agency doors are reachable from the client portal: ${leaked.join(", ")}`).toEqual([])
    })
  }

  // The machine surface has no path prefix to sweep it up, so it is named here.
  // A client portal is not a place to hand out MCP sessions.
  it("refuses the MCP endpoint", async () => {
    const log: string[] = []
    const res = await call("POST", "/mcp", log)
    expect(res.status).toBe(404)
    expect(log).toEqual([])
  })

  it("refuses an unknown /api path without saying why", async () => {
    const log: string[] = []
    const res = await call("GET", "/api/tenancy/does-not-exist", log)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "not_found", message: "No such API." })
    expect(log).toEqual([])
  })

  // A named door is named for ONE method. POSTing to a read door must not slip
  // through on the path alone — the table is keyed by `METHOD path` for exactly
  // this reason.
  it("refuses the right path with the wrong method", async () => {
    const log: string[] = []
    const res = await call("POST", "/api/tenancy/accounts", log)
    expect(res.status).toBe(404)
    expect(log).toEqual([])
  })

  // No binding, no forward. The allow-list is backed by wrangler.jsonc, not just
  // by code: this worker cannot reach data-ops or mcp even if a line went wrong.
  it("binds only the four workers the portal uses", () => {
    const cfg = readFileSync(join(__dirname, "..", "wrangler.jsonc"), "utf8")
    for (const banned of ["kwapso-data-ops", "kwapso-mcp"])
      expect(cfg, `${banned} must not be bound to the portal door`).not.toContain(banned)
  })

  // portal.kwapso.app points at the owner's LIVE Glide portal. Claiming it from
  // here took that link down once already. Domains are attached from the
  // dashboard, so the guard is: this config claims no hostname in code, and the
  // warning that explains why is still in front of whoever changes that.
  it("claims no hostname in code, and keeps the reason on the page", () => {
    const cfg = readFileSync(join(__dirname, "..", "wrangler.jsonc"), "utf8")
    expect(cfg, "a route here would claim a hostname without review").not.toContain('"routes"')
    expect(cfg).toContain("portal.kwapso.app is TAKEN")
    expect(cfg).toContain("client.kwapso.app")
  })
})

describe("portal gateway — the screens", () => {
  it("serves the support shell for a deep-linked ticket (static-export trap)", async () => {
    const log: string[] = []
    const res = await call("GET", "/support/01JABCDEF", log)
    expect(res.status).toBe(200)
    // The SHELL is fetched, not the deep path — otherwise the asset layer 404s a
    // ticket link before the page can resolve it client-side.
    expect(log).toEqual(["ASSETS /support"])
  })

  it("serves ordinary screens straight from assets", async () => {
    const log: string[] = []
    await call("GET", "/home", log)
    expect(log).toEqual(["ASSETS /home"])
  })
})
