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

  const body = raw.slice(start, end + 1)
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    // ONE BAD VALUE MUST NOT COST THE SEVEN BESIDE IT. Asking for German back,
    // the model translated `Choose “Add to Home Screen”` as `Wählen Sie „Zum
    // Startbildschirm hinzufügen"` — it opened with the German low quote and
    // closed with an ordinary one it forgot to escape, which is not JSON. The
    // whole object then failed to parse and SEVEN correct translations beside it
    // were thrown away with it, on every run, for ever, because the next run
    // asks the same question and gets the same answer.
    //
    // So a failed parse falls back to reading the object PAIR BY PAIR. It is the
    // same posture, applied at a finer grain: a pair that cannot be read is
    // still dropped, and it is now the only thing dropped.
    parsed = salvagePairs(body)
    if (Object.keys(parsed).length === 0) {
      console.warn(`  ${language.code}: unparseable answer for a batch of ${batch.length}`)
      return {}
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

  // THE KEY, MATCHED THROUGH THE ONE THING A MODEL CHANGES WITHOUT BEING ASKED.
  // A string carrying typographic quotes — `Choose “Add to Home Screen”` — comes
  // back with ORDINARY ones, every time, in every language. That is the model
  // tidying the typography, which is a different act from inventing a key, and
  // treating it as one cost four strings × twenty-eight languages: they were
  // dropped silently as "not asked about", reported as missing, and re-sent on
  // every subsequent run to be dropped again.
  //
  // So the lookup folds the quote FAMILIES and nothing else. The value is still
  // held to every rule in `acceptable`, and a key that is genuinely not one of
  // ours still matches nothing.
  const asked = new Map(batch.map((s) => [fold(s), s]))
  const out = {}
  for (const [english, translated] of Object.entries(parsed)) {
    const key = asked.get(fold(english)) // not one of ours → undefined → dropped
    if (key === undefined) continue
    if (acceptable(key, translated)) out[key] = translated.trim()
  }
  return out
}

/** Every `"key": "value"` a broken object still holds, read one pair at a time.
 *
 * Deliberately NOT a JSON repairer: it does not balance braces, close strings or
 * guess at what was meant. It walks the text for pairs whose two halves are each
 * a complete, correctly escaped JSON string, and hands back only those. A pair
 * whose value ran off the end of its quotes matches nothing and is simply not
 * there — which is what "still missing" has always meant here. */
function salvagePairs(body) {
  const out = {}
  const PAIR = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  for (const m of body.matchAll(PAIR)) {
    try {
      out[JSON.parse(`"${m[1]}"`)] = JSON.parse(`"${m[2]}"`)
    } catch {
      // A half we cannot read is a half we do not use.
    }
  }
  return out
}

/** Curly quotes → straight ones, for COMPARING two spellings of one string. Never
 * for storing: the catalogue's key stays exactly the sentence the app says. */
function fold(text) {
  return text
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‘’‚‛′]/g, "'")
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
    "// TO CORRECT A TRANSLATION, edit shared/i18n-seed.ts — never this file. The",
    "// seed is hand-written, and it is resolved OVER this file at RUN time",
    "// (shared/i18n.ts, `SPOKEN`), so a word written there is on screen without the",
    "// generator running at all. It is where the agency's own German lives —",
    "// `Problem` for Issue, `Anfrage` for Request, lifted from their legacy data",
    "// rather than invented by a translator.",
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

/** SAVE WHAT HAS BEEN BOUGHT, WHILE IT IS BEING BOUGHT.
 *
 * A full run is twenty-six thousand strings and the better part of an hour, and
 * the file is the only record of it — everything held in `catalogue` is gone the
 * instant the process is. Writing only between languages meant a laptop that
 * slept, a network that dropped or a Ctrl-C lost up to a language's worth of
 * work that had already been PAID for, and the re-run pays for it a second time.
 *
 * So the checkpoint rides every BATCH, throttled to at most one write every ten
 * seconds: the file is a megabyte and six hundred batches of un-throttled
 * rewriting is half a gigabyte of pointless IO, while ten seconds is at most one
 * batch of loss. Time-based rather than count-based because the batches finish
 * in a pool, not in order. */
const CHECKPOINT_MS = 10_000
let lastWrite = 0
function checkpoint(force = false) {
  const now = Date.now()
  if (!force && now - lastWrite < CHECKPOINT_MS) return
  lastWrite = now
  writeFileSync(OUT, render(catalogue, languages, Object.keys(seed).length))
}

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
      checkpoint()
    }),
    CONCURRENCY
  )

  console.log(` ${written[language.code]}/${missing.length}`)
  // And unconditionally after EVERY language, not once at the end: a run that
  // dies on language nineteen keeps eighteen languages' work, and a re-run picks
  // up exactly where it stopped.
  checkpoint(true)
}

const done = Object.values(written).reduce((a, b) => a + b, 0)
console.log(`\n${done}/${total} translated → ${relative(ROOT, OUT)}`)
for (const l of targets) console.log(`  ${l.code} ${l.english}: +${written[l.code]}`)
if (done < total) console.log(`${total - done} left — re-run to try them again; nothing already done is re-sent.`)
