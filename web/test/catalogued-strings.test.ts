// R28 — EVERY STRING THE APP SAYS IS IN THE CATALOGUE, AND THE CATALOGUE SAYS
// NOTHING THE APP DOESN'T.
//
// The pipeline that translates this product into 29 languages is keyed by the
// ENGLISH sentence (shared/i18n.ts): what a developer types at the call site is
// what the catalogue is keyed by and what the translator translates. That makes
// the whole thing depend on one fact staying true — that `shared/i18n-strings.json`
// is exactly the set of sentences in the source — and until now nothing checked
// it. A screen written on a Tuesday spoke English to a German reader, silently,
// under a green build, until the next person remembered to re-run a script.
//
// TWO FAILURES, NAMED SEPARATELY, because they are two different mistakes:
//   • MISSING — a sentence in the source that is not in the catalogue. That
//     string ships untranslated. This is the one the law is for.
//   • ORPHAN — a catalogue entry no string in the app matches. Nothing breaks
//     today, and that is exactly why it rots: a deleted screen's sentences stay
//     in the file, get translated on every build, and make the catalogue a
//     record of what the app USED to say. The same ratchet reasoning as R20's
//     exemption list and R27's vocabulary.
//
// IT RE-RUNS THE REAL EXTRACTOR rather than re-implementing it. `scripts/lib/
// i18n-source.mjs` is the ONE definition of "a string a person reads" — it is
// what the extractor writes from and what the adoption codemod wraps — so a
// check with its own idea of that would be a second definition, and the day the
// two drifted this test would pass while the app spoke English. The walk is a
// TypeScript parse of both front doors and takes about a third of a second.
//
// THE FIX IS ONE COMMAND, and the failure says so: `node scripts/i18n-extract.mjs`.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { APP_DIRS, ROOT, parseFile, sourceFiles, visitStrings } from "../../scripts/lib/i18n-source.mjs"

/** Every English sentence the two front doors say right now, read off the real
 * syntax tree by the shared definition. */
function stringsInSource(): Set<string> {
  const found = new Set<string>()
  for (const dir of APP_DIRS)
    for (const path of sourceFiles(dir))
      visitStrings(parseFile(path), ({ text }: { text: string }) => found.add(text))
  return found
}

describe("R28 · the translation catalogue cannot rot", () => {
  it("catalogued-strings: every user-visible string is in shared/i18n-strings.json, and nothing else is", () => {
    const catalogue: string[] = JSON.parse(
      readFileSync(join(ROOT, "shared", "i18n-strings.json"), "utf8")
    )
    const inApp = stringsInSource()
    const inCatalogue = new Set(catalogue)

    // MISSING — these ship in English to every reader who chose another language.
    const missing = [...inApp].filter((s) => !inCatalogue.has(s)).sort()
    expect(
      missing.slice(0, 20),
      `${missing.length} string(s) the app says are not in the catalogue, so they ship untranslated. Run: node scripts/i18n-extract.mjs`
    ).toEqual([])

    // ORPHANS — a ratchet: an entry nothing says any more is paid for on every
    // build and makes the file a record of the past.
    const orphans = [...inCatalogue].filter((s) => !inApp.has(s)).sort()
    expect(
      orphans.slice(0, 20),
      `${orphans.length} catalogue entr(ies) match no string in the app — they are translated on every build for nothing. Run: node scripts/i18n-extract.mjs`
    ).toEqual([])

    // …and the FILE ITSELF is what a re-run would write: sorted by code point,
    // no duplicates. `--check` compares bytes for the same reason, so a
    // hand-edited catalogue cannot pass here and fail in CI.
    expect(catalogue.length, "the catalogue holds no duplicates").toBe(inCatalogue.size)
    expect(catalogue, "the catalogue is sorted by code point, as the extractor writes it").toEqual(
      [...catalogue].sort()
    )
  })
})
