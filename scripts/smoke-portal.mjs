// CLIENT PORTAL smoke test — the OTHER front door, proven against live staging.
//
// `deploy:staging` shipped eight workers and then ran one smoke that never once
// touched `kwapso-portal-staging`. Half the product — the half a CLIENT reaches
// — went out unverified on every deploy. This is that half's suite.
//
// IT RUNS AGAINST THE PORTAL'S OWN HOSTNAME, and that is the whole point rather
// than a detail of configuration. R21 was earned twice by the same substitution:
// a door the portal gateway withheld was still being served to the same person
// at the agency origin, because a client login is an ordinary team member
// holding an ordinary role. So this script signs ONE person in at BOTH addresses
// and asks each door twice — 404 at the client's hostname (the allow-list never
// named it) and 403 at ours (the door itself refuses them). A check that only
// ever knocked on the portal would pass over exactly the hole that has now been
// dug twice.
//
// WHAT IT PROVES, in the order it proves it:
//
//   · a client signs in AT THE PORTAL, through the portal's own auth doors;
//   · EVERY door on `PORTAL_DOORS` answers there — the census is derived from
//     the gateway's own table and from what this script actually called, so a
//     door opened tomorrow is an untested door today and the run goes red;
//   · THE ACCOUNT FENCE (SCOPE ch.06): standing in one company, every door is
//     attacked with another company's ids — by list, by search, by id, and by
//     write. Every negative has BAIT proved to exist first, from the account
//     that should see it, because "they cannot see it" passes trivially when
//     there is nothing to see and that is exactly how a fence test stays green
//     over an open hole;
//   · A DELIVERABLE'S VISIBILITY IS PER ROW AND REVOCABLE — hidden, shared,
//     then un-shared, and the third state takes the FILE URL with it (a real
//     bug, found the week of 2026-08-19);
//   · R24 — no door reading the agency's own cost is reachable at the client's
//     hostname. The doors are DERIVED from `internal-money.ts`'s own exports,
//     the same walk `web/test/rules.test.ts` makes, so a fifth one added
//     tomorrow is asked the question tomorrow;
//   · every resource in `PORTAL_LISTENERS` has a door behind it that answers —
//     a listener with no live door is a screen that goes quietly stale.
//
// TWO ADDRESSES, TWO ENVIRONMENT VARIABLES:
//
//   SMOKE_BASE         the AGENCY front door (staff build the world here, and
//                      the client is asked the R21 question here)
//   SMOKE_PORTAL_BASE  the CLIENT front door — everything the client does
//
//   TEST_LOGIN_KEY=… node scripts/smoke-portal.mjs
//
// FIXED FIXTURES, so repeat runs prove idempotency instead of littering: one
// role, two companies, one contact, two apps, two maps, two tickets, one to-do
// and two deliverables, all found-or-created by name. The second run creates
// nothing.
//
// Exits non-zero on any failure.

import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { makeApi, timedFetch } from "./lib/api.mjs"

const BASE = process.env.SMOKE_BASE ?? "https://kwapso-staging.kwapso.workers.dev"
const PORTAL = process.env.SMOKE_PORTAL_BASE ?? "https://kwapso-portal-staging.kwapso.workers.dev"
const REPO = fileURLToPath(new URL("..", import.meta.url))

// Resend's test inbox: a real send path that always "delivers" and never
// bounces, so repeat runs don't hurt the sending domain's reputation. The staff
// account is the SAME fixed account smoke-staging uses — it owns the team.
const STAFF_EMAIL = "delivered@resend.dev"
const CLIENT_EMAIL = "delivered+portal@resend.dev"

/** Everything this script owns, named so a human reading the staging data knows
 * what it is and why it is there. Found-or-created, never duplicated. */
const FIX = {
  role: "Portal smoke client",
  mine: "PORTAL SMOKE · their company",
  theirs: "PORTAL SMOKE · another company",
  contact: "PORTAL SMOKE · contact",
  myApp: "PORTAL SMOKE · their system",
  theirApp: "PORTAL SMOKE · another system",
  myMap: "PORTAL SMOKE · their process",
  theirMap: "PORTAL SMOKE · another process",
  myTicket: "PORTAL SMOKE · a request from the client",
  theirTicket: "PORTAL SMOKE · a request from the other company",
  myTodo: "PORTAL SMOKE · something we need from them",
  theirTodo: "PORTAL SMOKE · something we need from the other company",
  myFile: "PORTAL SMOKE · their handover",
  theirFile: "PORTAL SMOKE · another company's handover",
  comment: "PORTAL SMOKE · a client's note on the map",
}

/** The link on the deliverable, and the string the revocation check hunts for.
 * Distinctive on purpose: the third state is proved by grepping the WHOLE
 * response body for it, not by reading the field the screen happens to render. */
const FILE_URL = "https://example.com/portal-smoke/handover.pdf"

/* ---------------------------------- output ---------------------------------- */

let failures = 0
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` — ${detail}`}`)
  if (!cond) failures++
}
/** A setup step the checks depend on: report and stop, don't cascade. A cascade
 * of failures from one broken fixture reads like a broken app. */
const stop = (why, detail = "") => {
  console.log(`FAIL ${why} — ${detail}\n\nPORTAL SMOKE FAILED (setup)`)
  process.exit(1)
}
const section = (title) => console.log(`\n— ${title}`)

/* ------------------------------- the two doors ------------------------------- */

const agency = makeApi(BASE)

/** EVERY DOOR THIS SCRIPT KNOCKS ON AT THE CLIENT'S HOSTNAME, recorded as it is
 * called rather than listed. The census below compares this against the
 * gateway's own `PORTAL_DOORS` table, so "which doors did the smoke cover" is
 * answered by what it DID, and can never drift from a list somebody maintains. */
const knocked = new Set()

const portalCall = makeApi(PORTAL)
/** A request at the CLIENT's front door. Same helper as the agency's, plus the
 * census stamp. */
const portal = async (path, opts = {}, cookie = "") => {
  knocked.add(`${opts.method ?? "GET"} ${path.split("?")[0]}`)
  return portalCall(path, opts, cookie)
}
/** A JSON POST, spelled once. */
const post = (call) => (path, body, cookie) =>
  call(path, { method: "POST", body: JSON.stringify(body) }, cookie)
const agencyPost = post(agency)
const portalPost = post(portal)

const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
if (!TEST_LOGIN_KEY)
  stop(
    "no TEST_LOGIN_KEY in the environment",
    "the smoke signs two accounts in through the staging-only admin test-login door (export TEST_LOGIN_KEY first)"
  )

/** Sign someone in AT A GIVEN FRONT DOOR: the login code is always minted at the
 * agency's admin door (staging-only, its own key, refused on production — and
 * deliberately NOT on the portal's allow-list), then spent at whichever `verify`
 * door we are proving. Verifying at the PORTAL is what makes the returned cookie
 * a cookie the client's browser would actually hold. */
async function signIn(email, at) {
  const start = await agency("/api/auth/admin/test-login", {
    method: "POST",
    headers: { "x-admin-key": TEST_LOGIN_KEY },
    body: JSON.stringify({ email }),
  })
  const code = start.body?.code
  if (typeof code !== "string")
    stop(`could not mint a login code for ${email}`, JSON.stringify({ status: start.status, body: start.body }))
  // Raw (not the JSON helper) because this one needs the set-cookie header off
  // the Response — and it goes through the door being proved, so the census
  // stamp is applied by hand.
  if (at === PORTAL) knocked.add("POST /api/auth/email/verify")
  const verify = await timedFetch(`${at}/api/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  })
  const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
  if (!cookie.startsWith("kwapso_session="))
    stop(`sign-in failed for ${email} at ${at}`, `status ${verify.status}`)
  return cookie
}

/** Walk every page of a keyset-paged read. A SHORT READ MUST NOT LOOK LIKE A
 * COMPLETE ONE: this feeds fence NEGATIVES, and a truncated read makes a
 * negative pass for the wrong reason. */
async function allPages(call, path, key, cookie) {
  const rows = []
  let cursor = null
  for (let page = 0; page < 25; page++) {
    const sep = path.includes("?") ? "&" : "?"
    const url = cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path
    const { ok: fine, status, body } = await call(url, {}, cookie)
    if (!fine) stop(`reading ${path}`, `status ${status} ${JSON.stringify(body).slice(0, 200)}`)
    rows.push(...(body[key] ?? []))
    if (!body.hasMore || !body.nextCursor) return rows
    cursor = body.nextCursor
  }
  stop(`${path}: more than 25 pages`, "refusing to report a partial read as complete")
}

/* ------------------------------ reading the source ---------------------------- */

/** A sentence ABOUT a call is not a call. Rough but sufficient: the `[^:]` guard
 * keeps `https://` intact, which is the only false positive that matters here. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const read = (p) => readFileSync(`${REPO}${p}`, "utf8")

/** THE PORTAL'S SURFACE, read off the gateway's own table — never typed here.
 * Every rule guard in this repo reads source off disk for the same reason: a
 * list maintained beside the thing it describes is a list that drifts. */
function portalDoors() {
  const src = read("workers/portal-gateway/src/index.ts")
  const table = /export const PORTAL_DOORS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(src)
  if (!table) stop("PORTAL_DOORS not found in the portal gateway", "did the table move?")
  const doors = [...table[1].matchAll(/"([A-Z]+ \/[^"]+)":\s*"(\w+)"/g)].map((m) => m[1])
  if (doors.length < 20) stop("PORTAL_DOORS did not parse", `found ${doors.length} doors`)
  return doors
}

/** THE DOORS THAT READ THE AGENCY'S OWN COST (R24), derived exactly as
 * `web/test/rules.test.ts` derives them: the exported names of
 * `internal-money.ts`, then every tenancy route whose handler calls one. Add a
 * door tomorrow that reads a margin and it is asked the question tomorrow.
 *
 * The rule test proves this about the SOURCE. This proves it about what is
 * actually DEPLOYED, at both hostnames, which is a different sentence — a
 * gateway can be red-green correct in the repo and stale in the account. */
function internalMoneyDoors() {
  const internal = strip(read("workers/tenancy/src/lib/internal-money.ts"))
  const exported = [...internal.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1])
  if (exported.length < 4) stop("the internal-money scan found no exports", "it has gone blind")

  const dir = `${REPO}workers/tenancy/src/routes`
  const fns = new Map()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = strip(readFileSync(`${dir}/${file}`, "utf8"))
    const starts = [...src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
    starts.forEach((m, i) => fns.set(m[1], src.slice(m.index, starts[i + 1]?.index ?? src.length)))
  }
  const index = read("workers/tenancy/src/index.ts")
  const doors = [...index.matchAll(/"([A-Z]+ \/[^"]+)":\s*\{\s*handler:\s*(\w+)/g)]
    .filter(([, , handler]) =>
      exported.some((fn) => new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(fns.get(handler) ?? ""))
    )
    .map(([, door]) => door)
  // A BLIND CHECK REPORTS "ALL CLEAR" EXACTLY LIKE A PASSING ONE.
  if (doors.length < 4) stop("no internal-money door was derived", "the walk has gone blind")
  return doors
}

/** THE RESOURCES THE CLIENT'S SCREENS LISTEN FOR, read off the portal's own
 * registry. A listener whose door does not answer is a screen that goes quietly
 * stale — the failure shape with no symptom. */
function portalListeners() {
  const src = read("web-portal/lib/live-resources.ts")
  // `[\s\S]*?` and not `[^=]*`: the declaration's own TYPE carries a `=>`, so a
  // scan that stopped at the first `=` never reached the opening brace.
  const table = /export const PORTAL_LISTENERS[\s\S]*?=\s*\{\r?\n([\s\S]*?)\r?\n\}/.exec(src)
  if (!table) stop("PORTAL_LISTENERS not found", "did the registry move?")
  const names = [...strip(table[1]).matchAll(/^\s*(\w+):\s*\(/gm)].map((m) => m[1])
  if (names.length < 5) stop("PORTAL_LISTENERS did not parse", `found ${names.length} resources`)
  return names
}

/** resource → the door at the client's hostname that refills what a ping on it
 * drops. Hand-written because it is a JUDGEMENT (which read feeds which cache
 * key), and rot-checked against the registry in both directions below, so it
 * cannot quietly fall behind the thing it describes. */
const FED_BY = {
  help: "GET /api/content/help",
  help_threads: "GET /api/content/help/thread",
  accounts: "GET /api/tenancy/accounts/detail",
  account_links: "GET /api/tenancy/accounts/detail",
  portal_users: "GET /api/tenancy/portal/context",
  todos: "GET /api/content/todos",
  stories: "GET /api/content/portal/delivery",
  sprints: "GET /api/content/portal/delivery",
  process_comments: "GET /api/tenancy/impact",
  deliverables: "GET /api/content/portal/deliverables",
}

/* ============================================================================ *
 * 0 · The client's front door is a DIFFERENT door
 * ============================================================================ */

section("the client's front door")
{
  // It forwards what it names…
  const me = await portal("/api/auth/me")
  ok("the portal forwards its own auth door", me.status === 401, `got ${me.status}`)

  // …and 404s everything else, with the same sentence a genuinely absent route
  // gets, so this surface never becomes an oracle for what the agency app can do.
  for (const [label, path, method] of [
    ["the machine surface", "/mcp", "POST"],
    ["the assistant", "/api/data-ops/agent/chat", "POST"],
    ["the import catalogue", "/api/data-ops/import/targets", "GET"],
    ["the agency's team record", "/api/tenancy/active", "GET"],
    ["the member list", "/api/tenancy/members", "GET"],
    ["the role matrix", "/api/tenancy/roles", "GET"],
    ["the agency's own shelf", "/api/content/deliverables", "GET"],
    ["who is on a ticket", "/api/content/help/stakeholders", "GET"],
  ]) {
    const r = await portalCall(path, method === "POST" ? { method: "POST", body: "{}" } : {})
    ok(
      `${label} does not exist at the client's hostname`,
      r.status === 404 && r.body?.error === "not_found",
      `${method} ${path} → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`
    )
  }

  // Uploaded files are worker-served here, not asset-served: a key that is not
  // in the bucket must be the worker's 404, not the static 404 page.
  const media = await portalCall("/media/portal-smoke/no-such-object")
  ok("the media path is served by the worker", media.status === 404, `got ${media.status}`)
}

/* ============================================================================ *
 * 1 · Staff build the world, at the AGENCY door
 * ============================================================================ */

section("the world, built by staff")

const staffCookie = await signIn(STAFF_EMAIL, BASE)
await agency("/api/auth/profile", { method: "POST", body: JSON.stringify({ firstName: "Smoke", lastName: "Test" }) }, staffCookie)
await agency("/api/tenancy/bootstrap", { method: "POST" }, staffCookie)
const active = await agency("/api/tenancy/active", {}, staffCookie)
const TEAM = active.body?.team
if (TEAM?.dbStatus !== "ready") stop("staff has no ready team", JSON.stringify(active.body))
if (active.body?.role?.title !== "Admin") stop("the staff account is not an Admin", JSON.stringify(active.body?.role))
ok("staff hold a ready team as Admin", true)

/** The client's role. Written whole on every run: the permissions door builds
 * the sheet from TEAM_MODULES and normalises anything absent to false, so a
 * stray right left on by a previous run cannot survive.
 *
 * MOSTLY THE RIGHTS A REAL CLIENT LOGIN HOLDS — enough to open every screen the
 * portal has — WITH ONE DELIBERATE ADDITION. `commercials` is granted here and
 * is pointedly NOT granted by the staging seed's Client role, and the two
 * disagree on purpose. The seed's role is a working example an owner copies, and
 * a Client role with a tick beside "Rates & margin" is a screenshot nobody
 * should be able to take. This role is a PROBE nobody copies, and without the
 * grant every R24 check below would be answered by the permission gate rather
 * than by the refusal the law is about — a green run proving only that we did
 * not tick a box. R24's own sentence is that a permission can be granted and an
 * import cannot be forgotten; so the permission IS granted here, and what is
 * left holding the line is the thing the law says is holding it. */
let CLIENT_ROLE_ID = null
const CLIENT_RIGHTS = {
  teams: ["read"],
  accounts: ["read"],
  contacts: ["read"],
  portal_users: ["read"],
  help: ["read", "create", "edit"],
  todos: ["read", "edit"],
  deliverables: ["read"],
  processes: ["read", "create"],
  // The worst case, on purpose. See above.
  commercials: ["read", "create", "edit", "delete"],
}
{
  const roles = await agency("/api/tenancy/roles", {}, staffCookie)
  let role = (roles.body?.roles ?? []).find((r) => r.title === FIX.role)
  if (!role) {
    const made = await agencyPost(
      "/api/tenancy/roles",
      { title: FIX.role, description: "Held by the portal smoke's client login. Rights are rewritten on every run." },
      staffCookie
    )
    role = (made.body?.roles ?? []).find((r) => r.title === FIX.role)
  }
  if (!role?.id) stop("could not find or create the client role", JSON.stringify(roles.body).slice(0, 200))
  if (role.active === false)
    await agencyPost("/api/tenancy/roles/active", { roleId: role.id, active: true }, staffCookie)
  const value = Object.fromEntries(
    Object.entries(CLIENT_RIGHTS).map(([m, rights]) => [
      m,
      { read: false, create: false, edit: false, delete: false, ...Object.fromEntries(rights.map((r) => [r, true])) },
    ])
  )
  const wrote = await agencyPost("/api/tenancy/roles/permissions", { roleId: role.id, value }, staffCookie)
  if (!wrote.ok) stop("could not write the client role's rights", JSON.stringify(wrote.body).slice(0, 200))
  CLIENT_ROLE_ID = role.id
  ok("the client role exists, with its rights rewritten from scratch", true)
}

/** Find-or-create, by name, over the paged account list. */
async function account(name, fields) {
  const found = (await allPages(agency, `/api/tenancy/accounts?q=${encodeURIComponent(name)}`, "accounts", staffCookie))
    .find((a) => a.name === name)
  if (found) return found.id
  const made = await agencyPost("/api/tenancy/accounts", { name, ...fields }, staffCookie)
  if (!made.ok) stop(`could not create ${name}`, JSON.stringify(made.body).slice(0, 200))
  const again = (await allPages(agency, `/api/tenancy/accounts?q=${encodeURIComponent(name)}`, "accounts", staffCookie))
    .find((a) => a.name === name)
  if (!again?.id) stop(`created ${name} but could not read it back`, JSON.stringify(made.body).slice(0, 200))
  return again.id
}

const MINE = await account(FIX.mine, { accountType: "entity" })
const THEIRS = await account(FIX.theirs, { accountType: "entity" })
const CONTACT = await account(FIX.contact, { accountType: "individual", email: CLIENT_EMAIL })
ok("two companies and one contact exist", Boolean(MINE && THEIRS && CONTACT))

// The contact is the MAIN STAKEHOLDER of their company — which is what makes the
// validate door (below) a real move rather than a call that answers politely and
// changes nothing.
{
  const detail = await agency(`/api/tenancy/accounts/detail?id=${MINE}`, {}, staffCookie)
  const linked = (detail.body?.links ?? []).some((l) => l.personAccountId === CONTACT && l.active)
  if (!linked) {
    const made = await agencyPost(
      "/api/tenancy/accounts/links",
      { accountId: MINE, personAccountId: CONTACT, relationship: "Contact", isMainStakeholder: true },
      staffCookie
    )
    if (!made.ok) stop("could not link the contact to their company", JSON.stringify(made.body).slice(0, 200))
  }
  ok("the contact is linked to their company", true)
}

// The client joins the team on the client role, exactly as a real one does: an
// invite, then their own acceptance. Only ever on the first run.
{
  const members = await agency("/api/tenancy/members", {}, staffCookie)
  const already = (members.body?.members ?? []).find((m) => m.email === CLIENT_EMAIL)
  if (!already) {
    const invites = await agency("/api/tenancy/invites", {}, staffCookie)
    if (!(invites.body?.invites ?? []).some((i) => i.email === CLIENT_EMAIL && i.status === "pending")) {
      const sent = await agencyPost("/api/tenancy/invites", { email: CLIENT_EMAIL, roleId: CLIENT_ROLE_ID }, staffCookie)
      if (!sent.ok) stop("could not invite the client", JSON.stringify(sent.body).slice(0, 200))
    }
  } else if (already.roleId !== CLIENT_ROLE_ID) {
    const moved = await agencyPost(
      "/api/tenancy/members/role",
      { userId: already.userId, roleId: CLIENT_ROLE_ID },
      staffCookie
    )
    if (!moved.ok) stop("could not put the client on the client role", JSON.stringify(moved.body).slice(0, 200))
  }
}

// Signing in is what puts them in the platform's user list, and `bootstrap`
// accepts every pending invite — the same door a real person walks through after
// clicking the link in their email. It happens at the AGENCY, deliberately:
// `bootstrap` is not on the portal's allow-list and must not be.
const clientAtAgency = await signIn(CLIENT_EMAIL, BASE)
await agency("/api/auth/profile", { method: "POST", body: JSON.stringify({ firstName: "Portal", lastName: "Smoke" }) }, clientAtAgency)
await agency("/api/tenancy/bootstrap", { method: "POST" }, clientAtAgency)

// The grant that makes them a CLIENT rather than a colleague: the door looks the
// person up by the email on their contact record, never by a typed-in id.
{
  const logins = await agency(`/api/tenancy/portal-users?accountId=${MINE}`, {}, staffCookie)
  if (!(logins.body?.portalUsers ?? []).some((l) => l.accountId === CONTACT && l.active)) {
    const made = await agencyPost(
      "/api/tenancy/portal-users",
      { accountId: MINE, personAccountId: CONTACT },
      staffCookie
    )
    if (!made.ok) stop("could not grant the client login", JSON.stringify(made.body).slice(0, 200))
  }
  ok("the contact holds a client login on their company", true)
}

/** Find-or-create an app, a map, a ticket, a to-do and a deliverable on each
 * company. Everything on `THEIRS` is BAIT: it exists so the fence has something
 * to fail to hide. */
async function app(name, accountId) {
  const found = (await agency(`/api/tenancy/apps?accountId=${accountId}`, {}, staffCookie)).body?.apps ?? []
  const hit = found.find((a) => a.name === name)
  if (hit) return hit.id
  const made = await agencyPost("/api/tenancy/apps", { name, accountId }, staffCookie)
  if (!made.body?.id) stop(`could not record the app ${name}`, JSON.stringify(made.body).slice(0, 200))
  return made.body.id
}
const MY_APP = await app(FIX.myApp, MINE)
const THEIR_APP = await app(FIX.theirApp, THEIRS)

async function map(name, appId) {
  const found = await allPages(agency, `/api/tenancy/processes?appId=${appId}`, "processes", staffCookie)
  const hit = found.find((p) => p.name === name)
  if (hit) return hit.id
  const made = await agencyPost("/api/tenancy/processes", { appId, name }, staffCookie)
  if (!made.body?.id) stop(`could not map ${name}`, JSON.stringify(made.body).slice(0, 200))
  return made.body.id
}
const MY_MAP = await map(FIX.myMap, MY_APP)
const THEIR_MAP = await map(FIX.theirMap, THEIR_APP)

/** Every ticket in the team, staff's view — the "prove the bait exists" read. */
const allTickets = async (cookie, call = agency, path = "/api/content/help") =>
  allPages(call, path, "tickets", cookie)

async function ticket(description, accountId, helpType) {
  const found = (await allTickets(staffCookie)).find((t) => t.description === description)
  if (found) return found
  const made = await agencyPost("/api/content/help", { description, accountId, helpType }, staffCookie)
  if (!made.ok) stop(`could not raise ${description}`, JSON.stringify(made.body).slice(0, 200))
  const again = (await allTickets(staffCookie)).find((t) => t.description === description)
  if (!again?.id) stop(`raised ${description} but could not read it back`)
  return again
}
const THEIR_TICKET = await ticket(FIX.theirTicket, THEIRS, "question")

// A reply and an attachment ON THE BAIT, so the thread and attachment doors have
// something real to fail to hand over.
{
  const thread = await agency(`/api/content/help/thread?id=${THEIR_TICKET.id}`, {}, staffCookie)
  if ((thread.body?.total ?? 0) === 0)
    await agencyPost(
      "/api/content/help/reply",
      { helpId: THEIR_TICKET.id, body: "PORTAL SMOKE · a reply no other company may read" },
      staffCookie
    )
  const files = await agency(`/api/content/help/attachments?id=${THEIR_TICKET.id}`, {}, staffCookie)
  if ((files.body?.total ?? 0) === 0)
    await agencyPost(
      "/api/content/help/attachments",
      { id: THEIR_TICKET.id, kind: "link", label: "PORTAL SMOKE · another company's link", url: "https://example.com/portal-smoke/theirs" },
      staffCookie
    )
}

async function todo(title, accountId) {
  const all = await agency(`/api/content/todos?view=all&accountId=${accountId}`, {}, staffCookie)
  const hit = (all.body?.todos ?? []).find((t) => t.title === title)
  if (hit) return hit
  const made = await agencyPost("/api/content/todos", { accountId, title }, staffCookie)
  if (!made.ok) stop(`could not raise the to-do ${title}`, JSON.stringify(made.body).slice(0, 200))
  const again = await agency(`/api/content/todos?view=all&accountId=${accountId}`, {}, staffCookie)
  const found = (again.body?.todos ?? []).find((t) => t.title === title)
  if (!found?.id) stop(`raised ${title} but could not read it back`)
  return found
}
const MY_TODO = await todo(FIX.myTodo, MINE)
const THEIR_TODO = await todo(FIX.theirTodo, THEIRS)

async function deliverable(title, appId) {
  const shelf = await agency(`/api/content/deliverables?appId=${appId}`, {}, staffCookie)
  const hit = (shelf.body?.deliverables ?? []).find((d) => d.title === title)
  if (hit) return hit
  const made = await agencyPost("/api/content/deliverables", { appId, title, url: FILE_URL }, staffCookie)
  if (!made.ok) stop(`could not file ${title}`, JSON.stringify(made.body).slice(0, 200))
  const found = (made.body?.deliverables ?? []).find((d) => d.title === title)
  if (!found?.id) stop(`filed ${title} but could not read it back`)
  return found
}
const MY_FILE = await deliverable(FIX.myFile, MY_APP)
const THEIR_FILE = await deliverable(FIX.theirFile, THEIR_APP)

/** Show or hide one, as staff. The one door SCOPE's condition lives on. */
const setVisible = (id, appId, visible) =>
  agencyPost("/api/content/deliverables/visibility", { id, appId, visible }, staffCookie)

// The other company's handover is SHARED WITH THEM — deliberately visible, so
// its absence from our client's shelf proves the ACCOUNT fence rather than the
// visibility clause, which is a different sentence and the one that would pass
// by accident.
{
  const shown = await setVisible(THEIR_FILE.id, THEIR_APP, true)
  if (!shown.ok) stop("could not share the other company's handover", JSON.stringify(shown.body).slice(0, 200))
  // Ours starts HIDDEN, whatever the last run left behind.
  const hidden = await setVisible(MY_FILE.id, MY_APP, false)
  if (!hidden.ok) stop("could not hide the client's handover", JSON.stringify(hidden.body).slice(0, 200))
}
ok("the world exists: two companies, each with a system, a map, a ticket, a to-do and a handover", true)

// THE BAIT IS REAL — proved from the account that should see it, before a single
// negative is asked. A negative check is worth nothing if there is nothing to find.
{
  const seen = await allTickets(staffCookie)
  ok("bait: staff can see the other company's request", seen.some((t) => t.id === THEIR_TICKET.id))
  const theirTodos = await agency(`/api/content/todos?view=all&accountId=${THEIRS}`, {}, staffCookie)
  ok("bait: staff can see the other company's to-do", (theirTodos.body?.todos ?? []).some((t) => t.id === THEIR_TODO.id))
  const shelf = await agency(`/api/content/deliverables?appId=${THEIR_APP}`, {}, staffCookie)
  const theirs = (shelf.body?.deliverables ?? []).find((d) => d.id === THEIR_FILE.id)
  ok("bait: the other company's handover is SHARED with them", Boolean(theirs?.visibleToClientAt), JSON.stringify(theirs).slice(0, 160))
}

/* ============================================================================ *
 * 2 · The client signs in AT THE PORTAL
 * ============================================================================ */

section("signing in at the client's own door")

const client = await signIn(CLIENT_EMAIL, PORTAL)
{
  const me = await portal("/api/auth/me", {}, client)
  ok("the portal knows who signed in", me.body?.user?.email === CLIENT_EMAIL, JSON.stringify(me.body).slice(0, 160))

  const profile = await portalPost("/api/auth/profile", { firstName: "Portal", lastName: "Smoke" }, client)
  ok("they can save their own name", profile.ok, `status ${profile.status}`)

  const lang = await portalPost("/api/auth/language", { language: "en" }, client)
  ok("they can choose the language they read their portal in", lang.ok, `status ${lang.status}`)

  // The REAL send door must never carry a code in its response, at either
  // hostname. A unique +label keeps this outside the fixed account's throttle.
  const send = await portalPost("/api/auth/email/start", { email: `delivered+portalsmoke${Date.now()}@resend.dev` }, "")
  const dump = JSON.stringify(send.body ?? {})
  ok("the portal's send door carries NO login code", send.ok && !/\d{6}/.test(dump), dump.slice(0, 160))

  // "Continue with Google" is a browser redirect; the callback is the address
  // Google sends the browser back to and needs a real authorization code, so
  // what is proved here is that BOTH halves are forwarded rather than 404'd —
  // which is the fact this gateway owns.
  const gstart = await portalCall("/api/auth/google/start", { redirect: "manual" })
  knocked.add("GET /api/auth/google/start")
  ok(
    "Google sign-in starts at the client's hostname",
    gstart.status === 302 && (gstart.res.headers.get("location") ?? "").includes("accounts.google.com"),
    `${gstart.status} → ${gstart.res.headers.get("location") ?? "(no location)"}`
  )
  const gback = await portalCall("/api/auth/google/callback", { redirect: "manual" })
  knocked.add("GET /api/auth/google/callback")
  ok("Google's callback is forwarded, not 404'd", gback.status !== 404, `got ${gback.status}`)

  // The live channel. `Upgrade` and `Connection` are headers fetch refuses to
  // set, so this cannot be a real handshake from here — what it proves is the
  // half this gateway owns: the upgrade path is FORWARDED to realtime rather
  // than answered by the allow-list or swallowed by the asset layer. Realtime's
  // own refusal of a non-socket GET is that worker's business, and its
  // membership re-check on the handshake has its own suite.
  const live = await portalCall("/api/realtime")
  knocked.add("GET /api/realtime")
  ok("the live channel is forwarded to realtime", live.status !== 404, `got ${live.status}`)
}

// Stand somewhere ON PURPOSE before asking what can be seen: the pointer is
// whatever the last thing to touch it left behind, and an assumption here reads
// as a fence failure. This also exercises the switcher on the way past.
{
  const stood = await portalPost("/api/tenancy/portal/switch-account", { accountId: MINE }, client)
  ok("the client stands in their own company", stood.body?.currentAccountId === MINE, JSON.stringify(stood.body).slice(0, 200))

  const ctx = await portal("/api/tenancy/portal/context", {}, client)
  ok("the portal calls them a client login, out loud", ctx.body?.kind === "portal", JSON.stringify(ctx.body).slice(0, 200))
  ok(
    "and offers them only their own company to stand in",
    (ctx.body?.accounts ?? []).length >= 1 && !(ctx.body?.accounts ?? []).some((a) => a.id === THEIRS),
    JSON.stringify(ctx.body?.accounts).slice(0, 200)
  )
}

/* ============================================================================ *
 * 3 · Their own world answers — every read the portal's screens are made of
 * ============================================================================ */

section("their own world")

// The positive half FIRST. A fence that refuses everybody is not a fence, it is
// a broken door — and it would pass a refusal-only suite perfectly.
{
  const mine = await allPages(portal, "/api/tenancy/accounts", "accounts", client)
  ok("they see their own company", mine.some((a) => a.id === MINE), `saw ${mine.length} accounts`)

  const detail = await portal(`/api/tenancy/accounts/detail?id=${MINE}`, {}, client)
  ok("they can open their own company", detail.body?.account?.id === MINE, JSON.stringify(detail.body).slice(0, 160))

  const delivery = await portal("/api/content/portal/delivery", {}, client)
  ok("their delivery blocks answer", delivery.ok && Array.isArray(delivery.body?.sprints), `status ${delivery.status}`)

  const value = await portal("/api/tenancy/impact", {}, client)
  ok("their value screen answers", value.ok, `status ${value.status} ${JSON.stringify(value.body).slice(0, 120)}`)

  const todos = await portal("/api/content/todos", {}, client)
  ok("their to-dos answer", todos.ok && typeof todos.body?.total === "number", `status ${todos.status}`)
}

// A request of their own: raised as a kind that WAITS for the company to
// confirm, so `validate` below is a real move rather than a polite no-op.
let MY_TICKET
{
  const before = await allTickets(client, portal)
  MY_TICKET = before.find((t) => t.description === FIX.myTicket)
  if (!MY_TICKET) {
    const raised = await portalPost("/api/content/help", { description: FIX.myTicket, helpType: "request" }, client)
    ok("they can raise a request", raised.ok, `status ${raised.status} ${JSON.stringify(raised.body).slice(0, 160)}`)
    ok(
      "and their first question comes back with THEIR list, not everybody's",
      !(raised.body?.tickets ?? []).some((t) => t.id === THEIR_TICKET.id),
      JSON.stringify((raised.body?.tickets ?? []).map((t) => t.ref)).slice(0, 200)
    )
    MY_TICKET = (await allTickets(client, portal)).find((t) => t.description === FIX.myTicket)
  }
  if (!MY_TICKET?.id) stop("the client has no request of their own to work with")

  const list = await portal("/api/content/help", {}, client)
  ok("their request list answers with an exact count", list.ok && typeof list.body?.total === "number", `status ${list.status}`)

  const thread = await portal(`/api/content/help/thread?id=${MY_TICKET.id}`, {}, client)
  ok("they can read the conversation on it", thread.ok && Array.isArray(thread.body?.replies), `status ${thread.status}`)

  const replied = await portalPost(
    "/api/content/help/reply",
    { helpId: MY_TICKET.id, body: `PORTAL SMOKE · ${new Date().toISOString()}` },
    client
  )
  ok("they can answer their own thread", replied.ok, `status ${replied.status}`)

  // Correcting the wording and re-ranking are the two powers SCOPE ch.07 gives
  // the account over its own requests. Both are governed by the LOCK, so a
  // ticket a staff member has read answers politely and moves nothing — which is
  // why what is asserted is that the door ANSWERS, not that it changed a row.
  const edited = await portalPost("/api/content/help/update", { id: MY_TICKET.id, description: FIX.myTicket }, client)
  ok("they can correct their own wording (or be held by the lock)", edited.ok || edited.status === 403, `status ${edited.status}`)
  const ranked = await portalPost("/api/content/help/rank", { id: MY_TICKET.id }, client)
  ok("they can drag their company's requests into order", ranked.ok || ranked.status === 403, `status ${ranked.status}`)

  // The one lifecycle door a client may push, and R17 makes it idempotent: on
  // the second run the ticket is already `new` and the call moves nothing.
  const validated = await portalPost("/api/content/help/validate", { id: MY_TICKET.id }, client)
  ok("they can confirm a request should go ahead", validated.ok, `status ${validated.status}`)

  // Showing us what they mean: attach a link, read it back, take it off again —
  // so the run leaves nothing behind.
  const attached = await portalPost(
    "/api/content/help/attachments",
    { id: MY_TICKET.id, kind: "link", label: "PORTAL SMOKE · what I mean", url: "https://example.com/portal-smoke/mine" },
    client
  )
  ok("they can attach a link to their request", attached.ok, `status ${attached.status} ${JSON.stringify(attached.body).slice(0, 140)}`)
  const files = await portal(`/api/content/help/attachments?id=${MY_TICKET.id}`, {}, client)
  const mineAttached = (files.body?.attachments ?? []).find((a) => a.label === "PORTAL SMOKE · what I mean")
  ok("and read it back with its exact count", Boolean(mineAttached) && typeof files.body?.total === "number", JSON.stringify(files.body).slice(0, 160))
  if (mineAttached) {
    const removed = await portalPost(
      "/api/content/help/attachments/remove",
      { id: MY_TICKET.id, attachmentId: mineAttached.id },
      client
    )
    ok("and take it off again", removed.ok, `status ${removed.status}`)
  } else {
    knocked.add("POST /api/content/help/attachments/remove")
    ok("and take it off again", false, "nothing was attached to remove")
  }
}

// Completing what we asked them for. R17: on the second run it is already done,
// the same call answers 200 and moves nothing.
{
  const done = await portalPost("/api/content/todos/complete", { id: MY_TODO.id }, client)
  ok("they can complete what we asked them for", done.ok && Boolean(done.body?.todo?.completedAt), JSON.stringify(done.body).slice(0, 160))
}

// Talking about their own map.
{
  const before = await portal(`/api/tenancy/processes/comments?processId=${MY_MAP}`, {}, client)
  ok("they can read the conversation on their own map", before.ok, `status ${before.status}`)
  if (!(before.body?.comments ?? []).some((c) => c.body === FIX.comment)) {
    const said = await portalPost("/api/tenancy/processes/comments", { processId: MY_MAP, body: FIX.comment }, client)
    ok("and say something on it", said.ok, `status ${said.status} ${JSON.stringify(said.body).slice(0, 140)}`)
  } else {
    knocked.add("POST /api/tenancy/processes/comments")
    ok("and say something on it (said on a previous run)", true)
  }
}

/* ============================================================================ *
 * 4 · THE FENCE — standing in one company, reaching for another's
 * ============================================================================ */

section("the account fence")

{
  const seen = await allPages(portal, "/api/tenancy/accounts", "accounts", client)
  ok(
    "the other company is not in their list",
    !seen.some((a) => a.id === THEIRS),
    seen.map((a) => a.name).join(", ").slice(0, 200)
  )

  const searched = await portal(`/api/tenancy/accounts?q=${encodeURIComponent(FIX.theirs)}`, {}, client)
  ok(
    "naming the other company in a search tells them nothing",
    searched.status === 200 && (searched.body?.accounts ?? []).length === 0,
    JSON.stringify(searched.body).slice(0, 160)
  )

  const byId = await portal(`/api/tenancy/accounts/detail?id=${THEIRS}`, {}, client)
  ok("opening the other company by id is refused", byId.status === 404, `got ${byId.status}`)

  const asContact = await portal(`/api/tenancy/accounts/detail?id=${CONTACT}`, {}, client)
  ok("their own contact record is theirs to read", asContact.ok || asContact.status === 404, `got ${asContact.status}`)
}

// Tickets: by list, by filter, by thread, by attachment, and by every write.
{
  const theirs = await allTickets(client, portal)
  ok(
    "the other company's request is not in their list",
    !theirs.some((t) => t.id === THEIR_TICKET.id),
    theirs.map((t) => t.ref).join(", ").slice(0, 200)
  )

  const filtered = await portal(`/api/content/help?accountId=${THEIRS}`, {}, client)
  ok(
    "naming the other company in the filter buys them nothing",
    !(filtered.body?.tickets ?? []).some((t) => t.id === THEIR_TICKET.id),
    JSON.stringify(filtered.body?.total)
  )

  const searched = await portal(`/api/content/help?q=${encodeURIComponent(FIX.theirTicket)}`, {}, client)
  ok(
    "searching for its exact words finds nothing",
    (searched.body?.tickets ?? []).length === 0,
    JSON.stringify((searched.body?.tickets ?? []).map((t) => t.ref))
  )

  const thread = await portal(`/api/content/help/thread?id=${THEIR_TICKET.id}`, {}, client)
  ok(
    "the other company's conversation is empty to them",
    thread.status === 404 || (thread.body?.total ?? 0) === 0,
    `${thread.status} ${JSON.stringify(thread.body).slice(0, 160)}`
  )

  const files = await portal(`/api/content/help/attachments?id=${THEIR_TICKET.id}`, {}, client)
  ok(
    "and so are the files on it",
    files.status === 404 || (files.body?.total ?? 0) === 0,
    `${files.status} ${JSON.stringify(files.body).slice(0, 160)}`
  )

  for (const [what, path, body] of [
    ["reply to", "/api/content/help/reply", { helpId: THEIR_TICKET.id, body: "PORTAL SMOKE · this must never land" }],
    ["reword", "/api/content/help/update", { id: THEIR_TICKET.id, description: "PORTAL SMOKE · this must never land" }],
    ["re-rank", "/api/content/help/rank", { id: THEIR_TICKET.id }],
    ["confirm", "/api/content/help/validate", { id: THEIR_TICKET.id }],
    ["attach a file to", "/api/content/help/attachments", { id: THEIR_TICKET.id, kind: "link", label: "PORTAL SMOKE · never", url: "https://example.com/never" }],
    ["remove a file from", "/api/content/help/attachments/remove", { id: THEIR_TICKET.id, attachmentId: "whatever" }],
  ]) {
    const r = await portalPost(path, body, client)
    ok(`they cannot ${what} the other company's request`, r.status === 404, `got ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)
  }

  // …AND THE WRITE LEFT NOTHING BEHIND. A refusal that answered 404 after
  // appending the row would look identical from the outside.
  const after = await agency(`/api/content/help/thread?id=${THEIR_TICKET.id}`, {}, staffCookie)
  ok(
    "nothing the client typed reached the other company's thread",
    !(after.body?.replies ?? []).some((r) => (r.body ?? "").includes("this must never land")),
    JSON.stringify((after.body?.replies ?? []).map((r) => (r.body ?? "").slice(0, 40)))
  )
  const stillTheirs = (await allTickets(staffCookie)).find((t) => t.id === THEIR_TICKET.id)
  ok("and its wording is untouched", stillTheirs?.description === FIX.theirTicket, String(stillTheirs?.description).slice(0, 120))
}

// To-dos.
{
  const mine = await portal("/api/content/todos?view=all", {}, client)
  ok(
    "the other company's to-do is not in their list",
    !(mine.body?.todos ?? []).some((t) => t.id === THEIR_TODO.id),
    JSON.stringify((mine.body?.todos ?? []).map((t) => t.title)).slice(0, 200)
  )
  const filtered = await portal(`/api/content/todos?view=all&accountId=${THEIRS}`, {}, client)
  ok(
    "naming the other company in the filter buys them nothing",
    !(filtered.body?.todos ?? []).some((t) => t.id === THEIR_TODO.id),
    JSON.stringify(filtered.body?.total)
  )
  const done = await portalPost("/api/content/todos/complete", { id: THEIR_TODO.id }, client)
  ok("they cannot complete the other company's to-do", done.status === 404, `got ${done.status}`)
  const after = await agency(`/api/content/todos?view=all&accountId=${THEIRS}`, {}, staffCookie)
  const still = (after.body?.todos ?? []).find((t) => t.id === THEIR_TODO.id)
  ok("and it is still open", Boolean(still) && !still?.completedAt, JSON.stringify(still).slice(0, 160))
}

// The map, its conversation, and the value drilled off it.
{
  const theirs = await portal(`/api/tenancy/processes/comments?processId=${THEIR_MAP}`, {}, client)
  ok(
    "the other company's map has no conversation for them",
    theirs.status === 404 || (theirs.body?.total ?? 0) === 0,
    `${theirs.status} ${JSON.stringify(theirs.body).slice(0, 160)}`
  )
  const said = await portalPost(
    "/api/tenancy/processes/comments",
    { processId: THEIR_MAP, body: "PORTAL SMOKE · this must never land" },
    client
  )
  ok("they cannot comment on the other company's map", said.status === 404, `got ${said.status}`)

  const value = await portal(`/api/tenancy/impact?accountId=${THEIRS}`, {}, client)
  const dump = JSON.stringify(value.body ?? {})
  ok(
    "asking for the other company's value answers about nobody",
    !dump.includes(THEIRS) && !dump.includes(FIX.theirApp),
    dump.slice(0, 200)
  )
}

// Standing somewhere they were never granted.
{
  const jumped = await portalPost("/api/tenancy/portal/switch-account", { accountId: THEIRS }, client)
  ok("they cannot stand in the other company", jumped.status === 404, `got ${jumped.status}`)
  const ctx = await portal("/api/tenancy/portal/context", {}, client)
  ok("and they are still standing where they were", ctx.body?.currentAccountId === MINE, JSON.stringify(ctx.body).slice(0, 160))
}

/* ============================================================================ *
 * 5 · A HANDOVER IS VISIBLE ONLY WHEN WE SAY SO — and un-saying it takes the
 *     file with it (the bug, 2026-08-19)
 * ============================================================================ */

section("what we handed over")

const shelf = async () => {
  const r = await portal("/api/content/portal/deliverables", {}, client)
  if (!r.ok) stop("the client's shelf did not answer", `status ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`)
  return { rows: r.body?.deliverables ?? [], total: r.body?.total ?? 0, dump: JSON.stringify(r.body ?? {}) }
}

{
  // 1 · FILED AND NOT SHARED. Born invisible; nothing about it travels.
  const hidden = await shelf()
  ok("a handover nobody has shared is not on their shelf", !hidden.rows.some((d) => d.id === MY_FILE.id))
  ok("and its file link is nowhere in the answer", !hidden.dump.includes(FILE_URL), hidden.dump.slice(0, 200))
  ok(
    "the other company's SHARED handover is not on it either",
    !hidden.rows.some((d) => d.id === THEIR_FILE.id),
    JSON.stringify(hidden.rows.map((d) => d.title)).slice(0, 200)
  )
  const hiddenTotal = hidden.total

  // 2 · SHARED. The condition the owner asked for, per row.
  const shown = await setVisible(MY_FILE.id, MY_APP, true)
  if (!shown.ok) stop("could not share the client's handover", JSON.stringify(shown.body).slice(0, 200))
  const open = await shelf()
  const row = open.rows.find((d) => d.id === MY_FILE.id)
  ok("once we mark it visible, it is on their shelf", Boolean(row), JSON.stringify(open.rows.map((d) => d.title)).slice(0, 200))
  ok("with its file link", row?.url === FILE_URL, String(row?.url))
  ok("and the heading counts it", open.total === hiddenTotal + 1, `${hiddenTotal} → ${open.total}`)
  ok("still nothing of the other company's", !open.rows.some((d) => d.id === THEIR_FILE.id))
  // The portal shows the work and never which staff member is doing it.
  ok(
    "and nothing about US travels with it",
    !/creator|editor|deactivated/i.test(open.dump),
    open.dump.slice(0, 200)
  )

  // 3 · WITHDRAWN — and withdrawal has to actually withdraw. Grepping the WHOLE
  // body, not the field the screen reads: the bug was a value still sitting in
  // the JSON one devtools panel away.
  const revoked = await setVisible(MY_FILE.id, MY_APP, false)
  if (!revoked.ok) stop("could not un-share the client's handover", JSON.stringify(revoked.body).slice(0, 200))
  const gone = await shelf()
  ok("revoking visibility takes it off their shelf", !gone.rows.some((d) => d.id === MY_FILE.id))
  ok("AND TAKES THE FILE URL WITH IT", !gone.dump.includes(FILE_URL), gone.dump.slice(0, 240))
  ok("and the heading counts it out again", gone.total === hiddenTotal, `${open.total} → ${gone.total}`)
}

/* ============================================================================ *
 * 6 · R24 — AN INTERNAL NUMBER CANNOT REACH THE CLIENT'S SIDE
 * ============================================================================ */

section("the agency's own books (R24)")

const INTERNAL = internalMoneyDoors()
console.log(`  derived ${INTERNAL.length} doors that read the agency's own cost: ${INTERNAL.join(", ")}`)
ok(
  "the derivation still finds the two doors this law is named for",
  INTERNAL.includes("GET /api/tenancy/internal-rates") && INTERNAL.includes("GET /api/tenancy/margin"),
  INTERNAL.join(", ")
)

const PORTAL_DOORS = portalDoors()
for (const door of INTERNAL) {
  const [method, path] = door.split(" ")
  const opts = method === "GET" ? {} : { method, body: "{}" }

  // 1 · UNNAMED AT THE CLIENT'S HOSTNAME — the allow-list never mentions it, so
  //     the gateway answers "no such API" and this surface tells them nothing.
  ok(`${door} is not in the portal's door table`, !PORTAL_DOORS.includes(door))
  const atPortal = await portalCall(path, opts)
  ok(
    `${door} does not exist at the client's hostname`,
    atPortal.status === 404 && atPortal.body?.error === "not_found",
    `${atPortal.status} ${JSON.stringify(atPortal.body).slice(0, 120)}`
  )

  // 2 · AND REFUSED AT OURS, TO THE SAME PERSON. Belt and braces on purpose:
  //     the allow-list is the first answer, and the door's own refusal is the
  //     one that survives somebody adding a line to the allow-list. That
  //     mistake has been made twice in this codebase.
  const atAgency = await agency(path, opts, clientAtAgency)
  ok(
    `${door} refuses the same client login at the agency's hostname`,
    atAgency.status === 403 && atAgency.body?.error === "client_login",
    `${atAgency.status} ${JSON.stringify(atAgency.body).slice(0, 140)}`
  )
}

// R21, the other half. Three doors the portal gateway's own comment says are
// deliberately absent, asked at the AGENCY origin where the same client login
// can actually reach them — and every one is a door this role HOLDS THE RIGHT
// FOR, so what turns them away is the refusal and not the permission sheet.
for (const [what, path, opts] of [
  ["the agency's own handover shelf", `/api/content/deliverables?appId=${MY_APP}`, {}],
  ["which staff member is on a ticket", `/api/content/help/stakeholders?id=${MY_TICKET.id}`, {}],
  ["moving a ticket along its lifecycle", "/api/content/help/status", { method: "POST", body: "{}" }],
]) {
  const r = await agency(path, opts, clientAtAgency)
  ok(
    `a client login is refused ${what} at the agency's hostname`,
    r.status === 403 && r.body?.error === "client_login",
    `${r.status} ${JSON.stringify(r.body).slice(0, 140)}`
  )
}

/* ============================================================================ *
 * 7 · The census — every door on the surface, every resource on the registry
 * ============================================================================ */

section("coverage")

// Logout last, so it is counted and so the run leaves no live session behind.
{
  const out = await portalPost("/api/auth/logout", {}, client)
  ok("logging out at the portal ends the session", out.ok, `status ${out.status}`)
  const after = await portal("/api/auth/me", {}, client)
  ok("and the door no longer knows them", after.status === 401, `got ${after.status}`)
}

{
  const missed = PORTAL_DOORS.filter((d) => !knocked.has(d))
  ok(
    `every door on the portal's surface was knocked on live (${PORTAL_DOORS.length - missed.length}/${PORTAL_DOORS.length})`,
    missed.length === 0,
    `never called: ${missed.join(", ")}`
  )
  // The other direction: a path this script calls that the gateway does not name
  // would be a check passing against nothing.
  const stray = [...knocked].filter((d) => !PORTAL_DOORS.includes(d))
  ok("and nothing was tested that the gateway does not serve", stray.length === 0, stray.join(", "))
}

{
  const resources = portalListeners()
  const unfed = resources.filter((r) => !FED_BY[r])
  ok(
    `every resource the client's screens listen for has a door behind it (${resources.length - unfed.length}/${resources.length})`,
    unfed.length === 0,
    `no door named for: ${unfed.join(", ")}`
  )
  // Rot check: an entry naming a resource the registry no longer carries is a
  // line nobody reread.
  const stale = Object.keys(FED_BY).filter((r) => !resources.includes(r))
  ok("and no listener in this script has outlived the registry", stale.length === 0, `delete: ${stale.join(", ")}`)
  // …and each of those doors is one the run actually called.
  const untested = [...new Set(Object.values(FED_BY))].filter((d) => !knocked.has(d))
  ok("and every one of those doors answered in this run", untested.length === 0, untested.join(", "))
}

console.log(
  failures
    ? `\nPORTAL SMOKE FAILED (${failures})`
    : `\nPORTAL SMOKE PASSED — ${PORTAL_DOORS.length} portal doors, ${INTERNAL.length} internal-money doors refused at both hostnames`
)
process.exit(failures ? 1 : 0)
