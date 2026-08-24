// THE TWO LANGUAGE SWITCHERS — one shape rule and one sentence rule.
//
// THE SHAPE. Twenty-nine languages arrived as twenty-nine buttons, wrapping to
// six lines of flags across the middle of Settings. The control is a Select now,
// and it is the LIBRARY's Select (R3: nothing in this app hand-rolls a menu, and
// a row of buttons that behaves like one is the shape R3 was written about). The
// portal's compact twin is the library DropdownMenu for the same reason.
//
// THE SENTENCE, which is the one that was a real bug. A switch is OPTIMISTIC:
// `setLang(next)` re-renders the app before the save comes back. But `t` was
// bound when the component rendered, so a confirmation written through it says
// "Language changed." in the language they just LEFT — a small thing that tells
// somebody the feature is a veneer. And the FAILURE has to go the other way: a
// switch to Catalan that did not happen must be reported in the language they
// can still read, because telling somebody in Catalan that Catalan failed to
// load is a joke at their expense. So the success is composed in `next` and the
// refusal in `previous`, and both are asserted here rather than left as a
// comment that was true once.
//
// Read off disk, this repo's house style for a rule about how a file is written.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { LANGUAGES } from "@shared/i18n"
import { LanguageProvider } from "@shared/web/language"
import { LanguageSection } from "@shared/web/language-section"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const SECTION = "shared/web/language-section.tsx"
const MENU = "shared/web/language-menu.tsx"

describe("the switcher is a dropdown, from the library (R3)", () => {
  it("Settings offers a Select, not a row of buttons", () => {
    const src = read(SECTION)
    expect(src, "the switcher must use the library Select").toContain(
      "controls/select/select"
    )
    expect(
      src.includes("primitives/button/button"),
      "a Button import here is the pill row growing back — twenty-nine of them is what this replaced"
    ).toBe(false)
  })

  it("the portal's compact twin is the library DropdownMenu", () => {
    expect(read(MENU)).toContain("controls/dropdown-menu/dropdown-menu")
  })

  it("Settings still says how complete a part-written language is", () => {
    // The honest half of shipping a machine-filled catalogue. A dropdown makes
    // it easy to lose — there is less room than a button had — so the sentence
    // and the per-row figure are both named here. `coverage()` is the engine's
    // one seam for the number; a component computing its own would be a second
    // answer to "how much of this can I read".
    const src = read(SECTION)
    expect(src, "the sentence under the control").toContain("{percent}% translated")
    expect(src, "the number comes from the engine's own seam").toContain("coverage()")
  })

  for (const [name, path] of [
    ["Settings", SECTION],
    ["the portal header", MENU],
  ] as const) {
    it(`${name} offers every language, derived from LANGUAGES`, () => {
      // Derived, never hand-listed: adding a language to the engine's one array
      // has to be the only edit, which is the promise shared/i18n.ts makes.
      const src = read(path)
      expect(src, `${path} must map LANGUAGES`).toMatch(/LANGUAGES\.map\(/)
      for (const l of ["de", "es", "ca"])
        expect(
          LANGUAGES.some((row) => row.code === l),
          "the agency's own languages are still in the engine's list"
        ).toBe(true)
    })
  }
})

describe("the confirmation speaks the language that was just chosen", () => {
  for (const path of [SECTION, MENU]) {
    it(`${path} confirms in the NEW language and refuses in the old one`, () => {
      const src = read(path)
      // `t(...)` here would be the bug: `t` is bound to the language the render
      // started in, which is the one they are leaving.
      expect(src, "the success toast must be composed in `next`").toContain(
        'toast.success(translate("Language changed.", next))'
      )
      expect(src, "the failure toast must be composed in `previous`").toContain(
        'toast.error(translate("That didn\'t save. Try again.", previous))'
      )
    })
  }

  it("both sentences are in the catalogue, in the agency's own languages", async () => {
    // These two live in shared/web/, which the extractor does not walk (it reads
    // the two front doors) — so they are SEED entries, and a seed entry that
    // quietly disappeared would put the confirmation back into English for
    // everybody. Asserted against the seed rather than the generated catalogue:
    // the seed is the half a person maintains.
    const { SEED } = await import("@shared/i18n-seed")
    for (const sentence of ["Language changed.", "That didn't save. Try again."])
      for (const lang of ["de", "es", "ca"] as const)
        expect(SEED[sentence]?.[lang], `${sentence} needs its ${lang}`).toBeTruthy()
  })
})

// AND THE SAME THING, RENDERED. The check above reads the file; this one runs
// it, because "imports Select" and "puts one control on the screen" are two
// different claims and the second is the one the owner asked for.
describe("what Settings actually paints", () => {
  afterEach(cleanup)

  const paint = (lang: string) =>
    render(
      <LanguageProvider value={lang}>
        <LanguageSection save={async () => {}} />
      </LanguageProvider>
    )

  it("is ONE control, not twenty-nine", () => {
    paint("en")
    expect(screen.getAllByRole("combobox"), "one Select").toHaveLength(1)
    // The pill row put a button on the screen for every language in the engine.
    // Anything close to that number here is it growing back.
    expect(
      screen.queryAllByRole("button").length,
      `the switcher must not paint a control per language (${LANGUAGES.length} of them)`
    ).toBeLessThan(LANGUAGES.length)
  })

  it("names the language in its own words AND in English", () => {
    paint("de")
    const trigger = screen.getByRole("combobox")
    expect(trigger.textContent, "the endonym, for somebody scanning for their own language")
      .toContain("Deutsch")
    expect(trigger.textContent, "and the English name, for somebody who cannot read the script")
      .toContain("German")
  })

  it("says how complete a part-written language is, and stays quiet about English", () => {
    // The percentage is the honest half of shipping a machine-filled catalogue:
    // somebody choosing a language is told what to expect rather than finding
    // out a screen later. English IS the key, so it is complete by definition and
    // saying so would be noise.
    paint("en")
    expect(screen.queryByText(/% translated/), "nothing to report about English").toBeNull()
  })
})
