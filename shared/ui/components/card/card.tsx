/* ============================================================================
   Card — the boxed block everything else is dropped into (8 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `.kw-card`, `.kw-card--raised`,
   `.kw-card--brand`, `.kw-card--inverse`, `.kw-card--hairline`.
   The anatomy — header / body / footer inside ONE shell — is kit chapter 13
   ("Cards & containers"), which the specimen set never transcribed, so it was
   read out of the kit itself. Chapter 13's own subtitle is the whole brief:

       "Colour separates, strokes don't"

   and its first specimen caption states the anatomy verbatim:

       "Header, body, and footer are hairline-separated inside one 24px shell
        — never three stacked cards."

   The well is chapter 13's last specimen, and its caption is also transcribed:

       "A well holds secondary detail inside a card — a quoted message, a
        system value, a diff. Same radius, no edge, no shadow."

   THE LAW THIS FILE OBEYS
   · A card is a box, so its radius is `--radius` (24). There is no fifth
     radius and `rounded-lg` is re-pointed at 24, so it is never reached for
     meaning "slightly rounded".
   · Blocks are separated by COLOUR, not by strokes. The one blessed hairline
     is same-tone separation, which is exactly what the header and footer
     rules inside a single shell are — one shell, two hairlines, never three
     stacked cards.
   · A raised card is `--card` over `--surface-panel`: off-beige on soft
     paper. Both are real paper tones; neither is white.
   · Hover, where a card is a target, is `--accent` — the neutral row/item
     wash. Never mango, never an opacity. A card that is a LINK may also gain
     `--shadow-lifted`, which motion.css §13 grants to exactly three things.
   · SELECTED is `--surface-selected`, and it is the SAME wash `TableRow`,
     `List` and `map`'s list row take (override 44, which re-homed override
     40's `--surface-panel`). The system holds one answer for
     a chosen record and this is it. A selected card does not also hover: it
     is already the marked one.
   · Focus is ONE global rule (tokens.css §8). A card that is a link still
     takes the ring, so nothing here clips it: the shell sets no
     `overflow: hidden` (the header and footer rules are inset shadows, not fills,
     so there is nothing to clip at the corner).

   RENDERING CONTEXT
   No `"use client"`. Every part forwards props and a ref and nothing else.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   Interactive skin — composed in JS rather than written as a `hover:` utility
   inside the cva, because the wash is wrong on the two COLOURED variants: a
   mango or a charcoal card washed with 5% charcoal reads as dirt, not as a
   hover. Two skins, picked by variant, exactly as `button.tsx` picks between
   its two disabled skins.

   `motion-hover-lift` is motion.css's own class. It transitions the fill and
   the shadow and adds `--shadow-lifted` on hover, gated behind
   `(hover: hover) and (pointer: fine)` so a tapped card on a phone does not
   stay looking lifted. No duration and no curve is written here.
   ------------------------------------------------------------------------- */
const INTERACTIVE_NEUTRAL = "cursor-pointer motion-hover-lift hover:bg-accent";
const INTERACTIVE_COLOURED = "cursor-pointer motion-hover-lift";

/* ----------------------------------------------------------------------------
   OVERRIDE 40 (2026-08-23) — THE SELECTED WASH.

   Ruling N7-1 kept K1 (the collection panel keeps the card's paper) and
   attached a job to it: the build held THREE answers for a chosen record —
   nothing at all on `Card`, `--surface-panel` on `TableRow` and `List`, and a
   CHARCOAL row in `map`. They are one now, and this is the one:
   `--surface-panel`, the kit's second paper tone, the same string
   `table.tsx`'s `ROW_SELECTED` and `list.tsx`'s `ROW_SELECTED` already hold.

   It cannot be `--accent`: that is the hover wash, and a selected card that
   looks exactly like a hovered one tells the reader nothing. It is not a ring
   either — the ring is N2's question and it is 1px `--hairline-ink`
   (override 33), a separate mark that may be true at the same time.

   THE LIMIT THIS BLOCK USED TO STATE IS CLOSED, OVERRIDE 44 (2026-08-23).
   It read: "the `default` variant is ALREADY `--surface-panel`, so `selected`
   paints nothing on it … a grid of pickable cards is `raised`." That was true
   while the wash WAS the panel tone. `--surface-selected` is a paper neither
   variant is ever painted, so a selection is now visible on BOTH: measured
   1.107 on a `default` card and 1.221 on a `raised` one in light, 1.252 and
   1.127 in dark. `raised` is still the right variant for a pickable grid —
   `OnboardingOptionGroup` and the flowchart's node keep it — but it is a
   preference now and no longer a requirement.
   ------------------------------------------------------------------------- */
/* OVERRIDE 44 (2026-08-23) — the selected paper is its own token now.
   Override 40 pointed this at `--surface-panel`. The K1 reversal then moved
   the papers underneath it: a row now sits INSIDE a soft-paper panel, so the
   "selected" wash painted the row the paper it was already standing on and
   measured 1.000. `--surface-selected` is the paper one rung further from the
   page than the panel -- #EFE6DD in light, --kw-unlit-quiet in dark. Still
   ONE answer for a chosen record: `TableRow`, `List`, `map`'s list row and
   `Card` all take this exact string. */
/* OVERRIDE 77 (2026-08-27, the client's D15-B) — override 44 is OVERTURNED:
   the selected paper is the lift the artifact drew. The string below is
   unchanged on purpose (one answer for a chosen record survives), but
   `--surface-selected` now points at `--surface-raised` — which is `--card`,
   the `raised` variant's OWN fill. So row 40's limit returns inverted:
   a selection is visible on a `default` card (1.103 light / 1.111 dark)
   and PAINTS NOTHING on a `raised` one — 1.000 in BOTH palettes. A pickable
   grid must be `default` now, the exact opposite of what override 44's
   note below concluded. Chosen from the drawing; register row 77 carries
   the full per-context table. */
const CARD_SELECTED = "bg-surface-selected";

/** Variants whose fill is an accent, so the neutral hover wash must not land. */
const COLOURED_VARIANTS = new Set(["brand", "inverse"]);

const cardVariants = cva(
  [
    // A card is a column: header, body, footer, in that order.
    "flex flex-col",
    // The box radius. The only radius a card has.
    "rounded-[var(--radius)]",
    // Ink comes from the surface; the two coloured variants override it below.
    "text-card-foreground",
    // A card holds tables, long words and truncating rows. Without this a
    // single unbreakable string makes the whole card wider than its column.
    "min-w-0",
  ],
  {
    variants: {
      variant: {
        /**
         * `.kw-card` — soft paper. The default because it is the tone that is
         * VISIBLE on the page: `--background` and `--card` are both off-beige,
         * so a `--card` box on the page draws nothing at all.
         */
        default: "bg-surface-panel",
        /**
         * `.kw-card--raised` — off-beige over soft paper, plus `--shadow-rest`
         * (`shadow-sm` is re-pointed at it in the tokens bridge). This is the
         * "raised card" the binding law names, and it only reads as raised
         * when it sits inside a `--surface-panel` band.
         */
        raised: "bg-card shadow-sm",
        /** `.kw-card--brand` — mango, CHARCOAL ink. One per view. */
        brand: "bg-surface-brand text-ink-on-accent",
        /** `.kw-card--inverse` — charcoal, off-beige ink. Chapter 13's own
         *  instruction: "Use charcoal for the last block on a page — a sum, a
         *  decision, a next step." */
        inverse: "bg-surface-inverse text-ink-on-inverse",
        /**
         * Chapter 13's "Well" — secondary detail nested INSIDE a card. Same
         * radius, no edge, no shadow. Added, not required; commission §2
         * rule 3 permits additions and the kit draws it. The drawn fill is a
         * 4.5% charcoal wash and `--accent` is the palette's 5% wash; the
         * gap is logged rather than a new token invented (GAPS-F CRD-4).
         */
        well: "bg-accent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface CardProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof cardVariants> {
  /**
   * `.kw-card--hairline` — the same-tone separation case, and the only reason
   * a card may carry a stroke at all. Off by default: the kit separates
   * blocks with colour and reaches for the hairline only when two cards of
   * the SAME tone sit against each other.
   */
  hairline?: boolean;
  /**
   * The card is a target — a link, a row, a draggable. Adds the neutral
   * `--accent` wash and motion.css's `motion-hover-lift`. It does NOT make
   * the card focusable or clickable: the call site still wraps it in an `a`
   * or a `button`, or passes `role` and `tabIndex`, and tokens.css §8 rings
   * whatever ends up focusable.
   */
  interactive?: boolean;
  /**
   * This card's record is the chosen one. Takes `--surface-panel` — the same
   * wash a selected `TableRow`, `List` row and `map` list row take
   * (override 40) — and suppresses the interactive hover, because a selected
   * card is already the marked one.
   *
   * Only visible on a card that sits on card paper: see the note above
   * `CARD_SELECTED`. Emits `data-selected="true"`. `aria-selected` is the
   * CALL SITE's, because only it knows whether the card is an option in a
   * listbox, a row in a grid, or neither.
   */
  selected?: boolean;
}

/**
 * The boxed block.
 *
 * TEN STATES
 *  1. default        — variant fill at radius 24, no stroke.
 *  2. hover          — only with `interactive`: `--accent` on the three
 *                      neutral variants, elevation on all five. A named
 *                      token and a named shadow; never an opacity, never
 *                      mango. A card that is not a target has no hover,
 *                      deliberately — a whole page of reacting boxes is
 *                      noise.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The shell sets no
 *                      `overflow: hidden`, so a card that IS a link shows its
 *                      ring in full instead of having the corners shaved off.
 *  4. active/pressed — does not apply. The press belongs to the control
 *                      inside the card, or to the link wrapping it; a card
 *                      that nudged under the pointer would fight the button
 *                      inside it that is already nudging.
 *  5. disabled       — does not apply. A card is a surface. An unavailable
 *                      record disables its own controls and keeps its paper;
 *                      dimming the paper would be an opacity, which is a
 *                      rejection.
 *  6. loading        — does not apply here. A card whose CONTENT has not
 *                      arrived keeps its shell and fills it with `Skeleton`,
 *                      which is that component's whole job. The shell must
 *                      not disappear, or the page reflows when data lands.
 *  7. empty          — a card with no children still renders: it is a
 *                      deliberate placeholder shape and the composition
 *                      decides whether to mount it. This is the one place the
 *                      system does NOT prefer nothing, and the reason is
 *                      layout stability in a grid of cards.
 *  8. error          — does not apply. A card does not report; an `Alert`
 *                      inside it does, and a destructive card is not drawn by
 *                      the kit (GAPS-F CRD-3).
 *  9. selected       — `--surface-selected`, the one selected-record wash in
 *                      the system (override 44). The kit draws no selected
 *                      card of its own — that was GAPS-F CRD-3 — so this is
 *                      the ruled answer carried over from the row, not a
 *                      fifth invention. Suppresses the hover wash.
 * 10. read-only      — always. A card holds no value of its own.
 *
 * THREE BREAKPOINTS — and here the answer is NOT "unchanged".
 *  The kit states a RANGE for the card inset rather than one figure
 *  (chapter 5: "24–32px card inset"), which is the only place in the system
 *  where a component's own geometry is given two values. It is read as a
 *  width response, because that is the only thing that varies between the
 *  two figures in every drawing that uses them:
 *    · mobile  — inset 24 (`--space-6`). 32 on a 320 viewport spends a fifth
 *                of the width on air.
 *    · tablet  — inset 24. Unchanged; the kit changes nothing at `sm`.
 *    · desktop — inset 32 (`--space-7`) from `lg:` (64rem), on the header,
 *                the body and the footer alike, so the three parts stay in
 *                register.
 *  The SHELL itself is width-agnostic: no max-width, no min-width, no
 *  stacking. A card fills the grid cell it is given, and the grid is the
 *  composition's. Derivation logged as GAPS-F CRD-2.
 *
 * RTL — safe. Every inset is logical (`px-*` is padding-inline), the two
 * rules are on the block axis, which does not mirror, and nothing here names
 * an inline side.
 */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = "default",
      hairline = false,
      interactive = false,
      selected = false,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      data-slot="card"
      data-variant={variant ?? "default"}
      data-selected={selected ? "true" : undefined}
      className={cn(
        cardVariants({ variant }),
        hairline && "shadow-[var(--hairline)]",
        /* Precedence, written down rather than left to emission order
           (PATTERN §4): selected > hover. A selected card is the loudest one
           on the screen already. */
        interactive &&
          !selected &&
          (COLOURED_VARIANTS.has(variant as string)
            ? INTERACTIVE_COLOURED
            : INTERACTIVE_NEUTRAL),
        interactive && selected && "cursor-pointer",
        selected && CARD_SELECTED,
        className,
      )}
      {...props}
    />
  ),
);

Card.displayName = "Card";

/* ----------------------------------------------------------------------------
   The three insets.

   Chapter 13 draws the header at 20/22/16 and the footer at 14/22/18 — none
   of those five figures is on the kwapso spacing ladder, and chapter 5 states
   the card inset as 24–32. So the drawn asymmetry is KEPT (a header is
   tighter under its rule than over it) and each figure is snapped to the
   nearest ladder step: 24 on the outer edges, 20 (`--space-5`) against the
   hairline. Logged as GAPS-F CRD-1.

   `p-6` is 1.5rem because tokens.css sets `--spacing: 0.25rem`; above 32 the
   kwapso and Tailwind ladders diverge, so the desktop step is written as the
   token.
   ------------------------------------------------------------------------- */

/**
 * The header band. Carries the hairline that separates it from the body —
 * chapter 13's "header, body, and footer are hairline-separated inside one
 * shell". `--hairline-under` is the blessed same-tone hairline, at 8%,
 * not at the heavier `--hair-strong` that `Title` uses for a SECTION rule.
 *
 * TEN STATES — none apply. It is a band; its children carry their own.
 * THREE BREAKPOINTS — inset 24 to `lg:`, 32 above. See `Card`.
 * RTL — safe. `px-*` is padding-inline; the hairline is on the block axis.
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-header"
      className={cn(
        "flex flex-col gap-[var(--space-1h)]",
        "px-6 pt-6 pb-5",
        "lg:px-[var(--space-7)] lg:pt-[var(--space-7)]",
        /* Same-tone card separation — ch02's carve-out. The artifact draws it
           as `inset 0 -1px 0 var(--hair)`, never a `border` (review 1A · fix
           2); `--hairline-under` is that string, named. */
        "shadow-[var(--hairline-under)]",
        className,
      )}
      {...props}
    />
  ),
);

CardHeader.displayName = "CardHeader";

/**
 * The card's headline. Chapter 13 draws it at 18/500 — `text-lg` is the 18
 * step and carries its own leading and tracking, and the weight is lifted to
 * Saans Medium.
 *
 * This is a deliberate departure from the shadcn shape being replaced, whose
 * `CardTitle` is 24/600. 24 is `Title`'s size in this system — a section
 * heading — and using it inside a card made every card look like a page.
 * Logged as GAPS-F CRD-5.
 *
 * Renders a `div` rather than an `h3`, as the shape it replaces does, because
 * a card's heading level depends on the page it lands in. Pass `role` and
 * `aria-level`, or wrap, where the outline matters.
 *
 * TEN STATES — none apply; it is a heading.
 * THREE BREAKPOINTS — UNCHANGED. The kit states one card title size, and a
 * heading that shrank on mobile would break its relationship with the body
 * copy beside it, which does not shrink.
 * RTL — safe. No inset, no direction.
 */
const CardTitle = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-title"
      className={cn("text-lg font-[var(--font-weight-medium)]", className)}
      {...props}
    />
  ),
);

CardTitle.displayName = "CardTitle";

/**
 * The line under the title. Chapter 13's media card draws it at 13/300 in
 * secondary ink — the caption step, which `text-caption` sets whole.
 *
 * TEN STATES — none apply; it is prose.
 * THREE BREAKPOINTS — UNCHANGED. It reflows; it does not restep.
 * RTL — safe.
 */
const CardDescription = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-description"
      className={cn("text-caption text-ink-secondary", className)}
      {...props}
    />
  ),
);

CardDescription.displayName = "CardDescription";

/**
 * The body. Inset only — no type, deliberately.
 *
 * Chapter 13 draws card body COPY at 13/secondary, but `CardContent` is a
 * slot: across the two apps it holds tables, forms, charts and lists as often
 * as it holds a paragraph, and a container that quietly shrank all of them to
 * 13 would be a component making a design decision on the engineer's behalf.
 * Prose inside a card asks for `Text` or `Hint` from `typography`, which draw
 * exactly what chapter 13 draws. Logged as GAPS-F CRD-6.
 *
 * TEN STATES — none apply. It is an inset.
 * THREE BREAKPOINTS — inset 24 to `lg:`, 32 above. See `Card`.
 * RTL — safe. `p-*` is symmetrical and logical.
 */
const CardContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-content"
      className={cn("min-w-0 flex-1 p-6 lg:p-[var(--space-7)]", className)}
      {...props}
    />
  ),
);

CardContent.displayName = "CardContent";

/**
 * The footer band, and the second of the shell's two hairlines. Chapter 13
 * draws a control at the inline start and a quiet meta line pushed to the
 * inline end; the push is the call site's `Spacer grow` or `ms-auto`, not
 * something this band does for it.
 *
 * `gap-3` is chapter 13's own 12 between footer items.
 *
 * TEN STATES — none apply. Its children are Buttons and carry all ten.
 * THREE BREAKPOINTS — inset 24 to `lg:`, 32 above. The row WRAPS rather than
 * stacking: two 40-tall pills fit side by side at 320, and a stacked pair
 * reads as a list of options rather than as a choice. Same reasoning as
 * `ActionRow align="start"`, which this band is a fixed instance of.
 * RTL — safe. `px-*` is padding-inline and flex order follows the document.
 */
const CardFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-footer"
      className={cn(
        "flex flex-wrap items-center gap-3",
        "px-6 pt-5 pb-6",
        "lg:px-[var(--space-7)] lg:pb-[var(--space-7)]",
        /* The shell's second hairline, drawn as the artifact draws it. */
        "shadow-[var(--hairline-over)]",
        className,
      )}
      {...props}
    />
  ),
);

CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
};
