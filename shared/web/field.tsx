"use client"

// THE FIELD, IN THE READER'S LANGUAGE — one seam, every form, both front doors.
//
// WHAT THIS IS FOR. A field's words are declared where the field is declared:
//
//   const nameField = { ...defaultFieldConfig, label: "Team name", required: true }
//
// …at MODULE scope, because a config is data and every form in this app writes it
// once beside the form rather than rebuilding it on each render. `t` is a hook
// (`useT`), so it cannot be called there — which is exactly why not one of the
// ~140 field labels in this app was ever wrapped, and why the library `Field`
// (which renders `config.label` verbatim, correctly: it renders what it is given)
// put every one of them on screen in English in all 28 other languages. The
// catalogue had them. The screens asked for none of them.
//
// SO THE TRANSLATION HAPPENS ON THE WAY TO THE SCREEN, not at the declaration.
// That is the same ruling `translateRecipe` makes for the screen recipes
// (web/lib/screens.ts) and for the same three reasons: the English stays where a
// developer typed it, because ENGLISH IS THE KEY (shared/i18n.ts) and that is
// what the extractor reads and what the catalogue is keyed by; the config stays
// data, so a test and a team override still read the English; and it is ONE
// function instead of a hundred and forty call sites, so the form somebody
// writes next month is translated the day it is written without anybody
// remembering to do anything.
//
// WHY A COMPONENT RATHER THAN A `translateFieldConfig(cfg, t)` HELPER. A helper
// would have to be CALLED, at every `<Field config={…}>` in the app, by somebody
// who remembered — which is the defect, restated. A wrapper moves the decision
// from "remember to translate" to "import Field", and importing Field is not
// something a person writing a form can forget to do. It is also why the props
// are the library's own, unchanged: a call site swaps ONE import line and does
// not otherwise move, so the adoption diff is reviewable by somebody who does
// not know this file exists.
//
// AND THE IMPORT IS THE ENFORCED PART. `web/test/wrapped-strings.test.ts` (R33)
// refuses a direct import of the library `Field` from either front door, so the
// seam cannot be walked around by accident — which is what makes it sound to
// treat a `label:` on a field config as already-translated rather than as an
// unwrapped string.
//
// NOT A FORK OF THE LIBRARY. It renders the library's `Field` and adds nothing
// to it: no styling, no layout, no behaviour. The library is right to render the
// words it is handed; deciding WHICH words is the host's job, and this is where
// the host does it. (UI-GAPS #25 records the one part that genuinely is the
// library's: `validateField` composes its own English error messages.)

import * as React from "react"

import { Field as LibraryField } from "@kwapso/ui/registry/primitives/field/field"
import { type FieldConfig } from "@kwapso/ui/lib/config"

import { useT } from "./language"

/** A field config with its WORDS put through the reader's language, and nothing
 * else touched.
 *
 * The label and the help text are the only two strings on a `FieldConfig` a
 * person reads. Everything else is machinery — `required`, `disabled`, the
 * validation bounds, the visibility rules — and `validation.pattern` in
 * particular is a REGULAR EXPRESSION, so translating it would silently break the
 * form rather than reword it. Same line `translateRecipe` draws when it
 * translates `field.label` and leaves `field.column` alone.
 *
 * An empty label is left empty: `Field` reads it as "no label at all" and skips
 * the whole `<Label>`, and "" is not a sentence anybody translates. */
export function translateFieldConfig(
  config: FieldConfig,
  t: (english: string) => string
): FieldConfig {
  return {
    ...config,
    label: config.label ? t(config.label) : config.label,
    helpText: config.helpText ? t(config.helpText) : config.helpText,
  }
}

/** The library `Field`, with its config's words in the reader's language.
 *
 * Every prop is the library's own and is passed straight through, so this is a
 * drop-in for `@kwapso/ui/registry/primitives/field/field` — the ONE import line
 * is the whole difference at a call site.
 *
 * Memoised on the config and the language so the object identity only changes
 * when one of those does; a form that re-renders on every keystroke does not
 * hand its children a new config each time. */
export function Field(props: React.ComponentProps<typeof LibraryField>) {
  const t = useT()
  const { config, ...rest } = props
  const translated = React.useMemo(() => translateFieldConfig(config, t), [config, t])
  return <LibraryField config={translated} {...rest} />
}

// `fieldProps` is pure machinery — it maps a config's validation onto native
// HTML attributes and reads no words at all — so it is re-exported unchanged
// rather than wrapped. A call site that needs both gets both from one import.
export { fieldProps } from "@kwapso/ui/registry/primitives/field/field"
