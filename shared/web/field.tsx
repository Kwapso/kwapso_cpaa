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

import { Field as KitField } from "@shared/ui/components/field/field"
import { type FieldConfig } from "@shared/web/screen-engine/config"
import { useIsVisible } from "@shared/web/screen-engine/visibility"

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
 * An empty label is left empty: the kit Field reads it as "no label at all" and
 * skips the label row, and "" is not a sentence anybody translates. */
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

/** What shape the wrapped control is. Kept from the old library contract so no
 * call site moves; the kit draws required/error itself, so `ringed` and `shape`
 * are accepted and no longer draw anything (the old gold required-ring was the
 * old system's; the kit has its own required marking). */
export type FieldShape = "input" | "pill" | "group"

/** The kit `Field`, spoken to in the OLD library's contract.
 *
 * The old library's Field was config-driven (`config`, `htmlFor`, `error`,
 * `ringed`, `shape`); the kit's takes words as props (`label`, `help`,
 * `error`, `required`). ~140 call sites across both doors write the old
 * contract, so this seam keeps it and translates — the same decision as the
 * screen engine's TabsView. The translation to the reader's language happens
 * here too, which is this file's original job (R33).
 *
 * `htmlFor` becomes the kit Field's `id`: the kit seeds its control id from it
 * and clones the id onto a single-element child, so label/input association
 * holds for every existing call site without moving any of them. */
export function Field({
  config,
  htmlFor,
  error,
  // Tolerated, no longer drawn — the kit owns required/error presentation.
  ringed: _ringed = true,
  shape: _shape = "input",
  className,
  children,
}: {
  config: FieldConfig
  /** id of the input inside — wires the label's association. */
  htmlFor?: string
  /** validation message to show (overrides helpText while present). */
  error?: string
  ringed?: boolean
  shape?: FieldShape
  className?: string
  children: React.ReactNode
}) {
  const t = useT()
  // Hooks before any early return so hook order stays stable.
  const visible = useIsVisible(config)
  const translated = React.useMemo(() => translateFieldConfig(config, t), [config, t])
  if (!visible) return null

  return (
    <KitField
      id={htmlFor}
      label={translated.label || undefined}
      help={translated.helpText || undefined}
      error={error || undefined}
      required={config.required}
      disabled={config.disabled}
      className={className}
    >
      {children}
    </KitField>
  )
}
