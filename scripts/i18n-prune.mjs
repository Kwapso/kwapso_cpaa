// PRUNE THE CATALOGUE AND THE SEED DOWN TO THE LANGUAGES WE ACTUALLY SPEAK.
//
//   node scripts/i18n-prune.mjs          rewrite both files
//   node scripts/i18n-prune.mjs --check  report only, exit 1 if anything is stale
//
// ── why this exists ──────────────────────────────────────────────────────────
//
// `shared/i18n.ts` holds ONE array of languages and everything is derived from
// it — except the two data files, which are the accumulated output of previous
// runs. Drop a language from the array and its 1,027 translations stay on disk:
// dead weight in every bundle, a diff nobody reads on every catalogue run, and
// a quiet lie in the file header about how many languages this app speaks.
//
// So this closes the loop the other way round. `i18n-extract` makes the
// catalogue match the code's STRINGS; this makes it match the code's LANGUAGES.
// Together they mean the array in i18n.ts is the only place a language is
// decided, which is what that file has always claimed.
//
// IT NEVER CALLS A MODEL and never needs a key. It only ever REMOVES — a
// language that is in the array but missing from the catalogue is reported, not
// invented, because inventing it is `i18n-translate`'s job and costs money.
//
// The catalogue is regenerated whole (it is a generated file). The seed is
// hand-written and full of comments explaining where the agency's German came
// from, so it is edited SURGICALLY: the exact source span of each unwanted
// `xx: "…"` pair is cut and everything else survives byte for byte.

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const ENGINE = join(ROOT, "shared", "i18n.ts")
const SEED_FILE = join(ROOT, "shared", "i18n-seed.ts")
const CATALOGUE_FILE = join(ROOT, "shared", "i18n-catalogue.ts")
const CHECK = process.argv.includes("--check")

function source(path) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true)
}
function exportedValue(file, name) {
  let found = null
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      found = node.initializer ?? null
    if (!found) ts.forEachChild(node, visit)
  }
  visit(file)
  // `[…] as const` / `{…} satisfies X` wrap the literal we actually want.
  while (found && (ts.isAsExpression(found) || ts.isSatisfiesExpression(found))) found = found.expression
  return found
}
const propertyName = (p) =>
  ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null
const literal = (n) => (n && ts.isStringLiteral(n) ? n.text : null)

/** The languages the app says it speaks, English excluded — English is the key. */
function spokenLanguages() {
  const node = exportedValue(source(ENGINE), "LANGUAGES")
  if (!node || !ts.isArrayLiteralExpression(node)) throw new Error("LANGUAGES is not an array literal")
  return node.elements.flatMap((el) => {
    if (!ts.isObjectLiteralExpression(el)) return []
    const code = el.properties.map((p) => (propertyName(p) === "code" ? literal(p.initializer) : null)).find(Boolean)
    return code && code !== "en" ? [code] : []
  })
}

/** Every language code that appears anywhere in one of the two data files. */
function codesIn(file, name) {
  const node = exportedValue(file, name)
  const found = new Set()
  if (!node || !ts.isObjectLiteralExpression(node)) return found
  for (const entry of node.properties) {
    if (!ts.isPropertyAssignment(entry) || !ts.isObjectLiteralExpression(entry.initializer)) continue
    for (const prop of entry.initializer.properties) {
      const code = ts.isPropertyAssignment(prop) ? propertyName(prop) : null
      if (code) found.add(code)
    }
  }
  return found
}

/** Cut every unwanted `xx: "…"` pair out of a HAND-WRITTEN file by source span,
 * so the comments around them survive exactly as written.
 *
 * THE RANGES ARE MERGED BEFORE THEY ARE APPLIED, and that is the whole of the
 * correctness here. A pair's cut runs from its own start to the start of the
 * next pair; the LAST pair's cut reaches BACKWARDS over the comma before it, so
 * nothing is left dangling. When the last pair and the one before it are both
 * being cut, those two ranges OVERLAP — and applying them one after another
 * removes more than either described, which the first version of this script
 * did: it ate the closing brace of every row and produced 1,027 lines of
 * unparseable TypeScript. Overlapping edits are not composable; merged ones
 * are. */
function pruneBySpan(path, name, keep) {
  const file = source(path)
  const node = exportedValue(file, name)
  if (!node || !ts.isObjectLiteralExpression(node)) throw new Error(`${name} is not an object literal`)
  const text = file.getFullText()
  const cuts = []
  let removed = 0
  for (const entry of node.properties) {
    if (!ts.isPropertyAssignment(entry) || !ts.isObjectLiteralExpression(entry.initializer)) continue
    const props = entry.initializer.properties
    for (const prop of props) {
      if (!ts.isPropertyAssignment(prop)) continue
      const code = propertyName(prop)
      if (!code || keep.has(code)) continue
      removed += 1
      let start = prop.getStart(file)
      let end = prop.getEnd()
      if (text[end] === ",") end += 1
      while (/[ \t]/.test(text[end])) end += 1
      cuts.push([start, end])
    }
  }
  if (!cuts.length) return { changed: false, removed: 0 }

  cuts.sort((a, b) => a[0] - b[0])
  const merged = [cuts[0]]
  for (const [start, end] of cuts.slice(1)) {
    const last = merged[merged.length - 1]
    if (start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  // A range that now runs up to the row's closing brace has left the comma
  // before it with nothing to separate. Reach back and take it.
  for (const range of merged) {
    let after = range[1]
    while (/\s/.test(text[after])) after += 1
    if (text[after] !== "}") continue
    let start = range[0]
    while (start > 0 && /[ \t]/.test(text[start - 1])) start -= 1
    if (text[start - 1] === ",") range[0] = start - 1
  }

  let out = text
  for (const [start, end] of merged.slice().reverse()) out = out.slice(0, start) + out.slice(end)
  // Cheap proof before anything is written: it still parses, and it still holds
  // every row it held before.
  const reparsed = ts.createSourceFile(path, out, ts.ScriptTarget.Latest, true)
  const check = exportedValue(reparsed, name)
  if (!check || !ts.isObjectLiteralExpression(check) || check.properties.length !== node.properties.length)
    throw new Error(`${name}: the prune did not round-trip — nothing written`)
  if (!CHECK) writeFileSync(path, out)
  return { changed: true, removed }
}

/** The GENERATED catalogue is rewritten whole rather than edited, because its
 * header states how many languages it holds — surgery would leave that sentence
 * describing a file that no longer exists. Same shape the translator emits. */
function renderCatalogue(rows, codes, seedCount) {
  const keys = Object.keys(rows).sort()
  const head = readFileSync(CATALOGUE_FILE, "utf8").split("\n")
  const lines = []
  for (const line of head) {
    if (line.startsWith("export const CATALOGUE")) break
    if (/^\/\/ \d+ strings ·/.test(line))
      lines.push(`// ${keys.length} strings · ${codes.length} languages · ${seedCount} of the entries below are hand-written seed.`)
    else lines.push(line)
  }
  lines.push("export const CATALOGUE: Catalogue = {")
  for (const key of keys) {
    const row = rows[key]
    const pairs = codes
      .filter((c) => typeof row[c] === "string" && row[c] !== "")
      .map((c) => `${c}: ${JSON.stringify(row[c])}`)
    lines.push(`  ${JSON.stringify(key)}: {${pairs.length ? ` ${pairs.join(", ")} ` : ""}},`)
  }
  lines.push("}", "")
  return lines.join("\n")
}

/** A `Catalogue`-shaped object literal → `{ english: { lang: text } }`. */
function readCatalogue(path, name) {
  const node = exportedValue(source(path), name)
  const out = {}
  if (!node || !ts.isObjectLiteralExpression(node)) return out
  for (const entry of node.properties) {
    if (!ts.isPropertyAssignment(entry) || !ts.isObjectLiteralExpression(entry.initializer)) continue
    const english = propertyName(entry)
    if (!english) continue
    const row = {}
    for (const prop of entry.initializer.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const code = propertyName(prop)
      const value = literal(prop.initializer)
      if (code && value) row[code] = value
    }
    out[english] = row
  }
  return out
}

const codes = spokenLanguages()
const keep = new Set(codes)
console.log(`languages in shared/i18n.ts: en + ${codes.join(", ")}`)

let stale = false
for (const [path, name, label] of [
  [CATALOGUE_FILE, "CATALOGUE", "shared/i18n-catalogue.ts"],
  [SEED_FILE, "SEED", "shared/i18n-seed.ts"],
]) {
  const present = codesIn(source(path), name)
  const extra = [...present].filter((c) => !keep.has(c)).sort()
  const missing = codes.filter((c) => !present.has(c)).sort()
  if (missing.length)
    console.log(`  ${label}: nothing at all for ${missing.join(", ")} — run i18n-translate to fill them in`)
  if (!extra.length) {
    console.log(`  ${label}: already ${present.size} language${present.size === 1 ? "" : "s"}, nothing to prune`)
    continue
  }
  stale = true
  if (CHECK) {
    console.log(
      `  ${label}: STALE — carries ${extra.length} language${extra.length === 1 ? "" : "s"} ` +
        `the app no longer speaks (${extra.join(", ")})`
    )
    continue
  }
  const before = readFileSync(path).length
  let removed
  if (name === "CATALOGUE") {
    // Generated: rewritten whole, so the header's own count is rewritten too.
    const rows = readCatalogue(path, name)
    const seedCount = Object.keys(readCatalogue(SEED_FILE, "SEED")).length
    removed = Object.values(rows).reduce((n, r) => n + Object.keys(r).filter((c) => !keep.has(c)).length, 0)
    writeFileSync(path, renderCatalogue(rows, codes, seedCount))
  } else {
    // Hand-written: edited in place, so every comment in it survives.
    ;({ removed } = pruneBySpan(path, name, keep))
  }
  const after = readFileSync(path).length
  console.log(
    `  ${label}: removed ${removed.toLocaleString()} translations in ${extra.length} languages ` +
      `(${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB)`
  )
}

if (CHECK && stale) {
  console.error("\nRun `node scripts/i18n-prune.mjs` and commit the result.")
  process.exit(1)
}
