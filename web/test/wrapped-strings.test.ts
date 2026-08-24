// R33 — EVERY EXTRACTED POSITION ASKS FOR ITS TRANSLATION.
//
// R28 (catalogued-strings.test.ts, beside this one) makes the CATALOGUE match
// the code. It cannot make the code read the catalogue, and on 2026-08-18 the
// difference between those two sentences was 666 positions:
//
//   • every form field label in the app — 138 of them,
//   • 119 of the toasts, including every "Couldn't save …",
//   • both error boundaries, which are the screens a person sees when something
//     has already gone wrong,
//   • and most dialog titles, because they are written as a ternary.
//
// All of them were in `shared/i18n-strings.json`. Most of them had German. None
// of them asked for it, so all of them rendered in English, in every
// languages, under a green build. R28 was satisfied throughout — a catalogue can
// be perfect and every screen still English, because "is this string EXTRACTED?"
// and "does this position CALL t?" are different questions and only the first
// one had ever been asked.
//
// THE SAME ONE DEFINITION, so the two laws cannot drift. `visitStrings` reports
// a `kind` for every position it finds, and `t-call` is one of them (it exists
// so that wrapping a string does not delete it from the extraction). So this
// check is R28's walk read the other way round: a position whose kind is NOT
// `t-call` is a sentence in the source that no translator will ever be asked
// about. A second definition of "a string a person reads" would be the exact
// failure R28's own header warns about.
//
// TWO WAYS OUT, AND THEY ARE DIFFERENT IN KIND.
//
//   1. POSITIONAL — a `label:` / `helpText:` on an object that spreads a field
//      config. `t` is a HOOK, a field config is a module-level constant, so
//      `t("Team name")` genuinely cannot be written where those words live; that
//      is WHY none of the 138 was ever wrapped, and it is the one class of
//      string in this app a developer could not have fixed by remembering to.
//      They are translated on the way to the screen instead, by
//      `shared/web/field.tsx` — the same ruling `translateRecipe` already makes
//      for the recipes. The object says what it is (`...defaultFieldConfig`),
//      the way R20 identifies a checked field and R29 a page container.
//
//      That exemption is only sound while the seam cannot be walked around, so
//      the second half of this check is an IMPORT BAN: nothing in either front
//      door may import `Field` from the library directly. An import cannot be
//      forgotten the way a `t(` can (R24's reasoning, in a smaller place).
//
//   2. PINNED — a copy TABLE, read back through `t` somewhere else. Data in
//      `TRANSLATED_WHERE_READ` (shared/rules/registry.ts), keyed by file and
//      narrowed by kind, each with the `via` call that does the reading. Rot-
//      checked both ways, so the list can only shrink.
//
// WHAT THIS LAW DOES NOT REACH, said plainly because a law that overstates its
// cover is worse than one that admits a gap: it stands entirely on the positions
// R28's walk can SEE. A sentence written somewhere the walk does not visit — a
// `const title = cond ? \`…\` : "…"`, a positional argument, a property name
// outside the closed list — is in neither the catalogue nor this census, and
// both laws pass on it. That blind spot is R28's to widen (its own header names
// the last time it was), and every widening lands here for free.

import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import ts from "typescript"

import { TRANSLATED_WHERE_READ } from "../../shared/rules/registry"
import {
  ROOT,
  appFiles,
  visitStrings,
} from "../../scripts/lib/i18n-source.mjs"

type Hit = { text: string; kind: string; file: string; line: number; node: ts.Node }

/** Every position the ONE definition reports, with the file and line a person
 * has to open to fix it. */
function positions(): Hit[] {
  const out: Hit[] = []
  // appFiles() hands back each file ALREADY PARSED — the same closure R28's own
  // extractor walks, so the two laws cannot disagree about what a file is.
  for (const { path, tree } of appFiles()) {
      const file = relative(ROOT, path)
      visitStrings(tree, ({ text, node, kind }: { text: string; node: ts.Node; kind: string }) => {
        const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree))
        out.push({ text, kind, file, line: line + 1, node })
      })
    }
  return out
}

/** Is this position a field config's own words?
 *
 * POSITIONAL, and narrow by construction: the enclosing object literal must
 * SPREAD a field-config default (`...defaultFieldConfig`, or a named one built
 * from it), which is the signature of a `FieldConfig` and of nothing else. A
 * bare `{ label: "…" }` is not a field config and is not caught here — that is
 * the point, it is how the nav registry and the copy tables stay in the census. */
function isFieldConfigWord(hit: Hit): boolean {
  if (hit.kind !== "property") return false
  const name = (hit.node as ts.PropertyAssignment).name
  if (!ts.isIdentifier(name) || (name.text !== "label" && name.text !== "helpText")) return false
  let obj: ts.Node | undefined = hit.node.parent
  while (obj && !ts.isObjectLiteralExpression(obj)) obj = obj.parent
  if (!obj) return false
  return (obj as ts.ObjectLiteralExpression).properties.some(
    (p) => ts.isSpreadAssignment(p) && /[Ff]ieldConfig\b/.test(p.expression.getText())
  )
}

const pinned = (hit: Hit): boolean =>
  (TRANSLATED_WHERE_READ[hit.file]?.kinds as string[] | undefined)?.includes(hit.kind) ?? false

/** Every .ts/.tsx line in the two front doors, as one string to grep. */
function frontDoorSource(): string {
  return appFiles()
    .map(({ path }: { path: string }) => readFileSync(path, "utf8"))
    .join("\n")
}

describe("R33 · every extracted position asks for its translation", () => {
  const all = positions()

  it("wrapped-strings: a sentence in the source sits inside a t(...) call", () => {
    // The census must not go blind. A walk that finds nothing reports the same
    // all-clear as a walk that found everything and every one of them wrapped —
    // the failure R28's own header records from the day the column headings went
    // missing, one level up.
    expect(
      all.length,
      "the string census found almost nothing — the walk has gone blind"
    ).toBeGreaterThan(1500)

    const unwrapped = all
      .filter((h) => h.kind !== "t-call")
      .filter((h) => !isFieldConfigWord(h))
      .filter((h) => !pinned(h))

    expect(
      unwrapped.slice(0, 20).map((h) => `${h.file}:${h.line} (${h.kind}) ${JSON.stringify(h.text)}`),
      `${unwrapped.length} sentence(s) are extracted into the catalogue and translated at build time, and then rendered without asking for the translation. Wrap the position in t(...) — or, if the words are a copy TABLE read through t somewhere else, pin the file in TRANSLATED_WHERE_READ (shared/rules/registry.ts) with the call that reads it.`
    ).toEqual([])
  })

  it("wrapped-strings: the field seam cannot be walked around", () => {
    // The positional exemption above says a field config's label is translated
    // ON THE WAY TO THE SCREEN. That is only true while every screen renders
    // fields through the seam that does it, so the import is the enforced part:
    // a condition can be inverted and a call can be forgotten, an import cannot.
    // The SEAM ITSELF is the one file that must import the library Field — it is
    // the thing doing the translating. It became visible here only when the walk
    // became the front doors' import closure rather than a folder list, and the
    // three assertions below are what hold it honest, so excluding it costs
    // nothing: a seam that stopped translating fails them whether it is listed
    // here or not.
    const SEAM = "shared/web/field.tsx"
    const offenders = appFiles()
      .filter(({ path }: { path: string }) => readFileSync(path, "utf8").includes("controls/field/field"))
      .map(({ path }: { path: string }) => relative(ROOT, path))
      .filter((rel: string) => rel !== SEAM)

    expect(
      offenders,
      "these files import the library Field directly, which renders `config.label` verbatim — import { Field } from \"@shared/web/field\" instead, which is the same component with its config's words put through the reader's language"
    ).toEqual([])

    // …and the seam it points at must still be doing the translating.
    const seam = readFileSync(join(ROOT, "shared", "web", "field.tsx"), "utf8")
    expect(seam, "the field seam must read the reader's language").toContain("useT()")
    expect(seam, "the field seam must translate the label").toContain("t(config.label)")
    expect(seam, "the field seam must translate the help text").toContain("t(config.helpText)")
  })

  it("wrapped-strings: every pinned copy table still needs its pin, and still has its seam", () => {
    const source = frontDoorSource()
    for (const [file, pin] of Object.entries(TRANSLATED_WHERE_READ)) {
      const here = all.filter((h) => h.file === file && h.kind !== "t-call")
      expect(
        here.length,
        `${file} is pinned in TRANSLATED_WHERE_READ and has no unwrapped position left — delete the pin`
      ).toBeGreaterThan(0)

      for (const kind of pin.kinds)
        expect(
          here.some((h) => h.kind === kind),
          `${file} pins the kind "${kind}" and has none — narrow the pin`
        ).toBe(true)

      // A pin says "these words are translated over there". `via` is the call
      // that does it, and a pin whose seam has been deleted or renamed is a
      // sentence shipping in English behind a reasoned-looking exemption.
      for (const via of pin.via)
        expect(source.includes(via), `${file} is pinned via \`${via}\`, which is nowhere in the two front doors`).toBe(
          true
        )

      expect(pin.why.length, `${file} needs a real reason, not a label`).toBeGreaterThan(60)
    }
  })
})
