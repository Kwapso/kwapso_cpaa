// R44 — A CATALOGUED STRING MUST BE ANSWERED, UP TO A CEILING THAT ONLY FALLS.
//
// R28 (catalogued-strings.test.ts) makes `shared/i18n-strings.json` exactly the
// set of English sentences the app says. R33 (wrapped-strings.test.ts) makes
// every one of those positions sit inside a `t(...)` call. NEITHER asks whether
// the asking is ever answered: a string can be extracted and wrapped and still
// have no entry anywhere in `overlay(CATALOGUE, SEED)` for a translated
// language, which is `shared/i18n-catalogue.ts`'s own stated fallback — English
// on screen, "a sentence rather than a bug" — and that is true right up until a
// German reader is the only one who notices.
//
// THIS DOES NOT FILL THE HOLE. `i18n-translate.mjs` spends the owner's own key
// and is out of scope for a check. This only makes the hole a NUMBER instead of
// a shrug, and stops it from growing without somebody noticing in the diff.
//
// THE CEILING, NOT A HARD ZERO. `shared/i18n-catalogue.ts`'s own header argues a
// missing translation is a partly-translated app, never a broken one — a hard
// zero would fail on the next ordinary feature PR that adds one new label, and
// a build that goes red on unrelated work teaches people to route around it.
// `TRANSLATION_CEILING` (shared/rules/registry.ts) pins the count PER LANGUAGE,
// and the check requires the true count to equal the pin EXACTLY — not merely
// "at or under" — so the pin cannot go stale in either direction: pushing past
// it is a regression (an untranslated string shipped) and leaving it above the
// true count is a rot (a translation landed and nobody lowered the number,
// which would hide the NEXT regression behind the improvement).
//
// It reads `shared/i18n-strings.json` as ground truth rather than re-walking
// the source — that walk is R28's job, proven current by its own `--check`, and
// re-running a 60-second whole-repo parse here to answer a different question
// would make this suite slow for no extra proof.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { SPOKEN, TRANSLATED_LANGUAGES, type Translated } from "@shared/i18n"
import { TRANSLATION_CEILING } from "@shared/rules/registry"

const ROOT = join(__dirname, "..", "..")

/** Per language, every extracted string with no non-empty entry in SPOKEN — the
 * exact predicate `coverage()` (shared/i18n.ts) already uses. */
function untranslated(extracted: string[]): Record<Translated, string[]> {
  const out = Object.fromEntries(TRANSLATED_LANGUAGES.map((l) => [l, [] as string[]])) as Record<
    Translated,
    string[]
  >
  for (const s of extracted) {
    const entry = SPOKEN[s]
    for (const lang of TRANSLATED_LANGUAGES) {
      const val = entry?.[lang]
      if (typeof val !== "string" || val === "") out[lang].push(s)
    }
  }
  return out
}

describe("R44 · a catalogued string must be answered, up to a ceiling that only falls", () => {
  it("translation-ceiling: every pinned language matches its true untranslated count exactly", () => {
    const extracted: string[] = JSON.parse(
      readFileSync(join(ROOT, "shared", "i18n-strings.json"), "utf8")
    )
    const missing = untranslated(extracted)

    for (const lang of TRANSLATED_LANGUAGES) {
      const actual = missing[lang].length
      const ceiling = TRANSLATION_CEILING[lang]
      expect(
        ceiling,
        `TRANSLATION_CEILING (shared/rules/registry.ts) has no entry for "${lang}", which LANGUAGES speaks`
      ).toBeTypeOf("number")

      if (actual > ceiling) {
        const sample = missing[lang].slice(0, 10)
        expect(
          actual,
          `${lang}: ${actual} untranslated strings, over the pinned ceiling of ${ceiling}. ` +
            `${actual - ceiling} string(s) shipped with no translation and pushed the count up — ` +
            `translate them (by hand, or via a reviewed run of scripts/i18n-translate.mjs) or, if this ` +
            `is accepted debt, raise TRANSLATION_CEILING.${lang} in shared/rules/registry.ts to ${actual} ` +
            `in the same change. First few: ${JSON.stringify(sample)}`
        ).toBe(ceiling)
      } else if (actual < ceiling) {
        expect(
          actual,
          `${lang}: ${actual} untranslated strings, UNDER the pinned ceiling of ${ceiling}. ` +
            `Something translated ${ceiling - actual} string(s) since the pin was last set — lower ` +
            `TRANSLATION_CEILING.${lang} in shared/rules/registry.ts to ${actual} so the ceiling can't ` +
            `hide the next regression behind this improvement.`
        ).toBe(ceiling)
      }
    }
  })
})
