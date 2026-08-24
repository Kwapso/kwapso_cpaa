/* ============================================================================
   ScrollArea — a pane that scrolls with a kwapso bar instead of the OS one
   (2 direct call sites).

   DESIGN SOURCE
   The kit draws no scrollbar. It does draw a bar, twice, and both drawings
   agree, so the thumb is taken from them rather than invented:
     · design-mothership/specimens/_fragments/t10.css → the slider mirror bar,
       "0.5rem at r999, track --surface-quiet".
     · design-mothership/specimens/kwapso-ui.css → `.kw-skeleton`, a 0.75rem
       bar at `--radius-pill`.
   The overflow container itself is `.kw-matrix-scroll` in
   specimens/_fragments/f3.css — the kit's own answer to "this is wider than
   the viewport": scroll it inside its own container, never restack it.
   Logged as GAPS-D SCR-1 because the ink of the thumb is derived.

   THE LAW THIS FILE OBEYS
   · Focus is ONE global rule (tokens.css §8) and a scroll area must not trap
     or hide it. So: nothing here sets `overflow: hidden`, on the root or
     anywhere else — Radix's viewport carries `overflow: scroll`, which paints
     a ring that overhangs by the 2px offset + 2px width instead of clipping
     it, and the viewport takes `scroll-p-1` (0.25rem, more than that 4px
     reach) so a keyboard walk scrolls a focused child in ring and all.
   · A bar is `--radius-pill` at 0.5rem across, the two sizes the kit's own
     bars use. `--radius-sm` is the four-radius law's bar radius for a DATA
     bar (a chart column, a heat cell); the kit's own thin runner bars are
     drawn round, and a scrollbar thumb is a runner.
   · Hover is a named token, never an opacity. The thumb sits on
     `--hair-strong` and darkens to `--foreground`; the track is transparent,
     because a filled track next to a card edge invents a second surface.
   · No `--primary`. Mango is a brand fill; a scrollbar is furniture.

   RENDERING CONTEXT
   `"use client"`. Radix's ScrollArea measures the DOM and holds state.
   ========================================================================= */

"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "../../lib/utils";

export interface ScrollBarProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> {}

/**
 * The bar itself. Exported because the commission names it and because a
 * two-axis pane has to mount a second one by hand.
 *
 * TEN STATES
 *  1. default        — `--hair-strong` thumb on a transparent track.
 *  2. hover          — thumb to `--foreground`. A named ink, not an opacity.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      A drag handle is pointer-only; the pane it scrolls is
 *                      keyboard-scrollable on its own and that is the a11y
 *                      path, not this bar.
 *  4. active/pressed — the same `--foreground` ink as hover: the kit gives a
 *                      dragged handle no third tone, and inventing one would
 *                      be a fifth colour on a piece of furniture (GAPS-D SCR-1).
 *  5. disabled       — does not apply. A bar with nothing to scroll is
 *                      unmounted by Radix, which is stronger than disabling it.
 *  6. loading        — does not apply; see `empty`.
 *  7. empty          — content that fits renders no bar at all (Radix's
 *                      `type="hover"`/`"auto"`). Nothing is drawn to fill the
 *                      hole, exactly as a badge shows no "0".
 *  8. error          — does not apply. A viewport reports nothing.
 *  9. selected       — does not apply.
 * 10. read-only      — always. There is nothing here to edit.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in geometry, but note the behaviour
 *  difference that is the platform's and not this file's: a touch viewport
 *  scrolls with a finger and shows the bar only while scrolling, so the same
 *  0.5rem bar is correct at every width and never needs to become a touch
 *  target.
 *
 * RTL — safe. The vertical bar's hairline is `border-s` (border-inline-start),
 * so it sits against the content on both sides; Radix places the bar itself.
 */
const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  ScrollBarProps
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    data-slot="scroll-bar"
    orientation={orientation}
    className={cn(
      "flex touch-none select-none",
      "transition-colors duration-[var(--duration-colour)] ease-kwapso",
      // 0.5rem across, the kit's bar width. The 1px inset is the grid line
      // tokens.css keeps off the scale, so the thumb never touches the edge.
      /* The 1px gutter was a transparent border; review 1A · fix 2 removes
         every `border` property, so it is padding, which is what it always
         drew. */
      orientation === "vertical" && "h-full w-2 ps-px p-px",
      orientation === "horizontal" && "h-2 flex-col pt-px p-px",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      data-slot="scroll-bar-thumb"
      className={cn(
        "relative flex-1 rounded-pill bg-hair-strong",
        "transition-colors duration-[var(--duration-colour)] ease-kwapso",
        "hover:bg-[var(--foreground)] data-[state=visible]:hover:bg-[var(--foreground)]",
      )}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));

ScrollBar.displayName = "ScrollBar";

export interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  /**
   * Mount the horizontal bar as well. Default `false`: a pane that scrolls
   * both ways is a table, and a table brings its own container (see
   * `table/table.tsx`).
   */
  horizontal?: boolean;
  /** Escape hatch onto Radix's viewport, which is the element that actually scrolls. */
  viewportClassName?: string;
  /** Ref onto the scrolling element, for a call site that has to drive scrollTop. */
  viewportRef?: React.Ref<HTMLDivElement>;
}

/**
 * A pane that scrolls.
 *
 * TEN STATES — see `ScrollBar` above; the states of a scroll area are the
 * states of its bar. The viewport itself has exactly one appearance, in both
 * themes, and paints no colour of its own so whatever surface it is dropped
 * onto shows through unchanged.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The pane takes its size entirely
 *  from the parent (`size-full` viewport, no width or height of its own), so
 *  a breakpoint changes the parent and this component follows. It never
 *  restacks: turning a scrolling pane into a stacked column at a narrow width
 *  would change what the reader can reach, not just how it looks.
 *
 * RTL — safe. Radix reads the computed direction and places the vertical bar
 * on the inline-end side itself; nothing here names a side.
 */
const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(
  (
    { className, children, horizontal = false, viewportClassName, viewportRef, ...props },
    ref,
  ) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      data-slot="scroll-area"
      /* Deliberately NO `overflow-hidden` here. shadcn's default puts it on
         the root, and it clips the global focus ring of any child sitting
         against the pane's edge — which tokens.css §8 forbids. Radix already
         clips at the viewport. */
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        /* `scroll-p-1` is 0.25rem: more than the ring's 2px offset + 2px
           width, so scrolling a focused child into view brings its ring too.
           `rounded-[inherit]` keeps a pane dropped into a 24-radius card from
           squaring off its own corners. */
        className={cn("size-full rounded-[inherit] scroll-p-1", viewportClassName)}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
      {horizontal ? <ScrollBar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  ),
);

ScrollArea.displayName = "ScrollArea";

export { ScrollArea, ScrollBar };
