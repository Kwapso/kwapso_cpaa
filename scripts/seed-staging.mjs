// seed-staging — fill the staging sandbox with the agency's OWN history, so the
// app reads as though somebody has been using it for two years.
//
//   node scripts/glide-transform.mjs          # writes glide/normalised.json
//   node scripts/seed-staging.mjs staging
//
// THREE RULES THIS SCRIPT LIVES BY.
//
// 1. IT WRITES THROUGH THE FRONT DOOR. Every row below is created by a real HTTP
//    call to a real gated endpoint, signed in as a real person — never by
//    touching D1. That is the whole point: seeding this way proves the doors
//    work, exercises the permission spine, and leaves genuine activity rows and
//    live pings behind, exactly as a person clicking would.
// 2. IT IS IDEMPOTENT. Every record is matched on a stable natural key first
//    (a company's name, a person's email, an article's title, a request's
//    description) and skipped when it is already there. Run it twice and the
//    second run creates nothing.
// 3. IT CHECKS THE FENCE FROM THE OUTSIDE. A seed that writes rows the fence
//    would never allow is worse than no seed — it makes a leak look like normal
//    data. So the last thing it does is sign in AS a client login and prove it
//    sees its own company's world and nothing from any other one.
//
// TWO THINGS THIS SCRIPT CANNOT DO, SAID OUT LOUD RATHER THAN FUDGED.
//
// • EVERY ROW IS CREATED TODAY. No door in the base accepts a timestamp — every
//   `created_at` is stamped server-side at the write (that is what makes the
//   audit trail worth reading). So two years of history arrives dated this
//   afternoon. The real dates are all in glide/normalised.json; nothing is lost,
//   it simply is not reachable through the front door. See HISTORY below.
// • THE AUTHOR OF A SEEDED REQUEST IS WHOEVER SEEDED IT, for the same reason:
//   the actor comes from the session, never from the body. The real reporter's
//   address is carried in normalised.json beside each request.
//
// AND ONE IT WILL NOT DO: EMAIL A REAL CLIENT. Inviting somebody sends them a
// real message, so `ownInbox` below refuses any address that is not the owner's
// own — the client logins are plus-addressed variants of it, attached to real
// companies as real contacts. Real contacts are seeded as records, never as
// logins.
//
// STAGING ONLY. SCOPE ch.13: production is deliberately empty and parked, and it
// refuses the test-login door outright (auth's ENVIRONMENT check), so this
// script cannot sign anyone in there even if you insist.
//
// Needs TEST_LOGIN_KEY and ADMIN_KEY in the environment (they live in
// ~/.config/kwapso/keys.env — export them, never paste them):
//   TEST_LOGIN_KEY=… ADMIN_KEY=… node scripts/seed-staging.mjs staging

import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeApi, timedFetch } from "./lib/api.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// ── where, and may we ────────────────────────────────────────────────────────

const TARGETS = {
  staging: { base: "https://agency-staging.kwapso.app", label: "staging" },
  production: { base: "https://agency.kwapso.app", label: "PRODUCTION" },
}

const target = process.argv[2]
const confirmed = process.argv.includes("--confirm-production")
const dryRun = process.argv.includes("--dry-run")
if (!TARGETS[target]) {
  console.error("Usage: node scripts/seed-staging.mjs <staging|production> [--dry-run] [--confirm-production]")
  process.exit(2)
}
if (target === "production" && !confirmed) {
  console.error(
    "Refusing to seed production. It is deliberately empty and parked — real client\n" +
      "accounts are only ever invited there, never imported. Pass --confirm-production\n" +
      "if you truly mean it (the sign-in door will still refuse: auth turns the\n" +
      "test-login door off when ENVIRONMENT is production)."
  )
  process.exit(2)
}
if (target === "production") {
  console.log(
    "\nWARNING — the target is PRODUCTION, which is meant to stay empty. Continuing\n" +
      "because you asked, but expect the sign-in door to refuse.\n"
  )
}

const BASE = process.env.SEED_BASE ?? TARGETS[target].base
const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
const ADMIN_KEY = process.env.ADMIN_KEY ?? ""
if (!TEST_LOGIN_KEY && !dryRun) {
  console.error("No TEST_LOGIN_KEY in the environment — the seed can't sign anyone in.")
  process.exit(1)
}

// ── the history, already normalised ──────────────────────────────────────────

const SOURCE = resolve(ROOT, "glide/normalised.json")
if (!existsSync(SOURCE)) {
  console.error(
    `No ${SOURCE}.\nRun \`node scripts/glide-transform.mjs\` first — it turns the pulled Glide rows\ninto the shape this seed writes.`
  )
  process.exit(1)
}
const history = JSON.parse(readFileSync(SOURCE, "utf8"))

const TEAM_NAME = "Kwapso"
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "alaap@swiftstruck.com"
const OWNER_NAME = { firstName: "Alaap", lastName: "Kanchwala" }

// ── how much, and why that much ──────────────────────────────────────────────
//
// R14's premise is that every read states its cap, and a seed is the thing most
// likely to walk a screen into one. Every collection below is well inside
// LIST_HARD_CAP (1,000); the two that would blow past it are cut here, on
// purpose, with the reason written down. "Lived-in" is the goal, not "complete"
// — the complete history is in normalised.json and imports through the agentic
// importer when the modules that can hold it exist.

/** Every company and every person: 123 rows, three pages of fifty. Enough to
 * exercise paging, nowhere near the cap. */
const ACCOUNT_LIMIT = 1000

/** Requests. 1,820 in the history; 220 here — four pages, every company with
 * work on it, both languages, open and resolved side by side. Seeding all 1,820
 * would be 1,820 round trips to prove a point three pages already make. */
const HELP_LIMIT = 220

/** Replies carried onto a seeded request. THREAD_HARD_CAP is 500; a real
 * conversation here is two or three messages. */
const REPLIES_PER_REQUEST = 6

/** Articles. 223 in the history, most of them a title and a hashtag list; the 40
 * newest with a body are what makes the learning screen look written-in. */
const ARTICLE_LIMIT = 40

// ── the client logins ────────────────────────────────────────────────────────
//
// Real contacts are seeded as RECORDS. They are never given a login, because
// granting one means inviting them, and inviting them means sending a real
// person a real email from a staging environment they never asked to be in.
//
// So the portal is demonstrated by the owner's own inbox, plus-addressed, held
// as an ordinary contact of a real company. Two of them, on two different
// companies, so "can A see B" has an answer — and the first is a contact of a
// second company as well, which is the only way to exercise the switcher.

const PORTAL_TESTERS = [
  {
    email: `${OWNER_EMAIL.split("@")[0]}+client@${OWNER_EMAIL.split("@")[1]}`,
    name: "Alaap Kanchwala (portal test 1)",
    firstName: "Alaap",
    lastName: "Kanchwala",
    companies: ["Confia", "Amstella"],
  },
  {
    email: `${OWNER_EMAIL.split("@")[0]}+client2@${OWNER_EMAIL.split("@")[1]}`,
    name: "Alaap Kanchwala (portal test 2)",
    firstName: "Alaap",
    lastName: "Kanchwala",
    companies: ["Padelbase"],
  },
]

const CLIENT_ROLE = {
  title: "Client",
  description:
    "A client login. Sees their own company's people and its requests — every request their colleagues raise, not only their own — and nothing else.",
  // Anything not named here is off. A client never touches members, roles, the
  // AI agent, or anyone else's records.
  //
  // `learning` and `selectable_data` are DELIBERATELY still granted even though
  // every one of those doors now refuses a client login outright (d7512f1). They
  // are not a leftover: a real owner building their own client role would plausibly
  // tick them, so leaving them on makes this seeded client the WORST CASE — a
  // caller holding rights the doors must refuse on grounds other than the role.
  // R21's enumeration reads these rights to decide which doors to walk, so taking
  // them away would quietly stop the check testing the very doors that were leaking
  // a week ago. The defence must not depend on how carefully the role was built.
  rights: {
    teams: { read: true },
    accounts: { read: true },
    portal_users: { read: true },
    learning: { read: true },
    help: { read: true, create: true },
    selectable_data: { read: true },
  },
}

/** The one request raised by US about our own work, on no client's account. The
 * fence check asserts no client login can see it, and reads it from here so the
 * two can never drift apart. */
const OURS = {
  helpType: "Request",
  description: "Kwapso: check the account screens on a phone before the next client demo.",
}

/** THE RAIL THAT KEEPS THIS SCRIPT OUT OF A CLIENT'S INBOX. Signing somebody in
 * creates them; inviting them EMAILS them. Both are refused for any address that
 * is not the owner's own or a plus-addressed variant of it. The history holds 96
 * real client addresses — one careless edit away from being mailed by a sandbox,
 * which is exactly the kind of mistake a guard should make impossible rather
 * than a comment should discourage. */
const [OWNER_LOCAL, OWNER_DOMAIN] = OWNER_EMAIL.toLowerCase().split("@")
const ownInbox = (email) => {
  // Split, don't pattern-match: `startsWith("alaap+") && endsWith("@swiftstruck.com")`
  // also says yes to alaap+x@somewhere-else.com@swiftstruck.com. The address has
  // to have exactly one @, the domain has to BE the owner's, and the local part
  // has to be theirs or a plus-address of theirs.
  const parts = String(email ?? "").toLowerCase().split("@")
  if (parts.length !== 2) return false
  const [local, domain] = parts
  return domain === OWNER_DOMAIN && (local === OWNER_LOCAL || local.startsWith(`${OWNER_LOCAL}+`))
}

// ── the plumbing ─────────────────────────────────────────────────────────────

let changed = 0
let reused = 0
let failures = 0
const tally = {}
const count = (kind, verb) => {
  const t = (tally[kind] ??= { created: 0, reused: 0, updated: 0 })
  t[verb] = (t[verb] ?? 0) + 1
}

/** One line per record, in the same shape every time. Anything but "reused" is a
 * write, and a second run should print none of those — that is the idempotency
 * claim, said out loud. Bulk sections report a total instead of 220 lines. */
const say = (verb, what, kind) => {
  if (verb === "reused") reused++
  else changed++
  if (kind) count(kind, verb)
  else console.log(`  ${verb.padEnd(7)} ${what}`)
}
const step = (title) => console.log(`\n${title}`)
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`)
  if (!ok) failures++
}

const api = makeApi(BASE)
const post = (path, payload, cookie) => api(path, { method: "POST", body: JSON.stringify(payload ?? {}) }, cookie)

/** Stop the whole run rather than seed half a world — a partly-seeded sandbox is
 * harder to reason about than an empty one. */
function must(result, what) {
  if (!result.ok) {
    console.error(`\nStopped: ${what} — ${result.status} ${result.body?.message ?? ""}`)
    process.exit(1)
  }
  return result.body
}

/** Sign someone in the way the smoke does: mint a code through the staging-only
 * admin door (its own key, refused on production), then spend it at the normal
 * verify door. No code is ever echoed by the real send path, in any environment. */
async function signIn(email, profile) {
  if (!ownInbox(email)) {
    console.error(`\nStopped: refusing to sign in as ${email} — it is not the owner's own inbox.`)
    process.exit(1)
  }
  const start = await api("/api/auth/admin/test-login", {
    method: "POST",
    headers: { "x-admin-key": TEST_LOGIN_KEY },
    body: JSON.stringify({ email }),
  })
  if (!start.ok) {
    console.error(
      `\nStopped: couldn't mint a login code for ${email} — ${start.status} ${start.body?.message ?? ""}` +
        (target === "production" ? "\n(production refuses this door by design.)" : "")
    )
    process.exit(1)
  }
  // Raw (not api()) because this one needs the set-cookie header off the Response.
  const verify = await timedFetch(`${BASE}/api/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: start.body.code }),
  })
  const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
  if (!verify.ok || !cookie.startsWith("kwapso_session=")) {
    console.error(`\nStopped: ${email} couldn't sign in (${verify.status}).`)
    process.exit(1)
  }
  // Onboarding only if it hasn't happened — never overwrite a real person's name.
  const me = await api("/api/auth/me", {}, cookie)
  if (me.body?.user?.onboardingComplete !== true) {
    must(await post("/api/auth/profile", profile, cookie), `saving ${email}'s name`)
  }
  return { cookie, userId: me.body?.user?.id ?? null }
}

/** Walk every page of a keyset-paged read. */
async function allPages(path, key, cookie) {
  const rows = []
  let cursor = null
  for (let page = 0; page < 25; page++) {
    const sep = path.includes("?") ? "&" : "?"
    const url = cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path
    const body = must(await api(url, {}, cookie), `reading ${path}`)
    rows.push(...(body[key] ?? []))
    if (!body.hasMore || !body.nextCursor) return rows
    cursor = body.nextCursor
  }
  // A SHORT READ MUST NOT LOOK LIKE A COMPLETE ONE. This feeds the fence checks
  // at the end, and those are NEGATIVES: "this client cannot see that company".
  // A truncated read makes a negative pass for the wrong reason and prints "the
  // fence holds" — the one line in this script worth more than every "created"
  // line above it. So stopping early is a failure, loudly.
  throw new Error(`${path}: more than 25 pages — refusing to report a partial read as complete`)
}

// ── what gets seeded, chosen from the history ────────────────────────────────

const companies = history.accounts.filter((a) => a.kind === "entity").slice(0, ACCOUNT_LIMIT)
const companyByGlideId = new Map(companies.map((c) => [c.glideId, c]))
const people = history.accounts
  .filter((a) => a.kind === "individual")
  .slice(0, Math.max(0, ACCOUNT_LIMIT - companies.length))
const peopleGlideIds = new Set(people.map((p) => p.glideId))
const links = history.accountLinks.filter((l) => companyByGlideId.has(l.accountGlideId) && peopleGlideIds.has(l.personGlideId))

/** Round-robin by company, so the cut leaves every company with work on it
 * instead of handing the whole budget to the busiest one — and inside each
 * company, the requests somebody actually ANSWERED come first. A screen full of
 * unanswered one-liners is a seeded screen; a thread that goes back and forth is
 * what "lived-in" means. Newest first within each of those two groups. */
function spreadAcrossCompanies(requests, limit) {
  const queues = new Map()
  const rank = (r) =>
    `${r.replies.length ? "0" : "1"}${String(9999999999999 - Date.parse(r.createdAt ?? 0)).padStart(14, "0")}`
  for (const r of [...requests].sort((a, b) => rank(a).localeCompare(rank(b)))) {
    const key = r.accountGlideId ?? "(none)"
    if (!queues.has(key)) queues.set(key, [])
    queues.get(key).push(r)
  }
  const picked = []
  const seenDescription = new Set()
  for (let round = 0; picked.length < limit; round++) {
    let anyLeft = false
    for (const queue of queues.values()) {
      const r = queue[round]
      if (!r) continue
      anyLeft = true
      // The description IS the natural key, so two requests that share one would
      // make the second look like a row that already exists.
      if (seenDescription.has(r.description)) continue
      seenDescription.add(r.description)
      picked.push(r)
      if (picked.length >= limit) break
    }
    if (!anyLeft) break
  }
  return picked
}

const requests = spreadAcrossCompanies(
  history.helpRequests.filter((r) => r.description),
  HELP_LIMIT
)
const articles = history.learning
  .filter((a) => a.body)
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  .slice(0, ARTICLE_LIMIT)

if (dryRun) {
  const byCompany = {}
  for (const r of requests) byCompany[companyByGlideId.get(r.accountGlideId)?.name ?? "(no company)"] = (byCompany[companyByGlideId.get(r.accountGlideId)?.name ?? "(no company)"] ?? 0) + 1
  console.log(`\nDry run — nothing was written. From ${SOURCE}, this seed would create:\n`)
  console.log(`  ${String(companies.length).padStart(4)} companies (entity accounts)`)
  console.log(`  ${String(people.length).padStart(4)} people (individual accounts)`)
  console.log(`  ${String(links.length).padStart(4)} contact links`)
  console.log(`  ${String(PORTAL_TESTERS.length).padStart(4)} client logins, on ${[...new Set(PORTAL_TESTERS.flatMap((p) => p.companies))].join(", ")}`)
  console.log(`  ${String(history.selectableData.length).padStart(4)} dropdown values`)
  console.log(`  ${String(articles.length).padStart(4)} learning articles (of ${history.learning.length} in the history, ${history.learning.filter((a) => a.body).length} with a body)`)
  console.log(`  ${String(requests.length + 1).padStart(4)} help requests (of ${history.helpRequests.length}), including one of our own`)
  console.log(`  ${String(requests.reduce((n, r) => n + Math.min(r.replies.length, REPLIES_PER_REQUEST), 0)).padStart(4)} replies on them`)
  console.log(`  ${String(requests.filter((r) => r.resolved).length).padStart(4)} of those requests then moved to resolved`)
  console.log(`\n  requests per company: ${Object.entries(byCompany).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`)
  console.log(`  languages: ${requests.filter((r) => r.language === "de").length} German only, ${requests.filter((r) => r.language === "both").length} both, ${requests.filter((r) => r.language === "en").length} English only`)
  console.log(`\n  every row will be stamped created_at = now; the real dates stay in ${SOURCE}.`)
  process.exit(0)
}

// ── 1 · the agency side: a signed-in owner, standing in the team ─────────────

console.log(`\nSeeding kwapso's own history on ${TARGETS[target].label} (${BASE})`)
console.log(`from ${SOURCE}, pulled from Glide`)

step("Signing in")
const staff = await signIn(OWNER_EMAIL, OWNER_NAME)
console.log(`  as      ${OWNER_EMAIL}, on the agency side`)

step("The team")
let teams = must(await api("/api/tenancy/teams", {}, staff.cookie), "reading your teams").teams ?? []
let team = teams.find((t) => t.name === TEAM_NAME)
if (!team) {
  // Team creation is closed on every user-facing door (shared/product.ts), so a
  // fresh environment gets its first team through the maintenance door — the one
  // that takes the deployment's ADMIN_KEY and names the owner outright.
  if (!ADMIN_KEY) {
    console.error(
      `\nStopped: there is no team called "${TEAM_NAME}" yet and ADMIN_KEY isn't in the\n` +
        "environment. The user-facing create-a-team door is closed by design, so the\n" +
        "first team has to come through the maintenance door. Export ADMIN_KEY and rerun."
    )
    process.exit(1)
  }
  must(
    await api("/api/tenancy/admin/create-team", {
      method: "POST",
      headers: { "x-admin-key": ADMIN_KEY },
      body: JSON.stringify({ name: TEAM_NAME, email: OWNER_EMAIL }),
    }),
    "creating the team"
  )
  teams = must(await api("/api/tenancy/teams", {}, staff.cookie), "re-reading your teams").teams ?? []
  team = teams.find((t) => t.name === TEAM_NAME)
  say("created", `team "${TEAM_NAME}"`)
} else {
  say("reused", `team "${TEAM_NAME}"`)
}
must(await post("/api/tenancy/switch-team", { teamId: team.id }, staff.cookie), "switching to the team")
const TEAM_ID = team.id

// ── 2 · the Client role ──────────────────────────────────────────────────────

step("Roles")
const roles = must(await api("/api/tenancy/roles", {}, staff.cookie), "reading roles").roles ?? []
let clientRole = roles.find((r) => r.title === CLIENT_ROLE.title)
if (!clientRole) {
  const after = must(
    await post(
      "/api/tenancy/roles",
      { title: CLIENT_ROLE.title, description: CLIENT_ROLE.description, permissions: CLIENT_ROLE.rights },
      staff.cookie
    ),
    "creating the Client role"
  )
  clientRole = (after.roles ?? []).find((r) => r.title === CLIENT_ROLE.title)
  say("created", `role "${CLIENT_ROLE.title}" — a client login's rights`)
} else {
  // Compare before writing: saving a matrix always writes a history row, so a
  // blind re-save would make every run look like a change nobody made.
  const current = must(
    await api(`/api/tenancy/roles/permissions?roleId=${clientRole.id}`, {}, staff.cookie),
    "reading the Client role's rights"
  ).value
  const wanted = (module, right) => CLIENT_ROLE.rights[module]?.[right] === true
  const drifted = Object.keys(current).some((module) =>
    ["read", "create", "edit", "delete"].some(
      // "any write needs read" is applied by the server, so mirror it here.
      (right) =>
        current[module][right] !==
        (right === "read"
          ? wanted(module, "read") || wanted(module, "create") || wanted(module, "edit") || wanted(module, "delete")
          : wanted(module, right))
    )
  )
  if (drifted) {
    must(
      await post("/api/tenancy/roles/permissions", { roleId: clientRole.id, value: CLIENT_ROLE.rights }, staff.cookie),
      "resetting the Client role's rights"
    )
    say("updated", `role "${CLIENT_ROLE.title}" — rights put back to the seeded set`)
  } else {
    say("reused", `role "${CLIENT_ROLE.title}"`)
  }
}

// ── 3 · the dropdown vocabulary the agency already used ──────────────────────

step("Dropdown values")
let dropdowns = must(await api("/api/tenancy/selectable", {}, staff.cookie), "reading dropdown values").values ?? []
for (const d of history.selectableData) {
  if (dropdowns.some((v) => v.type === d.type && v.value === d.value && v.active)) {
    say("reused", `${d.type} → ${d.value}`, "dropdown values")
    continue
  }
  dropdowns = must(await post("/api/tenancy/selectable", d, staff.cookie), `adding ${d.value}`).values ?? dropdowns
  say("created", `${d.type} → ${d.value}`, "dropdown values")
}

// ── 4 · learning articles ────────────────────────────────────────────────────

step("Learning")
let existingArticles = must(await api("/api/content/learning", {}, staff.cookie), "reading learning").learning ?? []
const articleTitles = new Set(existingArticles.map((l) => l.title))
for (const a of articles) {
  if (articleTitles.has(a.title)) {
    say("reused", `article "${a.title}"`, "learning articles")
    continue
  }
  must(
    await post(
      "/api/content/learning",
      {
        title: a.title,
        // Pick-or-create: the door adds the category as a Learning category
        // value the first time it meets one, so the vocabulary follows the
        // content instead of being typed in ahead of it.
        category: a.category ?? undefined,
        contentType: a.contentType ?? undefined,
        contentLink: a.contentLink ?? undefined,
        body: a.body ?? undefined,
      },
      staff.cookie
    ),
    `adding "${a.title}"`
  )
  articleTitles.add(a.title)
  say("created", `article "${a.title}"`, "learning articles")
}

// ── 5 · accounts: the companies, their people, and who is a contact of whom ──

step("Accounts")
/** Every account this team holds, keyed the three ways the seed matches on.
 * Read ONCE — a re-read after every create is 123 extra page walks, and the
 * create door hands back the id anyway. */
const byKey = new Map() // "entity|name" → id
const byEmail = new Map() // "individual|address" → id — KIND-SCOPED, see mailKey
const byId = new Map()

const keyOf = (kind, name) => `${kind}|${name.trim().toLowerCase()}`

/** AN ADDRESS IDENTIFIES A PERSON. IT DOES NOT IDENTIFY AN ACCOUNT.
 *
 * Six of the agency's twenty companies carry the same address as one of their own
 * people — the company's contact email IS the main contact's inbox, which is
 * completely ordinary for a business this size. Keyed on the address alone, this
 * seed created the company, then looked for the person, found the COMPANY, and
 * handed back its id. The contact link then had the same account at both ends and
 * the door refused it: "An account can't be its own contact." The door was right;
 * the key was wrong.
 *
 * So the kind is part of the key. A company record and a person record are two
 * different accounts however they are reached, and the seed must not quietly
 * merge them. (Also lower-cases and trims on BOTH sides — it used to store
 * lower-case and look up raw, so a capitalised address matched nothing and
 * created a duplicate on the second run.) */
const mailKey = (kind, email) => `${kind}|${String(email).trim().toLowerCase()}`

for (const a of await allPages("/api/tenancy/accounts", "accounts", staff.cookie)) {
  byKey.set(keyOf(a.accountType, a.name), a.id)
  if (a.email) byEmail.set(mailKey(a.accountType, a.email), a.id)
  byId.set(a.id, a)
}

/** A person is found by their address first (the identity), by name second (the
 * eight contacts whose email column holds a placeholder) — both within their own
 * kind, never across it. */
const findAccount = (row) =>
  (row.email && byEmail.get(mailKey(row.kind, row.email))) ||
  byKey.get(keyOf(row.kind, row.name)) ||
  null

const idFor = new Map() // glideId → the account id in this app

for (const c of companies) {
  const existing = findAccount(c)
  if (existing) {
    idFor.set(c.glideId, existing)
    say("reused", c.name, "companies")
    continue
  }
  const { id } = must(
    await post(
      "/api/tenancy/accounts",
      {
        accountType: "entity",
        name: c.name,
        code: c.code ?? undefined,
        status: c.status ?? undefined,
        email: c.email ?? undefined,
        phone: c.phone ?? undefined,
        address: c.address ?? undefined,
        locale: c.locale ?? undefined,
      },
      staff.cookie
    ),
    `creating ${c.name}`
  )
  idFor.set(c.glideId, id)
  byKey.set(keyOf("entity", c.name), id)
  if (c.email) byEmail.set(mailKey("entity", c.email), id)
  say("created", c.name, "companies")
}

step("Contacts")
for (const p of people) {
  const existing = findAccount(p)
  if (existing) {
    idFor.set(p.glideId, existing)
    say("reused", p.name, "people")
    continue
  }
  const { id } = must(
    await post(
      "/api/tenancy/accounts",
      {
        accountType: "individual",
        name: p.name,
        email: p.email ?? undefined,
        phone: p.phone ?? undefined,
        // ONE parent, so only somebody who belongs to exactly one company gets
        // the pointer; anyone on two is held by the links below, which is what
        // that table is for.
        parentAccountId: p.parentGlideId ? idFor.get(p.parentGlideId) : undefined,
      },
      staff.cookie
    ),
    `creating ${p.name}`
  )
  idFor.set(p.glideId, id)
  byKey.set(keyOf("individual", p.name), id)
  if (p.email) byEmail.set(mailKey("individual", p.email), id)
  say("created", p.name, "people")
}

step("Contact links")
/** One read per company rather than one per link. */
const linksByCompany = new Map()
for (const l of links) {
  if (!linksByCompany.has(l.accountGlideId)) linksByCompany.set(l.accountGlideId, [])
  linksByCompany.get(l.accountGlideId).push(l)
}
for (const [companyGlideId, companyLinks] of linksByCompany) {
  const companyId = idFor.get(companyGlideId)
  const detail = must(await api(`/api/tenancy/accounts/detail?id=${companyId}`, {}, staff.cookie), "reading a company")
  const linked = new Set((detail.links ?? []).filter((l) => l.active).map((l) => l.personAccountId))
  for (const l of companyLinks) {
    const personId = idFor.get(l.personGlideId)
    if (!personId) continue
    if (linked.has(personId)) {
      say("reused", "a contact link", "contact links")
      continue
    }
    must(
      await post(
        "/api/tenancy/accounts/links",
        {
          accountId: companyId,
          personAccountId: personId,
          relationship: l.relationship ?? undefined,
          isMainStakeholder: l.isMainStakeholder === true,
        },
        staff.cookie
      ),
      "linking a contact to a company"
    )
    linked.add(personId)
    say("created", "a contact link", "contact links")
  }
}

// ── 6 · client logins, then team membership — in that order ──────────────────
//
// The order is not a preference. A login is granted to somebody who is NOT yet a
// team member (the grant door refuses to turn staff into a client), and the
// person can only reach any door once they ARE a member holding the Client role.
// So: sign them in so they exist → grant the login → invite → they accept.

step("Client logins")
const sessions = new Map() // email → { cookie, userId }
for (const t of PORTAL_TESTERS) {
  const homeCompanyId = idFor.get(companies.find((c) => c.name === t.companies[0])?.glideId)
  if (!homeCompanyId) {
    console.error(`\nStopped: the history has no company called "${t.companies[0]}" to attach a client login to.`)
    process.exit(1)
  }

  // The tester is an ordinary contact of a real company, held exactly like any
  // other contact — the portal is a view of the same rows, so a login has to
  // hang off a row that was already there.
  let personId = byEmail.get(mailKey("individual", t.email))
  if (!personId) {
    const created = must(
      await post("/api/tenancy/accounts", { accountType: "individual", name: t.name, email: t.email }, staff.cookie),
      `creating ${t.name}`
    )
    personId = created.id
    byEmail.set(mailKey("individual", t.email), personId)
    say("created", `${t.name}, a contact of ${t.companies.join(" and ")}`)
  } else {
    say("reused", `${t.name}`)
  }

  for (const companyName of t.companies) {
    const companyId = idFor.get(companies.find((c) => c.name === companyName)?.glideId)
    const detail = must(await api(`/api/tenancy/accounts/detail?id=${companyId}`, {}, staff.cookie), "reading a company")
    if ((detail.links ?? []).some((l) => l.personAccountId === personId && l.active)) {
      say("reused", `${t.name} is a contact of ${companyName}`)
      continue
    }
    must(
      await post(
        "/api/tenancy/accounts/links",
        { accountId: companyId, personAccountId: personId, relationship: "Portal test login", isMainStakeholder: false },
        staff.cookie
      ),
      `linking ${t.name} to ${companyName}`
    )
    say("created", `${t.name} is a contact of ${companyName}`)
  }

  // Signing in is what puts them in the platform's user list; the grant door
  // looks them up by the email on their contact record, never by a typed-in id.
  const session = await signIn(t.email, { firstName: t.firstName, lastName: t.lastName })
  sessions.set(t.email, session)

  const logins = must(await api("/api/tenancy/portal-users", {}, staff.cookie), "reading client logins").portalUsers ?? []
  if (logins.some((l) => l.accountId === personId && l.active)) {
    say("reused", `client login for ${t.name}`)
  } else {
    must(
      // `accountId` is the COMPANY the grant is made ON — it is fence-checked and
      // named in the activity row. `personAccountId` is the PERSON, and it is
      // what portal_users.account_id actually holds. Passing a company as the
      // person is the mistake the door refuses outright, because it would widen
      // the fence to every sibling under that company's parent.
      await post("/api/tenancy/portal-users", { accountId: homeCompanyId, personAccountId: personId }, staff.cookie),
      `granting a client login to ${t.name}`
    )
    say("created", `client login for ${t.name}, granted on ${t.companies[0]}`)
  }

  const members = must(await api("/api/tenancy/members", {}, staff.cookie), "reading members").members ?? []
  if (members.some((m) => m.email?.toLowerCase() === t.email)) {
    say("reused", `${t.name} is on the team as ${CLIENT_ROLE.title}`)
    continue
  }
  const invites = must(await api("/api/tenancy/invites", {}, staff.cookie), "reading invites").invites ?? []
  if (!invites.some((i) => i.email?.toLowerCase() === t.email && i.status === "pending")) {
    if (!ownInbox(t.email)) {
      console.error(`\nStopped: refusing to invite ${t.email} — inviting sends a real email.`)
      process.exit(1)
    }
    must(await post("/api/tenancy/invites", { email: t.email, roleId: clientRole.id }, staff.cookie), `inviting ${t.name}`)
    say("created", `invite for ${t.name} as ${CLIENT_ROLE.title}`)
  }
  // Onboarding accepts every pending invite — the same door a real person walks
  // through after clicking the link in their email.
  must(await post("/api/tenancy/bootstrap", {}, session.cookie), `${t.name} joining the team`)
  const joined = must(await api("/api/tenancy/members", {}, staff.cookie), "re-reading members").members ?? []
  if (!joined.some((m) => m.email?.toLowerCase() === t.email)) {
    console.error(`\nStopped: ${t.name} didn't join the team — their invite may already be spent.`)
    process.exit(1)
  }
  say("created", `${t.name} joined the team as ${CLIENT_ROLE.title}`)
}

// ── 7 · the requests, and what happened to each of them ──────────────────────
//
// Raised, then answered, then closed — in that order, through the doors that do
// each of those things. The activity trail is what FOLLOWS from that; no row is
// written into the feed directly, because a feed you can write to directly is a
// feed that can say something that never happened.

step("Help requests")
const ticketsFor = (cookie) => allPages("/api/content/help?scope=all", "tickets", cookie)
const existing = new Map()
for (const t of await ticketsFor(staff.cookie)) existing.set(t.description, t)

/** The company each seeded request belongs to, so the fence checks below can ask
 * "may this login see THAT company's request" without guessing. */
const requestCompany = new Map() // description → company glide id

/** Requests on a tester's own company are raised BY that tester, so the portal
 * has rows a client authored. The rest are raised by us, which is also true to
 * life: most of this history was typed in by the agency on the client's behalf. */
const raisedBy = new Map() // description → session
for (const t of PORTAL_TESTERS) {
  const home = companies.find((c) => c.name === t.companies[0])?.glideId
  const theirs = requests.filter((r) => r.accountGlideId === home).slice(0, 3)
  for (const r of theirs) raisedBy.set(r.description, sessions.get(t.email))
}

const all = [...requests, { ...OURS, accountGlideId: null, replies: [], resolved: false }]
for (const r of all) {
  const raiser = raisedBy.get(r.description) ?? staff
  requestCompany.set(r.description, r.accountGlideId ?? null)

  let ticket = existing.get(r.description)
  if (ticket) {
    // BACKFILL. An earlier run wrote these before the door could be told which
    // client a staff-raised request was FOR, so 220 of them belonged to nobody
    // and no client could see their own history. Idempotence means "converge on
    // the right row", not "never touch it again" — a run that leaves a known-
    // wrong row alone is not idempotent, it is stuck.
    const wants = r.accountGlideId ? idFor.get(r.accountGlideId) : null
    if (wants && !ticket.accountId) {
      must(
        await post(
          "/api/content/help/update",
          { id: ticket.id, description: r.description, helpType: r.helpType ?? undefined, accountId: wants },
          staff.cookie
        ),
        "naming the client on a request that had none"
      )
      say("named the client on", "a request", "help requests")
    } else {
      say("reused", "a request", "help requests")
    }
  } else {
    const page = must(
      await post(
        "/api/content/help",
        {
          description: r.description,
          helpType: r.helpType ?? undefined,
          // WHO IT IS FOR. This is the account fence's own column, and it is why
          // the client's colleagues can see a request the agency typed in for
          // them. The door ignores it for a portal caller (theirs comes from the
          // guard corridor) and proves it is a live account for anyone else.
          accountId: r.accountGlideId ? idFor.get(r.accountGlideId) : undefined,
          // What the request is ABOUT — the record it was raised against. A
          // display link, not a fence: the two were conflated once, and 220
          // staff-raised requests belonged to nobody as a result.
          sourceRelatedTable: r.accountGlideId ? "accounts" : undefined,
          sourceRelatedRowId: r.accountGlideId ? idFor.get(r.accountGlideId) : undefined,
          sourceScreen: r.accountGlideId ? companyByGlideId.get(r.accountGlideId)?.name : undefined,
        },
        raiser.cookie
      ),
      "raising a request"
    )
    // The create door answers with the first page, newest first, so the row it
    // just wrote is on it.
    ticket = (page.tickets ?? []).find((x) => x.description === r.description)
    if (!ticket) {
      console.error(`\nStopped: raised a request but couldn't find it again — "${r.description.slice(0, 60)}"`)
      process.exit(1)
    }
    existing.set(r.description, ticket)
    say("created", "a request", "help requests")
  }

  // The conversation, in the order it happened.
  const wanted = (r.replies ?? []).slice(0, REPLIES_PER_REQUEST)
  if (wanted.length) {
    const thread = must(await api(`/api/content/help/thread?id=${ticket.id}`, {}, staff.cookie), "reading a conversation")
      .replies ?? []
    const already = new Set(thread.map((x) => x.body))
    for (const reply of wanted) {
      if (already.has(reply.body)) {
        say("reused", "a reply", "replies")
        continue
      }
      must(await post("/api/content/help/reply", { helpId: ticket.id, body: reply.body }, staff.cookie), "replying")
      say("created", "a reply", "replies")
    }
  }

  // Closed last, so the trail reads raised → answered → resolved. Idempotent on
  // the server (the current status rides the UPDATE), but read first so the run
  // reports honestly rather than claiming a move it did not make.
  if (r.resolved && ticket.status !== "resolved") {
    must(await post("/api/content/help/status", { id: ticket.id, status: "resolved" }, staff.cookie), "resolving a request")
    say("updated", "a request resolved", "help requests")
  }
}

// ── 8 · the fence, checked from the outside ──────────────────────────────────
//
// Everything above ran as somebody with the right to write it. This last part
// asks the only question that matters afterwards: standing inside one client's
// login, can you reach another client's world?

step("Checking the fence from a client login")
const [testerA, testerB] = PORTAL_TESTERS
const a = sessions.get(testerA.email)
const b = sessions.get(testerB.email)
const companyId = (name) => idFor.get(companies.find((c) => c.name === name)?.glideId)
const aHome = companyId(testerA.companies[0])
const aSecond = companyId(testerA.companies[1])
const bHome = companyId(testerB.companies[0])

const seen = await allPages("/api/tenancy/accounts", "accounts", a.cookie)
const seenIds = new Set(seen.map((x) => x.id))
// The positive half first: a fence that refuses everybody isn't a fence, it's a
// broken door — and it would pass a refusal-only check perfectly.
check(
  `${testerA.companies[0]} sees its own company`,
  seenIds.has(aHome),
  `saw ${seen.map((x) => x.name).slice(0, 8).join(", ") || "nothing"}`
)
check("and the contacts held under it", seen.some((x) => x.accountType === "individual"), `saw ${seen.length} accounts`)
check(
  "but not the other client's company",
  !seenIds.has(bHome),
  `saw ${seen.map((x) => x.name).join(", ").slice(0, 200)}`
)
const byName = await api(`/api/tenancy/accounts?q=${encodeURIComponent(testerB.companies[0])}`, {}, a.cookie)
check(
  "naming the other company in a search tells them nothing",
  byName.status === 200 && (byName.body?.accounts ?? []).length === 0,
  JSON.stringify(byName.body).slice(0, 160)
)
const byIdRead = await api(`/api/tenancy/accounts/detail?id=${bHome}`, {}, a.cookie)
check("opening the other company by id is refused", byIdRead.status === 404, `got ${byIdRead.status}`)

const aRequests = await ticketsFor(a.cookie)
const aDescriptions = new Set(aRequests.map((t) => t.description))

// A NEGATIVE CHECK IS ONLY WORTH ANYTHING IF THERE IS SOMETHING TO FIND.
// "They cannot see our internal request" passes trivially when that request does
// not exist — which is exactly how a fence test stays green over an open hole.
// So prove the bait exists first, from the account that should see it.
const staffSees = new Set((await ticketsFor(staff.cookie)).map((t) => t.description))
const otherCompanyRequests = requests.filter((r) => r.accountGlideId === companies.find((c) => c.name === testerB.companies[0])?.glideId)
const ownCompanyByOthers = requests.filter(
  (r) => r.accountGlideId === companies.find((c) => c.name === testerA.companies[0])?.glideId && !raisedBy.has(r.description)
)
check("our own internal request exists, so the next check has something to catch", staffSees.has(OURS.description))
check(
  `the other client's requests exist (${otherCompanyRequests.length}), so the next check has something to catch`,
  otherCompanyRequests.length > 0 && otherCompanyRequests.every((r) => staffSees.has(r.description))
)
check(
  `${testerA.companies[0]}'s own requests raised by somebody else exist (${ownCompanyByOthers.length})`,
  ownCompanyByOthers.length > 0
)

check(
  "a client sees the requests they raised themselves",
  aRequests.length > 0 && [...raisedBy.keys()].some((d) => aDescriptions.has(d)),
  `saw ${aRequests.length}`
)
// THE RULE THE OWNER SETTLED TODAY: a client contact sees their whole COMPANY's
// requests, not only the ones they typed. Written against the rule as stated —
// so it fails until the lane implementing it merges, and a failure here says
// "not built yet", not "leaking".
check(
  "a client sees their whole COMPANY's requests, not only their own",
  ownCompanyByOthers.every((r) => aDescriptions.has(r.description)),
  `saw ${ownCompanyByOthers.filter((r) => aDescriptions.has(r.description)).length} of the ` +
    `${ownCompanyByOthers.length} raised on their company by somebody else. Expected to FAIL until the ` +
    "company-wide help scope lands — today a client is scoped to the rows they authored, so this reads " +
    '"not built yet", not "leaking". The three checks after it are the ones that would mean a leak.'
)
check(
  "a client never sees another company's requests",
  otherCompanyRequests.every((r) => !aDescriptions.has(r.description)),
  otherCompanyRequests.filter((r) => aDescriptions.has(r.description)).map((r) => r.description.slice(0, 40)).join(" | ")
)
check(
  "a client never sees the agency's own requests",
  // Derived from OURS, never retyped: a hand-copied prefix means rewording the
  // seeded request silently turns this negative check into a no-op.
  !aDescriptions.has(OURS.description),
  "the agency's internal request reached a client login"
)

const aStanding = must(await api("/api/tenancy/portal/context", {}, a.cookie), "reading where the client stands")
const bStanding = must(await api("/api/tenancy/portal/context", {}, b.cookie), "reading where the other client stands")
check(
  "a contact of two companies can stand in either, one at a time (the account switcher)",
  (aStanding.accounts ?? []).length === 2,
  JSON.stringify(aStanding).slice(0, 200)
)
check("a contact of one company stands in one", (bStanding.accounts ?? []).length === 1, JSON.stringify(bStanding).slice(0, 200))
check("neither client login is treated as staff", aStanding.kind === "portal" && bStanding.kind === "portal")
if (aSecond) check("the second company is one they can stand in", (aStanding.accounts ?? []).some((x) => x.id === aSecond))

// ── 9 · what happened, and where to look ─────────────────────────────────────

for (const s of [staff, ...sessions.values()]) await post("/api/auth/logout", {}, s.cookie)

step("Seeded")
for (const [kind, t] of Object.entries(tally)) {
  const parts = [t.created && `${t.created} created`, t.updated && `${t.updated} updated`, t.reused && `${t.reused} already there`].filter(Boolean)
  console.log(`  ${String(t.created + t.updated + t.reused).padStart(5)}  ${kind} — ${parts.join(", ")}`)
}
console.log(
  `\nWrote ${changed} thing${changed === 1 ? "" : "s"}, left ${reused} that were already there.` +
    (changed === 0 ? " Nothing to do — it was already seeded." : "")
)
console.log(
  `\nEvery row above is dated today. No door in the base accepts a created_at — the\n` +
    `actor and the timestamp both come from the session, which is what makes the\n` +
    `audit trail trustworthy. The real dates (Jun 2024 → Aug 2026) are in\n` +
    `glide/normalised.json, and back-dating them would need a reviewed import-only\n` +
    `seam, not a seed that writes SQL behind the doors' backs.`
)

console.log("\nOpen these to see it:")
console.log(`  ${BASE}/accounts            the companies and their people`)
console.log(`  ${BASE}/t/${TEAM_ID}/accounts/${aHome}`)
console.log(`                              ${testerA.companies[0]} — contacts, logins, activity`)
console.log(`  ${BASE}/help                the requests, ours and the clients'`)
console.log(`  ${BASE}/learning            the articles`)
console.log(`  ${BASE}/members             the team, including the client logins`)
console.log(`\nSign in as a client with ${PORTAL_TESTERS.map((t) => t.email).join(" or ")}`)
console.log("(the code lands in your own inbox; the first is the one with two companies to switch between).")

console.log(failures ? `\nSEED FAILED — ${failures} fence check(s) did not pass.` : "\nSEED OK — the fence holds.")
process.exit(failures ? 1 : 0)
