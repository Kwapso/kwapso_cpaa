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
// and it is why the catalogue is GENERATED rather than kept by hand:
// `scripts/i18n-extract.mjs` reads every string the two front doors say straight
// off the source, and `scripts/i18n-translate.mjs` fills in only what is missing.
// Reword a button and the old key stops being extracted; re-run the pair and the
// new wording is translated. `node scripts/i18n-extract.mjs --check` says whether
// the extracted list still matches the code.
//
// AND A HAND-WRITTEN WORD DOES NOT WAIT FOR THE GENERATOR. The seed is resolved
// OVER the catalogue at run time (`SPOKEN`, below), so somebody who is sure of a
// word writes it in `shared/i18n-seed.ts` and it is on screen — no model, no key,
// no spend. Until that existed, the seed's own "THE SEED ALWAYS WINS" was true
// only of a build nobody could afford to run.

import { CATALOGUE } from "./i18n-catalogue"
import { SEED } from "./i18n-seed"

export { CATALOGUE, SEED }

/** The languages this app speaks, in the order a switcher shows them.
 *
 * ONE ARRAY, so adding or dropping a language is one line. Everything else is
 * derived from it: the type, the guard, the switcher's buttons, the coverage
 * figures, the agent's "answer in their language" instruction, and the set the
 * build-time translator fills in (`scripts/i18n-translate.mjs` reads this very
 * file rather than keeping its own list — a second list is a second truth).
 *
 * THE FIRST FOUR ARE NOT INVENTED. They are the LANGUAGES rows in the agency's
 * own legacy data, which is also where their flags come from, and their German
 * is lifted from the words the agency has been using with German clients for
 * years (shared/i18n-seed.ts). They stay first because they are the ones a
 * kwapso user actually picks.
 *
 * THE REST ARE THE WORLD'S TOP 25 BY TOTAL SPEAKERS — native plus second
 * language — in that order, so the list answers "can this app speak to the
 * person in front of me" for most of the planet. Two judgement calls, stated
 * rather than hidden: regional varieties that share a written form with one
 * already here (Wu and Yue against Mandarin, Egyptian against Modern Standard
 * Arabic) are not repeated, because a language switcher offers a person a
 * SCREEN, and those screens would be the same one; and each entry has to be a
 * language somebody can be shown a whole interface in.
 *
 * `native` is what the switcher shows — somebody looking for their own language
 * scans for the word they call it, not for the English name of it. `english` is
 * what the machine translator and the assistant are told to write in.
 *
 * KNOWN GAP: Arabic, Urdu and Persian are read right to left, and nothing here
 * sets the document's direction yet. Their words are correct; their layout is
 * not. That is a screen-level change, not a catalogue one. */
export const LANGUAGES = [
  // The agency's own four.
  { code: "en", english: "English", native: "English", flag: "🇬🇧" },
  { code: "de", english: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "es", english: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "ca", english: "Catalan", native: "Català", flag: "🇦🇩" },
  // Then the world's, by how many people speak them.
  { code: "zh", english: "Mandarin Chinese", native: "中文", flag: "🇨🇳" },
  { code: "hi", english: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "ar", english: "Modern Standard Arabic", native: "العربية", flag: "🇸🇦" },
  { code: "fr", english: "French", native: "Français", flag: "🇫🇷" },
  { code: "bn", english: "Bengali", native: "বাংলা", flag: "🇧🇩" },
  { code: "pt", english: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "ru", english: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "ur", english: "Urdu", native: "اردو", flag: "🇵🇰" },
  { code: "id", english: "Indonesian", native: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "ja", english: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "pa", english: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "mr", english: "Marathi", native: "मराठी", flag: "🇮🇳" },
  { code: "te", english: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
  { code: "tr", english: "Turkish", native: "Türkçe", flag: "🇹🇷" },
  { code: "ta", english: "Tamil", native: "தமிழ்", flag: "🇮🇳" },
  { code: "vi", english: "Vietnamese", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "ha", english: "Hausa", native: "Hausa", flag: "🇳🇬" },
  { code: "sw", english: "Swahili", native: "Kiswahili", flag: "🇰🇪" },
  { code: "tl", english: "Filipino", native: "Filipino", flag: "🇵🇭" },
  { code: "ko", english: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "fa", english: "Persian", native: "فارسی", flag: "🇮🇷" },
  { code: "jv", english: "Javanese", native: "Basa Jawa", flag: "🇮🇩" },
  { code: "it", english: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "gu", english: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳" },
  { code: "th", english: "Thai", native: "ไทย", flag: "🇹🇭" },
] as const

export type Language = (typeof LANGUAGES)[number]["code"]

/** The one language that always has every string, because it IS the key. Also
 * the fallback for a person who has never chosen, and for a translation nobody
 * has written yet. */
export const DEFAULT_LANGUAGE: Language = "en"

/** Every language that needs a written translation — English is the source. */
export type Translated = Exclude<Language, "en">

/** The same set at runtime, DERIVED rather than typed out a second time. The
 * switcher, the coverage figures and the build-time translator all walk this,
 * so adding a language to LANGUAGES is genuinely the only edit. */
export const TRANSLATED_LANGUAGES: readonly Translated[] = LANGUAGES.map((l) => l.code).filter(
  (code): code is Translated => code !== DEFAULT_LANGUAGE
)

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
 * asked to preserve faithfully across twenty-nine languages. */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole
  )
}

/** SEED OVER CATALOGUE, PER LANGUAGE — not per key.
 *
 * The seed is PARTIAL on purpose: it holds the agency's own German, Spanish and
 * Catalan for a string the machine answered in twenty-eight languages. Replacing
 * the whole entry would throw the other twenty-five away, so each language is
 * decided on its own — the same merge `scripts/i18n-translate.mjs` already does
 * at build time, which is the point: the runtime now agrees with it. */
export function overlay(base: Catalogue, over: Catalogue): Catalogue {
  const out: Catalogue = { ...base }
  for (const [english, entry] of Object.entries(over)) out[english] = { ...out[english], ...entry }
  return out
}

/** WHAT THE APP ACTUALLY SPEAKS, and what every default reads.
 *
 * `CATALOGUE` is the generator's output and `SEED` is the hand-written half, and
 * for a year only the generator ever put the two together. This is the seam that
 * makes the seed's own promise true on screen. */
export const SPOKEN: Catalogue = overlay(CATALOGUE, SEED)

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
  const entry = (catalogue ?? SPOKEN)[english]
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
  const c = catalogue ?? SPOKEN
  const keys = Object.keys(c)
  const out = Object.fromEntries(TRANSLATED_LANGUAGES.map((l) => [l, 0])) as Record<
    Translated,
    number
  >
  if (keys.length === 0) return out
  for (const lang of TRANSLATED_LANGUAGES) {
    const done = keys.filter((k) => typeof c[k]?.[lang] === "string" && c[k][lang] !== "").length
    out[lang] = done / keys.length
  }
  return out
}
