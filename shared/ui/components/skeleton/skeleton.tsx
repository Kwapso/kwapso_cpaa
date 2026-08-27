/* ============================================================================
   Skeleton — the stateful placeholder (92 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `.kw-skeleton`,
   `.kw-skeleton--block`, and the "third loading tier" note: a skeleton is
   shown on a COLD CACHE ONLY. A warm re-fetch keeps the stale content and
   marks it busy; it does not blank the screen.
   Row geometry follows `.kw-list__item` / `.kw-list__well` from the same file.

   THE LAW THIS FILE OBEYS
   · The fill is `--surface-quiet`. Never grey, never an alpha of the ink.
   · Radius: a bar is a pill (`--radius-pill`); a block is a box
     (`--radius`, 24). There is no third radius here.
   · A skeleton stands in for content, so it must not be read aloud as
     content. The root announces once, politely, with an overridable label;
     every bar inside it is `aria-hidden`.
   · Reduced motion stops the pulse. tokens.css §9 zeroes the durations for
     everything token-driven; the pulse is a Tailwind keyframe, so it is
     switched off here explicitly.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/**
 * The pulsing fill. Every visible piece of every variant is one of these.
 * `animate-pulse` is Tailwind's own keyframe; the kit's pulse is 1.4s on
 * `--ease` between two stated tones and differs — GAPS.md SKL-1.
 */
const PULSE = "bg-surface-quiet animate-pulse motion-reduce:animate-none";

const skeletonVariants = cva(PULSE, {
  variants: {
    variant: {
      /** The bare bar: 12 tall, pill, full width unless the call site says otherwise. */
      default: "h-3 w-full rounded-pill",
      /** Handled by the composite branch — the root is a stack, not a bar. */
      text: "",
      /** A block standing in for a panel: 64 tall at the box radius. */
      card: "h-16 w-full rounded-[var(--radius)]",
      /** A block holding an image's shape. Derived — GAPS.md SKL-2. */
      media: "aspect-[16/9] w-full rounded-[var(--radius)]",
      /** Handled by the composite branch — the root is a stack of rows. */
      list: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

/** One pulsing bar. Local; a skeleton's parts are never addressable from outside. */
function Bar({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn(PULSE, "block h-3 rounded-pill", className)} />;
}

export interface SkeletonProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof skeletonVariants> {
  /**
   * How many pieces to draw: lines for `variant="text"`, rows for
   * `variant="list"`. Ignored by the single-piece variants. `0` renders
   * nothing — that is this component's empty state.
   */
  lines?: number;
  /**
   * What a screen reader says while the content is missing. A default is given
   * so no call site can forget one, and it is a prop so Arabic, Urdu and
   * Persian are a translation away rather than a fork of this file.
   */
  label?: string;
  /**
   * Announce the wait. Default `true`. Set `false` for a skeleton inside a
   * region that already announces — 92 placeholders all saying "Loading" at
   * once is worse than silence.
   */
  announce?: boolean;
}

/**
 * A content placeholder.
 *
 * TEN STATES — most of them genuinely do not apply, and each is named rather
 * than quietly dropped. A skeleton is itself a state; it has no states of its
 * own beyond being present or absent.
 *
 *  1. default        — the placeholder as drawn, pulsing.
 *  2. hover          — does not apply. Nothing here is a target; the real
 *                      control does not exist yet.
 *  3. focus-visible  — does not apply. A skeleton is never focusable, and it
 *                      must not be: tabbing into a placeholder strands the
 *                      caret when the content swaps in.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply.
 *  6. loading        — THE state. It is the whole component; there is no
 *                      `loading` prop because rendering one IS loading.
 *  7. empty          — `lines={0}` renders nothing. A collection that came
 *                      back empty shows the empty register, never a skeleton.
 *  8. error          — does not apply, and must not be faked. A request that
 *                      failed replaces the skeleton with the error register;
 *                      a skeleton left pulsing over a dead request is a lie.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply. There is nothing to write to.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED by design, and deliberately so: a
 *  skeleton must occupy the same box as the content it replaces, so it inherits
 *  its width from the parent (`w-full`) and its count from the caller rather
 *  than deciding either itself. Where the real content restacks at a
 *  breakpoint, the same grid restacks the skeleton, because the composition
 *  owns the grid. The only intrinsic dimensions are heights the kit states:
 *  12 for a bar, 64 for a card block, 16/9 for media.
 *
 * RTL — safe. Rows are `flex` in logical order; every inset is logical. The
 * leading circle sits at the inline start in both directions, which is where
 * the avatar it stands in for sits.
 */
const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "default", lines = 3, label = "Loading…", announce = true, ...props }, ref) => {
    const composite = variant === "text" || variant === "list";

    // Empty: nothing to stand in for.
    if (composite && lines <= 0) return null;

    // One announcement per skeleton, on the root, never on the parts.
    const live: React.HTMLAttributes<HTMLDivElement> = announce
      ? { role: "status", "aria-live": "polite", "aria-label": label }
      : { "aria-hidden": true };

    if (variant === "text") {
      return (
        <div
          ref={ref}
          data-slot="skeleton"
          data-variant="text"
          aria-busy="true"
          {...live}
          className={cn("flex w-full flex-col gap-3", className)}
          {...props}
        >
          {Array.from({ length: lines }, (_, i) => (
            // The last line is short, the way a last line of prose is.
            <Bar key={i} className={i === lines - 1 ? "w-3/5" : "w-full"} />
          ))}
        </div>
      );
    }

    if (variant === "list") {
      return (
        <div
          ref={ref}
          data-slot="skeleton"
          data-variant="list"
          aria-busy="true"
          {...live}
          className={cn("flex w-full flex-col", className)}
          {...props}
        >
          {Array.from({ length: lines }, (_, i) => (
            // `.kw-list__item` geometry: 16/20 inset, 16 gap, box radius.
            <div key={i} className="flex items-center gap-4 rounded-[var(--radius)] px-5 py-4">
              {/* `.kw-list__well` — 32, pill, the avatar's own box. */}
              <span
                aria-hidden="true"
                className={cn(PULSE, "size-[var(--avatar-md)] shrink-0 rounded-pill")}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Bar className="w-2/5" />
                <Bar className="w-3/5" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="skeleton"
        data-variant={variant ?? "default"}
        aria-busy="true"
        {...live}
        className={cn(skeletonVariants({ variant }), className)}
        {...props}
      />
    );
  },
);

Skeleton.displayName = "Skeleton";

export { Skeleton, skeletonVariants };
