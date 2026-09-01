#!/usr/bin/env node
// Move the rescued Glide files off Google's storage and onto OUR R2, permanently.
//
//   export CLOUDFLARE_API_TOKEN=$(security find-generic-password -s cf-token-kwapso -w)
//   export CLOUDFLARE_ACCOUNT_ID=b5bb3d84a59c029ea5e0fe164dab1cf7
//   node scripts/glide-to-r2.mjs staging
//   node scripts/glide-to-r2.mjs production
//
// glide/files/manifest.json is the source of truth — every file Glide was hosting
// for us, with the row and column that referenced it (scripts/glide-files.mjs put
// it there; RECONCILIATION.md §4.5 says why). This script uploads every one of
// them and writes glide/r2-manifest.json: original URL → bucket + key → content
// type → size → the row it came from. That map is the whole point. The migration
// has not run, no team has an id yet, so nothing can be repointed today; when it
// can be, this file is what it reads.
//
// Safe to re-run, and cheap to. It LISTS the bucket first and skips every object
// already there at the size the manifest recorded, so a second run uploads
// nothing and says so. A missing local copy is not a failure either — it falls
// back to fetching the original Google URL, so this works on a machine that has
// never run glide-files.mjs.
//
// ── WHERE THE OBJECTS GO, AND WHY IT IS A BUCKET OF THEIR OWN ────────────────
//
// These files belong to no team. There are no accounts yet, no team ids to key
// them under, and no gated row that points at them — so for now they must sit
// somewhere that is provably NOT servable to anyone, and be copied into proper
// team-scoped keys later, when the migration knows the ids.
//
// The two candidates were a reserved prefix inside kwapso-media[-staging], and a
// bucket of their own. The prefix loses, and not on taste — it is measurably
// public. `serveMedia` (shared/workers/front-door.ts) answers /media/<key> by
// calling bucket.get(key) for ANY key that clears `safeMediaKey`. There is no
// prefix allow-list on that path and no session check: the key IS the credential,
// a deliberate, recorded decision (SCOPE ch.06). Measured against staging on
// 11 Aug 2026, `GET /media/users/01KZJA16ZG5ZHFDRAMF82TSFSH` — an ordinary key
// listed straight out of kwapso-media-staging — returned `200 image/jpeg` from
// the agency door AND from the portal door. So every key in the media bucket is
// a live public URL to whoever knows it, and the key for an archive object would
// be derived from its Glide path: the very thing already published in the Google
// URLs we are retiring. A reserved prefix would republish the clients' files
// under our own domain on day one.
//
// So: a bucket of their own, bound by nothing. Three facts make "cannot be served
// publicly" a property rather than an intention, and `assertPrivate` re-checks all
// three BEFORE a byte is written, on every run, in both environments:
//
//   1. no wrangler config under workers/ names this bucket, so neither front door
//      has a binding that could reach it. Only those two workers are public at
//      all — workers/gateway/test/public-surface.test.ts holds that line per
//      worker, per environment;
//   2. the bucket's managed r2.dev address is disabled — and the script FETCHES
//      that address to be sure, rather than believing the flag;
//   3. it has no custom domain.
//
// Then, after uploading, it proves the negative the only honest way there is: it
// takes a key the R2 API has just confirmed exists and asks both public front
// doors for it. A 404 from a door that cannot be shown the object is the evidence.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST = resolve(ROOT, "glide/files/manifest.json")
const FILES_DIR = resolve(ROOT, "glide/files")
const OUT = resolve(ROOT, "glide/r2-manifest.json")

/** One archive bucket per environment, named for what it holds and nothing else. */
const BUCKET = { staging: "kwapso-glide-archive-staging", production: "kwapso-glide-archive" }

/** The two public front doors, per environment — the ones the refusal check asks.
 * Production answers on its custom domains only (OPERATIONS.md); staging keeps its
 * workers.dev names, which is where the smoke and the seed reach it. */
const FRONT_DOORS = {
  staging: {
    agency: "https://kwapso-staging.kwapso.workers.dev",
    portal: "https://kwapso-portal-staging.kwapso.workers.dev",
  },
  production: { agency: "https://agency.kwapso.app", portal: "https://client.kwapso.app" },
}

// R11 — an external call always has a deadline. Generous, because the biggest
// object here is 11 MB and it crosses the wire twice (down from Google, up to R2);
// finite, because a wedged host must fail the run rather than the day.
const REQUEST_TIMEOUT_MS = 60_000
const CONCURRENCY = 6 // modest: someone else's bucket at one end, ours at the other
const ATTEMPTS = 3
const PAGE = 1000 // R2's list page, followed to the end by cursor

// ── The account, said out loud ───────────────────────────────────────────────
// wrangler and the API both take whatever account the machine is pointed at, and
// on the machine this was written for that default is a DIFFERENT client's. This
// script writes 79 MB of one client's files; it may not infer where.
const KWAPSO_ACCOUNT_ID = "b5bb3d84a59c029ea5e0fe164dab1cf7"
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID
const TOKEN = process.env.CLOUDFLARE_API_TOKEN
if (ACCOUNT !== KWAPSO_ACCOUNT_ID || !TOKEN) {
  console.error(
    `Refusing to run: CLOUDFLARE_ACCOUNT_ID is ${ACCOUNT ?? "unset"}` +
      `${TOKEN ? "" : " and CLOUDFLARE_API_TOKEN is unset"},\n` +
      `and this script only ever writes to ${KWAPSO_ACCOUNT_ID}.\n\n` +
      `  export CLOUDFLARE_API_TOKEN=$(security find-generic-password -s cf-token-kwapso -w)\n` +
      `  export CLOUDFLARE_ACCOUNT_ID=${KWAPSO_ACCOUNT_ID}`
  )
  process.exit(2)
}

const env = process.argv[2]
if (!BUCKET[env]) {
  console.error("Usage: node scripts/glide-to-r2.mjs <staging|production>")
  process.exit(2)
}
const bucket = BUCKET[env]

// ── The one door to Cloudflare ───────────────────────────────────────────────
// R2 has no HEAD on this API and wrangler has no object list, so everything goes
// through the REST API: list to know what is already there, PUT to add, GET to
// check it came back the same.
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2`

async function cf(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const isJson = (res.headers.get("content-type") ?? "").includes("json")
  const body = isJson ? await res.json() : Buffer.from(await res.arrayBuffer())
  return { status: res.status, ok: res.ok, body, headers: res.headers }
}

/** A JSON call that must have worked. Cloudflare answers 200 with success:false
 * for some refusals, so both halves are checked before anything trusts the body. */
async function cfJson(path, init) {
  const { status, body } = await cf(path, init)
  if (!body?.success) {
    const why = body?.errors?.map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${status}`
    throw new Error(`${init?.method ?? "GET"} ${path} — ${why}`)
  }
  return body.result
}

// ── The bucket, and the proof that nothing can serve it ──────────────────────

async function ensureBucket() {
  const { buckets } = await cfJson("/buckets")
  if (buckets.some((b) => b.name === bucket)) return false
  await cfJson("/buckets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: bucket }),
  })
  return true
}

/** Every fact that has to hold before this script writes a client's files into a
 * bucket. Checked first, not last: an archive that turns out to be public is not
 * something to discover after uploading it. Throws on the first failure. */
async function assertPrivate() {
  // 1 · No worker binds it. The gateways are the only public workers, so a bucket
  // no wrangler config names has no public route at all — grep the configs rather
  // than trust the memory of having not added one.
  const named = []
  for (const dir of readdirSync(resolve(ROOT, "workers"))) {
    const cfg = resolve(ROOT, "workers", dir, "wrangler.jsonc")
    if (existsSync(cfg) && readFileSync(cfg, "utf8").includes(bucket)) named.push(dir)
  }
  if (named.length) {
    throw new Error(
      `${bucket} is bound by ${named.join(", ")}. This bucket is an archive of files that ` +
        `belong to no team yet; binding it to a worker puts them behind /media/<key>, which ` +
        `serves any key it is given with no session.`
    )
  }

  // 2 · The managed r2.dev address is off — and asked, not assumed.
  const managed = await cfJson(`/buckets/${bucket}/domains/managed`)
  if (managed.enabled) throw new Error(`${bucket} is published at https://${managed.domain}`)

  // 3 · No custom domain in front of it.
  const custom = await cfJson(`/buckets/${bucket}/domains/custom`)
  if (custom.domains?.length) {
    throw new Error(`${bucket} answers on ${custom.domains.map((d) => d.domain).join(", ")}`)
  }
  return managed.domain // probed for real at the end
}

/** Everything already in the bucket: key → { size, contentType }. Followed to the
 * last page — a half-read list would re-upload what is already there, which is
 * slow rather than wrong, but "idempotent" should mean it. */
async function listBucket() {
  const have = new Map()
  let cursor = null
  for (let page = 0; page < 100; page++) {
    const q = `?per_page=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
    const { status, body } = await cf(`/buckets/${bucket}/objects${q}`)
    if (!body?.success) throw new Error(`list ${bucket} — HTTP ${status}`)
    for (const o of body.result ?? []) {
      have.set(o.key, { size: o.size, contentType: o.http_metadata?.contentType })
    }
    if (!body.result_info?.is_truncated) return have
    cursor = body.result_info.cursor
  }
  throw new Error(`list ${bucket} — refusing to page past 100 requests`)
}

// ── The bytes ────────────────────────────────────────────────────────────────

/** What the first bytes SAY the file is, for the handful of types this corpus
 * holds — or null when they say nothing definite (an SVG is text, and text has no
 * signature, so the manifest keeps the last word there).
 *
 * Worth the twelve lines: the manifest records the content type GOOGLE declared,
 * and Google is wrong about one file — VOtJKvNi6F4lUHdCOqn0.avif is a WebP. A
 * type stored wrong here is a broken image later, on a door that sends
 * X-Content-Type-Options: nosniff and so will not rescue it. */
function sniffType(buf) {
  const hex = buf.subarray(0, 12).toString("hex")
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png"
  if (hex.startsWith("ffd8ff")) return "image/jpeg"
  if (hex.startsWith("25504446")) return "application/pdf"
  if (hex.startsWith("47494638")) return "image/gif"
  const ascii = (a, b) => buf.subarray(a, b).toString("latin1")
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12)
    if (brand.startsWith("avi")) return "image/avif" // avif / avis
    if (brand.startsWith("qt")) return "video/quicktime"
    return "video/mp4"
  }
  return null
}

/** The file's bytes: the local copy when there is one at the size the manifest
 * recorded, otherwise the original URL. A local copy at the WRONG size is a
 * truncated write from a run that died mid-stream — it is not the file, so it is
 * re-fetched rather than uploaded. */
async function bytesFor(entry) {
  const local = resolve(FILES_DIR, entry.path)
  if (existsSync(local) && statSync(local).size === entry.bytes) {
    return { bytes: readFileSync(local), from: "local" }
  }

  let lastError = null
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(entry.url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!res.ok) {
        lastError = `${res.status} ${res.statusText}`
        if (res.status < 500) break // a 403 or a 404 is an answer; retrying cannot change it
        continue
      }
      return { bytes: Buffer.from(await res.arrayBuffer()), from: "origin" }
    } catch (err) {
      lastError = err.name === "TimeoutError" ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : err.message
    }
  }
  throw new Error(`no local copy, and the original URL gave ${lastError ?? "no answer"}`)
}

/** Keys we mint are the manifest's own paths — the bucket's two identifiers plus
 * an extension. Anything else is checked at the boundary before it reaches the
 * store, the same way a request value would be: a key with a space, a backslash,
 * a dot-segment or a leading slash is not a key, and building a URL out of one
 * would be this script trusting a file it read. */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/
const safeKey = (path) =>
  SAFE_KEY.test(path) && !path.includes("..") && !path.includes("//") && path.length <= 512

// ── Read the manifest ────────────────────────────────────────────────────────

if (!existsSync(MANIFEST)) {
  console.error(
    `No ${MANIFEST}.\nRun \`node scripts/glide-files.mjs\` first — it downloads the files ` +
      `and writes the manifest this script reads.`
  )
  process.exit(2)
}
const source = JSON.parse(readFileSync(MANIFEST, "utf8"))
const entries = source.files ?? []
if (source.failures?.length) {
  // Said out loud, because these are files the rescue never got and this script
  // cannot invent. They are not this run's failures — but they ARE missing.
  console.error(`Note: the rescue recorded ${source.failures.length} file(s) it could not fetch.`)
}

const badKeys = entries.filter((e) => !safeKey(e.path))
if (badKeys.length) {
  console.error(`Refusing to run: ${badKeys.length} manifest path(s) are not usable as keys:`)
  for (const b of badKeys) console.error(`  ${JSON.stringify(b.path)}`)
  process.exit(2)
}

console.log(`=== GLIDE FILES → R2 (${env}) ===`)
console.log(`bucket: ${bucket}`)
console.log(`manifest: ${entries.length} files, generated ${source.generatedAt}`)

const created = await ensureBucket()
if (created) console.log(`created bucket ${bucket}`)
const r2DevDomain = await assertPrivate()
console.log(`private: no worker binds it, r2.dev off (${r2DevDomain}), no custom domain`)

const have = await listBucket()
console.log(`already in the bucket: ${have.size} object(s)`)

// ── Upload ───────────────────────────────────────────────────────────────────

async function upload(entry) {
  const key = entry.path
  const there = have.get(key)
  // Idempotent on the one thing the list can tell us for certain. Same key, same
  // size = the same object; nothing is uploaded and nothing is overwritten.
  if (there && there.size === entry.bytes) {
    // The type comes from the STORED object, not from the manifest — a re-run must
    // describe what is actually in the bucket, including a correction an earlier
    // run made. Saying "manifest" here would quietly un-record that.
    const contentType = there.contentType ?? entry.contentType
    const corrected = contentType !== entry.contentType
    return {
      url: entry.url,
      bucket,
      key,
      contentType,
      contentTypeFrom: corrected ? "bucket" : "manifest",
      declaredContentType: corrected ? entry.contentType : undefined,
      bytes: entry.bytes,
      refs: entry.refs,
      skipped: true,
    }
  }

  const { bytes, from } = await bytesFor(entry)
  const sniffed = sniffType(bytes)
  const corrected = sniffed && sniffed !== entry.contentType
  const contentType = corrected ? sniffed : entry.contentType

  const { status, body } = await cf(`/buckets/${bucket}/objects/${key}`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
  })
  if (!body?.success) {
    const why = body?.errors?.map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${status}`
    throw new Error(`PUT ${key} — ${why}`)
  }

  return {
    url: entry.url,
    bucket,
    key,
    contentType,
    contentTypeFrom: corrected ? "bytes" : "manifest",
    bytes: bytes.length,
    refs: entry.refs,
    skipped: false,
    fetchedFrom: from,
    declaredContentType: corrected ? entry.contentType : undefined,
  }
}

const done = []
const failures = []
let next = 0
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, entries.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= entries.length) return
      const entry = entries[i]
      try {
        const result = await upload(entry)
        done.push(result)
        process.stdout.write(result.skipped ? "·" : "+")
      } catch (err) {
        failures.push({ url: entry.url, key: entry.path, error: err.message, refs: entry.refs })
        process.stdout.write("!")
      }
    }
  })
)
process.stdout.write("\n")

const uploaded = done.filter((d) => !d.skipped)
const skipped = done.filter((d) => d.skipped)
const uploadedBytes = uploaded.reduce((n, d) => n + d.bytes, 0)
const totalBytes = done.reduce((n, d) => n + d.bytes, 0)
const corrections = uploaded.filter((d) => d.contentTypeFrom === "bytes")
const fromOrigin = uploaded.filter((d) => d.fetchedFrom === "origin")

// ── The map the migration will read ──────────────────────────────────────────

done.sort((a, b) => a.key.localeCompare(b.key))
writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment: env,
      bucket,
      account: ACCOUNT,
      source: source.source,
      note:
        "Original Glide URL → where that file now lives in our R2, and the row that " +
        "referenced it. The bucket is bound by no worker: these objects are not " +
        "reachable through either front door, and the migration must copy them into " +
        "team-scoped keys once team ids exist.",
      files: done.map(({ skipped: _s, fetchedFrom: _f, ...keep }) => keep),
      failures,
    },
    null,
    2
  )
)

const mb = (n) => (n / 1024 / 1024).toFixed(1)
console.log(
  `\n${uploaded.length} uploaded (${uploadedBytes.toLocaleString()} bytes, ${mb(uploadedBytes)} MB), ` +
    `${skipped.length} already there, ${failures.length} failed.`
)
if (fromOrigin.length) console.log(`${fromOrigin.length} had no local copy and came from the original URL.`)
if (corrections.length) {
  console.log(`\n${corrections.length} content type(s) corrected — the manifest disagreed with the bytes:`)
  for (const c of corrections) console.log(`  ${c.key}: manifest said ${c.declaredContentType}, stored ${c.contentType}`)
}
console.log(`Map: glide/r2-manifest.json`)

// ── Verify. Read it back, and prove the negative ─────────────────────────────

let failed = 0
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`)
  if (!ok) failed++
}
/** A check that could not be RUN — the address it asks about does not answer at
 * all. Never PASS: "nothing refused it because nothing was there" is the shape of
 * a green line that hides a gap, and the refusal checks below are the ones this
 * whole placement decision rests on. Not counted as a failure either — a door
 * that has not been stood up yet is a fact about the environment, not a defect. */
const unproven = (label, why) => console.log(`  ----  ${label} — NOT CHECKED: ${why}`)
console.log("\nverifying:")

const after = await listBucket()
check(
  `the bucket lists ${entries.length} objects`,
  after.size === entries.length,
  `it lists ${after.size}`
)
const listedBytes = [...after.values()].reduce((n, o) => n + o.size, 0)
check(
  `their sizes add up to the manifest's ${totalBytes.toLocaleString()} bytes`,
  listedBytes === totalBytes,
  `the bucket holds ${listedBytes.toLocaleString()}`
)
const missing = done.filter((d) => !after.has(d.key))
check("every key in the map is in the bucket", missing.length === 0, `missing ${missing.slice(0, 5).map((m) => m.key).join(", ")}`)

// Three objects downloaded back and compared byte for byte with the local copy —
// the smallest, the middle one and the largest, so the check covers a thumbnail
// and an 11 MB video rather than three of the same thing.
const local = done.filter((d) => existsSync(resolve(FILES_DIR, d.key))).sort((a, b) => a.bytes - b.bytes)
const spotChecks = [...new Set([local[0], local[Math.floor(local.length / 2)], local[local.length - 1]])].filter(Boolean)
for (const pick of spotChecks) {
  const { status, body, headers } = await cf(`/buckets/${bucket}/objects/${pick.key}`)
  const onDisk = readFileSync(resolve(FILES_DIR, pick.key))
  const digest = (b) => createHash("sha256").update(b).digest("hex")
  const same = status === 200 && Buffer.isBuffer(body) && digest(body) === digest(onDisk)
  const servedType = (headers.get("content-type") ?? "").split(";")[0].trim()
  check(
    `${pick.key} (${pick.bytes.toLocaleString()} bytes) comes back byte-identical`,
    same,
    `HTTP ${status}, ${Buffer.isBuffer(body) ? `${body.length} bytes, sha256 ${digest(body).slice(0, 12)} vs ${digest(onDisk).slice(0, 12)}` : "no body"}`
  )
  check(
    `${pick.key} is served as ${pick.contentType}`,
    servedType === pick.contentType,
    `it came back as ${servedType || "(none)"}`
  )
}

// The refusal. A key the API has just handed us, asked for at every public
// address this bucket could conceivably have. Anything other than a refusal here
// means these files are on the internet.
/** Ask an address for the object. Either it ANSWERED (a status to judge) or it did
 * not exist (nothing was proved). The difference is the whole value of the check —
 * production's custom domains do not resolve until production is stood up, and a
 * DNS failure quietly counted as a refusal would be this script congratulating
 * itself for asking nobody. */
async function askFor(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    await res.arrayBuffer()
    return { answered: true, status: res.status }
  } catch (err) {
    const why = err.name === "TimeoutError" ? "timed out" : err.cause?.code || err.code || err.message
    // A timeout IS the address failing to refuse — judged, not excused. Anything
    // else (no DNS, connection refused) means there is no address to judge.
    return err.name === "TimeoutError" ? { answered: true, status: why } : { answered: false, why }
  }
}

const probe = done[0]?.key
if (probe) {
  const addresses = [
    ...Object.entries(FRONT_DOORS[env]).map(([door, origin]) => [`the ${door} front door`, `${origin}/media/${probe}`]),
    [`the bucket's r2.dev address (${r2DevDomain})`, `https://${r2DevDomain}/${probe}`],
  ]
  for (const [what, url] of addresses) {
    const { answered, status, why } = await askFor(url)
    // The observed answer goes in the LABEL, not just in the failure detail: a
    // green line that says 404 is evidence, and a green line that says "refuses"
    // is a claim. This is the check the whole placement decision rests on.
    if (answered) check(`${what} answers ${status} for the archive key`, status !== 200, "it served the object")
    else unproven(`${what} was asked for the archive key`, `${url} — ${why}`)
  }
}

if (failures.length) {
  // Loud, itemised, non-zero. "194 files archived" with six of them missing reads
  // as done, and the Google URLs behind these have a year left, not forever.
  console.error(`\n${failures.length} file(s) FAILED and are NOT in ${bucket}:`)
  for (const f of failures) {
    const where = [...new Set(f.refs.map((r) => `${r.source}#${r.column}`))]
    console.error(`  ${f.key}\n    ${f.error}\n    referenced by ${where.join(", ")}`)
  }
}

const bad = failed + failures.length
console.log(bad ? `\nFAILED (${bad} problem(s))` : `\nOK — ${entries.length} files in ${bucket}, and no public door can serve them.`)
process.exit(bad ? 1 : 0)
