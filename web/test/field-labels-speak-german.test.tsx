// R33, PROVED BY RENDERING — a form field label reaches the screen in German.
//
// Every other assertion about this reads source off disk, which is the right
// shape for a law and the wrong shape for the one question a person actually
// asked: does the label on the form say Vorname? Source-reading could tell us
// the seam is imported and the catalogue has the word, and both were true of a
// build that put "First name" in front of every German reader for months — the
// call site simply never asked. So this one is a real React render, in jsdom,
// through the real provider and the real catalogue, reading the real DOM.
//
// PROFILE, deliberately: `firstField` and `lastField` are module-level constants
// (`{ ...defaultFieldConfig, label: "First name" }`), which is the exact shape
// that could not be wrapped — `t` is a hook and there is no component around a
// module constant. If these two labels are German, the 138 like them are too.
//
// NOTHING IS STUBBED except the network, which this form only touches on submit.
// The words come from `shared/i18n-catalogue.ts` as it ships.

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { translate } from "@shared/i18n"
import { LanguageProvider } from "@shared/web/language"

import { ProfileDialog } from "@/components/profile-dialog"

afterEach(cleanup)

const inGerman = (children: React.ReactNode) => (
  // `value` is `SessionUser.language` — exactly what the shell passes.
  <LanguageProvider value="de">{children}</LanguageProvider>
)

describe("R33 · a form field label renders in the reader's language", () => {
  it("the profile form says Vorname and Nachname, not First name and Last name", () => {
    render(
      inGerman(
        <ProfileDialog
          open
          onOpenChange={() => {}}
          user={{ id: "u1", email: "a@b.c", firstName: "", lastName: "", language: "de" } as never}
          onSaved={async () => {}}
        />
      )
    )

    // The catalogue's own words, not words typed into this test — so a re-run of
    // the translator changes both sides at once and this stays a test of the
    // WIRING rather than of the German.
    expect(screen.getByText(translate("First name", "de"))).toBeTruthy()
    expect(screen.getByText(translate("Last name", "de"))).toBeTruthy()
    expect(translate("First name", "de"), "the catalogue must actually hold German here").toBe(
      "Vorname"
    )

    // …and the English is GONE, which is the half that was failing. A label that
    // renders both would pass a `getByText` on the German and still be the bug.
    expect(screen.queryByText("First name")).toBeNull()
    expect(screen.queryByText("Last name")).toBeNull()
  })

  it("English is still English — the seam translates, it does not mangle", () => {
    render(
      <LanguageProvider value="en">
        <ProfileDialog
          open
          onOpenChange={() => {}}
          user={{ id: "u1", email: "a@b.c", firstName: "", lastName: "", language: "en" } as never}
          onSaved={async () => {}}
        />
      </LanguageProvider>
    )
    expect(screen.getByText("First name")).toBeTruthy()
  })
})
