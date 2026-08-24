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
//    (a company's name, a person's email, a story's title, a request's
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

/** THE OWNER'S ADDRESS IS A KWAPSO ONE, and it is not a preference.
 *
 * kwapso is its own company; Swift Struck is the studio that built the base it
 * runs on. Seeding under a swiftstruck.com address put the whole history in a
 * team the owner's real login could not reach, and left him staring at an empty
 * app under a team of the same name. Every address this script derives — both
 * client-portal testers are plus-addresses of this one — follows from here, so
 * this line is the only one that has to be right.
 *
 * `ownInbox` derives its allow-list from this too, which is what stops the seed
 * ever emailing a real client. */
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "alaap@kwapso.com"
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

// ── the work engine's own cuts ───────────────────────────────────────────────
//
// Every write below is one HTTP round trip, so the whole history — 28 apps, 106
// sprints, 912 stories, 3,675 tasks, 1,297 logs, 350 meetings — is about
// six thousand round trips and the better part of an hour. That is the wrong
// default for a seed somebody runs after a deploy.
//
// So the default is a CUT, sized to make every screen read as used rather than
// complete, and `--full` lifts every cap for the run that is actually the
// migration. The caps are stated here rather than buried at each call site,
// and each one says what it is buying.

const full = process.argv.includes("--full")
const cut = (n) => (full ? Infinity : n)

/** Sprints carry the money, and 106 is already inside R14's 1,000-row cap — so
 * the whole set goes in either way. Nothing is bought by cutting it. */
const SPRINT_LIMIT = cut(106)

/** Stories. 912 in the history; 320 here, spread across the apps rather than
 * taken newest-first, so every app's board has something on it instead of three
 * apps holding everything. */
const STORY_LIMIT = cut(320)

/** Our own admin. 3,675 in the history and the most repetitive rows in it — the
 * 250 most recent are what makes the list look like a real week's work.
 *
 * THE ONE CAP `--full` DOES NOT LIFT, and the reason is a real finding rather
 * than caution. The tasks list is a CAPPED read (LIST_HARD_CAP, 1,000) and not a
 * paged one, so writing all 3,675 would put 2,675 rows in the database that no
 * screen can reach — a seed that makes the app look complete while hiding two
 * thirds of what it just wrote. Either tasks earn keyset paging like stories and
 * meetings did, or this stays capped; until then, honest beats full. */
const TASK_LIMIT = full ? 900 : 250

/** Logged time. 1,297 recoverable logs; the 400 most recent are enough for the
 * time screens and a margin with real hours behind it. */
const WORK_LOG_LIMIT = cut(400)

/** The meetings list. 350 meetings; the 150 most recent cover the last few months. */
const MEETING_LIMIT = cut(150)

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
  // Anything not named here is off. A client never touches members, roles, or
  // anyone else's records — and the doors below say so themselves, which is the
  // point of the list.
  //
  // THIS ROLE IS THE WORST CASE ON PURPOSE, NOT A DESCRIPTION OF A GOOD ONE.
  // `selectable_data` is DELIBERATELY still granted even though every one of its
  // doors now refuses a client login outright (d7512f1). It is not a leftover: a
  // real owner building their own client role would plausibly tick it, so leaving
  // it on makes this seeded client the WORST CASE — a caller holding rights the
  // doors must refuse on grounds other than the role. R21's enumeration reads
  // these rights to decide which doors to walk, so taking them away would quietly
  // stop the check testing the very doors that were leaking a week ago. The
  // defence must not depend on how carefully the role was built.
  //
  // `learning` sat beside it and made the same point until 17 Aug 2026, when the
  // learning library was purged outright. A right on a module that no longer
  // exists walks no doors — the permission writer builds the sheet from
  // TEAM_MODULES — so it went with the module rather than lingering as a word
  // nobody could trace.
  //
  // `agent` is here for the same reason, and it is the sharpest case of it. An
  // owner does not have to be careless to grant it: the DEFAULT Viewer template
  // ships `agent: read + create` (workers/tenancy/src/team-schema.ts), and
  // "clone Viewer, untick the obvious things" is how a client role gets built.
  // Without this line R21 read the agent doors as unreachable and skipped the
  // whole surface — the one place in the app where a client login could attach
  // eight CSVs, be shown the import catalogue's inner shape, and spend the team's
  // AI allowance that the portal was built never to touch. A right the seed does
  // not hold is a door the law does not walk.
  //
  // `processes` is the one right on this list a client GENUINELY needs, rather
  // than one held to make the worst case worse. It is what opens their value
  // screen — the savings drilled App → Process → Step — and `create` is what
  // lets them say something on a map, one of the six things SCOPE says a contact
  // can do. The AUTHORING doors on the same module (map a process, edit a step,
  // cut a version) hold the same right and refuse a portal caller at the door,
  // which is exactly the shape R21 exists to check: the rights let them through
  // and the door turns them away.
  //
  // `commercials` is DELIBERATELY ABSENT, and it is the only module on this list
  // that could not be here even as a worst case. Every one of its doors refuses a
  // client login anyway (R24 + the refusal-symmetry suite), so granting it would
  // test one more refusal — but the seed is also a working example an owner
  // copies, and a Client role with a tick beside "Rates & margin" is a screenshot
  // nobody should ever be able to take.
  rights: {
    teams: { read: true },
    accounts: { read: true },
    portal_users: { read: true },
    // EDIT joined read + create when the work engine shipped, and it is the one
    // right on this list that changes what a client can DO rather than what R21
    // walks. SCOPE ch.07 gives the account two powers over its own requests —
    // correct the wording, and drag them into the order they want — and both are
    // `help:edit`. What makes that safe is not this line: it is the LOCK (both
    // stop the moment a staff member reads the ticket) and the four doors on the
    // same right that now refuse a portal caller outright — status, bulk-status,
    // bulk-status-by-filter and archive. "Resolved" is our word, and SCOPE says
    // there is no client-side reopen button.
    help: { read: true, create: true, edit: true },
    // The one module in the work engine a client is MEANT to hold. A to-do is
    // aimed at them: they read their company's and complete one, with the file we
    // asked for. `create` and `delete` are ours — asking for something emails
    // them, and withdrawing a request is our decision to stop needing it.
    todos: { read: true, edit: true },
    // READ ONLY, and it buys two different things. The portal's Deliverables
    // shelf is gated `deliverables:read`, so without this the nav item is there
    // and the screen 403s. And R21's `client-reachable-doors` derives WHICH
    // doors to walk from these very rights — "a right the seed does not hold is
    // a door the law does not walk" — so a module absent here is a module the
    // fence law silently skips, all six doors of it. The feature being broken is
    // how anyone would have noticed; the coverage hole would not have announced
    // itself. Safe to grant: all five agency doors open with `refusePortalCaller`,
    // so this changes nothing a client can reach at the agency origin.
    deliverables: { read: true },
    selectable_data: { read: true },
    agent: { read: true, create: true },
    processes: { read: true, create: true },
    // GOOGLE, granted for exactly the reason `agent` is: not because a client
    // should have it, but because an owner cloning the Viewer template and
    // unticking the obvious things WOULD leave it on. The default Viewer ships
    // read on every module, and "Google connections" is not one of the obvious
    // things — it reads like a personal setting rather than a door onto the
    // agency's material.
    //
    // Without this line R21 reads the whole Google surface as unreachable and
    // skips it, exactly as it skipped the agent's six doors: a right the seed
    // does not hold is a door the law does not walk. With it, seven doors are
    // walked and every one must refuse — which is the shape this law exists to
    // check, and the reason the module ALSO carries its own path-shaped suite
    // (workers/content/test/google-doors.test.ts): that one holds the other
    // thirteen, which no plausible client role reaches.
    //
    // READ only, deliberately. That is what cloning Viewer actually produces —
    // `create` on this module means "connect a Google account", which the
    // template does not grant and no owner would tick for a client. Inventing a
    // grant nobody would make would test a door at the cost of making this seed a
    // worse working example, which is the same reason `commercials` is absent.
    google: { read: true },
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

/** THE SAME ROUND-ROBIN, ONE NOUN OVER. A story belongs to an app, and taking
 * the newest 320 hands the whole budget to the two apps that were busiest last
 * month while eighteen boards stay empty. So one story is taken from each app in
 * turn until the cut is spent, newest first inside each app — which is what
 * makes every app's board worth opening. Memoised because the status pass reads
 * the same list a second time and must get the same rows. */
let storyCut = null
function pickStories() {
  if (storyCut) return storyCut
  const queues = new Map()
  for (const s of [...history.stories].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))) {
    const key = s.appGlideId ?? "(none)"
    if (!queues.has(key)) queues.set(key, [])
    queues.get(key).push(s)
  }
  const out = []
  const lists = [...queues.values()]
  for (let round = 0; out.length < STORY_LIMIT; round++) {
    const before = out.length
    for (const list of lists) {
      if (round < list.length && out.length < STORY_LIMIT) out.push(list[round])
    }
    if (out.length === before) break // every queue is spent
  }
  storyCut = out
  return out
}

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

// ── would any of this be refused? ask BEFORE writing a single row ────────────
//
// A 519-character story title stopped a run three hundred rows in, with a clean
// 400 from a door that was right to refuse it. The rows already written were
// fine and the run still had to start again — and the failure was knowable from
// the file before anything was sent.
//
// So the payload is checked against the doors' own ceiling first. It is a
// PRE-FLIGHT, not a fix: the transform is where a value is reshaped to fit
// (`fitTitle`), and this exists to make sure that stays true. If it ever fires,
// the answer is a change in glide-transform.mjs, never a longer limit here.
{
  // The doors' own ceilings (TEXT_LIMITS in shared/workers/validate.ts). Repeated
  // here because a .mjs script cannot import a .ts constant — so the comment names
  // the authority, which is the most a script can do about it.
  const SHORT = 200 // titles, names, labels
  const LONG = 20_000 // details, notes, descriptions
  const tooLong = []
  for (const [what, rows, field, max] of [
    ["apps", history.apps, "name", SHORT],
    ["apps", history.apps, "description", LONG],
    ["sprints", history.sprints, "name", SHORT],
    ["stories", history.stories, "title", SHORT],
    ["stories", history.stories, "detail", LONG],
    ["tasks", history.tasks, "title", SHORT],
    ["tasks", history.tasks, "detail", LONG],
    ["meetings", history.meetings, "title", SHORT],
    ["meetings", history.meetings, "location", SHORT],
    ["meetings", history.meetings, "notes", LONG],
    ["meeting purposes", history.meetingPurposes, "name", SHORT],
  ]) {
    for (const r of rows ?? []) {
      if (typeof r[field] === "string" && r[field].length > max)
        tooLong.push(`${what}.${field}: ${r[field].length} chars (max ${max}) — "${r[field].slice(0, 50)}…"`)
    }
  }
  // The same idea for the other value a door refuses outright: a duration that
  // floors to zero whole seconds. Caught here rather than 900 logs into the run.
  for (const l of history.workLogs ?? []) {
    if (Math.floor((new Date(l.endedAt) - new Date(l.startedAt)) / 1000) < 1)
      tooLong.push(`work log: under a second — ${l.startedAt} → ${l.endedAt}`)
  }
  if (tooLong.length) {
    console.error(
      `\nStopped before writing anything: ${tooLong.length} value(s) are longer than the door accepts.\n` +
        `Shape them in scripts/glide-transform.mjs (fitTitle / fitLong) rather than raising a limit here:\n  ` +
        tooLong.slice(0, 10).join("\n  ")
    )
    process.exit(1)
  }
}

if (dryRun) {
  const byCompany = {}
  for (const r of requests) byCompany[companyByGlideId.get(r.accountGlideId)?.name ?? "(no company)"] = (byCompany[companyByGlideId.get(r.accountGlideId)?.name ?? "(no company)"] ?? 0) + 1
  console.log(`\nDry run — nothing was written. From ${SOURCE}, this seed would create:\n`)
  console.log(`  ${String(companies.length).padStart(4)} companies (entity accounts)`)
  console.log(`  ${String(people.length).padStart(4)} people (individual accounts)`)
  console.log(`  ${String(links.length).padStart(4)} contact links`)
  console.log(`  ${String(PORTAL_TESTERS.length).padStart(4)} client logins, on ${[...new Set(PORTAL_TESTERS.flatMap((p) => p.companies))].join(", ")}`)
  console.log(`  ${String(history.selectableData.length).padStart(4)} dropdown values`)
  console.log(`  ${String(requests.length + 1).padStart(4)} help requests (of ${history.helpRequests.length}), including one of our own`)
  console.log(`  ${String(requests.reduce((n, r) => n + Math.min(r.replies.length, REPLIES_PER_REQUEST), 0)).padStart(4)} replies on them`)
  console.log(`  ${String(requests.filter((r) => r.resolved).length).padStart(4)} of those requests then moved to resolved`)
  console.log(`\n  requests per company: ${Object.entries(byCompany).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`)
  console.log(`  languages: ${requests.filter((r) => r.language === "de").length} German only, ${requests.filter((r) => r.language === "both").length} both, ${requests.filter((r) => r.language === "en").length} English only`)
  const n = (x) => String(x).padStart(4)
  const of = (kept, total) => `${n(kept)} of ${total}`
  console.log(`\n  the work engine${full ? " (--full: every row, no cut)" : ""}:`)
  console.log(`  ${n(history.apps.length)} apps`)
  console.log(`  ${of(Math.min(history.sprints.length, SPRINT_LIMIT), history.sprints.length)} sprints`)
  console.log(`  ${of(pickStories().length, history.stories.length)} stories, spread across ${new Set(pickStories().map((s) => s.appGlideId)).size} apps`)
  console.log(`  ${of(Math.min(history.tasks.length, TASK_LIMIT), history.tasks.length)} pieces of our own admin`)
  console.log(`  ${of(Math.min(history.workLogs.length, WORK_LOG_LIMIT), history.workLogs.length)} work logs — the only rows that keep their REAL dates`)
  console.log(`  ${n(history.meetingPurposes.length)} meeting purposes`)
  console.log(`  ${of(Math.min(history.meetings.length, MEETING_LIMIT), history.meetings.length)} meetings`)
  console.log(`\n  every row will be stamped created_at = now; the real dates stay in ${SOURCE}.`)
  console.log(`  the exception is logged time: its start and finish ARE the record, so those are real.`)
  if (!full) console.log(`  add --full to write the whole history instead of this cut.`)
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

// ── 4 · accounts: the companies, their people, and who is a contact of whom ──

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

// ── 5 · client logins, then team membership — in that order ──────────────────
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
  //
  // A CLIENT LOGIN JOINS AND IS THEN REFUSED, IN THAT ORDER, AND BOTH HALVES ARE
  // RIGHT. `bootstrap` accepts the pending invites FIRST and only then decides
  // whether to describe the team to the caller — and it will not describe the
  // agency to a client login (R21). So a client gets a 403 carrying `client_login`
  // from a call that has already made them a member. Reading that 403 as a failure
  // stopped this whole seed dead, after the join had succeeded.
  //
  // So the refusal is the expected answer here, and anything OTHER than that one
  // code is still fatal. Nothing is taken on trust either way — the membership
  // read three lines down is what decides whether the join actually happened,
  // and it was already there.
  const bootstrapped = await post("/api/tenancy/bootstrap", {}, session.cookie)
  if (!bootstrapped.ok && bootstrapped.body?.error !== "client_login")
    must(bootstrapped, `${t.name} joining the team`)
  const joined = must(await api("/api/tenancy/members", {}, staff.cookie), "re-reading members").members ?? []
  if (!joined.some((m) => m.email?.toLowerCase() === t.email)) {
    console.error(`\nStopped: ${t.name} didn't join the team — their invite may already be spent.`)
    process.exit(1)
  }
  say("created", `${t.name} joined the team as ${CLIENT_ROLE.title}`)
}

// ── 6 · the requests, and what happened to each of them ──────────────────────
//
// Raised, then answered, then closed — in that order, through the doors that do
// each of those things. The activity trail is what FOLLOWS from that; no row is
// written into the feed directly, because a feed you can write to directly is a
// feed that can say something that never happened.

step("Tickets")
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

  // STAND THEM IN THE COMPANY THE REQUEST BELONGS TO, FIRST.
  //
  // A client's ticket takes the company they are STANDING IN — from the guard
  // corridor, never from the body, which is what stops one client raising a
  // ticket into another's world. So a contact of two companies who happens to be
  // standing in the second one files their first company's questions against the
  // wrong company. That is not a check being fussy: it wrote three tickets onto
  // Amstella that belong to Confia, and then the client could not find their own
  // question because they were looking at Confia.
  const homeId = idFor.get(home)
  if (homeId) {
    must(
      await post("/api/tenancy/portal/switch-account", { accountId: homeId }, sessions.get(t.email).cookie),
      `standing ${t.name} in ${t.companies[0]} before they raise anything`
    )
  }
}

/** Glide request id → the real ticket id, for the work logs below: time was
 * logged against requests as well as against stories and tasks, and a log whose
 * request never got seeded has nothing to attach to. */
const ticketIdFor = new Map()

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

  if (r.glideId) ticketIdFor.set(r.glideId, ticket.id)

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

// ── 6b · the work engine: what we built, sold, did and spent time on ─────────
//
// THE ORDER IS THE DEPENDENCY, and it is not negotiable: an app before the
// sprints under it, a sprint before the stories in it, a task before the time
// logged against it. Each step below builds a glide-id → real-id map that the
// next one reads, exactly as the accounts step does for the tickets.
//
// Everything is matched on a natural key first and skipped when it is already
// there, so a second run creates nothing — the same claim the sections above
// make, and the same way of making it.

step("Apps")
const appIdFor = new Map()
{
  const already = new Map(
    (must(await api("/api/tenancy/apps", {}, staff.cookie), "reading the apps").apps ?? []).map((a) => [a.name, a])
  )
  for (const a of history.apps) {
    const hit = already.get(a.name)
    if (hit) {
      appIdFor.set(a.glideId, hit.id)
      say("reused", a.name, "apps")
      continue
    }
    must(
      await post(
        "/api/tenancy/apps",
        {
          name: a.name,
          accountId: a.accountGlideId ? idFor.get(a.accountGlideId) : undefined,
          url: a.url ?? undefined,
          stage: a.stage ?? undefined,
          description: a.description ?? undefined,
        },
        staff.cookie
      ),
      `recording the app ${a.name}`
    )
    say("created", a.name, "apps")
  }
  // Read back once rather than per-write: the create door answers with the row,
  // but re-reading the whole (bounded, 28-row) set is one round trip and cannot
  // drift from what the server actually holds.
  for (const row of must(await api("/api/tenancy/apps", {}, staff.cookie), "re-reading the apps").apps ?? []) {
    const src = history.apps.find((a) => a.name === row.name)
    if (src) appIdFor.set(src.glideId, row.id)
  }
}

step("Sprints")
const sprintIdFor = new Map()
{
  // A sprint's name repeats across apps ("Refinement · Aug 2026" is a name two
  // apps can both have), so the natural key is the name AND the app — matching
  // on the name alone would fold twenty real sprints into one.
  const key = (name, appId) => `${appId ?? "-"}::${name}`
  const already = new Map(
    (must(await api("/api/content/sprints", {}, staff.cookie), "reading the sprints").sprints ?? []).map((s) => [
      key(s.name, s.appId),
      s,
    ])
  )
  for (const s of history.sprints.slice(0, SPRINT_LIMIT)) {
    const appId = appIdFor.get(s.appGlideId) ?? null
    const hit = already.get(key(s.name, appId))
    if (hit) {
      sprintIdFor.set(s.glideId, hit.id)
      say("reused", s.name, "sprints")
      continue
    }
    must(
      await post(
        "/api/content/sprints",
        {
          name: s.name,
          sprintType: s.sprintType ?? undefined,
          appId: appId ?? undefined,
          accountId: s.accountGlideId ? idFor.get(s.accountGlideId) : undefined,
          startsOn: s.startsOn ?? undefined,
          endsOn: s.endsOn ?? undefined,
        },
        staff.cookie
      ),
      `starting the sprint ${s.name}`
    )
    say("created", s.name, "sprints")
  }
  const written = must(await api("/api/content/sprints", {}, staff.cookie), "re-reading the sprints").sprints ?? []
  const rowFor = new Map(written.map((row) => [key(row.name, row.appId), row]))
  for (const s of history.sprints) {
    const row = rowFor.get(key(s.name, appIdFor.get(s.appGlideId) ?? null))
    if (row) sprintIdFor.set(s.glideId, row.id)
  }

  // FINISHED SPRINTS ARE FINISHED AFTERWARDS, never on the way in — the create
  // door starts one, and completing it is its own door because completing a
  // sprint CUTS A VERSION of every process map under it. A sprint that arrived
  // already complete would have skipped that, and the savings figures would be
  // measured from a baseline nobody cut.
  for (const s of history.sprints.slice(0, SPRINT_LIMIT)) {
    if (!s.complete) continue
    const row = rowFor.get(key(s.name, appIdFor.get(s.appGlideId) ?? null))
    if (!row || row.completedAt) continue
    must(await post("/api/content/sprints/complete", { id: row.id, complete: true }, staff.cookie), "finishing a sprint")
    say("updated", `${s.name} finished`, "sprints")
  }
}

step("Stories")
const storyIdFor = new Map()
{
  const already = new Map(
    (await allPages("/api/content/stories?view=all", "stories", staff.cookie)).map((s) => [s.title, s])
  )
  for (const s of pickStories()) {
    const hit = already.get(s.title)
    if (hit) {
      storyIdFor.set(s.glideId, hit.id)
      // BACKFILL, for the same reason the tickets step backfills its account:
      // idempotence means converging on the right row, not never touching one.
      // An earlier run wrote these before the create call carried
      // `changesNoStep`, so they cannot be finished — the door refuses, for ever,
      // and the run dies on the status pass below. Skipping a known-wrong row is
      // not idempotent, it is stuck.
      if (!hit.changesNoStep && !hit.stepKey) {
        // THE WHOLE ROW, not just the field being changed. This door REPLACES
        // what it is given — a body carrying only the tick would silently clear
        // the story's sprint, its app and its client, because absent reads as
        // "set it to nothing". Sending the same fields the create sent keeps the
        // update to the one thing it is for.
        must(
          await post(
            "/api/content/stories/update",
            {
              id: hit.id,
              title: s.title,
              detail: s.detail ?? undefined,
              appId: s.appGlideId ? appIdFor.get(s.appGlideId) : undefined,
              sprintId: s.sprintGlideId ? sprintIdFor.get(s.sprintGlideId) : undefined,
              accountId: s.accountGlideId ? idFor.get(s.accountGlideId) : undefined,
              changesNoStep: true,
            },
            staff.cookie
          ),
          "recording that an imported story changed no process step"
        )
        say("updated", s.title, "stories")
      } else say("reused", s.title, "stories")
      continue
    }
    must(
      await post(
        "/api/content/stories",
        {
          title: s.title,
          detail: s.detail ?? undefined,
          appId: s.appGlideId ? appIdFor.get(s.appGlideId) : undefined,
          sprintId: s.sprintGlideId ? sprintIdFor.get(s.sprintGlideId) : undefined,
          accountId: s.accountGlideId ? idFor.get(s.accountGlideId) : undefined,
          // "IT CHANGED NO STEP" — a statement of fact about the old app, not a
          // way round the rule that refuses it.
          //
          // A story cannot be finished without naming the process step it changed
          // or ticking that it changed none (BUILD-1 §2), and `refuseUnstepped`
          // warns in as many words against defaulting the tick, because that
          // "would fill the savings maths with quiet zeroes". That warning is
          // about a story somebody is writing TODAY, where the answer exists and
          // nobody typed it.
          //
          // This is the other case. Glide had no process maps at all — there were
          // no steps in the old system for a story to have changed — so "none" is
          // the true and only answer, and it puts no zero into any savings figure
          // that was not already zero. The alternative is 200 finished pieces of
          // work sitting in the backlog for ever, which is a lie the screen tells
          // every day rather than one this comment tells once.
          changesNoStep: true,
        },
        staff.cookie
      ),
      `writing down the story ${s.title.slice(0, 40)}`
    )
    say("created", s.title, "stories")
  }
  const written = new Map(
    (await allPages("/api/content/stories?view=all", "stories", staff.cookie)).map((s) => [s.title, s])
  )
  for (const s of history.stories) {
    const row = written.get(s.title)
    if (row) storyIdFor.set(s.glideId, row.id)
  }

  // MOVED AFTER THEY EXIST, not on the way in — the create door writes a story
  // open, and the status door is what moves it. That is the same "raised, then
  // answered, then closed" shape the tickets step uses, and for the same reason:
  // a row that arrives already finished has no trail behind it.
  for (const s of pickStories()) {
    if (s.status === "open") continue
    const id = storyIdFor.get(s.glideId)
    const row = written.get(s.title)
    if (!id || row?.status === s.status) continue
    must(await post("/api/content/stories/status", { id, status: s.status }, staff.cookie), "moving a story along")
    say("updated", s.title, "stories")
  }
}

step("Our own admin")
const taskIdFor = new Map()
{
  const already = new Map(
    (must(await api("/api/content/tasks", {}, staff.cookie), "reading the admin list").tasks ?? []).map((t) => [t.title, t])
  )
  for (const t of history.tasks.slice(-TASK_LIMIT)) {
    const hit = already.get(t.title)
    if (hit) {
      taskIdFor.set(t.glideId, hit.id)
      say("reused", t.title, "tasks")
      continue
    }
    must(
      await post(
        "/api/content/tasks",
        {
          title: t.title,
          detail: t.detail ?? undefined,
          dueOn: t.dueOn ?? undefined,
          accountId: t.accountGlideId ? idFor.get(t.accountGlideId) : undefined,
        },
        staff.cookie
      ),
      `writing down the task ${t.title.slice(0, 40)}`
    )
    say("created", t.title, "tasks")
  }
  const written = new Map(
    (must(await api("/api/content/tasks", {}, staff.cookie), "re-reading the admin list").tasks ?? []).map((t) => [t.title, t])
  )
  for (const t of history.tasks) {
    const row = written.get(t.title)
    if (row) taskIdFor.set(t.glideId, row.id)
  }
  for (const t of history.tasks.slice(-TASK_LIMIT)) {
    const row = written.get(t.title)
    // `status`, not a `done` boolean — the row says "open" or "done". Reading a
    // field the row hasn't got makes every already-ticked task look untouched,
    // and the run reports work it did not do.
    if (!t.done || !row || row.status === "done") continue
    must(await post("/api/content/tasks/done", { id: row.id, done: true }, staff.cookie), "ticking a task off")
    say("updated", t.title, "tasks")
  }
}

step("Logged time")
{
  // THE ONE SECTION THAT CARRIES ITS REAL DATES. Every other row in this seed
  // arrives stamped today, because no door accepts a created date — but a work
  // log's start and finish ARE the record, so two years of real times land here
  // exactly as they happened. It is the only place in the app where the history
  // is genuinely the history.
  const target = (l) =>
    l.targetKind === "stories"
      ? storyIdFor.get(l.targetGlideId)
      : l.targetKind === "tasks"
        ? taskIdFor.get(l.targetGlideId)
        : ticketIdFor.get(l.targetGlideId)
  const already = new Set(
    (await allPages("/api/content/work-logs", "logs", staff.cookie)).map((l) => `${l.targetId}@${l.startedAt}`)
  )
  let skipped = 0
  for (const l of history.workLogs.slice(-WORK_LOG_LIMIT)) {
    const targetId = target(l)
    if (!targetId) {
      // Its story, task or request was outside this seed's cut. Counted rather
      // than silently dropped — the seed is a SAMPLE, and a sample that hides
      // what it left out is a sample nobody can size.
      skipped++
      continue
    }
    if (already.has(`${targetId}@${l.startedAt}`)) {
      say("reused", "a log", "work logs")
      continue
    }
    must(
      await post(
        "/api/content/work-logs",
        {
          targetTable: l.targetKind,
          targetId,
          startedAt: l.startedAt,
          endedAt: l.endedAt,
          note: l.staffName ? `Logged by ${l.staffName} in the old app` : undefined,
        },
        staff.cookie
      ),
      "logging time"
    )
    say("created", "a log", "work logs")
  }
  if (skipped) console.log(`  (${skipped} logs skipped — what they were against is outside this seed's cut)`)
}

// ── 6c · the money, and the arithmetic checked out loud ──────────────────────
//
// THE ONE THING THE HISTORY COULD NOT SUPPLY. Glide's sprint has six columns and
// none of them is a price; there was no rate card in the old app at all. So the
// money side has real HOURS behind it and no real RATES — which would leave
// every money screen empty and untestable, on the one part of the app where
// "it computes the right number" is the whole feature.
//
// So the rate cards are seeded with PLACEHOLDER figures, and the word is in the
// label rather than in a comment nobody reading the screen will see. Two things
// make that safe: this is staging, and price visibility is OFF unless somebody
// switches it on per account (`commercials_visible`), so no client login can see
// them even if one were pointed at this environment.
//
// The point is not the numbers. It is that the subtraction is then CHECKED —
// hours × rate, minus tools, equals the margin the door reports — so a change
// that quietly breaks the arithmetic fails here rather than on an invoice.

step("Rate cards")
const PLACEHOLDER_INTERNAL = { label: "Our time (placeholder rate)", centsPerHour: 4500, isDefault: true }
const PLACEHOLDER_CHARGED = [
  { label: "Implementation (placeholder rate)", centsPerHour: 11000 },
  { label: "Enhancement (placeholder rate)", centsPerHour: 9500 },
]
{
  const mine = must(await api("/api/tenancy/internal-rates", {}, staff.cookie), "reading our own cost card")
    .internalRates ?? []
  if (!mine.some((r) => r.label === PLACEHOLDER_INTERNAL.label)) {
    must(await post("/api/tenancy/internal-rates", PLACEHOLDER_INTERNAL, staff.cookie), "setting what our hour costs")
    say("created", PLACEHOLDER_INTERNAL.label, "internal rates")
  } else say("reused", PLACEHOLDER_INTERNAL.label, "internal rates")

  // Charged rates go on ONE company — the one the portal tester stands in — so
  // there is a populated rate card to look at without pricing twenty clients
  // with numbers nobody agreed.
  const priced = idFor.get(companies.find((c) => c.name === PORTAL_TESTERS[0].companies[0])?.glideId)
  if (priced) {
    const card = must(
      await api(`/api/tenancy/rates?accountId=${encodeURIComponent(priced)}`, {}, staff.cookie),
      "reading the account's rate card"
    ).rates ?? []
    for (const r of PLACEHOLDER_CHARGED) {
      if (card.some((x) => x.label === r.label)) {
        say("reused", r.label, "account rates")
        continue
      }
      must(await post("/api/tenancy/rates", { accountId: priced, ...r }, staff.cookie), `pricing ${r.label}`)
      say("created", r.label, "account rates")
    }
  }
}

step("Checking the margin adds up")
{
  // ASK ABOUT A COMPANY THAT ACTUALLY HAS HOURS ON IT. The rate card above went
  // on the portal tester's company so the portal has prices to show, but which
  // companies ended up with logged time depends on where this run's cut of the
  // history landed. Asserting arithmetic against a company with no time is a row
  // of green ticks about nothing — so the busiest one is found first, from the
  // logs themselves.
  const logs = await allPages("/api/content/work-logs", "logs", staff.cookie)
  const seconds = new Map()
  for (const l of logs) {
    if (!l.accountId) continue
    seconds.set(l.accountId, (seconds.get(l.accountId) ?? 0) + (l.seconds ?? 0))
  }
  const busiest = [...seconds].sort((x, y) => y[1] - x[1])[0]?.[0]
  const priced = busiest ?? idFor.get(companies.find((c) => c.name === PORTAL_TESTERS[0].companies[0])?.glideId)
  const m = must(
    await api(`/api/tenancy/margin?accountId=${encodeURIComponent(priced)}`, {}, staff.cookie),
    "reading the margin"
  )
  // Every line the door built the answer from, re-added here. If these agree,
  // the number on the screen is the number the data says.
  const linesAddUp = (m.lines ?? []).reduce((n, l) => n + l.costCents, 0)
  check("the time lines add up to the time cost", linesAddUp === m.timeCostCents, `${linesAddUp} vs ${m.timeCostCents}`)
  check(
    "and the margin is revenue minus time minus tools",
    m.marginCents === m.revenueCents - m.timeCostCents - m.toolCostCents,
    JSON.stringify(m).slice(0, 220)
  )
  // Each line is hours × that line's rate, rounded once. A line whose cost does
  // not follow from its own two numbers is the failure this is here to catch.
  for (const l of m.lines ?? []) {
    const expected = Math.round((l.seconds / 3600) * l.centsPerHour)
    check(
      `“${l.label}” costs its own hours × its own rate`,
      l.costCents === expected,
      `${l.costCents} vs ${expected} (${l.seconds}s at ${l.centsPerHour}/h)`
    )
  }
  check(
    "there is logged time behind the figure, so the checks above mean something",
    (m.lines ?? []).some((l) => l.seconds > 0),
    "no time logged against this company — the arithmetic checks pass trivially"
  )
  const named = companies.find((c) => idFor.get(c.glideId) === priced)?.name ?? priced
  console.log(
    `  margin on ${named}: sold ${m.revenueCents}c − time ${m.timeCostCents}c − tools ${m.toolCostCents}c = ${m.marginCents}c` +
      (m.marginPercent === null ? " (no revenue to be a percentage of — Glide never priced a sprint)" : ` (${m.marginPercent}%)`)
  )
  if (!m.loggedTimeAvailable) console.log("  (the work engine's tables are not in this database — time is not counted)")
}

step("Why we meet")
const purposeIdFor = new Map()
{
  const already = new Map(
    (must(await api("/api/content/delivery/purposes", {}, staff.cookie), "reading the purposes").purposes ?? []).map(
      (p) => [p.name, p]
    )
  )
  for (const p of history.meetingPurposes) {
    const hit = already.get(p.name)
    if (hit) {
      purposeIdFor.set(p.glideId, hit.id)
      say("reused", p.name, "meeting purposes")
      continue
    }
    must(await post("/api/content/delivery/purposes", { name: p.name }, staff.cookie), `adding the purpose ${p.name}`)
    say("created", p.name, "meeting purposes")
  }
  for (const row of must(await api("/api/content/delivery/purposes", {}, staff.cookie), "re-reading the purposes")
    .purposes ?? []) {
    const src = history.meetingPurposes.find((p) => p.name === row.name)
    if (src) purposeIdFor.set(src.glideId, row.id)
  }
}

step("Meetings")
{
  // Title alone is not a key — "Weekly" happened 40 times. The moment is what
  // makes a meeting that meeting.
  const already = new Set(
    (await allPages("/api/content/meetings", "meetings", staff.cookie)).map((m) => `${m.title}@${m.startsAt}`)
  )
  for (const m of history.meetings.slice(-MEETING_LIMIT)) {
    if (already.has(`${m.title}@${m.startsAt}`)) {
      say("reused", m.title, "meetings")
      continue
    }
    must(
      await post(
        "/api/content/meetings",
        {
          title: m.title,
          startsAt: m.startsAt,
          endsAt: m.endsAt ?? undefined,
          accountId: m.accountGlideId ? idFor.get(m.accountGlideId) : undefined,
          purposeId: m.purposeGlideId ? purposeIdFor.get(m.purposeGlideId) : undefined,
          location: m.location ?? undefined,
          notes: m.notes ?? undefined,
        },
        staff.cookie
      ),
      `putting ${m.title} in Meetings`
    )
    say("created", m.title, "meetings")
  }
}

// ── 7 · the fence, checked from the outside ──────────────────────────────────
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

// STAND SOMEWHERE ON PURPOSE BEFORE ASKING WHAT YOU CAN SEE.
//
// A contact of two companies is standing in exactly one of them at any moment,
// and which one is not this script's to assume — the pointer is set when the
// login is granted and moved by the switcher, so it is whatever the last thing
// to touch it left behind. This check assumed `companies[0]`, found the tester
// standing in the OTHER company, and reported two failures that were both the
// assumption: "Confia can't see Confia" and "sees 0 of Confia's 13 requests"
// were one sentence — they were standing in Amstella, correctly seeing
// Amstella's. Switching first makes the answer deterministic and exercises the
// switcher on the way past.
must(
  await post("/api/tenancy/portal/switch-account", { accountId: aHome }, a.cookie),
  `standing the client in ${testerA.companies[0]} before asking what they can see`
)

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

let aRequests = await ticketsFor(a.cookie)
let aDescriptions = new Set(aRequests.map((t) => t.description))

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

// A CLIENT'S OWN QUESTION, RAISED FROM WHERE THEY ARE STANDING.
//
// Raised here rather than assumed from the history above, because a request only
// counts for this check if it belongs to the company the tester is standing in —
// and an earlier run wrote three of theirs onto their SECOND company (the seed
// filed a first-company question while they stood in the second, before the
// switch above existed). Those rows are still there and cannot be moved: a
// ticket's client is set once, on purpose. So the check raises its own, which is
// idempotent on the description and true to the thing being proved.
const OWN_QUESTION = `Can you check last month's export for us? (raised from the portal by ${testerA.companies[0]})`
if (!aDescriptions.has(OWN_QUESTION)) {
  must(await post("/api/content/help", { description: OWN_QUESTION }, a.cookie), "a client raising their own question")
  aRequests = await ticketsFor(a.cookie)
  aDescriptions = new Set(aRequests.map((t) => t.description))
}
check(
  "a client sees the request they raised themselves",
  aDescriptions.has(OWN_QUESTION),
  `saw ${aRequests.length} requests, none of them the one just raised from this login`
)
// THE RULE THE OWNER SETTLED: a client contact sees their whole COMPANY's
// requests, not only the ones they typed. Built and live — but it took TWO fixes
// to actually mean anything, and this check found the second one. Widening the
// read was half of it; the other half was that a request the AGENCY typed in on
// a client's behalf carried no client at all, so 220 of 221 seeded requests
// belonged to nobody and a client's own history was empty. A check that only
// asked "can they see too much" would have shrugged at that.
check(
  "a client sees their whole COMPANY's requests, not only their own",
  ownCompanyByOthers.every((r) => aDescriptions.has(r.description)),
  `saw ${ownCompanyByOthers.filter((r) => aDescriptions.has(r.description)).length} of the ` +
    `${ownCompanyByOthers.length} raised on their company by somebody else. Either the help read is ` +
    "no longer scoped to the account fence, or those requests were written without a client on them " +
    "(createTicket/updateTicket → accountForStaffTicket)."
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

// ── 7b · the fence around the WORK, and around the money ─────────────────────
//
// Everything above was written before the work engine had any rows in it, so it
// asks about companies, contacts and requests — and every check passed while the
// sprints, the stories, the logged time and the margin were all empty. An empty
// table cannot leak, which means those checks were green about nothing.
//
// Now there is real work under real companies, so the questions can actually be
// asked: does a client see another client's sprint, and can any client reach
// what our own hour costs.

step("Checking the fence around the work and the money")

// THE POSITIVE HALF FIRST, as above: a door that answers nobody would pass every
// refusal below and mean nothing.
const aDelivery = must(await api("/api/content/portal/delivery", {}, a.cookie), "reading the client's own delivery")
const aBlocks = aDelivery.sprints ?? []
const bDelivery = must(await api("/api/content/portal/delivery", {}, b.cookie), "reading the other client's delivery")
const bBlocks = bDelivery.sprints ?? []
check(
  `${testerA.companies[0]} sees the work sold to them (${aBlocks.length} blocks)`,
  aBlocks.length > 0,
  "no blocks at all — either nothing was sold to this company, or the door is refusing its own client"
)
// COMPARE A FIELD THAT EXISTS, AND PROVE IT EXISTS FIRST.
//
// The first version of this compared `x.id` and reported a cross-client leak
// that was not there. A portal sprint deliberately carries no id — the door
// selects ref, name, type, dates and counts and nothing else — so every row on
// both sides had `id === undefined`, `undefined` matched `undefined`, and the
// check failed on 10 of the client's OWN sprints.
//
// That is the usual trivial-check trap inverted: a negative check that FAILS for
// free is as useless as one that passes for free, and it is more expensive,
// because somebody spends an hour on a leak that does not exist. So the key is
// asserted before it is trusted.
const KEY = "ref"
check(
  "a delivery block carries something unique to compare",
  aBlocks.every((x) => typeof x[KEY] === "string" && x[KEY]) &&
    bBlocks.every((x) => typeof x[KEY] === "string" && x[KEY]),
  `rows look like ${JSON.stringify(Object.keys(aBlocks[0] ?? {}))} — pick a key that is actually on them`
)
const aBlockKeys = new Set(aBlocks.map((x) => x[KEY]))
const shared = bBlocks.filter((x) => aBlockKeys.has(x[KEY]))
check(
  "and none of the other client's",
  shared.length === 0,
  `${shared.length} blocks appear in BOTH clients' delivery: ${shared.map((x) => x[KEY]).slice(0, 5).join(", ")}`
)

// THE DOORS A CLIENT MUST NOT REACH AT ALL. These are agency-side reads of the
// agency's own working material; the portal gateway forwards none of them, and
// each one refuses a client login at the door as well (R21) — which is the half
// this checks, because the same person is served at the agency hostname too.
for (const [what, path] of [
  ["the backlog", "/api/content/stories"],
  ["the sprint list", "/api/content/sprints"],
  ["everybody's logged time", "/api/content/work-logs"],
  ["our own internal admin", "/api/content/tasks"],
  ["the meetings list", "/api/content/meetings"],
  ["what our own hour costs us", "/api/tenancy/internal-rates"],
  ["what this account leaves us", `/api/tenancy/margin?accountId=${aHome}`],
]) {
  const res = await api(path, {}, a.cookie)
  check(
    `a client login cannot read ${what}`,
    res.status === 403 || res.status === 404,
    `got ${res.status} — ${JSON.stringify(res.body).slice(0, 140)}`
  )
}

// AND THE SAME DOORS ANSWER US, so the refusals above are about WHO is asking
// rather than about a door that is broken for everybody.
for (const [what, path] of [
  ["the backlog", "/api/content/stories?view=all"],
  ["the sprint list", "/api/content/sprints"],
  ["logged time", "/api/content/work-logs"],
  ["our own admin", "/api/content/tasks"],
  ["the meetings list", "/api/content/meetings"],
  ["our internal rate card", "/api/tenancy/internal-rates"],
  ["the margin on a client", `/api/tenancy/margin?accountId=${aHome}`],
]) {
  const res = await api(path, {}, staff.cookie)
  check(`but we can read ${what}`, res.status === 200, `got ${res.status}`)
}

// ── 8 · what happened, and where to look ─────────────────────────────────────

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
console.log(`  ${BASE}/tickets             the tickets, ours and the clients'`)
console.log(`  ${BASE}/members             the team, including the client logins`)
console.log(`\nSign in as a client with ${PORTAL_TESTERS.map((t) => t.email).join(" or ")}`)
console.log("(the code lands in your own inbox; the first is the one with two companies to switch between).")

console.log(failures ? `\nSEED FAILED — ${failures} fence check(s) did not pass.` : "\nSEED OK — the fence holds.")
process.exit(failures ? 1 : 0)
