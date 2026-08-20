// R28 — EVERY STRING THE APP SAYS IS IN THE CATALOGUE, AND THE CATALOGUE SAYS
// NOTHING THE APP DOESN'T.
//
// The pipeline that translates this product into the languages it speaks is keyed
// by the
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
//   • A LANGUAGE THE APP NO LONGER SPEAKS — a translation on disk for a code
//     that is not in `LANGUAGES`. `shared/i18n.ts` calls that array the one
//     place a language is decided, and it was true of everything DERIVED from
//     it and false of the two files that accumulate. Dropping a language left
//     its 1,027 translations in the bundle, in every catalogue diff, and in the
//     header sentence claiming how many languages this app speaks. The fix is
//     `node scripts/i18n-prune.mjs`, which only ever REMOVES — filling a
//     language in costs money and is `i18n-translate`'s job, not this one's.
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
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import ts from "typescript"

import {
  ROOT,
  appFiles,
  isUserVisible,
  parseFile,
  sourceFiles,
  visitStrings,
} from "../../scripts/lib/i18n-source.mjs"
import { CATALOGUE, LANGUAGES, SEED, translate } from "@shared/i18n"
import { formatRelative } from "@shared/web/format"

/** What a whole-repo source scan is allowed to take. Stated once. */
const SCAN_BUDGET_MS = 60_000

type Walked = { path: string; tree: ts.SourceFile }

/** The walk, once. Four tests below stand on it and it parses a few hundred
 * files — one of them the 1.4 MB generated catalogue — so re-running it per
 * test is three quarters of this file's runtime for no extra proof. */
let walkedFiles: Walked[] | null = null
function walk(): Walked[] {
  walkedFiles ??= appFiles() as Walked[]
  return walkedFiles
}

/** Every English sentence the two front doors say right now, read off the real
 * syntax tree by the shared definition. */
function stringsInSource(): Set<string> {
  const found = new Set<string>()
  for (const { tree } of walk())
    visitStrings(tree, ({ text }: { text: string }) => found.add(text))
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
    // A whole-repo TypeScript parse, not a unit test: vitest's 5 s default is a
    // budget for arithmetic, and this one reads a few hundred files off disk
    // while fifty other suites share the machine.
  }, SCAN_BUDGET_MS)
})

// WHAT THE WALK CAN SEE — the half of R28 the law itself cannot state.
//
// The catalogue is only ever as complete as the definition it is derived from, so
// a sentence in a position the walk does not visit is missing from BOTH sides and
// the check above passes on it, happily, forever. That is not hypothetical: on
// 2026-08-18 every table column heading in the app was outside the catalogue,
// because a recipe field is built by `field(column, label)` and the walk only ever
// looked at `label:` PROPERTIES. The law that exists to catch a sentence shipping
// in English could not see the one kind of sentence a person reads at the top of
// every column of every table.
//
// So the positions are asserted against real syntax, one fixture each, RUN rather
// than described — including the two lines that keep the seventh narrow: the
// LABEL is copy and the COLUMN is data.
function textsIn(source: string): string[] {
  const tree = ts.createSourceFile("fixture.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  visitStrings(tree, ({ text }: { text: string }) => out.push(text))
  return out
}

describe("R28 · what the one definition can see", () => {
  it("reads a recipe field's LABEL", () => {
    expect(textsIn('const cols = [field("name", "Meeting"), field("when", "When")]')).toEqual([
      "Meeting",
      "When",
    ])
  })

  it("and never its COLUMN, which is the name of data", () => {
    // The same line `translateRecipe` draws when it translates `field.label` and
    // leaves `field.column` alone. A column name in the catalogue is a column name
    // one codemod away from being translated, which silently unbinds the screen.
    expect(textsIn('const c = field("assignee", "Who has it")')).not.toContain("assignee")
  })

  it("descends a choice, the way every other position does", () => {
    expect(textsIn('const c = field("state", open ? "Open" : "Closed")')).toEqual(["Open", "Closed"])
  })

  it("leaves a one-argument `field` alone — that is somebody else's helper", () => {
    // shared/workers/csv.ts has a `field(value)` that escapes a CSV cell. It is
    // outside the walked folders, and it would be ignored even if it were not.
    expect(textsIn('const cell = field("Some value")')).toEqual([])
  })

  it("still sees every position it saw before", () => {
    expect(textsIn("<p>No tickets yet</p>")).toContain("No tickets yet")
    expect(textsIn('<p>{busy ? "Saving…" : "Save"}</p>')).toContain("Saving…")
    expect(textsIn('<Input placeholder="Search accounts" />')).toContain("Search accounts")
    expect(textsIn('const nav = { title: "Home" }')).toContain("Home")
    expect(textsIn('toast.success("Saved.")')).toContain("Saved.")
    expect(textsIn('t("Save")')).toContain("Save")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE WALK CAN REACH — the other half R28 could not state, and the one
// that had been open the whole time.
//
// The block above is honest about POSITION: a sentence in a syntax position the
// walk does not visit is missing from both sides and the check passes on it.
// There is a second way to be invisible, and it is cheaper to fall into: the
// walk was six hand-written folders, so a sentence escaped by living in a file
// somewhere else. It cost, silently, under a green build:
//
//   • `formatRelative` (shared/web/format.ts) returned "just now", "5m ago",
//     "3h ago" and "2d ago" in English to NINE call sites across BOTH front
//     doors. `t("Created by {name} · {when}")` translated its own half of the
//     record footer and rendered *Erstellt von Aurora · 5d ago*.
//   • The whole language settings screen and the whole text-size section live
//     in shared/web/, already wrapped in `t(...)`, in no catalogue. They only
//     looked finished because the SEED carried three of the twenty-nine of the time
//     languages by hand.
//   • shared/scale.ts holds "Compact", "Comfortable" and "Large", rendered
//     through `t(step.label)` with the English one directory outside the walk.
//
// So the folder list is gone (`appFiles()` is the front doors' own import
// closure) and these two checks stand behind it. Both are DERIVED — one from
// the disk, one from the walk's own predicate — because a folder list cannot be
// made correct, only current, and "current" is exactly what nobody notices
// going stale.
//
// A file the walk does not reach and that says something a person reads is a
// reasoned line here, and the list is a ratchet: an entry that no longer
// offends turns the build red, so it can only shrink.
const UNWALKED_OK: Record<string, string> = {
  "shared/workers/record-link.ts":
    "R30's email button labels — 'Open the ticket', 'Open your requests'. A WORKER composes them into a message, for the recipient's own front door, and no front door imports this file. They are held by R30, not by a screen, and the pipeline that would translate them is the worker's per-request translator rather than the build-time catalogue. Widening R28 to reach them would put the email census under a law written about screens.",
}

/** Every .ts/.tsx under the three roots that could hold front-door copy, minus
 * the ones no person ever reads: a test is not a screen, and neither is an
 * end-to-end spec. */
function everySourceFile(): string[] {
  const skip = (path: string) => /(^|\/)(test|e2e)(\/|$)/.test(path) || /\.test\.tsx?$/.test(path)
  return ["web", "web-portal", "shared"]
    .flatMap((dir) => sourceFiles(join(ROOT, dir)) as string[])
    .filter((path) => !skip(relative(ROOT, path)))
    .sort()
}

/** Every string-literal argument to a `t(...)` call in the walked set. */
function tCallLiterals(files: Walked[]): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  for (const { path, tree } of files) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0]
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree))
          out.push({ where: `${relative(ROOT, path)}:${line + 1}`, text: arg.text })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  return out
}

describe("R28 · what the walk can REACH", () => {
  it("catalogued-strings: no file a person reads sits outside the walk because of where it lives", () => {
    const walked = new Set(walk().map((f) => f.path))
    const offenders: string[] = []
    const stillOffending = new Set<string>()

    for (const path of everySourceFile()) {
      // A walked file is already covered by the block above; skipping it BEFORE
      // the parse is what keeps this a census rather than a second full walk.
      if (walked.has(path)) continue
      const rel = relative(ROOT, path)
      const says = new Set<string>()
      visitStrings(parseFile(path), ({ text }: { text: string }) => says.add(text))
      if (says.size === 0) continue
      if (rel in UNWALKED_OK) {
        stillOffending.add(rel)
        continue
      }
      offenders.push(`${rel} (${[...says].slice(0, 3).map((s) => JSON.stringify(s)).join(", ")})`)
    }

    expect(
      offenders,
      "these files say something a person reads and no front door imports them, so the catalogue cannot see a word of it — import the file from a front door, move the copy to one, or add a reasoned UNWALKED_OK line"
    ).toEqual([])

    // The ratchet. An excuse in front of a file that no longer offends is an
    // excuse nobody re-read, and it is how the next one gets waved through.
    const rotted = Object.keys(UNWALKED_OK).filter((rel) => !stillOffending.has(rel))
    expect(
      rotted,
      "these UNWALKED_OK entries no longer name a file that is both unwalked and speaking — delete them"
    ).toEqual([])
  }, SCAN_BUDGET_MS)

  it("catalogued-strings: the call site and the definition never disagree about what a sentence is", () => {
    // A developer writing `t("of")` has DECLARED that string to be copy. The
    // walk refuses it — all-lowercase, three characters or fewer, the rule that
    // keeps "en", "de" and "px" out — so it is in no catalogue and every reader
    // in every language gets the English word, with nothing red to show for it.
    // Both readings are defensible on their own and only one of them can be
    // true of a given string, so the disagreement itself is the bug.
    //
    // The fix is never to widen `isUserVisible`. It is to write the whole
    // sentence with a hole in it — `t("{done} of {total} done")` — which is
    // also the only shape a translator can reorder, and half of these languages
    // need to.
    const refused = tCallLiterals(walk()).filter((hit) => !isUserVisible(hit.text))
    expect(
      refused.map((hit) => `${hit.where}  t(${JSON.stringify(hit.text)})`),
      "these strings are wrapped for translation and refused by the extractor, so they are translated nowhere — rewrite each as a whole sentence with {placeholders}, or drop the t() because it is not a sentence"
    ).toEqual([])
  }, SCAN_BUDGET_MS)

  it("a reader who chose German gets a German relative time", () => {
    // The proof, run rather than asserted about. Five days ago, in German, at
    // the two places it reaches a person: the formatter itself, and the record
    // footer's one entry that joins a name and a time.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const de = (english: string, vars?: Record<string, string | number>) =>
      translate(english, "de", vars)

    expect(formatRelative(fiveDaysAgo, de)).toBe("vor 5 Tagen")
    expect(formatRelative(new Date().toISOString(), de)).toBe("gerade eben")
    expect(de("Created by {name} · {when}", { name: "Aurora", when: formatRelative(fiveDaysAgo, de) })).toBe(
      "Erstellt von Aurora · vor 5 Tagen"
    )

    // Past a week it is an absolute date, which is `formatDate`'s job and the
    // reader's own locale — deliberately not a second time vocabulary.
    const lastYear = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelative(lastYear, de)).not.toContain("vor")
  })
})

// ── the languages, as opposed to the strings ─────────────────────────────────
//
// R28's other three clauses ask whether the catalogue's KEYS match the code.
// This asks whether its VALUES do: `shared/i18n.ts` holds one array of
// languages and says in its own comment that adding or dropping one is a single
// line, because everything is derived from it. Everything derived, yes — but the
// catalogue and the seed are not derived, they are ACCUMULATED, and on
// 2026-08-20 the app declared four languages while 1.4 MB of Javanese, Hausa
// and Thai sat in the bundle behind it.
//
// Narrow on purpose: it fails only on a language the app does NOT speak. A
// language it speaks but has not translated yet is a partly-translated app,
// which is R28's founding position on missing words — a sentence, not a bug.
describe("R28 · the catalogue speaks the languages the app speaks, and no others", () => {
  it("catalogued-strings: no translation on disk for a language outside LANGUAGES", () => {
    const spoken = new Set<string>(LANGUAGES.map((l) => l.code))
    for (const [file, table] of [
      ["shared/i18n-catalogue.ts", CATALOGUE],
      ["shared/i18n-seed.ts", SEED],
    ] as const) {
      const found = new Map<string, number>()
      for (const row of Object.values(table))
        for (const code of Object.keys(row))
          if (!spoken.has(code)) found.set(code, (found.get(code) ?? 0) + 1)
      const extra = [...found.entries()].sort()
      expect(
        extra,
        `${file} carries translations for ${extra.length} language(s) this app does not speak: ` +
          extra.map(([code, n]) => `${code} (${n})`).join(", ") +
          `. Run \`node scripts/i18n-prune.mjs\` and commit the result.`
      ).toEqual([])
    }
  })

  it("catalogued-strings: the generated catalogue's header says how many languages it really holds", () => {
    // The header is the sentence a person reads instead of counting. It went
    // stale the moment the array was trimmed, and a stale count in a GENERATED
    // file reads as fact rather than as a leftover.
    const head = readFileSync(join(ROOT, "shared", "i18n-catalogue.ts"), "utf8").slice(0, 4000)
    const claim = /^\/\/ (\d+) strings · (\d+) languages/m.exec(head)
    expect(claim, "shared/i18n-catalogue.ts has no `N strings · N languages` header line").toBeTruthy()
    expect(Number(claim![2]), "the header's language count").toBe(LANGUAGES.length - 1)
    expect(Number(claim![1]), "the header's string count").toBe(Object.keys(CATALOGUE).length)
  })
})
