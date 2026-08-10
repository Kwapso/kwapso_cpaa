// seed-staging — fill the staging sandbox with one believable, obviously
// fictional client world, so the owner can click around a populated app.
//
//   node scripts/seed-staging.mjs staging
//   node scripts/seed-staging.mjs production --confirm-production   (refused in spirit; see below)
//
// THREE RULES THIS SCRIPT LIVES BY.
//
// 1. IT WRITES THROUGH THE FRONT DOOR. Every row below is created by a real HTTP
//    call to a real gated endpoint, signed in as a real person — never by
//    touching D1. That is the whole point: seeding this way proves the doors
//    work, exercises the permission spine, and leaves genuine activity rows and
//    live pings behind, exactly as a person clicking would.
// 2. IT IS IDEMPOTENT. Every record is matched on a stable natural key first
//    (an account's reference, a person's email, an article's title, a ticket's
//    description) and skipped when it is already there. Run it twice and the
//    second run creates nothing.
// 3. IT CHECKS THE FENCE FROM THE OUTSIDE. A seed that writes rows the fence
//    would never allow is worse than no seed — it makes a leak look like normal
//    data. So the last thing it does is sign in AS a seeded client login and
//    prove it sees its own company's world and nothing from the other one.
//
// STAGING ONLY. SCOPE ch.13: staging holds only the sandbox account; real
// client accounts are only ever invited on production, which is deliberately
// empty and parked. Production also refuses the test-login door outright
// (auth's ENVIRONMENT check), so this script cannot sign anyone in there even
// if you insist — the guard below says so before you waste the trip.
//
// Needs TEST_LOGIN_KEY and ADMIN_KEY in the environment (they live in
// ~/.config/kwapso/keys.env — export them, never paste them):
//   TEST_LOGIN_KEY=… ADMIN_KEY=… node scripts/seed-staging.mjs staging

import { makeApi, timedFetch } from "./lib/api.mjs"

// ── where, and may we ────────────────────────────────────────────────────────

const TARGETS = {
  staging: { base: "https://agency-staging.kwapso.app", label: "staging" },
  production: { base: "https://agency.kwapso.app", label: "PRODUCTION" },
}

const target = process.argv[2]
const confirmed = process.argv.includes("--confirm-production")
if (!TARGETS[target]) {
  console.error("Usage: node scripts/seed-staging.mjs <staging|production> [--confirm-production]")
  process.exit(2)
}
if (target === "production" && !confirmed) {
  console.error(
    "Refusing to seed production. It is deliberately empty and parked — real client\n" +
      "accounts are only ever invited there, never invented. Pass --confirm-production\n" +
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
if (!TEST_LOGIN_KEY) {
  console.error("No TEST_LOGIN_KEY in the environment — the seed can't sign anyone in.")
  process.exit(1)
}

// ── the sandbox world, in one place ──────────────────────────────────────────
//
// Obviously fictional, and never a real client's name: every company carries the
// word "Sandbox" and an SBX- reference, and every person signs in on a
// plus-addressed variant of the owner's own inbox, so the codes actually arrive.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "alaap@swiftstruck.com"
const OWNER_NAME = { firstName: "Alaap", lastName: "Kanchwala" }
const TEAM_NAME = "Kwapso sandbox"
const CLIENT_ROLE = {
  title: "Client",
  description:
    "A client login. Sees only their own accounts and the tickets they raised, plus the learning articles you publish.",
  // Anything not named here is off. A client never touches members, roles, the
  // AI agent, or anyone else's records.
  rights: {
    teams: { read: true },
    accounts: { read: true },
    portal_users: { read: true },
    learning: { read: true },
    help: { read: true, create: true },
    selectable_data: { read: true },
  },
}

/** Companies and their nesting. `code` is the reference — and the natural key. */
const COMPANIES = [
  {
    code: "SBX-COFFEE",
    name: "Sandbox Coffee Roasters",
    parent: null,
    status: "client",
    email: "hello@sandbox-coffee.example",
    phone: "+34 600 000 001",
    address: "12 Calle Ficticia, Madrid",
    currency: "EUR",
    timezone: "Europe/Madrid",
  },
  {
    code: "SBX-COFFEE-BRI",
    name: "Sandbox Coffee — Bristol",
    parent: "SBX-COFFEE",
    status: "client",
    address: "3 Invented Road, Bristol",
    currency: "GBP",
    timezone: "Europe/London",
  },
  {
    code: "SBX-COFFEE-LEE",
    name: "Sandbox Coffee — Leeds",
    parent: "SBX-COFFEE",
    status: "prospect",
    address: "9 Made-up Street, Leeds",
    currency: "GBP",
    timezone: "Europe/London",
  },
  {
    code: "SBX-CYCLE",
    name: "Sandbox Cycle Works",
    parent: null,
    status: "client",
    email: "hello@sandbox-cycle.example",
    phone: "+44 7700 900002",
    address: "45 Pretend Lane, Manchester",
    currency: "GBP",
    timezone: "Europe/London",
  },
]

/** The people. `email` is the natural key AND how they sign in. `links` names
 * the companies they are a contact of — Jo is on two, which is the only way to
 * exercise the account switcher. `portal` decides who gets a login. */
const PEOPLE = [
  {
    email: "alaap+priya@swiftstruck.com",
    name: "Priya Raman",
    firstName: "Priya",
    lastName: "Raman",
    phone: "+34 600 000 011",
    portal: true,
    links: [{ code: "SBX-COFFEE", relationship: "Main contact", main: true }],
  },
  {
    email: "alaap+tom@swiftstruck.com",
    name: "Tom Alder",
    firstName: "Tom",
    lastName: "Alder",
    phone: "+44 7700 900011",
    portal: true,
    links: [{ code: "SBX-CYCLE", relationship: "Owner", main: true }],
  },
  {
    email: "alaap+jo@swiftstruck.com",
    name: "Jo Vance",
    firstName: "Jo",
    lastName: "Vance",
    phone: "+44 7700 900012",
    portal: true,
    links: [
      { code: "SBX-COFFEE", relationship: "Finance", main: false },
      { code: "SBX-CYCLE", relationship: "Finance", main: false },
    ],
  },
  {
    // A contact with no login — the ordinary case, and proof that a contact and
    // a login are two different things.
    email: "alaap+nils@swiftstruck.com",
    name: "Nils Ekberg",
    firstName: "Nils",
    lastName: "Ekberg",
    phone: "+44 7700 900013",
    portal: false,
    links: [{ code: "SBX-COFFEE-BRI", relationship: "Site manager", main: true }],
  },
]

/** Dropdown values on top of the ones every new team is born with. */
const DROPDOWNS = [
  { type: "Help type", value: "Delivery question" },
  { type: "Help type", value: "Billing question" },
]

const ARTICLES = [
  {
    title: "Welcome to your client portal",
    category: "Getting started",
    body:
      "This is where you can see your own work with us: your company details, the people we have on file for you, and every question you have raised.\n\nYou only ever see your own company. If you work with us for more than one, use the account switcher at the top to move between them.",
  },
  {
    title: "Raising a question that gets answered fast",
    category: "Getting started",
    body:
      "Open Help and describe what happened in plain words: what you expected, what you got, and where you were when it happened.\n\nPick a type so it reaches the right person, and add a link to a screen recording if you have one. You will get a reply on the same conversation.",
  },
  {
    title: "Who sees what",
    category: "How we work",
    body:
      "Your login is tied to your company. You see your company, anything nested under it, and the questions you raised — nothing belonging to anyone else.\n\nOur team can see every account, because that is the job. Access can be switched off at any time, and your records stay exactly where they are.",
  },
]

/** Tickets, keyed by who raises them. The description is the natural key. */
const TICKETS = [
  {
    by: "alaap+priya@swiftstruck.com",
    helpType: "Bug report",
    description: "The Bristol delivery note is showing last week's date instead of today's.",
    status: "in_progress",
    reply:
      "Thanks Priya — we can see it too. The date is coming from the delivery template rather than the order, and we're fixing it today.",
  },
  {
    by: "alaap+priya@swiftstruck.com",
    helpType: "Delivery question",
    description: "Could we add a second delivery address for the Leeds pickup?",
  },
  {
    by: "alaap+tom@swiftstruck.com",
    helpType: "How to use ?",
    description: "How do I add a colleague so they can see our account too?",
    status: "resolved",
  },
  {
    by: "alaap+tom@swiftstruck.com",
    helpType: "Billing question",
    description: "The total on our March statement looks higher than the orders we placed.",
  },
  {
    by: "alaap+jo@swiftstruck.com",
    helpType: "Feature request",
    description: "Can we get the monthly summary as a spreadsheet we can open in Excel?",
  },
  {
    by: OWNER_EMAIL,
    helpType: "Feature request",
    description: "Sandbox: check the new account screens on a phone before the next demo.",
  },
]

/** The one ticket raised by US, not by a client. The fence check asserts a client
 * never sees it, and reads it from here so the two can never drift apart. */
const OURS = TICKETS[TICKETS.length - 1]

// ── the plumbing ─────────────────────────────────────────────────────────────

let changed = 0
let reused = 0
let failures = 0

/** One line per record, in the same shape every time: what happened, then what
 * it happened to. Anything but "reused" is a write, and a second run should
 * print none of those — that is the idempotency claim, said out loud. */
const say = (verb, what) => {
  if (verb === "reused") reused++
  else changed++
  console.log(`  ${verb.padEnd(7)} ${what}`)
}
const step = (title) => console.log(`\n${title}`)
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`)
  if (!ok) failures++
}

const api = makeApi(BASE)

const post = (path, payload, cookie) =>
  api(path, { method: "POST", body: JSON.stringify(payload ?? {}) }, cookie)

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

/** Walk every page of a keyset-paged read. The sandbox is small, so the loop
 * has a hard stop: a seed must never become an unbounded read of its own. */
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
  // A SHORT READ MUST NOT LOOK LIKE A COMPLETE ONE. This feeds the fence check
  // at the end, and that check is a NEGATIVE: "Priya cannot see the other
  // company". A truncated read makes a negative pass for the wrong reason and
  // prints "the fence holds" — the one line in this script worth more than
  // every "created" line above it. So stopping early is a failure, loudly.
  throw new Error(`${path}: more than 25 pages — refusing to report a partial read as complete`)
}

// ── 1 · the agency side: a signed-in owner, standing in the sandbox team ──────

console.log(`\nSeeding the sandbox on ${TARGETS[target].label} (${BASE})`)

step("Signing in")
const staff = await signIn(OWNER_EMAIL, OWNER_NAME)
// Not a record, so it stays out of the counts below — the tally is about rows.
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
    "creating the sandbox team"
  )
  teams = must(await api("/api/tenancy/teams", {}, staff.cookie), "re-reading your teams").teams ?? []
  team = teams.find((t) => t.name === TEAM_NAME)
  say("created", `team "${TEAM_NAME}"`)
} else {
  say("reused", `team "${TEAM_NAME}"`)
}
must(await post("/api/tenancy/switch-team", { teamId: team.id }, staff.cookie), "switching to the sandbox team")
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

// ── 3 · dropdown values ──────────────────────────────────────────────────────

step("Dropdown values")
let dropdowns = must(await api("/api/tenancy/selectable", {}, staff.cookie), "reading dropdown values").values ?? []
for (const d of DROPDOWNS) {
  if (dropdowns.some((v) => v.type === d.type && v.value === d.value && v.active)) {
    say("reused", `${d.type} → ${d.value}`)
    continue
  }
  dropdowns = must(await post("/api/tenancy/selectable", d, staff.cookie), `adding ${d.value}`).values ?? dropdowns
  say("created", `${d.type} → ${d.value}`)
}

// ── 4 · learning articles ────────────────────────────────────────────────────

step("Learning")
let articles = must(await api("/api/content/learning", {}, staff.cookie), "reading learning").learning ?? []
for (const a of ARTICLES) {
  if (articles.some((l) => l.title === a.title)) {
    say("reused", `article "${a.title}"`)
    continue
  }
  articles = must(await post("/api/content/learning", a, staff.cookie), `adding "${a.title}"`).learning ?? articles
  say("created", `article "${a.title}"`)
}

// ── 5 · accounts: the companies, their nesting, and the people ───────────────

step("Accounts")
/** Every account this team holds, keyed the two ways the seed matches on. */
async function readAccounts() {
  const rows = await allPages("/api/tenancy/accounts", "accounts", staff.cookie)
  return {
    byCode: new Map(rows.filter((a) => a.code).map((a) => [a.code, a])),
    byEmail: new Map(rows.filter((a) => a.email).map((a) => [a.email.toLowerCase(), a])),
  }
}
let accounts = await readAccounts()

for (const c of COMPANIES) {
  if (accounts.byCode.has(c.code)) {
    say("reused", `${c.name} (${c.code})`)
    continue
  }
  const parentAccountId = c.parent ? accounts.byCode.get(c.parent)?.id : undefined
  must(
    await post(
      "/api/tenancy/accounts",
      {
        accountType: "entity",
        name: c.name,
        parentAccountId,
        code: c.code,
        status: c.status,
        email: c.email,
        phone: c.phone,
        address: c.address,
        currency: c.currency,
        timezone: c.timezone,
      },
      staff.cookie
    ),
    `creating ${c.name}`
  )
  accounts = await readAccounts()
  say("created", `${c.name} (${c.code})${c.parent ? ` — nested under ${c.parent}` : ""}`)
}

step("Contacts")
for (const p of PEOPLE) {
  if (!accounts.byEmail.has(p.email)) {
    must(
      await post(
        "/api/tenancy/accounts",
        { accountType: "individual", name: p.name, email: p.email, phone: p.phone, status: "client" },
        staff.cookie
      ),
      `creating ${p.name}`
    )
    accounts = await readAccounts()
    say("created", `${p.name} (${p.email})`)
  } else {
    say("reused", `${p.name} (${p.email})`)
  }
  const person = accounts.byEmail.get(p.email)
  for (const link of p.links) {
    const company = accounts.byCode.get(link.code)
    const detail = must(
      await api(`/api/tenancy/accounts/detail?id=${company.id}`, {}, staff.cookie),
      `reading ${company.name}`
    )
    if ((detail.links ?? []).some((l) => l.personAccountId === person.id && l.active)) {
      say("reused", `${p.name} is a contact of ${company.name}`)
      continue
    }
    must(
      await post(
        "/api/tenancy/accounts/links",
        {
          accountId: company.id,
          personAccountId: person.id,
          relationship: link.relationship,
          isMainStakeholder: link.main,
        },
        staff.cookie
      ),
      `linking ${p.name} to ${company.name}`
    )
    say("created", `${p.name} is a contact of ${company.name} (${link.relationship})`)
  }
}

// ── 6 · portal logins, then team membership — in that order ──────────────────
//
// The order is not a preference. A login is granted to somebody who is NOT yet a
// team member (the grant door refuses to turn staff into a client), and the
// person can only reach any door once they ARE a member holding the Client role.
// So: sign them in so they exist → grant the login → invite → they accept.

step("Portal logins")
const sessions = new Map() // email → { cookie, userId }
for (const p of PEOPLE.filter((x) => x.portal)) {
  // Signing in is what puts them in the platform's user list; the grant door
  // looks them up by the email on their contact record, never by a typed-in id.
  const session = await signIn(p.email, { firstName: p.firstName, lastName: p.lastName })
  sessions.set(p.email, session)

  const logins = must(await api("/api/tenancy/portal-users", {}, staff.cookie), "reading portal logins").portalUsers ?? []
  const person = accounts.byEmail.get(p.email)
  if (logins.some((l) => l.accountId === person.id && l.active)) {
    say("reused", `portal access for ${p.name}`)
  } else {
    must(
      // The login hangs off the PERSON's own record — that is what the guard
      // corridor reads to work out which companies they may stand in.
      await post("/api/tenancy/portal-users", { accountId: person.id, personAccountId: person.id }, staff.cookie),
      `granting portal access to ${p.name}`
    )
    say("created", `portal access for ${p.name}`)
  }

  const members = must(await api("/api/tenancy/members", {}, staff.cookie), "reading members").members ?? []
  if (members.some((m) => m.email?.toLowerCase() === p.email)) {
    say("reused", `${p.name} is on the team as ${CLIENT_ROLE.title}`)
    continue
  }
  const invites = must(await api("/api/tenancy/invites", {}, staff.cookie), "reading invites").invites ?? []
  if (!invites.some((i) => i.email?.toLowerCase() === p.email && i.status === "pending")) {
    must(
      await post("/api/tenancy/invites", { email: p.email, roleId: clientRole.id }, staff.cookie),
      `inviting ${p.name}`
    )
    say("created", `invite for ${p.name} as ${CLIENT_ROLE.title}`)
  }
  // Onboarding accepts every pending invite — the same door a real person walks
  // through after clicking the link in their email.
  must(await post("/api/tenancy/bootstrap", {}, session.cookie), `${p.name} joining the team`)
  const joined = must(await api("/api/tenancy/members", {}, staff.cookie), "re-reading members").members ?? []
  if (!joined.some((m) => m.email?.toLowerCase() === p.email)) {
    console.error(`\nStopped: ${p.name} didn't join the team — their invite may already be spent.`)
    process.exit(1)
  }
  say("created", `${p.name} joined the team as ${CLIENT_ROLE.title}`)
}

// ── 7 · tickets, raised by the people who would really raise them ────────────

step("Help")
/** Everything the given session may see, matched on the description. */
const ticketsFor = (cookie) => allPages("/api/content/help?scope=all", "tickets", cookie)
const staffTickets = await ticketsFor(staff.cookie)

for (const t of TICKETS) {
  const raiser = t.by === OWNER_EMAIL ? staff : sessions.get(t.by)
  const mine = t.by === OWNER_EMAIL ? staffTickets : await ticketsFor(raiser.cookie)
  let ticket = mine.find((x) => x.description === t.description)
  if (ticket) {
    say("reused", `ticket "${t.description.slice(0, 52)}…"`)
  } else {
    must(
      await post("/api/content/help", { description: t.description, helpType: t.helpType }, raiser.cookie),
      "raising a ticket"
    )
    ticket = (await ticketsFor(raiser.cookie)).find((x) => x.description === t.description)
    say("created", `ticket "${t.description.slice(0, 52)}…"`)
  }

  // A status the agency would have moved it to. Idempotent on the server (the
  // current status rides the UPDATE), but read first so the run reports honestly.
  if (t.status && ticket.status !== t.status) {
    must(await post("/api/content/help/status", { id: ticket.id, status: t.status }, staff.cookie), "moving a ticket")
    say("updated", `that ticket moved to ${t.status.replace("_", " ")}`)
  }

  // One real conversation, so the thread isn't empty on the demo.
  if (t.reply) {
    const thread = must(
      await api(`/api/content/help/thread?id=${ticket.id}`, {}, staff.cookie),
      "reading a ticket's conversation"
    ).replies ?? []
    if (thread.some((r) => r.body === t.reply)) {
      say("reused", "a reply on that ticket")
    } else {
      must(await post("/api/content/help/reply", { helpId: ticket.id, body: t.reply }, staff.cookie), "replying")
      say("created", "a reply on that ticket")
    }
  }
}

// ── 8 · the fence, checked from the outside ──────────────────────────────────
//
// Everything above ran as somebody with the right to write it. This last part
// asks the only question that matters afterwards: standing inside one client's
// login, can you reach another client's world? A pass here is worth more than
// every "created" line above.

step("Checking the fence from a client login")
const priya = sessions.get("alaap+priya@swiftstruck.com")
const tom = sessions.get("alaap+tom@swiftstruck.com")
const jo = sessions.get("alaap+jo@swiftstruck.com")
const coffee = accounts.byCode.get("SBX-COFFEE")
const cycle = accounts.byCode.get("SBX-CYCLE")

const seen = await allPages("/api/tenancy/accounts", "accounts", priya.cookie)
const seenIds = new Set(seen.map((a) => a.id))
// The positive half first: a fence that refuses everybody isn't a fence, it's a
// broken door — and it would pass a refusal-only check perfectly.
check(
  "Priya sees her own company and everything nested under it",
  seenIds.has(coffee.id) &&
    seenIds.has(accounts.byCode.get("SBX-COFFEE-BRI").id) &&
    seenIds.has(accounts.byCode.get("SBX-COFFEE-LEE").id),
  `saw ${seen.map((a) => a.name).join(", ") || "nothing"}`
)
check(
  "Priya cannot see the other company or its people",
  !seenIds.has(cycle.id) && !seenIds.has(accounts.byEmail.get("alaap+tom@swiftstruck.com").id),
  `saw ${seen.map((a) => a.name).join(", ")}`
)
const reachedByName = await api(`/api/tenancy/accounts?q=${encodeURIComponent("Sandbox Cycle")}`, {}, priya.cookie)
check(
  "naming the other company in a search tells Priya nothing",
  reachedByName.status === 200 && (reachedByName.body?.accounts ?? []).length === 0,
  JSON.stringify(reachedByName.body).slice(0, 160)
)
const reachedById = await api(`/api/tenancy/accounts/detail?id=${cycle.id}`, {}, priya.cookie)
check(
  "opening the other company by id is refused",
  reachedById.status === 404,
  `got ${reachedById.status}`
)

const priyaTickets = await ticketsFor(priya.cookie)
const tomTickets = await ticketsFor(tom.cookie)
const tomIds = new Set(tomTickets.map((t) => t.id))

// A NEGATIVE CHECK IS ONLY WORTH ANYTHING IF THERE IS SOMETHING TO FIND.
// "Priya cannot see our internal ticket" passes trivially when that ticket does
// not exist — which is exactly how a fence test can stay green over an open
// hole. So prove it exists first, from the one account that should see it.
const oursSeenByUs = (await ticketsFor(staff.cookie)).some((t) => t.description === OURS.description)
check(
  "our own internal question exists, so the next check has something to catch",
  oursSeenByUs,
  oursSeenByUs ? "" : "the agency's own ticket is missing — the negative below would pass for nothing"
)
check(
  "Priya sees the questions she raised",
  priyaTickets.length > 0 && priyaTickets.every((t) => TICKETS.some((s) => s.description === t.description)),
  `saw ${priyaTickets.length}`
)
check(
  "Priya sees none of the other client's questions, and none of ours",
  priyaTickets.every((t) => !tomIds.has(t.id)) &&
    // Derived from TICKETS, never retyped: a hand-copied prefix means rewording
    // the seed ticket silently turns this negative check into a no-op.
    !priyaTickets.some((t) => t.description === OURS.description),
  priyaTickets.map((t) => t.description.slice(0, 40)).join(" | ")
)

const priyaStanding = must(await api("/api/tenancy/portal/context", {}, priya.cookie), "reading Priya's standing")
const joStanding = must(await api("/api/tenancy/portal/context", {}, jo.cookie), "reading Jo's standing")
check("Priya stands in one company", (priyaStanding.accounts ?? []).length === 1)
check(
  "Jo can stand in two, one at a time (the account switcher)",
  (joStanding.accounts ?? []).length === 2,
  JSON.stringify(joStanding).slice(0, 160)
)

// ── 9 · what happened, and where to look ─────────────────────────────────────

// Leave no session lying around — the seed signed in as four people.
for (const s of [staff, ...sessions.values()]) await post("/api/auth/logout", {}, s.cookie)

console.log(
  `\nWrote ${changed} thing${changed === 1 ? "" : "s"}, left ${reused} that were already there.` +
    (changed === 0 ? " Nothing to do — the sandbox was already seeded." : "")
)
console.log("\nOpen these to see it:")
console.log(`  ${BASE}/accounts            the sandbox companies and their people`)
console.log(`  ${BASE}/t/${TEAM_ID}/accounts/${coffee.id}`)
console.log("                              Sandbox Coffee Roasters — contacts, logins, activity")
console.log(`  ${BASE}/help                the tickets, ours and the clients'`)
console.log(`  ${BASE}/learning            the three articles`)
console.log(`  ${BASE}/members             the team, including the client logins`)
console.log("\nSign in as a client with alaap+priya@…, alaap+tom@… or alaap+jo@swiftstruck.com")
console.log("(the code lands in your own inbox; Jo is the one with two companies to switch between).")

console.log(failures ? `\nSEED FAILED — ${failures} fence check(s) did not pass.` : "\nSEED OK — the fence holds.")
process.exit(failures ? 1 : 0)
