// MCP smoke test — the EXTERNAL MACHINE SURFACE, proven against live staging.
//
// smoke-staging.mjs walks the human journey and touches /mcp in passing. This
// one is the machine door's own suite: it mints a personal access token and
// then connects over the gateway at POST /mcp with `Authorization: Bearer …`,
// exactly as an outside tool would — no service bindings, no internal keys, no
// shortcuts the real client wouldn't have.
//
// It does not TRUST the posture in MCP.md §5 — it tries to break each claim:
//
//   · acts AS its owner, never above them — a denied tool is refused, and being
//     granted READ never smuggles in CREATE;
//   · pinned to ONE team — the token keeps reading its own team while the human
//     it belongs to is signed into a DIFFERENT team where they are Admin;
//   · a role change bites the LIVE token — both directions, no re-mint, on the
//     very next call (the bridged session cookie is cached, so this proves the
//     DOOR re-checks the role, not just the bridge);
//   · a revoked token is dead on the next call;
//   · R19 filter parity — every filter a list door parses is exposed by the
//     DEPLOYED catalogue and actually filters (a dropped filter would silently
//     answer a different question).
//
// Two fixed accounts, so repeat runs don't litter: the ADMIN (the same account
// smoke-staging uses, owner of the token's team) and the MACHINE OWNER — a
// deliberately under-privileged member who holds the token. The machine owner
// also keeps their OWN personal team, which is what makes the one-team proof
// real rather than notional.
//
//   TEST_LOGIN_KEY=… node scripts/smoke-mcp.mjs
//
// Exits non-zero on any failure. A token secret is NEVER printed — every line
// this script writes goes through redact().

import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const BASE = process.env.SMOKE_BASE ?? "https://kwapso-staging.kwapso.workers.dev"
const REPO = fileURLToPath(new URL("..", import.meta.url))

// Resend's test inbox: a real send path that always "delivers" and never
// bounces, so repeat runs don't hurt the sending domain's reputation.
const ADMIN_EMAIL = "delivered@resend.dev"
const OWNER_EMAIL = "delivered+mcp@resend.dev"

const PROBE_ROLE = "MCP smoke minimal"
const SECOND_TEAM = "MCP smoke second team"

/* ---------------------------------- output ---------------------------------- */

// A token secret must never reach stdout — not in a detail string, not inside a
// dumped response body. One choke point, so no future check can leak one.
const redact = (v) => String(v).replace(/kwapso_mcp_[0-9a-f]+/gi, "kwapso_mcp_<redacted>")

let failures = 0
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` — ${redact(detail)}`}`)
  if (!cond) failures++
}
/** A setup step the later checks depend on: report and stop, don't cascade. */
const stop = (why, detail = "") => {
  console.log(`FAIL ${why} — ${redact(detail)}\n\nMCP SMOKE FAILED (setup)`)
  process.exit(1)
}
const section = (title) => console.log(`\n— ${title}`)

/* ------------------------------- the app doors ------------------------------- */

/** A normal app request (session cookie), exactly as the browser makes it. */
const api = async (path, opts = {}, cookie = "") => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...opts.headers,
    },
  })
  let body = null
  try {
    body = await res.json()
  } catch {}
  return { res, body }
}

const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
if (!TEST_LOGIN_KEY)
  stop(
    "no TEST_LOGIN_KEY in the environment",
    "the smoke signs two accounts in through the staging-only admin test-login door (export TEST_LOGIN_KEY first)"
  )

/** Sign an account in through the staging-only admin door → its session cookie. */
async function signIn(email) {
  const start = await api("/api/auth/admin/test-login", {
    method: "POST",
    headers: { "x-admin-key": TEST_LOGIN_KEY },
    body: JSON.stringify({ email }),
  })
  const code = start.body?.code
  if (typeof code !== "string") stop(`could not mint a login code for ${email}`, JSON.stringify({ status: start.res.status, body: start.body }))
  const verify = await fetch(`${BASE}/api/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  })
  const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
  if (!cookie.startsWith("kwapso_session=")) stop(`sign-in failed for ${email}`, `status ${verify.status}`)
  // Onboarding is idempotent; a fresh environment needs it before bootstrap.
  await api("/api/auth/profile", { method: "POST", body: JSON.stringify({ firstName: "Smoke", lastName: "Test" }) }, cookie)
  return cookie
}

/* ------------------------------- the MCP door -------------------------------- */

/** One JSON-RPC call to POST /mcp with a bearer token — the outside tool's view.
 * `bearer` is passed explicitly so the no-token and bad-token cases share it. */
async function rpc(bearer, method, params = {}, id = 1) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  })
  let body = null
  try {
    body = await res.json()
  } catch {}
  return { status: res.status, body }
}

/** tools/call, unwrapped: the door's own JSON comes back as the content text. */
async function callTool(bearer, name, args = {}) {
  const { status, body } = await rpc(bearer, "tools/call", { name, arguments: args })
  const text = body?.result?.content?.[0]?.text ?? ""
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  return { status, isError: body?.result?.isError === true, text, data, rpcError: body?.error ?? null }
}

/** Was this call refused by the door's permission gate (not some other error)? */
const refused = (call) => call.isError === true && call.data?.error === "forbidden"

/* ============================================================================ *
 * 0 · The machine door answers through the gateway
 * ============================================================================ */

section("the door")
{
  const health = await api("/api/mcp/health")
  ok("mcp worker answers through the gateway", health.body?.ok === true, `status ${health.res.status}`)
}

/* ============================================================================ *
 * 1 · Two real people: the admin who owns the team, and the machine's owner
 * ============================================================================ */

section("the two accounts")

const adminCookie = await signIn(ADMIN_EMAIL)
const adminBoot = await api("/api/tenancy/bootstrap", { method: "POST" }, adminCookie)
const adminActive = await api("/api/tenancy/active", {}, adminCookie)
const TEAM = adminActive.body?.team
ok("admin has a ready team", TEAM?.dbStatus === "ready", JSON.stringify(adminBoot.body))
ok("admin holds the Admin role", adminActive.body?.role?.title === "Admin", JSON.stringify(adminActive.body?.role))
if (!TEAM?.id) stop("no team to pin a token to")

// The machine owner signs in and bootstraps FIRST, before any invite exists —
// so they get their OWN personal team. That second team is the whole point:
// without it, "pinned to one team" can't be told apart from "only has one team".
const ownerCookie = await signIn(OWNER_EMAIL)
await api("/api/tenancy/bootstrap", { method: "POST" }, ownerCookie)

/* ============================================================================ *
 * 2 · Give the machine owner a deliberately small role in the admin's team
 * ============================================================================ */

section("the under-privileged role")

/** The full 8-module matrix with only the named rights on — the door normalises
 * anything absent to false, so this SETS the role's whole sheet every run
 * (a previous run can never leave a stray right switched on). */
const MODULES = ["teams", "team_members", "member_roles", "learning", "help", "selectable_data", "screens", "agent"]
const matrix = (grants) =>
  Object.fromEntries(
    MODULES.map((m) => [
      m,
      { read: false, create: false, edit: false, delete: false, ...Object.fromEntries((grants[m] ?? []).map((r) => [r, true])) },
    ])
  )

const BASELINE = { learning: ["read"] }
const GRANTED = { learning: ["read"], member_roles: ["read"], team_members: ["read"], help: ["read"] }

async function setProbeRights(grants) {
  const { res, body } = await api(
    "/api/tenancy/roles/permissions",
    { method: "POST", body: JSON.stringify({ roleId: probeRoleId, value: matrix(grants) }) },
    adminCookie
  )
  if (!res.ok) stop("could not set the probe role's rights", JSON.stringify(body))
}

// Find-or-create the probe role (never a fresh one per run — that would litter).
const rolesBefore = await api("/api/tenancy/roles", {}, adminCookie)
let probe = (rolesBefore.body?.roles ?? []).find((r) => r.title === PROBE_ROLE)
if (!probe) {
  const created = await api("/api/tenancy/roles", { method: "POST", body: JSON.stringify({ title: PROBE_ROLE, description: "Held by the MCP smoke's machine account. Rights are reset on every run." }) }, adminCookie)
  probe = (created.body?.roles ?? []).find((r) => r.title === PROBE_ROLE)
}
if (!probe?.id) stop("could not find or create the probe role", JSON.stringify(rolesBefore.body))
const probeRoleId = probe.id
if (probe.active === false)
  await api("/api/tenancy/roles/active", { method: "POST", body: JSON.stringify({ roleId: probeRoleId, active: true }) }, adminCookie)

await setProbeRights(BASELINE)
ok("probe role exists, reset to learning:read only", true)

// Make sure the machine owner is a member of the admin's team holding that role.
const membersNow = await api("/api/tenancy/members", {}, adminCookie)
let owner = (membersNow.body?.members ?? []).find((m) => m.email === OWNER_EMAIL)
if (!owner) {
  const invited = await api("/api/tenancy/invites", { method: "POST", body: JSON.stringify({ email: OWNER_EMAIL, roleId: probeRoleId }) }, adminCookie)
  if (!invited.res.ok) stop("could not invite the machine owner", JSON.stringify(invited.body))
  const received = await api("/api/tenancy/invitations", {}, ownerCookie)
  const mine = (received.body?.invitations ?? []).find((i) => i.teamId === TEAM.id)
  if (!mine?.id) stop("the machine owner never received the invite", JSON.stringify(received.body))
  const accepted = await api("/api/tenancy/invitations/accept", { method: "POST", body: JSON.stringify({ inviteId: mine.id }) }, ownerCookie)
  if (!accepted.res.ok) stop("the machine owner could not accept the invite", JSON.stringify(accepted.body))
  const again = await api("/api/tenancy/members", {}, adminCookie)
  owner = (again.body?.members ?? []).find((m) => m.email === OWNER_EMAIL)
} else if (owner.roleId !== probeRoleId) {
  const moved = await api("/api/tenancy/members/role", { method: "POST", body: JSON.stringify({ userId: owner.userId, roleId: probeRoleId }) }, adminCookie)
  if (!moved.res.ok) stop("could not put the machine owner on the probe role", JSON.stringify(moved.body))
}
if (!owner?.userId) stop("the machine owner is not a member of the admin's team")
ok("machine owner is a member of the admin's team, on the small role", true)

// Their OWN team — the one the token must never be able to reach into.
const ownerTeams = await api("/api/tenancy/teams", {}, ownerCookie)
let second = (ownerTeams.body?.teams ?? []).find((t) => t.id !== TEAM.id)
if (!second) {
  // Self-healing: an account that was invited before it ever bootstrapped has no
  // team of its own. Create one ONCE so the pinning proof has a second team.
  const made = await api("/api/tenancy/teams", { method: "POST", body: JSON.stringify({ name: SECOND_TEAM }) }, ownerCookie)
  second = made.body?.team ?? (await api("/api/tenancy/teams", {}, ownerCookie)).body?.teams?.find((t) => t.id !== TEAM.id)
}
if (!second?.id) stop("the machine owner has no second team — the one-team proof needs one")
ok("machine owner also belongs to a second team of their own", second.id !== TEAM.id)

/* ============================================================================ *
 * 3 · Mint the token, exactly as a person does in Settings → Access tokens
 * ============================================================================ */

section("minting a personal access token")

// The token is pinned to whatever team the person is in AT CREATION, so be
// explicit about which one that is.
const switched = await api("/api/tenancy/switch-team", { method: "POST", body: JSON.stringify({ teamId: TEAM.id }) }, ownerCookie)
ok("machine owner is standing in the admin's team", switched.body?.team?.id === TEAM.id, JSON.stringify(switched.body?.team))

const created = await api("/api/mcp/tokens", { method: "POST", body: JSON.stringify({ label: "MCP smoke" }) }, ownerCookie)
const SECRET = created.body?.secret
const tokenId = created.body?.token?.id
// Never log `created.body` — it is the one response that carries the secret.
ok("token minted, secret returned once", typeof SECRET === "string" && /^kwapso_mcp_[0-9a-f]{64}$/.test(SECRET ?? ""), `status ${created.res.status}`)
ok("token is pinned to the team it was made in", created.body?.token?.teamId === TEAM.id, String(created.body?.token?.teamId))
if (!SECRET || !tokenId) stop("no token to test with")

// The listing door must never hand back the secret or its hash a second time.
{
  const listed = await api("/api/mcp/tokens", {}, ownerCookie)
  const dump = JSON.stringify(listed.body ?? {})
  ok("the token list returns no secret and no hash", !dump.includes("kwapso_mcp_") && !/hash/i.test(dump), dump.slice(0, 160))
}

// From here on the HUMAN stands in their OWN team, where they are Admin. Every
// remaining token check therefore runs while the person behind the token has
// MORE rights somewhere else — which is exactly the confusion a pinned token
// must not make.
const moved = await api("/api/tenancy/switch-team", { method: "POST", body: JSON.stringify({ teamId: second.id }) }, ownerCookie)
ok("machine owner has walked into their own team", moved.body?.team?.id === second.id, JSON.stringify(moved.body?.team))
ok("…where they are an Admin", moved.body?.role?.title === "Admin", JSON.stringify(moved.body?.role))

/* ============================================================================ *
 * 4 · Connect over the gateway exactly as an outside tool would
 * ============================================================================ */

section("connecting as an outside tool")
{
  const init = await rpc(SECRET, "initialize")
  ok("initialize answers", init.body?.result?.serverInfo?.name === "kwapso-mcp", JSON.stringify(init.body).slice(0, 200))
  ok("initialize declares a protocol version", typeof init.body?.result?.protocolVersion === "string", String(init.body?.result?.protocolVersion))
  ok("initialize declares the tools capability", init.body?.result?.capabilities?.tools !== undefined)

  const none = await rpc(null, "tools/list")
  ok("no Authorization header is refused", none.status === 401, `status ${none.status}`)

  const bogus = await rpc(`kwapso_mcp_${"0".repeat(64)}`, "tools/list")
  ok("a token the server never issued is refused", bogus.status === 401, `status ${bogus.status}`)
}

/* ============================================================================ *
 * 5 · The tool catalogue — opt-in, and no way to widen it from the machine side
 * ============================================================================ */

section("the tool catalogue")

const listed = await rpc(SECRET, "tools/list")
const TOOLS = listed.body?.result?.tools ?? []
ok("tools/list returns the catalogue", Array.isArray(TOOLS) && TOOLS.length > 20, `${TOOLS.length} tools`)
ok(
  "every tool carries a name, a description and an input schema",
  TOOLS.length > 0 && TOOLS.every((t) => typeof t.name === "string" && typeof t.description === "string" && typeof t.inputSchema === "object"),
  JSON.stringify(TOOLS.find((t) => !t.inputSchema) ?? {}).slice(0, 160)
)
ok("the catalogue includes whoami", TOOLS.some((t) => t.name === "whoami"))

// No god mode: token management is a HUMAN action from the app. If a tool could
// mint a token, a leaked token could mint itself a fresh one and outlive revocation.
ok("no tool can mint or read access tokens", !TOOLS.some((t) => /token/i.test(t.name)), TOOLS.filter((t) => /token/i.test(t.name)).map((t) => t.name).join(", "))
{
  const asBearer = await fetch(`${BASE}/api/mcp/tokens`, { headers: { Authorization: `Bearer ${SECRET}` } })
  ok("the token itself is refused at the token-management door", asBearer.status === 401, `status ${asBearer.status}`)
}

// The reasoned exclusions (MCP.md): the agent's multi-row mutation tools are
// built around the app's confirm panel, which a headless client does not have.
for (const name of ["bulk_set_help_status", "bulk_set_learning_active", "set_help_status_by_filter"])
  ok(`the blind mass-write tool ${name} is not exposed`, !TOOLS.some((t) => t.name === name))

/* ============================================================================ *
 * 6 · A token acts AS its owner — and never one right above them
 * ============================================================================ */

section("acting as the owner, capped by their role")
{
  const who = await callTool(SECRET, "whoami")
  ok("whoami is the token's owner, not the admin who owns the team", who.data?.user?.email === OWNER_EMAIL, who.text.slice(0, 160))

  const allowed = await callTool(SECRET, "list_learning")
  ok("a tool the role DOES allow works (learning:read)", !allowed.isError && Array.isArray(allowed.data?.learning), allowed.text.slice(0, 160))

  const readDenied = await callTool(SECRET, "list_roles")
  ok("a read the role does NOT allow is refused (member_roles:read)", refused(readDenied), readDenied.text.slice(0, 160))

  // The write probes carry input the door would REJECT at validation (an empty
  // title, a userId that doesn't exist) on purpose: the gate runs before the
  // body is read, so a denial still answers 403 — but on the day a gate breaks,
  // the smoke fails without having created or removed anything real.
  const writeDenied = await callTool(SECRET, "create_role", { title: "" })
  ok("a write the role does NOT allow is refused (member_roles:create)", refused(writeDenied), writeDenied.text.slice(0, 160))

  const removeDenied = await callTool(SECRET, "remove_member", { userId: "no-such-member" })
  ok("removing a member is refused (team_members:delete)", refused(removeDenied), removeDenied.text.slice(0, 160))
}

/* ============================================================================ *
 * 7 · A role change bites the LIVE token, on the very next call
 * ============================================================================ */

section("a role change lands on the live token")

await setProbeRights(GRANTED)
{
  // Same token, no re-mint, and the bridged session cookie is still the cached
  // one — so this can only pass if the DOOR re-reads the role per request.
  const rolesNow = await callTool(SECRET, "list_roles")
  ok("the refused read now works, with no new token", !rolesNow.isError && Array.isArray(rolesNow.data?.roles), rolesNow.text.slice(0, 160))

  const membersNow2 = await callTool(SECRET, "list_members")
  ok("the newly granted team_members:read works too", !membersNow2.isError && Array.isArray(membersNow2.data?.members), membersNow2.text.slice(0, 160))

  // The sharp edge: granting READ must not smuggle in CREATE.
  const stillDenied = await callTool(SECRET, "create_role", { title: "" })
  ok("being granted read did NOT grant create", refused(stillDenied), stillDenied.text.slice(0, 160))
}

/* ============================================================================ *
 * 8 · Pinned to ONE team — while its owner stands in a different one
 * ============================================================================ */

section("pinned to one team")
{
  const who = await callTool(SECRET, "whoami")
  ok("the token still reports the team it was pinned to", who.data?.user?.currentTeamId === TEAM.id, String(who.data?.user?.currentTeamId))
  ok("…not the team its owner is currently signed into", who.data?.user?.currentTeamId !== second.id, String(who.data?.user?.currentTeamId))

  // Data-level, not just an id: the admin is a member of the pinned team and of
  // no other, so seeing them proves which database answered.
  const members = await callTool(SECRET, "list_members")
  const emails = (members.data?.members ?? []).map((m) => m.email)
  ok("the token reads the PINNED team's members", emails.includes(ADMIN_EMAIL), emails.join(", ").slice(0, 160))

  const roles = await callTool(SECRET, "list_roles")
  const titles = (roles.data?.roles ?? []).map((r) => r.title)
  ok("…and the pinned team's roles", titles.includes(PROBE_ROLE), titles.join(", ").slice(0, 160))

  // The owner is Admin in their own team RIGHT NOW. If the token followed the
  // person rather than the pin, this would succeed.
  const escalate = await callTool(SECRET, "create_role", { title: "" })
  ok("the token borrows no rights from its owner's other team", refused(escalate), escalate.text.slice(0, 160))
}

/* ============================================================================ *
 * 9 · R19 — a tool on a list door forwards every filter that door parses
 * ============================================================================ */

section("filter parity (R19)")

/** The list doors both machine surfaces share, read out of the ONE catalog
 * source — never hand-listed here, so a tool added tomorrow is checked too. */
function sharedGetTools() {
  const src = readFileSync(`${REPO}shared/workers/tool-catalog.ts`, "utf8")
  const arr = src.slice(src.indexOf("export const SHARED_TOOLS"))
  const out = []
  for (const [, block] of arr.matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)) {
    const name = /name: "(\w+)"/.exec(block)?.[1]
    const mcpName = /mcpName: "(\w+)"/.exec(block)?.[1]
    const method = /method: "(\w+)"/.exec(block)?.[1]
    const path = /path: "([^"]+)"/.exec(block)?.[1]
    const binding = /binding: "(\w+)"/.exec(block)?.[1]
    if (name && method === "GET" && path && binding) out.push({ name: mcpName ?? name, path, worker: binding === "TENANCY" ? "tenancy" : "content" })
  }
  return out
}

/** The filters a door actually parses, DERIVED from its own handler source
 * (index.ts names the handler for the path; the handler's searchParams.get
 * calls are the truth). Never a hand-kept list — that is how a filter goes
 * missing. Returns null when the derivation fails, which is a failure, not a pass. */
function doorFilters(worker, path) {
  const index = readFileSync(`${REPO}workers/${worker}/src/index.ts`, "utf8")
  const named = new RegExp(`"GET ${path.replaceAll("/", "\\/")}"\\s*:\\s*\\{\\s*handler:\\s*(\\w+)`).exec(index)
  if (!named) return null
  const dir = `${REPO}workers/${worker}/src/routes`
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(`${dir}/${file}`, "utf8")
    const at = src.indexOf(`function ${named[1]}(`)
    if (at === -1) continue
    const next = src.indexOf("\nexport ", at + 1)
    const body = src.slice(at, next === -1 ? undefined : next)
    return [...body.matchAll(/searchParams\.get\("(\w+)"\)/g)].map((m) => m[1])
  }
  return null
}

const listDoors = sharedGetTools()
ok("found the shared list doors to check (the scan must not go blind)", listDoors.length >= 5, `${listDoors.length} found`)

for (const door of listDoors) {
  const filters = doorFilters(door.worker, door.path)
  const tool = TOOLS.find((t) => t.name === door.name)
  if (!tool) {
    ok(`${door.name} is in the DEPLOYED catalogue`, false, `the door ${door.path} has no live tool`)
    continue
  }
  if (filters === null) {
    ok(`${door.name}: could derive its door's filters`, false, `no handler found for GET ${door.path}`)
    continue
  }
  const exposed = Object.keys(tool.inputSchema?.properties ?? {})
  const missing = filters.filter((f) => !exposed.includes(f))
  ok(
    `${door.name} exposes every filter ${door.path} parses (${filters.join(", ") || "none"})`,
    missing.length === 0,
    `missing: ${missing.join(", ")}`
  )
}

// Exposure is half of R19 — a schema can advertise a filter the tool then drops
// on the floor. These prove the DEPLOYED tool actually forwards it.
{
  const all = await callTool(SECRET, "list_roles")
  const rows = all.data?.roles ?? []
  const one = await callTool(SECRET, "list_roles", { id: probeRoleId })
  const got = one.data?.roles ?? []
  ok(
    "list_roles FORWARDS id — one role back, not the whole list",
    rows.length > 1 && got.length === 1 && got[0]?.id === probeRoleId,
    `${rows.length} unfiltered → ${got.length} filtered`
  )

  const everyone = (await callTool(SECRET, "list_members")).data?.members ?? []
  const justMe = (await callTool(SECRET, "list_members", { id: owner.userId })).data?.members ?? []
  ok(
    "list_members FORWARDS id — one member back, not the whole list",
    everyone.length > 1 && justMe.length === 1 && justMe[0]?.userId === owner.userId,
    `${everyone.length} unfiltered → ${justMe.length} filtered`
  )

  // A cursor the server never issued must be REFUSED. A 400 proves the cursor
  // reached the door; a clean page would mean the tool silently dropped it and
  // handed back page one under the guise of page two.
  const forged = await callTool(SECRET, "list_help_tickets", { cursor: "not-a-cursor-the-server-issued" })
  ok("list_help_tickets FORWARDS cursor — a forged one is refused", forged.isError && forged.data?.error === "invalid_cursor", forged.text.slice(0, 160))

  const page = await callTool(SECRET, "list_help_tickets")
  ok(
    "…and an unfiltered page carries the paged contract (total, hasMore, nextCursor)",
    !page.isError && typeof page.data?.total === "number" && typeof page.data?.hasMore === "boolean" && "nextCursor" in (page.data ?? {}),
    page.text.slice(0, 160)
  )
}

/* ============================================================================ *
 * 10 · Taking the rights away lands just as fast
 * ============================================================================ */

section("taking the rights back")

await setProbeRights(BASELINE)
{
  const rolesAgain = await callTool(SECRET, "list_roles")
  ok("the read is refused again on the next call", refused(rolesAgain), rolesAgain.text.slice(0, 160))

  const membersAgain = await callTool(SECRET, "list_members")
  ok("…and so is the members read", refused(membersAgain), membersAgain.text.slice(0, 160))

  const stillWorks = await callTool(SECRET, "list_learning")
  ok("the right the role kept still works (no over-revoking)", !stillWorks.isError && Array.isArray(stillWorks.data?.learning), stillWorks.text.slice(0, 160))
}

/* ============================================================================ *
 * 11 · Revocation is immediate and total
 * ============================================================================ */

section("revocation")
{
  const revoked = await api("/api/mcp/tokens/revoke", { method: "POST", body: JSON.stringify({ id: tokenId }) }, ownerCookie)
  ok("the owner revoked their own token", revoked.res.ok, JSON.stringify(revoked.body))

  const list = await rpc(SECRET, "tools/list")
  ok("a revoked token cannot list tools", list.status === 401, `status ${list.status}`)

  const call = await callTool(SECRET, "whoami")
  ok("a revoked token cannot call a tool", call.status === 401, `status ${call.status}`)

  // The bridged session it was using is still inside its 60-minute life — the
  // token is re-verified per request, so that doesn't buy it anything.
  const init = await rpc(SECRET, "initialize")
  ok("a revoked token cannot even re-initialize", init.status === 401, `status ${init.status}`)
}

/* ============================================================================ *
 * 12 · Leave the world as we found it
 * ============================================================================ */

await api("/api/tenancy/switch-team", { method: "POST", body: JSON.stringify({ teamId: TEAM.id }) }, ownerCookie)
await api("/api/auth/logout", { method: "POST" }, ownerCookie)
await api("/api/auth/logout", { method: "POST" }, adminCookie)

console.log(failures ? `\nMCP SMOKE FAILED (${failures})` : "\nMCP SMOKE PASSED")
process.exit(failures ? 1 : 0)
