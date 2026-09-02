/* ============================================================================
   Tabs — peers, switched between (21 direct call sites).

   DESIGN SOURCE
   ONE VARIANT, `line` — design-mothership/specimens/kwapso-ui.css → `.kw-tabs`
   / `.kw-tab`: a row on a `--hair` rule, `--space-6` apart, each tab
   `--space-3` block padding with a 2px transparent block-end border pulled
   back over the rule by one hairline. Tertiary ink, going to primary ink on
   hover; the selected tab is primary ink at 500 with the border in
   `--ink-primary`.
   motion/motion.css §8 → `.motion-tab-indicator`, `.motion-tab-trigger`,
   `.motion-tab-panel-in`.

   `folder` IS GONE — CLIENT RULING, 2026-09-02, v1.2.28.
   "the whole concept of folders as tabs gets killed. All the current folders
   as tabs we have will become line tabs. Completely kill and remove folder
   tabs… I don't want any dead body around… the only tabs that we will have
   are the line tabs because folders will only be used for the breadcrumbs."

   READ THIS BEFORE RESTORING ANYTHING FROM THE HISTORY OF THIS FILE. What was
   retired is the tab VARIANT, not the brand silhouette. `folder/folder.tsx` is
   untouched, `FolderShape` is unchanged control point for control point, and
   its `lip` crop has exactly one consumer now:
   `components/breadcrumbs/breadcrumb-folders.tsx`, the breadcrumb drawn as a
   folder strip. Everything this file used to hold about the folder tab — the
   47.5 height, the `--space-1` seam, the `--folder-tab-overlap` pull, the
   13/300 label, the two papers and their whole TAB-C1 register history — moved
   there verbatim rather than being deleted, and that file is where it is
   maintained. `--folder-tab-overlap` and its sibling tokens did NOT go with
   the variant; the breadcrumb reads them.

   THE `pill` PRECEDENT, RESTATED BECAUSE IT NOW APPLIES TWICE. Review round 1
   deleted a third variant that was a segmented CONTROL (t10.css
   `.kw-seg__btn`) wearing a tab's name; it still exists as `toggle-group` and
   `mode-toggle`. `TabsVariant` was made a closed union then so a call site
   writing `variant="pill"` would fail to compile rather than drift. It is a
   ONE-member union now, for the same reason and against `"folder"`.

   THE LAW THIS FILE OBEYS
   · A tab is a real button and takes the global ring like every other control.
     Nothing here sets `outline: none`.
   · Hover is a named token, never an opacity — the kit's hover on `.kw-tab`
     is an INK move (`--ink-tertiary` -> `--ink-primary`) with no fill change
     at all, so none is invented.
   · Disabled is an ink (`--btn-disabled-label`) and a cursor, never an
     opacity, and the hover is suppressed so a dead tab never looks live. There
     is no disabled FILL any more: a line tab has no resting box to fill, and
     filling one would invent a shape the kit does not draw. The fill half of
     that pair belonged to the folder silhouette and left with it.
   · Only four radii exist, and a tab claims none of them: `line` is a rule
     under type.
   · Focus is ONE global rule (tokens.css §8). No ring here, no `outline: none`
     anywhere, and the negative hairline margin is small enough that the ring
     still clears the rule.
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

/* ----------------------------------------------------------------------------
   The variant, and why a one-member union is still worth typing.

   It carries nothing at runtime any more — there is one skin, so nothing is
   chosen and nothing has to be handed down the tree. What it does is FAIL A
   BUILD: a call site that still writes `variant="folder"` (or `"pill"`) does
   not silently draw a line tab, it stops compiling and gets sent to
   `components/breadcrumbs/breadcrumb-folders.tsx`, which is where the folder
   shape lives now.

   THE CONTEXT THAT USED TO BE HERE IS GONE WITH THE SECOND VARIANT, and so
   are the `variant` overrides on `TabsList` and `TabsTrigger`. Both existed
   for one purpose — letting one strip, or one trigger, differ from its `Tabs`
   root — which cannot happen when there is one skin. Keeping them would be
   keeping a lever with nothing on the other end.
   ------------------------------------------------------------------------- */
export type TabsVariant = "line";

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
    breadcrumb's folder strip draws at `--space-1`, and the artifact's four
    drawings win. Audited 2026-08-23, GAPS-FIDELITY-BC TAB-B1. */
const LIST_SKIN = "flex items-end gap-0.5 shadow-[inset_0_-0.0625rem_0_var(--border)]";

const TRIGGER_BASE = [
  // Named so `TabsCount` can key its shape off THIS element's own
  // `data-state`, the same attribute the indicator measures off. A count is a
  // child of the trigger, not a sibling, so `group-data-*` — not `peer-*` —
  // is the mechanism; see `TabsCount` below and GAPS-RULINGS.md R-4a.
  "group/tab",
  // The kit's reset line on every bare control. NOT `[font:inherit]`: Tailwind
  // emits that arbitrary property AFTER the named utilities in the bundle, so
  // the shorthand was silently overriding the skin's own step — `text-sm`
  // measured 15px (the panel's surrounding type) in the live demo. Preflight
  // already gives a <button> `font: inherit`; the skin's named classes then
  // own size and weight.
  "inline-flex cursor-pointer appearance-none items-center justify-center gap-2",
  "border-0 bg-transparent text-inherit",
  "whitespace-nowrap select-none",
  // Motion belongs to motion.css; this class is the whole of it.
  "motion-tab-trigger",
  // Any icon in a tab sits at the button icon size and never shrinks — the
  // kit draws the line variant "with icon and count".
  //
  // THE `:not([data-slot=folder-shape])` GUARD IS GONE WITH THE FOLDER
  // VARIANT (2026-09-02). It existed because one shared block served two
  // skins and only one of them put a silhouette inside the button, where a
  // descendant rule (0,1,1) outranked the shape's own `size-full` (0,1,0) and
  // painted the whole outline at 1rem square. A line tab has no shape inside
  // it, so the plain rule is the correct rule; the guard lives on, unchanged
  // in effect, in `breadcrumbs/breadcrumb-folders.tsx`, which is the one place
  // an svg silhouette now sits inside a tab-shaped control.
  "[&_svg]:pointer-events-none",
  "[&_svg]:size-[var(--icon-button)]",
  "[&_svg]:shrink-0",
];

const TRIGGER_SKIN = cn(
  // The strip scrolls; a tab never shrinks under its own words.
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
  // "SAME WEIGHTS AS NAVBAR" — CLIENT RULING 2026-09-02, second half. The
  // hover-preview fix below made hover and active agree; it never made the
  // RESTING tab agree with the rail's own `ROW_IDLE`
  // (`compositions/templates/rail.tsx`), which states its idle weight
  // explicitly as `--font-weight-light`. Without a class here the trigger
  // carried NO font-weight at all — a `<button>` inherits `font: inherit`
  // from Preflight, and nothing in this file or `text-sm` ever set one — so
  // the computed weight was the browser's default 400, a THIRD value the
  // rail never draws. Naming it explicitly makes idle/hover/active on a tab
  // read the identical three numbers (300/500/500) the rail's nav rows do.
  "font-[var(--font-weight-light)]",
  // WEIGHT AS A THIRD SIGNAL, CLIENT RULING 2026-09-02 — colour is
  // untouched (the rule above is unchanged); hover on an inactive trigger
  // ALSO previews the active weight, `--font-weight-medium`, the same token
  // `TRIGGER_SELECTED` sets two blocks down. A no-op on an already-
  // active trigger (it is already at that weight, unconditionally), so this
  // needs no `data-[state=inactive]` guard.
  "enabled:hover:font-[var(--font-weight-medium)]",
);

/** What the ACTIVE trigger draws when no measured indicator is painting it. */
const TRIGGER_SELECTED = cn(
  // The 2px charcoal rule 27.24 asks for, as an inset shadow rather than a
  // border — same two pixels, same colour, no `border` property.
  "data-[state=active]:shadow-[inset_0_-0.125rem_0_var(--foreground)]",
  "data-[state=active]:text-foreground",
  "data-[state=active]:font-[var(--font-weight-medium)]",
);

/** What the ACTIVE trigger draws when the indicator IS painting the mark. */
const TRIGGER_SELECTED_WITH_INDICATOR = cn(
  "data-[state=active]:text-foreground",
  "data-[state=active]:font-[var(--font-weight-medium)]",
);

/* Disabled — an ink and a cursor, never an opacity, and composed in JS rather
   than written as a `disabled:` utility. `disabled:text-x` and
   `data-[state=active]:text-y` carry identical specificity, so which one
   paints would otherwise be decided by the order Tailwind emits them in —
   which a component may not depend on (PATTERN §4).

   THERE IS NO DISABLED FILL, and there never was one on this variant: a line
   tab has no resting box, so filling a dead one would invent a shape the kit
   does not draw. `--btn-disabled-fill` was the FOLDER silhouette's half of the
   pair and left with the folder variant on 2026-09-02. `bg-transparent` is
   still written, because the base sets it and a `disabled:` rule that said
   nothing about the fill would leave a caller's own `bg-*` painting behind a
   dead tab. */
const TRIGGER_DISABLED = "cursor-not-allowed bg-transparent text-[var(--btn-disabled-label)]";

/** A 2px rule sitting on the strip's hairline, in primary ink. */
const INDICATOR_SKIN = "bottom-0 h-[0.125rem] -mb-px bg-foreground";

/* ============================================================================
   Tabs
   ========================================================================= */

export interface TabsProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /**
   * `line` — kwapso-ui.css `.kw-tab`, and the only tab the kit draws. There is
   * no second value to pass and no reason to pass this one; it exists so that
   * a call site still writing `variant="folder"` (or the older `"pill"`) fails
   * to compile instead of silently getting a line tab. The folder shape is a
   * breadcrumb now — `components/breadcrumbs/breadcrumb-folders.tsx`.
   *
   * CLIENT RULING, 2026-09-02: "the only tabs that we will have are the line
   * tabs because folders will only be used for the breadcrumbs." This replaces
   * ruling E of 2026-08-22 ("folder tabs are for main screens, line tabs for
   * detail screens"), which had a choice to govern and no longer does.
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
  <TabsPrimitive.Root
    ref={ref}
    data-slot="tabs"
    /* Still stamped, and still one word. A stylesheet, a test or a screenshot
       diff that keys on `[data-variant="line"]` keeps working, and the day a
       second tab is drawn the attribute is already there to tell them apart. */
    data-variant={variant}
    className={cn("flex flex-col gap-4", className)}
    {...props}
  />
));

Tabs.displayName = "Tabs";

/* ============================================================================
   TabsList
   ========================================================================= */

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
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
 * hairline the kit draws under it.
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
>(({ className, children, indicator = true, ...props }, ref) => {
  /* One variant, so the indicator's only switch is the caller's own. The
     second half of this condition used to be `resolved !== "folder"` — a
     folder strip never travelled a mark, because the selection WAS the tab —
     and it went with the variant on 2026-09-02. */
  const travels = indicator;

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
    <TabsIndicatorContext.Provider value={live}>
      <TabsPrimitive.List
        ref={composedRef}
        data-slot="tabs-list"
        data-indicator={live ? "live" : undefined}
        className={cn(
          "relative max-w-full overflow-x-auto scroll-p-2 [scrollbar-width:none]",
          "[&::-webkit-scrollbar]:hidden",
          LIST_SKIN,
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
              INDICATOR_SKIN,
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
  );
});

TabsList.displayName = "TabsList";

/* ============================================================================
   TabsTrigger
   ========================================================================= */

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {}

/**
 * One tab.
 *
 * A count rides along as a child, not as an API: `TabsCount` (below) is the
 * shaped number, so a call site never hand-rolls the count's markup and the
 * two cannot drift apart. Its shape is GAPS-RULINGS.md R-4a's ruling: quiet
 * tertiary text at rest, and on the ACTIVE tab only, a small circular mango
 * fill with primary-ink text — see `TabsCount` for the shape itself.
 *
 * TEN STATES
 *  1. default        — secondary ink over the strip's own rule.
 *  2. hover          — an INK move to `--foreground`, which is the kit's hover
 *                      on `.kw-tab`, plus a preview of the active weight. No
 *                      fill change and no opacity. Guarded with `enabled:` so
 *                      a disabled tab never matches the rule.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — no nudge and no third tone. A tab's press resolves
 *                      instantly into the selected state, which is a far
 *                      louder acknowledgement than a 1px drop; the kit draws
 *                      no pressed tab (GAPS-D TAB-3).
 *  5. disabled       — `--btn-disabled-label` and `cursor-not-allowed`. An ink
 *                      and a cursor, emitted after the skin so tailwind-merge
 *                      drops the loser rather than leaving two
 *                      same-specificity rules to race. No FILL: a line tab has
 *                      no resting box, and inventing one to grey it out would
 *                      be drawing a shape the kit does not have.
 *  6. loading        — does not apply to a tab. The panel loads, not its label.
 *  7. empty          — an unlabelled tab renders an empty control. Nothing is
 *                      invented; a tab with no name is a call-site bug.
 *  8. error          — does not apply. A tab that leads to a failing panel is
 *                      still a working tab; the panel reports its own failure.
 *                      A count of problems is a `Badge` passed as a child.
 *  9. selected       — `data-state="active"`. Drawn by the strip's indicator
 *                      when it has measured, and by the trigger's own inset
 *                      2px rule when it has not, so the mark exists on the
 *                      server render too.
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
>(({ className, disabled = false, ...props }, ref) => {
  const indicatorLive = React.useContext(TabsIndicatorContext);

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-slot="tabs-trigger"
      disabled={disabled}
      className={cn(
        TRIGGER_BASE,
        TRIGGER_SKIN,
        // A dead tab draws no selection mark: it cannot be the one you chose.
        !disabled &&
          (indicatorLive ? TRIGGER_SELECTED_WITH_INDICATOR : TRIGGER_SELECTED),
        // Last, so tailwind-merge drops the resting ink rather than leaving
        // two same-specificity rules to race.
        disabled && TRIGGER_DISABLED,
        className,
      )}
      {...props}
    />
  );
});

TabsTrigger.displayName = "TabsTrigger";

/* ============================================================================
   TabsCount

   THE 2026-08-31/09-01 CLIENT RULING — recorded in full at GAPS-RULINGS.md
   R-4a. Read that entry before touching the block below: it is a NEW decision
   that changes what CH27's "underline strip with a quiet count" meant in
   practice, and it is not a taste call to soften back to symmetric.

   THE SECOND HALF OF R-4a LEFT WITH THE FOLDER VARIANT (2026-09-02). It was
   ch14's own law — "counts are quiet, never badges", micro/tabular/tertiary,
   no shape, active or not, because a folder tab already said "selected" with
   its own fill and rise. Nothing in the kit draws a count on a breadcrumb
   crumb, so it did not move to `breadcrumbs/breadcrumb-folders.tsx` with the
   rest of the skin; it is recorded here and is not reachable.
   ========================================================================= */

/* R-4a. At rest: bare `text-badge` (12 — "badge, count and status text",
   KWAPSO-SPEC ch07/ch26) in tertiary ink, no shape at all — never a pill,
   never a stroke, matching the inactive half of the ruling exactly.
   On the tab THIS count lives in going active — read off `group/tab`'s own
   `data-state`, the same attribute the strip's indicator measures off, so
   no JS branch is needed here — the number gains a small fully circular
   mango fill (`rounded-pill`, the kit's own name for the geometry, not a
   literal `rounded-full`) at `1.125rem` (18px, the client's stated
   "~16-18px" ceiling) with primary-ink (`--primary-foreground`, already
   charcoal) text. The type size does not change between the two states —
   "colour is the only difference" is ch14's phrase for the tab itself, and it
   is kept here for the count too, so a count never reflows the label beside it
   when its own tab is selected. */
const TABS_COUNT_SKIN = cn(
  "text-badge tabular-nums leading-none text-ink-tertiary",
  "group-data-[state=active]/tab:inline-flex group-data-[state=active]/tab:size-[1.125rem]",
  "group-data-[state=active]/tab:items-center group-data-[state=active]/tab:justify-center",
  "group-data-[state=active]/tab:rounded-pill group-data-[state=active]/tab:bg-primary",
  "group-data-[state=active]/tab:text-primary-foreground",
);

export interface TabsCountProps extends React.ComponentPropsWithoutRef<"span"> {
  /**
   * Zero or a negative count renders nothing — `Badge`'s own zero law
   * (SHELL.md: "counts render empty when zero"), applied here without
   * reaching for `Badge`: on an ACTIVE tab this IS shaped like a badge, but it
   * is drawn by this file so the shape can turn off again on the other three
   * states without a second component existing to turn off.
   */
  count: number | undefined;
}

/**
 * The live number beside a tab's label. A child of `TabsTrigger`, not a prop
 * on it — `<TabsTrigger value="x">Label <TabsCount count={n} /></TabsTrigger>`
 * — so the trigger's own API stays the one Radix already ships and a call
 * site keeps full control over what else rides beside the label (an icon, a
 * `Tooltip`).
 *
 * TEN STATES — as `TabsTrigger`'s own block; this adds only the shape
 * `TABS_COUNT_SKIN` describes, keyed off the SAME `data-state` the strip's
 * indicator reads, so the two can never disagree about which tab is active.
 *
 * RTL — safe. The pill is a fixed square (`size-*`), and the text inside it
 * is centred both axes; nothing here is positioned by side.
 */
const TabsCount = React.forwardRef<HTMLSpanElement, TabsCountProps>(
  ({ count, className, ...props }, ref) => {
    if (count === undefined || count <= 0) return null;

    return (
      <span
        ref={ref}
        data-slot="tabs-count"
        className={cn(TABS_COUNT_SKIN, className)}
        {...props}
      >
        {count}
      </span>
    );
  },
);

TabsCount.displayName = "TabsCount";

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
 * It paints NO SURFACE, so it sits on whatever it is dropped into and needs no
 * second drawing for dark.
 *
 * IT USED TO BECOME A CARD ON `folder`, and that whole branch went with the
 * variant on 2026-09-02 — the radius, the `--kw-folder-live` fill, the `p-6`
 * and the `z-2` between the inactive tabs' `z-1` and the active tab's `z-3`.
 * It was there because chapter 14's tabs are "clipped by the card edge" and
 * the active one "fills the card colour", so a folder strip had to have an
 * opaque card to clip against. The breadcrumb strip attaches to a card it does
 * NOT own — the shell's — so the card is not this file's to draw any more, and
 * TAB-C2's whole argument about `bg-card` versus the shape's own property is
 * settled by there being no fill here at all.
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
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    data-slot="tabs-content"
    className={cn("motion-tab-panel-in", className)}
    {...props}
  />
));

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
  /** Dead tab: `--btn-disabled-label` and a cursor, not an opacity. */
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

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount, TabsView };
