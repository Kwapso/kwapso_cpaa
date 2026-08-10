#!/usr/bin/env node
// Pull every row of every table in glide/catalog.json into glide/data/<app>.<table>.json.
//
// Glide's queryTables endpoint returns a page of rows plus a `continuation`
// token when there are more. We follow it to the end — the whole point of this
// script is that the export happens ONCE and never has to be repeated by hand.
//
//   GLIDE_API_KEY=... node scripts/glide-pull.mjs            # everything
//   GLIDE_API_KEY=... node scripts/glide-pull.mjs customers   # one table, both apps
//
// The key is never written to disk by this script. Keep it in
// ~/.config/kwapso/keys.env (chmod 600) and source it, or pass it inline.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ENDPOINT = "https://api.glideapp.io/api/function/queryTables"
const OUT_DIR = resolve(ROOT, "glide/data")

const token = process.env.GLIDE_API_KEY
if (!token) {
  console.error(
    "GLIDE_API_KEY is not set.\n" +
      "Get it from Glide → Settings → API, then either add it to\n" +
      "~/.config/kwapso/keys.env and `source` that file, or run:\n" +
      "  GLIDE_API_KEY=xxx node scripts/glide-pull.mjs",
  )
  process.exit(1)
}

const only = process.argv[2] || null
const catalog = JSON.parse(readFileSync(resolve(ROOT, "glide/catalog.json"), "utf8"))

// One table, followed to the last continuation token. Glide caps a page at
// roughly 500 rows; a big table just means more round trips, not lost rows.
async function pullTable(appId, tableName) {
  const rows = []
  let continuation = null
  let pages = 0

  for (;;) {
    const query = { tableName, utc: true }
    if (continuation) query.startAt = continuation

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ appID: appId, queries: [query] }),
      signal: AbortSignal.timeout(60_000), // R11: never hang on an external service
    })

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} — ${(await res.text()).slice(0, 400)}`)
    }

    const body = await res.json()
    const result = Array.isArray(body) ? body[0] : body
    const page = result?.rows ?? []
    rows.push(...page)
    pages += 1

    continuation = result?.next ?? result?.continuation ?? null
    if (!continuation || page.length === 0) break
    if (pages > 200) throw new Error(`${tableName}: refusing to page past 200 requests`)
  }

  return rows
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const summary = []
for (const app of catalog.apps) {
  for (const table of app.tables) {
    if (only && table.key !== only) continue
    process.stdout.write(`${app.key}/${table.key} … `)
    try {
      const rows = await pullTable(app.appId, table.id)
      const file = resolve(OUT_DIR, `${app.key}.${table.key}.json`)
      writeFileSync(file, JSON.stringify({ app: app.key, table: table.key, id: table.id, rows }, null, 2))
      const columns = rows.length ? Object.keys(rows[0]) : []
      console.log(`${rows.length} rows, ${columns.length} columns`)
      summary.push({ app: app.key, table: table.key, rows: rows.length, columns })
    } catch (err) {
      // To stderr, and counted. "Wrote 32 files" with three of them empty reads
      // as a complete export — and this export is the thing the owner never
      // wants to do twice.
      console.error(`FAILED — ${err.message}`)
      summary.push({ app: app.key, table: table.key, error: err.message })
    }
  }
}

writeFileSync(resolve(OUT_DIR, "_summary.json"), JSON.stringify(summary, null, 2))
const failed = summary.filter((s) => s.error)
const wrote = summary.length - failed.length
console.log(`\nWrote ${wrote} of ${summary.length} tables to glide/data/. Summary: glide/data/_summary.json`)
if (failed.length) {
  console.error(`\n${failed.length} table(s) failed: ${failed.map((f) => `${f.app}/${f.table}`).join(", ")}`)
  process.exit(1) // a partial export must not exit 0
}
