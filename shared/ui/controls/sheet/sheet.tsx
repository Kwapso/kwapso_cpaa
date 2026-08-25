/* ============================================================================
   Sheet — the drawer (18 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → CH20 `.kw-scrim--drawer`,
   `.kw-drawer`, `.kw-drawer__head`, `.kw-drawer__title`, `.kw-drawer__close`,
   `.kw-drawer__body`, `.kw-drawer__foot`.
   The kit draws exactly one drawer: 420 wide, anchored to the inline end,
   rounded on its inner edge only, head and foot fixed with a hairline each and
   the body scrolling between them. Top and bottom are derived — GAPS-A.md
   SHT-2. Motion is motion/motion.css §3 (`.motion-scrim`, `.motion-sheet`).

   THE LAW THIS FILE OBEYS
   · The drawer is a THREE-PART FRAME, not a padded box: the head and the foot
     do not move and the body scrolls. That is why `SheetContent` carries no
     padding of its own and hands the drawer's 24 inset to whatever sits
     between the head and the foot.
   · The radius is on the INNER edge only (`--radius`, 24) — the edge the page
     shows through. The three outer edges meet the viewport square.
   · Overlay surface is `--popover` under `--shadow-overlay`. The kit's own
     `.kw-drawer` says `--surface-page`; both sides are in GAPS-A.md OVL-1.
   · The drawer scrim is LIGHTER than the modal scrim — 28% against 36% — and
     sits under it at z 55 against 60. Kit-stated, both of them: a drawer is a
     side channel, a modal is a stop.
   · Focus is ONE global rule (tokens.css §8). No ring here.
   · Every string is a prop with a default.

   THE ONE PLACE A PHYSICAL DIRECTION IS PART OF THE API
   `side` keeps its four values because 18 call sites already pass them. The
   POSITIONING is logical (`start-0` / `end-0`), so `side="left"` means "the
   reading-start edge" and mirrors with the document in Arabic, Urdu and
   Persian. motion/motion.css §3 currently reads `left` as physically left and
   says outright that there is nothing to flip for RTL, so the entrance
   direction and the anchored edge disagree under `dir="rtl"`. This file cannot
   fix that — motion.css is not its to edit. Logged as GAPS-A.md SHT-1 with the
   three lines that would close it.

   RENDERING CONTEXT
   `"use client"`. Radix Dialog (the drawer is a dialog) holds state, portals
   and traps focus.
   ========================================================================= */

"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { X } from "../../icons";

/* `.kw-scrim--drawer` — charcoal at 28%, z 55, no dark twin drawn and none
   invented (the kit's note is "kept identical"). `--kw-charcoal` is the raw
   palette layer and is reached deliberately: no semantic token stays charcoal
   in both palettes. GAPS-A.md OVL-2. */
const SCRIM = [
  "fixed inset-0 z-[55]",
  "bg-[color-mix(in_srgb,var(--kw-charcoal)_28%,transparent)]",
  "motion-scrim",
] as const;

const sheetVariants = cva(
  [
    // The frame. Head and foot are fixed, the body scrolls — hence a column
    // flex rather than a padded block.
    "fixed z-[55] flex flex-col",
    "bg-popover text-popover-foreground",
    "shadow-xl", // bridged to --shadow-overlay
    // Motion is attached, never restated. `.motion-sheet` reads data-side and
    // data-state, both of which are set below.
    "motion-sheet",

    /* The drawer body. `.kw-drawer__body` is 24 inset, scrolling, and takes
       the remaining height. There is no `SheetBody` export to hang it on — the
       commission lists eight symbols and a ninth is a symbol 18 call sites do
       not pass — so the treatment goes to every direct child this file did not
       put there itself. Everything this file renders carries a `sheet-*` slot
       (head, foot, close chip); a call site's own children do not, so
       `<SheetContent><SheetHeader/>{rows}<SheetFooter/></SheetContent>` gets
       the kit's drawer with no extra classes, which is the delivery test. */
    "[&>*:not([data-slot^=sheet-])]:min-h-0",
    "[&>*:not([data-slot^=sheet-])]:flex-1",
    "[&>*:not([data-slot^=sheet-])]:overflow-y-auto",
    "[&>*:not([data-slot^=sheet-])]:p-[var(--space-6)]",
  ],
  {
    variants: {
      /**
       * Which edge the drawer is anchored to. Positioned logically, so `left`
       * and `right` are the reading-start and reading-end edges — see the
       * note at the top of this file and GAPS-A.md SHT-1.
       *
       * The radius is on the inner edge only in all four cases: the kit draws
       * `border-radius: var(--radius-card) 0 0 var(--radius-card)` on an
       * end-anchored drawer, which is "round the edge the page shows past".
       */
      side: {
        /** The reading-start edge. Kit width 420; `max-w-full` is the kit's own. */
        left: "inset-y-0 start-0 h-full w-[26.25rem] max-w-full rounded-e-[var(--radius)]",
        /** The reading-end edge — the drawer the kit actually draws. */
        right: "inset-y-0 end-0 h-full w-[26.25rem] max-w-full rounded-s-[var(--radius)]",
        /** Derived; the kit draws no horizontal drawer. GAPS-A.md SHT-2. */
        top: "inset-x-0 top-0 w-full max-h-[85dvh] rounded-b-[var(--radius)]",
        /** Derived; the kit draws no horizontal drawer. GAPS-A.md SHT-2. */
        bottom: "inset-x-0 bottom-0 w-full max-h-[85dvh] rounded-t-[var(--radius)]",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

/* `.kw-drawer__close` — a 32 pill in the panel tone carrying secondary ink.
   The kit states no hover; `--surface-quiet` is one defined step from
   `--surface-panel` in both palettes. GAPS-A.md OVL-3. */
const OVERLAY_CLOSE = [
  "absolute top-[var(--space-6)] end-[var(--space-6)] z-[1]",
  "inline-grid size-[var(--control-height-dense)] place-content-center",
  "cursor-pointer rounded-pill border-0",
  "bg-surface-panel text-ink-secondary",
  "hover:bg-surface-quiet hover:text-foreground",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
] as const;

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * This drawer is an INPUT SURFACE opened from inside a dialog — a picker's
   * search sheet — not a page drawer. Both the scrim and the panel take the
   * 70 layer ("anchored to a control, must clear a dialog"), because a page
   * surface under a dialog is correct and a picker under the very form asking
   * for it is the bug: reported from a handset on 25 Aug 2026, a client
   * picker whose sheet opened BEHIND the Sell-a-wave dialog — options
   * visible in a sliver at the screen's foot, nothing tappable. Radix already
   * routes dismissal to the topmost layer; this prop fixes the PAINT order,
   * which was the broken half.
   */
  overDialog?: boolean;
  /**
   * Draw the built-in close chip. Default `true` — the kit's drawer head has
   * one, and a drawer with no visible exit on a phone is a trap.
   */
  showClose?: boolean;
  /**
   * The close chip's accessible name. A default so no call site ships a
   * nameless button, and a prop so it can be translated.
   */
  closeLabel?: string;
}

/**
 * The drawer surface. Renders its own scrim and portal.
 *
 * TEN STATES
 *  1. default        — `--popover` under `--shadow-overlay`, 420 on the inline
 *                      end, rounded 24 on its inner edge, over a charcoal 28%
 *                      scrim.
 *  2. hover          — does not apply to the surface. The close chip moves
 *                      `--surface-panel` → `--surface-quiet`; rows inside the
 *                      body are `list`'s or `dropdown-menu`'s, not this file's.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Radix traps focus inside the drawer while it is open.
 *  4. active/pressed — does not apply to a surface.
 *  5. disabled       — does not apply. A drawer is open or closed. Controls
 *                      inside it carry their own disabled fill and ink.
 *  6. loading        — does not apply to the surface. A drawer that is
 *                      fetching keeps its frame and its title and puts a
 *                      `skeleton` in the body; blanking the frame would lose
 *                      the record the reader opened.
 *  7. empty          — does not apply to the frame. An empty body is the empty
 *                      register's job (chapter 21), placed as a child.
 *  8. error          — does not apply to the frame; a failed load is an
 *                      `alert` in the body. A poppy drawer edge would read as
 *                      the record being broken rather than the request.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply to the frame. A read-only record shows
 *                      read-only FIELDS, which `input` already draws by losing
 *                      its border.
 *
 * THREE BREAKPOINTS — the case that needed real thought.
 *  mobile   — `max-w-full` (the kit's own rule) makes a 420 drawer fill a 375
 *             phone, so it reads as a page rather than a panel. It is left
 *             full-bleed rather than inset for two reasons: the kit states
 *             `max-width: 100%` and nothing else, and an inset drawer on a
 *             phone puts the close chip inside the thumb-unreachable corner
 *             while wasting the only width there is. The inner-edge radius is
 *             KEPT at full bleed: it is the drawer's signature, and the 24
 *             corners let the dimmed page show through, which is the one cue
 *             that the record behind is still there. Head and foot stay fixed
 *             and the body still scrolls — that is what makes a full-height
 *             drawer usable one-handed.
 *  tablet   — UNCHANGED in kind, but the 420 now fits inside the viewport with
 *             the scrimmed page visible beside it, so the drawer stops being a
 *             page and starts being a panel with no class changing.
 *  desktop  — UNCHANGED. The drawer does not widen with the viewport; 420 is
 *             the measure the kit states and a wider drawer is a worse one.
 *  `top` and `bottom` cap at 85dvh at every width so the scrim is never fully
 *  covered — a sheet that reaches the opposite edge is a page, not a sheet.
 *
 * RTL — positioned with `start-*` / `end-*` and `rounded-s-*` / `rounded-e-*`,
 * so the drawer and its radius mirror with the document. The ENTRANCE does not
 * yet mirror: motion.css §3 reads `data-side="left"` as physically left. See
 * GAPS-A.md SHT-1.
 */
const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(
  (
    { className, children, side = "right", overDialog = false, showClose = true, closeLabel = "Close", ...props },
    ref,
  ) => (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className={cn(SCRIM, overDialog && "z-[70]")}
      />
      <SheetPrimitive.Content
        ref={ref}
        data-slot="sheet-content"
        /* `.motion-sheet` selects on this. Radix sets data-state itself. */
        data-side={side}
        data-over-dialog={overDialog || undefined}
        className={cn(sheetVariants({ side }), overDialog && "z-[70]", className)}
        {...props}
      >
        {children}
        {showClose ? (
          <SheetPrimitive.Close
            data-slot="sheet-close-button"
            aria-label={closeLabel}
            className={cn(OVERLAY_CLOSE)}
          >
            <X size={16} />
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  ),
);

SheetContent.displayName = "SheetContent";

/**
 * `.kw-drawer__head` — 24 inset with an 18 bottom, one hairline under it, and
 * it does not scroll. The hairline is a `border-b`, not an inset shadow: a
 * shadow would need a length written in this file and a border does not.
 *
 * The inline-end reserve keeps a long title clear of the close chip. It is
 * unconditional because a head cannot see whether its drawer drew one.
 *
 * TEN STATES — none apply. A fixed layout band with no interaction.
 * THREE BREAKPOINTS — UNCHANGED. The head is the same band at every width;
 * it is the thing that must NOT move when the body scrolls.
 * RTL — safe. `px-*`, `pe-*` and `border-b` have no side in them.
 */
const SheetHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-[var(--space-2h)]",
        /* Same-tone separation inside one shell — ch02 carve-out, drawn as
           the artifact draws it: an inset shadow, not a border (fix 2). */
        "shadow-[var(--hairline-under)]",
        "px-[var(--space-6)] pt-[var(--space-6)] pb-[var(--space-4h)]",
        "pe-[var(--space-9)]",
        className,
      )}
      {...props}
    />
  ),
);

SheetHeader.displayName = "SheetHeader";

/**
 * `.kw-drawer__foot` — pinned to the bottom (`mt-auto`), 16 above / 24 around,
 * one hairline over it, gap 12. Start-aligned with the primary first, which is
 * the kit's row. See GAPS-A.md OVL-4.
 *
 * TEN STATES — none apply; the row draws nothing. Its children are Buttons.
 * THREE BREAKPOINTS — UNCHANGED in direction; `flex-wrap` is the only
 * concession. The foot stays pinned at every width, which is the whole point
 * of a drawer on a phone: the commit control never scrolls away.
 * RTL — safe.
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
const SheetFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex shrink-0 flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
        /* The shell's second hairline, as an inset shadow (fix 2). */
        "shadow-[var(--hairline-over)]",
        "px-[var(--space-6)] pt-[var(--space-4)] pb-[var(--space-6)]",
        className,
      )}
      {...props}
    />
  ),
);

SheetFooter.displayName = "SheetFooter";

/**
 * `.kw-drawer__title` — the h4 step (20/500) with its tracking, which
 * `text-xl` sets in one class. Smaller than a modal title on purpose: a drawer
 * is a record, and a modal is an interruption.
 *
 * TEN STATES — none apply; it is the drawer's accessible name.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe.
 */
const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn("text-xl font-[var(--font-weight-medium)] text-foreground", className)}
    {...props}
  />
));

SheetTitle.displayName = "SheetTitle";

/**
 * The line under the title. 14/300 in secondary ink — the same body treatment
 * as the modal, because it is the same sentence doing the same job.
 *
 * TEN STATES — none apply; it is prose.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe.
 */
const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn("text-sm text-ink-secondary", className)}
    {...props}
  />
));

SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  sheetVariants,
};
