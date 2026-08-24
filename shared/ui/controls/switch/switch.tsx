/* ============================================================================
   Switch — the immediate on/off (2 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-switch`,
     `.kw-switch:checked`, `.kw-switch:checked::after`
     (chapter 10: track 46×26 at r999; on = inverse).
   design-mothership/specimens/kwapso-ui.css → `.kw-switch` / `.kw-switch::after`
     for the off track (`--surface-quiet`), the knob (1.25rem, page-coloured,
     inset 0.1875rem) and the travel.

   THE ONE CONFLICT THIS FILE RULES ON
   Chapter 10 draws the ON track INVERSE (`--surface-inverse`). kwapso-ui.css
   ships it MANGO (`--accent`). Chapter 10 is built here, matching `checkbox`,
   `radio-group` and `toggle-group` so the family is one drawing. Both sides
   named in GAPS-B.md SEL-1.

   THE SECOND CONFLICT, ALREADY RULED BY THE KIT'S OWN FRAGMENT
   Chapter 10 states the track 46 wide; kwapso-ui.css draws 44. t10-gaps.md
   T10-5 keeps the stated 2.875rem and recomputes the travel to 1.25rem
   (2.875 − 1.25 − 2 × 0.1875). That arithmetic is reproduced here exactly and
   is not re-derived; T10-6 keeps the knob's 0.1875rem inset as an optical
   value rather than snapping it to the scale.

   THE LAW THIS FILE OBEYS
   · The track is a pill. This is the one selection control that is not a
     22 mark: it is a travelling knob in a channel, and the channel has always
     been r999 in both specimens.
   · Focus is ONE global rule (tokens.css §8). No ring here.
   · Disabled is a fill and an ink, never an opacity.
   · The travel MIRRORS. A switch that slides the same physical way in Arabic
     as in English is telling the reader that "on" is towards the end of an
     English sentence, which is not what it means.

   WHY `enabled:` / `disabled:`
   The same reason as `checkbox`: Radix puts the native `disabled` attribute
   on the trigger, `:enabled` and `:disabled` are mutually exclusive, and
   exactly one class set can match. No same-specificity race, and a parent
   that disables the control without this file's props knowing still works.

   RENDERING CONTEXT
   `"use client"`. `@radix-ui/react-switch` holds state and attaches handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "../../lib/utils";

const switchClasses = [
  "inline-flex shrink-0 items-center",

  // 46 × 26 at the pill radius, with the knob held 3 inside. 46, 26 and 3 are
  // all off the ruling-28 scale; kept as the literals the kit draws (T10-5,
  // T10-6), in rem so they still scale with the text-size control.
  "w-[2.875rem] h-[1.625rem] rounded-pill p-[0.1875rem]",

  // Off: the quiet well. No border — a switch is a channel, not a field.
  "bg-surface-quiet border-0",

  "cursor-pointer",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",

  /* ---- On. Chapter 10's inverse, not kwapso-ui.css's mango. ------------- */
  "enabled:data-[state=checked]:bg-surface-inverse",

  /* ---- Disabled. A fill, and the knob below takes the ink. -------------- */
  "disabled:cursor-not-allowed disabled:bg-hair-faint",
];

const switchThumbClasses = [
  // The kit's 20 disc, page-coloured, so it reads as a piece of paper sitting
  // in the channel rather than as a second fill.
  "block size-[1.25rem] rounded-pill bg-background pointer-events-none",

  // Travel = track − knob − both insets = 2.875 − 1.25 − 0.375 = 1.25rem.
  // `translate-x` compiles to the `translate` property in Tailwind v4, which
  // is why the transition names it rather than `transform`.
  "translate-x-0 data-[state=checked]:translate-x-[1.25rem]",
  // …and mirrors, so "on" is always towards the reading end.
  "rtl:data-[state=checked]:-translate-x-[1.25rem]",

  "transition-[translate,background-color]",
  "duration-[var(--duration-colour)] ease-kwapso",

  // A dead switch: the knob drops to the quiet tone so it is still visible on
  // the faint track but no longer reads as paper you can push. Derived — the
  // kit draws no disabled switch (GAPS-B.md SEL-8).
  "group-disabled:bg-surface-quiet",
];

export type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

/**
 * The system's switch. It commits immediately — there is no Save beside it.
 * Where a change needs confirming, the control is a `Checkbox` in a form.
 *
 * TEN STATES
 *  1. default        — `--surface-quiet` channel, page-coloured knob at the
 *                      reading-start end.
 *  2. hover          — NOT drawn. The kit gives the switch no hover, and
 *                      every candidate was an invention: `--hair-strong` is a
 *                      line colour, `--accent` is the row wash, mango is the
 *                      brand fill. Nothing was added. GAPS-B.md SEL-3.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the track at its own
 *                      pill radius.
 *  4. active/pressed — does not apply. The press IS the travel, and the
 *                      travel is the animation; a second pressed skin would
 *                      compete with the thing the control exists to show.
 *  5. disabled       — `--hair-faint` channel, `--surface-quiet` knob,
 *                      not-allowed. A fill and an ink, never an opacity.
 *  6. loading        — does not apply, and deliberately. A switch that has
 *                      not loaded must not render as off — off is an answer.
 *                      The row shows a `Skeleton` until the value exists
 *                      (GAPS-B.md SEL-5). A switch whose change is in flight
 *                      is `disabled` until the server answers, which is the
 *                      caller's call and needs nothing from this file.
 *  7. empty          — does not apply. Off is a value.
 *  8. error          — does not apply. A switch cannot fail validation: both
 *                      of its values are legal. A rejected change surfaces as
 *                      a toast, not as a poppy channel.
 *  9. selected       — this IS the on state: `--surface-inverse` channel.
 *                      Chapter 10 over kwapso-ui.css (SEL-1).
 * 10. read-only      — does not apply. HTML has no read-only switch; a switch
 *                      the user may not move is `disabled`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. 46 × 26 at every width. It is under
 *  the 44 touch row on its own, which is why the kit draws it inside a
 *  `.kw-choice` row where the label carries the target (GAPS-B.md SEL-6).
 *
 * RTL — handled, not inherited. The knob's travel is written twice, once for
 * each direction, so "on" always lies towards the reading end. This is the
 * one component in the batch where RTL needed a rule rather than a logical
 * property, because the movement is a transform and transforms do not mirror
 * on their own.
 */
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    data-slot="switch"
    // `group` so the knob can read the track's disabled attribute; `peer` so
    // a `Label` that follows the switch greys with it.
    className={cn("group peer", switchClasses, className)}
    {...props}
  >
    <SwitchPrimitive.Thumb className={cn(switchThumbClasses)} />
  </SwitchPrimitive.Root>
));

Switch.displayName = "Switch";

export { Switch, switchClasses };
