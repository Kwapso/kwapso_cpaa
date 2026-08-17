// THE LANGUAGE ENGINE — one seam, both front doors, every worker.
//
// WHAT IS TRANSLATED AND WHAT IS NEVER TRANSLATED. This is the whole design in
// two sentences, and getting it wrong in either direction is the failure mode.
//
//   • WHAT WE WROTE is translated: every button, label, heading, hint, empty
//     state, toast, refusal message and email the app composes itself, plus the
//     prose the assistant writes and the dropdown values a team picks from.
//   • WHAT A PERSON TYPED is NEVER translated: a ticket's text, a story's
//     detail, a work log's note, a meeting's minutes, an account's name. Those
//     are somebody's own words and the app has no business rewriting them. A
//     German client's ticket reaches Aurora in German, and the screen around it
//     is in hers.
//
// ENGLISH IS THE KEY, NOT A KEY NAMED AFTER ENGLISH. `t("No tickets yet")`
// rather than `t("tickets.empty")`. Three reasons, and the third is the one that
// decides it:
//
//   1. The seven hundred strings already exist in English in the source, so
//      adopting this is `"Foo"` → `t("Foo")`: mechanical, and reviewable in a
//      diff by somebody who does not know the catalogue.
//   2. Nobody has to name seven hundred keys, and no two people have to agree
//      on how.
//   3. A MISSING TRANSLATION DEGRADES TO ENGLISH, which is a sentence. A
//      key-based scheme degrades to `tickets.empty`, which is a bug on screen.
//      This app is used by people who are not going to file a ticket about it —
//      they will simply think it is broken.
//
// The cost is that rewording the English orphans its translations. That is real,
// and it is why the catalogue is checked for orphans rather than left to rot
// (RULES.md R28).

import { CATALOGUE } from "./i18n-catalogue"

export { CATALOGUE }

/** The languages this app speaks, in the order a switcher shows them.
 *
 * These four are not invented: they are the LANGUAGES rows in the agency's own
 * legacy data, which is also where the flags come from. `native` is what the
 * switcher shows — somebody looking for their own language scans for the word
 * they call it, not for the English name of it. */
export const LANGUAGES = [
  { code: "en", english: "English", native: "English", flag: "🇬🇧" },
  { code: "de", english: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "es", english: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "ca", english: "Catalan", native: "Català", flag: "🇦🇩" },
] as const

export type Language = (typeof LANGUAGES)[number]["code"]

/** The one language that always has every string, because it IS the key. Also
 * the fallback for a person who has never chosen, and for a translation nobody
 * has written yet. */
export const DEFAULT_LANGUAGE: Language = "en"

/** Every language that needs a written translation — English is the source. */
export type Translated = Exclude<Language, "en">

/** THE POSITIONAL GUARD (R20). A language arrives off a request body or a query
 * string like anything else, so it is type-checked at the door rather than cast.
 * Narrow enough to sit as a validator's own operand. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGES.some((l) => l.code === value)
}

/** A person's stored preference, made safe. Anything unrecognised — null, a
 * language we dropped, a value somebody wrote straight into the database —
 * answers English rather than throwing. A screen must never fail to render
 * because of a preference. */
export function toLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE
}

/** One English string's translations. Absent means "not written yet", which
 * reads as English on screen and as a gap in the rot check. */
export type Entry = Partial<Record<Translated, string>>

/** The catalogue: English string → its translations. Lives in its own file
 * because it is data and this is the engine. */
export type Catalogue = Record<string, Entry>

/** Values interpolated into a string, by name. */
export type Vars = Record<string, string | number>

/** `{name}` placeholders, filled from `vars`. A placeholder with no value is
 * left exactly as written rather than blanked: "{email}" on screen tells
 * somebody what went wrong, an empty gap does not.
 *
 * Deliberately not a template engine. No conditionals, no plurals, no nesting —
 * a translator gets a sentence with holes in it, which is the most they can be
 * asked to preserve faithfully across four languages. */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole
  )
}

/** THE FUNCTION EVERYTHING CALLS.
 *
 * `english` is both the key and the fallback, so the worst case is an untranslated
 * screen rather than a broken one. The catalogue is a parameter with a default so
 * a test can pass its own without stubbing a module. */
export function translate(
  english: string,
  lang: Language,
  vars?: Vars,
  catalogue?: Catalogue
): string {
  if (lang === DEFAULT_LANGUAGE) return fill(english, vars)
  const entry = (catalogue ?? CATALOGUE)[english]
  return fill(entry?.[lang as Translated] ?? english, vars)
}

/** Bind a language once and get the `t` that every call site uses. The web
 * provider hands this down; a worker builds one per request from the caller's
 * own preference. */
export function translator(lang: Language, catalogue?: Catalogue) {
  return (english: string, vars?: Vars): string => translate(english, lang, vars, catalogue)
}

/** How complete each language is, as a fraction of the catalogue. Read by the
 * Settings screen so somebody choosing Catalan is told what to expect rather
 * than discovering it a screen later. */
export function coverage(catalogue?: Catalogue): Record<Translated, number> {
  const c = catalogue ?? CATALOGUE
  const keys = Object.keys(c)
  const out = { de: 0, es: 0, ca: 0 } as Record<Translated, number>
  if (keys.length === 0) return out
  for (const lang of ["de", "es", "ca"] as const) {
    const done = keys.filter((k) => typeof c[k]?.[lang] === "string" && c[k][lang] !== "").length
    out[lang] = done / keys.length
  }
  return out
}
