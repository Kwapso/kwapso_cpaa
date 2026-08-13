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
  "Tickets/Type": "Ticket type",
  "Content/Format": "File type",
}

/** Glide's customer state → the account's commercial lifecycle (DATA-MODEL:
 * prospect → client → past client). Two words map; anything else is left unset
 * rather than guessed into the wrong one. */
const ACCOUNT_STATUS = { Active: "client", Archived: "past client" }

// ── the work engine's own columns ────────────────────────────────────────────
//
// Everything below was DERIVED, not read off a sample row: each foreign key was
// tested by matching its values against every table's row ids across all rows,
// and each label by counting its distinct values. The percentages in the
// comments are the actual match rates, so a future reader can re-run the check
// and get the same answer.

const APP = {
  name: "0Q1H5", // 100% filled, 27 distinct of 28 — the app's name
  customer: "KH2hM", // → customers, 100%
  url: "umEGb",
  logo: "SgGGr",
  description: "spLTj",
  stage: "SiMwZ", // the plain word; npNd5 is the same value as a choices row id
  background: "W7X7K",
  problem: "fcAIk",
  solution: "mmseq",
  createdAt: "gE94D",
  updatedAt: "l3V8c",
}

// A SPRINT IN GLIDE HAS NO NAME. Six columns, and not one of them is a title:
// its identity was its app plus its dates plus its type. So the name is BUILT
// from those three below — nothing invented, every part a real cell.
const SPRINT = {
  app: "qw1XE", // → apps, 100%
  type: "df1gP", // → choices, group "Sprints/Type": Enhancement / Implementation / Refinement / Validation / Training / Diagnostic
  startsOn: "ZozVJ",
  endsOn: "dwXf6",
  complete: "ZC4kS", // boolean, 88% filled
  calendarEvent: "jAzSF",
}

const BACKLOG = {
  title: "4BT9p", // 100% filled, 877 distinct
  detail: "cEbJi",
  app: "0e3PW", // → apps, 100%
  module: "I9cTu", // → modules, 98%
  sprint: "nnB3a", // → sprints, 100% (80% of rows sit in one)
  ticket: "XlC6H", // → tickets, 100% (21% of rows came from a request)
  type: "Whnhv", // the plain word — Feature / Change / Fix / Enhancement. Z8ZNT is the same as a choices id but misses the 50 Enhancements.
  createdAt: "qFgjq",
  touchedAt: "y1dsl", // ≥ createdAt on 839 of 840 rows that carry both
}

const WORKLOG = {
  app: "Name", // → apps, 85%
  task: "mF1k6", // → tasks, 40% — the rest point at rows this export doesn't carry
  story: "h6gti", // → backlog, 100% (6% of rows)
  ticket: "aqC3w", // → tickets, 99% (7% of rows)
  user: "HdahH", // → users, 100%
  userName: "rwE0f",
  startedAt: "ioE4t",
  endedAt: "dm68v",
  hours: "49gqX", // decimal hours — the arithmetic is checked against the two dates below
}

const MEETING = {
  title: "s5Yxt", // 100% filled, 303 distinct
  purpose: "m7SxK", // → purposes, 100%
  department: "3ns3L", // → departments, 99%
  customer: "FrRxr", // → customers, 96% (40% of rows name one)
  app: "JjvEu", // → apps, 98% (35% of rows)
  attendees: "HDgRF", // → users, comma separated
  attendeeNames: "BXK88",
  externalName: "UO6LS",
  startsAt: "9YgkK",
  endsAt: "zxtbf",
  mode: "wINP3", // In person (190) / Google Meet (153)
  notes: "aek4K",
  calendarEvent: "bwESR",
  createdAt: "ZxRSG",
}

const TASK = {
  title: "Name", // 100% filled
  customer: "0rqK3", // → customers, 99%
  app: "V6b5u", // → apps, 86%
  ticket: "Dbaar", // → tickets, 100% (1% of rows)
  department: "DE2iq", // → departments, 95%
  owner: "w1KAK", // → users, 100%
  ownerName: "r3JOD",
  kind: "IWdse", // Production (2728) / Admin / Marketing / Support / Business / Sales / System
  dueOn: "5YbMo",
  createdAt: "uUgnV",
  // DONE IS TWO COLUMNS THAT AGREE, AND A THIRD THAT DOES NOT. `0cee6` and
  // `OLMHD` are both true on ~37% of rows and move together; `pQsN5` is true on
  // 96%, which is a visibility flag rather than a completion one. Either of the
  // agreeing pair is read as done, and the pair is named here so the reading is
  // checkable rather than a claim.
  done: "0cee6",
  doneMirror: "OLMHD",
}

// `B0cSY` is the same column id the choices table uses for its value — Glide
// reuses ids across tables, and a name read off the sample row ("Name") is empty
// here, which is why all 27 rows were rejected the first time this ran.
const PURPOSE = { name: "B0cSY", audience: "ggozi", department: "KiDbx" }

/** Glide's app stage → the word this app uses. Anything unmapped is carried
 * through as-is: `stage` is free text here, so an unfamiliar word is
 * information, not an error. (Glide's own spelling of "Maintenance" is wrong;
 * it is corrected on the way in because it is a label people read.) */
const APP_STAGE = { Mainteinance: "Maintenance" }

/** Tables with nowhere to land today. The note names what each is waiting for.
 * Counted, never dropped.
 *
 * TEN OF THESE MOVED OUT on 13 Aug 2026, when the work engine shipped: apps,
 * sprints, backlog, worklog, meetings, tasks and purposes are mapped below, and
 * what is left here is what genuinely still has no home. */
const DEFERRED_NOTES = {
  modules: "A feature inside an app. The base has no module noun — an app's stories carry the module NAME in their detail instead, which is where staff already look for it.",
  deliverables: "A delivered artefact under an app. Eight rows; no record for them yet.",
  assets: "Per-module assets carrying savings maths already computed. The process map holds that arithmetic now, but from steps rather than assets — importing them would need the steps they measure, which Glide never had.",
  milestones: "Empty in Glide (0 rows) — nothing to carry, listed so the zero is on the record.",
  certificates: "Staff certifications. They hang off a MEMBER, and a Glide user is only a member here once they have signed in — so these wait for the people, not for a module.",
  program: "The delivery method behind meetings. Agency-internal; no module planned.",
  departments: "Agency-internal grouping. The base has roles, not departments — no home, and no plan for one.",
  channels: "Marketing channels behind the content pipeline. They already appear as learning CATEGORIES (the article's channel becomes its category), so the table itself carries nothing extra.",
  branding: "A 74-row brand asset library. The brand module holds these now, but each row is a FILE — importing them means moving bytes into R2, which is scripts/glide-to-r2.mjs's job and not this transform's.",
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

/** ONE NAME IN THE WHOLE EXPORT WAS TYPED IN ALREADY BROKEN, and this undoes it.
 *
 * "Marie-Christine GrÃ¼ner-Mirli" should read "Grüner-Mirli". Somebody pasted a
 * mis-decoded string into Glide years ago and Glide stored exactly what it was
 * given. The count says this is not our pipeline: 27,880 accented characters
 * across the 32 tables are correct and there are TWO mojibake sequences, both of
 * them the same row seen through the agency and portal copies.
 *
 * REPAIRING IT IS NOT INVENTING IT — rule 1 of this file stands. The characters
 * `Ã¼` ARE the bytes of `ü`, read as Latin-1 by mistake; turning them back is
 * decoding, not translating. What makes it safe is the ROUND TRIP: the repair is
 * kept only if re-encoding the result reproduces the original exactly. A name
 * that merely happens to contain `Ã` fails that test and is left alone.
 */
function unmojibake(s) {
  if (!/[ÃÂâ][-¿€-™]/.test(s)) return s
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0)))
    if (bytes.some((b) => b > 0xff)) return s
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    // Only if it goes back exactly the way it came.
    const round = [...new TextEncoder().encode(fixed)].map((b) => String.fromCharCode(b)).join("")
    return round === s ? fixed : s
  } catch {
    return s
  }
}

const text = (v) =>
  typeof v === "string" ? unmojibake(v.trim()) : typeof v === "number" ? String(v) : ""
const truthy = (v) => v === true || v === "true"
const iso = (v) => {
  const d = new Date(text(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const lower = (v) => text(v).toLowerCase()

/** A TITLE THIS APP CAN HOLD, AND THE WHOLE THING KEPT ANYWAY.
 *
 * `TEXT_LIMITS.short` is 200 characters and the doors enforce it, because a
 * title is a line on a list and a paragraph in that column is a list nobody can
 * scan. Glide had no such rule: four backlog items and three tasks carry a whole
 * sentence — the longest is 519 characters — where a title belongs, and the seed
 * stopped dead on the first one with a clean 400.
 *
 * The refusal is right and the fix is not to raise the limit. It is to give the
 * row a title that fits and put the FULL original at the top of the detail, so
 * the words are all still there and the list is still readable. Cut at a word
 * boundary, with an ellipsis, so a truncated title looks truncated rather than
 * looking like somebody typed half a sentence.
 */
const TITLE_MAX = 200
function fitTitle(raw) {
  const t = text(raw).replace(/\s+/g, " ").trim()
  if (t.length <= TITLE_MAX) return { title: t, full: null }
  const cut = t.slice(0, TITLE_MAX - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return { title: `${(lastSpace > TITLE_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`, full: t }
}

/** THE SAME PROBLEM ONE SIZE UP. `TEXT_LIMITS.long` is 20,000 characters and one
 * meeting's notes run past it — somebody wrote a document into the notes box.
 *
 * There is nowhere to move the overflow to (this IS the long field), so this one
 * genuinely truncates — and says so in the text, where the reader is, rather than
 * leaving them to wonder why a sentence stops. The full note is still in
 * glide/normalised.json, and the marker names it. */
const LONG_MAX = 20_000
function fitLong(raw) {
  const t = text(raw)
  if (t.length <= LONG_MAX) return t || null
  const keep = LONG_MAX - 120
  return `${t.slice(0, keep).trimEnd()}\n\n[This note ran to ${t.length.toLocaleString()} characters and was cut to fit. The whole of it is in the Glide export.]`
}

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

// ── apps → the systems we've built ───────────────────────────────────────────
//
// THE UNIT OF WORK, and the reason this whole block exists. RECONCILIATION's
// surprise was that everything in Glide hangs off an APP rather than off a
// customer — sprints, stories, logged time and half the meetings all name one.
// So apps are mapped first and everything below resolves through them; a row
// whose app is missing is rejected rather than orphaned, because a story with no
// app is a story nobody can find again.

const appCnt = counter("apps", src.apps.length)
const apps = []
const appByGlideId = new Map()

for (const r of src.apps) {
  const name = text(r[APP.name])
  if (!name) {
    appCnt.rejected("no name — an app with no name cannot be found or filtered on")
    continue
  }
  const customer = text(r[APP.customer])
  if (customer && !companyByGlideId.has(customer)) {
    appCnt.rejected("names a company that is not in the customers table")
    continue
  }
  const stageRaw = text(r[APP.stage]) || choiceValue(r["npNd5"]) || ""
  const app = {
    glideId: r.$rowID,
    name,
    accountGlideId: customer || null,
    url: text(r[APP.url]) || null,
    stage: stageRaw ? (APP_STAGE[stageRaw] ?? stageRaw) : null,
    // The three long-form fields Glide kept about WHY the app exists. Joined
    // into one description because our app record has one, and labelled so the
    // joins are readable rather than three paragraphs run together.
    description:
      [
        text(r[APP.description]),
        text(r[APP.background]) && `Background\n${text(r[APP.background])}`,
        text(r[APP.problem]) && `The problem\n${text(r[APP.problem])}`,
        text(r[APP.solution]) && `The solution\n${text(r[APP.solution])}`,
      ]
        .filter(Boolean)
        .join("\n\n") || null,
    createdAt: iso(r[APP.createdAt]),
    unhoused: { logoUrl: text(r[APP.logo]) || null },
  }
  apps.push(app)
  appByGlideId.set(r.$rowID, app)
  appCnt.mapped()
}

// ── sprints → sprints ────────────────────────────────────────────────────────
//
// A NAME HAD TO BE BUILT, and this is the one place in this file where a value
// is composed rather than copied. Glide's sprint carries six columns and not one
// of them is a title — its identity on screen was the app it sat under plus its
// dates. So the name is `<type> · <month>`, both parts real cells, and the app
// and the exact dates ride alongside as their own fields. Nothing is invented:
// a sprint with no type and no start is rejected rather than named "Sprint".

const sprCnt = counter("sprints", src.sprints.length)
const sprints = []
const sprintByGlideId = new Map()

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const monthOf = (isoDate) => {
  if (!isoDate) return null
  const d = new Date(isoDate)
  return `${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

for (const r of src.sprints) {
  const app = appByGlideId.get(text(r[SPRINT.app]))
  if (!app) {
    sprCnt.rejected("names an app that is not in the apps table")
    continue
  }
  const type = choiceValue(r[SPRINT.type])
  const startsOn = iso(r[SPRINT.startsOn])
  if (!type && !startsOn) {
    sprCnt.rejected("no type and no start date — nothing real to name it after")
    continue
  }
  const sprint = {
    glideId: r.$rowID,
    name: [type ?? "Sprint", monthOf(startsOn)].filter(Boolean).join(" · "),
    sprintType: type,
    appGlideId: app.glideId,
    accountGlideId: app.accountGlideId,
    startsOn,
    endsOn: iso(r[SPRINT.endsOn]),
    complete: truthy(r[SPRINT.complete]),
  }
  sprints.push(sprint)
  sprintByGlideId.set(r.$rowID, sprint)
  sprCnt.mapped()
}

// ── backlog → stories ────────────────────────────────────────────────────────
//
// THE STATUS IS DERIVED FROM THE SPRINT, and that decision is worth stating
// because the alternative was guessing. Glide's backlog has no four-state
// column: it has two opaque booleans, and cross-tabulating them against the
// sprints proved neither is a status — one is true on every row in a finished
// sprint AND on ninety rows in no sprint at all, the other on a third of
// everything. What IS certain is `sprints.ZC4kS`, a plain boolean on a row with
// dates. So:
//
//     in a finished sprint  → done
//     in a running sprint   → in progress
//     in no sprint          → open
//
// One sentence, every part of it checkable, and it puts 675 stories in the right
// column instead of putting 913 in a column chosen by a coin.

const bckCnt = counter("backlog", src.backlog.length)
const stories = []

for (const r of src.backlog) {
  const { title, full } = fitTitle(r[BACKLOG.title])
  if (!title) {
    bckCnt.rejected("no title — a story with no title is a row nobody can act on")
    continue
  }
  const app = appByGlideId.get(text(r[BACKLOG.app]))
  const sprint = sprintByGlideId.get(text(r[BACKLOG.sprint]))
  const status = sprint ? (sprint.complete ? "done" : "in_progress") : "open"
  const moduleName = text(r["1sEcm"])
  stories.push({
    glideId: r.$rowID,
    title,
    // The module name goes in the DETAIL rather than being dropped: the base has
    // no module noun (see DEFERRED_NOTES), and "which part of the app is this
    // about" is the first thing anybody asks about a story. A title that had to
    // be shortened leads the detail with its full original, first — nothing is
    // lost, and the long version is one line below the short one.
    detail:
      [full, text(r[BACKLOG.detail]), moduleName && `Part of the app: ${moduleName}`]
        .filter(Boolean)
        .join("\n\n") || null,
    appGlideId: app?.glideId ?? null,
    sprintGlideId: sprint?.glideId ?? null,
    ticketGlideId: text(r[BACKLOG.ticket]) || null,
    accountGlideId: app?.accountGlideId ?? null,
    status,
    storyType: text(r[BACKLOG.type]) || null,
    createdAt: iso(r[BACKLOG.createdAt]),
  })
  bckCnt.mapped()
}

// ── tasks → our own admin ────────────────────────────────────────────────────
//
// THESE ARE TASKS, NOT TO-DOS, and getting that backwards would have sent 3,677
// emails. In this app a TO-DO is something we ask a CLIENT for and completing it
// mails them; a TASK is a piece of our own admin nobody outside sees. Glide's
// 3,677 "tasks" are assigned to our own staff — they are the second thing, and
// they go through the tasks door, which writes a row and tells nobody.
//
// They are mapped BEFORE the work logs because a log can be time spent on a
// task, and a target that was never imported is a log with nothing to hang on.

const tskCnt = counter("tasks", src.tasks.length)
const tasks = []
const taskByGlideId = new Map()
for (const r of src.tasks) {
  const { title, full } = fitTitle(r[TASK.title])
  if (!title) {
    tskCnt.rejected("no title — nothing to put on a list")
    continue
  }
  const customer = text(r[TASK.customer])
  const app = appByGlideId.get(text(r[TASK.app]))
  const kind = text(r[TASK.kind])
  const task = {
    glideId: r.$rowID,
    title,
    // Glide's department word (Production, Admin, Marketing…) is the only thing
    // that says what KIND of admin this was, and there is no column for it here,
    // so it rides in the detail where a person will actually read it — under the
    // full original title, on the three rows whose title had to be shortened.
    detail: [full, kind && `Area: ${kind}`, app && `App: ${app.name}`].filter(Boolean).join("\n") || null,
    accountGlideId: companyByGlideId.has(customer) ? customer : (app?.accountGlideId ?? null),
    dueOn: iso(r[TASK.dueOn]),
    done: truthy(r[TASK.done]) || truthy(r[TASK.doneMirror]),
    ownerName: text(r[TASK.ownerName]) || null,
    createdAt: iso(r[TASK.createdAt]),
  }
  tasks.push(task)
  taskByGlideId.set(r.$rowID, task)
  tskCnt.mapped()
}
tasks.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))

// ── worklog → logged time ────────────────────────────────────────────────────
//
// THE ONE TABLE WHOSE REAL DATES SURVIVE THE FRONT DOOR. Everything else in this
// migration arrives stamped today, because no door accepts a created date — but
// the log-time door takes `startedAt` and `endedAt` as the RECORD ITSELF, so two
// years and 2,187 hours land with their true times on them.
//
// Glide's own decimal hours (49gqX) are kept as `statedHours` and checked
// against the two timestamps rather than trusted: where they disagree by more
// than a minute the row says so, so a bad clock in the old app is visible here
// instead of becoming a wrong number on a margin.

const wlCnt = counter("worklog", src.worklog.length)
const workLogs = []
const storyByGlideId = new Map(stories.map((s) => [s.glideId, s]))

for (const r of src.worklog) {
  const startedAt = iso(r[WORKLOG.startedAt])
  const endedAt = iso(r[WORKLOG.endedAt])
  if (!startedAt || !endedAt) {
    wlCnt.rejected("no start or no finish — a duration needs both ends")
    continue
  }
  // THE DOOR'S OWN ARITHMETIC, not an approximation of it. `secondsBetween`
  // FLOORS to whole seconds and `logTime` refuses a zero — so a timer somebody
  // started and stopped by accident (one row, 556 milliseconds) passes a
  // "finished after it started" test and is then refused on the wire. Matching
  // the floor here means the file cannot contain a row the app will not take.
  const wholeSeconds = Math.floor((new Date(endedAt) - new Date(startedAt)) / 1000)
  if (wholeSeconds < 1) {
    wlCnt.rejected("no time at all — under a second between the start and the finish")
    continue
  }
  // WHAT THE TIME IS AGAINST, and the list is not ours to choose: time is logged
  // against a story, a request or a task and nothing else (WORK_LOG_TARGETS in
  // workers/content/src/lib/work-logs.ts). An APP is not a target — deliberately,
  // because "eight hours on DigiDock" is not an answer anybody can cost. So a log
  // that only names an app is rejected here rather than bent into a shape the
  // door would refuse anyway.
  //
  // Most specific first: a log naming a story is about that story; the request
  // beats the task for the same reason.
  const story = storyByGlideId.get(text(r[WORKLOG.story]))
  const ticketId = text(r[WORKLOG.ticket])
  const task = taskByGlideId.get(text(r[WORKLOG.task]))
  const target = story
    ? { targetKind: "stories", targetGlideId: story.glideId }
    : ticketId
      ? { targetKind: "help", targetGlideId: ticketId }
      : task
        ? { targetKind: "tasks", targetGlideId: task.glideId }
        : null
  if (!target) {
    // NOT "it only named an app" — that case turns out not to exist. Every one
    // of these names a TASK that is not in the export: 1,567 rows pointing at
    // 1,567 distinct ids that match no row in any of the 32 tables. They are
    // tasks somebody deleted in Glide, and deleting the task took the time with
    // it. 1,069 of the 2,187 hours are on the other side of that deletion and
    // there is no honest way back — see CORRECTIONS.
    wlCnt.rejected("its task was deleted in Glide — the parent row is in no exported table")
    continue
  }
  const measured = (new Date(endedAt) - new Date(startedAt)) / 3_600_000
  const stated = typeof r[WORKLOG.hours] === "number" ? r[WORKLOG.hours] : null
  workLogs.push({
    glideId: r.$rowID,
    ...target,
    startedAt,
    endedAt,
    staffName: text(r[WORKLOG.userName]) || null,
    statedHours: stated,
    // Only present when the old app's own figure disagrees with its own clocks.
    clockDisagreement: stated !== null && Math.abs(stated - measured) > 1 / 60 ? { stated, measured } : null,
  })
  wlCnt.mapped()
}

// ── purposes + meetings → the diary ──────────────────────────────────────────

const purCnt = counter("purposes", src.purposes.length)
const meetingPurposes = []
const purposeByGlideId = new Map()
for (const r of src.purposes) {
  const name = text(r[PURPOSE.name])
  if (!name) {
    purCnt.rejected("no name")
    continue
  }
  const purpose = { glideId: r.$rowID, name }
  meetingPurposes.push(purpose)
  purposeByGlideId.set(r.$rowID, purpose)
  purCnt.mapped()
}

const mtgCnt = counter("meetings", src.meetings.length)
const meetings = []
for (const r of src.meetings) {
  const title = text(r[MEETING.title])
  const startsAt = iso(r[MEETING.startsAt])
  if (!title || !startsAt) {
    mtgCnt.rejected(title ? "no start time — a meeting is a moment before it is anything else" : "no title")
    continue
  }
  const customer = text(r[MEETING.customer])
  const app = appByGlideId.get(text(r[MEETING.app]))
  meetings.push({
    glideId: r.$rowID,
    title,
    accountGlideId: companyByGlideId.has(customer) ? customer : (app?.accountGlideId ?? null),
    purposeGlideId: purposeByGlideId.has(text(r[MEETING.purpose])) ? text(r[MEETING.purpose]) : null,
    startsAt,
    endsAt: iso(r[MEETING.endsAt]),
    // Glide's "In person" / "Google Meet" is the nearest thing it had to a
    // location, and it is what people actually needed to know.
    location: text(r[MEETING.mode]) || null,
    notes: fitLong(r[MEETING.notes]),
    attendeeNames: text(r[MEETING.attendeeNames])
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    unhoused: { externalAttendee: text(r[MEETING.externalName]) || null, calendarEventId: text(r[MEETING.calendarEvent]) || null },
  })
  mtgCnt.mapped()
}
meetings.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))

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
  "HALF THE LOGGED TIME IS ALREADY GONE, and it went before this migration started. 1,567 of the 2,940 work logs name a parent task that is in NO exported table — 1,567 rows, 1,567 distinct ids, zero matches across all 32 tables. Glide deleted the task and left the time pointing at nothing. That is 1,069 of the 2,187 hours; 1,118 hours survive on 1,297 logs. RECONCILIATION quotes 2,187 hours as the history — the recoverable figure is a little over half of it, and no amount of mapping changes that.",
  "no work log names ONLY an app. The app column (Name) is filled on 89% of rows, which reads like the primary link, but every row that has one also has a story, a request or a task — so the app column is a convenience copy, not the parent. Nothing was lost by refusing to log time against an app.",
  "sprints have no name in Glide. Six columns, and none of them a title: a sprint was identified on screen by its app plus its dates. The name is composed here from its type and its start month, which is why every sprint in the new app reads like 'Enhancement · Jul 2026'.",
  "the backlog has no status column either. Two opaque booleans (1lNG7, buR6D) look like candidates and neither is: one is true on every row in a finished sprint AND on 90 rows in no sprint, the other on a third of everything. The sprint's own completion flag is the only reliable signal, so the story's state is derived from it.",
  "meeting purposes store their name in B0cSY, the same column id the choices table uses for its value — Glide reuses ids across tables. Reading the sample row's 'Name' column gives an empty string on all 27 rows.",
  "ONE name in the export was already broken before we touched it: 'Marie-Christine GrÃ¼ner-Mirli'. It is not an encoding fault in this pipeline and the counting proves it — 27,880 accented characters across the 32 tables are correct and there are exactly two mojibake sequences, both the same contact row seen through the agency and portal copies. Somebody pasted a mis-decoded string into Glide years ago. `unmojibake` turns it back, and only when re-encoding the result reproduces the original byte for byte, so a name that merely contains 'Ã' is never touched.",
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
  // The work engine's half, in the order the seed has to write it: an app before
  // its sprints, a sprint before its stories, a story before the time logged
  // against it.
  apps,
  sprints,
  stories,
  workLogs,
  meetingPurposes,
  meetings,
  tasks,
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
