/* ============================================================================
   Dialog — the modal (115 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → CH20 `.kw-scrim`,
   `.kw-modal`, `.kw-modal__title`, `.kw-modal__body`, `.kw-modal__row`.
   The close chip is `.kw-drawer__close` from the same chapter — the kit draws
   a close control on the drawer and not on the modal, and the modal needs one.
   Motion is motion/motion.css §3 (`.motion-scrim`, `.motion-dialog`).
   Not shadcn. Where the two disagree, the kwapso specimen wins.

   THE LAW THIS FILE OBEYS
   · The overlay surface is `--popover` at `--radius` (24) under
     `--shadow-overlay`. One radius, one elevation, no blur, no border.
     (The kit's own `.kw-modal` says `--surface-page`; the batch's binding law
      and tokens.css both say `--popover`. Both sides in GAPS-A.md OVL-1.)
   · Focus is ONE global rule (tokens.css §8). This file defines no ring and
     never writes an outline reset. Radix's own focus trap moves the caret in;
     the ring that shows where it landed is the token layer's.
   · No duration, no curve, no keyframe is written here. `.motion-scrim` and
     `.motion-dialog` already carry both directions and read Radix's
     `data-state`, so one class covers open and close.
   · Every string is a prop with a default — `closeLabel` is the only one this
     file holds, and it exists because a close control with no accessible name
     is unusable in Arabic, Urdu or Persian just as it is in English.
   · Logical properties only. The dialog is centred by a grid, not by a
     translate, so nothing here has an inline direction at all.

   RENDERING CONTEXT
   `"use client"`. Radix Dialog holds open state, portals to the document and
   attaches document-level listeners; it cannot render in a Server Component.
   ========================================================================= */

"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "../../lib/utils";
import { X } from "../../foundations/icons";

/* ----------------------------------------------------------------------------
   The scrim. Kit-stated as charcoal at 36%, with no dark twin drawn and the
   note "kept identical" — so it must stay charcoal in BOTH palettes, which is
   why it cannot be mixed from `--foreground` or `--surface-inverse` (both of
   those flip to off-beige in dark and would produce a white scrim).

   `--kw-charcoal` is the raw palette layer, which tokens.css §2 marks as
   internal. Reaching it here is deliberate and logged: there is no `--scrim`
   token and no semantic token that is charcoal in both themes. GAPS-A.md
   OVL-2. `color-mix` keeps the 36% in the stylesheet rather than baking a
   fourth colour value into a component.

   z: the kit puts the modal scrim at 60 and the drawer scrim at 55. Kept.
   ------------------------------------------------------------------------- */
const SCRIM = [
  "fixed inset-0 z-[60]",
  "bg-[color-mix(in_srgb,var(--kw-charcoal)_36%,transparent)]",
  "motion-scrim",
] as const;

/* ----------------------------------------------------------------------------
   The positioner. A grid that centres its one child, sitting inside the same
   inset as the scrim so the dialog can never touch the viewport edge.

   Why a wrapper rather than the usual `top-1/2 -translate-y-1/2`: a translate
   utility on the content would fight `.motion-dialog`, whose keyframes own
   `transform`, and the loser is decided by stylesheet order. It also removes
   every physical inset from this file — a grid centres identically in RTL.

   `pointer-events-none` so a click in the gutter still lands on the scrim
   below and dismisses; the content turns them back on for itself.

   WHY THE TRACK IS SPELLED OUT — `grid-cols-[minmax(0,auto)]`.
   A bare `grid` makes ONE implicit column whose sizing function is `auto`.
   An `auto` track's base size is its item's min-content CONTRIBUTION, and a
   grid item that declares a definite `width` contributes that width — 460 —
   in both directions, because its `max-width: 100%` is cyclic during
   intrinsic sizing and is dropped. So the track was sized to 460, and a track
   is never shrunk below its base size. `max-width: 100%` then resolved
   against the GRID AREA — the 460 track — which is the dialog's own width, so
   the rule was self-referential and could never bite. Measured at a real 380
   viewport: the surface stayed 431.25 wide (rem is 15px here, so 28.75rem is
   431.25), its right edge landed at 453.75, and the close chip sat at 401 —
   entirely past the viewport, unreachable.

   `minmax(0, auto)` gives the track a base size of 0 and a growth limit of
   max-content, so it grows to the available 335 and stops. `max-width: 100%`
   now resolves against 335 and the surface fits. Re-measured: 335 wide, right
   edge 357.5, close chip on screen.

   NOT `min-width: 0` on the content: that was tried and changes nothing. The
   automatic minimum size was never the binding constraint — min-content here
   is 228.5, far under the available width. The track was the whole defect.
   ------------------------------------------------------------------------- */
const POSITIONER = [
  "pointer-events-none fixed inset-0 z-[60]",
  "grid grid-cols-[minmax(0,auto)] place-items-center",
  // Mobile takes the panel inset (24), tablet and up take the kit's scrim
  // inset (32). See the breakpoint note on DialogContent.
  "p-[var(--space-6)] sm:p-[var(--space-7)]",
] as const;

/* `.kw-modal` — 460 wide, box radius, overlay shadow, 32 inset. `max-w-full`
   is the kit's own rule, so the same class is the phone treatment. */
const CONTENT = [
  "pointer-events-auto relative flex w-[28.75rem] max-w-full flex-col",
  "max-h-full overflow-y-auto",
  "bg-popover text-popover-foreground",
  "rounded-[var(--radius)] shadow-xl", // shadow-xl is bridged to --shadow-overlay
  "p-[var(--space-7)]",
  "motion-dialog",
] as const;

/* `.kw-drawer__close` — a 32 pill in the panel tone carrying secondary ink.
   The kit states no hover for it; `--surface-quiet` is one defined step from
   `--surface-panel` in both palettes (it darkens in light, lifts in dark), so
   the hover is a named tone rather than a fade. GAPS-A.md OVL-3. */
const OVERLAY_CLOSE = [
  "absolute top-[var(--space-6)] end-[var(--space-6)] z-[1]",
  "inline-grid size-[var(--control-height-dense)] place-content-center",
  "cursor-pointer rounded-pill border-0",
  "bg-surface-panel text-ink-secondary",
  "hover:bg-surface-quiet hover:text-foreground",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
] as const;

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Draw the built-in close chip. Default `true`. Set `false` for a dialog
   * whose only exits are its own footer buttons — a destructive confirmation
   * that must be answered belongs in `alert-dialog`, not here, but a wizard
   * step that owns its own chrome is a real case.
   */
  showClose?: boolean;
  /**
   * The close chip's accessible name. A default is given so no call site can
   * ship a nameless button, and it is a prop because the apps run in Arabic,
   * Urdu and Persian.
   */
  closeLabel?: string;
}

/**
 * The modal surface. Renders its own scrim and portal, so a call site writes
 * `<Dialog><DialogTrigger/><DialogContent>…</DialogContent></Dialog>` and
 * nothing else.
 *
 * TEN STATES
 *  1. default        — `--popover` at 24 under `--shadow-overlay`, 32 inset,
 *                      over a charcoal 36% scrim.
 *  2. hover          — does not apply to the surface. The only hoverable thing
 *                      this file draws is the close chip, which moves from
 *                      `--surface-panel` to `--surface-quiet`. A colour swap,
 *                      never a fade.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Radix moves focus into the dialog and traps it; this
 *                      file adds no ring and no outline reset.
 *  4. active/pressed — does not apply. A surface is not pressed.
 *  5. disabled       — does not apply. A dialog is open or it is not; there is
 *                      no disabled modal. A form inside it disables its own
 *                      controls, which is `button` and `input`'s job.
 *  6. loading        — does not apply to the surface, deliberately. A dialog
 *                      that is waiting keeps its own frame and shows the wait
 *                      in its body (`skeleton`) or on its submit control
 *                      (`Button loading`). Blanking the whole modal would
 *                      destroy the reader's place. Stated, not omitted.
 *  7. empty          — does not apply. A dialog with no children is a bug at
 *                      the call site, not a state to draw; Radix still
 *                      requires a `DialogTitle` for the accessibility tree.
 *  8. error          — does not apply to the surface. An error belongs to the
 *                      field that failed or to an `alert` in the body; a poppy
 *                      modal frame would colour the whole conversation.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile   — the gutter drops to `--space-6` (24) so the 460 surface has room;
 *             `max-w-full` then makes the dialog as wide as that gutter allows,
 *             which is the kit's own `max-width: 100%`. The 32 inset INSIDE the
 *             dialog is unchanged: shrinking it would break the one measurement
 *             the kit does state.
 *  tablet   — gutter at the kit's `--space-7` (32) from `sm` (40rem) up. The
 *             surface reaches its full 460 and stops growing.
 *  desktop  — UNCHANGED from tablet. A modal does not widen with the viewport;
 *             a 460 measure is the design.
 *  At every width the surface scrolls inside itself (`max-h-full
 *  overflow-y-auto`) rather than pushing the page, so a long dialog on a phone
 *  in landscape stays reachable.
 *
 * RTL — safe. The dialog is centred by `place-items-center`, not by a
 * translate, and the close chip is placed with `end-*`. No physical side is
 * named anywhere in this file.
 */
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, showClose = true, closeLabel = "Close", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn(SCRIM)} />
    <div data-slot="dialog-positioner" className={cn(POSITIONER)}>
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        className={cn(CONTENT, className)}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            data-slot="dialog-close-button"
            aria-label={closeLabel}
            className={cn(OVERLAY_CLOSE)}
          >
            <X size={16} />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </div>
  </DialogPrimitive.Portal>
));

DialogContent.displayName = "DialogContent";

/**
 * Title and description, stacked. `.kw-modal` puts the body 10 under the
 * title; that gap is this element's whole design.
 *
 * The inline-end padding reserves the close chip's corner so a long title
 * never runs under it. It is unconditional because a header cannot see
 * whether its content drew a close.
 *
 * TEN STATES — none apply. This is a layout block with no interaction and no
 * data of its own: no hover, no focus, no pressed, no disabled, no loading, no
 * empty (a header with no children collapses to nothing, which is correct), no
 * error, no selected, no read-only.
 *
 * THREE BREAKPOINTS — UNCHANGED. A two-element stack has nothing to restack.
 *
 * RTL — safe. `pe-*` is padding-inline-end.
 */
const DialogHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn("flex flex-col gap-[var(--space-2h)] pe-[var(--space-9)]", className)}
      {...props}
    />
  ),
);

DialogHeader.displayName = "DialogHeader";

/**
 * The action row. `.kw-modal__row`: a flex row, gap 12, sitting 24 under the
 * body. Start-aligned with the primary FIRST — that is the kit's drawing, and
 * it is the one place this component deliberately parts from the shadcn shape
 * it replaces (which pushes the buttons to the end). Noted in GAPS-A.md OVL-4
 * because it changes the look of 115 call sites without changing their code.
 *
 * TEN STATES — none apply. The row draws nothing; its children are Buttons and
 * they carry all ten themselves.
 *
 * THREE BREAKPOINTS — UNCHANGED in direction: the row stays a row at every
 * width and wraps rather than stacking, because two 40-tall pills fit side by
 * side at 320 and a stacked pair reads as a list of options rather than as a
 * choice. `flex-wrap` is the only concession, for a three-button footer on a
 * phone.
 *
 * RTL — safe. `gap` and flex order follow the document direction.
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
const DialogFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn("mt-[var(--space-6)] flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end", className)}
      {...props}
    />
  ),
);

DialogFooter.displayName = "DialogFooter";

/**
 * `.kw-modal__title` — the h3 step (24/500) with its own tracking, which
 * `text-2xl` now carries in one class.
 *
 * TEN STATES — none apply; it is a heading. Radix requires it for the dialog's
 * accessible name, so it is never absent.
 * THREE BREAKPOINTS — UNCHANGED. The kit states one modal title size.
 * RTL — safe. No inset, no direction.
 */
const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn("text-2xl font-[var(--font-weight-medium)] text-foreground", className)}
    {...props}
  />
));

DialogTitle.displayName = "DialogTitle";

/**
 * `.kw-modal__body` — 14/300 in secondary ink at the normal leading, all three
 * of which `text-sm` sets in one class.
 *
 * TEN STATES — none apply; it is prose.
 * THREE BREAKPOINTS — UNCHANGED. Its measure is the dialog's 460, which is
 * already inside the kit's reading measure at every width.
 * RTL — safe.
 */
const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn("text-sm text-ink-secondary", className)}
    {...props}
  />
));

DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
