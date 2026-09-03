/* ============================================================================
   BreadcrumbFolders — the trail, drawn as a strip of folder tabs (0 direct
   call sites yet; the node a shell's `breadcrumb` slot is handed).

   THE CLIENT RULING THIS FILE IS, 2026-09-02
   Two halves, and the second is the reason the first has anywhere to live:

     · "REUSE THE EXISTING FOLDER TABS WITHOUT CHANGING ANYTHING ON THE SHAPE.
       Each path level is a folder tab, stacked left to right. Every tab
       before the last is the inactive color; the last (current location) is
       same color as the big content card in the middle, the main color — the
       same hover, and font weight rules apply as they already exist. Deeper
       paths just add more tabs."
     · "the whole concept of folders as tabs gets killed. All the current
       folders as tabs we have will become line tabs. Completely kill and
       remove folder tabs… I don't want any dead body around… the only tabs
       that we will have are the line tabs because folders will only be used
       for the breadcrumbs."

   THE FOLDER TAB **VARIANT** DIED; THE FOLDER **SHAPE** LIVES. `TabsVariant`
   is line-only from v1.2.28 and `tabs.tsx` no longer imports `FolderShape` at
   all. The silhouette did not change by one control point — `folder.tsx` is
   untouched — and this file is now its ONE consumer of the `lip` crop. The
   tab SKIN below (height, insets, type step, weights, hover, the strip's
   overlap) is `tabs.tsx`'s retired `folder` skin, moved here verbatim rather
   than re-derived, which is what "reuse without changing anything" means when
   the file it used to live in is being emptied.

   WHY IT LIVES IN `breadcrumbs/` AND NOT IN `breadcrumb/`
   `breadcrumb/` is the COMPOSABLE form and its own header states its job in a
   sentence this component fails: "It elides nothing — it renders exactly the
   crumbs it was written with." A strip that folds its own middle at five
   levels is not that. `breadcrumbs/` is the ARRAY form, and its job is
   "an array in, the finished trail out, and it owns the rule about when a
   deep trail collapses" — which is exactly this component, in a second
   drawing. So the fold rule this file needs is not re-invented: `collapse()`
   already lives one file away, in `breadcrumbs.tsx`, and is imported.

   A second file in an existing folder also costs the demo nothing:
   `demo/content.tsx`'s guard is one folder → one slug, and `gen-states.mjs`
   keys its record on the folder, so both this file's TEN STATES blocks land
   under `breadcrumbs` alongside the one that is already there. A new
   `components/breadcrumb-folder/` would have owed the demo a section.

   DESIGN SOURCE
   The SHAPE is kit chapter 14 through `folder/folder.tsx`, unchanged. The tab
   GEOMETRY is chapters 24.3 and 24.6 (47.5 tall, `--space-1` apart, pulled
   down under the panel by `--folder-tab-overlap`), through the skin this file
   inherited. The trail's SEMANTICS — the landmark, the `<ol>`, the crumb, the
   current page, the elision — are `breadcrumb/breadcrumb.tsx`'s parts, reused
   rather than restated, so a screen reader hears the same trail it heard when
   the trail was a line of text.

   THE LAW THIS FILE OBEYS
   · TWO PAPERS, AND THEY ARE RESOLVED ON THE LANDMARK. The live tab is the
     content card's own fill; every tab before it is one step off it, in the
     direction the palette already steps. Both are custom properties declared
     on the `<nav>`, for the reason `tabs.tsx` gave for declaring the folder
     tab's pair on `Tabs` rather than on the trigger (TAB-C1): a caller that
     rebinds `--surface-panel` around the strip must not be able to make the
     live tab and the card disagree.
   · THE LEADING TAB'S TOP-LEFT CORNER IS ROUNDED, LIKE EVERY OTHER TAB'S.
     REVERSED 2026-09-03, CLIENT-RULED, ON THE LIVE PRODUCT: "When I am on the
     left tab, the top corner needs to be more rounded. That's not how the
     tabs are, so go and fix it." Until today this file laid a
     `--folder-radius-lip` square of the shape's own `currentColor` over the
     leading tab's own arc — `FolderShape`'s rounded top-left corner is fixed
     at 6.6 brand units at every size and is not a prop, so the corner was
     FILLED IN rather than redrawn — to square the leading tab off to match
     the card's own squared corner underneath it. THE PATCH IS DELETED, not
     reduced: a tab is meant to look like a tab, and every other tab in the
     strip already stands on its own rounded shoulder; the leading one is no
     longer the exception. `CrumbShape` no longer takes a `lead` flag and
     draws the identical one element at every position.

     THE CARD'S OWN SQUARED CORNER DOES NOT FOLLOW IT BACK. The two squares
     were introduced together on 2026-09-02, but they were never one
     mechanism solving one problem twice — `screen-shell.tsx`'s own header
     has the geometry: the card's radius (24) is bigger than the strip's own
     overlap (17.02), so an un-squared card corner shows roughly 7 of its own
     24 as a curve peeking out below the tab's dead-straight left edge,
     whatever that tab's own top corner is doing. Un-squaring the tab removes
     no part of that collision, so the card's corner stays square on its own
     merits; see that file for the argument and the measurement.
   · Hover and weight are the tab's own, unchanged: an INK move to
     `--foreground` plus a preview of the active weight. No fill move, no
     opacity, no underline — the trail's own link hover underlines, and that
     is suppressed here because a tab is a box and `.kw-link` "occupies no
     box".
   · No transition is written. `tabs.tsx` put `motion-tab-trigger` on the
     folder shape because a trigger's fill crossfaded between two papers on
     selection; nothing here ever moves a fill — a crumb is where you are, not
     something you select — so the class would time a change that cannot
     happen. The LABEL still transitions, on `BreadcrumbLink`'s own
     `--duration-colour`.
   · Every colour and measure is a token. The only radius on this component is
     the folder silhouette's own; there is no exception left on it as of
     2026-09-03 — see the leading-tab bullet above.
   · Focus is ONE global rule (tokens.css §8). No ring here, no
     `outline: none`; the strip pays four pixels of block-start padding and
     takes them straight back as a negative margin so its own `overflow`
     cannot clip a ring off the top of a tab.
   · Every user-facing string is a prop with a default.

   RTL — LTR ONLY, and that is inherited rather than chosen. `FolderShape`'s
   own header puts the silhouette out of scope for RTL ("mirroring it needs a
   kit ruling on whether the brand shape flips at all"), and a strip made of
   that shape cannot be more mirrored than the shape is. Everything this file
   writes is logical anyway, so the day the shape gets its ruling the strip
   follows it for free.

   RENDERING CONTEXT
   `"use client"`. `FolderShape` measures its own box and `DropdownMenu` is a
   Radix overlay; both are client components, and a trail that folds has to be
   able to open what it folded.
   ========================================================================= */

"use client";

import * as React from "react";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "../breadcrumb/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../dropdown-menu/dropdown-menu";
import { FolderShape } from "../folder/folder";
import { cn } from "../../lib/utils";
import { collapse, type BreadcrumbsItem } from "./breadcrumbs";

/* ----------------------------------------------------------------------------
   The strip.

   `flex items-end gap-1` and the two block-axis margins are 24.3/24.6's own
   folder strip, moved off `tabs.tsx`'s `LIST_SKIN.folder`:

     · `mb-[calc(var(--folder-tab-overlap)*-1)]` is the whole attachment
       mechanic. The strip ends 17.02 ABOVE where it appears to, so whatever
       is drawn next — the shell's card — rides up over the tabs' cut feet.
       The live tab is the card's own paper, so the join has no edge to show;
       the rest tabs are a different paper and are simply clipped, which is
       ch14's "clipped by the card edge", drawn.
     · `pt-1` + `mt-[calc(var(--space-1)*-1)]` is the focus ring's room.
       `overflow-x: auto` computes `overflow-y` to `auto` as well, and a tab
       fills the strip's height exactly, so without four pixels here the ring
       would be clipped off a tab's top. The negative margin gives the four
       pixels straight back, so the strip occupies what it did before.
     · The strip SCROLLS rather than wraps, which is the opposite of
       `BreadcrumbList`'s own answer and is deliberate: a wrapped folder strip
       would put a second row of tabs' feet through the first row's shoulders,
       and only the bottom row could attach to the card. The crumb that must
       never be lost — the current location — is the LAST one, which is the
       one an inline scroller keeps in view when the strip is scrolled to its
       end. The fold is what keeps a deep trail short; scrolling is the
       fallback for one very long label.

   The three classes it OVERRIDES on `BreadcrumbList` are named here so the
   override is legible rather than accidental: `flex-wrap` -> `flex-nowrap`,
   `items-center` -> `items-end` (a tab stands on its feet), `gap-1.5` ->
   `gap-1` (`--space-1`, the strip's own seam). `text-caption` survives the
   merge and is the tab's own type step, so it is not restated.
   -------------------------------------------------------------------------- */
const STRIP = cn(
  "flex flex-nowrap items-end gap-1",
  "max-w-full overflow-x-auto scroll-p-2 [scrollbar-width:none]",
  "[&::-webkit-scrollbar]:hidden",
  "pt-1 mt-[calc(var(--space-1)*-1)]",
  "mb-[calc(var(--folder-tab-overlap)*-1)]",
);

/* ----------------------------------------------------------------------------
   One tab. `tabs.tsx`'s `TRIGGER_BASE` + `TRIGGER_SKIN.folder`, verbatim in
   every value.

   TWO LINES READ DIFFERENTLY FROM THE ORIGINAL AND NEITHER CHANGES A PIXEL.
   `TRIGGER_SKIN.folder` wrote its resting ink as `[color:var(--ink-secondary)]`
   rather than `text-ink-secondary`, and said why: tailwind-merge did not know
   `text-caption` was a font size, filed it under text-COLOUR, and let a
   following `text-ink-secondary` delete the whole type step. That is no longer
   true — `lib/utils.ts` registers `text-badge`, `text-micro` and
   `text-caption` under `font-size` (GAPS-DOCS A-1), and the two classes now
   land in different groups — so the plain utility is used here and the
   workaround is not carried forward into a new file. Likewise the shared
   base's `[&_svg:not([data-slot=folder-shape])]` guard: it existed because
   `line` and `folder` shared one icon rule and only one of them had a
   silhouette to exclude. There is one skin here, so the exclusion is the
   plain rule.
   -------------------------------------------------------------------------- */
const TAB = cn(
  "relative inline-flex shrink-0 cursor-pointer appearance-none",
  "items-center justify-center whitespace-nowrap select-none",
  "border-0 bg-transparent",
  // One height for every tab — ch14, verbatim: "a tab never shrinks to say it
  // is unselected". `shrink-0` is the same rule on the other axis, measured on
  // a real phone: flex shrinks a child to `min-width` BEFORE its container
  // overflows, so without it every tab clamps to 128 and the label runs into
  // the shoulder curve. A tab takes its content's width and the STRIP scrolls.
  "h-[var(--folder-tab-height)] min-w-[var(--folder-tab-min-width)]",
  // "The label is centred in the lip, never across the join." The foot below
  // the lip is padding, so `items-center` centres against the lip and not the
  // whole box; the inline-end padding clears the shoulder so the label never
  // reaches the curve.
  "pb-[var(--folder-tab-overlap)] ps-5",
  "pe-[calc(var(--folder-shoulder)_+_var(--space-3h))]",
  "gap-[var(--space-2h)]",
  "text-caption",
  // Any icon a call site puts in a crumb sits at the button icon size and
  // never shrinks. The folder silhouette is excluded by its own slot name —
  // a descendant rule (0,1,1) outranks the shape's `size-full` (0,1,0), so
  // without the `:not()` the whole tab's outline paints at 1rem square.
  "[&_svg:not([data-slot=folder-shape])]:pointer-events-none",
  "[&_svg:not([data-slot=folder-shape])]:size-[var(--icon-button)]",
  "[&_svg:not([data-slot=folder-shape])]:shrink-0",
);

/* An ancestor: the rest fill, 13/300 in secondary ink, hovering to the active
   WEIGHT ONLY — REVERSED 2026-09-03. `hover:no-underline` is still the ONE
   thing suppressed on `BreadcrumbLink` — its underline is `.kw-link`'s, drawn
   for a link that "occupies no box", and this link is a box — but the ink
   hover it also brings, `hover:text-foreground`, is now overridden back to
   rest here rather than kept: client ruling, verbatim, "when i hover over a
   tab i want that it gets the same weight as the active tab (without
   changing the color) replicate the behaviour we already have in navbar."
   `rail.tsx`'s `ROW_IDLE` is that behaviour — a fixed ink at every state,
   weight the only thing that steps up on hover — so `hover:text-ink-secondary`
   is added, LAST, to win the merge against `BreadcrumbLink`'s own
   `hover:text-foreground` (same utility group, later in the `cn()` call
   `<BreadcrumbLink className={cn(TAB, TAB_REST)}>` passes it through).
   Colour was never invented to move here in the first place — `TAB_REST`
   itself carried no ink hover of its own before today, only the shared
   part's did — so this is a suppression, not a second rule to keep in step.

   `z-[1]` and `z-[3]` are 24.3's own two numbers, kept so a caller that draws
   its card at `z-[2]` gets ch14's "clipped by the card edge" for the rest tabs
   and an attached live tab, without this file knowing what the card is. */
const TAB_REST = cn(
  "z-[1]",
  "text-ink-secondary font-[var(--font-weight-light)]",
  "hover:text-ink-secondary hover:font-[var(--font-weight-medium)]",
  "hover:no-underline",
);

/* The current location. `BreadcrumbPage` already draws primary ink at the
   kit's one "bold" (`--font-weight-medium`), which is the same pair 24.3 gives
   an ACTIVE folder tab — so the ruling's "the same font weight rules apply as
   they already exist" is satisfied by the part, and nothing is restated here.
   It is not a link and has no hover, deliberately: a hover response on the
   page you are already on invites a click that does nothing. */
const TAB_LIVE = "z-[3] cursor-default";

/** The two papers, as `color` for the shape's `currentColor`. */
const FILL_REST = "text-[var(--kw-crumb-rest)]";
const FILL_LIVE = "text-[var(--kw-crumb-live)]";

/* ----------------------------------------------------------------------------
   The silhouette behind one tab.

   NO LONGER TAKES A `lead` FLAG. Until 2026-09-02 the leading tab drew an
   extra `--folder-radius-lip` patch here to square its own top-left corner
   off, matching the card's own squared corner underneath it; the client
   reversed the tab half of that on 2026-09-03 ("go and fix it" — see the file
   header), so every tab, leading or not, is now this one element and nothing
   more. `data-slot="breadcrumb-folder-square"` no longer exists anywhere in
   this file; a harness that still queries for it should expect zero.
   -------------------------------------------------------------------------- */
function CrumbShape({ fill }: { fill: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="breadcrumb-folder-fill"
      /* Behind the label. The tab sets a z-index, which makes it a stacking
         context, so this negative index stays inside the tab and can never
         fall behind whatever the strip was dropped onto. */
      className={cn("pointer-events-none absolute inset-0 -z-10", fill)}
    >
      <FolderShape crop="lip" />
    </span>
  );
}

/* ============================================================================
   BreadcrumbFolders
   ========================================================================= */

/**
 * Four levels render in full. At five the middle folds.
 *
 * CLIENT, 2026-09-02: "Four levels render in full. At five or more, everything
 * between the first and the parent collapses into one `···` tab." Written as
 * a constant rather than a default on a prop because it is the trail's own
 * rule and not a layout's opinion — `foldAfter` exists so a call site with a
 * genuinely narrower slot can say so, and its default is this.
 */
const FOLD_AFTER = 4;

/**
 * What the fold keeps beside the head: the parent and the current location.
 * `collapse()` counts the crumbs a reader ends up seeing, gap excluded, so
 * head (1) + this (2) is the `maxItems` it is handed — see `fold()`.
 */
const FOLD_KEEP_TAIL = 2;

/**
 * Fold the middle, using `breadcrumbs.tsx`'s own rule rather than a second
 * one.
 *
 * `collapse()` couples its threshold to its tail — it folds as soon as there
 * are MORE crumbs than it will show — and the client's rule does not: she
 * asked for four in full and a fold at five, keeping three. So the threshold
 * is applied here and the SHAPE of the fold is still `collapse`'s: passing
 * `undefined` below `foldAfter` is that function's own "show every crumb", and
 * passing 3 above it is its own "head, gap, last two". Nothing about which
 * crumbs survive, in what order, is decided twice.
 */
const fold = (items: BreadcrumbsItem[], foldAfter: number) =>
  collapse(items, items.length > foldAfter ? FOLD_KEEP_TAIL + 1 : undefined);

export interface BreadcrumbFoldersProps
  extends Omit<React.ComponentPropsWithoutRef<"nav">, "children"> {
  /** The trail, root first. An empty array renders `null`. */
  items: BreadcrumbsItem[];
  /**
   * The landmark's accessible name. A prop with a default because it is
   * announced, and anything announced must be translatable.
   */
  label?: string;
  /**
   * How many levels render in full before the middle folds. The client's
   * ruling is four; a call site with a narrower slot may say fewer. Below 3
   * there is nothing to fold — the head and the tail are the whole trail — so
   * a smaller number renders every crumb rather than pretending to fold.
   */
  foldAfter?: number;
  /**
   * What the folded tab announces, and the accessible name of the menu it
   * opens. Defaults to `BreadcrumbEllipsis`'s own English.
   */
  ellipsisLabel?: string;
  /** Classes for the `<ol>`, for a call site that needs to change the strip. */
  listClassName?: string;
}

/**
 * The trail as a strip of folder tabs, left to right, ending in the tab that
 * is the card below it.
 *
 * TEN STATES
 *  1. default        — one tab per level: every tab but the last on the rest
 *                      paper, the last on the card's own. A single-level
 *                      location is ONE tab with nothing to its left, which is
 *                      correct and is not an empty state.
 *  2. hover          — per tab, and only on the ones that are links: an ink
 *                      move to `--foreground` plus a preview of the active
 *                      weight. No fill move and no opacity, which is the tab's
 *                      own hover unchanged. The current tab has none.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      The strip holds four pixels of block-start padding open
 *                      so its own `overflow` cannot clip the ring.
 *  4. active/pressed — does not apply. A crumb navigates; the acknowledgement
 *                      is the next screen, which is louder than a 1px drop.
 *  5. disabled       — an item with no `href` renders as the non-link crumb on
 *                      the rest paper: a level you can see and not visit. There
 *                      is no greyed-out tab, and no `--btn-disabled-fill` — a
 *                      dead folder tab was the tab VARIANT's state and a trail
 *                      has no dead steps.
 *  6. loading        — does not apply. A trail is known before the page it
 *                      describes is; that is what it is for.
 *  7. empty          — `items: []` renders `null`. Not an empty landmark, not
 *                      one bare tab.
 *  8. error          — does not apply. A trail reports nothing.
 *  9. selected       — the last tab, always: the card's fill, primary ink at
 *                      `--font-weight-medium`, and `aria-current="page"` — so
 *                      the meaning survives without colour.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — the geometry is UNCHANGED at every width; what
 *  changes is what the strip does when it runs out of it, and that changes
 *  continuously rather than at a breakpoint. The strip scrolls on the inline
 *  axis; a trail deeper than `foldAfter` has already folded its middle before
 *  width is consulted, because the fold is a CONTENT rule and the client set
 *  its number.
 *
 * RTL — LTR only, inherited from `FolderShape`. See the file header.
 */
const BreadcrumbFolders = React.forwardRef<HTMLElement, BreadcrumbFoldersProps>(
  (
    {
      items,
      label = "Breadcrumb",
      foldAfter = FOLD_AFTER,
      ellipsisLabel,
      className,
      listClassName,
      ...props
    },
    ref,
  ) => {
    if (items.length === 0) return null;

    const rendered = fold(items, foldAfter);
    const lastIndex = items.length - 1;
    const hidden = items.filter(
      (_, index) =>
        !rendered.some((entry) => entry.kind === "item" && entry.index === index),
    );

    return (
      <Breadcrumb
        ref={ref}
        label={label}
        data-slot="breadcrumb-folders"
        className={cn(
          /* TAB-C1's mechanism, for this component's own two papers, and
             declared HERE for the reason that block gives: a caller may rebind
             `--surface-panel` or `--card` around a strip, and the live tab has
             to keep agreeing with the CARD rather than with whatever the
             rebinding made of the panel. Custom properties are substituted at
             computed-value time on the element that declares them, so
             resolving both one level above the tabs is correct in every
             container at once.

             THE LIVE PAPER is the content card's own, by ruling: "the last
             (current location) is same color as the big content card in the
             middle, the main color". `screen-shell.tsx` paints that card
             `--surface-raised`, so that is the token, not `--card` and not
             `--spine-chip-fill` — the two agree in light and part company on
             the mango spine in dark.

             THE REST PAPER is one step off it in the direction the palette
             already steps: `--surface-raised` -> `--surface-panel`, which is
             `--kw-soft-paper` in light and `--kw-unlit-panel` in dark. It is
             the same step `screen-shell.tsx`'s CARD block makes when it
             rebinds a filled control on the card to soft paper (ruling 01),
             and it is derived rather than stated per spine — nothing here
             knows what a spine is.

             MEASURED IN `verify/breadcrumb-folder/` and `verify/tab-joint/`,
             on the two spines the client kept and in both palettes, against
             the ground the strip stands on (`--spine-fill`):

               MANGO · LIGHT  ground #FED069 · rest #F7F2EB 1.306 · live
                              #FFFEF9 1.440 · rest vs live 1.103
               MANGO · DARK   ground #FED069 · rest #1C1B18 11.843 · live
                              #26241F 10.661 · rest vs live 1.111
               QUIET · LIGHT  ground #F7F2EB · rest #EDE8E1 1.094 · live
                              #FFFEF9 1.103 · rest vs live 1.207
               QUIET · DARK   ground #1C1B18 · rest #1C1B18 1.000 · live
                              #26241F 1.111 · rest vs live 1.111

             THE FIGURE THIS FILE USED TO LOG AS OPEN, RULED, 2026-09-03. A
             resting tab on the quiet spine used to measure 1.000 against the
             ground IN BOTH PALETTES, because the quiet spine IS
             `--surface-panel` (tokens.css §7b) and the rest fill was also
             `--surface-panel` — the same value twice. The client was shown
             drawn alternatives and picked #EDE8E1 for QUIET-LIGHT ONLY, the
             quietest option that still reads as a real step off the ground
             (1.094) rather than the loudest one available: `tokens.css`
             names it `--spine-quiet-crumb-rest` and the reasoning for why it
             is a new value and not a repoint of an existing paper is there.
             QUIET-DARK IS LEFT AT 1.000, DELIBERATELY, NOT AN OVERSIGHT: its
             own `--surface-panel` rest fill sits on a ground the live tab
             already carries at 1.111 (the same step the card itself has), so
             the trail's endpoint never disappears there the way it could on a
             genuinely flat quiet-light strip; the client's ruling was scoped
             to the palette she was shown.

             THE MECHANISM IS PER-SPINE, IN TOKENS.CSS, NOT PER-PALETTE HERE.
             `--kw-crumb-rest` below reads `--spine-crumb-rest` with a
             `var(…, var(--surface-panel))` fallback: `[data-spine="quiet"]`
             binds it to the new paper in light and back to `--surface-panel`
             in both dark blocks (tokens.css, right after that spine's own
             block), and the mango spine never sets it at all, so the fallback
             alone keeps mango's own two papers exactly as measured above.
             This file names no palette and no spine — the whole branch is a
             cascade a caller or a future spine can repoint without touching
             this component, which is the same argument TAB-C1 already made
             for declaring both papers as custom properties instead of
             classes.

             THE ALTERNATIVE CONSIDERED BEFORE THE NEW PAPER, AND WHY IT WAS
             NOT TAKEN. `--muted` (#FAF9F7 / #2F2D28, whose own comment in
             tokens.css reads "inactive tabs, idle wells") is the kit's third
             paper and was the retired folder tab's idle fill; it clears the
             ground on quiet, and it costs mango-light, where rest and live
             would sit 1.021 apart instead of 1.103. `--surface-quiet`
             (#E2DDD4, "cancel buttons, disabled wells") was tried next and
             also withdrawn — a reuse the client did not choose once she saw
             the alternatives drawn. */
          "[--kw-crumb-live:var(--surface-raised)]",
          "[--kw-crumb-rest:var(--spine-crumb-rest,var(--surface-panel))]",
          className,
        )}
        {...props}
      >
        <BreadcrumbList className={cn(STRIP, listClassName)}>
          {rendered.map((entry) => {
            if (entry.kind === "gap") {
              return (
                <BreadcrumbItem key="breadcrumb-folders-gap" className="shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      data-slot="breadcrumb-folders-fold"
                      className={cn(TAB, TAB_REST)}
                    >
                      <CrumbShape fill={FILL_REST} />
                      {/* The kit's own elision, reused whole: the glyph is
                          `aria-hidden` and the announced label sits OUTSIDE
                          that wrapper, which is the half of this component
                          everybody gets wrong. A second drawing of "the middle
                          is missing" is exactly what this file must not
                          invent. */}
                      <BreadcrumbEllipsis label={ellipsisLabel} />
                    </DropdownMenuTrigger>
                    {/* …and it OPENS what it hides. `breadcrumb.tsx`'s own
                        note on `BreadcrumbEllipsis` says where this belongs:
                        "Where a call site makes the elision expandable it
                        wraps this in a `DropdownMenuTrigger`, and that control
                        owns every state including its ring." */}
                    <DropdownMenuContent align="start" aria-label={ellipsisLabel}>
                      {hidden.map((item, index) => (
                        <DropdownMenuItem
                          key={item.key ?? `breadcrumb-folders-hidden-${String(index)}`}
                          asChild={item.href !== undefined}
                          disabled={item.href === undefined}
                        >
                          {item.href === undefined ? (
                            <span>{item.label}</span>
                          ) : (
                            <a href={item.href}>{item.label}</a>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
              );
            }

            const live = entry.index === lastIndex;
            const key = entry.item.key ?? `breadcrumb-folders-${String(entry.index)}`;

            return (
              <BreadcrumbItem key={key} className="shrink-0">
                {live ? (
                  <BreadcrumbPage className={cn(TAB, TAB_LIVE)}>
                    <CrumbShape fill={FILL_LIVE} />
                    {entry.item.label}
                  </BreadcrumbPage>
                ) : entry.item.href === undefined ? (
                  /* An ancestor with no route. `breadcrumbs.tsx` draws this as
                     `BreadcrumbPage` too — a step you can see and not visit —
                     but it must NOT take the live paper here, because the
                     paper is what says "you are here". So it takes the page
                     element for its semantics and the REST fill for its
                     drawing, and `aria-current` is dropped: there is exactly
                     one current location and it is the last tab. */
                  <BreadcrumbPage
                    aria-current={undefined}
                    className={cn(TAB, TAB_REST, "cursor-default hover:font-[var(--font-weight-light)] hover:text-ink-secondary")}
                  >
                    <CrumbShape fill={FILL_REST} />
                    {entry.item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={entry.item.href}
                    className={cn(TAB, TAB_REST)}
                  >
                    <CrumbShape fill={FILL_REST} />
                    {entry.item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  },
);

BreadcrumbFolders.displayName = "BreadcrumbFolders";

export { BreadcrumbFolders };
