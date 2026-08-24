/* ============================================================================
   AlertDialog — the modal that must be answered (96 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → CH20 `.kw-scrim`,
   `.kw-modal`, `.kw-modal__title`, `.kw-modal__body`, `.kw-modal__row`.
   The kit draws ONE modal. An alert dialog is that modal with no close chip
   and a mandatory pair of answers, so this file is the same surface as
   `dialog/` with a different contract, not a second drawing.
   The two answers are `.kw-btn--primary` and `.kw-btn--cancel`, reached
   through `buttonVariants` so there is exactly one button skin in the system.
   Motion is motion/motion.css §3 (`.motion-scrim`, `.motion-dialog`).

   THE LAW THIS FILE OBEYS
   · Same overlay law as `dialog`: `--popover` at `--radius` (24) under
     `--shadow-overlay`, no blur, no border. GAPS-A.md OVL-1 records that the
     kit's own `.kw-modal` says `--surface-page` and the binding law says
     `--popover`.
   · NO close chip and no dismiss-on-scrim-click. That is the whole difference
     between this and `dialog`: an alert asks a question that has to be
     answered, so the only exits are the two buttons. Escape is left to Radix,
     which routes it to Cancel — a keyboard user must never be trapped.
   · A destructive answer is CHARCOAL ON POPPY, never white on red. That comes
     free from `buttonVariants({ variant: "destructive" })`; this file adds no
     colour of its own to a button.
   · Focus is ONE global rule (tokens.css §8). No ring here.
   · Every string is a prop with a default.

   RENDERING CONTEXT
   `"use client"`. Radix AlertDialog holds state, portals, and traps focus.
   ========================================================================= */

"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { buttonVariants } from "../button/button";

/* The kit's modal scrim: charcoal at 36%, identical in both palettes, at z 60.
   `--kw-charcoal` is reached deliberately — see GAPS-A.md OVL-2, and the same
   note at the top of dialog/dialog.tsx. */
const SCRIM = [
  "fixed inset-0 z-[60]",
  "bg-[color-mix(in_srgb,var(--kw-charcoal)_36%,transparent)]",
  "motion-scrim",
] as const;

/* Centred by a grid, not by a translate: `.motion-dialog` owns `transform`,
   and a translate utility on the same element would race it. A grid is also
   the only centring with no physical side in it.

   The track is spelled out for the same reason as `dialog/dialog.tsx` — the
   full derivation is in that file's POSITIONER note. Short version: a bare
   `grid`'s implicit `auto` track was sized to the item's declared 460, so the
   item's `max-width: 100%` resolved against its own width and never bit. This
   file carried the identical positioner and the identical defect; measured at
   a real 380 viewport the alert surface was 431.25 wide with its right edge at
   453.75. `minmax(0, auto)` caps the track at the available 335. */
const POSITIONER = [
  "pointer-events-none fixed inset-0 z-[60]",
  "grid grid-cols-[minmax(0,auto)] place-items-center",
  "p-[var(--space-6)] sm:p-[var(--space-7)]",
] as const;

/* `.kw-modal` — 460, box radius, overlay shadow, 32 inset. */
const CONTENT = [
  "pointer-events-auto relative flex w-[28.75rem] max-w-full flex-col",
  "max-h-full overflow-y-auto",
  "bg-popover text-popover-foreground",
  "rounded-[var(--radius)] shadow-xl", // shadow-xl is bridged to --shadow-overlay
  "p-[var(--space-7)]",
  "motion-dialog",
] as const;

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

/**
 * The alert surface. Renders its own scrim and portal.
 *
 * TEN STATES
 *  1. default        — `--popover` at 24 under `--shadow-overlay`, 32 inset,
 *                      over the charcoal 36% scrim.
 *  2. hover          — does not apply to the surface. This file draws no
 *                      hoverable element of its own; the two answers are
 *                      Buttons and carry `--btn-*-hover`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Radix parks initial focus on Cancel, which is the safe
 *                      answer, and traps the tab ring inside.
 *  4. active/pressed — does not apply to the surface; the answers nudge 1
 *                      hairline, which is `button`'s behaviour.
 *  5. disabled       — does not apply to the surface. An answer that must not
 *                      be taken yet is a disabled Button, which is a fill and
 *                      an ink, never an opacity.
 *  6. loading        — does not apply to the surface, and deliberately: an
 *                      alert that is committing keeps its frame and its
 *                      question, and shows the wait on the answer —
 *                      `<AlertDialogAction asChild><Button loading>…`.
 *                      Emptying the modal mid-commit would remove the sentence
 *                      the reader just agreed to.
 *  7. empty          — does not apply. An alert with no question is a bug at
 *                      the call site; Radix requires a Title regardless.
 *  8. error          — does not apply to the surface. A failed commit is
 *                      reported by an `alert` in the body or a toast, never by
 *                      recolouring the modal frame.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile   — gutter drops to `--space-6` (24); `max-w-full` lets the 460
 *             surface shrink to fit, which is the kit's own `max-width: 100%`.
 *             The 32 inset inside the modal is unchanged.
 *  tablet   — gutter at the kit's `--space-7` (32) from `sm` (40rem) up; the
 *             surface reaches 460 and stops.
 *  desktop  — UNCHANGED from tablet. An alert does not widen; the shorter the
 *             measure, the faster the question is read.
 *
 * RTL — safe. Grid centring, no physical inset, no translate.
 */
const AlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay data-slot="alert-dialog-overlay" className={cn(SCRIM)} />
    <div data-slot="alert-dialog-positioner" className={cn(POSITIONER)}>
      <AlertDialogPrimitive.Content
        ref={ref}
        data-slot="alert-dialog-content"
        className={cn(CONTENT, className)}
        {...props}
      />
    </div>
  </AlertDialogPrimitive.Portal>
));

AlertDialogContent.displayName = "AlertDialogContent";

/**
 * Question and consequence, stacked at the kit's 10 gap. No inline-end reserve
 * here — unlike `DialogHeader` there is no close chip to avoid.
 *
 * TEN STATES — none apply. A layout block with no interaction and no data.
 * THREE BREAKPOINTS — UNCHANGED. A two-element stack has nothing to restack.
 * RTL — safe.
 */
const AlertDialogHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-[var(--space-2h)]", className)}
      {...props}
    />
  ),
);

AlertDialogHeader.displayName = "AlertDialogHeader";

/**
 * `.kw-modal__row` — flex, gap 12, 24 under the body, start-aligned with the
 * primary answer first. See GAPS-A.md OVL-4: the shadcn shape this replaces
 * pushes its buttons to the end, and the kit does not.
 *
 * TEN STATES — none apply; the row draws nothing. Its children are Buttons.
 * THREE BREAKPOINTS — UNCHANGED in direction; `flex-wrap` is the only
 * concession so a long pair of labels does not overflow a 320 phone.
 * RTL — safe. Order follows the document.
 *
 * RULED 2026-08-22 (verify/modal-decisions.html, answer 1B): the footer is
 * END-ALIGNED with the primary action LAST. The kit draws `.kw-modal__foot`
 * start-aligned with the primary written first, and that was built for a day;
 * it was overruled by looking at it. Two reasons it loses: the 229 existing
 * footers are written cancel-first, so the kit order would have silently
 * re-read every one of them, and end-aligned-primary-last is the web/Windows
 * convention these apps already teach their users.
 *
 * `flex-col-reverse` below the sm breakpoint puts the primary on TOP of the
 * stack while keeping it last in the DOM — so the reading order and the tab
 * order still end on the commit control, which is what a keyboard user
 * expects. Departure from the kit logged in GAPS.md as OVL-4.
 */
const AlertDialogFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert-dialog-footer"
      className={cn("mt-[var(--space-6)] flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end", className)}
      {...props}
    />
  ),
);

AlertDialogFooter.displayName = "AlertDialogFooter";

/**
 * `.kw-modal__title` — the h3 step (24/500) with its tracking.
 * TEN STATES — none apply; it is the accessible name of the dialog.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe.
 */
const AlertDialogTitle = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    data-slot="alert-dialog-title"
    className={cn("text-2xl font-[var(--font-weight-medium)] text-foreground", className)}
    {...props}
  />
));

AlertDialogTitle.displayName = "AlertDialogTitle";

/**
 * `.kw-modal__body` — 14/300, secondary ink, normal leading.
 * TEN STATES — none apply; it is prose.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe.
 */
const AlertDialogDescription = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    data-slot="alert-dialog-description"
    className={cn("text-sm text-ink-secondary", className)}
    {...props}
  />
));

AlertDialogDescription.displayName = "AlertDialogDescription";

/* ----------------------------------------------------------------------------
   The two answers.

   Both take the system's ONE button skin through `buttonVariants`, so a change
   to the button changes them. `variant` and `size` are accepted and forwarded
   to the skin, not to the DOM — a call site that already writes
   `className={buttonVariants({ variant: "destructive" })}` (the shadcn idiom
   these 96 call sites were written against) still works, because `className`
   is merged last and wins.
   ------------------------------------------------------------------------- */

export interface AlertDialogActionProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>,
    VariantProps<typeof buttonVariants> {}

/**
 * The answer that commits. Mango by default — it is the one brand fill, and
 * this is the one place in an alert that earns it. Pass
 * `variant="destructive"` for a delete: charcoal on poppy, per the accent law.
 *
 * TEN STATES — all ten are `button`'s, unchanged, because this IS a Button
 * skin on Radix's Action element. Disabled is a fill and an ink; hover is
 * `--btn-*-hover`; focus is the one global ring; pressed is the 1-hairline
 * nudge. Nothing is redefined here.
 *
 * THREE BREAKPOINTS — UNCHANGED. One control height at every width.
 * RTL — safe; the skin's insets are all logical.
 */
const AlertDialogAction = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Action>,
  AlertDialogActionProps
>(({ className, variant = "default", size = "default", ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    data-slot="alert-dialog-action"
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
));

AlertDialogAction.displayName = "AlertDialogAction";

export interface AlertDialogCancelProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>,
    VariantProps<typeof buttonVariants> {}

/**
 * The answer that walks away. `.kw-btn--cancel` — the kit draws a named
 * variant for exactly this position, so nothing is derived: it is a filled
 * button in the quiet tone with secondary ink, never an outline and never a
 * bare link.
 *
 * TEN STATES — `button`'s ten, unchanged.
 * THREE BREAKPOINTS — UNCHANGED.
 * RTL — safe.
 */
const AlertDialogCancel = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Cancel>,
  AlertDialogCancelProps
>(({ className, variant = "cancel", size = "default", ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    data-slot="alert-dialog-cancel"
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
));

AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
