/* ============================================================================
   DropdownMenu — the record menu (35 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t12.css + t12-overlaysmall.html
   (chapter 12) → `.kw-menu`, `.kw-menu__head`, `.kw-menu__item`,
   `.kw-menu__item--danger`, `.kw-keyhint`, `.kw-menu__hr`, and `.kw-eyebrow`
   from kwapso-ui.css for the head.
   Chapter 12's rule, verbatim: "Overlay shadow, 24px radius, no blur."
   Motion is motion/motion.css §4 (`.motion-anchored`, `.motion-menu-item`).
   Not shadcn. Where the two disagree, the kwapso specimen wins.

   THE LAW THIS FILE OBEYS
   · The surface is `--popover` at `--radius` (24) under `--shadow-overlay`,
     min 264 wide, padded 10. No blur, no arrow, no border.
   · A MENU ROW IS A PILL. `--radius-pill`, 10/12 inset, 14/300 label, a 10 gap
     to its icon. This is the single most visible difference from the shadcn
     menu it replaces, which draws a 6-radius rectangle.
   · Neutral row hover is `--accent`, the kit's own active-row wash. It is NOT
     mango: `--primary` is a brand fill and would turn every menu row mango.
     The destructive row's hover is the kit's one stated menu hover, poppy at
     8%, expressed as a `color-mix` so dark re-resolves it to poppy-lift with
     no second value.
   · Disabled is a fill-less ink change to `--ink-disabled`, never an opacity —
     a menu row has no box to fill until it is hovered, so filling a dead row
     would invent a shape the kit does not draw. GAPS-A.md MNU-2.
   · Focus is ONE global rule (tokens.css §8). Radix's roving highlight moves
     `data-highlighted`, which takes the same `--accent` wash as hover, so
     keyboard and pointer agree; the RING is still the token layer's.
   · No duration, no curve, no keyframe here. `.motion-anchored` carries the
     open and close for every side; `.motion-menu-item` carries the row's fill
     swap.
   · Every string is a prop with a default.

   RENDERING CONTEXT
   `"use client"`. Radix DropdownMenu holds open state, portals, positions
   against the trigger and owns a roving tabindex.
   ========================================================================= */

"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

import { cn } from "../../lib/utils";
import { Check, ChevronRight } from "../../foundations/icons";

/* ----------------------------------------------------------------------------
   The floating surface. `.kw-menu`.

   z: chapter 12 states none. 70 puts the small floating layer ABOVE the
   modal scrim (60) and the drawer scrim (55), so a menu opened from inside a
   dialog is never trapped behind the thing that contains it. Derived —
   GAPS-A.md ANC-1.

   `--radix-dropdown-menu-content-available-height` is Radix's own measurement
   of the room left between the trigger and the viewport edge; capping to it is
   what stops a long menu running off a phone.
   ------------------------------------------------------------------------- */
const SURFACE = [
  "z-[70] min-w-[16.5rem] overflow-y-auto",
  "max-h-[var(--radix-dropdown-menu-content-available-height)]",
  "bg-popover text-popover-foreground",
  "rounded-[var(--radius)] shadow-xl", // bridged to --shadow-overlay
  "p-[var(--space-2h)]",
  "motion-anchored",
] as const;

/* A row. `.kw-menu__item` — a pill, not a rectangle. */
const ITEM = [
  "relative flex w-full cursor-pointer select-none items-center gap-[var(--space-2h)]",
  "rounded-pill px-3 py-[var(--space-2h)]",
  "text-sm text-foreground",
  "motion-menu-item",
  // Pointer hover and keyboard highlight are the same wash, so the two never
  // disagree about which row is live.
  "data-[highlighted]:bg-accent",
  // Disabled: ink only, and the row stops being a target. Not an opacity.
  "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed",
  "data-[disabled]:text-ink-disabled",
  // Any icon in the row sits at the 16 delivery size and never shrinks.
  "[&_svg]:pointer-events-none [&_svg]:size-[var(--icon-16)] [&_svg]:shrink-0",
] as const;

/* The kit's one stated menu hover: poppy at 8%. `color-mix` keeps the 8% here
   and lets `--destructive` resolve to poppy-lift in dark on its own.

   THE WORD AND THE WASH ARE TWO DIFFERENT TOKENS, RULING 43 (2026-08-23).
   The row's INK is `--destructive-ink`: `--destructive` as text measured
   3.79:1 on a card and 3.43:1 on a panel in light, under AA's 4.5, and this
   menu row is the case CH26.01 names by hand -- "'Delete' inside a menu list
   is plain poppy-colored text". The 8% HOVER WASH stays on `--destructive`,
   because it is a fill and a fill was never the problem; moving it would have
   changed the wash under every destructive row for no reason. */
const ITEM_DANGER = [
  "text-destructive-ink",
  "data-[highlighted]:bg-[color-mix(in_srgb,var(--destructive)_8%,transparent)]",
] as const;

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;

/**
 * The menu surface, portalled and positioned against its trigger.
 *
 * TEN STATES
 *  1. default        — `--popover` at 24 under `--shadow-overlay`, min 264,
 *                      padded 10.
 *  2. hover          — does not apply to the surface; the ROWS hover, and they
 *                      take `--accent`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      The surface itself is focused on open (Radix) and is
 *                      not a `:focus-visible` target, so no ring is drawn
 *                      around the whole menu.
 *  4. active/pressed — does not apply to the surface.
 *  5. disabled       — does not apply to the surface. A menu with nothing to
 *                      offer should not be opened; individual rows disable.
 *  6. loading        — does not apply, and it is a deliberate refusal: a menu
 *                      that opens empty and fills in moves its own rows under
 *                      the cursor, so a call site that has to fetch should
 *                      keep the trigger in `Button loading` until it can draw
 *                      the real list. Stated, not omitted. GAPS-A.md MNU-3.
 *  7. empty          — a menu with no children renders as a bare 10-padded
 *                      surface. Nothing is invented to fill it — no "No
 *                      actions" line, because that string would be a hardcoded
 *                      sentence in a component. The call site decides.
 *  8. error          — does not apply to the surface.
 *  9. selected       — belongs to `DropdownMenuCheckboxItem`, which draws a
 *                      check in a reserved slot.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and deliberately so. The menu is
 *  264 minimum at every width and Radix's collision handling flips its side
 *  and slides it back inside the viewport, which is a behaviour rather than a
 *  breakpoint. It does NOT become a sheet on a phone: that swap is a
 *  composition's decision (it changes which component a screen renders), and a
 *  primitive that silently turns into a different primitive cannot be reasoned
 *  about at 35 call sites. The one width-sensitive thing here is the height
 *  cap, which is Radix's measured available height and so is already correct
 *  on a short viewport.
 *
 * RTL — safe. `align` and `side` are Radix's, and Radix mirrors `start`/`end`
 * alignment with the document direction on its own. Every inset here is
 * logical.
 */
const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      data-slot="dropdown-menu-content"
      /* 8 is the kit's tooltip offset (`--space-2`) reused for the whole
         floating layer. It is a unitless number because that is the only
         thing Radix's positioner accepts, so it does not scale with the
         text-size control — GAPS-A.md ANC-2. */
      sideOffset={sideOffset}
      className={cn(SURFACE, className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));

DropdownMenuContent.displayName = "DropdownMenuContent";

export interface DropdownMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
  /**
   * The destructive row — the kit's `.kw-menu__item--danger`. Danger ink, and
   * the one menu hover the kit actually states (poppy at 8%). Added as a
   * boolean rather than a `variant` because the kit draws exactly two rows and
   * a two-value variant is a boolean wearing a hat.
   */
  danger?: boolean;
  /**
   * Reserve the leading slot so this row's label lines up with the labels of
   * rows that DO have an icon. Off by default; a menu of plain rows should not
   * carry a column of empty space.
   */
  inset?: boolean;
  /**
   * A glyph leading the label — one of the kit's forty, at the 16 delivery
   * size, inheriting the row's own ink so a `danger` row's icon goes with it.
   * Ruling 34: a module is identified by its icon wherever it appears, and a
   * menu that could only carry text was the menu being wrong. Passing the
   * glyph as a child still works and always did; this is the named slot, so
   * the row can size and colour it instead of hoping the call site does.
   */
  icon?: React.ReactNode;
  /**
   * A picture leading the label — a logo, an avatar, a thumbnail. Ruling 30's
   * record mark: a 24 SQUARE at the 6 selection radius, contained, never
   * cropped. Ignored when `icon` is given; a row carries one mark, not two.
   */
  image?: string;
  /**
   * The picture's alternative text. `""` by default: the label beside it
   * already names the row, so the image is decorative.
   */
  imageAlt?: string;
}

/**
 * A menu row.
 *
 * TEN STATES
 *  1. default        — a pill-shaped row, 14/300 in `--foreground`, no fill.
 *  2. hover          — `--accent`, the kit's neutral wash. `danger` rows take
 *                      poppy at 8%, the kit's one stated menu hover. Never
 *                      mango, never an opacity.
 *  3. focus-visible  — NOT here. tokens.css §8. Radix's roving highlight sets
 *                      `data-highlighted`, which paints the same wash as
 *                      hover, so arrowing and pointing look identical.
 *  4. active/pressed — does not apply. A menu row commits on release and
 *                      closes; a press treatment would be seen for one frame.
 *                      Stated rather than dropped. GAPS-A.md MNU-4.
 *  5. disabled       — `--ink-disabled` and no pointer events. Ink only: a row
 *                      has no resting fill, so filling a dead one would invent
 *                      a box the kit does not draw. Not an opacity.
 *  6. loading        — does not apply to a row. A row that starts work closes
 *                      the menu and the work is reported where it happens.
 *  7. empty          — does not apply; a row with no label is a call-site bug.
 *  8. error          — does not apply. `danger` is an INTENT (this row
 *                      destroys something), not an error state.
 *  9. selected       — not on this row. Use `DropdownMenuCheckboxItem`.
 * 10. read-only      — does not apply; a row that cannot be used is disabled.
 *
 * THREE BREAKPOINTS — UNCHANGED. One row height at every width. The row is
 * 10/12 inset on a 14 label, which lands above the 44 touch row once the icon
 * is counted, so no phone-only size exists or is needed.
 *
 * RTL — safe. `px-*` is padding-inline, the icon leads by flex order, and the
 * shortcut is pushed to the inline end with `ms-auto`.
 */
const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(
  (
    { className, danger = false, inset = false, icon, image, imageAlt = "", children, ...props },
    ref,
  ) => (
    <DropdownMenuPrimitive.Item
      ref={ref}
      data-slot="dropdown-menu-item"
      data-danger={danger ? "" : undefined}
      className={cn(
        ITEM,
        danger && ITEM_DANGER,
        inset && "ps-[calc(var(--space-3)_+_var(--icon-16)_+_var(--space-2h))]",
        className,
      )}
      {...props}
    >
      {/* A ROW WITH NO LEADING SLOT PASSES ITS CHILD THROUGH ALONE, and that
          is not a tidiness edit. Radix's `asChild` routes through `Slot`,
          which counts its children and throws "Expected a single React
          element child" on more than one — and `{null}{children}` IS two.
          So `<DropdownMenuItem asChild><a …/></DropdownMenuItem>` crashed the
          tree, on a prop this component inherits from Radix and never
          removed. Found 2026-09-02 by the breadcrumb fold, which is a menu of
          links and has to be one. Ternary rather than a fragment for exactly
          the same reason: a fragment around the pair would still be a second
          child. */}
      {icon !== undefined && icon !== null ? (
        <>
          <span
            aria-hidden="true"
            data-slot="dropdown-menu-item-icon"
            className={cn(
              "inline-flex size-[var(--icon-16)] shrink-0 items-center justify-center",
              "[&_svg]:size-[var(--icon-16)]",
            )}
          >
            {icon}
          </span>
          {children}
        </>
      ) : image ? (
        <>
          <img
            src={image}
            alt={imageAlt}
            data-slot="dropdown-menu-item-image"
            className={cn(
              "size-[var(--avatar-sm)] shrink-0 object-contain",
              "rounded-[var(--radius-select)] bg-surface-quiet",
            )}
          />
          {children}
        </>
      ) : (
        children
      )}
    </DropdownMenuPrimitive.Item>
  ),
);

DropdownMenuItem.displayName = "DropdownMenuItem";

/**
 * A row that carries a mark. The check sits in a reserved leading slot exactly
 * one icon wide, so checked and unchecked rows do not shift sideways.
 *
 * DERIVED — the kit draws no menu checkbox (GAPS-A.md MNU-1). The mark is the
 * `Check` glyph at the 16 delivery size in the row's own ink, which is the
 * same answer chapter 10 gives for a selection mark elsewhere; no new radius,
 * no new colour and no box were invented for it.
 *
 * TEN STATES — as `DropdownMenuItem`, with two differences:
 *   9. selected     — THE state here. `checked` draws the mark and sets
 *                     `aria-checked`; the row keeps its own ink, because a
 *                     selected row that also changes colour says the same
 *                     thing twice.
 *   7. empty        — the unchecked row reserves the slot and draws nothing in
 *                     it. Never a dash, never an empty box.
 *
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe; the slot is a flex child.
 */
const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    data-slot="dropdown-menu-checkbox-item"
    checked={checked}
    className={cn(ITEM, className)}
    {...props}
  >
    <span
      aria-hidden="true"
      className="inline-flex size-[var(--icon-16)] shrink-0 items-center justify-center"
    >
      <DropdownMenuPrimitive.ItemIndicator>
        <Check size={16} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));

DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

/**
 * `.kw-menu__head` wrapping a `.kw-eyebrow` — micro, 500, uppercase, the
 * eyebrow tracking, tertiary ink. `text-micro` sets size, leading and the
 * 0.08em tracking in one class, and that tracking IS `--tracking-eyebrow`.
 *
 * TEN STATES — none apply. A label is not a control: no hover, no focus, no
 * press, no disabled, no loading, no error, no selected, no read-only. Empty
 * is the call site's business — a label with no text renders an empty band,
 * and nothing is invented to fill it.
 *
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe; `px-*`, `pt-*`, `pb-*`.
 */
const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    data-slot="dropdown-menu-label"
    className={cn(
      "text-micro uppercase font-[var(--font-weight-medium)] text-ink-tertiary",
      "px-3 pt-2 pb-[var(--space-1h)]",
      className,
    )}
    {...props}
  />
));

DropdownMenuLabel.displayName = "DropdownMenuLabel";

/**
 * `.kw-menu__hr` — one hairline on `--hair`, inset 12 from each side so it
 * stops short of the surface's corners, with 10 of air above and below.
 * A filled 1px block: the global rule is that no component carries a CSS
 * `border`, at any thinness, and the artifact draws its rules this way too.
 *
 * TEN STATES — none apply. A rule is not a control.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe; `mx-*` is margin-inline.
 */
const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    data-slot="dropdown-menu-separator"
    /* A filled 1px block, not a `border-top`: nothing in this system carries
       a CSS border, and the artifact draws its own rules the same way
       (`height: 1px` · `background: var(--hair)`, CH19). */
    className={cn("mx-3 my-[var(--space-2h)] h-px bg-border", className)}
    {...props}
  />
));

DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

/**
 * `.kw-keyhint` — the shortcut, pushed to the inline end in micro/500 on
 * TERTIARY ink, with tabular figures so a column of them lines up.
 *
 * CORRECTED 2026-08-23 alongside `CommandShortcut`, whose header carries the
 * full reasoning. Both shipped `--ink-disabled` under the same invented claim
 * that "the tier below tertiary is where the kit puts hints"; ruling 27 left
 * no such tier and CH01 states *"#a8a59f now means disabled and nothing
 * else."* Chapter 12 draws this hint with `--fg3` / `--fg4`, both of which
 * ruling 27 resolves to tertiary's own `#5f5d59`.
 *
 * GAPS-CONTRAST measured the palette's three hints and MISSED these two,
 * because a closed menu portals nothing into the document (its §7 item 2).
 * Opened and measured, they read **2.433 light / 3.321 dark** against 4.5 —
 * the same defect, one overlay away from the sweep.
 *
 * The two files are corrected together on purpose: the header above says
 * "two drawings of one hint would drift", and fixing one alone is exactly
 * how that happens.
 *
 * TEN STATES — none apply. It is a static hint inside a row that owns all ten.
 * THREE BREAKPOINTS — UNCHANGED. A shortcut on a phone is harmless and its
 * absence would make two platforms draw two different menus.
 * RTL — safe. `ms-auto` is margin-inline-start.
 */
const DropdownMenuShortcut = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<"span">>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ms-auto text-micro font-[var(--font-weight-medium)] text-ink-tertiary tabular-nums",
        className,
      )}
      {...props}
    />
  ),
);

DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

/**
 * The row that opens a submenu. The same pill as any other row, with a chevron
 * at the inline end.
 *
 * The chevron is `ChevronRight` rotated under `rtl:` rather than a second
 * glyph, so one icon covers both directions and the marker never disagrees
 * with the side Radix actually opens on.
 *
 * TEN STATES — as `DropdownMenuItem`. `data-[state=open]` also takes the
 * `--accent` wash, so a submenu that is open keeps its parent row lit; that is
 * the one place a row holds its hover after the pointer leaves, and it is
 * correct — the row is the submenu's title while the submenu is up.
 *
 * THREE BREAKPOINTS — UNCHANGED. RTL — the chevron mirrors; the position is
 * Radix's.
 */
const DropdownMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    data-slot="dropdown-menu-sub-trigger"
    className={cn(ITEM, "data-[state=open]:bg-accent", className)}
    {...props}
  >
    {children}
    <ChevronRight size={16} className="ms-auto rtl:rotate-180" aria-hidden="true" />
  </DropdownMenuPrimitive.SubTrigger>
));

DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

/**
 * The submenu surface. The same surface as the parent menu — chapter 12 draws
 * one floating surface and a submenu is not a second kind of thing.
 *
 * TEN STATES / THREE BREAKPOINTS / RTL — as `DropdownMenuContent`. Radix
 * mirrors the side it opens on with the document direction on its own.
 */
const DropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      data-slot="dropdown-menu-sub-content"
      className={cn(
        SURFACE,
        "max-h-[var(--radix-dropdown-menu-content-available-height)]",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));

DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
