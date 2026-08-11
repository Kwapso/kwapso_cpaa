// A WRITE THAT ANOTHER SITE STARTED IS NOT A WRITE — on BOTH front doors.
//
// The hole this closes was not a missing gate. Every mutating door in the app
// opens with `requireRight`, and every one of them passed: they were asked by the
// victim's own browser, carrying the victim's own cookie, and they answered
// correctly for the person who was (unknowingly) asking.
//
// What made that reachable is a pair of ordinary-looking facts:
//   • the session cookie is `SameSite=Lax`, and a "site" is the REGISTRABLE
//     domain — kwapso.app. `dig portal.kwapso.app` answers custom.glideapps.com:
//     a third-party no-code SaaS, on our site, able to serve HTML;
//   • `shared/workers/route.ts` does `await request.json()` and Workers does not
//     care what Content-Type says, so `<form enctype="text/plain">` reaches a
//     JSON door. The `name=value` encoding shapes the body — one input named
//     `{"userId":"…","roleId":"<admin>","x":"` with value `"}` is valid JSON —
//     and text/plain is a CORS-simple request, so nothing is preflighted.
//
// Put together: a page on the sibling host POSTs to the agency's member-role
// door, the cookie rides along, and the attacker is promoted. The suite below
// fires exactly that request, and then fires the same request WITHOUT the header
// so a green result can never mean "the door was closed anyway".
//
// It drives BOTH real workers, because the cookie is one cookie and the site is
// one site — a control that reached only one door would be the media-key mistake
// again (see shared/workers/front-door.ts's header for that one).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import agency from "../src/index"
import portal from "../../portal-gateway/src/index"

const ROOT = join(__dirname, "..", "..", "..")

/** A fake upstream that records what it was handed. Whether it was ASKED is the
 * whole assertion — a refused request must never reach a brain. */
function spy(name: string, log: string[]) {
  return {
    fetch: async (request: Request) => {
      log.push(`${name} ${new URL(request.url).pathname}`)
      return new Response(name)
    },
  }
}

function envFor(log: string[]) {
  return {
    ASSETS: spy("ASSETS", log),
    AUTH: spy("AUTH", log),
    TENANCY: spy("TENANCY", log),
    REALTIME: spy("REALTIME", log),
    CONTENT: spy("CONTENT", log),
    DATAOPS: spy("DATAOPS", log),
    MCP: spy("MCP", log),
    MEDIA: { get: async () => null },
    LEARNING_MEDIA: { get: async () => null },
    INTERNAL_KEY: "test-internal-key",
  } as unknown as Parameters<typeof agency.fetch>[1]
}

/** The two front doors, each at its own real hostname — the check compares the
 * announced origin against the door's OWN, so the hostname is load-bearing. */
const DOORS = [
  { name: "agency", worker: agency, home: "https://agency.kwapso.app", door: "/api/tenancy/members/role" },
  { name: "portal", worker: portal, home: "https://client.kwapso.app", door: "/api/content/help" },
] as const

function call(
  door: (typeof DOORS)[number],
  method: string,
  path: string,
  log: string[],
  headers: Record<string, string> = {}
) {
  return door.worker.fetch(
    new Request(`${door.home}${path}`, {
      method,
      headers: { Cookie: "kwapso_session=stolen-ride", ...headers },
      body: method === "GET" ? undefined : "{}",
    }),
    envFor(log) as never
  )
}

describe("a write another site started is refused, at both front doors", () => {
  for (const door of DOORS) {
    // THE POSITIVE CONTROL, FIRST AND ALWAYS. Every refusal below asserts "the
    // upstream was never asked", and an empty log is also what a door that
    // forwards nothing at all looks like. So each door proves its mutating door
    // is genuinely wired before anything claims it was blocked.
    it(`${door.name}: the door is really open to its own site (the control)`, async () => {
      const log: string[] = []
      const res = await call(door, "POST", door.door, log, { Origin: door.home })
      expect(res.status, "a same-origin write must still work").toBe(200)
      expect(log.length, `${door.door} must reach a brain, or every check below is vacuous`).toBe(1)
    })

    it(`${door.name}: the sibling host on kwapso.app is refused, and reaches no brain`, async () => {
      const log: string[] = []
      // The real one. It is a Glide app today, and Glide serves HTML.
      const res = await call(door, "POST", door.door, log, { Origin: "https://portal.kwapso.app" })
      expect(res.status).toBe(403)
      expect((await res.json()) as { error: string }).toMatchObject({ error: "foreign_origin" })
      expect(log, "the request must die at the front door, not at the gate behind it").toEqual([])
    })

    it(`${door.name}: the text/plain form exploit is refused by shape, not by content type`, async () => {
      const log: string[] = []
      // What the attacker's page actually sends: no JSON content type, a body a
      // <form> can produce, and the header the browser adds whether they like it
      // or not. The door behind this parses JSON regardless of Content-Type,
      // which is why the content type is not what saves us.
      const res = await door.worker.fetch(
        new Request(`${door.home}${door.door}`, {
          method: "POST",
          headers: {
            Cookie: "kwapso_session=stolen-ride",
            "Content-Type": "text/plain",
            Origin: "https://portal.kwapso.app",
          },
          body: '{"userId":"U_ATTACKER","roleId":"R_ADMIN","x":"="}',
        }),
        envFor(log) as never
      )
      expect(res.status).toBe(403)
      expect(log).toEqual([])
    })

    it(`${door.name}: Origin: null (a sandboxed iframe or data: page) is refused`, async () => {
      const log: string[] = []
      // "null" is PRESENT, and it is still a browser with a cookie jar.
      const res = await call(door, "POST", door.door, log, { Origin: "null" })
      expect(res.status).toBe(403)
      expect(log).toEqual([])
    })

    it(`${door.name}: a look-alike host is refused (the prefix trap)`, async () => {
      const log: string[] = []
      const res = await call(door, "POST", door.door, log, { Origin: `${door.home}.evil.example` })
      expect(res.status).toBe(403)
      expect(log).toEqual([])
    })

    // NON-BROWSER CALLERS, WHICH IS THE HALF THAT DECIDES WHETHER THIS CONTROL
    // SURVIVES. seed-staging builds staging THROUGH THE FRONT DOOR (that is its
    // first stated rule), both smoke scripts POST, and every MCP client posts
    // JSON-RPC on a bearer token. None of them sends Origin, because none of them
    // is a browser. Refusing them would mean teaching each one to send a fake
    // header — which buys nothing (an attacker's page cannot reach this branch:
    // browsers set Origin on every non-GET) and costs the seed, at which point
    // somebody turns the check off instead. So an absent Origin is allowed, on
    // purpose, and this is where that decision is written down and locked.
    it(`${door.name}: a script with no Origin still gets through (seed, smoke, MCP)`, async () => {
      const log: string[] = []
      const res = await call(door, "POST", door.door, log)
      expect(res.status, "the seed IS how staging is built — it must not need a fake header").toBe(200)
      expect(log.length).toBe(1)
    })

    it(`${door.name}: reads are untouched — a GET is not the forgery surface`, async () => {
      const log: string[] = []
      const res = await call(door, "GET", door.door, log, { Origin: "https://portal.kwapso.app" })
      expect(res.status).toBe(200)
      expect(log.length).toBe(1)
    })
  }

  it("the machine surface reaches MCP without a browser's blessing", async () => {
    const log: string[] = []
    const res = await agency.fetch(
      new Request("https://agency.kwapso.app/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer kw_live_xxx", "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      envFor(log) as never
    )
    expect(res.status).toBe(200)
    expect(log).toEqual(["MCP /mcp"])
  })

  it("a browser page cannot POST to /mcp from another site either", async () => {
    const log: string[] = []
    const res = await agency.fetch(
      new Request("https://agency.kwapso.app/mcp", {
        method: "POST",
        headers: { Origin: "https://portal.kwapso.app", "Content-Type": "text/plain" },
        body: "{}",
      }),
      envFor(log) as never
    )
    expect(res.status).toBe(403)
    expect(log).toEqual([])
  })

  // The two behavioural loops above cover the two doors that exist. This covers
  // the third one: a front door added later, whose author copies the prefix table
  // and not the line above it. The roster is read off disk, so it cannot go stale.
  it("every public front door runs the check — including one added tomorrow", () => {
    for (const gateway of ["gateway", "portal-gateway"]) {
      const src = readFileSync(join(ROOT, "workers", gateway, "src", "index.ts"), "utf8")
      expect(src, `workers/${gateway} must call refuseForeignOrigin`).toContain("refuseForeignOrigin(request)")
      // Before ANY forward. `.fetch(` on an upstream binding is what forwarding
      // looks like in both files; the check has to come first or it is decoration.
      const checkAt = src.indexOf("refuseForeignOrigin(request)")
      const firstForward = src.search(/env(\.\w+|\[\w+\])\.fetch\(/)
      expect(firstForward, `workers/${gateway} forwards nothing — this scan is looking at the wrong file`).toBeGreaterThan(-1)
      expect(checkAt, `workers/${gateway} checks the origin AFTER it has already forwarded`).toBeLessThan(firstForward)
    }
  })
})
