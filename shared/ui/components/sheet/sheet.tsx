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
   Persian. The entrance mirrors with it: motion/motion.css §3 swaps the two
   keyframe pairs under [dir="rtl"], corrected there on 2026-08-22 after this
   note originally reported the disagreement. GAPS-A.md SHT-1 is closed.

   AND `side` IS NOW ALSO WHERE ONE SYSTEM-WIDE RULE LANDS. The client's
   2026-09-04 ruling — "everythung that's slisde in in desktop, should be
   slide up in mobile" — is about every panel, not about this component, but
   it is IMPLEMENTED here because this component is the one place `left` and
   `right` are centralised for 18 call sites. Below 45rem a side drawer
   presents and animates as the bottom sheet. Geometry in `NARROW_BOTTOM`
   below; motion in motion.css §3a; the rule for panels that are NOT sheets
   in motion.css §3b as `.motion-edge-panel`. No call site changed.

   RENDERING CONTEXT
   `"use client"`. Radix Dialog (the drawer is a dialog) holds state, portals
   and traps focus.
   ========================================================================= */

"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { X } from "../../foundations/icons";

/* `.kw-scrim--drawer` — charcoal at 28%, z 55, no dark twin drawn and none
   invented (the kit's note is "kept identical"). `--kw-charcoal` is the raw
   palette layer and is reached deliberately: no semantic token stays charcoal
   in both palettes. GAPS-A.md OVL-2. */
const SCRIM = [
  "fixed inset-0 z-[55]",
  "bg-[color-mix(in_srgb,var(--kw-charcoal)_28%,transparent)]",
  "motion-scrim",
] as const;

/* ---------------------------------------------------------------------------
   THE CLIENT'S RULE, VERBATIM, 2026-09-04:
       "everythung that's slisde in in desktop, should be slide up in mobile"

   Below 45rem a `left` or `right` drawer stops being a side drawer and
   BECOMES the bottom sheet this file already draws for `side="bottom"` —
   same geometry, same cap, same corners, same grabber. Not a similar one:
   the same one. Two kinds of bottom sheet on one phone would be a worse
   answer than the side drawer we started with.

   The four declarations below are, line for line, the `bottom` variant:

       bottom:  inset-x-0 bottom-0 w-full max-h-[85dvh] rounded-t-[var(--radius)]

   WHAT EACH OVERRIDE IS FIGHTING, because none of them is decorative:
     · `inset-x-0`   — adds the second horizontal inset. The base sets only
                       ONE of `start-0`/`end-0`; a bottom sheet needs both
                       edges pinned. It compiles to `inset-inline: 0` — the
                       LOGICAL pair, checked in the emitted CSS rather than
                       assumed from the utility's name — so it mirrors with
                       the document like everything else in this file, and it
                       agrees with whichever of `start-0`/`end-0` the base
                       already set because both want 0.
     · `top-auto`    — kills the `top: 0` half of `inset-y-0`. Without it the
                       panel is still full-height and `max-h` is decoration.
     · `bottom-0`    — restates the other half explicitly rather than relying
                       on `inset-y-0` surviving alongside `top-auto`.
     · `h-auto`      — kills `h-full`. `max-h` cannot cap a fixed height.
     · `max-h-[85dvh]` — the client's "must not exceed the viewport", and the
                       same 85dvh the `top`/`bottom` variants already cap at
                       so the scrim is never fully covered. `dvh`, not `vh`:
                       on a phone the browser chrome is the difference
                       between a footer you can press and one under the
                       address bar.
     · `w-full`      — the same width `max-w-full` already produces at this
                       size, written out so this block reads as the `bottom`
                       variant rather than as a coincidence.
     · `rounded-t` + `rounded-b-none` — the radius moves to the top corners.
                       Deliberately NOT `rounded-none` first: `rounded-none`
                       and `rounded-t-*` are both `border-radius` family
                       utilities and which one Tailwind emits last is
                       Tailwind's business, not this file's. `rounded-t-*`
                       and `rounded-b-none` touch four different corners
                       between them and share none, so the result is the same
                       whatever order they land in — and it is correct in RTL
                       too, where the base `rounded-s`/`rounded-e` resolve to
                       the other pair of corners.

   ORDERING IS NOT LEFT TO CHANCE ANYWHERE ELSE EITHER. Every override here
   is a VARIANT utility and every base it overrides is not, and Tailwind
   emits variants after their unvariant counterparts — that guarantee is the
   same one that makes `sm:flex-row` beat `flex-col` everywhere in this kit.
   Verified compiled rather than assumed, in verify/sheet-slide-up.

   WHY THE BREAKPOINT IS `max-[45rem]` AND NOT A `matchMedia` READ. Tried in
   the first draft and thrown away. `Sheet` renders on a server: a JS read
   gives the server the desktop answer and the client the phone answer, which
   is a hydration mismatch, and even where it hydrates cleanly the first
   painted frame is a drawer flying in from the right before it corrects
   itself. There is no first frame to get wrong in a media query. `45rem` is
   720px at the 16px authoring base — the figure ch27.2, ch27.4, ch27.14 and
   ch27.37 all state — and it stays 720px in a media query however the
   text-size control has moved the root, because media-query lengths resolve
   against the initial font-size.

   THE MOTION IS NOT HERE. `.motion-sheet` reads `data-side`, and
   foundations/motion/motion.css §3a flips `left`/`right` to the bottom
   keyframes under the same `45rem`. This file writes no duration and no
   curve, here or anywhere — that is the house law, and it is also why the
   flip could be made once instead of eighteen times.

   `data-side` STILL SAYS "right" ON A PHONE, and that is deliberate: the
   prop is the call site's stated intent, the viewport is a separate fact,
   and the attribute stays honest so the CSS can do the translating.
   --------------------------------------------------------------------------- */
const NARROW_BOTTOM = [
  "max-[45rem]:inset-x-0",
  "max-[45rem]:top-auto",
  "max-[45rem]:bottom-0",
  "max-[45rem]:h-auto",
  "max-[45rem]:w-full",
  "max-[45rem]:max-h-[85dvh]",
  "max-[45rem]:rounded-t-[var(--radius)]",
  "max-[45rem]:rounded-b-none",
].join(" ");

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
        left: `inset-y-0 start-0 h-full w-[26.25rem] max-w-full rounded-e-[var(--radius)] ${NARROW_BOTTOM}`,
        /** The reading-end edge — the drawer the kit actually draws. */
        right: `inset-y-0 end-0 h-full w-[26.25rem] max-w-full rounded-s-[var(--radius)] ${NARROW_BOTTOM}`,
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
 *  mobile   — REVISED 2026-09-04 on the client's rule, quoted in full at
 *             `NARROW_BOTTOM` above: below 45rem a `left` or `right` drawer
 *             presents and animates as the BOTTOM SHEET, capped at 85dvh.
 *
 *             What the previous ruling got right is kept and is in fact the
 *             reason this one works. It said the drawer stays FULL-BLEED
 *             rather than inset, because "an inset drawer on a phone puts the
 *             close chip inside the thumb-unreachable corner while wasting
 *             the only width there is". Full bleed is exactly what a bottom
 *             sheet is, so the geometry did not have to be re-argued — only
 *             re-anchored, from the inline edge to the block end. It also
 *             said the inner-edge radius is the drawer's signature and the
 *             one cue that the dimmed record is still behind; the radius
 *             therefore MOVES to the top corners rather than being dropped,
 *             and the 85dvh cap gives it a strip of scrim to show through,
 *             which at full height it never had.
 *
 *             THE CLOSE AFFORDANCE, WHICH THE RULE MADE INTO A NUMBER. The
 *             chip does not move in the panel — it stays at the top of the
 *             inline end, where `side="bottom"` has always put it, because a
 *             second bottom sheet with the chip somewhere else would be two
 *             bottom sheets. The 85dvh cap moves it anyway: on a 380 × 812
 *             handset the chip's centre was 775px up from the foot of the
 *             screen and is now 653px, a 122px drop into the hand, measured
 *             in verify/sheet-slide-up. Two further exits arrive with the
 *             cap and are the thumb-reachable ones: the FOOTER is pinned
 *             (`mt-auto`, never scrolls) and now sits at the very bottom of
 *             the viewport, and the 15dvh of scrim above the sheet is
 *             tappable, which at full height did not exist. Escape and the
 *             grabber's own convention round it out. Rejected: moving the
 *             chip to the sheet's bottom edge, which would have put it on
 *             top of the pinned footer's commit control — the one press a
 *             phone must not make ambiguous.
 *  tablet   — UNCHANGED, and 834 is comfortably above 45rem so nothing in
 *             this ruling reaches it. The 420 fits inside the viewport with
 *             the scrimmed page visible beside it, so the drawer stops being
 *             a page and starts being a panel with no class changing.
 *  desktop  — UNCHANGED. The drawer does not widen with the viewport; 420 is
 *             the measure the kit states and a wider drawer is a worse one.
 *  `top` and `bottom` cap at 85dvh at every width so the scrim is never fully
 *  covered — a sheet that reaches the opposite edge is a page, not a sheet.
 *  Neither is touched by the narrow rule: a `top` sheet that rose from the
 *  bottom would arrive at the edge it did not come from.
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
        {/* THE GRABBER — ch27.2, verbatim: "On narrow it rises from the
            bottom as a sheet with a grabber." The artifact draws it 42 × 4,
            a pill in the strong hairline tone, centred at the sheet's top
            (27.2's own narrow render). Decorative — dismissal is the scrim,
            the ✕ and Escape, all of which Radix already owns.

            IT NOW APPLIES TO `left` AND `right` TOO, BELOW 45rem. Not as an
            extra: 27.2's sentence is about the narrow case specifically, and
            below 45rem a side drawer IS a sheet that rises from the bottom.
            A narrow drawer with the bottom sheet's geometry and none of its
            affordance would be the odd one of two — which is the outcome
            this whole change exists to avoid. Above 45rem nothing changes:
            a side drawer's affordance is its inner rounded edge, and the
            kit's CH20 drawer draws no grabber.

            THE VISIBILITY IS CSS, NOT A VIEWPORT READ, for the same reason
            the geometry is: `side` is a prop and can be branched on at
            render, but the WIDTH cannot be without a hydration mismatch. So
            the element is emitted from the prop and its `display` is decided
            by the media query.

            `hidden` IS A REAL `display: none`, WHICH THE HOUSE RULE REQUIRES
            — not a zero-size box left in the tab order. Nothing here is in
            the tab order to begin with: it is an `aria-hidden` `<span>` with
            no tabindex and no handler, so it is unreachable by keyboard at
            every width, and above 45rem it is not rendered at all. Proved
            rather than asserted by the focus probe in verify/sheet-slide-up,
            which focuses every candidate in the document and asks who took
            it.

            `block` is NOT in the shared class list. `hidden` and `block` are
            both `display` utilities of the same specificity, and which wins
            would be Tailwind's emission order rather than this file's
            intent; giving each case its own display class removes the
            question instead of betting on it. */}
        {side === "bottom" || side === "left" || side === "right" ? (
          <span
            data-slot="sheet-grabber"
            aria-hidden="true"
            className={cn(
              "mx-auto mt-[var(--space-2h)] h-1 w-[2.625rem] shrink-0 rounded-pill bg-[var(--hair-strong)]",
              side === "bottom" ? "block" : "hidden max-[45rem]:block",
            )}
          />
        ) : null}
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
