#!/usr/bin/env node
// Give the migrated records their pictures back — the logos, the covers and the
// faces that came across from Glide as rows with the image left behind.
//
//   export TEST_LOGIN_KEY=$(security find-generic-password -s kwapso-test-login-key -w)
//   node scripts/glide-visuals.mjs staging
//   node scripts/glide-visuals.mjs staging --dry-run
//
// WHAT THIS FIXES. `seed-staging.mjs` brought twenty-eight apps, twenty companies
// and a hundred and three people across, and not one picture with them: `apps`
// had no column to put a logo in until 0037, and the accounts columns existed
// (0024) but the seed never sent them. So the app screen drew the same stage
// glyph on every tile while the app it replaced showed the client's real mark.
// This is the second half of that migration, run separately because it moves
// BYTES and the seed moves rows.
//
// THE BYTES COME TO US, NOT A LINK TO THEM. Every picture in the export is a
// `storage.googleapis.com/glide-prod…` URL, and those stop resolving the day the
// Glide subscription ends (RECONCILIATION.md §4.5). Storing the URL would put
// every logo in this app on somebody else's infrastructure, on a clock. So each
// file is read off disk (scripts/glide-files.mjs already rescued them), turned
// into a data URL, and POSTed to the ordinary gated door — which puts it in OUR
// R2 under the team's own prefix and keeps a `/media/...` path on the row. The
// upload seam is `shared/workers/image.ts storeImageDataUrl`; this script does
// not know where R2 is and must not.
//
// IT WRITES THROUGH THE FRONT DOOR, exactly as the seed does and for the same
// three reasons: it proves the doors work, it goes through the permission spine,
// and it leaves real activity rows and live pings behind. Nothing here touches
// D1 and nothing here touches a bucket.
//
// SAFE TO RUN TWICE, AND CHEAP TO. Every record is matched on the same natural
// key the seed used (an app's name, a company's name, a person's email) and a
// record that already carries the picture is SKIPPED — so a second run writes
// nothing and says so. That is what makes it safe to re-run after fixing the two
// or three files that failed the first time.
//
// WHAT IT CANNOT DO, said out loud rather than fudged:
//
// • THE DOOR TAKES PNG, JPEG OR WEBP UNDER 2.5 MB (parseDataUrl). Four files in
//   the export are outside that — one AVIF, and three over the cap. They are
//   re-encoded with `sips`, which is on every Mac; where `sips` is missing or
//   fails, the file is REPORTED and skipped rather than quietly dropped.
// • A URL THAT IS NOT GLIDE'S IS LEFT ALONE. Twenty-seven contact photos and one
//   app logo point at a client's own website or a stock library. Those are not
//   ours to re-host: they are somebody else's asset on somebody else's terms,
//   they were never in Glide's bucket, and they do not die with the Glide
//   account. They are counted and named, and the owner can decide.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

import { makeApi, timedFetch } from "./lib/api.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SOURCE = resolve(ROOT, "glide/normalised.json")
const MANIFEST = resolve(ROOT, "glide/files/manifest.json")
const FILES_DIR = resolve(ROOT, "glide/files")
const WORK_DIR = resolve(tmpdir(), "kwapso-glide-visuals")

// ── where, and may we ────────────────────────────────────────────────────────

const TARGETS = {
  staging: { base: "https://agency-staging.kwapso.app", label: "staging" },
  production: { base: "https://agency.kwapso.app", label: "PRODUCTION" },
}

const target = process.argv[2]
const dryRun = process.argv.includes("--dry-run")
const confirmed = process.argv.includes("--confirm-production")
if (!TARGETS[target]) {
  console.error("Usage: node scripts/glide-visuals.mjs <staging|production> [--dry-run] [--confirm-production]")
  process.exit(2)
}
// The same refusal the seed makes, for the same reason: production is
// deliberately empty and parked (SCOPE ch.13), so there are no seeded rows there
// to hang a picture on. If the owner ever imports the history there, this runs
// after it — never before, and never by accident.
if (target === "production" && !confirmed) {
  console.error(
    "Refusing to run against production. It is deliberately empty and parked, so\n" +
      "there are no migrated records there to give a picture to. Pass\n" +
      "--confirm-production if the history has genuinely been imported there."
  )
  process.exit(2)
}

const BASE = process.env.SEED_BASE ?? TARGETS[target].base
const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
if (!TEST_LOGIN_KEY && !dryRun) {
  console.error("No TEST_LOGIN_KEY in the environment — this script can't sign in.")
  process.exit(1)
}

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "alaap@kwapso.com"

for (const [file, why] of [
  [SOURCE, "Run `node scripts/glide-transform.mjs` first — it turns the pulled Glide rows into the shape this reads."],
  [MANIFEST, "Run `node scripts/glide-files.mjs` first — it rescues the files Glide is hosting and writes the manifest."],
]) {
  if (existsSync(file)) continue
  console.error(`No ${file}.\n${why}`)
  process.exit(1)
}

const history = JSON.parse(readFileSync(SOURCE, "utf8"))
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"))
/** original Glide URL → { path, contentType, bytes } */
const rescued = new Map(manifest.files.map((f) => [f.url, f]))

// ── what the door will take ──────────────────────────────────────────────────
// These two numbers are the door's, not this script's: `parseDataUrl` in
// shared/workers/image.ts refuses anything else, and it refuses it AFTER the
// request has crossed the wire. Checking here means a file that cannot land is
// named on this machine in a line the owner can read, instead of arriving as a
// 400 with no filename in it.
const DOOR_TYPES = /^image\/(png|jpeg|webp)$/
const DOOR_MAX_BYTES = 2_500_000
/** What an oversize or wrong-format file is re-encoded to. 512px is the size the
 * app's own picker downsizes to (web/lib/image.ts), so a converted file is no
 * bigger than one a person would have uploaded by hand. */
const REENCODE_MAX_PX = 512

// ── the plumbing ─────────────────────────────────────────────────────────────

const api = makeApi(BASE)
const post = (path, payload, cookie) => api(path, { method: "POST", body: JSON.stringify(payload ?? {}) }, cookie)

function must(result, what) {
  if (!result.ok) {
    console.error(`\nStopped: ${what} — ${result.status} ${result.body?.message ?? ""}`)
    process.exit(1)
  }
  return result.body
}

/** Sign in the way the seed and the smoke do: mint a code through the
 * staging-only admin door, spend it at the normal verify door. */
async function signIn(email) {
  const start = await api("/api/auth/admin/test-login", {
    method: "POST",
    headers: { "x-admin-key": TEST_LOGIN_KEY },
    body: JSON.stringify({ email }),
  })
  if (!start.ok) {
    console.error(`\nStopped: couldn't mint a login code for ${email} — ${start.status} ${start.body?.message ?? ""}`)
    process.exit(1)
  }
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
  return cookie
}

/** Walk every page of a keyset-paged read. A short read must never look like a
 * complete one — this decides which records are SKIPPED, and a truncated read
 * would silently leave half the collection without its picture. */
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
  throw new Error(`${path}: more than 25 pages — refusing to report a partial read as complete`)
}

// ── the report ───────────────────────────────────────────────────────────────
// Five outcomes, and every picture in the export lands in exactly one of them.
// The columns add up to the number of records looked at, which is the property
// that makes the summary worth reading.

const tally = {
  moved: 0,
  movedBytes: 0,
  reencoded: 0,
  already: 0,
  none: 0,
  external: [],
  unfetched: [],
  refused: [],
  unproven: [],
}
const step = (title) => console.log(`\n${title}`)
const say = (verb, what) => console.log(`  ${verb.padEnd(9)} ${what}`)

/** WHAT WAS WRITTEN, so the end of each pass can go and LOOK.
 *
 * A 200 is not proof the picture landed. The door is a patch door: it takes the
 * fields it knows and ignores the rest, so a `logoUrl` sent to a deployment that
 * predates the column comes back `{ ok: true }` having written nothing, and this
 * script would print "moved" 25 times over an app screen still full of gears.
 * That is the exact failure this whole lane exists to fix, so it would be a poor
 * joke to ship a migration that could report it as done.
 *
 * So every write is remembered by record id and field, and each pass re-reads
 * the collection afterwards and proves the row now carries a path. One extra
 * read per pass; it makes the summary mean something. */
const written = []
const remember = (id, field, label) => written.push({ id, field, label })

/** Re-read a collection and prove every row we wrote now carries the picture. */
function confirm(rows, expectation = "the door accepted the field but stored nothing") {
  if (dryRun || !written.length) {
    written.length = 0
    return
  }
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const { id, field, label } of written) {
    const row = byId.get(id)
    if (row && row[field]) continue
    tally.unproven.push(`${label} — ${expectation}`)
    say("UNPROVEN", `${label} — ${expectation}`)
  }
  written.length = 0
}

// ── the bytes ────────────────────────────────────────────────────────────────

const isGlideHosted = (url) => {
  try {
    const u = new URL(url)
    return u.host === "storage.googleapis.com" && u.pathname.startsWith("/glide-prod.appspot.com/uploads-v2/")
  } catch {
    return false
  }
}

/** FOUR CELLS IN THE EXPORT HOLD THE PICTURE ITSELF, not a link to it — Glide
 * inlined them as `data:image/jpeg;base64,…` (VU Solutions' logo and three
 * contact photos). They are the easiest case in the whole script and the one
 * most likely to be got wrong: a `data:` URL parses as a URL with an EMPTY host,
 * so the "is this Glide's?" test says no and the honest-looking answer — "left
 * where it is, not ours to re-host" — would be exactly backwards. The bytes are
 * already in our hands and there is nothing left to fetch. */
const isInlineBytes = (url) => url.startsWith("data:")
const inlineBytes = (url) => {
  const comma = url.indexOf(",")
  const header = url.slice(0, comma)
  if (!header.endsWith(";base64")) return null
  const contentType = header.slice("data:".length, -";base64".length)
  return { contentType, bytes: Buffer.from(url.slice(comma + 1), "base64") }
}

/** Re-encode a file the door would refuse into one it will take. `sips` ships
 * with macOS, so this needs nothing installed — and where it is missing the
 * caller reports the file rather than pretending it moved. */
function reencode(sourcePath, label) {
  mkdirSync(WORK_DIR, { recursive: true })
  const out = resolve(WORK_DIR, `${label.replace(/[^A-Za-z0-9]+/g, "-")}-${Date.now()}.jpg`)
  execFileSync(
    "sips",
    ["-s", "format", "jpeg", "-s", "formatOptions", "80", "-Z", String(REENCODE_MAX_PX), sourcePath, "--out", out],
    { stdio: "pipe" }
  )
  return out
}

/** One Glide URL → a data URL the door will accept, or a reason it cannot be.
 *
 * The local copy is the source: `glide-files.mjs` already pulled every one of
 * them, and re-fetching 79 MB off somebody else's bucket on every run would be
 * rude as well as slow. A MISSING local copy falls back to the original URL, so
 * this works on a machine that has never run that script — and when THAT fails
 * the file is named, which is the honest answer to a 404 on a Glide asset. */
async function dataUrlFor(url, label) {
  const hit = rescued.get(url)
  let bytes = null
  let contentType = hit?.contentType ?? null
  const local = hit ? resolve(FILES_DIR, hit.path) : null

  if (isInlineBytes(url)) {
    const inline = inlineBytes(url)
    if (!inline) return { error: "the cell holds a data URL this script can't read (not base64)" }
    bytes = inline.bytes
    contentType = inline.contentType
  } else if (local && existsSync(local)) {
    bytes = readFileSync(local)
  } else {
    try {
      const res = await timedFetch(url)
      if (!res.ok) return { error: `${res.status} from Glide's storage` }
      bytes = Buffer.from(await res.arrayBuffer())
      contentType = res.headers.get("content-type")?.split(";")[0] ?? contentType
    } catch (e) {
      return { error: `couldn't fetch it — ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  let reencoded = false
  if (!DOOR_TYPES.test(contentType ?? "") || bytes.byteLength > DOOR_MAX_BYTES) {
    // Only a file that HAS a local copy can be re-encoded — sips reads a path.
    const from = local && existsSync(local) ? local : writeTemp(bytes, label)
    try {
      const converted = reencode(from, label)
      bytes = readFileSync(converted)
      contentType = "image/jpeg"
      reencoded = true
    } catch (e) {
      return {
        error:
          `the door takes png, jpeg or webp under 2.5 MB and this is ` +
          `${contentType ?? "an unknown type"} at ${(bytes.byteLength / 1048576).toFixed(1)} MB; ` +
          `re-encoding it failed — ${e instanceof Error ? e.message.trim().split("\n")[0] : String(e)}`,
      }
    }
  }
  if (bytes.byteLength > DOOR_MAX_BYTES)
    return { error: `still ${(bytes.byteLength / 1048576).toFixed(1)} MB after re-encoding — over the door's cap` }

  return { dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`, bytes: bytes.byteLength, reencoded }
}

/** A byte buffer on disk so `sips` (which only reads paths) can reach it. */
function writeTemp(bytes, label) {
  mkdirSync(WORK_DIR, { recursive: true })
  const path = resolve(WORK_DIR, `${label.replace(/[^A-Za-z0-9]+/g, "-")}-in`)
  writeFileSync(path, bytes)
  return path
}

/** THE ONE DECISION, for one picture on one record. Every pass below hands it
 * the same five things, so "why did this record not get its logo?" has the same
 * answer everywhere and the tallies mean the same thing in every section. */
async function carry({ label, sourceUrl, alreadyHas, send, proves }) {
  if (!sourceUrl) {
    tally.none++
    return
  }
  if (alreadyHas) {
    tally.already++
    return
  }
  if (!isGlideHosted(sourceUrl) && !isInlineBytes(sourceUrl)) {
    let host = sourceUrl.slice(0, 60)
    try {
      host = new URL(sourceUrl).host || host
    } catch {
      // an unparseable cell is still a fact worth naming, not a crash
    }
    tally.external.push(`${label} — ${host}`)
    return
  }
  const file = await dataUrlFor(sourceUrl, label)
  if (file.error) {
    tally.unfetched.push(`${label} — ${file.error}`)
    say("FAILED", `${label} — ${file.error}`)
    return
  }
  if (dryRun) {
    tally.moved++
    tally.movedBytes += file.bytes
    say("would", `${label} (${(file.bytes / 1024).toFixed(0)} KB${file.reencoded ? ", re-encoded" : ""})`)
    return
  }
  const result = await send(file.dataUrl)
  if (!result.ok) {
    tally.refused.push(`${label} — ${result.status} ${result.body?.message ?? ""}`)
    say("REFUSED", `${label} — ${result.status} ${result.body?.message ?? ""}`)
    return
  }
  tally.moved++
  tally.movedBytes += file.bytes
  if (file.reencoded) tally.reencoded++
  if (proves) remember(proves.id, proves.field, label)
  say("moved", `${label} (${(file.bytes / 1024).toFixed(0)} KB${file.reencoded ? ", re-encoded" : ""})`)
}

// ── what the export holds ────────────────────────────────────────────────────
// Read from `unhoused` — the bucket the transform puts a value in when the
// schema has nowhere for it (glide-transform.mjs). That these URLs sit there is
// the whole bug, said by the pipeline itself.

const glideApps = history.apps ?? []
const glideCompanies = (history.accounts ?? []).filter((a) => a.kind === "entity")
const glidePeople = (history.accounts ?? []).filter((a) => a.kind === "individual")

/** The cover image, which the transform does not carry: it had no column to
 * carry it TO when it was written, and `unhoused` only holds what the mapping
 * looked at. `lfClr` is the customers table's second image column
 * (glide-transform.mjs's CUSTOMER map calls it `photo`), read here off the raw
 * export and keyed by the same Glide row id the transform used. */
const RAW_CUSTOMERS = resolve(ROOT, "glide/data/agency.customers.json")
const coverFor = new Map()
if (existsSync(RAW_CUSTOMERS)) {
  for (const row of JSON.parse(readFileSync(RAW_CUSTOMERS, "utf8")).rows ?? []) {
    const cover = (row.lfClr ?? "").trim()
    if (cover) coverFor.set(row.$rowID, cover)
  }
}

console.log(`\nGiving the migrated records their pictures back, on ${TARGETS[target].label} (${BASE})`)
console.log(
  `  ${glideApps.length} apps, ${glideCompanies.length} companies and ${glidePeople.length} people in the history` +
    `${dryRun ? "\n  DRY RUN — nothing will be written." : ""}`
)

if (dryRun && !TEST_LOGIN_KEY) {
  // A dry run with no key still has something worth saying: which files would
  // move, which cannot, and why. It just cannot know what is already there.
  console.log("  (no TEST_LOGIN_KEY, so nothing can be read back — every record is treated as empty.)")
}

const cookie = TEST_LOGIN_KEY ? await signIn(OWNER_EMAIL) : null

if (cookie) {
  const teams = must(await api("/api/tenancy/teams", {}, cookie), "reading your teams").teams ?? []
  const team = teams[0]
  if (!team) {
    console.error("\nStopped: that account is not in a team yet — run scripts/seed-staging.mjs first.")
    process.exit(1)
  }
  must(await post("/api/tenancy/switch-team", { teamId: team.id }, cookie), "switching to the team")
  console.log(`  standing in ${team.name}`)
}

// ── 1 · the apps ─────────────────────────────────────────────────────────────
// The visible bug: twenty-six of twenty-eight carry a logo in Glide and every
// tile in this app drew a stage glyph. Matched on NAME, which is the natural key
// seed-staging used to create them.

step("App logos")
{
  const live = cookie ? ((await api("/api/tenancy/apps", {}, cookie)).body?.apps ?? []) : []
  const byName = new Map(live.map((a) => [a.name, a]))
  for (const app of glideApps) {
    const row = byName.get(app.name)
    if (cookie && !row) {
      tally.unfetched.push(`app "${app.name}" — no such app on ${TARGETS[target].label}`)
      continue
    }
    await carry({
      label: `app "${app.name}"`,
      sourceUrl: app.unhoused?.logoUrl ?? null,
      alreadyHas: Boolean(row?.logoUrl),
      // The edit door takes a patch and REQUIRES the name, so the name goes back
      // exactly as it came off the row — this changes the picture and nothing
      // else, and an app renamed since the seed keeps its new name.
      send: (dataUrl) => post("/api/tenancy/apps/update", { id: row.id, name: row.name, logoUrl: dataUrl }, cookie),
      proves: row ? { id: row.id, field: "logoUrl" } : null,
    })
  }
  // THE READ-BACK. A staging worker that predates 0037_app_logo answers every
  // one of those writes with a cheerful 200 and stores nothing, so this is the
  // line that tells the difference between "done" and "deploy tenancy first".
  confirm(
    cookie ? ((await api("/api/tenancy/apps", {}, cookie)).body?.apps ?? []) : [],
    "the door took the field and the row is still empty — is a tenancy worker without 0037_app_logo deployed?"
  )
}

// ── 2 · the companies ────────────────────────────────────────────────────────
// The columns have been there since 0024 and the seed never filled them. A logo
// AND a cover, because a company record has a masthead as well as a mark.

step("Company logos and covers")
const liveAccounts = cookie ? await allPages("/api/tenancy/accounts", "accounts", cookie) : []
{
  const byName = new Map(
    liveAccounts.filter((a) => a.accountType === "entity").map((a) => [a.name, a])
  )
  for (const company of glideCompanies) {
    const row = byName.get(company.name)
    if (cookie && !row) {
      tally.unfetched.push(`company "${company.name}" — no such company on ${TARGETS[target].label}`)
      continue
    }
    await carry({
      label: `${company.name} logo`,
      sourceUrl: company.unhoused?.logoUrl ?? null,
      alreadyHas: Boolean(row?.logoUrl),
      send: (dataUrl) => post("/api/tenancy/accounts/update", { id: row.id, name: row.name, logoUrl: dataUrl }, cookie),
      proves: row ? { id: row.id, field: "logoUrl" } : null,
    })
    await carry({
      label: `${company.name} cover`,
      sourceUrl: coverFor.get(company.glideId) ?? null,
      alreadyHas: Boolean(row?.coverUrl),
      send: (dataUrl) => post("/api/tenancy/accounts/update", { id: row.id, name: row.name, coverUrl: dataUrl }, cookie),
      proves: row ? { id: row.id, field: "coverUrl" } : null,
    })
  }
  confirm(cookie ? await allPages("/api/tenancy/accounts", "accounts", cookie) : [])
}

// ── 3 · the people ───────────────────────────────────────────────────────────
// A contact is an account of kind `individual` (there is no contacts table), so
// the face lands in the same `logo_url` column a company's logo does and the
// same form already offers the picker. Matched on EMAIL first — two people can
// share a name and 96 of the 104 Glide contacts carry a unique address — and on
// name only where there is no email to match on.

step("Contact photos")
{
  const people = liveAccounts.filter((a) => a.accountType === "individual")
  const byEmail = new Map(people.filter((a) => a.email).map((a) => [a.email.toLowerCase(), a]))
  const byName = new Map(people.map((a) => [a.name, a]))
  for (const person of glidePeople) {
    const row = (person.email ? byEmail.get(person.email.toLowerCase()) : null) ?? byName.get(person.name)
    if (cookie && !row) {
      // Not a failure: the seed takes a slice of the history, so a person the
      // export holds may simply never have been created. Counted as "no picture
      // to move" would be a lie, so it is named.
      tally.unfetched.push(`contact "${person.name}" — no such person on ${TARGETS[target].label}`)
      continue
    }
    await carry({
      label: `${person.name}'s photo`,
      sourceUrl: person.unhoused?.photoUrl ?? null,
      alreadyHas: Boolean(row?.logoUrl),
      send: (dataUrl) => post("/api/tenancy/accounts/update", { id: row.id, name: row.name, logoUrl: dataUrl }, cookie),
      proves: row ? { id: row.id, field: "logoUrl" } : null,
    })
  }
  confirm(cookie ? await allPages("/api/tenancy/accounts", "accounts", cookie) : [])
}

// ── what happened ────────────────────────────────────────────────────────────

console.log(`\n${dryRun ? "Would have moved" : "Moved"}`)
console.log(`  ${tally.moved} pictures, ${(tally.movedBytes / 1048576).toFixed(2)} MB into our own storage`)
if (tally.reencoded) console.log(`  ${tally.reencoded} of them re-encoded to fit the door's png/jpeg/webp, 2.5 MB rule`)
console.log(`  ${tally.already} already had one — left alone (this is what a second run reports)`)
console.log(`  ${tally.none} records carry no picture in Glide either`)

if (tally.external.length) {
  console.log(`\nLeft where they are — ${tally.external.length} pictures Glide never hosted:`)
  for (const line of tally.external) console.log(`  ${line}`)
  console.log("  These point at a client's own site or a stock library. They are not ours to")
  console.log("  re-host, and they do not die with the Glide account.")
}
if (tally.unfetched.length) {
  console.log(`\nCould not move — ${tally.unfetched.length}:`)
  for (const line of tally.unfetched) console.log(`  ${line}`)
}
if (tally.refused.length) {
  console.log(`\nThe door refused — ${tally.refused.length}:`)
  for (const line of tally.refused) console.log(`  ${line}`)
}
if (tally.unproven.length) {
  console.log(`\nWritten but NOT THERE on the read-back — ${tally.unproven.length}:`)
  for (const line of tally.unproven) console.log(`  ${line}`)
}

// A file we could not fetch and a door that said no are both real failures, and
// the exit code has to say so — a run inside a script must not look successful
// because the summary was readable. A picture that was never in Glide is not a
// failure and does not count here.
const failed = tally.unfetched.length + tally.refused.length + tally.unproven.length
console.log(
  `\n${
    failed
      ? `${failed} could not be carried across. Run it again after fixing them — what moved stays moved.`
      : dryRun
        ? "Nothing stood in the way — run it again without --dry-run to move them."
        : "Every picture Glide was holding is now on our own storage."
  }`
)
process.exit(failed ? 1 : 0)
