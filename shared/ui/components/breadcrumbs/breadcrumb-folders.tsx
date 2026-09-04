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

   THE PHONE DOES NOT GET TABS AT ALL, 2026-09-04, CLIENT-RULED, verbatim:
   "in monile, lets use normal breadcrumbs (like they ware before, jhust teh
   text)". Below `md` this component renders the ORDINARY trail — words and
   separators, the way the product drew it before the folder shape arrived —
   and at `md` and above it renders the strip below, unchanged to the pixel.
   The whole mechanism is one display utility per drawing; it is argued at
   length at `TEXT_TRAIL` and `STRIP_ONLY`, including what the swap costs, what
   it deliberately does NOT do, and why the phone's trail is
   `breadcrumbs.tsx`'s own component rather than a second text renderer living
   here.

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
import { Breadcrumbs, collapse, type BreadcrumbsItem } from "./breadcrumbs";

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

   REVERSED 2026-09-03, SAME DAY AS THE CHANGE ITSELF. A same-day pass tried
   `w-full` on the strip + `grow` on the live tab, reasoning that a short
   trail stopping inside the card's own right edge should be filled by
   stretching the last tab to the container's width. The client's own
   correction: that changed the SHAPE of every tab in the app, live tab
   included, from one sized to its own label into one that stretches to
   fill whatever room is left, text pushed off-centre — "bring the main
   content folder breadcrumbs exactly as it was before! it was already
   correct." A tab is sized to its content again, full stop; the "reach the
   container" idea is dropped rather than solved a different way.
   -------------------------------------------------------------------------- */
const STRIP = cn(
  "flex flex-nowrap items-end gap-1",
  "max-w-full overflow-x-auto scroll-p-2 [scrollbar-width:none]",
  "[&::-webkit-scrollbar]:hidden",
  "pt-1 mt-[calc(var(--space-1)*-1)]",
  "mb-[calc(var(--folder-tab-overlap)*-1)]",
);

/* ----------------------------------------------------------------------------
   THE TWO DRAWINGS AND THE ONE GATE BETWEEN THEM.

   CLIENT, 2026-09-04, verbatim: "in monile, lets use normal breadcrumbs (like
   they ware before, jhust teh text)". A phone gets the ordinary trail. Desktop
   and tablet keep the strip above, to the pixel.

   THE PHONE'S TRAIL IS `breadcrumbs.tsx`'s OWN COMPONENT, CALLED — NOT A
   SECOND TEXT RENDERER IN THIS FILE. `Breadcrumbs` is already "an array in,
   the finished trail out"; it takes the identical `BreadcrumbsItem[]` this
   component takes, and it renders the identical `breadcrumb/` parts the tabs
   render (`BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`), so the
   two drawings cannot drift in their semantics, their ink or their type step.
   It is one file away, in this same folder, for the reason that folder's own
   header gives: the two forms of one trail live together so neither can be
   re-derived by accident. `collapse()` was already reached across that seam;
   this is the second thing that is.

   THE ALTERNATIVE WAS WORKED THROUGH AND REJECTED: restyling the TAB markup
   down to plain text at `max-md` — one DOM tree, the silhouette hidden, the
   tab skin unset. It reads cheaper than it is. `BreadcrumbSeparator` has no
   place in the strip's markup at all, so the middle dot between crumbs would
   have had to be CSS generated content — a user-visible mark this file
   invents, that no translator can reach and that lands outside the
   accessibility tree, against this repo's own law that "every user-facing
   string is a prop with a default". It would also have to re-derive the wrap
   behaviour `BreadcrumbList` already ships (`flex-wrap`, which `STRIP` above
   deliberately overrides to `flex-nowrap`), keep the folder silhouette in the
   DOM purely to hide it, and unset eight tab utilities one at a time at a
   breakpoint. Two components, each drawing what it is for, is the smaller
   thing.

   THE GATE IS A DISPLAY UTILITY. NOT `matchMedia`, NOT `useSyncExternalStore`,
   NOT A `useEffect` THAT MEASURES. A JS breakpoint has no answer on the
   server, so the first paint is whichever trail the component guessed at and
   the second is the swap — a hydration mismatch on every phone, and a visible
   flash of tabs before the text on every load. CSS has the width before React
   has anything, so neither happens and there is no state here at all.

   AND IT IS `display: none`, WHICH IS THE POINT AND NOT AN IMPLEMENTATION
   DETAIL. `sr-only`, `visibility`, `opacity: 0` and a zero-size box all leave
   the hidden trail IN the accessibility tree and IN the tab order, and a
   reader would then find two breadcrumb landmarks and two "you are here"
   crumbs at every width — worse than the problem this fixes. `screen-shell.tsx`
   already settled the same question at the same breakpoint for its own
   `md:hidden` menu trigger, in its own words: "a `display: none` button is not
   merely invisible — it is out of the tab order and out of the accessibility
   tree, which is what 'genuinely unreachable' means." Measured the same way it
   measured that — by focusing every focusable in the document and asking
   `document.activeElement` who took it, never by reading `checkVisibility` —
   in `verify/crumb-mobile/`: at 380 the strip hands out no focus, at 834 and
   1440 the text trail hands out none, and exactly one landmark is painted at
   each of the three.

   `md` IS THE SHELL'S OWN BREAKPOINT AND IS NOT A NEW NUMBER. It is where
   `screen-shell.tsx` puts the rail away and stands its menu trigger up, so the
   width at which the product stops being a desktop is already written down
   once; the trail changing shape at any other number would make the phone a
   third layout. Note that the two gates cannot drift even in principle:
   font-relative units inside a media query resolve against the INITIAL
   font-size (16px), never this kit's 15px root, so both flip at 768 CSS px.

   `pb-[var(--space-3)]` IS THE ONLY MEASURE THIS BLOCK SPENDS, and it is
   borrowed rather than chosen. The strip pays a NEGATIVE block-end margin
   (`--folder-tab-overlap`) because the card rides up over its tabs' cut feet;
   a text trail attaches to nothing, so with the strip gone there would be no
   space at all between the last crumb and the card's top edge. `--space-3` is
   what the shell's own phone-only chrome row spends in exactly this position —
   "this row pays its own `--space-3` beneath itself" — so the trail and the
   menu above it sit on one rhythm. It is PADDING and not a margin on purpose:
   a margin here collapses out of any parent that is not already a formatting
   context of its own, and this component cannot see its parent.

   `[overflow-wrap:anywhere]` IS THE HORIZONTAL-SCROLL GUARD, and `break-words`
   is not enough for it. A flex item will not shrink below its min-content
   width, and `overflow-wrap: break-word` does not change min-content — so one
   long unbroken label (a client name with no spaces in it) would push the
   `<ol>` past the viewport and scroll the whole DOCUMENT sideways at 380,
   which is the one thing a phone layout may never do. `anywhere` is defined to
   affect min-content, so the crumb shrinks and the word breaks. MEASURED BOTH
   WAYS in `verify/crumb-mobile/`, on one unbroken label at 380: with this
   line the crumb wraps to three lines and `document.scrollWidth` stays 380;
   with it swapped for `overflow-wrap: normal` in the live cascade the same
   label reports 1005 against a 380 client width — the document scrolling
   sideways, which is the failure this one declaration is here to prevent.
   -------------------------------------------------------------------------- */
/* THE INK IS THE SPINE'S, NOT THE PAGE'S, AND THIS IS THE ONE THING THE SWAP
   COULD NOT INHERIT. A tab brings its own paper with it: every label in the
   strip is read against `--kw-crumb-rest` or `--kw-crumb-live`, both of which
   step with the palette, so the trail never had to know what it was standing
   ON. Take the tabs away and the words land straight on the shell's ground —
   `--spine-fill` — and on the mango spine that ground is #FED069 in BOTH
   palettes (tokens.css §7b says so in as many words: "mango is #FED069 in both
   palettes, so anything drawn on it must be too"), while `--ink-tertiary` and
   `--foreground` flip to near-white in dark. MEASURED, in `verify/crumb-mobile/`
   at `?t=dark`, before these three lines existed: the trail drew #BDB9B1 and
   #FFFEF9 on #FED069 — 1.34 and 1.45 against the ground. A trail nobody can
   read is worse than a trail drawn as tabs.

   `--spine-ink` / `--spine-ink-quiet` ARE THE KIT'S EXISTING ANSWER TO EXACTLY
   THIS, and no new token is minted: they are what `rail.tsx` draws every row,
   heading and hint with, for the same reason — it is the other thing that
   stands on the spine rather than on paper. On the paper spine they resolve to
   `--foreground` / `--muted-foreground`, which is the ordinary trail again; on
   mango they are the palette-independent `--ink-on-accent`.

   THE `var(…, …)` FALLBACK IS THE MECHANISM THIS FILE ALREADY USES ONE BLOCK
   DOWN for `--spine-crumb-rest`, and it carries the same promise: this
   component still names no spine and no palette. Outside a spine — a harness,
   a story, any caller that is not `ScreenShell` — neither token is declared,
   the fallback stands, and the trail draws precisely the inks
   `breadcrumbs.tsx` would have drawn on its own. Nothing is overridden that
   was not going to be wrong.

   ONLY THREE SELECTORS, AND THEY ARE THE THREE THE PARTS ACTUALLY COLOUR. The
   list carries the resting ink, which the links, the separators and the
   ellipsis all INHERIT, so one rule covers four things; the current page
   carries its own; and `BreadcrumbLink`'s hover carries the third. The
   descendant form outranks each part's own class (0,2,0 and 0,3,0 against
   0,1,0 and 0,2,0) without any part being edited, which matters: `breadcrumb/`
   is the composable form and half a dozen other call sites draw from it. */
const TEXT_TRAIL = cn(
  "pb-[var(--space-3)]",
  "[&_[data-slot=breadcrumb-list]]:text-[var(--spine-ink-quiet,var(--ink-tertiary))]",
  "[&_[data-slot=breadcrumb-page]]:text-[var(--spine-ink,var(--foreground))]",
  "[&_[data-slot=breadcrumb-link]:hover]:text-[var(--spine-ink,var(--foreground))]",
  "md:hidden",
);

const TEXT_TRAIL_LIST = cn("min-w-0 [overflow-wrap:anywhere]");

/* The strip's own half of the gate. Written as an ADDITIVE `max-md:` variant
   rather than a `hidden md:block` pair so that at `md` and above the nav's
   class list resolves to exactly what it resolved to before this change and
   the element keeps its own UA `display: block` — the desktop strip is not
   restyled into place, it is simply never gated. */
const STRIP_ONLY = "max-md:hidden";

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
   page you are already on invites a click that does nothing.

   `w-full` + `justify-start` were added and reversed the same day (see
   `STRIP`'s own note) — the live tab is sized to its own label again, like
   every rest tab, and reads centred under `TAB`'s shared `justify-center`. */
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
  /**
   * Turns the LAST crumb into a real control instead of the read-only
   * "you are here" page — for the one call site where the tab IS the
   * interactive element (the assistant column's own close button,
   * `screen-shell.tsx`) and not a location in a navigational trail.
   *
   * OMIT IT — every real breadcrumb call site does, and always will — and
   * the live crumb renders exactly as it always has: `BreadcrumbPage`, not
   * focusable, not clickable, `aria-current="page"`. This prop adds a
   * second path through the same tab shape rather than changing the first
   * one, which is what keeps a real trail's "current page is not a link"
   * law (`breadcrumb.tsx`'s own header) intact for every consumer that
   * never passes it.
   *
   * When given, the live crumb becomes a real `<button>` — not
   * `BreadcrumbPage`'s `role="link" aria-disabled="true"` span, because a
   * control a reader can activate must not also announce itself as
   * disabled. Keyboard-reachable, `Enter`/`Space` fire it natively, no ring
   * to write (tokens.css §8 already rings it).
   */
  onCurrentActivate?: () => void;
  /**
   * The accessible name for the button `onCurrentActivate` turns the live
   * crumb into. Falls back to the crumb's own visible label. A caller whose
   * tab doubles as a toggle should say what THIS press does —
   * `screen-shell.tsx` passes "Close the assistant", not "Assistant", so a
   * reader hears the action rather than the location.
   */
  currentActivateLabel?: string;
  /**
   * Published as the button's `aria-expanded` when `onCurrentActivate` is
   * given. Omit it if the control this crumb doubles as is not a
   * disclosure.
   */
  currentActivateExpanded?: boolean;
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
 *                      the meaning survives without colour. UNLESS the call
 *                      site passed `onCurrentActivate`, in which case this
 *                      tab is a control, not a location, and renders as a
 *                      real `<button>` with the caller's own label and
 *                      `aria-expanded` in place of `aria-current` — see that
 *                      prop's own doc. Every other call site is untouched.
 * 10. read-only      — always, UNLESS `onCurrentActivate` is given, in which
 *                      case the live tab alone becomes a real control; every
 *                      tab before it stays read-only regardless.
 *
 * THREE BREAKPOINTS
 *  mobile — NOT TABS AT ALL since 2026-09-04. The client: "in monile, lets use
 *  normal breadcrumbs (like they ware before, jhust teh text)". Below `md` the
 *  strip is `display: none` and the trail is `breadcrumbs.tsx`'s plain text
 *  form — same items, same parts, same landmark name — wrapping rather than
 *  scrolling, with every crumb shown and every ancestor still a link. See
 *  `TEXT_TRAIL` for the whole mechanism and for why the fold does not follow
 *  it down there. THE ONE EXCEPTION IS `onCurrentActivate`: that call site is
 *  a control wearing the tab shape, not a location in a trail, so it keeps its
 *  tab at every width — see that prop.
 *  tablet / desktop — the strip, and the geometry is UNCHANGED at every width
 *  from `md` up; what changes is what it does when it runs out of room, and
 *  that changes continuously rather than at a breakpoint. The strip scrolls on
 *  the inline axis; a trail deeper than `foldAfter` has already folded its
 *  middle before width is consulted, because the fold is a CONTENT rule and
 *  the client set its number.
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
      onCurrentActivate,
      currentActivateLabel,
      currentActivateExpanded,
      ...props
    },
    ref,
  ) => {
    /* THE STRIP'S OWN NODE, KEPT SEPARATELY FROM `ref`. `ref` above is the
       forwarded `<nav>` — `Breadcrumb`'s own root — and the thing that needs
       scrolling is the `<ol>` one level in, the same node `STRIP`'s
       `overflow-x-auto` lives on. `BreadcrumbList` already forwards a ref to
       it, so this costs the component nothing it did not already have
       wired.

       WHY THIS EXISTS AT ALL. `STRIP`'s own comment above already argues the
       strip scrolls instead of wrapping BECAUSE the crumb that must never be
       lost — the current location — is the LAST one, and "an inline scroller
       keeps it in view when the strip is scrolled to its end." That sentence
       described a scroller that was ALREADY at its end. It never was: a
       freshly mounted `overflow-x-auto` box starts at its leading edge, full
       stop, with no browser behaviour that moves it anywhere else on its
       own. So a trail past four or five levels, or a single long client
       name at a narrow width — `TAB`'s own `shrink-0` guarantees a tab never
       gives up room to fit, which is correct and is also why this bites —
       loaded with exactly the one crumb that answers "where am I" sitting
       off-screen until the reader scrolled it into view by hand. */
    const listRef = React.useRef<HTMLOListElement>(null);

    React.useEffect(() => {
      if (items.length === 0) return;
      const strip = listRef.current;
      const lastTab = strip?.lastElementChild;
      if (!lastTab) return;

      /* `inline: "end"`, NOT A COMPUTED `scrollLeft`. A hand-rolled "scroll
         to the trailing edge" is `el.scrollLeft = el.scrollWidth -
         el.clientWidth` in LTR, but that expression is wrong or
         browser-dependent in RTL — Chrome reports a negative `scrollLeft` at
         the trailing edge, Firefox a positive one measured from the other
         side, and old WebKit a positive one that counts the other direction
         again — three different sign conventions for the one idea of "all
         the way to the end". `Element.scrollIntoView`'s `inline` axis is
         defined in terms of the box's own writing direction, so `"end"`
         already means the trailing edge in whichever direction `dir` makes
         that, on every engine, with nothing here reading `dir` itself. This
         file's own header calls the SILHOUETTE "LTR only, inherited [from
         `FolderShape`]" — the glyph has no mirroring ruling yet — but "every-
         thing this file writes is logical anyway", and this line is what
         that sentence promises made good: the strip's OWN layout follows
         `dir` for free, same as its `ps-`/`pe-` padding already does.

         `block: "nearest"` keeps this to the strip's own axis. Without it,
         bringing an element "into view" is free to nudge an ancestor's
         vertical scroll too if the browser judges that helpful; the strip is
         the only thing here with horizontal overflow, so `nearest` on the
         block axis means every vertical scroller up the tree reports "already
         visible" and does nothing, and only the strip's `overflow-x-auto`
         actually moves.

         `behavior` IS LEFT UNSET, WHICH IS INSTANT HERE, AND THAT IS THE
         REDUCED-MOTION ANSWER RATHER THAN A `matchMedia` CHECK BESIDE IT. The
         default resolves to the scrolling box's own `scroll-behavior` CSS
         property, which is `auto` (instant) unless something sets `smooth`
         — nothing in `tokens.css`, `motion.css` or `STRIP` above does, so
         there is no motion to suppress under `prefers-reduced-motion` and no
         duration or curve for this file to invent in place of one. A trail
         that jumps straight to its end on load reads as "this is where the
         page already was", which is the correct read for the very first
         paint. */
      lastTab.scrollIntoView({ inline: "end", block: "nearest" });
      // Depends on `items` itself (not `rendered` or `foldAfter`) because the
      // LAST tab is always `items[items.length - 1]` — the fold only ever
      // hides the MIDDLE of the trail, so the one thing this effect cares
      // about changes exactly when the trail itself does, and never
      // rescrolls a screen whose depth crossed `foldAfter` with the same
      // destination.
    }, [items]);

    if (items.length === 0) return null;

    /* THE PHONE'S TRAIL, AND WHY IT IS NOT RENDERED FOR EVERY CALLER.
       `onCurrentActivate` marks the one call site where the last crumb is a
       CONTROL rather than a location — `screen-shell.tsx`'s assistant tab,
       which the client asked for one day earlier in those exact terms: "i want
       to close the assistant by clicking on its folder tab, that should
       minimize it." Swapping that for a word would delete the affordance she
       had just asked for, on the width where it is most needed: the assistant
       is an OVERLAY on a phone, so its tab is the thing standing between an
       open column and the screen underneath. The mobile ruling is about the
       breadcrumb TRAIL — "normal breadcrumbs… just the text" — and a single
       tab that is a button is not one. So that path keeps its tab at every
       width, which also keeps the promise this prop's own doc makes: it adds
       a second path through the tab shape and changes nothing about the
       first.
       `Breadcrumbs` returns `null` on an empty array too, so the guard above
       covers both drawings and neither can render a bare landmark. */
    const textTrail = onCurrentActivate === undefined;

    const rendered = fold(items, foldAfter);
    const lastIndex = items.length - 1;
    const hidden = items.filter(
      (_, index) =>
        !rendered.some((entry) => entry.kind === "item" && entry.index === index),
    );

    return (
      <>
        {/* ── THE PHONE'S TRAIL. Below `md` this is the only trail in the
            document; at `md` and above it is `display: none`, which is to say
            it is not in the accessibility tree and not in the tab order.

            NO `maxItems`, SO NOTHING FOLDS HERE, AND THAT IS THE OPPOSITE OF
            THE STRIP ON PURPOSE. The strip folds at five levels because it
            CANNOT wrap — `STRIP` above says why: a wrapped folder strip puts
            one row of tabs' feet through the next row's shoulders and only
            the bottom row can attach to the card — so its only other answer
            is to scroll, and scrolling is what pushes an ancestor out of
            sight. A text trail has neither problem. `BreadcrumbList`'s own
            header already ruled which answer belongs to a trail that can
            wrap: "Wrapping keeps every crumb reachable; scrolling would hide
            the ancestors, which is the half of the trail a reader is looking
            for." Folding here would ALSO be strictly worse than folding
            there, because the strip's elision opens a menu and this one has
            none: the crumbs it hid would be reachable on a desktop and
            unreachable on a phone. And it is what "like they ware before"
            means literally — no call site in this kit ever passed
            `Breadcrumbs` a `maxItems`, so the trail this product had before
            the tabs showed every level.

            `label` IS SHARED, NOT DOUBLED. One trail, one announced name, in
            one translation unit; a second string would be a second thing to
            translate for a landmark a reader meets only one of.

            `ellipsisLabel` IS NOT PASSED, and its absence is the point: with
            no fold there is no elision to announce.

            THE SEPARATOR IS LEFT AT ITS DEFAULT — `BreadcrumbSeparator`'s
            middle dot, ruled in CH15 (NAV-B1), `aria-hidden` and
            `role="presentation"`. No prop is added here to override it: it is
            a MARK and not a string, it is hidden from assistive technology,
            and the composable form already exposes `children` for the one
            call site that ever needs another one.

            `{...props}` DELIBERATELY DOES NOT COME HERE. The caller's rest
            props are `<nav>` attributes and some of them are unique by
            definition — an `id` on both drawings is invalid markup and would
            break any `aria-labelledby` pointing at it, and a `data-testid`
            on both would match twice. They stay on the strip, which is where
            they already landed before today, so no existing caller's
            attribute moves. THE FORWARDED `ref` STAYS ON THE STRIP FOR THE
            SAME REASON — one node, and it is the one it has always been. A
            caller holding it measures zeros below `md`, which is honest:
            the element it asked for is genuinely not laid out there. No
            caller in this kit passes a ref to this component today, and the
            day one needs the phone's node it should ask for it by name
            rather than have `ref` mean two elements. `className` DOES come here, because it is the
            component's own styling hook and a caller styling "the breadcrumb"
            means the trail rather than one drawing of it; the gate is
            appended AFTER it so a caller cannot accidentally win the display
            utility off it in tailwind-merge. */}
        {textTrail ? (
          <Breadcrumbs
            items={items}
            label={label}
            className={cn(className, TEXT_TRAIL)}
            listClassName={TEXT_TRAIL_LIST}
          />
        ) : null}

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
            /* LAST, AND CONDITIONAL. Last so a caller's own display utility
               cannot win the gate off this element in tailwind-merge — the
               swap is a ruling, not a default. Conditional because a strip
               that is the ONLY drawing (`onCurrentActivate`, above) must not
               be gated away at a width where nothing would replace it, which
               is how a phone would otherwise lose the assistant's close
               control entirely. */
            textTrail ? STRIP_ONLY : undefined,
          )}
          {...props}
        >
          <BreadcrumbList ref={listRef} className={cn(STRIP, listClassName)}>
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
                    onCurrentActivate ? (
                      /* THE ONE CALL SITE WHERE THE LIVE TAB IS A CONTROL. A
                         real `<button>`, not `BreadcrumbPage` — that element
                         is `role="link" aria-disabled="true"` BY DESIGN (see
                         `breadcrumb.tsx`), which is correct for "you are here"
                         and wrong for "press to act": a control a reader can
                         activate must never also announce itself disabled.
                         Same `TAB`/`TAB_LIVE` classes as the read-only path —
                         one shape, two elements — with `cursor-pointer` put
                         back over `TAB_LIVE`'s own `cursor-default`. */
                      <button
                        type="button"
                        data-slot="breadcrumb-folders-current-control"
                        aria-expanded={currentActivateExpanded}
                        /* NO FALLBACK TO `entry.item.label`, and the type is the
                           reason rather than an inconvenience: a crumb's label is
                           a `ReactNode`, and `aria-label` takes a string. A node
                           cannot be flattened to an accessible name here without
                           guessing at what its markup reads as. Left undefined
                           when no explicit label is given, React omits the
                           attribute entirely, and the button's accessible name
                           falls back to its own text content — which IS the
                           crumb's label, rendered. So the un-labelled case is
                           still named, by the browser, from the thing a sighted
                           reader sees; `currentActivateLabel` exists to say
                           something BETTER than that ("Close the assistant"
                           rather than "Assistant"), not to rescue it. */
                        aria-label={currentActivateLabel}
                        onClick={onCurrentActivate}
                        className={cn(TAB, TAB_LIVE, "cursor-pointer")}
                      >
                        <CrumbShape fill={FILL_LIVE} />
                        {entry.item.label}
                      </button>
                    ) : (
                      <BreadcrumbPage className={cn(TAB, TAB_LIVE)}>
                        <CrumbShape fill={FILL_LIVE} />
                        {entry.item.label}
                      </BreadcrumbPage>
                    )
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
      </>
    );
  },
);

BreadcrumbFolders.displayName = "BreadcrumbFolders";

export { BreadcrumbFolders };
