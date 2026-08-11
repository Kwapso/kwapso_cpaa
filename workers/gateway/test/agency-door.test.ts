// THE AGENCY DOOR SUITE — the front door 170 lines of the app hang off, which
// until now had no test file at all while its day-old sibling shipped 195 lines
// of them. Everything a person or a machine reaches kwapso through passes this
// worker first; a mistyped prefix here answers a whole module with the wrong
// brain, and an /api path that falls through to the asset layer answers a fetch
// with an HTML page.
//
// Three things are worth more than the rest, so they are derived rather than
// hand-listed:
//
//   1. EVERY /api PATH THE APP ACTUALLY CALLS reaches a worker — read off
//      web/lib/api/ (every file in it, one per worker), so a door the app gains
//      tomorrow is covered today. (The portal suite reads the same directory to
//      prove the opposite: that none of them reaches the CLIENT door.)
//   2. NOTHING /api EVER FALLS THROUGH TO THE ASSET LAYER. An unknown API path
//      is "No such API.", not the SPA shell with a 200 on it.
//   3. THE MEDIA DOORS VALIDATE. This gateway serves any object whose key you
//      know — a recorded, deliberate capability-URL decision — which rests
//      entirely on the key being unguessable, so a probe must never reach R2.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import worker from "../src/index"

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

/** A bucket that records every key asked for. Answers nothing — what matters is
 * WHETHER it was asked, not what came back. */
function bucket(name: string, log: string[]) {
  return {
    get: async (key: string) => {
      log.push(`${name}.get ${key}`)
      return null
    },
  }
}

function makeEnv(log: string[], overrides: Record<string, unknown> = {}) {
  return {
    ASSETS: spy("ASSETS", log),
    AUTH: spy("AUTH", log),
    TENANCY: spy("TENANCY", log),
    REALTIME: spy("REALTIME", log),
    CONTENT: spy("CONTENT", log),
    DATAOPS: spy("DATAOPS", log),
    MCP: spy("MCP", log),
    MEDIA: bucket("MEDIA", log),
    LEARNING_MEDIA: bucket("LEARNING_MEDIA", log),
    INTERNAL_KEY: "test-internal-key",
    ...overrides,
  } as unknown as Parameters<typeof worker.fetch>[1]
}

function call(
  method: string,
  path: string,
  log: string[],
  init: RequestInit = {},
  overrides: Record<string, unknown> = {}
) {
  return worker.fetch(new Request(`https://app.kwapso.app${path}`, { method, ...init }), makeEnv(log, overrides))
}

describe("agency gateway — /api reaches the worker its path names", () => {
  const byPrefix: [string, string, string][] = [
    ["/api/auth/me", "AUTH", "identity"],
    ["/api/tenancy/roles", "TENANCY", "the team's machinery"],
    ["/api/content/help", "CONTENT", "learning + help"],
    ["/api/data-ops/agent/chat", "DATAOPS", "import + the assistant"],
    ["/api/mcp/tokens", "MCP", "the machine surface's front desk"],
    ["/mcp", "MCP", "the machine surface itself"],
    ["/api/realtime", "REALTIME", "the live channel"],
  ]

  for (const [path, upstream, what] of byPrefix) {
    it(`${path} → ${upstream} (${what})`, async () => {
      const log: string[] = []
      const res = await call("GET", path, log)
      expect(res.status).toBe(200)
      expect(log).toEqual([`${upstream} ${path}`])
    })
  }

  /** Every /api path literal the app's own API client calls, read off its source
   * rather than retyped — so a route the app gains tomorrow is in this set the
   * moment it ships. The portal's closed-door suite derives its attack list from
   * exactly the same place.
   *
   * It walks the DIRECTORY, not one file. The client used to be a single
   * `web/lib/api.ts` and this read it by name — so the day a door was declared in
   * any new file beside it, this suite would have gone on passing while covering
   * less. The client is now one file per worker under web/lib/api/. */
  function appApiPaths(): string[] {
    const found = new Set<string>()
    for (const file of sourceFiles(join(ROOT, "web", "lib", "api"), { extensions: [".ts"] }))
      // Comments first: these files DISCUSS their own paths in prose, and a door
      // named in a sentence is not a door the app calls.
      for (const m of stripComments(file.source).matchAll(/["'`](\/api\/[a-z0-9\-/]*)/g))
        found.add(m[1].replace(/\/$/, ""))
    return [...found]
  }

  it("derives a real surface to walk (guards the derivation itself)", () => {
    const paths = appApiPaths()
    expect(paths.length).toBeGreaterThan(30)
    expect(paths).toContain("/api/tenancy/roles")
    expect(paths).toContain("/api/data-ops/agent/chat")
  })

  // The failure this catches is a whole module going dark: a prefix deleted or
  // mistyped sends a real door to the 404 branch — or, worse, past it into the
  // asset layer, where a JSON fetch gets an HTML page and a 200.
  it("every door the app calls reaches a worker — none 404s, none hits assets", async () => {
    const stranded: string[] = []
    for (const path of appApiPaths()) {
      const log: string[] = []
      const res = await call("GET", path, log)
      if (res.status !== 200 || log.length !== 1 || log[0].startsWith("ASSETS"))
        stranded.push(`${path} → ${res.status} ${log.join()}`)
    }
    expect(stranded, `these doors the app calls do not reach a worker: ${stranded.join(", ")}`).toEqual([])
  })
})

describe("agency gateway — an unknown API is an API answer, never a page", () => {
  it("refuses an unknown /api path without saying why", async () => {
    const log: string[] = []
    const res = await call("GET", "/api/nope/does-not-exist", log)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "not_found", message: "No such API." })
    // Never the asset layer: an /api call that returned the SPA shell with a 200
    // would look like a working endpoint returning nonsense.
    expect(log).toEqual([])
  })

  it("does not let an /api path fall through to the screens", async () => {
    for (const path of ["/api/", "/api/tenancy", "/api/mcpx", "/api/log/client"]) {
      const log: string[] = []
      await call("GET", path, log)
      expect(
        log.filter((l) => l.startsWith("ASSETS")),
        `${path} reached the asset layer`
      ).toEqual([])
    }
  })
})

describe("agency gateway — the screens (the static-export trap)", () => {
  // The static export emits ONE shell per deep-link tree. Serving the deep path
  // would 404 a link someone was emailed, before the page could resolve it
  // client-side (EDGE-CASES.md).
  it("serves the /t shell for any depth, keeping the real URL", async () => {
    const log: string[] = []
    const res = await call("GET", "/t/01TEAM/accounts/01ACCOUNT/activity", log)
    expect(res.status).toBe(200)
    expect(log).toEqual(["ASSETS /t"])
  })

  it("serves each module's own shell for its sub-paths", async () => {
    for (const mod of ["accounts", "learning", "tickets"]) {
      const log: string[] = []
      await call("GET", `/${mod}/01RECORD`, log)
      expect(log, `/${mod}/<id> must resolve to the ${mod} shell`).toEqual([`ASSETS /${mod}`])
    }
  })

  it("leaves the bare module page alone (it is a real static file)", async () => {
    const log: string[] = []
    await call("GET", "/accounts", log)
    expect(log).toEqual(["ASSETS /accounts"])
  })

  it("serves ordinary screens straight from assets", async () => {
    const log: string[] = []
    await call("GET", "/settings", log)
    expect(log).toEqual(["ASSETS /settings"])
  })
})

describe("agency gateway — the media doors are capability URLs, so the key is checked", () => {
  it("serves a well-formed key from the right bucket", async () => {
    const log: string[] = []
    await call("GET", "/media/users/01USER/01J8ZQ4H7M9K2P5R7T9V1X3Y5Z", log)
    expect(log).toEqual(["MEDIA.get users/01USER/01J8ZQ4H7M9K2P5R7T9V1X3Y5Z"])
  })

  it("sends learning attachments to their own bucket (the more specific prefix wins)", async () => {
    const log: string[] = []
    await call("GET", "/media/learning/01TEAM/01J8ZQ4H7M9K2P5R7T9V1X3Y5Z", log)
    expect(log).toEqual(["LEARNING_MEDIA.get 01TEAM/01J8ZQ4H7M9K2P5R7T9V1X3Y5Z"])
  })

  // A probe must never reach R2, and must be answered exactly like a miss —
  // a different answer for "malformed" than for "missing" is an oracle.
  //
  // These are all ENCODED, on purpose: a raw `/media/../../etc/passwd` never
  // reaches this worker as a media path at all, because URL parsing resolves the
  // dot segments first and the request arrives asking for /etc/passwd. The ones
  // that actually get through to the key are the escaped forms, which is exactly
  // why the validation decodes before it judges.
  it("a probe is a 404 and never touches the bucket", async () => {
    for (const probe of [
      "users%2F..%2F..%2Fsecret",
      "users/..%2Fsecret",
      "users//secret",
      "users/01 USER",
      "%E0%A4%A",
      "users/*",
    ]) {
      const log: string[] = []
      const res = await call("GET", `/media/${probe}`, log)
      expect(res.status, `probe "${probe}" must 404`).toBe(404)
      expect(log, `probe "${probe}" reached R2`).toEqual([])
    }
  })

  it("only GET opens a media door", async () => {
    const log: string[] = []
    await call("POST", "/media/users/01USER/01J8ZQ4H7M9K2P5R7T9V1X3Y5Z", log)
    expect(log.filter((l) => l.includes(".get"))).toEqual([])
  })
})

describe("agency gateway — the client error beacon writes only for a verified session", () => {
  const beacon = (cookie: string | null, authOk: boolean) => {
    const log: string[] = []
    const env = {
      AUTH: {
        fetch: async (url: string, init?: RequestInit) => {
          log.push(`AUTH ${new URL(url).pathname}`)
          if (init?.headers && (init.headers as Record<string, string>)["x-internal-key"])
            log.push(`key:${(init.headers as Record<string, string>)["x-internal-key"]}`)
          return new Response(null, { status: authOk ? 200 : 401 })
        },
      },
    }
    const headers: Record<string, string> = cookie ? { Cookie: cookie } : {}
    return {
      log,
      res: call(
        "POST",
        "/api/log/client",
        log,
        { headers, body: JSON.stringify({ where: "test", message: "boom" }) },
        env
      ),
    }
  }

  // A Cookie header is attacker-controlled. Before this was verified, `Cookie:
  // kwapso_session=x` was enough to write a row into the GLOBAL core database
  // from an anonymous request.
  it("an anonymous beacon is accepted, logged to the console, and written nowhere", async () => {
    const { log, res } = beacon(null, false)
    expect((await res).status).toBe(204)
    expect(log, "no session, no internal write").toEqual([])
  })

  it("a forged cookie is checked with auth and rejected before the write", async () => {
    const { log, res } = beacon("kwapso_session=forged", false)
    expect((await res).status).toBe(204)
    expect(log, "auth was asked, and said no — nothing was written").toEqual(["AUTH /api/auth/me"])
  })

  it("a verified session records the crash through auth's internal door", async () => {
    const { log, res } = beacon("kwapso_session=real", true)
    expect((await res).status).toBe(204)
    expect(log).toEqual(["AUTH /api/auth/me", "AUTH /internal/log-error", "key:test-internal-key"])
  })
})
