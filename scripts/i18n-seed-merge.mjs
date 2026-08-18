#!/usr/bin/env node
// FOLD HAND-WRITTEN TRANSLATIONS INTO THE SEED.
//
//   node scripts/i18n-seed-merge.mjs /tmp/i18n-batches/out-*.json
//   node scripts/i18n-seed-merge.mjs --dry-run /tmp/i18n-batches/out-*.json
//
// The seed (`shared/i18n-seed.ts`) is the one file whose translations survive a
// regeneration and win at runtime, so it is where hand-written words belong. It
// is also hand-written prose with reasoning in it, which is exactly what makes
// editing it in bulk risky: three lanes writing it at once is how a key gets
// silently dropped. So the words are produced as JSON somewhere else and folded
// in here, once, by a script that can be re-read.
//
// WHAT IT REFUSES, and why each refusal is worth a run that does nothing:
//   • a key that is not in `shared/i18n-strings.json` — the app does not say that
//     sentence, so translating it is either a typo or a string that moved while
//     the words were being written. Either way it would sit in the seed for ever
//     looking correct.
//   • a key already in the seed — the seed is the hand-verified layer and this
//     script must never overwrite a word somebody was sure of.
//   • a language outside `LANGUAGES` — a two-letter typo reads as a language.
//
// It writes nothing unless every file parses and every key survives those three.

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const files = args.filter((a) => !a.startsWith("--"))
if (files.length === 0) {
  console.error("usage: node scripts/i18n-seed-merge.mjs [--dry-run] <out-*.json>…")
  process.exit(1)
}

const said = new Set(JSON.parse(readFileSync(join(ROOT, "shared", "i18n-strings.json"), "utf8")))
const seedSrc = readFileSync(join(ROOT, "shared", "i18n-seed.ts"), "utf8")
const seeded = new Set(
  [...seedSrc.matchAll(/^  ("(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*):\s*\{/gm)].map((m) =>
    m[1].startsWith('"') ? JSON.parse(m[1]) : m[1]
  )
)
const LANGS = new Set(
  [...readFileSync(join(ROOT, "shared", "i18n.ts"), "utf8").matchAll(/\{\s*code:\s*"([a-z]{2})"/g)]
    .map((m) => m[1])
    .filter((c) => c !== "en")
)

const accepted = new Map()
const refused = []
for (const file of files) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"))
  } catch (err) {
    console.error(`${file} is not valid JSON — ${err.message}`)
    process.exit(1)
  }
  for (const [english, langs] of Object.entries(parsed)) {
    if (!said.has(english)) { refused.push(`${file}: the app does not say ${JSON.stringify(english)}`); continue }
    if (seeded.has(english)) { refused.push(`${file}: already hand-written in the seed — ${JSON.stringify(english)}`); continue }
    if (accepted.has(english)) { refused.push(`${file}: two batches both translated ${JSON.stringify(english)}`); continue }
    const clean = {}
    for (const [code, text] of Object.entries(langs)) {
      if (code === "_note") continue
      if (!LANGS.has(code)) { refused.push(`${file}: ${JSON.stringify(english)} names an unknown language "${code}"`); continue }
      if (typeof text === "string" && text.trim()) clean[code] = text
    }
    if (Object.keys(clean).length > 0) accepted.set(english, clean)
  }
}

console.log(`${accepted.size} key(s) to add, ${refused.length} refused`)
for (const r of refused.slice(0, 20)) console.log(`  ${r}`)
if (refused.length > 20) console.log(`  …and ${refused.length - 20} more`)
if (dryRun || accepted.size === 0) process.exit(0)

const esc = (s) => JSON.stringify(s)
const block = [...accepted.entries()]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([english, langs]) =>
    `  ${esc(english)}: { ${Object.entries(langs).map(([c, t]) => `${c}: ${esc(t)}`).join(", ")} },`
  )
  .join("\n")

const MARK = "\n}\n"
const at = seedSrc.lastIndexOf(MARK)
if (at < 0) { console.error("could not find the end of SEED"); process.exit(1) }
const header =
  "\n  /* ── Carried across by hand, the overnight round ─────────────────────────\n" +
  "   * Sentences the app said with no translation at all, so every reader saw\n" +
  "   * English. Written here rather than in the generated catalogue because the\n" +
  "   * seed is the layer that survives a regeneration and wins at runtime. */\n"
writeFileSync(join(ROOT, "shared", "i18n-seed.ts"), seedSrc.slice(0, at) + header + block + seedSrc.slice(at))
console.log(`seeded ${accepted.size} key(s) into shared/i18n-seed.ts`)
