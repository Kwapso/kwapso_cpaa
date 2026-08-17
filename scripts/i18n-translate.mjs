#!/usr/bin/env node
// THE TRANSLATOR — fills the catalogue at BUILD time, never at run time.
//
//   source ~/.config/kwapso/keys.env
//   node scripts/i18n-translate.mjs                 # every gap, every language
//   node scripts/i18n-translate.mjs --langs=de,es   # just these
//   node scripts/i18n-translate.mjs --dry-run       # what is missing, spend nothing
//
// WHY BUILD TIME. A translation is the same every time it is asked for, so
// asking a model for it while somebody waits would be paying twice — in money
// and in latency — for an answer we already had. The output is a plain data file
// that ships with the app, so a screen in Catalan costs exactly what a screen in
// English costs: one render, no request.
//
// THE COST RULE: A STRING IS SENT ONCE. Everything already translated — by an
// earlier run, or by hand in the seed — is subtracted before anything is sent.
// A re-run after adding one button pays for one button. A re-run after adding
// nothing costs nothing and makes no request at all.
//
// FOUR INPUTS, ONE OUTPUT.
//   shared/i18n-strings.json  the English, extracted from the source
//   shared/i18n.ts            LANGUAGES — read from the file, not copied here,
//                             so adding a language stays a one-line change
//   shared/i18n-seed.ts       the agency's own words, which always win
//   shared/i18n-catalogue.ts  the previous run's work (read, then rewritten)
//
// THE MODEL'S ANSWER IS UNTRUSTED INPUT (R20's posture, off the request path).
// It arrives as JSON from a machine that is allowed to be wrong: it is parsed
// defensively, keys we never asked about are dropped, and a translation that
// lost a `{placeholder}` or the product's name is refused — English on screen is
// a sentence, "Invited ." is a bug. A refused string is simply still missing, so
// the next run tries it again.
//
// THE KEY IS NEVER PRINTED. It is read from ANTHROPIC_API_KEY, checked for
// presence, and passed to fetch. Nothing here logs it, and nothing here writes
// it to a file.

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const STRINGS = join(ROOT, "shared", "i18n-strings.json")
const ENGINE = join(ROOT, "shared", "i18n.ts")
const SEED_FILE = join(ROOT, "shared", "i18n-seed.ts")
const OUT = join(ROOT, "shared", "i18n-catalogue.ts")

const MODEL = "claude-haiku-4-5-20251001"
const ENDPOINT = "https://api.anthropic.com/v1/messages"
/** A LOW thinking budget — the minimum the API accepts. This is short-copy
 * translation, not reasoning; the budget buys a moment to check a placeholder
 * survived, and anything more is spend with nothing to show for it. */
const THINKING_TOKENS = 1024
/** Every external call gets a ceiling (R11). A batch that hangs must not hang
 * the build. */
const TIMEOUT_MS = 120_000

// ── the arguments ─────────────────────────────────────────────────────────────
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BATCH = Number(arg("batch", 40))
const CONCURRENCY = Number(arg("concurrency", 8))
/** A ceiling on how many strings ONE run attempts per language. Nothing is lost
 * by stopping early — the rest are still missing and the next run takes them —
 * so this is how somebody spends five pounds today and the rest next week, and
 * how the first run of a new language is a smoke test rather than a bill. */
const MAX_PER_LANGUAGE = Number(arg("max", Infinity))
const DRY_RUN = process.argv.includes("--dry-run")

// ── reading TypeScript as data ────────────────────────────────────────────────
// These files are the app's own source, so they are read with the app's own
// parser rather than a regex. Only string literals are understood, which is all
// any of them contain — anything computed is skipped rather than guessed at.

function parse(path) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true)
}

/** The initializer of `export const <name> = …`, or null. */
function exportedValue(path, name) {
  const tree = parse(path)
  let found = null
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node.initializer ?? null
    }
    if (!found) ts.forEachChild(node, visit)
  }
  visit(tree)
  // `[…] as const` / `{…} satisfies X` wrap the literal we actually want.
  while (found && (ts.isAsExpression(found) || ts.isSatisfiesExpression(found))) {
    found = found.expression
  }
  return found
}

const literal = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null

const propertyName = (prop) =>
  ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null

/** LANGUAGES from shared/i18n.ts, as `{ code, english }` in declaration order. */
function readLanguages() {
  const node = exportedValue(ENGINE, "LANGUAGES")
  if (!node || !ts.isArrayLiteralExpression(node)) throw new Error("LANGUAGES is not an array literal")
  return node.elements.flatMap((el) => {
    if (!ts.isObjectLiteralExpression(el)) return []
    const row = {}
    for (const prop of el.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = propertyName(prop)
      const value = literal(prop.initializer)
      if (key && value !== null) row[key] = value
    }
    return row.code && row.english ? [row] : []
  })
}

/** A `Catalogue`-shaped object literal → `{ english: { lang: text } }`. */
function readCatalogue(path, name) {
  let node
  try {
    node = exportedValue(path, name)
  } catch {
    return {}
  }
  if (!node || !ts.isObjectLiteralExpression(node)) return {}
  const out = {}
  for (const entry of node.properties) {
    if (!ts.isPropertyAssignment(entry)) continue
    const english = propertyName(entry)
    if (!english || !ts.isObjectLiteralExpression(entry.initializer)) continue
    const row = {}
    for (const prop of entry.initializer.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const lang = propertyName(prop)
      const text = literal(prop.initializer)
      if (lang && text) row[lang] = text
    }
    out[english] = row
  }
  return out
}

// ── what the model is told ────────────────────────────────────────────────────
function systemPrompt(languageName) {
  return [
    `You translate the interface of kwapso, a business app an agency and its clients use every day.`,
    `Translate each English string into ${languageName}.`,
    ``,
    `How to write it:`,
    `- This is UI copy — a button, a label, a heading, a short message. Keep it short and plain, close to the length of the English.`,
    `- Sentence case, not Title Case. Keep the English string's own punctuation: if it ends in a full stop, so does yours; if it does not, yours does not either.`,
    `- Write for a manager in their fifties who is not technical. No jargon, no exclamation marks, no emoji.`,
    `- Use the same word for the same thing every time.`,
    ``,
    `What must survive untouched:`,
    `- NEVER translate the product name kwapso. Write it exactly as kwapso, lower case, wherever it appears.`,
    `- Preserve every {placeholder} exactly — the braces and the word inside them. Never translate a placeholder's name.`,
    ``,
    `Answer with ONE JSON object and nothing else: no prose, no explanation, no markdown fence. Every key is an English string copied exactly as given to you; its value is the translation. Include every string you were given, and no others.`,
  ].join("\n")
}

/** A translation is refused rather than kept when it would put a broken
 * sentence on screen. English is the fallback and English is a sentence. */
function acceptable(english, translated) {
  if (typeof translated !== "string") return false
  const text = translated.trim()
  if (text === "") return false
  if (text.length > Math.max(120, english.length * 4)) return false // an explanation, not a translation
  for (const [placeholder] of english.matchAll(/\{(\w+)\}/g)) {
    if (!text.includes(placeholder)) return false
  }
  if (english.includes("kwapso") && !text.includes("kwapso")) return false
  return true
}

// ── the call ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function translateBatch(apiKey, language, batch) {
  const body = {
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "enabled", budget_tokens: THINKING_TOKENS },
    system: systemPrompt(language.english),
    messages: [{ role: "user", content: JSON.stringify(batch, null, 0) }],
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    let res
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  ${language.code}: batch failed (${err.name}) — left for the next run`)
        return {}
      }
      await sleep(attempt * 2000)
      continue
    }

    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after") ?? attempt * 5) * 1000
      if (attempt === 3) {
        console.warn(`  ${language.code}: ${res.status} after 3 attempts — left for the next run`)
        return {}
      }
      await sleep(wait)
      continue
    }
    if (!res.ok) {
      // A 4xx is our mistake, not the network's — say what, never the key.
      const detail = await res.text().catch(() => "")
      console.warn(`  ${language.code}: HTTP ${res.status} ${detail.slice(0, 200)}`)
      return {}
    }

    const payload = await res.json().catch(() => null)
    const text = (payload?.content ?? [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join("")
      .trim()
    return readAnswer(text, batch, language)
  }
  return {}
}

/** The model's JSON, treated as untrusted. Anything unrecognised is dropped
 * rather than repaired — a string that comes back wrong is simply still
 * missing, and the next run asks again. */
function readAnswer(text, batch, language) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) return {}

  let parsed
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    console.warn(`  ${language.code}: unparseable answer for a batch of ${batch.length}`)
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

  const asked = new Set(batch)
  const out = {}
  for (const [english, translated] of Object.entries(parsed)) {
    if (!asked.has(english)) continue // invented a key — drop it
    if (acceptable(english, translated)) out[english] = translated.trim()
  }
  return out
}

/** Run `jobs` with a fixed number in flight. Fixed rather than unbounded so a
 * catalogue-sized run cannot open six hundred sockets at once. */
async function pooled(jobs, size) {
  let next = 0
  const workers = Array.from({ length: Math.min(size, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]()
  })
  await Promise.all(workers)
}

// ── writing the catalogue ─────────────────────────────────────────────────────
function render(catalogue, languages, seedCount) {
  const translated = languages.filter((l) => l.code !== "en")
  const keys = Object.keys(catalogue).sort()
  const lines = [
    "// THE CATALOGUE — every English string this app says, and what it says instead.",
    "//",
    "// ┌─────────────────────────────────────────────────────────────────────────┐",
    "// │  GENERATED FILE — DO NOT HAND-EDIT. Anything you write here is lost the │",
    "// │  next time somebody runs the generator.                                 │",
    "// └─────────────────────────────────────────────────────────────────────────┘",
    "//",
    "//   node scripts/i18n-extract.mjs     reads every English string out of the",
    "//                                     two front doors → shared/i18n-strings.json",
    "//   node scripts/i18n-translate.mjs   fills in whatever is missing → this file",
    "//",
    "// TO CORRECT A TRANSLATION, edit shared/i18n-seed.ts and re-run the generator.",
    "// The seed is hand-written, it always wins over the machine, and it is where",
    "// the agency's own German lives — `Problem` for Issue, `Anfrage` for Request,",
    "// lifted from their legacy data rather than invented by a translator.",
    "//",
    "// The key IS the English (see i18n.ts for why). A string with no entry for a",
    "// language falls back to English on screen, which is a sentence rather than a",
    "// bug — so an incomplete catalogue is a partly-translated app, never a broken",
    "// one.",
    "//",
    `// ${keys.length} strings · ${translated.length} languages · ${seedCount} of the entries below are hand-written seed.`,
    "",
    'import type { Catalogue } from "./i18n"',
    "",
    "export const CATALOGUE: Catalogue = {",
  ]

  for (const key of keys) {
    const row = catalogue[key]
    const pairs = translated
      .filter((l) => typeof row[l.code] === "string" && row[l.code] !== "")
      .map((l) => `${l.code}: ${JSON.stringify(row[l.code])}`)
    // EVERY key is written, including the ones nothing is translated into yet.
    // `coverage()` divides by the catalogue's own size to tell somebody how much
    // of the app they will be able to read, so a catalogue that quietly left out
    // the untranslated strings would report 100% while most of the screen was
    // still English. An empty entry is the honest denominator.
    lines.push(`  ${JSON.stringify(key)}: {${pairs.length ? ` ${pairs.join(", ")} ` : ""}},`)
  }

  lines.push("}", "")
  return lines.join("\n")
}

// ── the run ───────────────────────────────────────────────────────────────────
const languages = readLanguages()
const seed = readCatalogue(SEED_FILE, "SEED")
const previous = readCatalogue(OUT, "CATALOGUE")
const extracted = JSON.parse(readFileSync(STRINGS, "utf8"))

// The working set is what the app SAYS plus what the seed already answers for.
// The seed carries a handful of strings that live in shared/web/ rather than in
// either front door's own folders (the switcher's own copy), and dropping a
// translation somebody wrote by hand because an extractor did not walk past it
// would be a silent loss.
const strings = [...new Set([...extracted, ...Object.keys(seed)])].sort()

// Seed over machine, per LANGUAGE rather than per string, so a seed that answers
// only in German keeps the machine's Spanish for the same string.
const catalogue = {}
for (const english of strings) {
  catalogue[english] = { ...previous[english], ...seed[english] }
}

const only = arg("langs", null)
const wanted = only ? new Set(only.split(",").map((s) => s.trim())) : null
const targets = languages.filter((l) => l.code !== "en" && (!wanted || wanted.has(l.code)))

const gaps = targets.map((language) => ({
  language,
  missing: strings
    .filter((s) => typeof catalogue[s][language.code] !== "string")
    .slice(0, MAX_PER_LANGUAGE),
}))
const total = gaps.reduce((n, g) => n + g.missing.length, 0)

console.log(
  `${strings.length} strings · ${targets.length} languages · ${total} translations missing` +
    (DRY_RUN ? " (dry run — nothing sent)" : "")
)
for (const { language, missing } of gaps) {
  if (missing.length > 0) console.log(`  ${language.code} ${language.english}: ${missing.length} missing`)
}

if (DRY_RUN) process.exit(0)

if (total === 0) {
  writeFileSync(OUT, render(catalogue, languages, Object.keys(seed).length))
  console.log(`Nothing to translate. Rewrote ${relative(ROOT, OUT)}.`)
  process.exit(0)
}

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set. Run: source ~/.config/kwapso/keys.env")
  process.exit(1)
}

const written = Object.fromEntries(targets.map((l) => [l.code, 0]))

for (const { language, missing } of gaps) {
  if (missing.length === 0) continue
  const batches = []
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH))
  process.stdout.write(`${language.code} (${language.english}): ${batches.length} batches `)

  await pooled(
    batches.map((batch) => async () => {
      const answers = await translateBatch(apiKey, language, batch)
      for (const [english, text] of Object.entries(answers)) {
        catalogue[english][language.code] = text
        written[language.code]++
      }
      process.stdout.write(".")
    }),
    CONCURRENCY
  )

  console.log(` ${written[language.code]}/${missing.length}`)
  // Written after EVERY language, not once at the end: a run that dies on
  // language nineteen keeps eighteen languages' work, and a re-run picks up
  // exactly where it stopped.
  writeFileSync(OUT, render(catalogue, languages, Object.keys(seed).length))
}

const done = Object.values(written).reduce((a, b) => a + b, 0)
console.log(`\n${done}/${total} translated → ${relative(ROOT, OUT)}`)
for (const l of targets) console.log(`  ${l.code} ${l.english}: +${written[l.code]}`)
if (done < total) console.log(`${total - done} left — re-run to try them again; nothing already done is re-sent.`)
