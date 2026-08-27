/* ============================================================================
   Title — the section header: eyebrow, heading, actions, rule
   (0 direct call sites).

   DESIGN SOURCE
   Kit chapter 13, the specimen labelled "Section header" — one of the two
   blocks in the chapter that the specimen set never transcribed. Read out of
   "Kwapso UI Kit.dc.html" and kept figure for figure:

     · the row      — `display: flex; align-items: flex-end; gap: 16px;
                       padding-bottom: 14px; flex-wrap: wrap;`
     · the rule     — `box-shadow: inset 0 -1px 0 var(--hair2)`, the HEAVY
                       hairline; the kit's `--hair2` is `rgba(26,25,24,.20)`
                       in light and `rgba(255,254,249,.24)` in dark, which is
                       this repository's `--hair-strong` exactly
     · the eyebrow  — 11 / 500 / uppercase / 0.08em tracking, tertiary ink
     · the heading  — 30 / 500 / -0.02em, 6 under the eyebrow
     · the actions  — `margin-left: auto`, gap 10

   The same eyebrow-over-heading pair is drawn again at `.kw-register__title`
   and `.kw-stagehero__title` in kwapso-patterns.css, at the h2 and h3 steps,
   which is where the `size` ladder below comes from.

   THE LAW THIS FILE OBEYS
   · The rule under a SECTION is the heavy hairline (`--hair-strong`), not the
     8% one. The 8% weight is same-tone card separation — `CardHeader`'s
     border — and the two are not interchangeable: `separator`'s
     `variant="section"` draws the same heavy weight for the same reason.
   · The eyebrow is `--tracking-eyebrow` (0.08em), which `text-micro` already
     carries; kit ruling 16 makes that tracking the eyebrow's, and micro is
     UPPERCASE only.
   · The actions are pushed with `ms-auto` — margin-inline-start — not with
     the kit's own physical `margin-left: auto`, which would leave the buttons
     stranded on the wrong side of an Arabic page.
   · Focus is ONE global rule (tokens.css §8). The actions are Buttons and
     carry it themselves.
   · Every user-facing string is the caller's. This file holds none at all:
     the eyebrow, the heading and the actions are nodes.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   The heading step.

   Chapter 13 draws the section heading at 30, which is not a step on the
   thirteen-step ladder. It IS drawn at -0.02em, and -0.02em is the tracking
   of exactly one step: `--text-3xl`, at 32. So the drawing was snapped up one
   step rather than a fourteenth size being invented for it. Logged as
   GAPS-F TTL-1.

   The other two rungs are the kit's own smaller section headings, at the h3
   and h4 tracking values, which resolve to `text-2xl` and `text-xl` by the
   same tracking match.
   ------------------------------------------------------------------------- */
const titleHeadingVariants = cva(["font-[var(--font-weight-medium)]"], {
  variants: {
    size: {
      /** 32 · the h2 step (`--tracking-h2`, -0.02em). Chapter 13's drawing. */
      h2: "text-3xl",
      /** 24 · the h3 step (`--tracking-h3`, -0.014em). A block inside a page. */
      h3: "text-2xl",
      /** 20 · the h4 step (`--tracking-h4`, -0.01em). A band inside a panel. */
      h4: "text-xl",
    },
  },
  defaultVariants: { size: "h2" },
});

export interface TitleProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof titleHeadingVariants> {
  /**
   * The micro line above the heading — the kit's own example is a count and
   * a state, read as one phrase. A node, so a call site can put a `Badge` in
   * it. Undefined draws nothing, which is why this component hardcodes no
   * string.
   */
  eyebrow?: React.ReactNode;
  /** The controls at the inline end of the row. Usually Buttons. */
  actions?: React.ReactNode;
  /**
   * The heavy hairline under the row. On by default because chapter 13 draws
   * it; turn it off for a heading that opens a card, where `CardHeader`'s own
   * 8% border is already the separation and two rules would stack.
   */
  rule?: boolean;
  /**
   * The heading element. Defaulted to `h2`, because a section header is a
   * heading and a page that renders its sections as `div`s has no outline. A
   * call site whose page already spends `h1` and `h2` passes `h3`, and a
   * caption that only LOOKS like a heading passes `div`.
   */
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div";
}

/**
 * A section header.
 *
 * TEN STATES
 *  1. default        — eyebrow, heading, actions, heavy rule.
 *  2. hover          — does not apply to the header itself; it is a label,
 *                      not a target. The actions are Buttons and carry
 *                      `--btn-*-hover`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and the header is not focusable. (A heading that is a
 *                      scroll anchor takes `tabIndex={-1}`, which is not
 *                      focus-visible and draws no ring — correctly.)
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A section title cannot be disabled;
 *                      an unavailable section disables its own controls.
 *  6. loading        — does not apply. The heading is the one thing on a
 *                      screen that is known before the data is: it names what
 *                      is being fetched. Skeletoning it would leave the
 *                      reader with nothing to read while they wait. A COUNT
 *                      inside the eyebrow that has not arrived renders
 *                      nothing, which is `Badge`'s law, not this file's.
 *  7. empty          — no children and no eyebrow renders `null`: a bare rule
 *                      with buttons floating over it is not a section header.
 *                      An eyebrow WITHOUT a heading is allowed and renders,
 *                      because the kit draws that as a quiet band label.
 *  8. error          — does not apply. A heading reports nothing.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in step and in structure, with one
 *  behaviour that is written and not left to chance: the row WRAPS. Chapter
 *  13's own drawing carries `flex-wrap: wrap`, so on a narrow viewport the
 *  actions drop to a second line UNDER the heading rather than squeezing it,
 *  and `ms-auto` then has no effect because the actions are alone on their
 *  line — they sit at the inline start, in line with the heading above them,
 *  which is where the kit puts a wrapped action row everywhere else. Nothing
 *  restacks and nothing changes size: a 32 heading is legible at 320 and
 *  shrinking it would make the page's largest type the same size as its body
 *  copy.
 *
 * RTL — safe, and one thing was changed to make it so. The kit pushes the
 * actions with `margin-left: auto`; this file uses `ms-auto`
 * (margin-inline-start), so the actions sit at the inline END of the row in
 * both directions. Everything else is `gap`-driven and mirrors on its own.
 */
const Title = React.forwardRef<HTMLDivElement, TitleProps>(
  (
    { className, eyebrow, actions, rule = true, size = "h2", as = "h2", children, ...props },
    ref,
  ) => {
    const hasHeading = React.Children.count(children) > 0;
    if (!hasHeading && eyebrow === undefined) return null;

    const Heading = as;

    return (
      <div
        ref={ref}
        data-slot="title"
        className={cn(
          // Chapter 13: baseline-of-the-block alignment, 16 between the
          // heading group and the actions, wrapping on a narrow row.
          "flex flex-wrap items-end gap-4",
          // 14 under the row, then the heavy section rule.
          /* ch01's "Hairline 20% — section rules", drawn as an inset shadow
             rather than a border (review 1A · fix 2). */
          rule && "shadow-[var(--hairline-under-strong)] pb-[var(--space-3h)]",
          className,
        )}
        {...props}
      >
        <div className="min-w-0">
          {eyebrow !== undefined && eyebrow !== null ? (
            <span
              data-slot="title-eyebrow"
              className={cn(
                // micro · 11 / 500 / uppercase. `text-micro` carries the
                // 0.08em eyebrow tracking of ruling 16 in the same class.
                "block text-micro font-[var(--font-weight-medium)] uppercase",
                "text-ink-tertiary",
              )}
            >
              {eyebrow}
            </span>
          ) : null}

          {hasHeading ? (
            <Heading
              data-slot="title-heading"
              className={cn(
                titleHeadingVariants({ size }),
                // 6 under the eyebrow, and nothing at all without one.
                eyebrow !== undefined && eyebrow !== null && "mt-[var(--space-1h)]",
              )}
            >
              {children}
            </Heading>
          ) : null}
        </div>

        {actions ? (
          <div
            data-slot="title-actions"
            /* `ms-auto` — margin-inline-start. The kit's own drawing is
               `margin-left: auto`, which strands the controls under
               `dir="rtl"`. Gap 10 is the kit's figure. */
            className="ms-auto flex flex-wrap items-center gap-[var(--space-2h)]"
          >
            {actions}
          </div>
        ) : null}
      </div>
    );
  },
);

Title.displayName = "Title";

export { Title, titleHeadingVariants };
