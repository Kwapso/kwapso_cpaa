/* ============================================================================
   Spacer — a measured hole (0 direct call sites).

   DESIGN SOURCE
   None. The kit draws no spacer, because a static CSS kit expresses a gap as
   `gap` or as a margin on the thing that needs it. What the kit DOES settle
   is every value a spacer may take: the eleven-step ladder plus its four
   half-steps in tokens.css §4, and chapter 5's sentence

       "24–32px card inset, 64–128px between sections."

   So the component is a hole and the ladder is the kit's. Logged as
   GAPS-F SPC-1.

   THE LAW THIS FILE OBEYS
   · No px, and no arbitrary length either. A spacer may only be a step on the
     kwapso ladder — that is the whole reason it exists rather than a
     a hand-rolled arbitrary height at a call site.
   · LOGICAL AXES ONLY, and here that is not a formality. A spacer with a
     physical axis is the single easiest way to break an RTL layout, so the
     two axis values are named `block` and `inline` after the CSS axes and
     there is no `horizontal` / `vertical` in the API at all. The inline
     spacer sets `width`, which in a flex row is already direction-neutral.
   · It draws nothing: no fill, no radius, no stroke. It is `aria-hidden`, so
     a screen reader never meets it.
   · Focus is ONE global rule (tokens.css §8) and a spacer is not focusable.

   RENDERING CONTEXT
   No `"use client"`. It has no state, no hook and no handler.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   The size sets a custom property rather than a height or a width directly,
   so the axis variant can consume it once instead of the cva having to emit
   fifteen sizes twice over.
   ------------------------------------------------------------------------- */
const spacerVariants = cva(
  [
    // A hole is never squeezed by a flex parent; that would make it a
    // suggestion rather than a measure.
    "shrink-0",
  ],
  {
    variants: {
      /** The kwapso ladder, tokens.css §4. Every step, and nothing else. */
      size: {
        "1": "[--spacer-size:var(--space-1)]",
        "1h": "[--spacer-size:var(--space-1h)]",
        "2": "[--spacer-size:var(--space-2)]",
        "2h": "[--spacer-size:var(--space-2h)]",
        "3": "[--spacer-size:var(--space-3)]",
        "3h": "[--spacer-size:var(--space-3h)]",
        "4": "[--spacer-size:var(--space-4)]",
        "4h": "[--spacer-size:var(--space-4h)]",
        "5": "[--spacer-size:var(--space-5)]",
        "6": "[--spacer-size:var(--space-6)]",
        "7": "[--spacer-size:var(--space-7)]",
        "8": "[--spacer-size:var(--space-8)]",
        "9": "[--spacer-size:var(--space-9)]",
        "10": "[--spacer-size:var(--space-10)]",
        "11": "[--spacer-size:var(--space-11)]",
      },
      axis: {
        /** Down the page. `block-size` is the axis name, hence the value. */
        block: "block h-[var(--spacer-size)] w-full",
        /** Along the line. Mirrors with the document; nothing to write. */
        inline: "inline-block h-auto w-[var(--spacer-size)] self-stretch",
      },
      /**
       * The flexible hole: eat the leftover space instead of measuring one.
       * This is the RTL-safe replacement for the `margin-left: auto` that
       * pushes a control to the end of a row — the kit writes that physically
       * in three places and every one of them is wrong under `dir="rtl"`.
       * `grow` wins over `size`, which is why it is emitted last.
       */
      grow: {
        true: "flex-1 basis-0",
        false: "",
      },
    },
    /* Emitted after the variants, so tailwind-merge lets them win: a growing
       spacer must not also carry a fixed height or width. */
    compoundVariants: [
      { grow: true, axis: "block", class: "h-auto w-full" },
      { grow: true, axis: "inline", class: "h-auto w-auto" },
    ],
    defaultVariants: { size: "6", axis: "block", grow: false },
  },
);

export interface SpacerProps
  extends React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof spacerVariants> {}

/**
 * A measured hole, on the block axis or the inline one.
 *
 * TEN STATES
 *  1. default        — nothing, at the chosen step. It paints no colour.
 *  2. hover          — does not apply. There is nothing here to point at; the
 *                      element is `aria-hidden` and takes no pointer events
 *                      it could respond to.
 *  3. focus-visible  — NOT here, and not anywhere: a spacer is not focusable.
 *                      tokens.css §8 owns the one ring and this file adds
 *                      none.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A hole cannot be switched off; the
 *                      call site stops rendering it.
 *  6. loading        — does not apply, and that is the point: a spacer is
 *                      what keeps a layout the same height while the content
 *                      beside it is still a `Skeleton`.
 *  7. empty          — always. A spacer is empty by definition; it has no
 *                      children and ignores any that are passed, because a
 *                      hole with something in it is a `Container`.
 *  8. error          — does not apply. It reports nothing.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, deliberately, and this is a real
 *  decision rather than a shrug. A spacer that halved itself on a phone would
 *  put a second, invisible responsive system underneath every layout in the
 *  repository, and two call sites asking for `size="9"` would then produce
 *  different gaps depending on what else was on the screen. Where a gap must
 *  change with width, the call site says so — `<Spacer size="6" className=
 *  "lg:h-[var(--space-9)]" />` — and that change is then visible in the
 *  layout's own code, which is where a reader looks for it.
 *
 * RTL — safe by construction. Neither axis names a physical side: `block` is
 * a height, `inline` is a width, and a width in a flex row is mirrored by the
 * row. This is the reason the axis values are not called horizontal and
 * vertical.
 */
const Spacer = React.forwardRef<HTMLSpanElement, SpacerProps>(
  ({ className, size = "6", axis = "block", grow = false, children: _children, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="spacer"
      aria-hidden="true"
      className={cn(spacerVariants({ size, axis, grow }), className)}
      {...props}
    />
  ),
);

Spacer.displayName = "Spacer";

export { Spacer, spacerVariants };
