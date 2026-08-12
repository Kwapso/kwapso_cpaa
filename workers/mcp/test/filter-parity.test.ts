// R19 — AGENT/MCP FILTER PARITY and R22 — BODY-FIELD PARITY, both standing on
// one full DOOR CENSUS.
//
// Three things are checked here, in that order, because the later two are
// worthless without the first:
//
//   1. COVERAGE — every door a person can reach on the four workers that serve
//      the app's own doors (tenancy, content, data-ops, auth) either has a tool
//      on SOME machine surface (the shared catalog, the MCP's own, or the
//      agent's own), or is a named line in TOOLLESS_DOORS with a written reason.
//   2. PARITY, the QUERY half (R19) — a tool sitting on a door that FILTERS must
//      expose and forward every filter that door parses, or the assistant falls
//      back to free text and answers a DIFFERENT question (downstream: 3,465
//      descriptions that merely mentioned the words instead of the 134 records
//      carrying the value). The required filter set is DERIVED from the door's
//      own parameter parsing — never hand-listed here.
//   3. PARITY, the BODY half (R22) — the same sentence about the other half of
//      an HTTP request. A tool on a WRITE door must expose and forward every
//      field that door reads off the body, or a named line in
//      NARROWED_BODY_FIELDS says why not. R19 alone measured query strings, so
//      four write tools quietly offered a narrower contract than their door
//      accepted for six weeks under a green build: update_team could not set the
//      logo, create_role could not carry its permission matrix,
//      reply_help_ticket could not @mention, agent_chat could not attach a file.
//      Same census, same derivation, other half of the request.
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

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"
import { SHARED_TOOLS } from "@shared/workers/tool-catalog"
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
  // GOOGLE — seven doors with no tool, and they divide cleanly into two reasons.
  //
  // THE FIRST THREE ARE A BROWSER ROUND-TRIP. Connecting is a person standing at
  // Google's own consent screen and saying yes; there is no version of that a
  // machine can perform, and the credential it produces travels in an HttpOnly
  // cookie a machine never holds. The other thirteen Google doors DO have tools,
  // so this is not a module that was skipped — it is the three steps of a human
  // decision, left out on purpose.
  "GET /api/content/google/start":
    "answers with a 302 to Google's own consent screen. A machine caller cannot consent on somebody's behalf — that is the entire point of a consent screen — and a tool here would hand back a redirect nobody can follow. Connecting is a person, at a browser, choosing which of their accounts kwapso may act as.",
  "GET /api/content/google/callback":
    "where Google sends the BROWSER back. It reads a one-shot HttpOnly cookie this surface never carries, verifies the round-trip is the one that was started, and redirects. There is nothing here to ask for and no way for a machine to be standing where it is answered.",
  "POST /api/content/google/connect":
    "finishes a handshake by consuming the authorization code out of that same HttpOnly cookie. It takes no arguments at all — everything it needs is a cookie a bearer-token caller does not have — so a tool on it could only ever fail, and would say 'connect a Google account' in the catalogue while being unable to.",
  // THE OTHER FOUR ARE A DECISION ABOUT WHO CAN READ WHAT — the one thing this
  // whole module exists to keep conscious. A person shares a folder through a
  // form that asks, in words, whether it is theirs alone or the team's; taking a
  // connection away is the same decision in reverse. An assistant that could
  // widen its own sight, or drop somebody's connection while using it, would be
  // the one place in the product where act-as-user stops being a fence.
  "POST /api/content/google/disconnect":
    "takes somebody's Google connection away and asks Google to revoke the grant. A person disconnects their own account, from their own settings, having decided to — it is not an errand, and an assistant able to end the connection it is working through is a strange thing to have built.",
  "GET /api/content/google/pick":
    "lists the Drive folders or Chat spaces a person COULD share, so a form can offer them. Its answer is only useful to the sharing door, which is deliberately toolless below — a picker for a form no machine fills in is a capability with nowhere to go.",
  "POST /api/content/google/sources":
    "shares a Drive folder or a Chat space, and in the same call decides WHO MAY READ IT — just this person, or the whole team. That is the decision the module is built around, asked in words at the moment of sharing, and it is not one an assistant should be able to make on somebody's behalf: an assistant that can widen what it is allowed to see is not fenced by anything.",
  "POST /api/content/google/sources/active":
    "stops sharing a folder or space, or shares it again. The same decision as the door above, in reverse, and out of the assistant's hands for the same reason — re-sharing something a person deliberately withdrew is exactly the act nobody should be able to delegate by accident.",

  "POST /api/content/learning/upload":
    "shovels bytes — an image or short clip as a base64 data URL, up to 25 MB — into the learning-media bucket and hands back a URL to paste into an article. It writes no row and leaves no record of its own. One call on this surface may ANSWER with 400,000 characters; a 25 MB base64 argument is two orders of magnitude past what it is built to carry. A machine writes the article, and references media it already has a URL for.",

  "GET /api/content/portal/delivery":
    "the CLIENT's own picture of the work they bought — the same sprints list_sprints already answers with, minus the price, minus the story titles and minus the goal text. It exists because a shape that cannot carry a price cannot leak one, which is a fence for a browser on the other hostname, not a capability. A machine caller holds a STAFF token (this surface refuses client logins outright, MCP.md §5) and list_sprints gives it strictly more: the same blocks, with what they were sold for. A tool here would be a narrower duplicate of one already on the surface, which is how two answers to one question start disagreeing.",

  "POST /api/content/work-logs/update":
    "CORRECTING somebody's hours, which is a different act from logging your own and is gated a step higher (work:edit rather than work:create). The machine surface can start a timer, stop one, write time down and answer for a runaway — everything a person does about their OWN time — but a timesheet correction is the one write in this module that changes a number after the fact, and time is the record here that turns into money. It leaves a trail either way (lib/work-logs editWorkLog writes one); the reason it has no tool is that nobody should be able to say 'make last Tuesday four hours' to an assistant and have it happen. A person opens the row.",

  "POST /api/data-ops/agent/translate-ticket":
    "the ONE button in the app that spends the team's AI allowance without going through a chat turn, and that is exactly why it is not on this surface. MCP.md §6 is a promise about cost: a machine token's reads, writes, exports and imports are free endpoint hits, and only `agent_chat` / `agent_confirm` / `plan_import` draw the allowance — a role without the agent right spends zero AI. A tool here would put a fourth spender on that list, silently, from a headless client that cannot see the balance it is drawing down. Changing the cost model is the owner's decision, not a parity default. And the capability is already reachable in the shape this surface is built for: a chat turn translates the title (metered, visible in the usage log) and calls `update_help_ticket` with `titleEn`, which is one of the fields R22 makes it expose.",
  "POST /api/content/brand-assets/upload":
    "the same door as the learning upload, for the same bytes and the same reason: up to 25 MB of base64 argument on a surface whose whole ANSWER is capped at 400,000 characters. A machine writes the brand-asset ROW — create_brand_asset carries `fileUrl` — and references a file it already has a URL for. Uploading the bytes is a screen action.",
  "POST /api/content/staff/upload":
    "the third of the byte-shovels, and the narrowest: a profile photo or a certificate PDF, up to 25 MB of base64. save_staff_profile and create_staff_certificate both carry the URL field, so the record half is fully machine-writable; the bytes are not, for the arithmetic reason the other two give.",

  /* -------------------------------- auth --------------------------------- */
  "POST /api/auth/email/start":
    "the sign-in exchange, step one: post an address and a 6-digit code is emailed to the person. A machine holds a token that is the finished RESULT of somebody doing this, and the code appears nowhere but a human's inbox — by law, in every environment.",
  "POST /api/auth/email/verify":
    "the sign-in exchange, step two: trade the emailed code for a session. A tool here would be a second way to BECOME somebody, on the one surface whose whole posture is that a token is already exactly one somebody.",
  "GET /api/auth/google/start":
    "the first half of a BROWSER REDIRECT: it answers 302 to Google's account picker and sets a ten-minute cookie that only the matching callback can spend. There is nothing here for a machine to call — the useful part of the answer is a consent screen a person looks at — and the surface it leads to is the same one email/verify leads to: a second way to BECOME somebody, on the one surface whose whole posture is that a token is already exactly one somebody.",
  "GET /api/auth/google/callback":
    "the second half of that redirect, and it is not really addressed to a caller at all: Google sends the BROWSER here with a one-time code, which is spendable exactly once, only alongside the cookie the start door set, and only at the front door that asked. Everything it parses (code, state) is Google's own, meaningless to anyone else and worthless a second time. Like email/verify, a tool here would mint a session, which is the one thing a token holder already has.",
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

/** R22 — a body field a WRITE door reads that its tool deliberately does NOT
 * offer, keyed "METHOD /path::field". Each line is a decision someone made, in
 * writing, and the same line is said in developer English in MCP.md §3 — the
 * alternative is a narrower contract nobody ever notices, which is exactly what
 * this half of the census exists to end.
 *
 * A RATCHET, like every other deny-list in the base: a line whose field the tool
 * now DOES expose turns the build red, so the list can only shrink. */
const NARROWED_BODY_FIELDS: Record<string, string> = {
  "POST /api/tenancy/teams/update::logoDataUrl":
    "a logo is BYTES, not prose — a base64 image data URL up to 2.5 MB (MAX_IMAGE_BYTES), which is ~3.4 million characters of argument on a surface whose whole ANSWER is capped at 400,000. It is the same objection, and the same order-of-magnitude arithmetic, that keeps POST /api/content/learning/upload off this surface entirely (MCP.md §3 item 6). Renaming is unaffected: updateTeamDetails treats an absent logo as 'leave it as it is', so a machine rename can never blank a logo it cannot send.",
  "POST /api/content/todos/complete::fileDataUrl":
    "the same bytes-not-prose objection as the two below, and one more on top of it. A to-do's attachment is a base64 data URL up to 10 MB — around 14 million characters of argument on a surface whose whole ANSWER is capped at 400,000. And the file is the CLIENT's: 'send us the signed contract' is answered by the person who has it, from their own portal, on their own machine. A machine caller marking the to-do done is a legitimate act (the thing arrived by email, somebody is tidying up); a machine caller INVENTING the file is not a shape this door should make easy. `id` is exposed and forwarded, so the capability the surface actually needs is whole.",
  "POST /api/content/todos/complete::fileName":
    "the label on a file this surface cannot send. It is read only inside the `if (body.fileDataUrl …)` branch above — with no bytes there is nothing to name — so exposing it alone would be a field that changes nothing, which is worse than an absent one: a machine would fill it in and believe something happened.",
  "POST /api/data-ops/agent/chat::files":
    "attaching up to 8 CSVs of 5 MB each is up to 40 MB of argument on the same 400,000-character surface — and the capability is already here in a better machine shape: start_import → add_import_file → plan_import → run_import is deterministic, resumable, and re-readable for free through get_import when a client drops a plan. Conversational file-drop is the shape a person supervises on a screen; a headless client should use the pipeline that reports per-row what it did.",
}

/** The route-handler source for a worker: its routes/ directory if it has one,
 * else its index.ts (auth keeps its handlers in the switchboard file). */
function handlerSources(worker: Worker): string[] {
  const dir = join(ROOT, "workers", worker, "src", "routes")
  if (!existsSync(dir)) return [readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")]
  return sourceFiles(dir, { extensions: [".ts"] }).map((f) => f.source)
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

/** One function's body: from its declaration to the next top-level `}` (or the
 * next export, whichever comes first) — never into the function that follows. */
function fnBody(src: string, name: string): string {
  const at = src.search(new RegExp(`function ${name}\\(`))
  if (at === -1) return ""
  const ends = [src.indexOf("\n}\n", at), src.indexOf("\nexport ", at + 1)].filter((i) => i !== -1)
  return src.slice(at, ends.length ? Math.min(...ends) : undefined)
}

/** What a door READS — its own handler, PLUS any helper in the same file it
 * calls, one level deep.
 *
 * The one level is not a nicety, it is the law's blind spot closed. This scan
 * once read the handler alone, so the moment a door factored its parsing into a
 * `function accountQuery(url)` beside it — which is exactly what you do when two
 * doors must narrow by the same words — the door dropped out of the census
 * entirely and its tool's obligations silently became none. A law that stops
 * looking when you tidy up is a law that rewards tidying up.
 *
 * One level, and only helpers declared in the SAME source: a `createLearning`
 * imported from a lib declares its contract in a TYPE, which is not source a
 * scan can follow, and pretending otherwise would be worse than saying so. */
function handlerBody(door: Door): string {
  for (const src of handlerSources(door.worker)) {
    const own = fnBody(src, door.handler)
    if (!own) continue
    const called = [...new Set([...own.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)].map((m) => m[1]))]
    return [own, ...called.filter((n) => n !== door.handler).map((n) => fnBody(src, n))].join("\n")
  }
  return ""
}

/** The params a door's handler parses, derived from ITS OWN source: its
 * `searchParams.get` calls are the truth. */
function doorParams(door: Door): string[] {
  return [...handlerBody(door).matchAll(/searchParams\.get\("(\w+)"\)/g)].map((x) => x[1])
}

/** The BODY fields a door's handler reads, derived the same way: its `body.<field>`
 * reads are the truth. R20 is what makes this legible — a body may not be
 * destructured at the read, so every field a door takes off the wire appears
 * here, in one shape, whether it is validated with `requireText`, tested with
 * `typeof`, or checked with `Array.isArray`.
 *
 * SCOPE, stated honestly: this reads the HANDLER, exactly as the query half
 * does. A handler that hands the whole `body` object to a lib (createLearning,
 * createTicket) declares its contract in that lib's input TYPE, which is not
 * source a scan can follow — those tools were checked by hand and match. What
 * this catches is the case that actually bit: a field the DOOR names and the
 * TOOL doesn't. */
function doorBodyFields(door: Door): string[] {
  return [...new Set([...handlerBody(door).matchAll(/\bbody\.(\w+)\b/g)].map((x) => x[1]))]
}

/** Every tool on EITHER machine surface that forwards to a door — the shared
 * catalog, the MCP's own, and the agent's own. A capability reached from one
 * surface is not a gap; a capability reached from neither is. De-duplicated by
 * name: the three catalogs overlap by construction (each surface PROJECTS the
 * shared ones), so the same endpoint is checked once. */
type Build = ((input: Record<string, unknown>) => Record<string, unknown>) | undefined
type ToolView = {
  name: string; method: string; path: string; schema: unknown; buildQuery: string; buildBody: Build
}
const ALL_TOOLS: ToolView[] = [
  ...SHARED_TOOLS.map((t) => ({
    name: t.name, method: t.method, path: t.path, schema: t.schema,
    buildQuery: t.buildQuery?.toString() ?? "", buildBody: t.buildBody as Build,
  })),
  ...MCP_TOOLS.map((t) => ({
    name: t.name, method: t.method, path: t.path, schema: t.inputSchema,
    buildQuery: t.buildQuery?.toString() ?? "", buildBody: t.buildBody as Build,
  })),
  ...TOOL_CATALOG.map((t) => ({
    name: t.name, method: t.method, path: t.path, schema: t.schema,
    buildQuery: t.buildQuery?.toString() ?? "", buildBody: t.buildBody as Build,
  })),
]

/** The schema's own properties, as the JSON-RPC caller sees them. */
const propsOf = (tool: ToolView): Record<string, { type?: string }> =>
  ((tool.schema as { properties?: Record<string, { type?: string }> }).properties ?? {})

/** A FILLED-IN call of a tool, typed the way its own schema declares. R22's
 * forwarding half RUNS the builder on this rather than reading its source: a
 * builder that delegates (`(i) => learningBody(i)`) forwards perfectly and
 * mentions not one field by name, so a substring scan would call it broken. What
 * the door actually receives is the only honest question, and it is answerable —
 * so ask it. */
function probeInput(tool: ToolView): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(propsOf(tool)))
    out[key] =
      spec?.type === "boolean" ? true
      : spec?.type === "number" ? 1
      : spec?.type === "array" ? ["probe"]
      : spec?.type === "object" ? { probe: true }
      : "probe"
  return out
}

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

/** The tools whose BODY must match a door's, for R22. POST only, and only the
 * ones that actually build a body — a tool that sends `{}` on purpose
 * (start_import) is not narrowing a contract, it is a door that takes nothing. */
const writeToolsOn = (door: Door): ToolView[] =>
  door.method === "POST" ? toolsOn(door).filter((t) => t.buildBody) : []

const DOORS: Door[] = WORKERS.flatMap(doorsOf)
const FILTERED = DOORS.filter((d) => doorParams(d).length > 0)
const WRITES = DOORS.filter((d) => d.method === "POST" && doorBodyFields(d).length > 0)

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

  it("a door that tidies its parsing into a helper still owes its filters", () => {
    // The blind spot this closed, pinned by the two doors that walked into it:
    // both narrow accounts by the same three words, so both call one helper —
    // and while the scan read the handler alone, factoring that out silently
    // reduced what the list door owed to `cursor`, and made the export door
    // invisible. Naming the obligation here means a future tidy-up cannot shrink
    // it back without saying so out loud.
    for (const k of ["GET /api/tenancy/accounts", "GET /api/tenancy/accounts/export"]) {
      const door = DOORS.find((d) => key(d) === k)!
      expect(doorParams(door), `${k} must still owe its three filters`).toEqual(
        expect.arrayContaining(["q", "type", "parentId"])
      )
    }
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

describe("agent-body-parity (R22): a write tool offers its door's whole contract", () => {
  it("finds write doors to check (this half must not go blind either)", () => {
    // The blind spot R19 left was every door that takes no query string. So the
    // scan has to prove it FOUND bodies at all, and found the four doors whose
    // silence earned this law.
    expect(WRITES.length).toBeGreaterThanOrEqual(30)
    const found = WRITES.map(key)
    for (const k of [
      "POST /api/tenancy/teams/update",
      "POST /api/tenancy/roles",
      "POST /api/content/help/reply",
      "POST /api/data-ops/agent/chat",
    ])
      expect(found, `${k} must be in the body census`).toContain(k)
  })

  it("every narrowing still names a real door and a real field it still narrows", () => {
    for (const [k, why] of Object.entries(NARROWED_BODY_FIELDS)) {
      const [doorKey, field] = k.split("::")
      const door = WRITES.find((d) => key(d) === doorKey)
      expect(door, `${k} is excused but ${doorKey} is not a write door — delete the line`).toBeDefined()
      expect(
        doorBodyFields(door!),
        `${k} is excused but ${doorKey} no longer reads "${field}" — delete the line`
      ).toContain(field)
      // THE RATCHET: an excuse in front of a field the tool now offers is a lie.
      for (const tool of writeToolsOn(door!))
        expect(
          field in propsOf(tool),
          `${k} is excused but tool ${tool.name} now EXPOSES "${field}" — delete the line, the contract is whole`
        ).toBe(false)
      expect(why.length, `${k} needs a reason someone can disagree with`).toBeGreaterThan(40)
    }
  })

  for (const door of WRITES) {
    for (const tool of writeToolsOn(door)) {
      it(`${tool.name} exposes + forwards every body field its door (${door.path}) reads`, () => {
        // What the door RECEIVES when every field the tool declares is filled in.
        const sent = tool.buildBody!(probeInput(tool))
        for (const f of doorBodyFields(door)) {
          if (`${key(door)}::${f}` in NARROWED_BODY_FIELDS) continue
          expect(
            f in propsOf(tool),
            `door ${key(door)} reads body.${f} but tool ${tool.name}'s schema doesn't expose it — a machine gets a NARROWER contract than the screen, and nothing says so. Expose it, or add a reasoned line to NARROWED_BODY_FIELDS (and to MCP.md §3).`
          ).toBe(true)
          expect(
            sent[f],
            `tool ${tool.name} exposes "${f}" but its buildBody drops it — the door would never see the field the caller filled in`
          ).toBeDefined()
        }
      })
    }
  }
})
