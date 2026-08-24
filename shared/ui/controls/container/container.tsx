/* ============================================================================
   Container — the page's measure and its gutters (0 direct call sites; every
   composition needs one the moment a screen is built).

   DESIGN SOURCE
   The kit's own page shell, read out of "Kwapso UI Kit.dc.html":
   every band of the document is `max-width: 1240px` with `padding: 0 56px`,
   and chapter 5's grid specimen states the rule in words:

       "1200px content max on marketing, 960px on documents, 24–32px card
        inset, 64–128px between sections."

   Those three figures are already tokens: `--container-app` (1240),
   `--container-marketing` (1200) and `--container-document` (960).
   The 12-column grid beside them is `--grid-columns`, at a 12 gutter.

   THE LAW THIS FILE OBEYS
   · Three measures, and they are named, not chosen: application chrome,
     marketing pages, reading documents. A fourth width would be a value this
     repository invented.
   · No px. Every measure is a `rem` token; every gutter is a `--space-*`
     step, so the whole page rescales with the text-size control.
   · Above 32 the kwapso and Tailwind spacing ladders diverge, so the desktop
     gutter is written as `var(--space-8)` rather than as a Tailwind numeric.
   · Logical properties only: `px-*` is padding-inline and `mx-auto` is
     margin-inline, so the shell is identical under `dir="rtl"`.
   · Focus is ONE global rule (tokens.css §8). A container adds nothing and
     clips nothing — no `overflow: hidden`, so a focused control against the
     gutter keeps its whole ring.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const containerVariants = cva(
  [
    // Centred, and never wider than its parent.
    "mx-auto w-full",
    // A container holds tables and long unbroken strings. Without this a
    // single one of them makes the page scroll sideways instead of the
    // element that should.
    "min-w-0",
  ],
  {
    variants: {
      size: {
        /** 1240 · `--container-app`. Application chrome — the default. */
        app: "max-w-[var(--container-app)]",
        /** 1200 · `--container-marketing`. */
        marketing: "max-w-[var(--container-marketing)]",
        /** 960 · `--container-document`. Reading width for a long document. */
        document: "max-w-[var(--container-document)]",
        /**
         * No measure at all — a full-bleed band that still wants the gutters.
         * Added, not required: a coloured section that runs edge to edge with
         * its content inset is the kit's own page pattern, and without this
         * value a call site would have to hand-roll the gutters and get them
         * out of step with every other band.
         */
        full: "max-w-none",
      },
      gutter: {
        /**
         * 20 → 32 → 48. See THREE BREAKPOINTS below; this is the one
         * derivation in the file and it is logged as GAPS-F CTN-1.
         */
        true: "px-5 sm:px-8 lg:px-[var(--space-8)]",
        /** Flush. For a container nested inside one that already gutters. */
        false: "px-0",
      },
    },
    defaultVariants: { size: "app", gutter: true },
  },
);

export interface ContainerProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof containerVariants> {}

/**
 * The page's measure.
 *
 * TEN STATES
 *  1. default        — centred, capped, guttered. It paints nothing: no fill,
 *                      no radius, no stroke, so whatever surface it is
 *                      dropped onto shows through unchanged.
 *  2. hover          — does not apply. A container is not a target and has no
 *                      appearance to change.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once. A
 *                      container is not focusable and, crucially, does not
 *                      clip: a control sitting against the gutter shows its
 *                      whole ring.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A region cannot be disabled; the
 *                      controls inside it can.
 *  6. loading        — does not apply. The shell is exactly what must NOT
 *                      wait: it holds the page's width steady while the
 *                      content inside it is a `Skeleton`, so nothing reflows
 *                      when data lands.
 *  7. empty          — a container with no children renders an empty box of
 *                      zero height. Deliberately not `null`: it costs
 *                      nothing, and a shell that vanished would collapse the
 *                      page it is holding open.
 *  8. error          — does not apply. A container reports nothing.
 *  9. selected       — does not apply.
 * 10. read-only      — always. There is nothing here to edit.
 *
 * THREE BREAKPOINTS — and here the answer is NOT "unchanged". This component
 * and `Card` are the two places in the batch where width is the whole point.
 *  · mobile (below `sm:`, 40rem) — gutter 20 (`--space-5`, the kit's "side
 *    padding, narrow"). The measure never binds at this width; the gutter is
 *    the only thing doing any work.
 *  · tablet (`sm:` 40rem and up) — gutter 32 (`--space-7`, "page pad").
 *  · desktop (`lg:` 64rem and up) — gutter 48 (`--space-8`), and from roughly
 *    this width up the measure starts to bind and the container centres.
 *  The kit's own document is a flat 56 inline padding at every width, which
 *  is both off the spacing ladder and unusable on a phone — a 320 viewport
 *  would have 112 of its 320 in air. The ladder step either side of 56 was
 *  taken and made responsive. Logged as GAPS-F CTN-1.
 *
 * RTL — safe, and this is the component where that matters most. `px-*` is
 * padding-inline and `mx-auto` is margin-inline, so the gutters and the
 * centring mirror with the document and nothing here names a side.
 */
const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = "app", gutter = true, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="container"
      data-size={size ?? "app"}
      className={cn(containerVariants({ size, gutter }), className)}
      {...props}
    />
  ),
);

Container.displayName = "Container";

export { Container, containerVariants };
