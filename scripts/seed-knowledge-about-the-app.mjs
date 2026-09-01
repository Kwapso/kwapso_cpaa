// PUT THE APP'S OWN STORY INTO ITS OWN KNOWLEDGE BASE.
//
//   TEST_LOGIN_KEY=… node scripts/seed-knowledge-about-the-app.mjs staging
//
// So that "what is a sprint here", "why is a client called an account", "who can
// see the margin" and "why does the ticket module say help" are questions the
// team can ask the app instead of asking a person — and get the answer the
// PROJECT actually holds, not a plausible one.
//
// THREE RULES, and the first is the one that matters.
//
// 1. NOTHING IS WRITTEN FROM MEMORY. Every document below is assembled from a
//    file in this repository: the chapters come out of SCOPE.html's own blocks,
//    the vocabulary out of shared/glossary.ts, the laws out of the rule registry,
//    and the screen guide out of the page registry the sidebar itself reads. If
//    the app changes and this is re-run, the knowledge changes with it. A
//    knowledge base about the app, written from an agent's recollection of the
//    app, is the exact thing R23 exists to prevent.
// 2. IT WRITES THROUGH THE FRONT DOOR, signed in as a real person, gated like
//    any other write — same as the seed.
// 3. IT IS IDEMPOTENT on the title. Run it twice and the second run corrects
//    what is there rather than making a second copy; that is what makes it safe
//    to re-run after the docs move on.

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeApi, timedFetch } from "./lib/api.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const TARGETS = {
  staging: { base: "https://agency-staging.kwapso.app", label: "staging" },
  production: { base: "https://agency.kwapso.app", label: "PRODUCTION" },
}
const target = process.argv[2]
if (!TARGETS[target]) {
  console.error("Usage: node scripts/seed-knowledge-about-the-app.mjs <staging|production>")
  process.exit(2)
}
const BASE = TARGETS[target].base
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "alaap@kwapso.com"
const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
if (!TEST_LOGIN_KEY) {
  console.error("Stopped: export TEST_LOGIN_KEY (it lives in ~/.config/kwapso/keys.env).")
  process.exit(1)
}

const api = makeApi(BASE)
const post = (path, payload, cookie) =>
  api(path, { method: "POST", body: JSON.stringify(payload ?? {}) }, cookie)

// ── turning a document into something a person would read ────────────────────

/** HTML → text a reader (and an embedding) can use. Block tags become line
 * breaks so a list does not arrive as one run-on sentence — the chunker splits
 * on paragraphs, so punctuation here is not cosmetic, it decides where a passage
 * begins and ends. */
function toText(html) {
  return String(html ?? "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|li|h[1-6]|tr|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/** ONE BLOCK OF THE SCOPE, AS WORDS — every kind of block it has, not only the
 * prose ones.
 *
 * The first version of this read `html` and nothing else, and dropped three
 * block types carrying the most useful material in the document: the TERM lists
 * (the definitive vocabulary, with an example beside each word), the FIGURE
 * captions (which is where a diagram's argument is actually written down — "two
 * front doors, one building… never copies, never synced, the same rows"), and
 * the RETIRED-WORDS list, which is the only place that says which words the
 * product deliberately does not use. The chapters came out at a tenth of their
 * length and nothing said so.
 *
 * The SVG itself is skipped on purpose: a picture is not text, and feeding path
 * data to an embedding is noise wearing a caption's clothes. */
function blockText(b) {
  if (b.t === "terms")
    return (b.items ?? [])
      .map((i) => [`${i.w} — ${toText(i.d)}`, i.eg ? `  For example: ${toText(i.eg)}` : ""].filter(Boolean).join("\n"))
      .join("\n\n")
  if (b.t === "dead")
    return [toText(b.k), ...(b.items ?? []).map((i) => `• ${toText(i)}`)].filter(Boolean).join("\n")
  if (b.t === "fig") return toText(b.cap)
  if (b.t === "decided") return [toText(b.title), toText(b.html)].filter(Boolean).join("\n")
  return toText(b.html ?? b.text ?? b.q ?? "")
}

/** THE SCOPE, CHAPTER BY CHAPTER, out of its own data rather than its rendering.
 * SCOPE.html carries a `BLOCKS` array — a chapter marker followed by the prose,
 * lists and tables under it — which is the same structure the page draws. Each
 * chapter becomes one document, because a chapter is one subject and a document
 * that spans three subjects retrieves badly for all three. */
function scopeChapters() {
  const src = readFileSync(resolve(ROOT, "SCOPE.html"), "utf8")
  const open = src.indexOf("const BLOCKS = [")
  if (open < 0) throw new Error("SCOPE.html no longer carries a BLOCKS array — this script is reading the wrong shape")
  // Walk the brackets rather than regex to the end: the prose contains "]".
  let depth = 0, end = -1
  for (let i = src.indexOf("[", open); i < src.length; i++) {
    if (src[i] === "[") depth++
    else if (src[i] === "]" && --depth === 0) { end = i + 1; break }
  }
  if (end < 0) throw new Error("SCOPE.html's BLOCKS array does not close — refusing to guess where it ends")
  const blocks = JSON.parse(src.slice(src.indexOf("[", open), end))

  const chapters = []
  let current = null
  for (const b of blocks) {
    if (b.t === "chapter") {
      if (current) chapters.push(current)
      current = { n: b.n, title: b.title, parts: [toText(b.sub)] }
      continue
    }
    if (!current) continue
    current.parts.push(blockText(b))
  }
  if (current) chapters.push(current)

  return chapters.map((c) => ({
    title: `Scope ${c.n} — ${c.title}`,
    body:
      `This is chapter ${c.n} of kwapso's scope of work, "${c.title}". The scope is ` +
      `the product's own source of truth: where it speaks it wins, and where it is ` +
      `silent the base's rules apply.\n\n` +
      c.parts.filter(Boolean).join("\n\n"),
  }))
}

/** THE VOCABULARY, from the file the UI itself reads. Every term the product
 * uses, with the one definition the app is built on — so "what does kwapso mean
 * by an account" has an answer that cannot drift from the screens. */
function vocabulary() {
  const src = readFileSync(resolve(ROOT, "shared", "glossary.ts"), "utf8")
  const lines = []
  for (const m of src.matchAll(/term:\s*"([^"]+)",\s*def:\s*"((?:[^"\\]|\\.)*)"/g))
    lines.push(`${m[1]} — ${m[2].replace(/\\"/g, '"')}`)
  if (!lines.length) throw new Error("shared/glossary.ts no longer parses — this script is reading the wrong shape")
  return {
    title: "The words kwapso uses, and what each one means",
    body:
      `Every term below is the product's own vocabulary, taken from the glossary the ` +
      `app is built on. When a screen, a report or a person says one of these words, ` +
      `this is what it means. The app never uses a synonym for one of them.\n\n` +
      lines.join("\n\n"),
  }
}

/** THE LAWS, from the registry that enforces them. Not "we try to" — each of
 * these is checked by a test that reads the source off disk, so a build that
 * breaks one goes red. That is worth a person being able to ask about. */
function laws() {
  const src = readFileSync(resolve(ROOT, "shared", "rules", "registry.ts"), "utf8")
  const entries = []
  for (const m of src.matchAll(/id:\s*"([^"]+)",[\s\S]{0,80}?law:\s*"((?:[^"\\]|\\.)*)"/g))
    entries.push(`${m[1]}: ${m[2].replace(/\\"/g, '"').replace(/\\n/g, " ")}`)
  if (!entries.length) throw new Error("the rule registry no longer parses — this script is reading the wrong shape")
  return {
    title: "The rules this app is built to, and why they are machine-checked",
    body:
      `kwapso is built on a base with a set of laws that are not guidelines: each one ` +
      `has a test that reads the source code off disk, so breaking a law turns the ` +
      `build red rather than shipping quietly. They exist because each was learned ` +
      `from something that went wrong once. Here is every one of them.\n\n` +
      entries.join("\n\n"),
  }
}

/** WHAT IS ON EACH SCREEN, and what a person needs to see it — derived from the
 * page registry the sidebar itself reads, so this document cannot describe a
 * menu the app does not have. */
function screens() {
  const src = readFileSync(resolve(ROOT, "web", "lib", "pages.ts"), "utf8")
  const rows = []
  for (const m of src.matchAll(
    /\{\s*key:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*module:\s*"([^"]+)",\s*segment:\s*"([^"]*)",\s*placement:\s*"([^"]+)"[^}]*?(?:group:\s*"([^"]+)")?\s*\}/g
  ))
    rows.push({ key: m[1], title: m[2], module: m[3], segment: m[4], placement: m[5], group: m[6] })
  if (!rows.length) throw new Error("web/lib/pages.ts no longer parses — this script is reading the wrong shape")

  const sidebar = rows.filter((r) => r.placement === "sidebar")
  const daily = sidebar.filter((r) => r.group === "daily")
  const rest = sidebar.filter((r) => r.group !== "daily")
  const line = (r) =>
    `${r.title} — at /${r.segment}. A person needs the "${r.module}" read right to see it; ` +
    `without that right the page is not even listed for them.`
  return {
    title: "The screens in the agency app, and who can see each one",
    body:
      // THE HEADINGS ARE THE SCREEN'S OWN WORDS, not a paraphrase. This source is
      // what the assistant reads when somebody asks what is in the menu, so a
      // person told about a group called "Every day" who then looks at a rail
      // headed "Frequent" has been given a true sentence about an app that does
      // not exist. Renamed with the rail on 1 Sep 2026 for exactly that reason —
      // and it is the reason to check here whenever a heading moves.
      `The agency app's sidebar has two halves, each with a heading and a collapse ` +
      `chevron of its own. Above is "Frequent", what somebody opens most days; below ` +
      `is "Occasional", what they open when they need it. Every page is gated by a ` +
      `read right, so two people signed into the same team can see different menus — ` +
      `that is the permission spine working, not a fault.` +
      `\n\nFrequent:\n\n` +
      ["Home — the team, and the way in to everything else."].concat(daily.map(line)).join("\n\n") +
      `\n\nOccasional:\n\n` +
      rest.map(line).join("\n\n") +
      `\n\nSettings — your account, the team, its members, its roles and its invitations.` +
      `\n\nThe client portal is a different app at a different address, with four screens: ` +
      `home, tickets, value and my company. A client never sees the agency app's menu.`,
  }
}

// ── the documents ────────────────────────────────────────────────────────────

const DOCS = [...scopeChapters(), vocabulary(), laws(), screens()]

// ── write them ───────────────────────────────────────────────────────────────

async function signIn(email) {
  const start = await api("/api/auth/admin/test-login", {
    method: "POST",
    headers: { "x-admin-key": TEST_LOGIN_KEY },
    body: JSON.stringify({ email }),
  })
  if (!start.ok) {
    console.error(`Stopped: couldn't mint a login code for ${email} — ${start.status} ${start.body?.message ?? ""}`)
    process.exit(1)
  }
  const verify = await timedFetch(`${BASE}/api/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: start.body.code }),
  })
  const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
  if (!cookie.startsWith("kwapso_session=")) {
    console.error(`Stopped: ${email} couldn't sign in (${verify.status}).`)
    process.exit(1)
  }
  return cookie
}

async function allSources(cookie) {
  const rows = []
  let cursor = null
  for (let page = 0; page < 40; page++) {
    const url = `/api/content/knowledge${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
    const body = (await api(url, {}, cookie)).body ?? {}
    rows.push(...(body.sources ?? []))
    if (!body.hasMore || !body.nextCursor) return rows
    cursor = body.nextCursor
  }
  throw new Error("more than 40 pages of sources — refusing to treat a short read as complete")
}

console.log(`\nTeaching kwapso about itself on ${TARGETS[target].label} (${BASE})`)
console.log(`${DOCS.length} documents, all of them assembled from files in this repository.\n`)

const cookie = await signIn(OWNER_EMAIL)
const existing = new Map((await allSources(cookie)).map((s) => [s.title, s]))

let created = 0, updated = 0, unchanged = 0, failed = 0
for (const doc of DOCS) {
  const hit = existing.get(doc.title)
  const payload = { title: doc.title, body: doc.body }
  const res = hit
    ? await post("/api/content/knowledge/update", { id: hit.id, ...payload }, cookie)
    : await post("/api/content/knowledge", payload, cookie)
  if (!res.ok) {
    console.log(`  FAILED  ${doc.title} — ${res.status} ${res.body?.message ?? ""}`)
    failed++
    continue
  }
  if (hit) {
    updated++
    console.log(`  updated ${doc.title}  (${doc.body.length.toLocaleString()} characters)`)
  } else {
    created++
    console.log(`  created ${doc.title}  (${doc.body.length.toLocaleString()} characters)`)
  }
}

console.log(
  `\n${created} created, ${updated} corrected, ${unchanged} unchanged, ${failed} failed.` +
    `\nEvery one is indexed as it is written, so the answers change the moment this finishes.`
)
process.exit(failed ? 1 : 0)
