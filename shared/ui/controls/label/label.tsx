/* ============================================================================
   Label — the field label and the choice-row label (4 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `.kw-field__label`
     (caption step · weight 500 · `--ink-primary`).
   design-mothership/specimens/_fragments/t10.css → `.kw-choice` /
     `.kw-choice--locked .kw-choice__label` (the mark-to-label gap is
     `--space-2h`; a locked row's label is `--ink-disabled`).

   THE LAW THIS FILE OBEYS
   · A label is the caption step (13) at weight 500 on primary ink. It is not
     the 14 control step — the kit deliberately sets the label one step below
     the value it names.
   · Disabled is an ink, never an opacity. shadcn fades a disabled label with
     a peer-driven opacity utility; that is a rejection here. The kit's own
     locked row uses `--ink-disabled`, and that is what is written.
   · Focus is ONE global rule (tokens.css §8). A label is not focusable and
     defines nothing.
   · No radius, no fill, no border. A label is type.

   RENDERING CONTEXT
   `"use client"`. `@radix-ui/react-label` attaches an `onMouseDown` handler
   during its own render (it suppresses text selection on a double click), so
   the module is a client boundary whether or not the call site passes a
   handler.
   ========================================================================= */

"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "../../lib/utils";

const labelClasses = [
  // A row, so a label that wraps a mark is the kit's `.kw-choice`: mark and
  // words on one baseline, `--space-2h` (10) between them. With one child the
  // gap costs nothing.
  "inline-flex items-center gap-[var(--space-2h)]",

  // caption · 13 / 500 — `text-caption` is a real utility (tokens.css §10
  // registers the kwapso-only step), so size, leading and tracking arrive in
  // one class. The weight name is not bridged, hence the token.
  "text-caption font-[var(--font-weight-medium)] text-foreground",

  // A label names the control beside it; clicking it moves focus there.
  "cursor-pointer select-none",

  // The control this label names is disabled. Two spellings, because a call
  // site may put the label before the control (`peer`) or wrap both in a
  // container that carries Radix's `data-disabled` (`group`).
  "peer-disabled:cursor-not-allowed peer-disabled:text-ink-disabled",
  "group-data-[disabled]:cursor-not-allowed group-data-[disabled]:text-ink-disabled",

  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
];

export type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>;

/**
 * The system's form label.
 *
 * TEN STATES
 *  1. default        — caption step, weight 500, primary ink.
 *  2. hover          — does not apply. A label is not a control; the kit
 *                      draws no hover on `.kw-field__label`, and moving the
 *                      words under the cursor would make the field it names
 *                      harder to hit, not easier.
 *  3. focus-visible  — does not apply. A label is not focusable; the click
 *                      hands focus to the control. tokens.css §8 rings that
 *                      control, and this file defines nothing.
 *  4. active/pressed — does not apply. Pressing a label presses the control.
 *  5. disabled       — `--ink-disabled` via `peer-disabled` / `group-data-
 *                      [disabled]`, matching the kit's locked choice row. A
 *                      fill would invent a box a label does not have.
 *  6. loading        — does not apply. A label's text is known before the
 *                      value it names; a field that is still loading takes
 *                      the read-only skin itself (`input`, `textarea`).
 *  7. empty          — does not apply. A label with no children renders an
 *                      empty inline box, which is what the caller asked for.
 *                      A label that exists to be empty should not exist.
 *  8. error          — NOT drawn. Chapter 9 is explicit that error text is
 *                      "poppy-free" — the message beside the field is ink and
 *                      the poppy lives on the field's own border. Colouring
 *                      the label would put poppy back. See GAPS-B.md LBL-1.
 *  9. selected       — does not apply. A label is never selected.
 * 10. read-only      — does not apply. Read-only is a property of the value,
 *                      and the kit does not restyle the label of a read-only
 *                      field.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. One type step at every width. The
 *  chapter's one responsive move is the FORM's (one column below 48rem, two
 *  above, never three) and belongs to the `form` shell.
 *
 * RTL — safe. `gap` orders the row, so a label wrapping a mark puts the mark
 * on the reading-start side in Arabic, Urdu and Persian without a rule.
 * `htmlFor` carries no direction.
 */
const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    data-slot="label"
    className={cn(labelClasses, className)}
    {...props}
  />
));

Label.displayName = "Label";

export { Label, labelClasses };
