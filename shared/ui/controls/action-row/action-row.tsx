/* ============================================================================
   ActionRow — the row of controls under a block (0 direct call sites).

   DESIGN SOURCE
   The kit draws this row four times and draws it the same way each time:

     · kwapso-patterns.css → `.kw-register__row`
       `display: flex; gap: var(--space-3); margin-top: var(--space-5);`
     · specimens/_fragments/t21.css → `.kw-errorpage__row`
       `display: flex; flex-wrap: wrap; align-items: center;
        gap: var(--space-3); margin-top: var(--space-5);`
     · `.kw-modal__row` / `.kw-drawer__foot` — the same row at
       `margin-top: var(--space-6)`
     · kit chapter 13, the card footer — a control at the start and a quiet
       meta line pushed to the other end, `gap: 12`

   All four agree on gap 12 (`--space-3`), on wrapping, and on being START
   aligned. They disagree only on the margin above them, which is why this
   component carries none — see below.

   THE LAW THIS FILE OBEYS
   · Gap is `--space-3` (12), the kit's control gap, in every drawing.
   · The row WRAPS; it does not stack. Two 40-tall pills fit side by side at a
     320 viewport, and a stacked pair reads as a list of options rather than
     as a choice. The one exception is `align="end"`, which follows the
     ruling recorded in GAPS.md as OVL-4 CLOSED — see that variant.
   · No margin of its own. Three kit drawings put 20 above this row and one
     puts 24, so the offset is not a property of the row; it belongs to the
     block above it, and `Spacer` exists for exactly that.
   · Logical properties only. The kit pushes a trailing item with
     `margin-left: auto`; `align="between"` and `Spacer grow` are the two
     direction-safe replacements, and neither names a side.
   · Focus is ONE global rule (tokens.css §8). The children are Buttons and
     carry it; this row defines nothing.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const actionRowVariants = cva(
  [
    // `gap: var(--space-3)` — 12, in all four kit drawings.
    "flex gap-3",
    // A row of pills must not be squeezed by a narrow parent.
    "min-w-0",
  ],
  {
    variants: {
      align: {
        /**
         * The kit's own row: start-aligned, wrapping, items centred on the
         * cross axis. `.kw-register__row` and `.kw-errorpage__row` exactly.
         */
        start: "flex-row flex-wrap items-center",
        /**
         * The committed-action row, matching `DialogFooter`,
         * `AlertDialogFooter` and `SheetFooter` shape for shape.
         *
         * This is NOT the kit's drawing. It is the ruling recorded in
         * GAPS.md as "OVL-4 · CLOSED — modal footer is end-aligned, primary
         * last", made against `verify/modal-decisions.html`: the 229 existing
         * footers in the two apps are written cancel-first, so the kit's
         * start-aligned primary-first row would have silently reversed how
         * every one of them reads.
         *
         * Below `sm:` the stack is REVERSED so the primary sits on top while
         * staying last in the DOM — reading order and tab order both still
         * end on the commit control.
         */
        end: "flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
        /**
         * A control at each end — chapter 13's card footer, where an action
         * sits at the start and a quiet meta line at the other end. Added,
         * not required; without it a call site would reach for
         * `margin-left: auto` and break under `dir="rtl"`.
         */
        between: "flex-row flex-wrap items-center justify-between",
      },
    },
    defaultVariants: { align: "start" },
  },
);

export interface ActionRowProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof actionRowVariants> {}

/**
 * A row of controls.
 *
 * TEN STATES — the row itself has none, and that is the honest answer rather
 * than an omission. It paints no fill, no ink, no radius and no stroke; it is
 * a flex context. Every one of the ten belongs to the Buttons inside it,
 * which carry them already:
 *  1. default        — the children's.
 *  2. hover          — the children's (`--btn-*-hover`).
 *  3. focus-visible  — NOT here. tokens.css §8 rings the children.
 *  4. active/pressed — the children's.
 *  5. disabled       — the children's, as a fill and an ink.
 *  6. loading        — the children's; `Button loading` keeps its fill and
 *                      grows a spinner.
 *  7. empty          — no children renders `null`. An empty row leaves a
 *                      12-tall gap under a block for nothing.
 *  8. error          — does not apply. A row reports nothing.
 *  9. selected       — does not apply. A row of actions is not a choice; the
 *                      selectable row of controls is `toggle-group`.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  · `align="start"` and `align="between"` — UNCHANGED at all three widths.
 *    They stay a row and WRAP. Two pills fit side by side at 320; a stacked
 *    pair reads as a list rather than as a choice.
 *  · `align="end"` — CHANGES at `sm:` (40rem), and this is the only
 *    breakpoint in the batch that is inherited rather than derived. Below
 *    40rem it is a reversed column, so a commit control spans the row and is
 *    reachable with a thumb; at 40rem and above it becomes the wrapping,
 *    end-aligned row. Taken verbatim from `DialogFooter` so that a footer
 *    inside a card and a footer inside a modal do not part company at the
 *    same viewport width.
 *
 * RTL — safe. `justify-end` is `flex-end` on the inline axis, which follows
 * the document direction; `justify-between` needs nothing; the gap and the
 * flex order mirror on their own. Nothing here is a physical side, which is
 * the whole reason this component exists rather than an `ml-auto` at 229 call
 * sites.
 */
const ActionRow = React.forwardRef<HTMLDivElement, ActionRowProps>(
  ({ className, align = "start", children, ...props }, ref) => {
    // Empty: prefer nothing (PATTERN §4).
    if (React.Children.count(children) === 0) return null;

    return (
      <div
        ref={ref}
        data-slot="action-row"
        data-align={align ?? "start"}
        className={cn(actionRowVariants({ align }), className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

ActionRow.displayName = "ActionRow";

export { ActionRow, actionRowVariants };
