#!/usr/bin/env node
// THE EXTRACTOR — every English string the app says, read off the source.
//
//   node scripts/i18n-extract.mjs          → writes shared/i18n-strings.json
//   node scripts/i18n-extract.mjs --check  → exits 1 if that file is stale
//
// WHAT COUNTS AS A STRING, and why a parser rather than a regex, is one shared
// definition — scripts/lib/i18n-source.mjs — because the adoption codemod wraps
// exactly the positions this reads. Read that file for the five positions.
//
// ENGLISH IS THE KEY (shared/i18n.ts), so what comes out of here is exactly what
// goes into `t(...)` at the call site and exactly what the catalogue is keyed
// by. Same code in, same file out: the walk is depth-first over a sorted file
// list and the output is sorted by code point, so a re-run on unchanged source
// produces a byte-identical file and `--check` is meaningful in CI.

import { readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

import { APP_DIRS, ROOT, parseFile, sourceFiles, visitStrings } from "./lib/i18n-source.mjs"

const OUT = join(ROOT, "shared", "i18n-strings.json")

const found = new Map() // english → "file:line" of its first appearance
for (const dir of APP_DIRS) {
  for (const path of sourceFiles(dir)) {
    const tree = parseFile(path)
    const rel = relative(ROOT, path)
    visitStrings(tree, ({ text, node }) => {
      if (found.has(text)) return
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree))
      found.set(text, `${rel}:${line + 1}`)
    })
  }
}

// Sorted by code point rather than locale — `localeCompare` depends on the
// machine's collation, and this file has to be byte-identical on every one.
const strings = [...found.keys()].sort()
const body = JSON.stringify(strings, null, 2) + "\n"

if (process.argv.includes("--check")) {
  let current = ""
  try {
    current = readFileSync(OUT, "utf8")
  } catch {
    current = ""
  }
  if (current !== body) {
    console.error(
      `STALE: ${relative(ROOT, OUT)} does not match the source. Run: node scripts/i18n-extract.mjs`
    )
    process.exit(1)
  }
  console.log(`OK: ${strings.length} strings, ${relative(ROOT, OUT)} is current.`)
} else {
  writeFileSync(OUT, body)
  const agency = [...found.values()].filter((w) => w.startsWith("web/")).length
  console.log(
    `${strings.length} strings → ${relative(ROOT, OUT)}` +
      `  (first seen: ${agency} in web/, ${strings.length - agency} in web-portal/)`
  )
}
