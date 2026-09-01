/* ============================================================================
   Typography — Headline, Text, Hint (0 direct call sites; the three shapes
   every other component's copy is measured against).

   DESIGN SOURCE
   Kit chapter 3, transcribed into tokens.css §5 as the thirteen steps plus
   the additive caption step, each carrying its own line-height AND
   letter-spacing so one utility sets all three.

   The step ladder below is NOT chosen. Every rung is matched to the kit's own
   named tracking token, which is the only unambiguous key the two lists
   share:

       --tracking-display-xl  -0.028em  ->  --text-7xl  (96)
       --tracking-display-l   -0.026em  ->  --text-6xl  (72)
       --tracking-display-m   -0.025em  ->  --text-5xl  (56)
       --tracking-h1          -0.025em  ->  --text-4xl  (44)
       --tracking-h2          -0.020em  ->  --text-3xl  (32)
       --tracking-h3          -0.014em  ->  --text-2xl  (24)
       --tracking-h4          -0.010em  ->  --text-xl   (20)

   `--tracking-display-m` and `--tracking-h1` share a value; they are told
   apart by size, which the kit's own display/heading split already states
   (display-m is 56, h1 is 44). Logged as GAPS-F TYP-1.

   The serif option is chapter 13's pull-quote: `font-family: SerrifCondensed`
   at -0.005em, which is `--tracking-serif`.

   THE LAW THIS FILE OBEYS
   · Saans ships Light (300) and Medium (500) and nothing else. Medium IS the
     bold of this system, which is why `font-bold` renders identically to
     `font-medium` and that is correct rather than a bug. The kit's weight per
     step is transcribed in tokens.css §5 and followed here: 500 from `xl`
     upward, 300 for `lg`, `base`, `sm` and `caption`.
   · `--measure-body` is the reading measure and it is a token, not a number.
     The kit's prose says 68ch and the kit's CSS says 62/66; the token holds
     62 and carries a GAP marker. This file uses the token and picks nothing.
   · No hardcoded size and no arbitrary length form. `text-3xl` sets size,
     leading and tracking together; `text-[length:var(--text-3xl)]` sets only
     the size and silently drops the other two, which is the bug the theme
     bridge exists to prevent (GAPS.md CTRL-8).
   · Focus is ONE global rule (tokens.css §8). Prose is not focusable.

   RENDERING CONTEXT
   No `"use client"`. All three forward props and a ref.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ============================================================================
   Headline
   ========================================================================= */

const headlineVariants = cva([], {
  variants: {
    size: {
      /** 96 · the cover step. `--tracking-display-xl`. */
      "display-xl": "text-7xl",
      /** 72 · `--tracking-display-l`. */
      "display-l": "text-6xl",
      /** 56 · `--tracking-display-m`. The kit's error-page numeral step. */
      "display-m": "text-5xl",
      /** 44 · `--tracking-h1`. A page's own name. */
      h1: "text-4xl",
      /** 32 · `--tracking-h2`. A section. Same step `Title` draws. */
      h2: "text-3xl",
      /** 24 · `--tracking-h3`. A block, and the modal title step. */
      h3: "text-2xl",
      /** 20 · `--tracking-h4`. A band inside a panel. */
      h4: "text-xl",
    },
    weight: {
      /**
       * 500. The kit's weight for every step from `xl` upward, and therefore
       * the default: display sizes lean on scale and tight tracking rather
       * than on a heavier face, because there is no heavier face.
       */
      medium: "font-[var(--font-weight-medium)]",
      /** 300. The lighter of the two weights Saans ships. */
      light: "font-[var(--font-weight-light)]",
    },
    tone: {
      default: "text-foreground",
      secondary: "text-ink-secondary",
      tertiary: "text-ink-tertiary",
      /** Inherit whatever the surface set — inside an inverse or brand card. */
      inherit: "text-inherit",
    },
    /**
     * Chapter 13's pull-quote face: the condensed serif at `--tracking-serif`.
     * The chapter's caption rules it "one per page", which no component can
     * enforce — it is written here so the next reader knows.
     */
    serif: {
      true: "font-[family-name:var(--font-serif)] tracking-[var(--tracking-serif)]",
      false: "font-[family-name:var(--font-sans)]",
    },
  },
  defaultVariants: { size: "h2", weight: "medium", tone: "default", serif: false },
});

export interface HeadlineProps
  extends React.ComponentPropsWithoutRef<"h2">,
    VariantProps<typeof headlineVariants> {
  /**
   * The element. Defaulted to `h2` to match the default `size`, so a page
   * built out of Headlines has a real outline rather than a wall of `div`s.
   * A pull-quote passes `as="blockquote"`; a figure that only looks like a
   * heading passes `as="div"`.
   */
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "div" | "span" | "blockquote";
}

/**
 * A heading, at one of the kit's seven display and heading steps.
 *
 * TEN STATES
 *  1. default        — the step, the weight, the ink.
 *  2. hover          — does not apply. A heading is not a target. A heading
 *                      that is also a link wraps its own `a`, and the link
 *                      carries the hover.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once
 *                      and a heading is not focusable.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. Words are not disabled; a section that
 *                      is unavailable disables its controls and keeps its
 *                      name legible, because the name is what tells the
 *                      reader what is unavailable.
 *  6. loading        — does not apply. A heading is known before its data is.
 *  7. empty          — no children renders `null`. An empty `h2` still takes
 *                      a line box and puts a gap in the page for no reason.
 *  8. error          — does not apply.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and that is a decision with a cost
 *  worth stating: `display-xl` is 96, which at a 320 viewport fits roughly
 *  three characters per line. The step is deliberately not shrunk here,
 *  because a primitive that quietly restepped would make two call sites
 *  asking for the same size render differently, and the kit states one figure
 *  per step. A hero that must shrink says so at the composition —
 *  `<Headline size="display-m" className="lg:text-7xl" />` — where the
 *  decision is visible next to the layout that motivated it. Logged as
 *  GAPS-F TYP-3.
 *
 * RTL — safe. No inset, no direction, and the tracking is symmetrical.
 */
const Headline = React.forwardRef<HTMLHeadingElement, HeadlineProps>(
  (
    {
      className,
      as = "h2",
      size = "h2",
      weight = "medium",
      tone = "default",
      serif = false,
      children,
      ...props
    },
    ref,
  ) => {
    if (React.Children.count(children) === 0) return null;

    /* `as` is a union of intrinsic tags, so React types the merged ref as an
       INTERSECTION of every element it could be — a ref no real element
       satisfies. Widening to ElementType is the standard escape; the prop
       union above is still what a call site is checked against. */
    const Component = as as React.ElementType;

    return (
      <Component
        ref={ref}
        data-slot="headline"
        className={cn(headlineVariants({ size, weight, tone, serif }), className)}
        {...props}
      >
        {children}
      </Component>
    );
  },
);

Headline.displayName = "Headline";

/* ============================================================================
   Text
   ========================================================================= */

const textVariants = cva([], {
  variants: {
    size: {
      /** 16 / 300 · `--text-base`. The kit's reading size. */
      base: "text-base",
      /** 14 / 300 · `--text-sm`. Dense copy, and the control-label step. */
      sm: "text-sm",
      /** 13 / 300 · `--text-caption`. The kit's own body tone inside a card. */
      caption: "text-caption",
    },
    tone: {
      default: "text-foreground",
      /** `--ink-secondary`. Body copy under a heading, the kit's `fg2`. */
      secondary: "text-ink-secondary",
      /** `--ink-tertiary`. Metadata. `Hint` is this tone at the caption step. */
      tertiary: "text-ink-tertiary",
      inherit: "text-inherit",
    },
    /**
     * Cap the line length at the reading measure. Off by default: most copy
     * in an application sits in a column that is already the right width, and
     * a measure applied twice leaves a paragraph floating in its own box.
     */
    measure: {
      true: "max-w-[var(--measure-body)]",
      false: "",
    },
    /** Every number in a column, a count or a timestamp is tabular. */
    numeric: {
      true: "tabular-nums",
      false: "",
    },
  },
  defaultVariants: { size: "base", tone: "default", measure: false, numeric: false },
});

export interface TextProps
  extends React.ComponentPropsWithoutRef<"p">,
    VariantProps<typeof textVariants> {
  /** The element. `p` for a paragraph, `span` inside a line of other copy. */
  as?: "p" | "span" | "div" | "li" | "dd" | "dt";
}

/**
 * Body copy.
 *
 * TEN STATES
 *  1. default        — the step and the ink.
 *  2. hover          — does not apply. Prose is not a target.
 *  3. focus-visible  — NOT here. tokens.css §8, and prose is not focusable.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply as a prop, deliberately. Copy inside a
 *                      disabled control takes `--ink-disabled` from that
 *                      control's own skin, which is a fill and an ink, and
 *                      offering a disabled TONE here would let a call site
 *                      grey out a paragraph that nothing is stopping them
 *                      reading.
 *  6. loading        — does not apply. Copy that has not arrived is a
 *                      `Skeleton` at the call site, which is the component
 *                      that owns the placeholder shape.
 *  7. empty          — no children renders `null`. An empty paragraph still
 *                      takes a line box and opens a hole in the page.
 *  8. error          — does not apply. An error MESSAGE is `Field`'s, and the
 *                      kit's law there is that the words are ink and only the
 *                      dot is poppy — so there is no red body tone to offer.
 *  9. selected       — does not apply. Text selection is the browser's.
 * 10. read-only      — always. This component displays; `Input` and
 *                      `Textarea` edit.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in step. What varies without a
 *  breakpoint is the LINE LENGTH: `measure` caps it at `--measure-body`, and
 *  below that width the paragraph simply fills its column. That is the whole
 *  responsive story for prose and it needs no `sm:` or `lg:` to work.
 *
 * RTL — safe. `max-w-*` is a logical inline size, the alignment is inherited
 * rather than set, and nothing here names a side.
 */
const Text = React.forwardRef<HTMLParagraphElement, TextProps>(
  (
    {
      className,
      as = "p",
      size = "base",
      tone = "default",
      measure = false,
      numeric = false,
      children,
      ...props
    },
    ref,
  ) => {
    if (React.Children.count(children) === 0) return null;

    /* `as` is a union of intrinsic tags, so React types the merged ref as an
       INTERSECTION of every element it could be — a ref no real element
       satisfies. Widening to ElementType is the standard escape; the prop
       union above is still what a call site is checked against. */
    const Component = as as React.ElementType;

    return (
      <Component
        ref={ref}
        data-slot="text"
        className={cn(textVariants({ size, tone, measure, numeric }), className)}
        {...props}
      >
        {children}
      </Component>
    );
  },
);

Text.displayName = "Text";

/* ============================================================================
   Hint
   ========================================================================= */

const hintVariants = cva(
  [
    // caption · 13 / 300, the step tokens.css names for "timestamps, helper
    // text". One class, size and leading and tracking together.
    "text-caption",
    // Ruling 27 folded the hint tier into the third ink tier, so metadata,
    // labels, hints and placeholders are all one colour. `--ink-tertiary` is
    // `--muted-foreground`.
    "text-ink-tertiary",
  ],
  {
    variants: {
      /** Timestamps, counts and figures are tabular wherever they appear. */
      numeric: {
        true: "tabular-nums",
        false: "",
      },
    },
    defaultVariants: { numeric: false },
  },
);

export interface HintProps
  extends React.ComponentPropsWithoutRef<"p">,
    VariantProps<typeof hintVariants> {
  /** The element. `span` for a hint that sits inside a line. */
  as?: "p" | "span" | "div";
}

/**
 * The quiet line: a timestamp, a count, an explanatory aside.
 *
 * NOT a form field's help line. `Field` draws that at the badge step (12/500)
 * from chapter 9, which is a different drawing for a different job, and this
 * component deliberately does not try to be both. The two steps are 13 and 12
 * and the kit really does use both. Logged as GAPS-F TYP-2.
 *
 * TEN STATES
 *  1. default        — caption step, tertiary ink.
 *  2. hover          — does not apply. It is a label.
 *  3. focus-visible  — NOT here. tokens.css §8; a hint is not focusable.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply here. A hint inside a disabled `Field`
 *                      is already stepped to `--ink-disabled` by that field's
 *                      own group rule, which is a fill and an ink; adding a
 *                      second mechanism would give two answers to one
 *                      question.
 *  6. loading        — does not apply. A hint is static copy.
 *  7. empty          — no children renders `null`. A hint with nothing in it
 *                      is a gap under a control for no reason.
 *  8. error          — does not apply. The error line under a control belongs
 *                      to `Field`, whose law is ink words and a poppy dot.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. 13 is already the smallest
 *  comfortable reading step in the system, and the text-size control moves
 *  the root from 13 to 17 across its three scales, which is the mechanism
 *  that answers "this is too small" — not a breakpoint.
 *
 * RTL — safe. No inset, no direction.
 */
const Hint = React.forwardRef<HTMLParagraphElement, HintProps>(
  ({ className, as = "p", numeric = false, children, ...props }, ref) => {
    if (React.Children.count(children) === 0) return null;

    /* `as` is a union of intrinsic tags, so React types the merged ref as an
       INTERSECTION of every element it could be — a ref no real element
       satisfies. Widening to ElementType is the standard escape; the prop
       union above is still what a call site is checked against. */
    const Component = as as React.ElementType;

    return (
      <Component
        ref={ref}
        data-slot="hint"
        className={cn(hintVariants({ numeric }), className)}
        {...props}
      >
        {children}
      </Component>
    );
  },
);

Hint.displayName = "Hint";

export { Headline, Text, Hint, headlineVariants, textVariants, hintVariants };
