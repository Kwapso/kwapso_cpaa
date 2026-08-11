#!/usr/bin/env node
// Rescue every file Glide is hosting for us, before the Glide account is cancelled.
//
//   node scripts/glide-files.mjs
//
// Reads the already-pulled rows in glide/data/, finds every hosted-file URL in
// them, downloads each one into glide/files/, and writes glide/files/manifest.json
// mapping the original URL to the local copy and back to the row it came from.
//
// Why this exists: RECONCILIATION.md §4.5. Logos, contact photos, deliverable
// thumbnails and PDF attachments all live on Glide's storage bucket. Those URLs
// stop resolving when the Glide subscription ends, and no amount of row data
// brings them back. This is the one part of the migration with a deadline.
//
// Safe to re-run. A file already on disk at the size the manifest recorded is
// left alone, so a second run only fetches what a first run missed.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DATA_DIR = resolve(ROOT, "glide/data")
const OUT_DIR = resolve(ROOT, "glide/files")
const MANIFEST = resolve(OUT_DIR, "manifest.json")

const FETCH_TIMEOUT_MS = 30_000 // R11 — an external fetch always has a deadline
const CONCURRENCY = 6 // modest: this is someone else's bucket, not a load test
const ATTEMPTS = 3

// ── Which URLs are files ─────────────────────────────────────────────────────
// Derived from the corpus, not guessed. Tallying the host of every URL in
// glide/data/ gives ~180 hosts; exactly one of them is a file store that Glide
// itself owns and that dies with the account:
//
//   storage.googleapis.com/glide-prod.appspot.com/uploads-v2/<appUploadId>/pub/<fileId>[.ext]
//
// and a variant with the original filename appended as a further segment.
// Everything else in the corpus is either a link to a third-party page
// (drive.google.com, loom.com, a client website), a Glide deep link back into a
// row we already exported (portal.kwapso.app/dl/…), or a video on kwapso's OWN
// domain (content.kwapso.com) — none of which is a file Glide is holding for us.
const GLIDE_UPLOAD_HOST = "storage.googleapis.com"
const GLIDE_UPLOAD_PREFIX = "/glide-prod.appspot.com/uploads-v2/"

const isHostedFile = (url) => {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.host === GLIDE_UPLOAD_HOST && parsed.pathname.startsWith(GLIDE_UPLOAD_PREFIX)
}

// A cell can be a bare URL, a markdown image, or a paragraph with a link in it,
// so pull every URL out of every string and test each one. The trailing class
// excludes the characters that end a URL inside markdown or prose.
const URLS_IN = /https?:\/\/[^\s"'<>,;)\]]+/g

// ── Read the rows, collect the references ────────────────────────────────────

if (!existsSync(DATA_DIR)) {
  console.error(`No ${DATA_DIR}. Run scripts/glide-pull.mjs first.`)
  process.exit(1)
}

const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json") && f !== "_summary.json").sort()

/** url → { url, refs: [{ source, rowId, column }] } */
const found = new Map()

for (const file of files) {
  const body = JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf8"))
  const rows = Array.isArray(body) ? body : Array.isArray(body.rows) ? body.rows : []
  const source = file.replace(/\.json$/, "")

  for (const row of rows) {
    const rowId = row?.$rowID ?? null
    for (const [column, value] of Object.entries(row ?? {})) {
      if (typeof value !== "string") continue
      for (const url of value.match(URLS_IN) ?? []) {
        if (!isHostedFile(url)) continue
        const entry = found.get(url) ?? { url, refs: [] }
        entry.refs.push({ source, rowId, column })
        found.set(url, entry)
      }
    }
  }
}

console.log(`${found.size} hosted files referenced across ${files.length} tables.`)
if (found.size === 0) process.exit(0)

// ── Where each one lands ─────────────────────────────────────────────────────
// glide/files/<appUploadId>/<fileId>.<ext> — the bucket's own two identifiers,
// which are already unique and already stable, so the local tree can be matched
// back to a URL by eye. A URL with no extension gets one from the content type.
const localNameFor = (url) => {
  const parts = new URL(url).pathname.slice(GLIDE_UPLOAD_PREFIX.length).split("/").filter(Boolean)
  const appUploadId = parts[0] ?? "unknown"
  const tail = decodeURIComponent(parts[parts.length - 1] ?? "file")
  const safe = tail.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 120)
  return `${appUploadId}/${safe}`
}

const EXT_FOR = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
}

// ── The previous run's record ────────────────────────────────────────────────
const previous = new Map()
if (existsSync(MANIFEST)) {
  try {
    for (const entry of JSON.parse(readFileSync(MANIFEST, "utf8")).files ?? []) {
      previous.set(entry.url, entry)
    }
  } catch (err) {
    console.error(`Ignoring unreadable manifest (${err.message}); re-fetching everything.`)
  }
}

const alreadyHave = (url) => {
  const before = previous.get(url)
  if (!before?.path) return null
  const onDisk = resolve(OUT_DIR, before.path)
  if (!existsSync(onDisk)) return null
  // Size has to agree with what we recorded, or the file is a truncated write
  // from a run that died mid-stream and must be fetched again.
  if (statSync(onDisk).size !== before.bytes) return null
  return before
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function download(entry) {
  const skipped = alreadyHave(entry.url)
  if (skipped) return { ...skipped, refs: entry.refs, skipped: true }

  let lastError = null
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(entry.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) {
        lastError = `${res.status} ${res.statusText}`
        // A 404 or a 403 is an answer, not a hiccup — retrying cannot change it.
        if (res.status < 500) break
        continue
      }
      const contentType = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim()
      const bytes = Buffer.from(await res.arrayBuffer())

      let path = localNameFor(entry.url)
      if (!/\.[A-Za-z0-9]{1,5}$/.test(path)) path += EXT_FOR[contentType] ?? ""

      const target = resolve(OUT_DIR, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, bytes)

      return { url: entry.url, path, contentType, bytes: bytes.length, refs: entry.refs, skipped: false }
    } catch (err) {
      lastError = err.name === "TimeoutError" ? `timed out after ${FETCH_TIMEOUT_MS}ms` : err.message
    }
  }
  return { url: entry.url, error: lastError ?? "unknown", refs: entry.refs }
}

mkdirSync(OUT_DIR, { recursive: true })

const queue = [...found.values()]
const done = []
let next = 0

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= queue.length) return
      const result = await download(queue[i])
      done.push(result)
      process.stdout.write(result.error ? "!" : result.skipped ? "·" : "+")
    }
  })
)
process.stdout.write("\n")

// ── The manifest, and an honest count ────────────────────────────────────────

const ok = done.filter((d) => !d.error).sort((a, b) => a.url.localeCompare(b.url))
const failed = done.filter((d) => d.error).sort((a, b) => a.url.localeCompare(b.url))
const totalBytes = ok.reduce((sum, d) => sum + d.bytes, 0)
const fetched = ok.filter((d) => !d.skipped).length

writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: `${GLIDE_UPLOAD_HOST}${GLIDE_UPLOAD_PREFIX}`,
      files: ok.map(({ skipped, ...keep }) => keep),
      failures: failed.map(({ url, error, refs }) => ({ url, error, refs })),
    },
    null,
    2
  )
)

const mb = (n) => (n / 1024 / 1024).toFixed(1)
console.log(
  `\n${ok.length} of ${found.size} files in glide/files/ — ${totalBytes.toLocaleString()} bytes (${mb(totalBytes)} MB). ` +
    `${fetched} fetched now, ${ok.length - fetched} already had.`
)
console.log("Manifest: glide/files/manifest.json")

if (failed.length) {
  // Loud, itemised, and non-zero. "194 files rescued" with nine of them missing
  // reads as done, and this is the run nobody gets to do again.
  console.error(`\n${failed.length} file(s) FAILED and are not on disk:`)
  for (const f of failed) {
    const where = [...new Set(f.refs.map((r) => `${r.source}#${r.column}`))]
    console.error(`  ${f.error.padEnd(28)} ${f.url}\n${" ".repeat(30)} referenced by ${where.join(", ")}`)
  }
  process.exit(1)
}
