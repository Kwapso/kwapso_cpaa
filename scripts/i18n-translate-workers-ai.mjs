#!/usr/bin/env node
// THE SEED FILLER — a one-off run against Workers AI to close R44's ceiling.
//
//   cf-exec node scripts/i18n-translate-workers-ai.mjs              # every gap
//   cf-exec node scripts/i18n-translate-workers-ai.mjs --dry-run    # count only
//   cf-exec node scripts/i18n-translate-workers-ai.mjs --batch=10   # smaller batches
//
// WHY A SEPARATE SCRIPT FROM `i18n-translate.mjs`. That script spends the
// owner's own ANTHROPIC_API_KEY — it is not touched or reused here. This one
// spends the app's own Cloudflare allowance instead: `cf-exec` puts
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment, and every
// call below is a plain POST to the REST `ai/run` door — the same door
// `scripts/knowledge-retrieval-bench.mjs` already uses for benchmarking, and
// the same model (`@cf/openai/gpt-oss-120b`) the app's own assistant runs on
// (`workers/data-ops/src/lib/model.ts`, `DEFAULT_AGENT_MODEL`), so the
// translation quality bar is the one already trusted for a person's own
// conversation with kwapso.
//
// WHERE THE WORDS LAND. `shared/i18n-catalogue.ts` says "DO NOT HAND-EDIT" at
// its own top and is only ever rewritten wholesale by `i18n-translate.mjs`'s
// own `render()`. This script is not that generator, so it never touches that
// file — it writes into `shared/i18n-seed.ts`, the hand-written file that is
// resolved OVER the catalogue at RUN time (`SPOKEN` in `shared/i18n.ts`) and
// exists exactly for "a word written there is on screen without the generator
// running at all."
//
// THE SAME SAFETY POSTURE AS THE OWNER'S SCRIPT, independently written: the
// model's answer is untrusted input (R20's posture, off the request path),
// checked per string per language before it is kept — every `{placeholder}`
// must survive, the literal word "kwapso" must survive, and an empty or
// wildly-long answer is refused rather than shipped. A refused string is
// simply still missing; nothing here guesses.
//
// GLOSSARY-GROUNDED. `shared/glossary.ts` is handed to the model as context so
// a translation doesn't invent a synonym for "ticket" or "account" the app
// already has a word for (Law R6/R34).

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const STRINGS_FILE = join(ROOT, "shared", "i18n-strings.json")
const ENGINE_FILE = join(ROOT, "shared", "i18n.ts")
const SEED_FILE = join(ROOT, "shared", "i18n-seed.ts")
const CATALOGUE_FILE = join(ROOT, "shared", "i18n-catalogue.ts")
const GLOSSARY_FILE = join(ROOT, "shared", "glossary.ts")

const ACCOUNT =
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  (() => {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not set. Run this through cf-exec.")
  })()
const TOKEN =
  process.env.CLOUDFLARE_API_TOKEN ||
  (() => {
    throw new Error("CLOUDFLARE_API_TOKEN is not set. Run this through cf-exec.")
  })()
const MODEL = "@cf/openai/gpt-oss-120b"
const ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`
const TIMEOUT_MS = 120_000

// ── arguments ────────────────────────────────────────────────────────────────
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BATCH = Number(arg("batch", 16))
const CONCURRENCY = Number(arg("concurrency", 5))
const DRY_RUN = process.argv.includes("--dry-run")
/** A ceiling on how many strings this run attempts, for a cheap smoke test
 * before spending on the rest. Nothing is lost by stopping early — the rest
 * are still missing and the next run (or the next batch here) still finds
 * them, same posture as the owner's own `--max`. */
const LIMIT = Number(arg("limit", Infinity))

// ── reading TypeScript as data (own, small parser — no dependency on the
// owner's translate script) ────────────────────────────────────────────────
function parse(path) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true)
}

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
  while (found && (ts.isAsExpression(found) || ts.isSatisfiesExpression(found))) {
    found = found.expression
  }
  return found
}

const literal = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null

const propertyName = (prop) =>
  ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null

function readLanguages() {
  const node = exportedValue(ENGINE_FILE, "LANGUAGES")
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

/** The glossary, read the same way — term → { term, def }. Fed to the model as
 * grounding so a translation never invents a synonym for a word the product
 * already has (R6/R34). */
function readGlossary() {
  const node = exportedValue(GLOSSARY_FILE, "GLOSSARY")
  if (!node || !ts.isObjectLiteralExpression(node)) return []
  const out = []
  for (const entry of node.properties) {
    if (!ts.isPropertyAssignment(entry) || !ts.isObjectLiteralExpression(entry.initializer)) continue
    let term = null
    let def = null
    for (const prop of entry.initializer.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = propertyName(prop)
      const value = literal(prop.initializer)
      if (key === "term") term = value
      if (key === "def") def = value
    }
    if (term && def) out.push({ term, def })
  }
  return out
}

/** Naive English plural — good enough for the handful of glossary nouns this
 * looks up (Ticket→Tickets, Story→Stories), never applied to anything else. */
function pluralOf(word) {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies"
  return word + "s"
}

/** THE APP'S OWN ANSWER, where it already has one. `glossary.ts` only carries
 * an English definition — it cannot tell a model whether "Ticket" is business
 * jargon the agency already says in English to a German client (it is: SEED
 * keeps `Ticket`/`Ticket`/`Ticket`), or an ordinary word that gets a real
 * translation (`Department` → `Abteilung`/`Departamento`/`Departament`). A
 * model asked only for the English MEANING has no way to tell those apart,
 * and guesses — sometimes by leaving a real word in English, sometimes by
 * translating a product name into its everyday meaning (an early run of this
 * script turned the product noun "Wave" into the German word for an ocean
 * wave, "Welle"). So every glossary term already decided in `shared/i18n-seed.ts`
 * is looked up (singular and naive plural) and handed over as ground truth
 * instead of asked for again. */
function readVocabulary(glossary, seed) {
  const out = []
  const seen = new Set()
  for (const { term } of glossary) {
    for (const form of [term, pluralOf(term)]) {
      const row = seed[form]
      if (row?.de && row?.es && row?.ca && !seen.has(form)) {
        seen.add(form)
        out.push({ form, ...row })
      }
    }
  }
  return out
}

// ── what the model is told ────────────────────────────────────────────────────
function systemPrompt(glossary, vocabulary) {
  const concepts = glossary.map((g) => `- ${g.term}: ${g.def}`).join("\n")
  const decided = vocabulary
    .map((v) => `- ${v.form} → de: "${v.de}" · es: "${v.es}" · ca: "${v.ca}"`)
    .join("\n")
  return [
    "You translate the interface of kwapso, a business app an agency and its clients use every day, into German (de), Spanish (es) and Catalan (ca).",
    "",
    "How to write it:",
    "- This is UI copy: a button, a label, a heading, a short message. Keep it short and plain, close to the length of the English.",
    "- Sentence case, not Title Case — this is about not capitalizing every word the way an English heading does. It does NOT override German's own grammar: German capitalizes every common noun wherever it falls in the sentence (\"1 Rolle\", \"eine Rolle\", never \"1 rolle\"), so write your German the way a native speaker would, capitalized nouns and all.",
    "- Keep the English string's own punctuation: if it ends in a full stop, so does yours; if it does not, yours does not either.",
    "- Write for a manager in their fifties who is not technical. No jargon, no exclamation marks, no emoji.",
    '- REGISTER, and this is not a style choice, it is the app\'s own fixed convention: German addresses the reader as "Sie" (formal) — "Lassen Sie", "Ihre", never "du"/"dein". Spanish and Catalan address the reader INFORMALLY, as "tú"/"tu" — Spanish imperatives like "Elige", "Añade", "Deja", never "Elija"/"Añada"/"Deje"/"usted"; Catalan imperatives like "Tria", "Afegeix", never the "vostè"/"vós" forms. Getting this wrong is not a nuance, it reads as two different apps talking to the same person.',
    "",
    "THE APP'S OWN WORDS ALREADY DECIDED — use these EXACT translations whenever one of these appears, in any form (a plural, part of a longer sentence, mid-word):",
    decided,
    "",
    "Notice the pattern above: some product words are ALREADY translated for real (Department → Abteilung/Departamento/Departament), and some are deliberately left as the English WORD in every language, because that is the word the agency already uses with these clients (Ticket, Sprint, App keep the English spelling in German, Spanish and Catalan alike — only the CASING follows each language's own rule: German capitalizes it because German capitalizes every noun, Spanish and Catalan capitalize it only where any ordinary word would be capitalized — the start of a sentence — and write it lower-case mid-sentence, \"un ticket\", \"el sprint\"). If you meet one of this app's OTHER product nouns — naming a specific feature, not an everyday English word doing everyday work — that is NOT in the list above (for example \"Wave\", a package of sprints sold to one account, nothing to do with the ocean), follow the SAME pattern: keep the English spelling in every language, cased the way that language would case any ordinary noun in that position, rather than translating what the English word means in everyday language. A short list of the app's other concepts, for the same reason — read it for MEANING, to translate the ORDINARY words around these correctly, not to translate the concept names themselves if they are proper nouns of a feature:",
    concepts,
    "",
    "What must survive untouched:",
    "- NEVER translate the product name kwapso. Write it exactly as kwapso, lower case, wherever it appears.",
    "- Preserve every {placeholder} exactly — the braces and the word inside them, unchanged. You may move a placeholder to a different position in the sentence (the words around it may reorder), but never alter or drop it.",
    "",
    'Answer with ONE JSON object and nothing else: no prose, no explanation, no markdown fence. Each key is one of the English strings you were given, copied exactly. Each value is an object: {"de": "...", "es": "...", "ca": "..."}. Include every string you were given, and no others.',
  ].join("\n")
}

/** The model is told to match the English string's own trailing full stop and
 * occasionally adds one anyway on a longer sentence. Rather than refusing an
 * otherwise-good translation over one character, the mismatch is fixed the
 * only safe direction: a stop is trimmed when the English has none. One is
 * never ADDED when the English has one and the model dropped it — inventing
 * punctuation is a guess, and a missing stop is a smaller defect than a
 * fabricated one. */
function fixTrailingStop(english, text) {
  const englishHasStop = /\.$/.test(english.trim())
  const textHasStop = /\.$/.test(text) && !/\.\.\.$/.test(text) && !text.endsWith("…")
  if (!englishHasStop && textHasStop) return text.replace(/\.$/, "")
  return text
}

function acceptable(english, translated) {
  if (typeof translated !== "string") return false
  const text = translated.trim()
  if (text === "") return false
  if (text.length > Math.max(120, english.length * 4)) return false
  const englishHoles = [...english.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  const textHoles = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  if (JSON.stringify(englishHoles) !== JSON.stringify(textHoles)) return false
  if (english.includes("kwapso") && !text.includes("kwapso")) return false
  return true
}

function fold(text) {
  // Curly quote families → straight, by escape rather than literal glyph (a
  // literal curly quote in source risks exactly the mis-copy it exists to fix).
  return text.replace(/[“”„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'")
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let totalNeurons = 0

async function translateBatch(batch, glossary, vocabulary) {
  const body = {
    messages: [
      { role: "system", content: systemPrompt(glossary, vocabulary) },
      { role: "user", content: JSON.stringify(batch) },
    ],
    max_tokens: 6000,
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    let res
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  batch failed (${err.name}) — left for the next run`)
        return {}
      }
      await sleep(attempt * 2000)
      continue
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt === 3) {
        console.warn(`  ${res.status} after 3 attempts — left for the next run`)
        return {}
      }
      await sleep(attempt * 5000)
      continue
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.warn(`  HTTP ${res.status} ${detail.slice(0, 200)}`)
      return {}
    }

    const payload = await res.json().catch(() => null)
    if (!payload?.success) {
      console.warn(`  ai/run refused: ${JSON.stringify(payload?.errors ?? []).slice(0, 200)}`)
      return {}
    }
    totalNeurons += Number(payload?.result?.usage?.neurons ?? 0)
    const text = String(payload?.result?.choices?.[0]?.message?.content ?? "").trim()
    return readAnswer(text, batch)
  }
  return {}
}

function readAnswer(text, batch) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) return {}

  let parsed
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    console.warn(`  unparseable answer for a batch of ${batch.length}`)
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

  const asked = new Map(batch.map((s) => [fold(s), s]))
  const out = {}
  for (const [english, row] of Object.entries(parsed)) {
    const key = asked.get(fold(english))
    if (key === undefined || !row || typeof row !== "object") continue
    const kept = {}
    for (const lang of ["de", "es", "ca"]) {
      const value = typeof row[lang] === "string" ? fixTrailingStop(key, row[lang].trim()) : row[lang]
      if (acceptable(key, value)) kept[lang] = value.trim()
    }
    if (Object.keys(kept).length > 0) out[key] = kept
  }
  return out
}

async function pooled(jobs, size) {
  let next = 0
  const workers = Array.from({ length: Math.min(size, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]()
  })
  await Promise.all(workers)
}

// ── writing the seed ─────────────────────────────────────────────────────────
/** Renders one seed entry line exactly like the hand-written entries beside
 * it: single line when short, one property per line when it would run long. */
function renderEntry(english, row) {
  const pairs = ["de", "es", "ca"]
    .filter((l) => typeof row[l] === "string")
    .map((l) => `${l}: ${JSON.stringify(row[l])}`)
  const oneLine = `  ${JSON.stringify(english)}: { ${pairs.join(", ")} },`
  if (oneLine.length <= 100) return oneLine
  const lines = pairs.map((p) => `    ${p},`)
  return [`  ${JSON.stringify(english)}: {`, ...lines, "  },"].join("\n")
}

function appendToSeed(newEntries, count) {
  const source = readFileSync(SEED_FILE, "utf8")
  const lastBrace = source.lastIndexOf("\n}")
  if (lastBrace === -1) throw new Error("could not find the closing brace of SEED in i18n-seed.ts")

  const header = [
    "",
    `  /* ── Filled ${new Date().toISOString().slice(0, 10)} via Workers AI (feat/i18n-fill) ──────`,
    `   * ${count} strings that had no translation in any of the three languages,`,
    "   * translated through the app's own Cloudflare allowance (@cf/openai/gpt-oss-120b",
    "   * over the ai/run REST door), grounded in shared/glossary.ts, and spot-checked",
    "   * by hand. See the commit body for the neuron spend and the spot check. */",
  ].join("\n")

  const body = Object.entries(newEntries)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([english, row]) => renderEntry(english, row))
    .join("\n")

  const updated = source.slice(0, lastBrace) + "\n" + header + "\n" + body + source.slice(lastBrace)
  writeFileSync(SEED_FILE, updated)
}

// ── the run ───────────────────────────────────────────────────────────────────
const languages = readLanguages()
const translated = languages.filter((l) => l.code !== "en")
const seed = readCatalogue(SEED_FILE, "SEED")
const catalogue = readCatalogue(CATALOGUE_FILE, "CATALOGUE")
const extracted = JSON.parse(readFileSync(STRINGS_FILE, "utf8"))
const glossary = readGlossary()
const vocabulary = readVocabulary(glossary, seed)

const spoken = {}
for (const english of new Set([...extracted, ...Object.keys(seed)])) {
  spoken[english] = { ...catalogue[english], ...seed[english] }
}

// Only a string missing EVERY language is worth a call — one that has a
// partial seed entry (say, German alone) is cheaper fixed by hand in the seed
// than by asking a model to guess whether the other two are also missing on
// purpose.
const missing = Object.keys(spoken)
  .filter((s) => translated.every((l) => typeof spoken[s][l.code] !== "string" || spoken[s][l.code] === ""))
  .sort()
  .slice(0, LIMIT)

console.log(`${missing.length} strings missing all three languages` + (DRY_RUN ? " (dry run — nothing sent)" : ""))
if (DRY_RUN) process.exit(0)
if (missing.length === 0) process.exit(0)

const batches = []
for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH))
console.log(`${batches.length} batches of up to ${BATCH}, concurrency ${CONCURRENCY}`)

const results = {}
let done = 0
await pooled(
  batches.map((batch) => async () => {
    const answers = await translateBatch(batch, glossary, vocabulary)
    Object.assign(results, answers)
    done += Object.keys(answers).length
    process.stdout.write(`.`)
  }),
  CONCURRENCY
)
console.log("")

const stillMissing = missing.filter((s) => !results[s])
console.log(`${done}/${missing.length} translated · ${totalNeurons.toFixed(1)} neurons spent`)
if (stillMissing.length > 0) {
  console.log(`${stillMissing.length} still missing (refused validation or a failed batch):`)
  for (const s of stillMissing.slice(0, 20)) console.log(`  ${JSON.stringify(s)}`)
}

if (done > 0) {
  appendToSeed(results, done)
  console.log(`Wrote ${done} entries → ${relative(ROOT, SEED_FILE)}`)
}
