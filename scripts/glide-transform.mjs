#!/usr/bin/env node
// Turn the pulled Glide rows into the shape THIS app can hold — and say honestly
// what has no home yet.
//
//   node scripts/glide-transform.mjs
//
// Reads glide/data/, writes glide/normalised.json (git-ignored — it is the same
// customer data in another shape), and prints a per-table summary: rows in, rows
// mapped, rows deferred, rows rejected and why.
//
// THREE RULES.
//
// 1. NOTHING IS INVENTED AND NOTHING IS TRANSLATED. Every value here came out of
//    a Glide cell. Three quarters of the ticket history exists only in German;
//    it is carried in German. Both languages are kept side by side, because
//    "which language is the record" is the owner's decision (RECONCILIATION §4.1)
//    and a transform that picks one silently makes it for them.
// 2. NOTHING IS DROPPED SILENTLY. A table with no home today goes to `deferred`
//    with its row count and the module it is waiting for. A row whose parent is
//    missing is REJECTED and counted, with the reason. The summary adds up.
// 3. THE MAPPING IS DERIVED, NOT ASSUMED. Glide column ids are five opaque
//    characters. Every foreign key below was resolved by testing the column's
//    values against every table's row ids, and every label by reading the values.
//    Where that disagreed with RECONCILIATION.md, the data won — see CORRECTIONS.

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DATA_DIR = resolve(ROOT, "glide/data")
const OUT = resolve(ROOT, "glide/normalised.json")

// ── the column map ───────────────────────────────────────────────────────────
// Glide stores column ids, not names. This block is the whole translation, in
// one place, so a wrong guess is one line to fix rather than a hunt.

const CUSTOMER = {
  name: "LoM8i",
  legalName: "dMbUL",
  description: "FBJAw",
  email: "aW2YY",
  phone: "B48wf",
  website: "Jl0Rk",
  industry: "f29Du",
  vat: "VFtG2",
  language: "Zc406",
  source: "TtLzs",
  status: "ngHBG", // → choices, group "Customers": Active / Archived
  logo: "UABQC",
  photo: "lfClr",
  street: "Fi04u",
  city: "lTZIw",
  postcode: "5Oyda",
  region: "aDsuB",
  country: "HTt36",
  driveFolder: "3Lk9G",
}

const CONTACT = {
  name: "Name",
  email: "Email",
  jobTitle: "Role",
  customer: "8Tvk0", // → customers
  phone: "gfq6R",
  photo: "Photo",
  linkedin: "CiiFg",
}

const USER = { name: "Name", lastName: "FOVYf", email: "Email", jobTitle: "Role", photo: "Photo" }

const TICKET = {
  reporterEmail: "Gehuq",
  app: "yfSX5", // → apps
  customer: "1IIIp", // → customers
  module: "URmJs", // → modules
  createdAt: "72pZY",
  resolvedAt: "FGyEf",
  resolved: "9v8Yu",
  number: "fGKgz",
  type: "iUxUL", // the plain word; zUt3Z is the same value as a choices row id
  titleDe: "qQIlW",
  bodyDe: "LLlko",
  titleEn: "hw0p3",
  bodyEn: "4mMrT",
  solution: "vDNz5",
  answer: "K8bRb",
  accountCode: "i3vbH",
  assignee: "f4XNi",
  staff: "uPXaH", // → users, comma separated
  moduleName: "RlpuG",
}

const COMMENT = { body: "Name", createdAt: "CqWyo", authorName: "o1Fd4", ticket: "fI0Gr", backlog: "e7FGR", customer: "eZ6Lx" }

const CONTENT = {
  title: "uBJrY",
  status: "2jkpF", // → choices, group "Content/Status"
  format: "JQ4vO", // → choices, group "Content/Format"
  channel: "xPknd",
  author: "ybPAX",
  createdAt: "tTRii",
  publishedAt: "lrKU0",
  link: "WlcBr",
  body: "QU8lD",
  longBody: "fPyzO",
  altBody: "bJ31C",
  image: "wUxcd",
  hashtags: "EoPZM",
  sources: "B3Bg2",
}

// choices: `B0cSY` is the VALUE, `Name` is the GROUP it belongs to (Tickets,
// Backlog, Customers, Countries…), `OpbEc` is the KIND (Status, Type, Language…).
const CHOICE = { value: "B0cSY", group: "Name", kind: "OpbEc" }

/** Glide dropdown group+kind → the selectable-data group THIS app has. Anything
 * not named here belongs to a module that does not exist yet, so it is deferred
 * rather than seeded — a dropdown for a screen nobody can open is clutter.
 *
 * "Learning category" is deliberately absent: Glide's Content/Status values are
 * a publication state (Idea, In Process, Published), not a subject, and filing
 * them under category would put the wrong word in front of the reader. The
 * article's CHANNEL is the real grouping, and the learning door creates that
 * category itself on first use (pick-or-create). */
const DROPDOWN_HOMES = {
  "Tickets/Type": "Help type",
  "Content/Format": "File type",
}

/** Glide's customer state → the account's commercial lifecycle (DATA-MODEL:
 * prospect → client → past client). Two words map; anything else is left unset
 * rather than guessed into the wrong one. */
const ACCOUNT_STATUS = { Active: "client", Archived: "past client" }

/** Tables with nowhere to land today. The note names what each is waiting for —
 * the work engine, mostly. Counted, never dropped. */
const DEFERRED_NOTES = {
  apps: "The work engine's missing noun — a customer's app is the unit of work everything else hangs off.",
  modules: "A feature inside an app; belongs with apps in the work engine.",
  backlog: "Stories (SCOPE's word). Waiting on the work engine's story board.",
  tasks: "To-dos (SCOPE ch.07). Links to tickets, apps and departments at once — the owner's open decision 2.",
  worklog: "Logged time — 2,187 hours of it. Waiting on the work engine's time record.",
  sprints: "Sprints, under an app. Work engine.",
  meetings: "SCOPE ch.13 logs a meeting as work. Work engine.",
  deliverables: "A delivered artefact under an app. Work engine.",
  assets: "Per-module assets, carrying the savings maths already computed. Work engine.",
  milestones: "Empty in Glide (0 rows) — nothing to carry, listed so the zero is on the record.",
  certificates: "Staff certifications — a team page, not a system record (owner decision 4).",
  program: "The delivery method behind meetings. Agency-internal; no module planned.",
  purposes: "Meeting purposes, under departments. Agency-internal; no module planned.",
  departments: "Agency-internal grouping. The base has roles, not departments — no home, and no plan for one.",
  channels: "Marketing channels behind the content pipeline. Agency-internal.",
  branding: "A 74-row brand asset library. Agency-internal; the rescued files are in glide/files/.",
  roles: "NOT roles — one row PER PERSON (see CORRECTIONS). The base's permission matrix is the spine; carrying this would be a second, weaker one.",
}

// ── read ─────────────────────────────────────────────────────────────────────

if (!existsSync(DATA_DIR)) {
  console.error(`No ${DATA_DIR}. Run scripts/glide-pull.mjs first.`)
  process.exit(1)
}

/** The agency app and the client portal are the SAME rows behind one filter, so
 * only the agency copy is read. `sameAsAgency` proves that rather than trusting
 * it — a portal file that had drifted would be a finding, not a shrug. */
const read = (table) => {
  const file = resolve(DATA_DIR, `agency.${table}.json`)
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).rows ?? [] : []
}
const src = {}
for (const t of [
  "customers", "contacts", "users", "roles", "departments", "choices", "tickets", "comments",
  "content", "apps", "modules", "backlog", "tasks", "worklog", "sprints", "meetings",
  "deliverables", "assets", "milestones", "certificates", "program", "purposes", "channels", "branding",
]) src[t] = read(t)

const portalDrift = []
for (const t of ["customers", "contacts", "tickets", "apps", "modules", "sprints", "deliverables", "choices"]) {
  const file = resolve(DATA_DIR, `portal.${t}.json`)
  if (!existsSync(file)) continue
  const mirror = JSON.parse(readFileSync(file, "utf8")).rows ?? []
  const ours = new Set(src[t].map((r) => r.$rowID))
  const strays = mirror.filter((r) => !ours.has(r.$rowID)).length
  if (mirror.length !== src[t].length || strays) portalDrift.push(`${t}: portal ${mirror.length} vs agency ${src[t].length}, ${strays} unknown ids`)
}

// ── helpers ──────────────────────────────────────────────────────────────────

const text = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "")
const truthy = (v) => v === true || v === "true"
const iso = (v) => {
  const d = new Date(text(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const lower = (v) => text(v).toLowerCase()

/** Is this actually an address? Eight contacts carry "-" where an email should
 * be, and eight different people all matching on "-" is how a de-duplication
 * quietly deletes seven of them. A placeholder is not an identity. */
const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lower(v))
const emailOrNull = (v) => (isEmail(v) ? lower(v) : null)

const byId = (rows) => new Map(rows.map((r) => [r.$rowID, r]))
const choiceById = byId(src.choices)
const choiceValue = (id) => text(choiceById.get(text(id))?.[CHOICE.value]) || null

/** rows in / mapped / deferred / rejected, per source table. Every branch below
 * calls one of these, so the printed table is the code's own arithmetic. */
const tally = {}
const counter = (table, rowsIn) => {
  const t = (tally[table] ??= { rowsIn, mapped: 0, deferred: 0, rejected: 0, reasons: {} })
  return {
    mapped: () => t.mapped++,
    deferred: (n = 1) => (t.deferred += n),
    rejected: (why) => {
      t.rejected++
      t.reasons[why] = (t.reasons[why] ?? 0) + 1
    },
  }
}

// ── customers → accounts (entity) ────────────────────────────────────────────

const cust = counter("customers", src.customers.length)

/** The short account reference (CONFIA, BERG) staff already use. It lives on the
 * TICKETS, not on the customer, so it is read back from the tickets that name
 * the customer — the most-used spelling wins. */
const codeForCustomer = new Map()
{
  const votes = new Map()
  for (const t of src.tickets) {
    const c = text(t[TICKET.customer])
    const code = text(t[TICKET.accountCode])
    if (!c || !code) continue
    const m = votes.get(c) ?? new Map()
    m.set(code, (m.get(code) ?? 0) + 1)
    votes.set(c, m)
  }
  for (const [c, m] of votes) codeForCustomer.set(c, [...m].sort((a, b) => b[1] - a[1])[0][0])
}

const addressOf = (r) =>
  [text(r[CUSTOMER.street]), [text(r[CUSTOMER.postcode]), text(r[CUSTOMER.city])].filter(Boolean).join(" "), text(r[CUSTOMER.region]), text(r[CUSTOMER.country])]
    .filter(Boolean)
    .join("\n") || null

const accounts = []
const companyByGlideId = new Map()

for (const r of src.customers) {
  const name = text(r[CUSTOMER.name])
  if (!name) {
    cust.rejected("no name — an account with no name cannot be addressed or found")
    continue
  }
  const account = {
    glideId: r.$rowID,
    kind: "entity",
    name,
    code: codeForCustomer.get(r.$rowID) ?? null,
    email: text(r[CUSTOMER.email]) || null,
    phone: text(r[CUSTOMER.phone]) || null,
    address: addressOf(r),
    locale: text(r[CUSTOMER.language]) || null,
    status: ACCOUNT_STATUS[choiceValue(r[CUSTOMER.status])] ?? null,
    // Carried, with no column to land in today. Named rather than dropped so the
    // next person knows the data exists and where it came from.
    unhoused: {
      legalName: text(r[CUSTOMER.legalName]) || null,
      description: text(r[CUSTOMER.description]) || null,
      website: text(r[CUSTOMER.website]) || null,
      industry: text(r[CUSTOMER.industry]) || null,
      vatNumber: text(r[CUSTOMER.vat]) || null,
      source: text(r[CUSTOMER.source]) || null,
      logoUrl: text(r[CUSTOMER.logo]) || null,
      driveFolder: text(r[CUSTOMER.driveFolder]) || null,
    },
  }
  accounts.push(account)
  companyByGlideId.set(r.$rowID, account)
  cust.mapped()
}

// ── contacts → accounts (individual) + links + the parent pointer ────────────
//
// 104 rows, 96 people: Glide had no way to say "one person, two companies", so a
// person who contacts two of them is held twice. The de-duplication is on the
// email address; account_links is what the second row was trying to be.

const con = counter("contacts", src.contacts.length)
const people = []
const personByGlideId = new Map()
const personByKey = new Map()

for (const r of src.contacts) {
  const name = text(r[CONTACT.name]).replace(/\s+/g, " ")
  const email = emailOrNull(r[CONTACT.email])
  if (!name && !email) {
    con.rejected("no name and no real email — nothing to identify the person by")
    continue
  }
  // A real address is the identity; a person with only a placeholder falls back
  // to their name, which is the best the source offers.
  const key = email ?? `name:${name.toLowerCase()}`
  let person = personByKey.get(key)
  if (person) {
    person.mergedFrom.push(r.$rowID)
    con.mapped()
  } else {
    person = {
      glideId: r.$rowID,
      mergedFrom: [],
      kind: "individual",
      name: name || email,
      email,
      phone: text(r[CONTACT.phone]) || null,
      unhoused: { jobTitle: text(r[CONTACT.jobTitle]) || null, photoUrl: text(r[CONTACT.photo]) || null, linkedin: text(r[CONTACT.linkedin]) || null },
      companyGlideIds: [],
    }
    personByKey.set(key, person)
    people.push(person)
    con.mapped()
  }
  personByGlideId.set(r.$rowID, person)

  const company = text(r[CONTACT.customer])
  if (!company) continue
  if (!companyByGlideId.has(company)) {
    con.rejected("names a company that is not in the customers table")
    continue
  }
  if (!person.companyGlideIds.includes(company)) person.companyGlideIds.push(company)
  // The job title is the closest thing the source has to "what this person is to
  // this company", which is what the link's relationship means.
  if (!person.jobTitleFor) person.jobTitleFor = {}
  person.jobTitleFor[company] = text(r[CONTACT.jobTitle]) || null
}

const accountLinks = []
for (const p of people) {
  accounts.push({
    glideId: p.glideId,
    kind: "individual",
    name: p.name,
    email: p.email,
    phone: p.phone,
    // ONE parent, so only a person who belongs to exactly one company gets the
    // pointer. Somebody who acts for two is precisely what account_links exists
    // for — a single parent has room for one (DATA-MODEL, the customer spine).
    parentGlideId: p.companyGlideIds.length === 1 ? p.companyGlideIds[0] : null,
    unhoused: p.unhoused,
  })
  for (const company of p.companyGlideIds) {
    accountLinks.push({
      accountGlideId: company,
      personGlideId: p.glideId,
      relationship: p.jobTitleFor?.[company] ?? null,
      isMainStakeholder: false,
    })
  }
}

// ── users / roles / departments → the agency's own people ────────────────────
//
// `roles` turned out NOT to be a role list (see CORRECTIONS): four rows, one per
// person, each a bespoke permission sheet. There is no shared role to carry, so
// the staff come across as people and the base's own matrix stays the spine.

const usr = counter("users", src.users.length)
const teamMembers = []
for (const r of src.users) {
  const email = emailOrNull(r[USER.email])
  if (!email) {
    usr.rejected("no email — a member is invited by address, so there is nothing to invite")
    continue
  }
  teamMembers.push({
    glideId: r.$rowID,
    name: [text(r[USER.name]), text(r[USER.lastName])].filter(Boolean).join(" "),
    firstName: text(r[USER.name]),
    lastName: text(r[USER.lastName]),
    email,
    jobTitle: text(r[USER.jobTitle]) || null,
    unhoused: { photoUrl: text(r[USER.photo]) || null },
  })
  usr.mapped()
}
const staffNames = new Map(src.users.map((r) => [r.$rowID, text(r[USER.name])]))

counter("roles", src.roles.length).deferred(src.roles.length)
counter("departments", src.departments.length).deferred(src.departments.length)

// ── choices → selectable data ────────────────────────────────────────────────

const cho = counter("choices", src.choices.length)
const selectableData = []
const seenChoice = new Set()
const deferredChoices = {}
for (const r of src.choices) {
  const value = text(r[CHOICE.value])
  const group = text(r[CHOICE.group])
  const kind = text(r[CHOICE.kind])
  if (!value) {
    cho.rejected("no value — an empty dropdown option")
    continue
  }
  const home = DROPDOWN_HOMES[`${group}/${kind}`]
  if (!home) {
    const label = `${group || "(no group)"}/${kind || "(no kind)"}`
    deferredChoices[label] = (deferredChoices[label] ?? 0) + 1
    cho.deferred()
    continue
  }
  const key = `${home}::${value}`
  if (seenChoice.has(key)) {
    cho.rejected("the same option twice in one group")
    continue
  }
  seenChoice.add(key)
  selectableData.push({ type: home, value })
  cho.mapped()
}

// ── tickets → help requests ──────────────────────────────────────────────────

const tic = counter("tickets", src.tickets.length)
const com = counter("comments", src.comments.length)

/** Ticket comments become the ticket's conversation. RECONCILIATION had comments
 * hanging off backlog items and customers only; 286 of them point at a TICKET
 * (see CORRECTIONS), which is the thread the help desk already has a table for. */
const repliesByTicket = new Map()
for (const r of src.comments) {
  const ticket = text(r[COMMENT.ticket])
  if (!ticket) {
    com.deferred()
    continue
  }
  const body = text(r[COMMENT.body])
  if (!body) {
    com.rejected("no body — an empty comment")
    continue
  }
  const list = repliesByTicket.get(ticket) ?? []
  list.push({ body, createdAt: iso(r[COMMENT.createdAt]), authorName: text(r[COMMENT.authorName]) || null })
  repliesByTicket.set(ticket, list)
  com.mapped()
}
for (const list of repliesByTicket.values()) list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))

const helpRequests = []
for (const r of src.tickets) {
  const titleDe = text(r[TICKET.titleDe])
  const bodyDe = text(r[TICKET.bodyDe])
  const titleEn = text(r[TICKET.titleEn])
  const bodyEn = text(r[TICKET.bodyEn])
  if (!titleDe && !bodyDe && !titleEn && !bodyEn) {
    tic.rejected("no words in any language — nothing to show on a request")
    continue
  }
  const customer = text(r[TICKET.customer])
  if (customer && !companyByGlideId.has(customer)) {
    tic.rejected("names a company that is not in the customers table")
    continue
  }

  // The ORIGINAL wording is the record and the English is kept beside it,
  // untouched — RECONCILIATION §4.1's recommendation, and reversible from this
  // file alone because both are here. The two fields are joined because our help
  // request has ONE body; nothing is reworded to do it.
  const original = [titleDe || titleEn, bodyDe || bodyEn].filter(Boolean)
  const description = [...new Set(original)].join("\n\n")

  helpRequests.push({
    glideId: r.$rowID,
    number: text(r[TICKET.number]) || null,
    accountGlideId: customer || null,
    reporterEmail: emailOrNull(r[TICKET.reporterEmail]),
    helpType: text(r[TICKET.type]) || null,
    description,
    language: titleDe || bodyDe ? (titleEn || bodyEn ? "both" : "de") : "en",
    titleDe: titleDe || null,
    bodyDe: bodyDe || null,
    titleEn: titleEn || null,
    bodyEn: bodyEn || null,
    resolved: truthy(r[TICKET.resolved]),
    createdAt: iso(r[TICKET.createdAt]),
    resolvedAt: iso(r[TICKET.resolvedAt]),
    assignee: text(r[TICKET.assignee]) || null,
    staffNames: text(r[TICKET.staff]).split(",").map((s) => staffNames.get(s.trim())).filter(Boolean),
    solution: text(r[TICKET.solution]) || text(r[TICKET.answer]) || null,
    replies: repliesByTicket.get(r.$rowID) ?? [],
  })
  tic.mapped()
}
helpRequests.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))

// ── content → learning articles ──────────────────────────────────────────────

const cnt = counter("content", src.content.length)
// The channel is what a person would call the article's subject — "Blog Kwapso",
// "Linkedin Aurora". `uuk10` is its name.
const channelName = new Map(src.channels.map((r) => [r.$rowID, text(r.uuk10)]))
const learning = []
const seenTitle = new Set()
for (const r of src.content) {
  const title = text(r[CONTENT.title])
  if (!title) {
    cnt.rejected("no title — an article is found by its title, here and in the seed")
    continue
  }
  if (seenTitle.has(title.toLowerCase())) {
    cnt.rejected("a second article with the same title")
    continue
  }
  seenTitle.add(title.toLowerCase())
  const body = text(r[CONTENT.longBody]) || text(r[CONTENT.body]) || text(r[CONTENT.altBody])
  learning.push({
    glideId: r.$rowID,
    title,
    category: channelName.get(text(r[CONTENT.channel])) ?? null,
    publicationState: choiceValue(r[CONTENT.status]),
    contentType: choiceValue(r[CONTENT.format]),
    contentLink: text(r[CONTENT.link]) || null,
    body: body || null,
    createdAt: iso(r[CONTENT.createdAt]),
    publishedAt: iso(r[CONTENT.publishedAt]),
    authorName: staffNames.get(text(r[CONTENT.author])) ?? null,
    unhoused: { imageUrl: text(r[CONTENT.image]) || null, hashtags: text(r[CONTENT.hashtags]) || null, sources: text(r[CONTENT.sources]) || null },
  })
  cnt.mapped()
}

// ── everything with no home today ────────────────────────────────────────────

const deferred = {}
for (const [table, note] of Object.entries(DEFERRED_NOTES)) {
  const rows = src[table] ?? []
  deferred[table] = { rows: rows.length, note }
  if (!tally[table]) counter(table, rows.length).deferred(rows.length)
}
deferred.choices = { rows: Object.values(deferredChoices).reduce((a, b) => a + b, 0), note: "Dropdown options for modules that do not exist yet, by group: " + Object.entries(deferredChoices).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(", ") }
deferred.comments = { rows: tally.comments.deferred, note: "Comments on backlog items and customers — they land wherever those do (the work engine). Ticket comments are NOT here: they became the request's conversation." }

// ── what the data said that the write-up did not ─────────────────────────────

const CORRECTIONS = [
  "roles (4 rows) is not a role list — it is one row PER PERSON, and users.yEOtM points at it. Every staff member had a bespoke permission sheet; there were no shared roles to carry. RECONCILIATION calls it 'the base has its own permission matrix', which reaches the right answer for the wrong reason.",
  "comments also attach to TICKETS. RECONCILIATION lists comments as 'attached to backlog items and customers'; 286 of the 1,147 point at a ticket (fI0Gr) and 242 at an app (R980I). The ticket ones are a real conversation and land in help_threads today, not in a future module.",
  "tickets carry no status column. zUt3Z is the TYPE as a choices row id (the same five values as iUxUL, which is the plain word) — the group is literally 'Tickets/Type'. Open vs resolved is the flag 9v8Yu plus the date FGyEf: 1,486 resolved, 320 still open.",
  "the account reference (CONFIA) is on the TICKET, not on the customer. RECONCILIATION says 'tickets and backlog items already carry a short account code', which is right, but reads as though the customer has one — it does not, so the code has to be read back from the tickets.",
  "of the 104 contacts, only 81 name a company. 23 have no parent at all — they are not 'a contact of' anybody in the export.",
  "the ONE duplicate person is Dennis Franken, exactly as RECONCILIATION says — but eight OTHER contacts carry \"-\" in the email column, and de-duplicating on the raw value merges eight different people into one. 104 rows are 103 people, not the 96 the 'unique emails' count suggests: that count treated the placeholder as an address.",
  "788 requests exist only in German, not the ~754 RECONCILIATION estimates — the estimate counted titles, and some rows carry a German body under an English title.",
  "the customers table has no created date the migration can trust: VnwNS is filled on 11 of 20 rows and x0Sgb on 19, and neither is labelled. Ticket dates (72pZY, 1,816 of 1,820 filled, Jun 2024 → Aug 2026) are the only history dense enough to rely on.",
]

// ── write, and report ────────────────────────────────────────────────────────

const out = {
  generatedAt: new Date().toISOString(),
  source: "glide/data (agency copy; the portal copy is the same rows behind a filter)",
  corrections: CORRECTIONS,
  portalDrift,
  accounts,
  accountLinks,
  teamMembers,
  selectableData,
  learning,
  helpRequests,
  deferred,
  summary: tally,
}
writeFileSync(OUT, JSON.stringify(out, null, 2))

const pad = (s, n) => String(s).padEnd(n)
const num = (s, n) => String(s).padStart(n)
console.log(`\n${pad("source table", 14)}${num("in", 6)}${num("mapped", 8)}${num("deferred", 10)}${num("rejected", 10)}  why rejected`)
console.log("-".repeat(96))
let tIn = 0, tMap = 0, tDef = 0, tRej = 0
for (const [table, t] of Object.entries(tally).sort()) {
  tIn += t.rowsIn; tMap += t.mapped; tDef += t.deferred; tRej += t.rejected
  const why = Object.entries(t.reasons).map(([r, n]) => `${n}× ${r}`).join("; ")
  console.log(`${pad(table, 14)}${num(t.rowsIn, 6)}${num(t.mapped, 8)}${num(t.deferred, 10)}${num(t.rejected, 10)}  ${why}`)
}
console.log("-".repeat(96))
console.log(`${pad("TOTAL", 14)}${num(tIn, 6)}${num(tMap, 8)}${num(tDef, 10)}${num(tRej, 10)}`)

console.log(
  `\nWrote glide/normalised.json — ${accounts.length} accounts ` +
    `(${accounts.filter((a) => a.kind === "entity").length} companies, ${accounts.filter((a) => a.kind === "individual").length} people), ` +
    `${accountLinks.length} contact links, ${teamMembers.length} staff, ${selectableData.length} dropdown options, ` +
    `${learning.length} articles, ${helpRequests.length} help requests ` +
    `(${helpRequests.reduce((n, h) => n + h.replies.length, 0)} replies).`
)
const de = helpRequests.filter((h) => h.language === "de").length
console.log(`Of those requests, ${de} exist ONLY in German and are carried in German — the language of record is still the owner's to decide.`)
if (portalDrift.length) console.log(`\nPortal copy differs from the agency copy: ${portalDrift.join(" | ")}`)
if (tIn !== tMap + tDef + tRej) {
  console.error(`\nThe summary does not add up: ${tIn} in vs ${tMap + tDef + tRej} accounted for. A row went missing.`)
  process.exit(1)
}
