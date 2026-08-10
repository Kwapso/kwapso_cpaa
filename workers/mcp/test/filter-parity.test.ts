// R19 — AGENT/MCP FILTER PARITY, standing on a full DOOR CENSUS.
//
// Two things are checked here, in that order, because the second is worthless
// without the first:
//
//   1. COVERAGE — every door a person can reach on the four workers that serve
//      the app's own doors (tenancy, content, data-ops, auth) either has a tool
//      on SOME machine surface (the shared catalog, the MCP's own, or the
//      agent's own), or is a named line in TOOLLESS_DOORS with a written reason.
//   2. PARITY — a tool sitting on a door that FILTERS must expose and forward
//      every filter that door parses, or the assistant falls back to free text
//      and answers a DIFFERENT question (downstream: 3,465 descriptions that
//      merely mentioned the words instead of the 134 records carrying the
//      value). The required filter set is DERIVED from the door's own parameter
//      parsing — never hand-listed here.
//
// THE SCAN STARTS AT THE DOORS, NOT THE TOOLS — and now at ALL of them. It once
// iterated SHARED_TOOLS, so a door with no tool was not a failure, it was
// invisible; that is how eleven capabilities across the customer spine sat
// outside the machine surface with a green R19 suite. Moving the scan to the
// doors fixed that — for doors that take a QUERY PARAMETER. Everything else was
// still invisible, and twenty capabilities were sitting in exactly that blind
// spot: what may I do here, how much of the app's own daily AI allowance is
// left, what may I import into, what did that import plan say. None of them
// takes a filter, so none of them was ever counted.
//
// A law that only inspects the doors you gave a query string measures your query
// strings. So the denominator is now every non-admin door, filtered or not:
// silence about a capability has to be written down before it is allowed.

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { SHARED_TOOLS } from "../../../shared/workers/tool-catalog"
import { MCP_TOOLS } from "../src/lib/tools"
import { TOOL_CATALOG } from "../../data-ops/src/lib/tools"

const ROOT = join(__dirname, "..", "..", "..")

/** The workers whose doors this law governs: every one that serves the app's own
 * `/api` surface to a signed-in caller. (realtime and the two gateways own no
 * doors of their own — they forward; mcp IS the surface being measured.) */
const WORKERS = ["tenancy", "content", "data-ops", "auth"] as const
type Worker = (typeof WORKERS)[number]

type Door = { worker: Worker; method: "GET" | "POST"; path: string; handler: string }
const key = (d: { method: string; path: string }) => `${d.method} ${d.path}`

/** A door that deliberately has no tool on either machine surface. Each line is a
 * decision someone made, in writing — the alternative is a gap nobody ever sees,
 * which is what this census exists to end. Keyed "METHOD /path". */
const TOOLLESS_DOORS: Record<string, string> = {
  /* ------------------------------- tenancy ------------------------------- */
  "POST /api/tenancy/bootstrap":
    "the teamless first step — it accepts a pending invite, or makes the personal team, for someone who has no team at all yet. A machine token is minted FROM an existing membership and pinned to that team, so its caller is already through this door; there is nothing here it could ask for.",
  "GET /api/tenancy/active":
    "the browser's session bootstrap: the current team, the caller's role in it, AND every other team they belong to. That last part is the one thing the team pin exists to keep off this surface. The two questions a machine actually has are both answered without it — whoami (who am I, which team is this token pinned to) and my_permissions (what may I do here).",
  "GET /api/tenancy/teams":
    "the team switcher's list. A token is PINNED to one team by design (MCP.md §5); naming the others is the beginning of widening that pin, and no call on this surface can act on them.",
  "POST /api/tenancy/teams":
    "creating a team is closed product-wide (TEAM_CREATION_CLOSED refuses a person, the agent and a token alike), and a new team would be a team this token is not pinned to.",
  "POST /api/tenancy/switch-team":
    "moves the session to another team — the one door that literally widens the pin, which is the thing the pin exists to prevent (MCP.md §3.2). A token that needs another team's data is another token, made in that team.",
  "GET /api/tenancy/invitations":
    "invites this person has RECEIVED from OTHER teams. Outside the pin by construction, and unanswerable in the team this token is pinned to.",
  "POST /api/tenancy/invitations/accept":
    "accepting a received invite JOINS that team and SWITCHES the session to it — the pin widened by the most direct route there is. A person accepts an invitation as themselves, in the app.",
  "GET /api/tenancy/portal/context":
    "answers 'which of your OWN companies are you standing in?' — a question only a CLIENT login has, and a client login cannot hold a token or be acted for at all (MCP.md §5). For staff it is already an honest empty answer.",
  "POST /api/tenancy/portal/switch-account":
    "the client portal's own standing-move, for the same reason as its context read: only a client login has anywhere to move to, and this surface refuses client logins outright.",
  "GET /api/tenancy/invites/audit":
    "the forensic trail behind ONE invite (who sent it, when it was opened, when it was revoked). The invite's own state — email, role, status, id — is already machine-readable through list_invites; this is the strip a person reads on the invite's detail when something looks wrong.",
  "GET /api/tenancy/activity":
    "the cross-module history feed, and the one door whose answer is assembled by SUBTRACTING the caller's denied modules (R18). Everything it reports is readable through the module's own tools, with that module's own gate; putting the merged stream on the machine surface is a separate decision for the owner, not a parity default.",
  "GET /api/tenancy/config/screens":
    "the screen-engine recipe store — which blocks the AGENCY APP renders on a module's screen. It describes an interface, not the team's data, and an MCP client has no screen to render it on.",
  "POST /api/tenancy/config/screens":
    "authoring a screen recipe changes what every person on the team sees, and the only way to judge one is to look at the screen it draws — which a machine client has not got. (The route table used to call this door 'agent-callable' while it sat on neither catalogue; the comment was the thing that was wrong, and it has been corrected rather than the door quietly opened.)",

  /* ------------------------------- content ------------------------------- */
  "POST /api/content/learning/upload":
    "shovels bytes — an image or short clip as a base64 data URL, up to 25 MB — into the learning-media bucket and hands back a URL to paste into an article. It writes no row and leaves no record of its own. One call on this surface may ANSWER with 400,000 characters; a 25 MB base64 argument is two orders of magnitude past what it is built to carry. A machine writes the article, and references media it already has a URL for.",

  /* -------------------------------- auth --------------------------------- */
  "POST /api/auth/email/start":
    "the sign-in exchange, step one: post an address and a 6-digit code is emailed to the person. A machine holds a token that is the finished RESULT of somebody doing this, and the code appears nowhere but a human's inbox — by law, in every environment.",
  "POST /api/auth/email/verify":
    "the sign-in exchange, step two: trade the emailed code for a session. A tool here would be a second way to BECOME somebody, on the one surface whose whole posture is that a token is already exactly one somebody.",
  "POST /api/auth/email/change/start":
    "changes the address the person signs in with — everywhere, in every team they belong to, and for every future login code. No team role gates it, so a token's pin and a token's role both have no opinion about it: it is outside what this surface is capped by.",
  "POST /api/auth/email/change/verify":
    "the second half of that change, which also signs every OTHER device out. Same reason: it is an identity act on the human behind the token, not an act in the team the token is pinned to.",
  "POST /api/auth/profile":
    "writes who the person IS — their display name and photo — across every team they belong to. Like the email change, no team role gates it, so it sits outside the one-team, role-capped envelope this surface promises. It is also the one write a stolen token could make that no row in the team's database would ever show.",
  "GET /api/auth/activity":
    "the history of exactly those global identity changes (name, photo, email). It is the person's own account trail rather than the pinned team's work, and it reads a surface no tool here can write to.",
  "POST /api/auth/logout":
    "destroys the browser session behind a cookie. This surface mints its own short-lived, team-pinned session per call and lets it expire; the way to end a token's access is to revoke the token, on the Access tokens screen — which bites on the very next call.",
}

/** The route-handler source for a worker: its routes/ directory if it has one,
 * else its index.ts (auth keeps its handlers in the switchboard file). */
function handlerSources(worker: Worker): string[] {
  const dir = join(ROOT, "workers", worker, "src", "routes")
  if (!existsSync(dir)) return [readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")]
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
}

const indexSource = (worker: Worker) =>
  readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")

/** Every door on a worker, read off its OWN switchboard — the declarative ROUTES
 * table (tenancy / content / data-ops) or auth's switch. Excluded, and only
 * these three: `/admin/` (owner maintenance behind `x-admin-key`, a header no
 * tool can send — locked separately in catalog.test.ts), the health probe, and
 * `/internal/*` (service bindings only, never routed publicly). */
function doorsOf(worker: Worker): Door[] {
  const src = indexSource(worker)
  const out: Door[] = []
  const add = (method: string, path: string, handler: string) => {
    if (path.includes("/admin/") || path.endsWith("/health")) return
    out.push({ worker, method: method as "GET" | "POST", path, handler })
  }
  for (const m of src.matchAll(/"(GET|POST) (\/api\/[^"]+)"\s*:\s*\{\s*handler:\s*(\w+)/g))
    add(m[1], m[2], m[3])
  for (const m of src.matchAll(/case "(GET|POST) (\/api\/[^"]+)":\s*\n\s*return await (\w+)\(/g))
    add(m[1], m[2], m[3])
  return out
}

/** The params a door's handler parses, derived from ITS OWN source: the
 * switchboard names the handler for the path, and the handler's
 * `searchParams.get` calls are the truth. */
function doorParams(door: Door): string[] {
  for (const src of handlerSources(door.worker)) {
    const at = src.search(new RegExp(`function ${door.handler}\\(`))
    if (at === -1) continue
    // The function's own body: to the next top-level `}` (or the next export,
    // whichever comes first) — never into the helper that follows it.
    const ends = [src.indexOf("\n}\n", at), src.indexOf("\nexport ", at + 1)].filter((i) => i !== -1)
    const body = src.slice(at, ends.length ? Math.min(...ends) : undefined)
    return [...body.matchAll(/searchParams\.get\("(\w+)"\)/g)].map((x) => x[1])
  }
  return []
}

/** Every tool on EITHER machine surface that forwards to a door — the shared
 * catalog, the MCP's own, and the agent's own. A capability reached from one
 * surface is not a gap; a capability reached from neither is. De-duplicated by
 * name: the three catalogs overlap by construction (each surface PROJECTS the
 * shared ones), so the same endpoint is checked once. */
type ToolView = { name: string; method: string; path: string; schema: unknown; buildQuery: string }
const ALL_TOOLS: ToolView[] = [
  ...SHARED_TOOLS.map((t) => ({
    name: t.name, method: t.method, path: t.path, schema: t.schema,
    buildQuery: t.buildQuery?.toString() ?? "",
  })),
  ...MCP_TOOLS.map((t) => ({
    name: t.name, method: t.method, path: t.path, schema: t.inputSchema,
    buildQuery: t.buildQuery?.toString() ?? "",
  })),
  ...TOOL_CATALOG.map((t) => ({
    name: t.name, method: t.method, path: t.path, schema: t.schema,
    buildQuery: t.buildQuery?.toString() ?? "",
  })),
]

/** The tools ON a door (same method, same path), for the coverage census. */
const toolsOn = (door: Door): ToolView[] => [
  ...new Map(
    ALL_TOOLS.filter((t) => t.path === door.path && t.method === door.method).map((t) => [t.name, t])
  ).values(),
]

/** The tools whose FILTERS must match a door's, for the parity check. GET only:
 * a POST tool can sit on the same path (a ticket's stakeholders are read and
 * added at one address) and it answers with a body, not a query string — asking
 * it to forward a filter would be asking the wrong question. */
const readToolsOn = (door: Door): ToolView[] => (door.method === "GET" ? toolsOn(door) : [])

const DOORS: Door[] = WORKERS.flatMap(doorsOf)
const FILTERED = DOORS.filter((d) => doorParams(d).length > 0)

describe("agent-filter-parity (R19): the doors decide what the machine surface owes", () => {
  it("finds every door to check (the census must not silently go blind)", () => {
    // Every worker that serves doors is represented…
    for (const w of WORKERS) expect(DOORS.some((d) => d.worker === w), `no doors found on ${w}`).toBe(true)
    // …both methods are in the denominator (the blind spot this widening closed
    // was a set of doors that take no query parameter at all)…
    expect(DOORS.some((d) => d.method === "POST")).toBe(true)
    expect(DOORS.length).toBeGreaterThanOrEqual(60)
    // …and the two doors each earlier rewrite was earned by are still in it.
    expect(DOORS.map(key)).toContain("GET /api/tenancy/accounts")
    expect(DOORS.map(key)).toContain("GET /api/data-ops/agent/usage")
  })

  it("every reasoned gap still names a real door (no rotting lines)", () => {
    const all = new Set(DOORS.map(key))
    for (const k of Object.keys(TOOLLESS_DOORS))
      expect(all.has(k), `${k} is excused in TOOLLESS_DOORS but is no longer a door — delete the line`).toBe(
        true
      )
  })

  it("every reasoned gap is still a gap (an excuse in front of a tool is a lie)", () => {
    for (const door of DOORS) {
      if (!(key(door) in TOOLLESS_DOORS)) continue
      const tools = toolsOn(door)
      expect(
        tools.map((t) => t.name),
        `${key(door)} is excused in TOOLLESS_DOORS but now HAS a tool — delete the line, the door is covered`
      ).toEqual([])
    }
  })

  it("a reasoned gap states a real reason", () => {
    for (const [k, why] of Object.entries(TOOLLESS_DOORS))
      expect(why.length, `${k} needs a reason someone can disagree with`).toBeGreaterThan(40)
  })

  it("every door has a tool on some machine surface, or a named reasoned gap", () => {
    const silent = DOORS.filter((d) => !toolsOn(d).length && !(key(d) in TOOLLESS_DOORS)).map((d) => {
      const p = doorParams(d)
      return `${key(d)}${p.length ? ` (parses ${p.join(", ")})` : ""}`
    })
    expect(
      silent,
      `these doors answer a person and reach no machine caller at all — add a tool, or a reasoned line in TOOLLESS_DOORS:\n  ${silent.join("\n  ")}`
    ).toEqual([])
  })

  for (const door of FILTERED) {
    if (key(door) in TOOLLESS_DOORS) continue
    for (const tool of readToolsOn(door)) {
      it(`${tool.name} exposes + forwards every param its door (${door.path}) parses`, () => {
        const props = Object.keys((tool.schema as { properties?: Record<string, unknown> }).properties ?? {})
        for (const p of doorParams(door)) {
          expect(
            props.includes(p),
            `door ${key(door)} parses "${p}" but tool ${tool.name}'s schema doesn't expose it — the model can't send a filter it can't see`
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
