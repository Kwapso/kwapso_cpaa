/* ============================================================================
   Separator — the standalone rule (0 direct call sites; the divider every
   card stack, menu and toolbar reaches for once the collections land).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t11.css → `.kw-divider` (chapter 11):
   two 1px hairlines at `--hair` flanking an optional micro UPPERCASE eyebrow
   in tertiary ink, `--space-3` apart.
   design-mothership/specimens/_fragments/f3.css → `.kw-matrix th`, which is
   where the kit uses the heavier `--hair-strong` weight: a SECTION rule, not
   a same-tone split. That is the whole of `variant="section"`.

   THE LAW THIS FILE OBEYS
   · A hairline is allowed on same-tone card separation and on form fields
     ONLY — never on a button, never on a coloured pill. A separator IS the
     blessed case, which is why this component may draw a line at all.
   · Two weights, and only two. `--border` (8%) is the same-tone split;
     `--hair-strong` (20%) is a section rule. The kit's third weight,
     `--hair-faint` (6%), is disputed between chapters 01 and 02
     (design-mothership GAP-4) and is deliberately not offered here.
   · 1px is one of exactly two values tokens.css keeps off the spacing scale,
     as a grid line. `h-px` / `w-px` is that grid line and nothing else; it is
     never a layout measure.
   · Focus is ONE global rule (tokens.css §8). A separator is not focusable
     and defines nothing.

   RENDERING CONTEXT
   `"use client"`. Radix's Separator is a client component.
   ========================================================================= */

"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const separatorVariants = cva(
  [
    // A rule paints nothing but a colour, so it must not be allowed to
    // participate in a flex parent's sizing.
    "shrink-0",
  ],
  {
    variants: {
      variant: {
        /** `.kw-divider::before` — the same-tone split at `--border` (8%). */
        default: "bg-border",
        /**
         * `.kw-matrix th { border-bottom: 1px solid var(--hair-strong) }` —
         * the 20% weight, reserved by chapter 01 for a SECTION rule. Added,
         * not required: the commission lists no variant on `separator`, and
         * commission §2 rule 3 permits additions. Without it a call site
         * that needs the heavier rule would hand-roll a colour.
         */
        section: "bg-hair-strong",
      },
      orientation: {
        horizontal: "h-px w-full",
        vertical: "h-full w-px",
      },
    },
    defaultVariants: {
      variant: "default",
      orientation: "horizontal",
    },
  },
);

export interface SeparatorProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>,
      "orientation"
    >,
    VariantProps<typeof separatorVariants> {
  /**
   * The kit's labelled divider (`.kw-divider`): the rule splits and an
   * eyebrow sits between the halves. Undefined renders the plain rule, which
   * is why this component hardcodes no string — there is no "OR" baked in
   * here to fail to translate. The kit's English specimen reads "OR".
   *
   * Horizontal only. The kit draws no vertical labelled divider, so a label
   * passed with `orientation="vertical"` is ignored rather than invented
   * (GAPS-D SEP-1).
   */
  label?: React.ReactNode;
}

/**
 * A rule between two things.
 *
 * TEN STATES
 *  1. default        — one hairline at the chosen weight.
 *  2. hover          — does not apply. A rule is not a control and nothing
 *                      about it responds to a pointer.
 *  3. focus-visible  — does not apply; a separator is never focusable. Were a
 *                      call site to make it so, tokens.css §8 rings it and
 *                      this file must not add a ring.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A rule cannot be disabled; a section
 *                      that is unavailable dims its own contents, not its rule.
 *  6. loading        — does not apply. A rule has no value to wait for, so it
 *                      draws at once and never flashes a placeholder.
 *  7. empty          — `label` absent IS the empty case, and it is the normal
 *                      one: a single unbroken rule. Nothing is invented to
 *                      fill the gap.
 *  8. error          — does not apply. A separator reports nothing.
 * 10. read-only      — always. There is nothing here to edit.
 *  9. selected       — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. A horizontal rule is `w-full` and a
 *  vertical rule is `h-full`, so both take their length from the parent at
 *  every width and there is nothing left for a breakpoint to decide. A row of
 *  cards that becomes a column at `md:` swaps `orientation` at the call site;
 *  that is the composition's grid, not this file.
 *
 * RTL — safe. Nothing is positioned by side; the labelled form is a flex row
 * whose two rules are symmetrical, so it mirrors with no rule of its own.
 */
const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  SeparatorProps
>(
  (
    {
      className,
      variant = "default",
      orientation = "horizontal",
      decorative = true,
      label,
      ...props
    },
    ref,
  ) => {
    const showLabel = label !== undefined && label !== null && orientation === "horizontal";

    if (!showLabel) {
      return (
        <SeparatorPrimitive.Root
          ref={ref}
          data-slot="separator"
          decorative={decorative}
          orientation={orientation ?? "horizontal"}
          className={cn(separatorVariants({ variant, orientation }), className)}
          {...props}
        />
      );
    }

    /* The labelled form. Radix's Root is the semantic separator, so it stays
       — it just carries the eyebrow and grows its rule from each flank. One
       Root, two pseudo-rules drawn as real spans (a pseudo-element cannot be
       given a Tailwind class), matching `.kw-divider::before/::after`. */
    return (
      <SeparatorPrimitive.Root
        ref={ref}
        data-slot="separator"
        decorative={decorative}
        orientation="horizontal"
        className={cn(
          "flex w-full shrink-0 items-center gap-3",
          // The eyebrow: micro / 500 / uppercase, tertiary ink. `text-micro`
          // is a real utility (tokens.css §10 bridges it) and sets size,
          // leading and the 0.08em eyebrow tracking together.
          "text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn("h-px flex-1", separatorVariants({ variant, orientation: null }))}
        />
        {label}
        <span
          aria-hidden="true"
          className={cn("h-px flex-1", separatorVariants({ variant, orientation: null }))}
        />
      </SeparatorPrimitive.Root>
    );
  },
);

Separator.displayName = "Separator";

export { Separator, separatorVariants };
