/* ============================================================================
   Tabs — peers, switched between (21 direct call sites).

   DESIGN SOURCE
   All three variants are DRAWN by the kit, from three different chapters, and
   none collapses into another:
     · `line`  — design-mothership/specimens/kwapso-ui.css → `.kw-tabs` /
       `.kw-tab`: a row on a `--hair` rule, `--space-6` apart, each tab
       `--space-3` block padding with a 2px transparent block-end border
       pulled back over the rule by one hairline. Tertiary ink, going to
       primary ink on hover; the selected tab is primary ink at 500 with the
       border in `--ink-primary`.
     · `folder` — ADDED. kit chapter 14 ("Folder shapes") for the silhouette,
       chapters 24.3 and 24.6 for the strip on a real screen: tabs at
       `--folder-tab-height` in a row `--space-1` apart, pulled down under the
       panel by `--folder-tab-overlap` so the active one looks physically
       attached. The shape is `folder/folder.tsx`; this file only fills it.
       Chapter 27 states when to reach for it: "The folder tab cuts a
       collection into subsets. The underline tab cuts a record — or Settings
       — into sub-views." A record's own sections stay on `line`.

   REVIEW ROUND 1 · `pill` IS GONE. The kit has exactly two tab variants,
   `line` and `folder`, and the third was a segmented CONTROL (t10.css
   `.kw-seg__btn`) wearing a tab's name. The segmented control still exists
   and is still drawn — it is `toggle-group` and `mode-toggle` — so nothing
   was lost by deleting it here; what was lost was a second way to spell one
   thing. `TabsVariant` is now a two-member union, so a call site that still
   writes `variant="pill"` fails to compile rather than drifting.
   motion/motion.css §8 → `.motion-tab-indicator`, `.motion-tab-trigger`,
   `.motion-tab-panel-in`.

   THE LAW THIS FILE OBEYS
   · AN INACTIVE FOLDER TAB IS `--muted` (#FAF9F7 light, #2F2D28 dark), AN
     ACTIVE ONE IS `--surface-panel` (#F7F2EB / #1C1B18), and the strip they
     stand on is the PAGE tone (#FFFEF9 / #141310). Three papers, the kit's
     own, exactly as CH14 draws them.
     THE CITATION THAT USED TO BE HERE WAS WRONG TWICE OVER and is recorded
     so the mistake is not made a third time. It read "Override 34", which is
     the queue's Skip mechanic and has nothing to do with tabs; the row it
     meant was 30. And row 30 is WITHDRAWN — with 38 and 39 — by the K1
     reversal of 2026-08-23, which put the two quiet papers back the way CH14
     and CH27.1 draw them. `FOLDER_SHAPE_FILL` now states the withdrawn row's
     own replacement values (TAB-C1). The ground half of the rule is a LAYOUT
     rule and lives in `collection-frame.tsx`; this file only says what the
     tab is filled with. `--surface-idle` is not read here at all.
   · `line` and `folder` are both real and both drawn. Neither is a skin of
     the other; they have different heights, different type, different fills
     and different selection marks. `folder` is the one that brings a shape,
     and the one whose panel is a surface rather than a bare block.
   · A folder tab is a real button and takes the global ring like every other
     control. Nothing here sets `outline: none`; the strip grows four pixels of
     block-start padding, and gives them straight back as a negative margin, so
     its own `overflow` cannot clip the ring off the top of a tab.
   · Hover is a named token, never an opacity — the kit's hover on `.kw-tab`
     is an INK move (`--ink-tertiary` -> `--ink-primary`) with no fill change
     at all, so none is invented.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label`), never an opacity, and the hover is suppressed so
     a dead tab never looks live.
   · Only four radii exist, and a tab claims none of them: `line` is a rule
     under type and `folder` is the brand silhouette.
   · Focus is ONE global rule (tokens.css §8). No ring here, no `outline: none`
     anywhere, and the line variant's negative hairline margin is small enough
     that the ring still clears the rule.
   · No transition or keyframe is written here. `.motion-tab-trigger` (colour),
     `.motion-tab-indicator` (transform + width, on `--ease-move`, because the
     indicator is the one element the eye tracks continuously) and
     `.motion-tab-panel-in` (the tight rise on the incoming panel only — tabs
     are peers, not a filmstrip) already exist and are attached.

   THE INDICATOR, AND WHY IT IS MEASURED
   motion.css §8 states outright that "the indicator's own geometry is set by
   the component (a measured transform and width, or a grid column). This file
   times it." Tabs are not equal-width in either specimen, so the grid-column
   route cannot express them and the geometry is measured.

   The measurement is a px number read off the live layout and written back as
   a px transform. That is NOT a design value and does not breach commission
   rule 5: it is the position the browser has already computed at the current
   text scale, so it rescales with everything else by construction. No size,
   colour or spacing in this file is a px.

   Before the first measurement — server render, and the frame before
   hydration — the ACTIVE TRIGGER draws its own mark (its border, its fill).
   `TabsList` then publishes `indicator: true` through context and the
   triggers drop their own mark in the same commit the indicator appears in,
   so the two are never both painted and the mark is never missing.

   RENDERING CONTEXT
   `"use client"`. Radix Tabs, plus this module's own layout effect, refs,
   observers and context.
   ========================================================================= */

"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../../lib/utils";
import { FolderShape } from "../folder/folder";

/* ----------------------------------------------------------------------------
   Variant, shared down the tree.

   `variant` is a prop on `Tabs` (and may be overridden on `TabsList`), but the
   trigger needs it too and the commission's API gives it no way to be told —
   1,122 call sites write `<TabsTrigger value="x">Label</TabsTrigger>` and must
   keep working. Context is the only mechanism that carries it without adding
   a required prop to a call site.
   ------------------------------------------------------------------------- */
export type TabsVariant = "line" | "folder";

const TabsVariantContext = React.createContext<TabsVariant>("line");

/** True once `TabsList` has a measured indicator painting the selection mark. */
const TabsIndicatorContext = React.createContext(false);

/* `useLayoutEffect` warns when React renders this module on the server, which
   it does: "use client" marks the hydration boundary, not a browser-only file.
   The measurement must still run BEFORE paint on the client, or the indicator
   arrives one frame late and visibly jumps. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/* ----------------------------------------------------------------------------
   Compose two refs. Local and not exported: `cn` is the only shared helper
   this system has, and a second one does not get invented in a component file.
   ------------------------------------------------------------------------- */
function useComposedRef<T>(
  external: React.Ref<T> | undefined,
  internal: React.MutableRefObject<T | null>,
) {
  return React.useCallback(
    (node: T | null) => {
      internal.current = node;
      if (typeof external === "function") external(node);
      else if (external) (external as React.MutableRefObject<T | null>).current = node;
    },
    [external, internal],
  );
}

/* ============================================================================
   Skins
   ========================================================================= */

const LIST_SKIN: Record<TabsVariant, string> = {
  /** `.kw-tabs` — a row on a hairline, **2px between tabs**. The strip's rule is
      the artifact's own drawn value, `box-shadow: inset 0 -1px 0 var(--hair)`
      (CH17 · CH19), and NOT a CSS border: nothing in this system carries one.

      THE GAP IS 2, NOT 24. CH15 draws the underline strip as
      `display: flex; align-items: center; gap: 2px`, and so do the other three
      places the artifact draws this same strip (CH07's state matrix, CH24's
      record chrome, CH27's detail chrome) — four independent drawings, one
      value. The air between two tabs is the triggers' own inline padding
      (`px-4` below), not a gap; `--space-6` put 24 between two labels that
      carried none. Ruling 28 says 1px and 2px "live off the scale ... never as
      layout"; a 2px seam between two adjoining tab boxes is the same seam the
      folder strip draws at `--space-1`, and the artifact's four drawings win.
      Audited 2026-08-23, GAPS-FIDELITY-BC TAB-B1. */
  line: "flex items-end gap-0.5 shadow-[inset_0_-0.0625rem_0_var(--border)]",
  /**
   * ch14 / 24.3 / 24.6: a row of tabs `--space-1` apart, sitting on their feet
   * and pulled down under the panel by exactly the overlap, so the panel's own
   * top edge covers the tabs' cut bottoms and the active tab reads as attached.
   *
   * The block padding is not slack. `overflow-x: auto` (on the shared base)
   * computes `overflow-y` to `auto` as well, which would clip the 2px focus
   * ring off the top of a tab that fills the strip exactly. Four pixels of
   * padding clears the ring's 2px offset + 2px width, and the matching
   * negative margin puts the strip back where it was.
   */
  folder: cn(
    "flex items-end gap-1",
    "pt-1 mt-[calc(var(--space-1)*-1)]",
    "mb-[calc(var(--folder-tab-overlap)*-1)]",
  ),
};

const TRIGGER_BASE = [
  // The kit's reset line on every bare control. NOT `[font:inherit]`: Tailwind
  // emits that arbitrary property AFTER the named utilities in the bundle, so
  // the shorthand was silently overriding each skin's own step — `line`'s
  // `text-sm` and `folder`'s `text-caption` both measured 15px (the panel's
  // surrounding type) in the live demo. Preflight already gives a <button>
  // `font: inherit`; the skins' named classes then own size and weight.
  "inline-flex cursor-pointer appearance-none items-center justify-center gap-2",
  "border-0 bg-transparent text-inherit",
  "whitespace-nowrap select-none",
  // Motion belongs to motion.css; this class is the whole of it.
  "motion-tab-trigger",
  // Any icon in a tab sits at the button icon size and never shrinks — the
  // kit draws the line variant "with icon and count".
  //
  // The `:not()` is load-bearing and is the only edit this shared block took
  // for `folder`. A descendant rule (0,1,1) outranks the shape's own
  // `size-full` (0,1,0), so without it the folder silhouette was painted at
  // the ICON size — 1rem square in the corner of a 132x45 tab. `line` and
  // has no folder shape to exclude, so the emitted rule is unchanged for it
  // in everything but the selector text.
  "[&_svg:not([data-slot=folder-shape])]:pointer-events-none",
  "[&_svg:not([data-slot=folder-shape])]:size-[var(--icon-button)]",
  "[&_svg:not([data-slot=folder-shape])]:shrink-0",
];

const TRIGGER_SKIN: Record<TabsVariant, string> = {
  line: cn(
    // The same measured rule as `folder` below: the strip scrolls, a tab never
    // shrinks under its own words.
    "shrink-0",
    // `.kw-tab`: 12 block padding, **16 inline padding**, and the 2px mark's
    // own room held open at the block end. The kit drew that room as a
    // transparent 2px border; a border is a border, so the room is padding
    // now and the mark itself is an inset shadow. The pixel geometry is
    // identical and `-mb-px` still pulls the tab back over the strip's rule.
    //
    // THE INLINE PADDING IS THE ARTIFACT'S, AND IT IS NOT DECORATION. CH15
    // draws `padding: 13px 16px 12px`, and the other three drawings of this
    // strip draw 14 or 16 — none draws zero. It is load-bearing twice over:
    // the 2px active mark spans the PADDED box, so a one-word tab still gets
    // a mark wide enough to read, and the strip's 2px gap only makes sense
    // once each tab carries its own air. Audited 2026-08-23,
    // GAPS-FIDELITY-BC TAB-B2.
    "relative -mb-px px-4 pt-3 pb-[calc(var(--space-3)_+_0.125rem)]",
    // The resting ink is SECONDARY, not tertiary: all four drawings of an
    // inactive underline tab write `color: var(--fg2)`. GAPS-FIDELITY-BC
    // TAB-B3.
    "text-sm text-ink-secondary",
    "enabled:hover:text-foreground",
  ),
  folder: cn(
    // One height for every tab, active or not — ch14's rule, verbatim: "a tab
    // never shrinks to say it is unselected".
    //
    // `shrink-0` is that rule's OTHER axis, measured on a real phone
    // (25 Aug 2026): in the scrolling strip the triggers are flex children,
    // and flex shrinks them to `min-width` BEFORE the strip overflows — so
    // every tab clamped to 144, the icon overflowed the start padding to x=0
    // and the count ran into the shoulder curve. A tab takes its content's
    // width and the STRIP scrolls; a tab never shrinks, full stop.
    "shrink-0 h-[var(--folder-tab-height)] min-w-[var(--folder-tab-min-width)]",
    // "The label is centred in the lip, never across the join." The foot below
    // the lip is padding, so the base's `items-center` centres against the lip
    // and not against the whole box; the inline-end padding clears the
    // shoulder, so the label never reaches the curve.
    "pb-[var(--folder-tab-overlap)] ps-5",
    "pe-[calc(var(--folder-shoulder)_+_var(--space-3h))]",
    "gap-[var(--space-2h)]",
    // 13/300 with a quiet secondary label — 24.3's inactive tab.
    //
    // The resting ink is an arbitrary PROPERTY, not `text-ink-secondary`, and
    // that is not a style choice. tailwind-merge does not know that
    // `text-caption` is a font size — it is a kwapso step, not one of
    // Tailwind's — so it files it under text-COLOUR and a following
    // `text-ink-secondary` silently deletes the whole type step, leading and
    // tracking included. `[color:…]` is filed by its property name instead, so
    // the size survives, and it still de-duplicates against the disabled ink
    // so the two can never race on equal specificity (PATTERN §4).
    "text-caption [color:var(--ink-secondary)]",
    "enabled:hover:text-foreground",
    // Above the panel's own z-2 when active, behind it when not, so an
    // inactive tab is "clipped by the card edge" as ch14 puts it.
    "relative z-[1] data-[state=active]:z-[3]",
    // Marker only; the shape reads the trigger's state off it. No styles.
    "group/folder-tab",
  ),
};

/** What the ACTIVE trigger draws when no measured indicator is painting it. */
const TRIGGER_SELECTED: Record<TabsVariant, string> = {
  line: cn(
    // The 2px charcoal rule 27.24 asks for, as an inset shadow rather than a
    // border — same two pixels, same colour, no `border` property.
    "data-[state=active]:shadow-[inset_0_-0.125rem_0_var(--foreground)]",
    "data-[state=active]:text-foreground",
    "data-[state=active]:font-[var(--font-weight-medium)]",
  ),
  /* ch14: "Colour is the only difference." The FILL moves — and that lives on
     the shape, keyed off this trigger's own `data-state` — so all the trigger
     has left to say is the label ink and its weight. 24.3 draws the active
     label at 500 in primary ink and the inactive at 300 in secondary. */
  folder: cn(
    "data-[state=active]:text-foreground",
    "data-[state=active]:font-[var(--font-weight-medium)]",
  ),
};

/** What the ACTIVE trigger draws when the indicator IS painting the mark. */
const TRIGGER_SELECTED_WITH_INDICATOR: Record<TabsVariant, string> = {
  line: cn(
    "data-[state=active]:text-foreground",
    "data-[state=active]:font-[var(--font-weight-medium)]",
  ),
  /* Never reached: a folder strip has no travelling indicator (see
     `TabsList`). Present so the record stays total and no lookup can miss. */
  folder: cn(
    "data-[state=active]:text-foreground",
    "data-[state=active]:font-[var(--font-weight-medium)]",
  ),
};

/* Disabled — a fill and an ink, never an opacity, and composed in JS rather
   than written as a `disabled:` utility. `disabled:bg-x` and
   `data-[state=active]:bg-y` carry identical specificity, so which one paints
   would otherwise be decided by the order Tailwind emits them in — which a
   component may not depend on (PATTERN §4). Two skins, for the same reason
   `button.tsx` has two: the folder tab has a box to fill and the line tab does
   not, and filling a line tab would invent a shape the kit never draws. */
const TRIGGER_DISABLED: Record<TabsVariant, string> = {
  line: "cursor-not-allowed bg-transparent text-[var(--btn-disabled-label)]",
  /* The folder tab HAS a box to fill, but the box is the shape and not the
     element, so the fill moves to the shape (`FOLDER_SHAPE_FILL`) and the
     trigger contributes the dead ink and the cursor. The ink is written as an
     arbitrary property to match the resting ink's form — see `TRIGGER_SKIN` —
     so tailwind-merge drops the loser instead of leaving two rules to race. */
  folder: "cursor-not-allowed [color:var(--btn-disabled-label)]",
};

/* What the SHAPE behind a folder tab is painted in — its `color`, which the
   path takes as `currentColor`.

   The active/inactive move is a `group-data-*` variant rather than a JS
   branch because the trigger does not know its own state; Radix does, and
   writes it on the button. Disabled IS resolved in JS, so that only ONE
   state variant is ever in play and two same-specificity rules can never
   race for the fill (PATTERN §4).

   `motion-tab-trigger` is motion.css's own colour timing. It transitions
   `color`, and `currentColor` follows `color`, so the fill crossfades on the
   kit's curve without this file writing a duration. */
const FOLDER_SHAPE_FILL = {
  live: cn(
    "motion-tab-trigger",
    /* TAB-C1 — READ THE REGISTER BEFORE CHANGING THESE TWO LINES.
       Overrides 30, 38 and 39 are ALL WITHDRAWN (2026-08-23, the K1
       reversal). The block that used to sit here implemented row 30 — the
       two quiet papers transposed, inactive on `--surface-panel` and active
       on `--card` — and told a future reader not to "fix" it. That
       instruction is now the wrong way round and is gone with the row.

       WHAT THE REGISTER STATES NOW, verbatim from row 30's withdrawal: "the
       three papers are the kit's own again: band `#FFFEF9`, inactive tab
       `#FAF9F7`, active tab and panel `#F7F2EB`." Row 39's withdrawal adds
       that the active tab "has a fill again, and it is the panel's" —
       `#F7F2EB` against a `#FFFEF9` band, 1.103 light and 1.111 dark. Row
       38's withdrawal removes the 1.000 bleed that row 30 had caused:
       inactive now measures 1.021 light, 1.611 dark against the band.

       CH14's own page says the same thing in its own words: "the active one
       fills the card colour and sits above it; the rest take the quiet
       #FAF9F7 fill with a secondary label" — #FAF9F7 IS `--muted`, and the
       "card colour" is CH27.1's "the panel's soft paper (#F7F2EB)", which is
       the side row 15 reversed to.

       ONE CONSEQUENCE, ALREADY ACCEPTED ON THE REGISTER: in dark the pair is
       ordered the other way round from light — the inactive tab is LIGHTER
       than the active one — because no dark paper exists between #141310 and
       #1C1B18. Three legible papers was preferred to a faithful ordering
       with one of them at 1.000. Do not "correct" it here.

       The two properties are resolved on the `Tabs` ROOT, not on this
       element; the block there says why. */
    "text-[var(--kw-folder-idle)]",
    "group-data-[state=active]/folder-tab:text-[var(--kw-folder-live)]",
  ),
  dead: "motion-tab-trigger text-[var(--btn-disabled-fill)]",
};

const INDICATOR_SKIN: Record<TabsVariant, string> = {
  // A 2px rule sitting on the strip's hairline, in primary ink.
  line: "bottom-0 h-[0.125rem] -mb-px bg-foreground",
  // Never drawn. A folder tab IS its own mark; see `TabsList`.
  folder: "",
};

/* ============================================================================
   Tabs
   ========================================================================= */

export interface TabsProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /**
   * `line` (kwapso-ui.css `.kw-tab`) or `folder` (kit ch14, the brand
   * silhouette). Both are drawn by the kit and neither is a skin of the
   * other. There is no third: the segmented pill that used to live here was
   * a selection control, and it is `toggle-group`. Defaults to `line`,
   * which is the strip the kit puts at the top of a record and the one the
   * applications' existing tab rows look like.
   *
   * Choosing between `line` and `folder` is not a taste call — chapter 27
   * settles it. If the tab shows the same kind of record with a filter on it,
   * it is a `folder` tab and it belongs to a collection's main screen. If it
   * shows a different face of ONE record, it is a `line` tab. `folder` also
   * brings its own opaque panel: `TabsContent` becomes the card the tabs are
   * attached to.
   */
  variant?: TabsVariant;
}

/**
 * A set of peer panels, one visible at a time.
 *
 * TEN STATES
 *  1. default        — the strip plus the active panel.
 *  2. hover          — belongs to the trigger.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — belongs to the trigger.
 *  5. disabled       — per trigger (`<TabsTrigger disabled>`). There is no
 *                      whole-strip disable, because a tab set with every tab
 *                      dead shows no content at all and is a screen the
 *                      composition should not have rendered.
 *  6. loading        — does not apply to the set. A panel whose contents have
 *                      not arrived renders a `Skeleton` inside its own
 *                      `TabsContent`; swapping the strip for a placeholder
 *                      would move the tabs the reader is aiming at.
 *  7. empty          — a set with no triggers renders an empty strip: no
 *                      hairline, no tabs, nothing invented. `TabsView`, which
 *                      does know its own items, returns `null` for an empty
 *                      list instead.
 *  8. error          — does not apply. A tab set reports nothing; a panel that
 *                      failed renders its own `Alert`.
 *  9. selected       — the whole point of the component. Radix owns it via
 *                      `value` / `defaultValue`; the mark is the indicator, or
 *                      the active trigger's own border/fill before it measures.
 * 10. read-only      — does not apply. Switching a tab changes nothing but
 *                      what is on screen, so there is no editable state to
 *                      protect.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in geometry. Neither specimen states
 *  a second size. What DOES change is what the strip does when it runs out of
 *  width, and that is stated on `TabsList`.
 *
 * RTL — safe. The strip is a flex row that mirrors, every inset is logical,
 * and the indicator's transform is signed off the computed direction.
 */
const Tabs = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ className, variant = "line", ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.Root
      ref={ref}
      data-slot="tabs"
      data-variant={variant}
      className={cn(
        "flex flex-col",
        // A folder strip and its panel are not separated, they OVERLAP: the
        // strip carries a negative block-end margin and the panel rides up
        // over the tabs' feet. Any gap here would pull them apart and the
        // tabs would stop looking attached.
        variant === "folder" ? "gap-0" : "gap-4",
        /* TAB-C1 — THE FOLDER TAB'S TWO PAPERS, RESOLVED HERE AND NOWHERE
           ELSE. This is the durable fix override 30's withdrawal says is
           "owed" and names this file for.

           The pair the register now states is: active tab and panel
           `#F7F2EB` (`--surface-panel`), inactive tab `#FAF9F7`
           (`--muted` — whose own comment in tokens.css reads "inactive tabs,
           idle wells"), band `#FFFEF9`. The build had them the other way
           round, which is withdrawn row 30's arrangement, and only
           `collection-frame.tsx` was putting them right, by rebinding
           `--card` and `--surface-panel` around this component.

           WHY THE ROOT AND NOT THE TRIGGER. `CollectionFrame` rebinds
           `--surface-panel: var(--muted)` ON `TabsList`, so a trigger that
           read `--surface-panel` for its ACTIVE fill would resolve it to the
           inactive paper and the active tab would vanish. Custom properties
           are substituted at computed-value time on the element that declares
           them, so resolving both papers HERE — one level above that
           rebinding — is correct in both worlds at once: standalone, and
           inside a frame whose rebinding is now inert and can be deleted by
           its owner with no visual change. */
        variant === "folder"
          ? cn(
              "[--kw-folder-live:var(--surface-panel)]",
              "[--kw-folder-idle:var(--muted)]",
            )
          : undefined,
        className,
      )}
      {...props}
    />
  </TabsVariantContext.Provider>
));

Tabs.displayName = "Tabs";

/* ============================================================================
   TabsList
   ========================================================================= */

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** Override the variant inherited from `Tabs`, for a strip that differs. */
  variant?: TabsVariant;
  /**
   * Draw the measured travelling indicator. Default `true`. Set `false` for a
   * strip that reorders or virtualises its own triggers, where a measured
   * position would chase a moving target — the active trigger then draws its
   * own mark, which is the same picture without the travel.
   */
  indicator?: boolean;
}

/**
 * The strip.
 *
 * TEN STATES — the set's block covers all ten; the strip adds only the
 * hairline (`line`) that the kit draws under it.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — the ONE thing in this component that changes
 *  with width, and it changes by itself at every width rather than at a
 *  breakpoint: the strip scrolls on the inline axis inside its own container
 *  (`overflow-x-auto`, triggers `whitespace-nowrap`) rather than wrapping to a
 *  second line. This is the kit's own answer to content wider than the
 *  viewport — `.kw-matrix-scroll` in _fragments/f3.css scrolls the wide table
 *  instead of restacking it. A tab strip that wrapped would move every tab
 *  under the reader's finger the moment one label got longer, and a two-line
 *  strip no longer reads as one row of peers. `scrollbar-width: none` hides
 *  the OS bar because the strip is short enough to be dragged and a bar under
 *  a 2px rule reads as a second rule.
 *  Focus survives it: nothing sets `overflow: hidden`, and `scroll-p-2`
 *  (0.5rem) is more than the ring's 2px offset + 2px width, so tabbing across
 *  a scrolled strip brings each tab into view ring and all.
 *
 * RTL — safe. `overflow-x` and flex both mirror; the indicator is offset from
 * the inline-start, measured against the computed direction.
 */
const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, children, variant, indicator = true, ...props }, ref) => {
  const inherited = React.useContext(TabsVariantContext);
  const resolved = variant ?? inherited;

  /* A folder strip never travels a mark. The selection IS the tab: its fill
     changes and it rises above the panel, so there is no separate element for
     the eye to track and a measured bar sliding under a row of folder tabs
     would be a second, contradicting selection mark. Forced here rather than
     left to the call site so no composition can switch it back on. */
  const travels = indicator && resolved !== "folder";

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const composedRef = useComposedRef(ref as React.Ref<HTMLDivElement>, listRef);

  /** `null` until measured; `offset` is along the INLINE axis, signed for RTL. */
  const [mark, setMark] = React.useState<{
    offset: number;
    size: number;
    sign: number;
  } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !travels) {
      setMark(null);
      return;
    }

    const measure = () => {
      const active = list.querySelector<HTMLElement>(
        '[data-slot="tabs-trigger"][data-state="active"]',
      );
      if (!active) {
        setMark(null);
        return;
      }

      /* offsetLeft is measured from the offset parent's padding edge, and the
         strip is `relative`, so the two agree. clientWidth is that same
         padding box. Reading the physical box and converting it to an
         inline-axis offset here is what makes the indicator correct in Arabic,
         Urdu and Persian without a second code path. */
      const rtl = getComputedStyle(list).direction === "rtl";
      const physical = active.offsetLeft;
      const offset = rtl
        ? list.clientWidth - (physical + active.offsetWidth)
        : physical;

      setMark((prev) =>
        prev &&
        prev.offset === offset &&
        prev.size === active.offsetWidth &&
        prev.sign === (rtl ? -1 : 1)
          ? prev
          : { offset, size: active.offsetWidth, sign: rtl ? -1 : 1 },
      );
    };

    measure();

    /* Three things move the mark, and all three have to be watched:
       a value change (Radix rewrites `data-state`), a resize of the strip or
       of any trigger inside it, and a label that reflows once a webfont
       lands — which the resize observer also catches. */
    const mutations = new MutationObserver(measure);
    mutations.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "disabled"],
      childList: true,
    });

    const resizes = new ResizeObserver(measure);
    resizes.observe(list);
    for (const child of Array.from(list.children)) resizes.observe(child);

    return () => {
      mutations.disconnect();
      resizes.disconnect();
    };
  }, [travels, children]);

  const live = mark !== null;

  return (
    <TabsVariantContext.Provider value={resolved}>
      <TabsIndicatorContext.Provider value={live}>
        <TabsPrimitive.List
          ref={composedRef}
          data-slot="tabs-list"
          data-variant={resolved}
          data-indicator={live ? "live" : undefined}
          className={cn(
            "relative max-w-full overflow-x-auto scroll-p-2 [scrollbar-width:none]",
            "[&::-webkit-scrollbar]:hidden",
            LIST_SKIN[resolved],
            className,
          )}
          {...props}
        >
          {/* First in the DOM so positioned siblings paint over it: the
              indicator is BEHIND its label, not on top of it. */}
          {mark ? (
            <span
              aria-hidden="true"
              data-slot="tabs-indicator"
              className={cn(
                "motion-tab-indicator pointer-events-none absolute",
                INDICATOR_SKIN[resolved],
              )}
              style={{
                insetInlineStart: 0,
                width: `${mark.size}px`,
                transform: `translateX(${mark.sign * mark.offset}px)`,
              }}
            />
          ) : null}
          {children}
        </TabsPrimitive.List>
      </TabsIndicatorContext.Provider>
    </TabsVariantContext.Provider>
  );
});

TabsList.displayName = "TabsList";

/* ============================================================================
   TabsTrigger
   ========================================================================= */

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Override the variant inherited from `Tabs` / `TabsList`. */
  variant?: TabsVariant;
}

/**
 * One tab.
 *
 * `folder` renders a `FolderShape` behind the label. That is one extra child,
 * so `asChild` is not supported on a folder tab — Radix's `Slot` takes exactly
 * one child, and the kit draws no folder tab that is anything but a button.
 * `line` is untouched and still renders `children` alone.
 *
 * A count rides along as a child, not as an API: ch14 rules that "counts are
 * quiet, never badges", so a call site writes the number in
 * `text-micro tabular-nums text-ink-tertiary` next to the label rather than
 * reaching for `Badge`.
 *
 * TEN STATES
 *  1. default        — `line`: tertiary ink over the strip's own rule.
 *                      `folder`: secondary ink on a `--surface-idle` folder
 *                      silhouette, one height with every other tab.
 *  2. hover          — an INK move to `--foreground`, which is the kit's hover
 *                      on `.kw-tab`. No fill change and
 *                      no opacity. Guarded with `enabled:` so a disabled tab
 *                      never matches the rule.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — no nudge and no third tone. A tab's press resolves
 *                      instantly into the selected state, which is a far
 *                      louder acknowledgement than a 1px drop; the kit draws
 *                      no pressed tab (GAPS-D TAB-3).
 *  5. disabled       — `--btn-disabled-fill` / `--btn-disabled-label` and
 *                      `cursor-not-allowed`. A fill and an ink, emitted after
 *                      the variant so tailwind-merge drops the loser rather
 *                      than leaving two same-specificity rules to race. On
 *                      `folder` the fill is the SHAPE's, picked in JS for the
 *                      same reason, so the silhouette itself goes dead rather
 *                      than a rectangle appearing behind it.
 *  6. loading        — does not apply to a tab. The panel loads, not its label.
 *  7. empty          — an unlabelled tab renders an empty control. Nothing is
 *                      invented; a tab with no name is a call-site bug.
 *  8. error          — does not apply. A tab that leads to a failing panel is
 *                      still a working tab; the panel reports its own failure.
 *                      A count of problems is a `Badge` passed as a child.
 *  9. selected       — `data-state="active"`. Drawn by the strip's indicator
 *                      when it has measured, and by the trigger's own inset
 *                      2px rule (`line`) when it has not, so
 *                      the mark exists on the server render too. `folder`
 *                      never measures an indicator: the mark is the tab's own
 *                      fill going to `--card` and the tab rising above the
 *                      panel. "Colour is the only difference — a tab never
 *                      shrinks to say it is unselected." 
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The tab never wraps and never
 *  truncates; the strip scrolls instead. A tab that shrank would stop matching
 *  its neighbours, and a truncated tab label is a tab you cannot choose.
 *
 * RTL — safe. `px-*` is padding-inline, `-mb-px` is on the block axis, and the
 * icon slot is ordered by `gap` rather than by side.
 */
const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant, disabled = false, children, ...props }, ref) => {
  const inherited = React.useContext(TabsVariantContext);
  const indicatorLive = React.useContext(TabsIndicatorContext);
  const resolved = variant ?? inherited;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-slot="tabs-trigger"
      disabled={disabled}
      className={cn(
        TRIGGER_BASE,
        TRIGGER_SKIN[resolved],
        // A dead tab draws no selection mark: it cannot be the one you chose.
        !disabled &&
          (indicatorLive
            ? TRIGGER_SELECTED_WITH_INDICATOR[resolved]
            : TRIGGER_SELECTED[resolved]),
        // `relative` so the label paints above the indicator behind it.
        "relative",
        // Last, so tailwind-merge drops the resting fill and ink rather than
        // leaving two same-specificity rules to race.
        disabled && TRIGGER_DISABLED[resolved],
        className,
      )}
      {...props}
    >
      {/* The folder tab's own silhouette, behind its label. The trigger sets
          `z-[1]`, which makes it a stacking context, so this negative index
          stays inside the tab and never falls behind the panel. `line` and
          renders exactly what it always did: `children` alone. */}
      {resolved === "folder" ? (
        <FolderShape
          crop="lip"
          className={cn(
            "absolute inset-0 -z-10",
            disabled ? FOLDER_SHAPE_FILL.dead : FOLDER_SHAPE_FILL.live,
          )}
        />
      ) : null}
      {children}
    </TabsPrimitive.Trigger>
  );
});

TabsTrigger.displayName = "TabsTrigger";

/* ============================================================================
   TabsContent
   ========================================================================= */

export interface TabsContentProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {}

/**
 * One panel.
 *
 * `.motion-tab-panel-in` is the tight 4px rise, on the INCOMING panel only.
 * motion.css §8 is explicit about why there is no horizontal slide: tabs are
 * peers, not a sequence, and sliding them would be a lie about the information
 * architecture.
 *
 * TEN STATES — the set's block covers all ten; the panel adds none of its own.
 * On `line` it paints no surface, so it sits on whatever it is
 * dropped into and needs no second drawing for dark.
 *
 * ON `folder` IT IS THE CARD. That is not decoration: chapter 14's tabs are
 * "clipped by the card edge" and the active one "fills the card colour and
 * sits above it", so the card has to exist and has to be opaque or there is
 * nothing to clip against and nothing for the tab to match. It paints
 * `--kw-folder-live` — the SAME custom property `FOLDER_SHAPE_FILL` paints the
 * active shape with (TAB-C1) — at `--radius`, and `z-2`, above the inactive
 * tabs' `z-1`, below the active tab's `z-3`, which are chapter 24.3's own
 * three numbers.
 *
 * TAB-C2 — WHY NOT `bg-card`, THE WAY THIS ELEMENT USED TO READ IT. It used
 * to be: `--kw-folder-live` is `var(--surface-panel)`
 * by construction (set on `Tabs`, see the block there), and `bg-card` only
 * matched it where a caller ALSO rebound `--card` to `--surface-panel`
 * (`collection-frame.tsx` used to be the one caller that did) — everywhere
 * else `--card` stayed the kit's off-beige page tone (`--kw-off-beige`,
 * `#FFFEF9` light / `--kw-unlit-raised` `#26241F` dark), so a bare
 * `<Tabs variant="folder">` — exactly the specimen `demo/sections/t-z.tsx`
 * draws, and exactly what the client's screenshot showed — painted the panel
 * one paper lighter than its own active tab. Measured before this fix: light
 * active `#F7F2EB` vs panel `#FFFEF9` (1.081 apart); dark active `#1C1B18` vs
 * panel `#26241F` (1.238 apart). Reading the same property the shape reads
 * removes the second path entirely: the panel and the active tab now share
 * one value in every container, standalone or framed, and nothing needs
 * rebinding for them to agree.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The panel is a plain block at the
 *  parent's width; whatever is inside it does its own responding.
 *
 * RTL — safe. Nothing is positioned by side.
 */
const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className, ...props }, ref) => {
  const resolved = React.useContext(TabsVariantContext);

  return (
    <TabsPrimitive.Content
      ref={ref}
      data-slot="tabs-content"
      className={cn(
        "motion-tab-panel-in",
        resolved === "folder" &&
          "relative z-[2] rounded-[var(--radius)] bg-[var(--kw-folder-live)] p-6 text-card-foreground",
        className,
      )}
      {...props}
    />
  );
});

TabsContent.displayName = "TabsContent";

/* ============================================================================
   TabsView
   ========================================================================= */

export interface TabsViewItem {
  /** The value Radix switches on. Must be unique within the view. */
  value: string;
  /** What the tab says. A node, so a `Badge` count can ride along. */
  label: React.ReactNode;
  /** The panel. */
  content?: React.ReactNode;
  /** Dead tab: `--btn-disabled-fill` / `--btn-disabled-label`, not an opacity. */
  disabled?: boolean;
}

export interface TabsViewProps extends Omit<TabsProps, "children"> {
  /** The tabs, in order. An empty array renders `null`. */
  items: TabsViewItem[];
  /** Extra classes for the strip. */
  listClassName?: string;
  /** Extra classes for every panel. */
  contentClassName?: string;
  /**
   * Accessible name for the strip, announced before the tab count. Undefined
   * leaves the strip unnamed, which is correct when a visible heading sits
   * above it and is labelled with `aria-labelledby` at the call site — so this
   * component hardcodes no string of its own.
   */
  listLabel?: string;
}

/**
 * The whole tab set from one array — strip, panels and wiring.
 *
 * Added by the commission (§6 lists `TabsView` alongside the four Radix parts)
 * but not described anywhere, and drawn nowhere in the kit. Its SHAPE is
 * therefore a derivation and is logged as GAPS-D TAB-1; its APPEARANCE is not
 * derived at all — it renders `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`
 * and inherits every decision above.
 *
 * TEN STATES
 *  1. default        — as `Tabs`, with the first item selected unless
 *                      `defaultValue` or `value` says otherwise.
 *  2-6, 9-10         — as the parts. `disabled` per item.
 *  7. empty          — `items: []` renders `null`. A strip with no tabs and a
 *                      panel with nothing in it is a hole, and the kit's rule
 *                      throughout is to render nothing rather than fill one.
 *                      An item with no `content` renders an empty panel, which
 *                      is a real case: a tab whose data has not been fetched.
 *  8. error          — does not apply; an item's `content` carries its own.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED; the strip scrolls, per `TabsList`.
 *
 * RTL — safe; every part is.
 */
const TabsView = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Root>,
  TabsViewProps
>(
  (
    {
      items,
      className,
      listClassName,
      contentClassName,
      listLabel,
      variant = "line",
      defaultValue,
      ...props
    },
    ref,
  ) => {
    if (items.length === 0) return null;

    return (
      <Tabs
        ref={ref}
        variant={variant}
        defaultValue={defaultValue ?? items[0].value}
        className={className}
        {...props}
      >
        <TabsList aria-label={listLabel} className={listClassName}>
          {items.map((item) => (
            <TabsTrigger key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {items.map((item) => (
          <TabsContent key={item.value} value={item.value} className={contentClassName}>
            {item.content}
          </TabsContent>
        ))}
      </Tabs>
    );
  },
);

TabsView.displayName = "TabsView";

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsView };
