// backup — take a copy of every database this environment owns, to disk.
//
//   node scripts/backup.mjs staging
//   node scripts/backup.mjs production
//   node scripts/backup.mjs production --out ~/kwapso-backups
//
// READ-ONLY. It runs `d1 export` and writes files; it never executes a statement
// against a database and has no code path that could. It is the exact mirror of
// `reset-all.mjs`, which is why it borrows that script's account guard verbatim:
// the two scripts point at the same estate, and only one of them is allowed to
// change it.
//
// WHY THIS EXISTS AT ALL. Cloudflare keeps 30 days of Time Travel per D1
// database, which is a genuine safety net and is NOT what this replaces. Time
// Travel restores a database that still exists, in an account that still exists,
// to a point inside 30 days. It does nothing about a database somebody deleted
// and noticed in week six, an account-level problem, or a migration that
// corrupted rows slowly enough that every point in the window is already wrong.
// A file on disk answers those; Time Travel answers the common case faster.
// Keep both — RESILIENCE.md § "Live data can be recovered" says which to reach
// for when.
//
// WHAT THIS DOES NOT CAPTURE, said out loud because a backup you believe is
// complete is worse than one you know the edges of:
//   • the Vectorize index — DERIVED, and rebuildable from the team databases by
//     the knowledge sweep; nothing is lost, it just re-embeds
//   • Durable Object state — TeamChannel holds open sockets and no app data
//   • secrets (RESEND_API_KEY, GOOGLE_*, CF_D1_TOKEN, INTERNAL_KEY)
// The manifest written beside the dumps repeats this list, so the person holding
// the folder in two years does not have to find this comment.
//
// ── R2, AND WHY IT IS ENUMERATED RATHER THAN DERIVED ─────────────────────────
//
// The uploaded files used to be on that list. They are not any more, and the way
// they got covered is the whole point of the section further down.
//
// The obvious route was to work the inventory out from the databases: find every
// column an upload's key lands in, read the keys, fetch those objects. That was
// rejected, and it is worth saying why, because it looks like the careful option.
// It can only ever produce a backup of the files WE CAN STILL NAME. An object
// whose row was deleted, whose reference sits in a column nobody remembered, or
// whose key was minted before the row that would have pointed at it — every one
// of those is invisible to that pass, and the pass reports success. The failure
// is silent by construction, which is the exact failure this script's dump check
// exists to refuse in the D1 half.
//
// That is also why a module going away does not take its bucket with it. The
// learning library was purged on 17 Aug 2026 and nothing writes to
// kwapso-learning-media any more — but the gateway still serves it, the images
// inside those articles still have to load, and the objects are still the
// clients' own files. A bucket is backed up because it EXISTS, not because some
// row still names it.
//
// `wrangler` has no `r2 object list`, which is what makes the derived inventory
// look inevitable. The R2 REST API does have one, and this repo already pages it
// (scripts/glide-to-r2.mjs). So the bucket itself is the inventory: every object
// in it is fetched, and completeness is a property rather than a hope.
//
// The database columns are still read — for the OTHER direction. A row naming a
// key the bucket does not hold is a file that is ALREADY LOST, and a backup is
// the moment that becomes visible, exactly as a team database missing from the
// account is. That reconciliation is derived from the code: WHERE-THE-KEYS-LAND
// below lists every column, traced from the `.put(` calls in the workers.
//
// Which buckets are COVERED is derived from the wrangler configs, not typed from
// memory — and then the account is listed and asked whether it holds a bucket
// this environment owns that nothing covered. An uncovered bucket is recorded in
// the manifest and fails the run.

import { execSync } from "node:child_process"
import { mkdirSync, writeFileSync, statSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { timedFetch } from "./lib/api.mjs"
import { expectedAccount } from "./check-cloudflare-account.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const GLOBAL_DB = { staging: "kwapso-core-staging", production: "kwapso-core" }

// The one account these databases live in. Read-only or not, a script that names
// databases may not infer the account from ambient login state — wrangler picks
// whatever the machine is logged into, and on the machine this was written for
// that is a different client's account. Same guard, same reason, as reset-all —
// and, since 5 Sep 2026, the same SOURCE: `expectedAccount()` derives the id from
// the workers' own wrangler configs rather than five scripts each remembering it.
const KWAPSO_ACCOUNT_ID = expectedAccount()
const TOKEN = process.env.CLOUDFLARE_API_TOKEN
// The TOKEN is required, not optional, and that is a decision rather than an
// oversight. The R2 half goes through the REST API, so without a token this
// script could still dump every database and write a folder that LOOKS like a
// backup with not one uploaded file in it. There is no half-backup mode: the
// only states are "everything, or a refusal at the door".
if (process.env.CLOUDFLARE_ACCOUNT_ID !== KWAPSO_ACCOUNT_ID || !TOKEN) {
  console.error(
    `Refusing to run: CLOUDFLARE_ACCOUNT_ID is ${process.env.CLOUDFLARE_ACCOUNT_ID ?? "unset"}` +
      `${TOKEN ? "" : " and CLOUDFLARE_API_TOKEN is unset"},\n` +
      `and this script only ever reads ${KWAPSO_ACCOUNT_ID}.\n\n` +
      `Run it through cf-exec, or set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN first.`
  )
  process.exit(2)
}

const env = process.argv[2]
if (!GLOBAL_DB[env]) {
  console.error("Usage: node scripts/backup.mjs <staging|production> [--out <dir>]")
  process.exit(2)
}
const outFlag = process.argv.indexOf("--out")
// `--out` with nothing after it used to reach `join(undefined, …)` and die with
// a TypeError about a path — a stack trace where a usage line belongs.
if (outFlag > -1 && !process.argv[outFlag + 1]) {
  console.error("Usage: node scripts/backup.mjs <staging|production> [--out <dir>]")
  process.exit(2)
}
// DEFAULT ./backups, which .gitignore holds a `/backups/` line for — the one
// line between a routine `git add -A` and every client's rows in the repository.
// An explicit --out is the operator choosing somewhere else; nothing DERIVED
// from the data being backed up can move the destination (see safeObjectKey).
const baseDir = outFlag > -1 ? process.argv[outFlag + 1] : join(process.cwd(), "backups")

const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })

/** Run a read query against a database, return its rows. */
function query(db, sql) {
  const out = sh(`npx wrangler d1 execute ${db} --remote --json --command ${JSON.stringify(sql)}`)
  return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? []
}

// A folder per run, stamped, so two backups never overwrite each other and the
// order on disk is the order they were taken.
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dir = join(baseDir, `${env}-${stamp}`)
mkdirSync(dir, { recursive: true })

const core = GLOBAL_DB[env]
console.log(`\n=== BACKUP ${env.toUpperCase()} → ${dir} ===`)

const nameByUuid = Object.fromEntries(
  JSON.parse(sh("npx wrangler d1 list --json")).map((d) => [d.uuid, d.name])
)

let failures = 0
const captured = []

/** Export one database and prove the file that came back is worth keeping.
 *
 * "It ran without erroring" is not the test. `d1 export` exits 0 on a database
 * it reached and found nothing in, and a zero-byte file in a backup folder is
 * the single most expensive kind of success — you learn it was empty on the day
 * you need it. So every dump is read back and must contain at least one
 * statement before it counts. */
function dump(name, label) {
  const file = join(dir, `${name}.sql`)
  try {
    sh(`npx wrangler d1 export ${name} --remote --output ${JSON.stringify(file)}`)
  } catch (e) {
    console.log(`  FAIL  ${label} (${name}) — export failed: ${e.message.split("\n")[0]}`)
    failures++
    return
  }
  const bytes = statSync(file).size
  const hasStatements = /CREATE TABLE|INSERT INTO/i.test(readFileSync(file, "utf8"))
  if (!hasStatements) {
    console.log(`  FAIL  ${label} (${name}) — dump has no schema or rows (${bytes} bytes)`)
    failures++
    return
  }
  console.log(`  ok    ${label} (${name}) — ${bytes.toLocaleString()} bytes`)
  captured.push({ database: name, label, file: `${name}.sql`, bytes })
}

// 1 · the global core: identity, teams, the card catalog, the error store.
dump(core, "core")

// 2 · every team database this environment's own core points at — the same two
// sources reset-all reads, so backup and reset can never disagree about which
// databases belong to this environment.
const teamDbIds = [
  ...new Set(
    [
      ...query(core, "SELECT database_id AS id FROM teams WHERE database_id IS NOT NULL"),
      ...query(core, "SELECT database_id AS id FROM team_module_databases"),
    ].map((r) => r.id)
  ),
]
console.log(`team databases: ${teamDbIds.length}`)
for (const id of teamDbIds) {
  const name = nameByUuid[id]
  if (!name) {
    // Referenced by core but absent from the account. Not a warning to swallow:
    // it means a team's rows are already gone, and the backup is the moment that
    // becomes visible.
    console.log(`  FAIL  team database ${id} is referenced by core but does not exist`)
    failures++
    continue
  }
  dump(name, "team")
}

// ── 3 · R2 ───────────────────────────────────────────────────────────────────
// The uploaded files: every object in every bucket this environment owns, onto
// disk beside the dumps, and a reconciliation against the rows that point at
// them. See the header for why the bucket is the inventory and the databases are
// only the cross-check.

/** The R2 REST API — the only door with an object list on it (wrangler has no
 * `r2 object list`). Same base and same shape as scripts/glide-to-r2.mjs, over
 * the shared `timedFetch` so R11's deadline and its bounded retry are not a
 * thing this script had to remember. */
const R2_API = `https://api.cloudflare.com/client/v4/accounts/${KWAPSO_ACCOUNT_ID}/r2`
async function r2(path, wantJson = true) {
  const res = await timedFetch(`${R2_API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  // Cloudflare answers 200 with success:false for some refusals, so a caller can
  // never read the body on the status alone.
  if (!wantJson) return { ok: res.ok, status: res.status, bytes: Buffer.from(await res.arrayBuffer()) }
  const body = await res.json().catch(() => null)
  if (!body?.success) {
    const why = body?.errors?.map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${res.status}`
    throw new Error(`GET ${path} — ${why}`)
  }
  return body
}

const PAGE = 1000 // R2's list page, followed to the end by cursor
const CONCURRENCY = 6 // modest: their API at one end, this laptop's disk at the other

/** Every object in a bucket: key → size. Followed to the LAST page, and it
 * throws rather than returning what it has — a half-read list is a backup that
 * quietly ends at object 1000, which is the failure this whole section is
 * shaped against. */
async function listObjects(bucket) {
  const objects = new Map()
  let cursor = null
  for (let page = 0; page < 1000; page++) {
    const q = `?per_page=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
    const body = await r2(`/buckets/${bucket}/objects${q}`)
    for (const o of body.result ?? []) objects.set(o.key, o.size)
    if (!body.result_info?.is_truncated) return objects
    cursor = body.result_info.cursor
  }
  throw new Error(`listing ${bucket} did not end after 1000 pages`)
}

/** WHICH BUCKETS THIS ENVIRONMENT OWNS — read off the wrangler configs, never
 * typed here. A bucket is covered because a worker binds it, so adding a binding
 * adds it to the backup and there is no second list to keep in step.
 *
 * Split by environment on the `-staging` suffix, which is the convention every
 * config in this repo follows. A convention is a weaker thing than a parse, so
 * it is not load-bearing on its own: the discovery check below asks the ACCOUNT
 * what it holds, and a bucket that broke the convention would surface there as
 * uncovered rather than be silently dropped. */
function boundBuckets(environment) {
  const names = new Set()
  for (const worker of readdirSync(join(ROOT, "workers"))) {
    const cfg = join(ROOT, "workers", worker, "wrangler.jsonc")
    if (!existsSync(cfg)) continue
    for (const [, name] of readFileSync(cfg, "utf8").matchAll(/"bucket_name"\s*:\s*"([^"]+)"/g)) {
      if (isThisEnvironment(name, environment)) names.add(name)
    }
  }
  return names
}
const isThisEnvironment = (name, environment) =>
  environment === "staging" ? name.endsWith("-staging") : !name.endsWith("-staging")

/** The one bucket no worker binds, ON PURPOSE. The rescued Glide files belong to
 * no team yet, so scripts/glide-to-r2.mjs puts them somewhere provably unservable
 * and re-proves that on every run. Unbound means `boundBuckets` cannot see it —
 * and unbackupable is the last thing it should be, because these are the
 * clients' own files and re-fetching them stops being possible the day the Glide
 * account lapses (.gitignore says the same about the local copies). */
const ARCHIVE_BUCKET = { staging: "kwapso-glide-archive-staging", production: "kwapso-glide-archive" }

/** WHERE THE KEYS LAND — every column in this codebase that holds an R2 object's
 * URL, traced from the places a worker writes one:
 *
 *   auth/src/lib/profile.ts          MEDIA           → core users.image_url
 *   tenancy/src/lib/teams.ts         MEDIA           → core teams.logo_url
 *   content/routes/todos.ts          MEDIA           → team todos.file_url
 *   content/routes/brand-assets.ts   INTERNAL_MEDIA  → team brand_assets.file_url
 *   content/routes/staff.ts          INTERNAL_MEDIA  → team staff_profiles.photo_url
 *                                                      + staff_certificates.file_url
 *   content/routes/knowledge.ts      INTERNAL_MEDIA  → team knowledge_sources.file_url
 *
 * The last three doors hand a URL back to a FORM and the row is written by a
 * different route, so the column was read off the write, not guessed from the
 * name.
 *
 * LEARNING_MEDIA USED TO HAVE TWO ROWS HERE — learning.content_link and
 * learning.content_body — and they are gone because the TABLE is gone (the
 * learning library was purged on 17 Aug 2026). Reconciling against a table that
 * no longer exists does not report a missing file; it throws, and ends the
 * backup where it should have reported one. The BUCKET is untouched: it is still
 * bound and still served at /media/learning/, so it is enumerated and captured
 * like every other one, which is the half that was always doing the work. There
 * is simply no row left to cross-check it against.
 *
 * HELP_MEDIA is bound by the content worker and appears in NO row here, because
 * nothing writes it: the ticket-attachment hook is deferred (OPERATIONS.md §R2
 * buckets). It is still BACKED UP — it is a bound bucket, so it is enumerated
 * like the rest, and whatever is in it comes back. */
const CORE_REFERENCES = [
  { table: "users", column: "image_url" },
  { table: "teams", column: "logo_url" },
]
const TEAM_REFERENCES = [
  { table: "todos", column: "file_url" },
  { table: "brand_assets", column: "file_url" },
  { table: "staff_profiles", column: "photo_url" },
  { table: "staff_certificates", column: "file_url" },
  { table: "knowledge_sources", column: "file_url" },
]

/** A stored URL → the bucket that serves it and the key inside it, by the SAME
 * prefix order the gateway matches in (workers/gateway/src/index.ts): learning,
 * then internal, then the shared bucket. One function, so the backup cannot
 * disagree with the door about where a file lives.
 *
 * ROOT-RELATIVE ONLY, for the reason `ownedMediaKey` gives at length in
 * shared/workers/image.ts: `https://elsewhere.example/media/…` is a link on
 * someone else's host, and reading our own key out of it would let a pasted
 * link invent a missing file.
 * brand_assets.file_url is documented as "either an object we host or a link
 * somewhere else", so this is what keeps a legacy Google link from being
 * reported as a lost object. */
function routeMediaUrl(url, environment) {
  let path = url.split("?")[0].split("#")[0]
  // Decoded first, the same step safeMediaKey takes at the read door: a stored
  // URL is a URL, and comparing its ESCAPES against an R2 key would report a
  // present file as missing — a false alarm in the one place false alarms are
  // most expensive, because the true ones here mean a file is gone.
  try {
    path = decodeURIComponent(path)
  } catch {
    return null // a malformed %-escape is not a reference we minted
  }
  const bucket = (base, binding) =>
    path.startsWith(base) ? { bucket: bucketFor(binding, environment), key: path.slice(base.length) } : null
  return (
    bucket("/media/learning/", "learning-media") ??
    bucket("/media/internal/", "internal-media") ??
    bucket("/media/", "media")
  )
}
const bucketFor = (binding, environment) =>
  `kwapso-${binding}${environment === "staging" ? "-staging" : ""}`

/** Every root-relative /media/… reference inside a column value. The lookbehind
 * is what makes it a reference to OUR object rather than any string containing
 * our path, and the character class stops at the `?v=` cache-buster and at any
 * quote — a reference is the path and nothing else, and everything after it
 * belongs to whoever wrote the surrounding text. */
const MEDIA_URL = /(?<![\w:.\-/])\/media\/[A-Za-z0-9/_%-]+/g

/** THE KEY A BACKUP MAY WRITE TO DISK. R2 hands these back, not a caller, but a
 * key becomes a PATH here and that is the one place a store's key can escape the
 * folder it was meant to land in. Same shape rule as shared/workers/image.ts's
 * safeMediaKey, widened by a dot because the archive keys carry extensions. */
const safeObjectKey = (key) =>
  typeof key === "string" &&
  key.length > 0 &&
  key.length <= 512 &&
  !key.includes("..") &&
  !key.includes("//") &&
  /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key)

const r2Dir = join(dir, "r2")
const r2Report = []
let r2Objects = 0
let r2Bytes = 0

/** Read the media references out of one database. Which tables EXIST is asked
 * first: a team database that has not had every migration rolled onto it is a
 * fact about the estate, not a reason for the whole backup to throw. */
function referencedKeys(db, references) {
  const present = new Set(
    query(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name)
  )
  const wanted = references.filter((r) => present.has(r.table))
  if (!wanted.length) return []
  // Only rows that mention /media/ at all come back — a whole article body is a
  // lot of JSON to move to find out it holds no attachment.
  const sql = wanted
    .map(
      (r) =>
        `SELECT '${r.table}' AS t, '${r.column}' AS c, ${r.column} AS v ` +
        `FROM ${r.table} WHERE ${r.column} LIKE '%/media/%'`
    )
    .join(" UNION ALL ")
  const found = []
  for (const row of query(db, sql)) {
    for (const match of String(row.v ?? "").matchAll(MEDIA_URL)) {
      const routed = routeMediaUrl(match[0], env)
      if (routed?.key) found.push({ ...routed, from: `${row.t}.${row.c}` })
    }
  }
  return found
}

console.log("\nR2:")

// a · WHICH BUCKETS. From the configs, plus the archive nothing binds, and then
// the account is asked whether it holds one nothing covered.
const covered = boundBuckets(env)
covered.add(ARCHIVE_BUCKET[env])
const inAccount = (await r2("/buckets")).result.buckets
  .map((b) => b.name)
  .filter((n) => n.startsWith("kwapso-") && isThisEnvironment(n, env))
const uncovered = inAccount.filter((n) => !covered.has(n))
for (const name of uncovered) {
  // NOT a warning to swallow, and not something to quietly add either: a bucket
  // this app owns that no config names is either a leftover or a binding someone
  // forgot, and both are answers a person has to give.
  console.log(`  FAIL  ${name} exists in the account and nothing covers it — it is NOT in this backup`)
  failures++
}

// b · EVERY OBJECT, FETCHED. What the bucket holds is what the backup holds.
const referenced = new Map() // bucket → Map(key → [where it was referenced from])
const noteReference = (ref) => {
  if (!referenced.has(ref.bucket)) referenced.set(ref.bucket, new Map())
  const forBucket = referenced.get(ref.bucket)
  forBucket.set(ref.key, [...(forBucket.get(ref.key) ?? []), ref.from])
}
for (const ref of referencedKeys(core, CORE_REFERENCES)) noteReference(ref)
for (const id of teamDbIds) {
  const name = nameByUuid[id]
  if (name) for (const ref of referencedKeys(name, TEAM_REFERENCES)) noteReference(ref)
}

for (const bucket of [...covered].sort()) {
  if (!inAccount.includes(bucket)) {
    // A bucket a worker binds that is not in the account. The worker's uploads
    // are failing right now; the backup is just where it becomes visible.
    console.log(`  FAIL  ${bucket} is bound by a worker but does not exist in the account`)
    failures++
    continue
  }

  let objects
  try {
    objects = await listObjects(bucket)
  } catch (e) {
    console.log(`  FAIL  ${bucket} could not be listed — ${e.message.split("\n")[0]}`)
    failures++
    r2Report.push({ bucket, listed: false, note: "could not be enumerated — NOT captured" })
    continue
  }

  const keys = [...objects.keys()]
  const unsafe = keys.filter((k) => !safeObjectKey(k))
  for (const key of unsafe) {
    console.log(`  FAIL  ${bucket} holds a key this script will not write to disk: ${JSON.stringify(key)}`)
    failures++
  }

  // The fetch. A small pool, because a production bucket is hundreds of objects
  // and one at a time is a backup nobody takes twice.
  const safe = keys.filter(safeObjectKey)
  const failed = []
  let saved = 0
  let bucketBytes = 0
  let nextObject = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, safe.length) }, async () => {
      for (;;) {
        const i = nextObject++
        if (i >= safe.length) return
        const key = safe[i]
        const file = join(r2Dir, bucket, key)
        // The containment check, AFTER the join and on the resolved path. The
        // shape rule above should already have made this unreachable; it is here
        // because "should" is not the standard for the one operation in this
        // script that writes a path built out of data.
        if (!resolve(file).startsWith(resolve(r2Dir) + sep)) {
          failed.push({ key, error: "resolves outside the backup folder" })
          continue
        }
        try {
          const got = await r2(`/buckets/${bucket}/objects/${key}`, false)
          if (!got.ok) throw new Error(`HTTP ${got.status}`)
          // Read back what the LIST said it was. A truncated body is a file that
          // will not restore, and it is indistinguishable from a good one on disk.
          if (got.bytes.length !== objects.get(key))
            throw new Error(`got ${got.bytes.length} bytes, the bucket lists ${objects.get(key)}`)
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, got.bytes)
          saved++
          bucketBytes += got.bytes.length
        } catch (e) {
          failed.push({ key, error: e.message.split("\n")[0] })
        }
      }
    })
  )
  for (const f of failed) {
    console.log(`  FAIL  ${bucket}/${f.key} — ${f.error}`)
    failures++
  }
  r2Objects += saved
  r2Bytes += bucketBytes

  // c · THE RECONCILIATION. Every key a row names, against what the bucket
  // actually holds. A row pointing at nothing is a file that is ALREADY GONE —
  // the backup did not lose it, but the backup is where it stops being invisible.
  const refs = referenced.get(bucket) ?? new Map()
  const missing = [...refs].filter(([key]) => !objects.has(key))
  for (const [key, from] of missing) {
    console.log(`  FAIL  ${bucket}/${key} is referenced by ${[...new Set(from)].join(", ")} and the bucket does not hold it`)
    failures++
  }
  // The other direction is NOT a failure, and saying why matters: an object no
  // row names is the ordinary residue of this design. Every upload door mints a
  // key BEFORE the row that will point at it (an abandoned form leaves one), the
  // archive bucket has no rows at all yet by design, and reclaimMedia only
  // started deleting superseded objects recently. They are captured either way —
  // enumerating the bucket is what makes that true — and counted so the number
  // is a thing somebody can watch rather than a surprise.
  const orphans = [...objects.keys()].filter((k) => !refs.has(k))

  // `ok` only when this bucket really is whole. A green word beside a line that
  // has just printed a failure is the thing a person reads instead of the failure.
  const whole = saved === keys.length && !missing.length
  console.log(
    `  ${whole ? "ok  " : "PART"}  ${bucket} — ${saved}/${keys.length} object(s), ` +
      `${bucketBytes.toLocaleString()} bytes, ${refs.size} referenced by rows, ` +
      `${orphans.length} unreferenced${missing.length ? `, ${missing.length} MISSING` : ""}`
  )
  r2Report.push({
    bucket,
    listed: true,
    objects: keys.length,
    captured: saved,
    bytes: bucketBytes,
    referencedByRows: refs.size,
    unreferenced: orphans.length,
    missing: missing.map(([key, from]) => ({ key, referencedBy: [...new Set(from)] })),
    failed,
  })
}

// 4 · the manifest — what this folder is, and what it is NOT.
const manifest = {
  environment: env,
  takenAt: new Date().toISOString(),
  account: KWAPSO_ACCOUNT_ID,
  coreDatabase: core,
  captured,
  r2: {
    // How the coverage was decided, in the folder, so the person holding it does
    // not have to trust that the script did what its header says.
    inventoryFrom:
      "the R2 REST object list, per bucket — every object in the bucket is captured, " +
      "not only the ones a database row still names",
    reconciledAgainst: [
      ...CORE_REFERENCES.map((r) => `core ${r.table}.${r.column}`),
      ...TEAM_REFERENCES.map((r) => `team ${r.table}.${r.column}`),
    ],
    directory: "r2/<bucket>/<key>",
    objects: r2Objects,
    bytes: r2Bytes,
    buckets: r2Report,
    uncoveredBuckets: uncovered,
  },
  notCaptured: [
    "the Vectorize index (derived — rebuilt by the knowledge sweep from the team databases)",
    "Durable Object state (TeamChannel holds sockets, not app data)",
    "secrets (RESEND_API_KEY, GOOGLE_*, CF_D1_TOKEN, INTERNAL_KEY, GOOGLE_TOKEN_KEY)",
    ...uncovered.map((b) => `R2 bucket ${b} — in the account, covered by nothing, NOT captured`),
    ...r2Report.filter((b) => !b.listed).map((b) => `R2 bucket ${b.bucket} — could not be enumerated, NOT captured`),
  ],
  restoreWith: "RESILIENCE.md § Live data can be recovered",
}
writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(
  failures
    ? `\n${failures} problem(s) — this backup is NOT complete. Do not rely on it.`
    : `\nBacked up ${captured.length} database(s) and ${r2Objects} R2 object(s) ` +
      `(${r2Bytes.toLocaleString()} bytes) to ${dir}`
)
process.exit(failures ? 1 : 0)
