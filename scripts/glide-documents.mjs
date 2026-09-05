#!/usr/bin/env node
// The Glide files that are NOT pictures — and the brand library's own pictures,
// which came across as somebody else's URL and are still on somebody else's
// clock.
//
//   export TEST_LOGIN_KEY=$(grep TEST_LOGIN_KEY ~/.config/kwapso/keys.env | cut -d= -f2-)
//   node scripts/glide-documents.mjs staging --dry-run
//   node scripts/glide-documents.mjs staging
//
// WHAT THIS FIXES, and it is two things with one cause.
//
// `scripts/glide-files.mjs` rescued 194 files off Glide's storage.
// `scripts/glide-visuals.mjs` carried the app logos, the company logos and
// covers and the contact photos. Eight files were left, because they are not
// pictures: six PDFs and two videos. Nothing in the repo looked at them.
//
// THE SIX PDFs ARE BRAND ASSETS, and the reason they were missed is worth
// writing down because it is the same mistake twice. Glide's `branding` table
// has TWO file columns: `am2b4` (the picture on the card) and `iXERi` (the
// document itself). `seed-the-quiet-screens.mjs` reads `am2b4` and skips a row
// with nothing in it — "8 skipped, no file on the row". Six of those eight rows
// DO have a file. It is in the other column. So the six most substantial things
// in the agency's brand library — the Brand Book, the Branding presentation, the
// Moodboard, the Social templates, the Spacing and font sizes deck and the Glide
// certificate — are not in this app at all, and the log said the rows were empty.
//
// THE PICTURES THAT DID COME ACROSS ARE BORROWED. That same seed wrote Glide's
// URL straight into `file_url`, with a description that says so out loud: "the
// file is still hosted there, not by us". Forty-one live brand assets are one
// cancelled subscription away from being forty-one broken images
// (RECONCILIATION.md §4.5). The bytes are already on this machine. This moves
// them.
//
// THE BYTES COME TO US, NEVER A LINK TO THEM. Same rule and same seam as
// glide-visuals.mjs: read the file off disk, POST it to the ordinary gated
// upload door (`/api/content/brand-assets/upload-stream`, gated
// `brand_assets:create`), and patch the row through the ordinary edit door
// (gated `brand_assets:edit`, which publishes and writes activity). Nothing here
// touches D1 and nothing here touches a bucket.
//
// THE TWO VIDEOS HAVE NO RECORD TO LAND ON, and that is a decision rather than a
// gap — see the last section, which prints it every run rather than leaving it
// in a comment nobody opens.
//
// SAFE TO RE-RUN. A record is matched by name, and a file is skipped when the
// row already points at a `/media/internal/…` path of ours. A second run writes
// nothing and says so.
//
// AND IT FAILS LOUDLY. Every refusal, every unreadable file and every write that
// does not survive the read-back is counted, printed, and turned into a non-zero
// exit — including the quiet one: signing in as somebody whose team has no brand
// library at all, which is what an unnoticed wrong `SEED_OWNER_EMAIL` looks like
// from in here. "Nothing to do" is never allowed to be the same as "done".

import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { makeApi, timedFetch } from "./lib/api.mjs"
import { FRONT_DOORS } from "./lib/front-doors.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const BRANDING = resolve(ROOT, "glide/data/agency.branding.json")
const MANIFEST = resolve(ROOT, "glide/files/manifest.json")
const FILES_DIR = resolve(ROOT, "glide/files")

// ── where, and may we ────────────────────────────────────────────────────────

const TARGETS = {
  staging: { base: FRONT_DOORS.staging.agency, label: "staging" },
  production: { base: FRONT_DOORS.production.agency, label: "PRODUCTION" },
}

const target = process.argv[2]
const dryRun = process.argv.includes("--dry-run")
const confirmed = process.argv.includes("--confirm-production")
if (!TARGETS[target]) {
  console.error("Usage: node scripts/glide-documents.mjs <staging|production> [--dry-run] [--confirm-production]")
  process.exit(2)
}
// The same refusal the seed and glide-visuals make: production is deliberately
// empty and parked (SCOPE ch.13), so there is no brand library there to attach a
// file to. If the history is ever imported there, this runs after it.
if (target === "production" && !confirmed) {
  console.error(
    "Refusing to run against production. It is deliberately empty and parked, so there\n" +
      "is no brand library there to attach a file to. Pass --confirm-production if the\n" +
      "history has genuinely been imported there."
  )
  process.exit(2)
}

const BASE = process.env.SEED_BASE ?? TARGETS[target].base
const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
if (!TEST_LOGIN_KEY && !dryRun) {
  console.error("Stopped: no TEST_LOGIN_KEY in the environment — this script can't sign in.")
  process.exit(1)
}

/** WHOSE TEAM. `alaap@kwapso.com` because that is the account the brand library
 * was seeded into (seed-the-quiet-screens.mjs) — glide-visuals.mjs defaults to
 * the OTHER address, and a default that signs in successfully to the wrong
 * empty team is a run that reports "nothing to do" and means "nothing found".
 * The empty-library guard at the bottom is the belt to this brace. */
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "alaap@kwapso.com"

for (const [file, why] of [
  [BRANDING, "It is customer data and git-ignored — run `node scripts/glide-pull.mjs` to fetch it again."],
  [MANIFEST, "Run `node scripts/glide-files.mjs` first — it rescues the files Glide is hosting and writes the manifest."],
]) {
  if (existsSync(file)) continue
  console.error(`Stopped: no ${file}.\n${why}`)
  process.exit(1)
}

const brandingRows = JSON.parse(readFileSync(BRANDING, "utf8")).rows ?? []
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"))
/** original Glide URL → { path, contentType, bytes } */
const rescued = new Map(manifest.files.map((f) => [f.url, f]))

/** Glide's `branding` columns. Two file columns, which is the whole bug: the
 * seed read `picture` and called a row with only a `document` empty. */
const BRAND = { name: "Name", category: "bnMiZ", picture: "am2b4", document: "iXERi" }

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

/** THE BYTES, AS THE BODY. The streaming upload door takes the file itself
 * rather than a base64 envelope, so a 7.9 MB deck crosses the wire once instead
 * of as 10.6 MB of text the worker then has to hold three copies of. It is the
 * door the app's own picker uses. */
async function upload(bytes, contentType, cookie) {
  const res = await timedFetch(`${BASE}/api/content/brand-assets/upload-stream`, {
    method: "POST",
    headers: { "Content-Type": contentType, "Content-Length": String(bytes.byteLength), Cookie: cookie },
    body: bytes,
    duplex: "half",
  })
  const body = await res.json().catch(() => ({ message: "(no body)" }))
  return { ok: res.ok, status: res.status, body }
}

// ── the report ───────────────────────────────────────────────────────────────

const tally = {
  created: 0,
  moved: 0,
  movedBytes: 0,
  already: 0,
  failures: [],
  unproven: [],
  noRecord: [],
}
const step = (title) => console.log(`\n${title}`)
const say = (verb, what) => console.log(`  ${verb.padEnd(9)} ${what}`)
const kb = (n) => `${(n / 1024).toFixed(0)} KB`

/** OURS, as opposed to still Glide's. The upload door mints
 * `/media/internal/<teamId>/<ulid>?v=…`, so this is the one test for "the bytes
 * are on our storage" and it is used both to SKIP a file already carried and to
 * PROVE one just written. */
const isOurs = (url) => typeof url === "string" && url.startsWith("/media/internal/")

/** Read a rescued file off disk. The local copy is the source — re-fetching from
 * Glide on every run would be rude as well as slow — and a missing one falls
 * back to the original URL so this works on a machine that never ran the rescue.
 * A file that cannot be read is NAMED, never silently skipped. */
async function bytesFor(url) {
  const hit = rescued.get(url)
  const local = hit ? resolve(FILES_DIR, hit.path) : null
  if (local && existsSync(local)) return { bytes: readFileSync(local), contentType: hit.contentType }
  try {
    const res = await timedFetch(url)
    if (!res.ok) return { error: `${res.status} from Glide's storage` }
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType: hit?.contentType ?? res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream",
    }
  } catch (e) {
    return { error: `couldn't fetch it — ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** THE ONE DECISION, for one file on one record: fetch the bytes, put them
 * through the upload door, patch the row. Every caller hands it the same four
 * things, so "why is this asset still pointing at Glide?" has one answer. */
async function carry({ label, asset, sourceUrl, cookie }) {
  if (isOurs(asset.fileUrl)) {
    tally.already++
    return
  }
  const file = await bytesFor(sourceUrl)
  if (file.error) {
    tally.failures.push(`${label} — ${file.error}`)
    say("FAILED", `${label} — ${file.error}`)
    return
  }
  if (dryRun) {
    tally.moved++
    tally.movedBytes += file.bytes.byteLength
    say("would", `${label} (${kb(file.bytes.byteLength)}, ${file.contentType})`)
    return
  }
  const put = await upload(file.bytes, file.contentType, cookie)
  if (!put.ok || !isOurs(put.body?.url)) {
    tally.failures.push(`${label} — upload refused, ${put.status} ${put.body?.message ?? ""}`)
    say("REFUSED", `${label} — ${put.status} ${put.body?.message ?? ""}`)
    return
  }
  // The edit door takes a patch and REQUIRES the name, so the name goes back
  // exactly as the row holds it: this changes the file and nothing else, and an
  // asset renamed since the seed keeps its new name.
  const patch = await post(
    "/api/content/brand-assets/update",
    { id: asset.id, name: asset.name, category: asset.category ?? undefined, description: asset.description ?? undefined, fileUrl: put.body.url },
    cookie
  )
  if (!patch.ok) {
    tally.failures.push(`${label} — the row refused the new path, ${patch.status} ${patch.body?.message ?? ""}`)
    say("REFUSED", `${label} — ${patch.status} ${patch.body?.message ?? ""}`)
    return
  }
  tally.moved++
  tally.movedBytes += file.bytes.byteLength
  say("moved", `${label} (${kb(file.bytes.byteLength)}, ${file.contentType})`)
}

/** Every brand asset, through the list door. It is a capped read rather than a
 * paged one (a curated library, LIST_HARD_CAP), so one call is the whole list —
 * and the door's own `total` is checked against what came back, because a short
 * read here would silently leave assets pointing at Glide. */
async function brandLibrary(cookie) {
  const body = must(await api("/api/content/brand-assets", {}, cookie), "reading the brand library")
  const assets = body.assets ?? []
  if (typeof body.total === "number" && body.total > assets.length) {
    console.error(
      `\nStopped: the brand library holds ${body.total} assets and the door returned ${assets.length}.` +
        `\nA short read would leave the rest pointing at Glide, so this refuses to report a partial run as a complete one.`
    )
    process.exit(1)
  }
  return assets
}

// ── begin ────────────────────────────────────────────────────────────────────

console.log(`\nCarrying the Glide files that are not pictures, on ${TARGETS[target].label} (${BASE})`)
console.log(`  ${brandingRows.length} brand rows in the history, ${manifest.files.length} files rescued to disk`)
if (dryRun) console.log("  DRY RUN — nothing will be written.")

// A DRY RUN WITH NO KEY IS STILL WORTH RUNNING — it reads the export off this
// machine and says which files it would carry and which it cannot. It just
// cannot know what is already there, so it treats every record as empty and
// says so rather than implying it looked.
const cookie = TEST_LOGIN_KEY ? await signIn(OWNER_EMAIL) : null
let library = []

if (cookie) {
  const teams = must(await api("/api/tenancy/teams", {}, cookie), "reading your teams").teams ?? []
  const team = teams[0]
  if (!team) {
    console.error(`\nStopped: ${OWNER_EMAIL} is not in a team — run scripts/seed-staging.mjs first.`)
    process.exit(1)
  }
  must(await post("/api/tenancy/switch-team", { teamId: team.id }, cookie), "switching to the team")
  console.log(`  standing in ${team.name} as ${OWNER_EMAIL}`)
  library = await brandLibrary(cookie)

  // THE QUIET FAILURE, CAUGHT. A library with nothing in it is not "nothing to
  // do": the seed put 65 assets here, so an empty one means this signed in
  // somewhere else — the exact shape of a wrong SEED_OWNER_EMAIL, which fails by
  // succeeding at everything except the part that mattered.
  if (library.length === 0) {
    console.error(
      `\nStopped: ${team.name} has no brand library at all.` +
        `\nThe seed leaves 65 assets here, so this is almost certainly the wrong team — check SEED_OWNER_EMAIL` +
        `\n(it defaults to ${OWNER_EMAIL}) and run scripts/seed-the-quiet-screens.mjs if the library was never filled.`
    )
    process.exit(1)
  }
} else {
  console.log("  (no TEST_LOGIN_KEY, so nothing can be read back — every record is treated as empty.)")
}

// ── 1 · the six documents the mapping never looked at ────────────────────────

step("The documents (Glide's second file column)")
{
  const documents = brandingRows.filter((r) => String(r[BRAND.document] ?? "").trim())
  for (const row of documents) {
    const name = String(row[BRAND.name] ?? "").trim()
    const sourceUrl = String(row[BRAND.document]).trim()
    const file = rescued.get(sourceUrl)
    const what = file ? file.path.split("/").pop() : sourceUrl.split("/").pop()

    // A brand asset is a NAME first — the door requires one and the app lists by
    // it. Two of Glide's eight document rows have none, only a category, so
    // there is no record to make without inventing what it is called. Named,
    // counted, and left for the owner rather than guessed at.
    if (!name) {
      tally.noRecord.push(`${what} — a “${row[BRAND.category] ?? "?"}” row in Glide with no name on it`)
      continue
    }

    let asset = library.find((a) => a.name === name)
    if (!asset) {
      if (dryRun) {
        tally.created++
        say("would add", `${name} (${row[BRAND.category] ?? "no category"})`)
        // Nothing to attach to in a dry run, but the file is still worth pricing.
        const probe = await bytesFor(sourceUrl)
        if (probe.error) {
          tally.failures.push(`${name} — ${probe.error}`)
          say("FAILED", `${name} — ${probe.error}`)
        } else {
          tally.moved++
          tally.movedBytes += probe.bytes.byteLength
          say("would", `${name} → ${what} (${kb(probe.bytes.byteLength)}, ${probe.contentType})`)
        }
        continue
      }
      const made = await post(
        "/api/content/brand-assets",
        {
          name,
          category: String(row[BRAND.category] ?? "").trim() || undefined,
          description: "Carried over from the old app, and the file with it.",
        },
        cookie
      )
      if (!made.ok) {
        tally.failures.push(`${name} — couldn't create the record, ${made.status} ${made.body?.message ?? ""}`)
        say("FAILED", `${name} — ${made.status} ${made.body?.message ?? ""}`)
        continue
      }
      // The create door answers with the whole library, so the new row comes
      // back in the same call rather than needing a second read.
      library = made.body.assets ?? library
      asset = library.find((a) => a.name === name)
      if (!asset) {
        tally.failures.push(`${name} — created, and not in the library the door answered with`)
        say("FAILED", `${name} — created, and not in the library the door answered with`)
        continue
      }
      tally.created++
      say("added", `${name} (${asset.category ?? "no category"})`)
    }

    await carry({ label: `${name} → ${what}`, asset, sourceUrl, cookie })
  }
}

// ── 2 · the pictures that came across as somebody else's URL ─────────────────
//
// Matched on the STORED URL, not on a name: `file_url` on a live row IS the
// Glide address the seed wrote, so the manifest can be looked up directly. Ten
// of the 74 legacy rows share a name with another ("1", "4", "Aurora"), and a
// name match would have to guess between them.

step("The borrowed pictures")
if (!cookie) {
  console.log("  (needs a sign-in — the rows themselves say which files are still Glide's.)")
} else {
  library = await brandLibrary(cookie)
  for (const asset of library) {
    const sourceUrl = asset.fileUrl ?? ""
    if (!sourceUrl || isOurs(sourceUrl)) continue
    if (!rescued.has(sourceUrl)) {
      // Not a failure. Twenty-four of the legacy rows point at a colour-swatch
      // service or a client's own site — those were never in Glide's bucket and
      // do not die with it, the same ruling glide-visuals.mjs makes.
      continue
    }
    await carry({ label: `${asset.name}`, asset, sourceUrl, cookie })
  }
}

// ── 3 · the read-back ────────────────────────────────────────────────────────
//
// A 200 is not proof. The edit door takes a patch and answers cheerfully, so the
// only honest end to a migration that moves bytes is to go and LOOK at the rows.

if (!dryRun) {
  step("Reading it back")
  library = await brandLibrary(cookie)
  const stillBorrowed = library.filter((a) => a.fileUrl && rescued.has(a.fileUrl))
  for (const a of stillBorrowed) {
    tally.unproven.push(`${a.name} — the door accepted the path and the row still points at Glide`)
    say("UNPROVEN", `${a.name} — the row still points at Glide`)
  }
  say("ours", `${library.filter((a) => isOurs(a.fileUrl)).length} of ${library.length} assets carry a file we host`)
}

// ── 4 · the two files with no record to land on ──────────────────────────────
//
// Printed every run, because it is a DECISION and a decision that only lives in
// a comment is one the next person re-discovers as a gap.

step("No record to land on")
console.log("  glide/files/jidtfw1W9oLd3HPiaf87/g68ACvMZ9iMQ9v8s1Usm.mp4   (533 KB)")
console.log("  glide/files/jidtfw1W9oLd3HPiaf87/hn0itZDzkgrMrUXjrd0h.mov   (10.7 MB)")
console.log("  Both hang off Glide's `content` table — a LinkedIn post and a Facebook post from")
console.log("  the agency's own marketing pipeline. That table became `marketing_posts`, and the")
console.log("  Marketing module was purged on 17 Aug 2026 by the owner's ruling (team migration")
console.log("  0025). There is no record in this app for them to sit on, and building a module")
console.log("  the owner deleted in order to hold two videos would be the wrong answer to a")
console.log("  small problem. The bytes are safe: on this machine in glide/files/, and in the")
console.log("  private archive bucket scripts/glide-to-r2.mjs writes. They are not on a record.")

// ── what happened ────────────────────────────────────────────────────────────

console.log(`\n${dryRun ? "Would have" : "Done"}`)
console.log(`  ${tally.created} records ${dryRun ? "to add" : "added"} for documents the mapping never saw`)
console.log(`  ${tally.moved} files ${dryRun ? "to move" : "moved"}, ${(tally.movedBytes / 1048576).toFixed(2)} MB onto our own storage`)
console.log(`  ${tally.already} already carried a file we host — left alone (this is what a second run reports)`)

if (tally.noRecord.length) {
  console.log(`\nNo record to attach to — ${tally.noRecord.length}:`)
  for (const line of tally.noRecord) console.log(`  ${line}`)
}
if (tally.failures.length) {
  console.log(`\nCould not carry — ${tally.failures.length}:`)
  for (const line of tally.failures) console.log(`  ${line}`)
}
if (tally.unproven.length) {
  console.log(`\nWritten but NOT THERE on the read-back — ${tally.unproven.length}:`)
  for (const line of tally.unproven) console.log(`  ${line}`)
}

// A file that could not be read, a door that said no and a write that did not
// survive the read-back are all real failures, and the exit code has to say so.
// A run inside a script must never look successful because its summary was
// readable. A Glide row with no name is not a failure — it is a question for the
// owner — so it is reported and does not change the code.
const failed = tally.failures.length + tally.unproven.length
console.log(
  `\n${
    failed
      ? `${failed} could not be carried across. Run it again after fixing them — what moved stays moved.`
      : dryRun
        ? "Nothing stood in the way — run it again without --dry-run to move them."
        : "Every brand-library file Glide was holding is now on our own storage."
  }`
)
process.exit(failed ? 1 : 0)
