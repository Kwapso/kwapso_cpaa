// THE LANGUAGE ENGINE, AND THE DOOR THAT SETS IT.
//
// Five things are being locked here, and each one is a way this feature could
// fail QUIETLY — which is the only way a translation layer ever fails.
//
//  1. AN UNKNOWN LANGUAGE NEVER REACHES THE DATABASE. The door type-checks
//     against the LANGUAGES list rather than accepting any string (R20). A value
//     that got past it would sit on a user row for ever, matching no catalogue
//     entry, and that person would read fallback English with no way to explain
//     why. A clean 400 is recoverable; a stored "en-GB" is not.
//
//  2. EVERY UNKNOWN ANSWERS ENGLISH. A missing translation, a language we
//     retired, a null preference, a value somebody wrote straight into the
//     database — all of them render a sentence. The one thing this seam must
//     never do is put a key on screen or throw during a render.
//
//  3. THE ENGLISH PATH IS BYTE-IDENTICAL. `systemFor(null)` must be the SYSTEM
//     prompt exactly, not SYSTEM plus a paragraph saying "answer in English".
//     Every existing agent suite reads that constant, and the common case must
//     cost nothing.
//
//  4. THE HAND-WRITTEN WORD REACHES THE SCREEN. `shared/i18n-seed.ts` says the
//     seed always wins; for a year it won only inside the build-time generator,
//     which spends a model key nobody may spend. A comment claimed an invariant
//     no code held, and the failure was invisible because the generator had
//     already copied the seed into the catalogue — so the two agreed, and the
//     day they stopped agreeing was the day it would have mattered.
//
//  5. THE ASSISTANT IS TOLD NOT TO TRANSLATE THE DATA. This is the one that
//     would be expensive to discover in production: a model told "answer in
//     German" will happily send `Frage` as a `help_type` filter, match zero
//     rows, and report "no tickets" — which reads as the app being broken. The
//     rule has to be IN the prompt, so the test asserts it is.

import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import {
  CATALOGUE,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  SEED,
  SPOKEN,
  coverage,
  fill,
  isLanguage,
  overlay,
  toLanguage,
  translate,
  translator,
  type Catalogue,
  type Language,
  type Translated,
} from "@shared/i18n"
import { SYSTEM, systemFor } from "../../data-ops/src/lib/agent"
import { d1, migration } from "./core-sqlite"

describe("what counts as a language (R20, at the door)", () => {
  it("accepts every language we speak, and English is one of them", () => {
    for (const l of LANGUAGES) expect(isLanguage(l.code), l.code).toBe(true)
    expect(isLanguage(DEFAULT_LANGUAGE)).toBe(true)
  })

  it("refuses everything else, including the near misses", () => {
    // The near misses are the point. A locale string, a case variant and a
    // language we do not have are all things a real client would send.
    //
    // `xx` rather than `fr` since the list grew past the agency's own four: a
    // fixture naming a real language would have started passing for the wrong
    // reason the day we added it, which is a green test asserting nothing.
    for (const bad of ["en-GB", "EN", "de-DE", "xx", "", " ", "english", null, 7, {}, ["de"]])
      expect(isLanguage(bad), JSON.stringify(bad)).toBe(false)
  })

  it("never throws on a stored value, however wrong", () => {
    expect(toLanguage(null)).toBe(DEFAULT_LANGUAGE)
    expect(toLanguage(undefined)).toBe(DEFAULT_LANGUAGE)
    expect(toLanguage("xx")).toBe(DEFAULT_LANGUAGE)
    expect(toLanguage(42)).toBe(DEFAULT_LANGUAGE)
    expect(toLanguage("de")).toBe("de")
  })
})

describe("every unknown reads as English", () => {
  const CAT: Catalogue = { Save: { de: "Speichern" }, Cancel: {} }

  it("translates what it has", () => {
    expect(translate("Save", "de", undefined, CAT)).toBe("Speichern")
  })

  it("falls back to the English for a language with no entry", () => {
    // Spanish is missing from this catalogue entirely. The screen must say
    // "Save", never "Save.es" and never an empty string.
    expect(translate("Save", "es", undefined, CAT)).toBe("Save")
  })

  it("falls back for an entry that exists but is empty", () => {
    expect(translate("Cancel", "de", undefined, CAT)).toBe("Cancel")
  })

  it("falls back for a string nobody has catalogued at all", () => {
    expect(translate("Something nobody wrote down", "de", undefined, CAT)).toBe(
      "Something nobody wrote down"
    )
  })

  it("does not consult the catalogue for English at all", () => {
    // English IS the key, so the English path is a pure passthrough. Proven with
    // a catalogue that would give a different answer if it were consulted.
    expect(translate("Save", "en", undefined, { Save: { de: "WRONG" } })).toBe("Save")
  })
})

describe("interpolation", () => {
  it("fills named holes", () => {
    expect(fill("Invited {email}.", { email: "a@b.com" })).toBe("Invited a@b.com.")
  })

  it("leaves a hole it has no value for VISIBLE rather than blank", () => {
    // A visible {email} tells somebody what went wrong. A silent gap does not,
    // and reads as a typo in the copy.
    expect(fill("Invited {email}.", { other: "x" })).toBe("Invited {email}.")
  })

  it("interpolates through a translation", () => {
    const CAT: Catalogue = { "Invited {email}.": { de: "{email} wurde eingeladen." } }
    expect(translate("Invited {email}.", "de", { email: "a@b.com" }, CAT)).toBe(
      "a@b.com wurde eingeladen."
    )
  })

  it("a bound translator behaves the same as the free function", () => {
    const CAT: Catalogue = { Save: { de: "Speichern" } }
    expect(translator("de", CAT)("Save")).toBe(translate("Save", "de", undefined, CAT))
  })
})

describe("the seed wins on SCREEN, not only inside the generator", () => {
  // `shared/i18n-seed.ts` has always said "THE SEED ALWAYS WINS", and until
  // 2026-08-19 it won in exactly one place: inside `scripts/i18n-translate.mjs`.
  // The app imported the GENERATED catalogue and nothing else, so a word written
  // by hand did not reach a screen until somebody ran the generator — and the
  // generator spends the owner's own model key. The single documented way to
  // correct a translation went through the single thing nobody may do, and only
  // a comment said otherwise. `SPOKEN` is the seam that makes the claim true;
  // this is what stops it being a comment again.

  it("takes the hand-written word over the machine's, for the same key", () => {
    const machine: Catalogue = { Issue: { de: "Ausgabe" } }
    const hand: Catalogue = { Issue: { de: "Problem" } }
    expect(translate("Issue", "de", undefined, overlay(machine, hand))).toBe("Problem")
  })

  it("decides PER LANGUAGE, so the seed's German keeps the machine's Catalan", () => {
    // The seed is partial PER ENTRY on purpose: a word is hand-written in the
    // language somebody actually checked it in, and the machine answered the
    // rest. Overwriting the whole ENTRY would throw those away every time
    // somebody corrected one word.
    const machine: Catalogue = { Issue: { de: "Ausgabe", ca: "Sortida" } }
    const hand: Catalogue = { Issue: { de: "Problem" } }
    const spoken = overlay(machine, hand)
    expect(translate("Issue", "de", undefined, spoken)).toBe("Problem")
    expect(translate("Issue", "ca", undefined, spoken)).toBe("Sortida")
  })

  it("copies rather than mutates, so neither file is corrupted at import", () => {
    // The seam runs once, at module load, over the two real exports. An overlay
    // that wrote INTO its argument would edit CATALOGUE in memory, and every
    // later reader would see a file that does not exist on disk.
    const machine: Catalogue = { Issue: { de: "Ausgabe", ca: "Sortida" } }
    const hand: Catalogue = { Issue: { de: "Problem" } }
    overlay(machine, hand)
    expect(machine.Issue).toEqual({ de: "Ausgabe", ca: "Sortida" })
    expect(hand.Issue).toEqual({ de: "Problem" })
  })

  it("is what a call with no catalogue reads — every seeded word is the word on screen", () => {
    for (const [english, entry] of Object.entries(SEED))
      for (const [lang, word] of Object.entries(entry))
        expect(translate(english, lang as Language), `${english} [${lang}]`).toBe(word)
  })

  it("and that is not true by accident: the seed answers where the catalogue is silent", () => {
    // The assertion above would still pass with the seam torn out, IF every
    // seeded string also sat in the generated catalogue saying the same thing.
    // These pairs are the ones only the seed can answer — hand-written, never
    // generated — so they are the live proof that the runtime reads it. Rip
    // `SPOKEN` out and every one of them renders English instead.
    const seedOnly = Object.entries(SEED).flatMap(([english, entry]) =>
      Object.keys(entry)
        .filter((lang) => CATALOGUE[english]?.[lang as Translated] === undefined)
        .map((lang) => [english, lang as Translated] as const)
    )
    expect(seedOnly.length, "nothing is seeded that the catalogue cannot already say").toBeGreaterThan(0)
    for (const [english, lang] of seedOnly)
      expect(translate(english, lang), `${english} [${lang}]`).toBe(SEED[english][lang])

    // "FELL BACK TO ENGLISH" IS ONLY ASKED WHERE IT CAN BE ANSWERED. Some
    // languages KEEP the English word — the text-size steps are "Compact" in
    // French and "Normal" in German, Spanish, Catalan, Indonesian and Javanese
    // — and for those pairs a correct answer and a fallback are the same three
    // syllables, so the two are indistinguishable by construction and no
    // assertion can tell them apart. Demanding it anyway is a green test
    // asserting the wrong intent, which is the thing this file exists to avoid:
    // it would fail on a correct translation and teach the next person to
    // mistranslate a word to keep the build green. Every pair whose seeded word
    // DOES differ from its English still carries the proof, and the set is
    // asserted non-empty so the clause cannot quietly empty itself.
    const distinguishable = seedOnly.filter(([english, lang]) => SEED[english][lang] !== english)
    expect(
      distinguishable.length,
      "every seed-only word now happens to equal its English, so nothing here proves the seam any more"
    ).toBeGreaterThan(0)
    for (const [english, lang] of distinguishable)
      expect(translate(english, lang), `${english} [${lang}] fell back to English`).not.toBe(english)
  })

  it("SPOKEN is the default both readers use", () => {
    // Named rather than implied: the switcher's percentage counts what the app
    // can actually say, which includes every word written here by hand.
    expect(coverage()).toEqual(coverage(SPOKEN))
    expect(translate("Issue", "de")).toBe(translate("Issue", "de", undefined, SPOKEN))
  })
})

describe("coverage, as the switcher reports it", () => {
  it("is a fraction of the catalogue, per language", () => {
    const CAT: Catalogue = {
      a: { de: "A", es: "A", ca: "A" },
      b: { de: "B" },
      c: {},
      d: { de: "D", es: "" },
    }
    const c = coverage(CAT)
    expect(c.de).toBeCloseTo(3 / 4)
    expect(c.es).toBeCloseTo(1 / 4) // the "" does not count as translated
    expect(c.ca).toBeCloseTo(1 / 4)
  })

  it("an empty catalogue is zero rather than a division by nothing", () => {
    const empty = coverage({})
    // Every language that needs writing reports zero, and English — which IS the
    // key and therefore always complete — is not in the report at all.
    for (const l of LANGUAGES) {
      if (l.code === DEFAULT_LANGUAGE) expect(l.code in empty, l.code).toBe(false)
      else expect(empty[l.code as Exclude<Language, "en">], l.code).toBe(0)
    }
    expect(Object.keys(empty)).toHaveLength(LANGUAGES.length - 1)
  })
})

describe("what the assistant is told", () => {
  it("English is the base prompt, byte for byte", () => {
    // Every agent suite reads SYSTEM. If this drifts, they are all testing a
    // prompt the product does not send.
    expect(systemFor(null)).toBe(SYSTEM)
    expect(systemFor("en")).toBe(SYSTEM)
    expect(systemFor("not-a-language")).toBe(SYSTEM)
  })

  it("another language ADDS to the prompt rather than replacing it", () => {
    const de = systemFor("de")
    expect(de.startsWith(SYSTEM)).toBe(true)
    expect(de.length).toBeGreaterThan(SYSTEM.length)
  })

  it("names the language in words the model will recognise", () => {
    expect(systemFor("de")).toContain("German")
    expect(systemFor("es")).toContain("Spanish")
    expect(systemFor("ca")).toContain("Catalan")
  })

  it("FORBIDS translating the team's own data, and says why", () => {
    // The expensive failure: a translated argument matches no record and the
    // user is told there are none. The prompt must say so explicitly, not imply
    // it — so this asserts the substance, not one phrasing.
    const de = systemFor("de")
    expect(de).toMatch(/NEVER translate the team's own data/i)
    expect(de).toMatch(/tool/i)
    expect(de).toMatch(/exactly/i)
  })
})

describe("the door's write (R17: idempotent)", () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(":memory:")
    db.exec(migration("0001_core_auth.sql"))
    db.exec(migration("0002_teams.sql"))
    db.exec(migration("0024_user_language.sql"))
    db.exec(
      `INSERT INTO users (id, email, created_at, updated_at) VALUES ('u1', 'a@b.com', 'now', 'now')`
    )
  })

  /** Exactly the statement setLanguage runs (workers/auth/src/lib/profile.ts). */
  async function setLang(next: string): Promise<number> {
    const res = await d1(db)
      .prepare(
        "UPDATE users SET language = ?, updated_at = ? WHERE id = ? AND COALESCE(language, '') <> ?"
      )
      .bind(next, "now", "u1", next)
      .run()
    return res.meta.changes ?? 0
  }

  it("a new column starts null, which reads as English", () => {
    const row = db.prepare("SELECT language FROM users WHERE id = 'u1'").get() as {
      language: string | null
    }
    expect(row.language).toBe(null)
    expect(toLanguage(row.language)).toBe("en")
  })

  it("the first choice moves one row", async () => {
    expect(await setLang("de")).toBe(1)
  })

  it("choosing the SAME language again moves zero rows, so nothing is published", async () => {
    // R17. A switcher somebody taps twice must be silent the second time —
    // otherwise every double-tap pings every one of that person's devices.
    await setLang("de")
    expect(await setLang("de")).toBe(0)
  })

  it("choosing a different one moves a row again", async () => {
    await setLang("de")
    expect(await setLang("es")).toBe(1)
  })

  it("English is a real CHOICE, distinguishable from never having chosen", async () => {
    // The null stays available for a future browser-language guess: only people
    // who never chose may be guessed at.
    expect(await setLang("en")).toBe(1)
    const row = db.prepare("SELECT language FROM users WHERE id = 'u1'").get() as {
      language: string | null
    }
    expect(row.language).toBe("en")
  })
})
