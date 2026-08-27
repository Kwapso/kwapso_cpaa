/* ============================================================================
   Clamp — long copy cut to a line count, with a control to open it
   (0 direct call sites).

   DESIGN SOURCE
   None, and this is the largest hole in the batch. The kit contains no
   line-clamp, no "show more" and no truncated block anywhere in its 27
   chapters — searched for `line-clamp`, `-webkit-line-clamp`, "Show more" and
   "Show less" across the whole 1.4 MB document, zero hits. What the kit does
   settle is everything the component is BUILT from: the caption and body
   steps, `--leading-normal`, and `.kw-link` / `.kw-btn--link`, whose skin the
   toggle borrows via `buttonVariants` so a second link treatment is not
   drawn. Logged as GAPS-F CLM-1.

   THE LAW THIS FILE OBEYS
   · Every user-facing string is a prop with a default. "Show more" and "Show
     less" are the two obvious ones in this batch: the apps run in Arabic,
     Urdu and Persian and a hardcoded English verb inside a component cannot
     be translated.
   · LOGICAL PROPERTIES ONLY. `-webkit-line-clamp` truncates at the END of the
     line in the writing direction, so the ellipsis lands on the correct side
     under `dir="rtl"` with nothing written here. Nothing in this file names a
     side.
   · Focus is ONE global rule (tokens.css §8). The toggle is a real `button`
     and takes that ring; this file adds none and removes none.
   · No duration and no curve is written here, and no motion class is
     attached either. The open and the close are instant on purpose: the
     block's collapsed height is a line count rather than a length, so there
     is no `from` value for a transition to interpolate, and motion.css's
     disclosure classes are all grid-row or height animations built for a
     panel whose full height is measurable. An animated clamp would need a
     measured height, which is a mechanism this system does not have.

   RENDERING CONTEXT
   `"use client"`. This module holds state (open / closed), an id, a
   measurement effect and a `ResizeObserver`.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { buttonVariants } from "../button/button";

export interface ClampProps extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange"> {
  /**
   * How many lines survive the cut. Three is the kit's own paragraph rhythm
   * at the caption step — enough to tell what the copy is about, short enough
   * that opening it is worth doing.
   */
  lines?: number;
  /**
   * The word on the control that opens the block. Defaulted, never
   * hardcoded — this and `lessLabel` are the two strings this component
   * cannot avoid holding, because there is no children to fall back on the
   * way `Button` falls back on its own label.
   */
  moreLabel?: string;
  /** The word on the control that closes it again. */
  lessLabel?: string;
  /**
   * Drop the control entirely and cut hard. For a block that must never grow
   * — a fixed-height cell in a matrix, a preview in a narrow rail.
   */
  collapsible?: boolean;
  /** Controlled open state. Leave undefined to let the component hold it. */
  expanded?: boolean;
  /** Uncontrolled initial state. */
  defaultExpanded?: boolean;
  /** Fires whenever the state settles, controlled or not. */
  onExpandedChange?: (expanded: boolean) => void;
}

/**
 * Copy cut to `lines`, with a control to open it.
 *
 * The control appears only when the copy actually overflows. That is
 * measured, not guessed: without the measurement a one-line note in a list of
 * twenty would carry a pointless "Show more" beside it, and the kit's own
 * instruction everywhere else in the system is to draw nothing rather than
 * draw a hole (a badge with no count renders empty, a scrollbar with nothing
 * to scroll is unmounted).
 *
 * TEN STATES
 *  1. default        — collapsed to `lines`, control present only if the copy
 *                      is longer than that.
 *  2. hover          — on the control only, and it is `.kw-link`'s own
 *                      hover (the underline arrives), inherited whole from
 *                      `buttonVariants({ variant: "link" })`. The copy itself
 *                      has no hover: it is prose, not a target.
 *  3. focus-visible  — NOT here. The control is a real `button` and
 *                      tokens.css §8 rings it at its own radius. This file
 *                      writes no ring and sets no outline.
 *  4. active/pressed — the link variant deliberately carries no press nudge
 *                      (`enabled:active:translate-y-0` in its compound
 *                      class); a word inside a paragraph that moved on press
 *                      would shift the line it sits on.
 *  5. disabled       — does not apply. There is no disabled way to read
 *                      something. A block that must not open passes
 *                      `collapsible={false}`, which removes the control
 *                      rather than greying it out — a fill and an ink on a
 *                      link is not a shape the kit draws.
 *  6. loading        — does not apply. Copy that has not arrived is a
 *                      `Skeleton` at the call site; clamping an empty string
 *                      would render a control that opens onto nothing.
 *  7. empty          — no children renders `null`, control and all. Prefer
 *                      nothing (PATTERN §4).
 *  8. error          — does not apply. It reports nothing.
 *  9. selected       — does not apply. Expanded is not selected: it is a
 *                      view state, and it is exposed as `aria-expanded` on
 *                      the control rather than as an appearance on the copy.
 * 10. read-only      — always. A clamp displays; it never edits.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in the line COUNT, which is the
 *  deliberate part: the same three lines hold at every width, so the same
 *  block is cut in the same place and a reader who opened it on a phone finds
 *  the same copy on a laptop. What does change on its own, with no breakpoint
 *  written, is how much text those three lines hold — the block inherits its
 *  measure from the parent, so a narrow column simply fits fewer words in
 *  each line and the control appears sooner. The measurement effect
 *  re-observes on resize, so the control appears and disappears correctly
 *  when the window is dragged across a breakpoint.
 *
 * RTL — safe. `-webkit-line-clamp` cuts at the end of the line in the
 * writing direction and places its ellipsis there, so the truncation mirrors
 * with the document. The control sits under the copy on the block axis, which
 * does not mirror. No inline side is named anywhere in this file.
 */
const Clamp = React.forwardRef<HTMLDivElement, ClampProps>(
  (
    {
      className,
      lines = 3,
      moreLabel = "Show more",
      lessLabel = "Show less",
      collapsible = true,
      expanded: expandedProp,
      defaultExpanded = false,
      onExpandedChange,
      children,
      ...props
    },
    ref,
  ) => {
    const bodyId = React.useId();
    const bodyRef = React.useRef<HTMLDivElement>(null);

    const [uncontrolled, setUncontrolled] = React.useState(defaultExpanded);
    const expanded = expandedProp ?? uncontrolled;

    /* Sticky: once the copy has been seen to overflow, the control stays. An
       expanded block does not overflow — its scrollHeight and clientHeight
       are equal — so re-measuring while open would remove the very control
       that closes it again. */
    const [overflowing, setOverflowing] = React.useState(false);

    React.useEffect(() => {
      if (expanded) return;
      const element = bodyRef.current;
      if (!element) return;

      const measure = () => {
        // A one-unit tolerance: sub-pixel line-height rounding makes an
        // exactly-fitting block report a scrollHeight one greater than its
        // clientHeight in every engine.
        setOverflowing(element.scrollHeight - element.clientHeight > 1);
      };

      measure();

      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }, [expanded, lines, children]);

    // Empty: prefer nothing (PATTERN §4).
    if (React.Children.count(children) === 0) return null;

    const toggle = () => {
      const next = !expanded;
      if (expandedProp === undefined) setUncontrolled(next);
      onExpandedChange?.(next);
    };

    const showToggle = collapsible && overflowing;

    return (
      <div
        ref={ref}
        data-slot="clamp"
        data-expanded={expanded ? "" : undefined}
        className={cn("flex min-w-0 flex-col gap-[var(--space-1h)]", className)}
        {...props}
      >
        <div
          ref={bodyRef}
          id={bodyId}
          data-slot="clamp-body"
          /* The line count arrives as a custom property so the utility can
             stay a single static class Tailwind can see, while the value
             stays a prop. A unitless integer — there is no length here to
             become a px. */
          style={{ "--clamp-lines": lines } as React.CSSProperties}
          className={cn(
            "min-w-0",
            expanded ? "line-clamp-none" : "line-clamp-[var(--clamp-lines)]",
          )}
        >
          {children}
        </div>

        {showToggle ? (
          <button
            type="button"
            data-slot="clamp-toggle"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls={bodyId}
            /* `.kw-link`'s skin, borrowed rather than redrawn: the link
               variant's compound class already strips the height and the
               padding, so this is a word in the flow and not a pill. The
               ink is stepped down to secondary because the control is
               subordinate to the copy above it. */
            className={cn(
              buttonVariants({ variant: "link" }),
              "self-start text-caption text-ink-secondary underline",
            )}
          >
            {expanded ? lessLabel : moreLabel}
          </button>
        ) : null}
      </div>
    );
  },
);

Clamp.displayName = "Clamp";

export { Clamp };
