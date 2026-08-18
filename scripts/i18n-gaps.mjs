#!/usr/bin/env node
// WHICH SENTENCES STILL SHIP IN ENGLISH, and to whom.
//
//   node scripts/i18n-gaps.mjs            a per-language tally, then the list
//   node scripts/i18n-gaps.mjs --list     just the untranslated English, one per line
//
// WHY THIS EXISTS. `i18n-extract.mjs` says what the app SAYS; nothing said what
// the app can say IN ANOTHER LANGUAGE. R28 is about the extracted list matching
// the code, and it is satisfied by a catalogue with nothing in it — a string
// with no entry falls back to English on screen, which is a sentence rather
// than a bug, so nothing goes red and nobody finds out. That is the honest
// design (the key IS the English), but it means the gap was unmeasurable, and
// an unmeasurable gap is one nobody closes.
//
// It reads the two files the app itself reads — the GENERATED catalogue and the
// hand-written seed, merged the way `shared/i18n.ts` merges them at runtime
// (SPOKEN = overlay(CATALOGUE, SEED), seed wins per language) — so this reports
// what a reader actually gets, not what a build step intended.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const strings = JSON.parse(readFileSync(join(ROOT, "shared", "i18n-strings.json"), "utf8"))

/** The catalogue and the seed are TypeScript, not JSON, so they are read as text
 * rather than imported — this script must run under plain node with no build
 * step. Only the keys and which language codes each carries are needed, which
 * is exactly what a line-oriented read can answer safely. */
const entryKeys = (file) => {
  const src = readFileSync(join(ROOT, "shared", file), "utf8")
  const found = new Map()
  for (const m of src.matchAll(/^\s{2}("(?:[^"\\]|\\.)*"):\s*\{(.*)$/gm)) {
    const key = JSON.parse(m[1])
    const langs = new Set([...m[2].matchAll(/([a-z]{2}):\s*"/g)].map((x) => x[1]))
    found.set(key, new Set([...(found.get(key) ?? []), ...langs]))
  }
  return found
}

const catalogue = entryKeys("i18n-catalogue.ts")
const seed = entryKeys("i18n-seed.ts")
const spoken = new Map(catalogue)
for (const [k, langs] of seed) spoken.set(k, new Set([...(spoken.get(k) ?? []), ...langs]))

/** The language list comes from `shared/i18n.ts`, which is the ONE array
 * everything else is derived from — a second list here would be a second truth,
 * and the first version of this script had one: a bare two-letter match found
 * "in", "ni", "to" and nine others inside the translated sentences themselves
 * and reported them as languages the app speaks. English is not in LANGUAGES
 * (it is the key), so it is not a gap and does not appear below. */
const LANGS = [...readFileSync(join(ROOT, "shared", "i18n.ts"), "utf8")
  .matchAll(/\{\s*code:\s*"([a-z]{2})"/g)]
  .map((m) => m[1])
  .filter((c) => c !== "en")
/* Deleting from a Set while iterating it is defined behaviour — an entry
 * removed before it is reached is simply not visited — so no copy is needed. */
for (const langs of spoken.values()) for (const l of langs) if (!LANGS.includes(l)) langs.delete(l)
const missingAll = strings.filter((s) => !spoken.has(s))

if (process.argv.includes("--list")) {
  for (const s of missingAll) console.log(s)
  process.exit(0)
}

console.log(`${strings.length} sentences the app says`)
console.log(`${strings.length - missingAll.length} carry at least one translation`)
console.log(`${missingAll.length} carry NONE — every reader sees English\n`)

const rows = LANGS.map((l) => {
  const have = strings.filter((s) => spoken.get(s)?.has(l)).length
  return [l, have, strings.length - have]
}).sort((a, b) => a[2] - b[2])
console.log("  lang   translated   falls back to English")
for (const [l, have, gap] of rows) {
  console.log(`  ${l.padEnd(5)} ${String(have).padStart(9)} ${String(gap).padStart(12)}`)
}

if (missingAll.length) {
  console.log(`\nThe ${missingAll.length} with no entry at all:`)
  for (const s of missingAll) console.log(`  ${JSON.stringify(s)}`)
}
