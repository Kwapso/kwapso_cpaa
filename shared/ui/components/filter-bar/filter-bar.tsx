/* ============================================================================
   FilterBar · RangeFacet · SearchableFacet · CompactFacet — the narrowing
   controls (1 direct call site on the bar).

   DESIGN SOURCE
   · design-mothership/specimens/_fragments/t11.css → `.kw-chip`,
     `.kw-chip__x`, `.kw-chip--add`, read alongside t11-chips.html. This is
     the core reference: an active facet is a KIT-DRAWN CHIP — badge type,
     `--space-3` of inline-start padding and `--space-1` at the inline end,
     with an 18 circle on the `--hair` fill as its remove control. The pill's
     OWN height and fill were brought to `--control-height-button` /
     `--btn-secondary-fill` by client ruling 2026-09-02 — see `CHIP_ADD`'s own
     header — so this chapter's 26-tall raised pill is carried for the
     padding and the remove-control drawing only, not for the height or the
     fill. "Clear filters" reuses that same chip drawing. "+ Filter" NO
     LONGER DOES: under the second half of the same ruling it took
     `SelectTrigger`'s inline padding, type step and weight, and it is now
     the one control in this file drawn as a toolbar pill rather than as a
     chip. `CHIP_ADD`'s own header carries the four measures and the reason.
   · design-mothership/specimens/_fragments/t11-gaps.md → T11-4 records that
     the chip's end padding is unstated and that `--space-1` was the choice.
     Carried, not re-decided.
   · design-mothership/specimens/_fragments/t21.css + t21-empty.html +
     t21-gaps.md → the registers. A facet whose list came back with nothing is
     the kit's "no results" register: a line saying what happened, in the
     caption step on secondary ink. T21-2 is why the failure line is authored
     rather than quoted.
   · design-mothership/specimens/_fragments/t9.css → `.kw-search` for the
     facet's own search pill, and the chapter-9 field skin for the range
     fields.
   · components/select/select.tsx and dropdown-menu — an option row in this
     system is `rounded-pill px-3 py-[var(--space-2h)]` on `--accent`. Matched
     rather than re-drawn. `select.tsx` is also this file's source for two
     things it does not draw itself: `CHIP_ADD`'s toolbar measures and
     `CompactFacet`'s closed field, both of which take
     `selectTriggerVariants` rather than a copy of its numbers.
   · components/popover/popover.tsx — chapter 12's floating surface, which is
     what `CompactFacet` opens. This file draws no surface of its own.
   Everything left open is in GAPS-G.md (FLT-1 … FLT-7).

   THE LAW THIS FILE OBEYS
   · Chips and facet pills take `--radius-pill`. Marks take `--radius-select`
     (6). Nothing here takes a fifth radius. `CompactFacet`'s open panel is at
     `--radius` (24) and is not an exception to that: it is not a control, it
     is chapter 12's floating SURFACE, and the radius is `PopoverContent`'s
     own — this file does not name it.
   · A chip here is NEUTRAL — `--btn-secondary-fill`, the same paper
     `ViewSwitch` and `SortControl`'s field stand on, and `--btn-secondary-
     label` ink — so it may carry nothing coloured. Ruling 26 forbids an edge
     on a coloured pill; these are not coloured, and they still carry none.
   · Mango appears nowhere in this file. A selected facet is not a brand fill,
     and the neutral hover is `--accent`.
   · A REMOVABLE CHIP HAS TWO FOCUS TARGETS. When a chip is selectable the
     label is its own button and the remove control is a second one, side by
     side inside one pill, and both are in the tab order. Nesting the remove
     control inside a chip-wide button would make one of them unreachable,
     which is why the pill is a container and not a button.
   · Focus is the one global rule (tokens.css §8). Nothing here defines a ring
     and nothing sets `outline: none`.
   · Disabled is a fill and an ink; the read-only field loses its edge, per
     chapter 9. Neither is ever an opacity.
   · Every string is a prop with a default — "Clear filters", "Remove filter",
     "From", "To", "Search", the empty line and the failure line.

   MOBILE — THE STATED ANSWER, NOT "UNCHANGED"
   Below `sm` (40rem) the chip row does NOT wrap and does NOT go into a sheet.
   It becomes a single-row horizontal SCROLLER (`flex-nowrap overflow-x-auto`),
   and from `sm` up it wraps as a normal flex row. Reasoning, because this is a
   real decision and not a default: active filters are the reader's own recent
   actions and every one of them must stay both visible and removable. Wrapping
   four chips on a 360-wide phone pushes the content that is being filtered
   below the fold; a sheet hides the filters behind a control and needs an
   overlay this primitive does not own — and the moment they are hidden, people
   forget they are on and read a filtered list as an empty one. A scroller keeps
   every chip one swipe away, keeps both focus targets per chip reachable by
   keyboard, and costs no chrome. GAPS-G.md FLT-1.

   RENDERING CONTEXT
   `"use client"`. Three of the four components hold state and all four attach
   handlers; `CompactFacet` additionally renders Radix Popover, which is a
   client component in its own right.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../popover/popover";
import { selectTriggerVariants } from "../select/select";
import {
  CheckFat,
  CaretDown,
  CircleNotch,
  MagnifyingGlass,
  Warning,
  X,
} from "../../foundations/icons";

/* ============================================================================
   Shared pieces
   ========================================================================= */

/**
 * `.kw-chip` — the pill every active facet is drawn as. Exported because
 * `RangeFacet` and `SearchableFacet` wear the same skin and a collection may
 * need it too.
 */
const filterChipVariants = cva(
  [
    "inline-flex shrink-0 items-center gap-1",
    /* 40 tall — `--control-height-button`, the toolbar's standing control
       height. Client, 2026-09-02, verbatim: "all the components in toolbar
       (the sort, the filter, the view) i want them in the same pill aspect
       exactly. match filter and sort to the existing view selector
       component". This chip used to take the shorter `--control-height-pill`
       (26) — `.kw-chip`'s own drawn height, and correct for a chip sitting
       INSIDE a facet's results, but this bar draws it in the TOOLBAR row
       beside `SortControl` and `ViewSwitch`, and the client wants the row to
       read as one family of pills, not two heights. */
    "h-[var(--control-height-button)] rounded-pill whitespace-nowrap",
    "text-badge leading-none",
    // 4 at the inline end, holding the remove control off the edge (T11-4).
    "pe-1",
    "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      /** Mutually exclusive. Resolved once, in JS, at each call. */
      state: {
        /** THE SAME PAPER `ViewSwitch` STANDS ON, not the raised chip's own
            `--surface-raised`. `--btn-secondary-fill` is the token this
            toolbar's ground already re-resolves for every other pill in the
            row (`collection-frame.tsx`'s panel: "a control in the toolbar
            stands on soft paper, so its fill is the other tone — off-beige"),
            so taking it here instead of a second, unrelated token is what
            makes the two same-looking in every ground and every palette, not
            only the light one where `--surface-raised` and `--btn-secondary-
            fill` happen to agree. No hairline, matching `ViewSwitch`'s own
            "fill and no hairline" — `select.tsx`'s field border was never on
            this chip either, so nothing is removed here that this file drew;
            it is stated for the reader comparing the two. */
        default: "bg-[var(--btn-secondary-fill)] text-[var(--btn-secondary-label)]",
        /** A fill and an ink. Never an opacity, never a faded chip. */
        disabled: "cursor-not-allowed bg-hair-faint text-ink-disabled",
      },
    },
    defaultVariants: { state: "default" },
  },
);

/** The chip's label half. A button when the chip is selectable, else a span.
    NOT `[font:inherit]`: Tailwind emits that arbitrary property AFTER the
    named utilities in the bundle, so the shorthand was overriding the
    `leading-none` on this very string with the chip's inherited line-height
    (same value today only because the chip wrapper is itself `leading-none`).
    Preflight already gives a <button> `font: inherit`, a span inherits
    anyway; the named classes then own the step. */
const CHIP_LABEL =
  "inline-flex h-full items-center rounded-pill ps-3 pe-1 leading-none text-inherit";

const CHIP_LABEL_INTERACTIVE =
  "cursor-pointer appearance-none border-0 bg-transparent enabled:hover:bg-accent";

/* `.kw-chip--add` — the "+ filter" slot.

   FLT-C1. CH11 draws this chip in its "Filter chips — removable" block, at the
   end of the applied row, and the build had no slot for it at all: the only
   thing rendered after the chips was `Clear`, wearing a comment that named
   `.kw-chip--add` for a control that is not it.

   THE DASH IS GONE — CLIENT RULING, 2026-09-02, OVERRIDING ch26. This used to
   be "the one bordered control in the system": a dashed `1px dashed
   var(--hair-strong)` outline at the shorter `--control-height-pill`, on the
   ch26 reading that a dash signals "not yet set" for an empty filter slot.
   The client's own words this round: "all the components in toolbar (the
   sort, the filter, the view) i want them in the same pill aspect exactly.
   match filter and sort to the existing view selector component (i am happy
   with how that is)" — verbatim, and explicit that Filter is to match View
   "full stop", dashed idle affordance included. CH11 itself never drew this
   chip with an edge in any of its 88 declarations (recorded honestly above,
   before this ruling, for the reader checking); ch26 is the only source for
   the dash, and this ruling is the client overriding it. What stands now is
   `ViewSwitch`'s own drawing: `--control-height-button` (40) tall,
   `--btn-secondary-fill` solid, no hairline, `--btn-secondary-hover` on
   hover, `--btn-secondary-label` ink — the same pill `SortControl`'s field
   wears.

   AND THE FOUR THAT WERE MISSED — SAME RULING, SETTLED 2026-09-02 ON
   STAGING. The client's words the second time, verbatim: "the filter
   button-pill it's still differnet than the other 2. fix and uniform it".
   The pass above moved four properties (height, fill, label ink, hover) and
   stopped; the reader in front of the toolbar could still tell the three
   pills apart. Measured off this file and `select.tsx`, what was left:

       inline padding   12 (`px-3`)            →  18 (`--space-4h`)
       type step        12 (`--text-badge`)    →  14 (`--text-sm`)
       leading          1  (`leading-none`)    →  1.45 (`--text-sm`'s own)
       weight           inherited (300 / 400)  →  500 (`--font-weight-medium`)

   The first two and the leading are `selectTriggerVariants`' own base line —
   `px-[var(--space-4h)]`, `text-sm` — which is what `SortControl`'s field and
   `ViewSwitch` are both drawn through; the weight is the one property
   `ViewSwitch` overrides that trigger with, and it is taken from there for
   the same reason the height was.

   `leading-none` IS REMOVED RATHER THAN RESTATED AS 1.45. `text-sm` already
   carries `--text-sm--line-height`, and the `leading-none` sitting on top of
   it was the whole reason this pill's string was set solid where the other
   two were not. Naming the leading again would be a second copy of a number
   the type step already owns.

   THIS IS NOW THE ONE PILL IN THIS FILE THAT IS NOT BADGE TYPE, and that is
   a decision, not an oversight left behind. `filterChipVariants` — a
   removable facet chip, and the "Clear filters" control that shares its
   drawing — STAYS at `--text-badge` with `px-3`: those are CH11's `.kw-chip`,
   drawn at badge type in the fragment cited at the top of this file, and the
   ruling names "the filter button-pill" against "the other 2", which is this
   slot against `SortControl` and `ViewSwitch`. A chip is not one of the
   other 2, and re-deciding CH11 would need its own ruling. The consequence,
   stated rather than hidden: a bar drawn with chips AND this slot puts a
   14/500 pill beside 12/inherited ones. Logged on the register
   (manifest.json → notDelivered, "A chip row that mixes the toolbar pill's
   type step with CH11's").

   Symmetrical padding, because unlike a removable chip there is no control to
   hold off the inline end. The ink no longer drops a tier on its own — it is
   the same `--btn-secondary-label` as the rest of the family, which is what
   "the same pill aspect exactly" asks for; the slot still reads as "not yet
   set" because it is the only pill in the row with no remove control and no
   facet name, not because of a fainter ink. */
const CHIP_ADD = [
  "inline-flex h-[var(--control-height-button)] shrink-0 items-center gap-1",
  "cursor-pointer appearance-none rounded-pill whitespace-nowrap px-[var(--space-4h)]",
  "text-sm font-[var(--font-weight-medium)]",
  "shadow-none bg-[var(--btn-secondary-fill)] text-[var(--btn-secondary-label)]",
  "enabled:hover:bg-[var(--btn-secondary-hover)]",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  "disabled:cursor-not-allowed disabled:bg-hair-faint disabled:text-ink-disabled",
];

/** `.kw-chip__x` — an 18 circle on the hairline fill. The second focus target. */
const CHIP_REMOVE = [
  "grid size-[1.125rem] shrink-0 place-content-center",
  "cursor-pointer appearance-none rounded-pill border-0",
  "bg-[var(--hair)] text-inherit",
  "enabled:hover:bg-hair-strong",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
];

/** The chapter-9 field skin, at the dense height a facet uses. */
const facetFieldVariants = cva(
  [
    "min-w-0 appearance-none",
    "h-[var(--control-height-dense)] px-3 rounded-pill",
    "text-sm font-[var(--font-weight-light)] tabular-nums",
    "placeholder:text-muted-foreground",
    "transition-[box-shadow,background-color]",
    "duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      state: {
        /* A field, so ch02's hairline carve-out applies — as an inset shadow,
           never a `border` (review 1A · fix 2). Focus adds nothing of its own:
           the global ring is the whole treatment (fix 4).

           OVERRIDE 42 — the resting edge is `--hair-strong` and there is no
           hover. CH16 draws the facet field the way CH09 draws every field:
           `var(--hair2)` at rest, `var(--hair)` disabled. The build had them
           swapped and promoted 8% to 20% on hover, so a resting facet and a
           disabled one carried the same stroke. The hover came from
           kwapso-ui.css; it is gone and nothing replaces it. */
        default: "shadow-[var(--hairline-strong)] bg-background text-foreground",
        /** Chapter 9's error hairline: poppy at 65%, so dark re-resolves for free. */
        error: ["shadow-[var(--hairline-error)]", "bg-background text-foreground"],
        /** A system-set value loses its edge entirely, and its tab stop. */
        readOnly: "shadow-none bg-hair-faint text-foreground",
        /* A fill, an ink, and the WEAK 8% edge against the resting facet's
           20% — which is what tells the two apart (override 42). */
        disabled: "cursor-not-allowed shadow-[var(--hairline)] bg-hair-faint text-ink-disabled",
      },
    },
    defaultVariants: { state: "default" },
  },
);

/** The three registers a facet spends most of its life in. One drawing. */
function FacetRegister({
  icon,
  children,
  slot,
  busy,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  slot: string;
  busy?: boolean;
}) {
  return (
    <div
      data-slot={slot}
      role="status"
      aria-live="polite"
      aria-busy={busy || undefined}
      /* Left-aligned -- 27.21, DEF-2. */
      className="grid justify-items-start gap-2 px-4 py-[var(--space-6)] text-start"
    >
      {icon}
      <span className="text-caption text-ink-secondary">{children}</span>
    </div>
  );
}

/**
 * A facet's own heading. Caption step, secondary ink — the register's tier.
 *
 * EXPORTED SINCE 2026-09-02, and the export is the point rather than a
 * convenience. It was private, so a consuming app that had to compose a facet
 * this file did not ship wrote `className="text-caption text-ink-secondary"`
 * out by hand beside the ones that do — two classes, in a second place, free
 * to drift the day either tier moves. `CompactFacet` closes most of the
 * reason that composition existed; the export closes the rest.
 *
 * `id` is optional: it is only needed when something is pointing at this
 * heading with `aria-labelledby`, which is how all three facets here use it.
 */
function FacetLabel({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span id={id} className={cn("text-caption text-ink-secondary", className)}>
      {children}
    </span>
  );
}

/* One option row, shared by `SearchableFacet`'s always-open list and
   `CompactFacet`'s panel. ONE DRAWING, so the two lists cannot diverge — the
   compact facet is the same list behind a trigger, and a second copy of these
   five lines would have been the first place that stopped being true.

   The system's option row: pill, 12 inline, 10 block, on `--accent`.
   `select.tsx`'s `selectItemClasses` is the same recipe for a Radix menu row,
   and is deliberately NOT reused here: it hovers off `data-[highlighted]`,
   which Radix writes and a plain `<button>` never carries, so importing it
   would have given these rows no hover at all.

   NOT `[font:inherit]`: Tailwind emits that arbitrary property AFTER the
   named utilities in the bundle, so the shorthand was silently overriding the
   `text-sm` below — the option row measured 15px (the surrounding type) in
   the live demo. Preflight already gives a <button> `font: inherit`;
   `text-sm` then owns the step. */
const FACET_OPTION_ROW = [
  "flex w-full cursor-pointer appearance-none items-center gap-[var(--space-2h)]",
  "rounded-pill border-0 bg-transparent px-3 py-[var(--space-2h)]",
  "text-start text-sm text-foreground",
  "enabled:hover:bg-accent",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
];

/** `.kw-search` at the dense height: the raised, borderless pill.
 *
 *  Shared by `SearchableFacet`, which always draws one, and `CompactFacet`,
 *  which draws one only when it is `searchable`. The two `data-slot` names are
 *  passed in rather than fixed here, so every selector that already addressed
 *  `searchable-facet-search` / `searchable-facet-query` still does. */
function FacetSearch({
  slot,
  querySlot,
  value,
  onValueChange,
  label,
  state,
  disabled = false,
  readOnly = false,
}: {
  slot: string;
  querySlot: string;
  value: string;
  onValueChange: (next: string) => void;
  label: string;
  state: "default" | "readOnly" | "disabled";
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div
      data-slot={slot}
      data-focus-shell=""
      className={cn(
        "flex min-w-0 items-center gap-[var(--space-2h)]",
        "h-[var(--control-height-dense)] rounded-pill px-3",
        state === "default"
          ? "bg-[var(--surface-raised)] text-foreground shadow-sm"
          : "bg-hair-faint shadow-none",
        state === "disabled" && "text-ink-disabled",
      )}
    >
      <MagnifyingGlass size={16} aria-hidden="true" className="text-ink-tertiary" />
      <input
        type="search"
        data-slot={querySlot}
        /* The bare node inside the pill shell: the ring belongs to the
           shell, which is the shape the reader sees (review 1A · fix 4). */
        data-focus-proxy=""
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        data-readonly={readOnly ? "true" : undefined}
        tabIndex={readOnly ? -1 : undefined}
        aria-label={label}
        placeholder={label}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        className={cn(
          "h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0",
          "text-sm font-[var(--font-weight-light)] text-inherit",
          "placeholder:text-muted-foreground",
          "[&::-webkit-search-cancel-button]:appearance-none",
          "[&::-webkit-search-decoration]:appearance-none",
          disabled && "cursor-not-allowed",
        )}
      />
    </div>
  );
}

/* ============================================================================
   FilterBar
   ========================================================================= */

/** One active facet, as the bar draws it. */
export interface FilterChip {
  /** Stable identity, passed back to `onRemove`. */
  id: string;
  /** What the chip says. The kit's own chips read "Field · Value". */
  label: React.ReactNode;
  /**
   * This chip's remove label, when the generic one will not do. Translatable
   * per chip, because "Remove filter: Owner" is a sentence in some languages
   * and a compound in others.
   */
  removeLabel?: string;
  /** A fill and an ink; the remove control goes with it. */
  disabled?: boolean;
  /**
   * Re-open the facet this chip stands for. When given, the chip's LABEL
   * becomes a button — the first of the chip's two focus targets. When absent
   * the label is inert text and the remove control is the only target, which
   * is stated rather than pretended otherwise.
   */
  onSelect?: () => void;
}

export interface FilterBarProps extends React.ComponentPropsWithoutRef<"div"> {
  /** The active facets, in the order the reader applied them. */
  filters?: FilterChip[];
  /** Called with a chip's `id` when its remove control is used. */
  onRemove?: (id: string) => void;
  /**
   * Called when every facet is dropped at once. The clear control appears only
   * when this is given AND something is active — a control that does nothing
   * is worse than no control.
   */
  onClear?: () => void;
  /** The clear control's label. Visible AND announced. Translatable. */
  clearLabel?: string;
  /**
   * Open the facet picker. ADDITIVE, and optional: the "+ filter" slot is
   * drawn only when this is given, so no existing call site changes. CH11
   * draws this chip at the end of the applied row and the bar had no slot for
   * it (FLT-C1).
   */
  onAddFilter?: () => void;
  /** The add slot's label. Visible AND announced. Translatable; the kit's
   *  English is the artifact's own "+ filter". */
  addFilterLabel?: string;
  /**
   * A count riding beside `addFilterLabel`, inside the same slot — an
   * additive node, never a replacement for the label. ADDED because a
   * consuming app's own count (an active-facet total) had nowhere to go but
   * folded into `addFilterLabel`'s plain string, which cannot carry `Badge`'s
   * mango counter geometry (`size="counter"`: `h-5 min-w-5 px-2`,
   * `rounded-pill`) — the same shape `TabsCount`'s active state and
   * `CollectionFrame`'s own heading count already wear, ruled the one count
   * shape in the system (GAPS-RULINGS.md R-4a, reversed 2026-09-03). Nothing
   * here draws that shape itself: a caller hands it a real `<Badge count={n}
   * variant="default" />` (or nothing) and this file only places it. Optional
   * and additive — omitted, the slot is byte-identical to before. */
  addFilterBadge?: React.ReactNode;
  /** The generic remove label, combined with each chip's own text. */
  removeLabel?: string;
  /**
   * Replace the whole remove-label formatter — the escape hatch for a language
   * the "label: value" join does not fit.
   */
  formatRemoveLabel?: (chipLabel: string, removeLabel: string) => string;
  /** The bar's accessible name. Translatable. */
  label?: string;
  /**
   * Busy. The chips are not drawn: a set of active facets that has not
   * arrived is not an empty set, and drawing "no filters" while they load
   * would tell the reader something false about the list below.
   */
  loading?: boolean;
  /** Facet controls — `RangeFacet`, `SearchableFacet`, a `Select`, anything. */
  children?: React.ReactNode;
}

/**
 * The row of active facets, above whatever they are narrowing.
 *
 * TEN STATES
 *  1. default        — the facet controls, then the chips, then clear.
 *  2. hover          — `--accent` on a selectable chip's label and on the clear
 *                      control; `--hair-strong` on a remove control. All three
 *                      are named tokens; none is an opacity, none is mango.
 *  3. focus-visible  — NOT here. tokens.css §8 rings each chip's label and each
 *                      remove control separately, at the pill radius. Both are
 *                      in the tab order — that is the point of splitting them.
 *  4. active/pressed — does not apply. The kit draws no pressed chip, and a
 *                      chip's press outcome is immediate (it disappears), so a
 *                      pressed skin would flash for one frame and go.
 *  5. disabled       — per chip: `--hair-faint` fill, `--ink-disabled` ink,
 *                      remove control natively disabled. A fill and an ink.
 *  6. loading        — no chips drawn, `aria-busy` on the bar. The facet
 *                      controls stay: they are how the reader gets out.
 *  7. empty          — no chips, no children: renders NOTHING. An empty bar is
 *                      a strip of nothing above a list, and the kit's rule is
 *                      to prefer nothing. With children but no chips, the
 *                      controls are drawn and no chip row is.
 *  8. error          — does not apply to the bar. A facet that failed to load
 *                      its options reports it inside that facet, where the
 *                      reader can retry; the bar has nothing of its own to
 *                      fetch. GAPS-G.md FLT-5.
 *  9. selected       — every chip drawn IS a selection. That is what the bar
 *                      shows: the facets currently on.
 * 10. read-only      — expressed per chip as `disabled`. A facet the reader may
 *                      see but not drop is a chip with no remove control, which
 *                      is what `disabled` draws.
 *
 * THREE BREAKPOINTS
 *  mobile  — the chip row is a one-line horizontal scroller. See the header:
 *            this is a decision, and the reasoning is written down there.
 *  tablet  — from `sm` (40rem) the chip row wraps.
 *  desktop — as tablet. The bar never becomes a sidebar on its own; a
 *            composition that wants a facet rail builds one and puts these
 *            facets in it.
 *
 * RTL — safe. Chips run in DOM order in a flex row, the remove control sits at
 * the INLINE end via `pe-*` and DOM order, and the scroller scrolls the
 * inline axis, which the browser already mirrors.
 */
const FilterBar = React.forwardRef<HTMLDivElement, FilterBarProps>(
  (
    {
      className,
      filters = [],
      onRemove,
      onClear,
      clearLabel = "Clear filters",
      onAddFilter,
      addFilterLabel = "+ filter",
      addFilterBadge,
      removeLabel = "Remove filter",
      formatRemoveLabel,
      label = "Filters",
      loading = false,
      children,
      ...props
    },
    ref,
  ) => {
    const chips = loading ? [] : filters;
    const hasChips = chips.length > 0;
    /* The add slot is drawn while the facets load — it is the one control in
       the row that does not depend on what came back — but the row itself is
       only worth drawing if something will be in it. */
    const showAdd = Boolean(onAddFilter);
    const hasRow = hasChips || showAdd;

    // Prefer nothing: an empty bar is a strip of nothing.
    if (!hasRow && !children && !loading) return null;

    const joinRemoveLabel = (chip: FilterChip): string => {
      if (chip.removeLabel) return chip.removeLabel;
      const asText = typeof chip.label === "string" ? chip.label : "";
      if (formatRemoveLabel) return formatRemoveLabel(asText, removeLabel);
      return asText ? `${removeLabel}: ${asText}` : removeLabel;
    };

    return (
      <div
        ref={ref}
        data-slot="filter-bar"
        role="group"
        aria-label={label}
        aria-busy={loading || undefined}
        className={cn("flex w-full flex-col gap-3", className)}
        {...props}
      >
        {children ? (
          <div data-slot="filter-bar-facets" className="flex flex-wrap items-start gap-4">
            {children}
          </div>
        ) : null}

        {hasRow ? (
          <div
            data-slot="filter-bar-chips"
            className={cn(
              "flex items-center gap-2",
              // MOBILE: one line, scrolled. From `sm` up: wrapped. See header.
              "flex-nowrap overflow-x-auto",
              "sm:flex-wrap sm:overflow-x-visible",
            )}
          >
            {chips.map((chip) => {
              const state = chip.disabled ? "disabled" : "default";
              const selectable = Boolean(chip.onSelect) && !chip.disabled;

              return (
                <span
                  key={chip.id}
                  data-slot="filter-chip"
                  data-state={state}
                  className={filterChipVariants({ state })}
                >
                  {selectable ? (
                    <button
                      type="button"
                      data-slot="filter-chip-label"
                      onClick={chip.onSelect}
                      className={cn(CHIP_LABEL, CHIP_LABEL_INTERACTIVE)}
                    >
                      {chip.label}
                    </button>
                  ) : (
                    <span data-slot="filter-chip-label" className={CHIP_LABEL}>
                      {chip.label}
                    </span>
                  )}

                  {onRemove ? (
                    <button
                      type="button"
                      data-slot="filter-chip-remove"
                      disabled={chip.disabled}
                      onClick={() => onRemove(chip.id)}
                      aria-label={joinRemoveLabel(chip)}
                      className={cn(CHIP_REMOVE, chip.disabled && "cursor-not-allowed")}
                    >
                      {/* The kit draws a × glyph at badge size; the delivered
                          set's X at 12 is the same mark in the same box.
                          GAPS-G.md FLT-3. */}
                      <X size={12} aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              );
            })}

            {/* The "+ filter" slot. Last of the chips and BEFORE `Clear`,
                which is where CH11 draws it: the row reads as the facets that
                are on, then the empty slot, then the way out. FLT-C1. */}
            {showAdd ? (
              <button
                type="button"
                data-slot="filter-bar-add"
                onClick={onAddFilter}
                className={cn(CHIP_ADD)}
              >
                {addFilterLabel}
                {/* ADDITIVE — see `addFilterBadge`'s own doc. `CHIP_ADD`
                    already carries `gap-1` between its children, the same
                    space a tab keeps before `TabsCount`, so this needs no
                    margin of its own. Omitted, this button is byte-identical
                    to before. */}
                {addFilterBadge}
              </button>
            ) : null}

            {onClear && hasChips ? (
              <button
                type="button"
                data-slot="filter-bar-clear"
                onClick={onClear}
                className={cn(
                  // The same chip, ink dropped one tier, and symmetrical
                  // padding because there is no control to hold off the inline
                  // end. NOT `.kw-chip--add` — that name belongs to the slot
                  // above, and this comment used to claim it (FLT-C1).
                  filterChipVariants({ state: "default" }),
                  "cursor-pointer appearance-none border-0 px-3 text-ink-tertiary",
                  "hover:text-foreground",
                )}
              >
                {clearLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);

FilterBar.displayName = "FilterBar";

/* ============================================================================
   RangeFacet
   ========================================================================= */

/** Either end may be open — `null` means "no bound", not zero. */
export interface RangeFacetValue {
  min: number | null;
  max: number | null;
}

export interface RangeFacetProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /** The facet's visible heading. Translatable. */
  label?: string;
  /** The lower field's accessible name. Translatable. */
  minLabel?: string;
  /** The upper field's accessible name. Translatable. */
  maxLabel?: string;
  /** Hard bounds passed to both fields, if the data has any. */
  min?: number;
  max?: number;
  step?: number;
  /** Controlled value. */
  value?: RangeFacetValue;
  /** Uncontrolled starting value. Both ends open by default. */
  defaultValue?: RangeFacetValue;
  onValueChange?: (value: RangeFacetValue) => void;
  /**
   * What sits between the two fields. A prop, because it is on screen: an en
   * dash reads as a range in English and is wrong in scripts that do not use
   * one.
   */
  separator?: React.ReactNode;
  /** A unit shown after the upper field — "kg", "days". Translatable. */
  unit?: React.ReactNode;
  /**
   * Busy. Both fields go read-only and announce, per the field law: typing
   * into a field whose value has not arrived throws away what you typed.
   */
  loading?: boolean;
  /** The range is not valid — a min above a max, or a server's answer. */
  error?: boolean;
  /** What is wrong, in words. Announced with the fields. Translatable. */
  errorLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

/** "" is an open bound; anything unparseable is left as an open bound too. */
function toBound(raw: string): number | null {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A two-ended numeric facet.
 *
 * TEN STATES
 *  1. default        — heading, two dense pill fields, the separator between.
 *  2. hover          — does not apply to a FIELD or a facet mark. CH09 and
 *                      CH16 draw them at rest, at focus and disabled and no
 *                      hover for any of them; the hover this file carried came
 *                      from kwapso-ui.css, and the 20% it promoted to is now
 *                      the resting edge (override 42). Chips and option rows
 *                      still hover — they are rows, not field edges.
 *  3. focus-visible  — NOT here. tokens.css §8 draws the one ring, and the
 *                      field's own hairline does not move under it.
 *  4. active/pressed — does not apply. A field is not pressed; its equivalent
 *                      moment is focus.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` ink, and the WEAK
 *                      8% edge against the resting facet's 20% (override 42).
 *                      A fill and an ink, never an opacity.
 *  6. loading        — the read-only skin plus `aria-busy`, per `input`.
 *  7. empty          — both bounds `null`: the fields show their placeholders
 *                      and the facet is simply not narrowing anything. That is
 *                      a resting state, not a hole to fill with a message.
 *  8. error          — the poppy hairline at 65% on both fields, `aria-invalid`,
 *                      and `errorLabel` in the caption step wired up as the
 *                      fields' description so it is announced and not just seen.
 *  9. selected       — a bound that is set IS the selection, and it is shown as
 *                      the value in the field. The bar draws the chip for it.
 * 10. read-only      — `readOnly`: the edge goes entirely, the faint fill
 *                      carries the state, per chapter 9.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The two fields are `w-[6rem]` and sit
 *  in a flex row that wraps if the column is narrower than the pair. They are
 *  already at the dense height at every width, and a range that restacked would
 *  stop reading as one control.
 *
 * RTL — safe. The two fields run in DOM order, so "from" sits at the inline
 * start in every script; every inset is logical and no side is named.
 */
const RangeFacet = React.forwardRef<HTMLDivElement, RangeFacetProps>(
  (
    {
      className,
      label = "Range",
      minLabel = "From",
      maxLabel = "To",
      min,
      max,
      step,
      value,
      defaultValue,
      onValueChange,
      separator = "–",
      unit,
      loading = false,
      error = false,
      errorLabel,
      disabled = false,
      readOnly = false,
      ...props
    },
    ref,
  ) => {
    const reactId = React.useId();
    const labelId = `${reactId}-label`;
    const errorId = `${reactId}-error`;

    const [uncontrolled, setUncontrolled] = React.useState<RangeFacetValue>(
      () => defaultValue ?? { min: null, max: null },
    );
    const controlled = value !== undefined;
    const current = controlled ? value : uncontrolled;

    const state = disabled
      ? "disabled"
      : readOnly || loading
        ? "readOnly"
        : error
          ? "error"
          : "default";

    const commit = (next: RangeFacetValue) => {
      if (!controlled) setUncontrolled(next);
      onValueChange?.(next);
    };

    const fieldProps = {
      type: "number" as const,
      inputMode: "numeric" as const,
      min,
      max,
      step,
      disabled,
      readOnly: readOnly || loading,
      /* Review 1A · fix 5, with the filter bar as the named example: a
         read-only component "takes no focus outline and cannot be tabbed to.
         Being greyed is the whole affordance." */
      "data-readonly": readOnly || loading ? "true" : undefined,
      tabIndex: readOnly || loading ? -1 : undefined,
      "aria-busy": loading || undefined,
      "aria-invalid": error || undefined,
      "aria-describedby": error && errorLabel ? errorId : undefined,
      className: cn(facetFieldVariants({ state }), "w-[6rem]"),
    };

    return (
      <div
        ref={ref}
        data-slot="range-facet"
        data-state={state}
        role="group"
        aria-labelledby={labelId}
        className={cn("flex min-w-0 flex-col gap-2", className)}
        {...props}
      >
        <FacetLabel id={labelId}>{label}</FacetLabel>

        <div className="flex flex-wrap items-center gap-2">
          <input
            {...fieldProps}
            data-slot="range-facet-min"
            aria-label={minLabel}
            placeholder={minLabel}
            value={current.min === null ? "" : String(current.min)}
            onChange={(event) => commit({ ...current, min: toBound(event.currentTarget.value) })}
          />
          <span aria-hidden="true" className="text-caption text-ink-tertiary">
            {separator}
          </span>
          <input
            {...fieldProps}
            data-slot="range-facet-max"
            aria-label={maxLabel}
            placeholder={maxLabel}
            value={current.max === null ? "" : String(current.max)}
            onChange={(event) => commit({ ...current, max: toBound(event.currentTarget.value) })}
          />
          {unit !== undefined && unit !== null ? (
            <span className="text-caption text-ink-tertiary">{unit}</span>
          ) : null}
        </div>

        {/* A poppy WORD, so it takes the ink token, not the fill (override 43).
            The facet's error hairline above keeps `--destructive` — that is a
            boundary, and only the ink moved. */}
        {error && errorLabel ? (
          <span id={errorId} className="text-caption text-destructive-ink">
            {errorLabel}
          </span>
        ) : null}
      </div>
    );
  },
);

RangeFacet.displayName = "RangeFacet";

/* ============================================================================
   SearchableFacet
   ========================================================================= */

export interface FacetOption {
  /** Stable identity, and what comes back in the value array. */
  value: string;
  /** What the row says. */
  label: React.ReactNode;
  /** How many records carry it. Tabular, quiet, and never invented as "0". */
  count?: number;
  disabled?: boolean;
}

export interface SearchableFacetProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /** The facet's visible heading. Translatable. */
  label?: string;
  /** Everything that can be picked. */
  options?: FacetOption[];
  /** Controlled selection. */
  value?: string[];
  /** Uncontrolled starting selection. */
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Controlled query, for a facet whose options are fetched per keystroke. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** The search field's accessible name AND its placeholder. Translatable. */
  searchLabel?: string;
  /** Shown when nothing matches. The kit's "no results" register. Translatable. */
  emptyLabel?: string;
  /** Busy. Translatable label announced with the spinner. */
  loading?: boolean;
  loadingLabel?: string;
  /** The options could not be fetched. */
  error?: boolean;
  errorLabel?: string;
  /**
   * Filter locally. Default: a case-insensitive substring match on a string
   * label. Pass your own for a locale-aware or server-side match — and pass
   * `() => true` when the options are already filtered upstream.
   */
  filterOption?: (option: FacetOption, query: string) => boolean;
  /** How tall the list may get before it scrolls. A CSS length. */
  maxHeight?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

function defaultFilterOption(option: FacetOption, query: string): boolean {
  if (query.trim() === "") return true;
  const text = typeof option.label === "string" ? option.label : option.value;
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * A searchable, multi-select facet.
 *
 * TEN STATES
 *  1. default        — heading, the raised search pill, the option list.
 *  2. hover          — `--accent` on an option row; the neutral wash, never
 *                      mango. The search pill has no hover: chapter 9's one
 *                      borderless field has no edge to move.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the search field and each
 *                      option row at their own radii.
 *  4. active/pressed — does not apply. Pressing a row toggles it, and the
 *                      selected mark IS the response.
 *  5. disabled       — whole facet: faint fill on the field, `--ink-disabled`
 *                      ink, every row natively disabled. Per option:
 *                      `option.disabled` does the same to one row.
 *  6. loading        — the spinner register in place of the list, announced
 *                      politely. The search field stays usable: the query is
 *                      the reader's own text and no server is filling it in
 *                      (the same reasoning `search-input` records).
 *  7. empty          — two different empties, drawn differently on purpose:
 *                      no options at all is the same register as no matches,
 *                      because to the reader they are the same event —
 *                      "there is nothing here to pick".
 *  8. error          — `Warning` over `errorLabel`, in place of the list.
 *  9. selected       — a filled mark at `--radius-select` on
 *                      `--surface-inverse`, `aria-selected` on the row.
 * 10. read-only      — `readOnly`: rows announce their state and refuse the
 *                      toggle; the field loses its edge, per chapter 9.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in shape; the facet is `w-full` and
 *  takes its width from whatever holds it. The one thing that does move is the
 *  list's height, which is `maxHeight` and defaults to 14rem — about six rows,
 *  which fits above the keyboard on a phone and does not dominate a rail on a
 *  desktop. A facet that restacked itself would fight the bar it sits in.
 *
 * RTL — safe. The mark leads and the count trails by DOM order inside a flex
 * row, so both swap; every inset is logical.
 */
const SearchableFacet = React.forwardRef<HTMLDivElement, SearchableFacetProps>(
  (
    {
      className,
      label = "Filter",
      options = [],
      value,
      defaultValue,
      onValueChange,
      query,
      defaultQuery = "",
      onQueryChange,
      searchLabel = "Search",
      emptyLabel = "Nothing matches",
      loading = false,
      loadingLabel = "Loading…",
      error = false,
      errorLabel = "These options could not be loaded",
      filterOption = defaultFilterOption,
      maxHeight = "14rem",
      disabled = false,
      readOnly = false,
      ...props
    },
    ref,
  ) => {
    const reactId = React.useId();
    const labelId = `${reactId}-label`;

    const [uncontrolledValue, setUncontrolledValue] = React.useState<string[]>(
      () => defaultValue ?? [],
    );
    const valueControlled = value !== undefined;
    const selected = valueControlled ? value : uncontrolledValue;

    const [uncontrolledQuery, setUncontrolledQuery] = React.useState(defaultQuery);
    const queryControlled = query !== undefined;
    const currentQuery = queryControlled ? query : uncontrolledQuery;

    const state = disabled ? "disabled" : readOnly ? "readOnly" : "default";

    const visible = React.useMemo(
      () => options.filter((option) => filterOption(option, currentQuery)),
      [options, filterOption, currentQuery],
    );

    const toggle = (option: FacetOption) => {
      if (disabled || readOnly || option.disabled) return;
      const next = selected.includes(option.value)
        ? selected.filter((entry) => entry !== option.value)
        : [...selected, option.value];
      if (!valueControlled) setUncontrolledValue(next);
      onValueChange?.(next);
    };

    const handleQuery = (next: string) => {
      if (!queryControlled) setUncontrolledQuery(next);
      onQueryChange?.(next);
    };

    return (
      <div
        ref={ref}
        data-slot="searchable-facet"
        data-state={state}
        role="group"
        aria-labelledby={labelId}
        aria-busy={loading || undefined}
        className={cn("flex w-full min-w-0 flex-col gap-2", className)}
        {...props}
      >
        <FacetLabel id={labelId}>{label}</FacetLabel>

        {/* `.kw-search` at the dense height. One drawing, shared with
            `CompactFacet` — see `FacetSearch`. */}
        <FacetSearch
          slot="searchable-facet-search"
          querySlot="searchable-facet-query"
          value={currentQuery}
          onValueChange={handleQuery}
          label={searchLabel}
          state={state}
          disabled={disabled}
          readOnly={readOnly}
        />

        {error ? (
          <FacetRegister
            slot="searchable-facet-error"
            icon={<Warning size={20} aria-hidden="true" className="text-ink-tertiary" />}
          >
            {errorLabel}
          </FacetRegister>
        ) : loading ? (
          <FacetRegister
            slot="searchable-facet-loading"
            busy
            icon={
              <CircleNotch size={20} aria-hidden="true" className="motion-spinner text-ink-tertiary" />
            }
          >
            {loadingLabel}
          </FacetRegister>
        ) : visible.length === 0 ? (
          <FacetRegister
            slot="searchable-facet-empty"
            icon={<MagnifyingGlass size={20} aria-hidden="true" className="text-ink-tertiary" />}
          >
            {emptyLabel}
          </FacetRegister>
        ) : (
          <div
            data-slot="searchable-facet-list"
            role="listbox"
            aria-multiselectable="true"
            aria-labelledby={labelId}
            style={{ maxHeight }}
            className="flex flex-col gap-1 overflow-y-auto"
          >
            {visible.map((option) => {
              const isSelected = selected.includes(option.value);
              const rowDisabled = disabled || option.disabled;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  data-slot="searchable-facet-option"
                  aria-selected={isSelected}
                  aria-disabled={rowDisabled || readOnly || undefined}
                  disabled={rowDisabled}
                  onClick={() => toggle(option)}
                  className={cn(
                    // The system's option row. One drawing, shared with
                    // `CompactFacet` — see `FACET_OPTION_ROW`.
                    FACET_OPTION_ROW,
                    rowDisabled && "cursor-not-allowed text-ink-disabled",
                    readOnly && !rowDisabled && "cursor-default",
                  )}
                >
                  {/* The mark. Ruling 03: selection controls take
                      `--radius-select` (6), and nothing else here does. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-4 shrink-0 place-content-center rounded-select",
                      /* A selection control, so ch02's hairline carve-out
                         applies — as an inset shadow, never a `border`
                         (review 1A · fix 2). On, the fill is the edge.

                         OVERRIDE 42 — CH16 draws the facet checkbox as
                         `inset 0 0 0 1px var(--hair2)`, the same 20% CH10
                         gives an unchecked box. It was built at 8%, which is
                         the disabled strength. */
                      isSelected
                        ? "bg-surface-inverse text-ink-on-inverse"
                        : "shadow-[var(--hairline-strong)] bg-background",
                    )}
                  >
                    {isSelected ? <CheckFat size={12} /> : null}
                  </span>

                  <span className="min-w-0 flex-1 truncate">{option.label}</span>

                  {/* A count that is zero is not drawn — the kit never shows a
                      "0" on a chip or a counter. */}
                  {option.count !== undefined && option.count > 0 ? (
                    <span className="shrink-0 text-badge tabular-nums text-ink-tertiary">
                      {option.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);

SearchableFacet.displayName = "SearchableFacet";

/* ============================================================================
   CompactFacet

   FLT-C2 · ADDED 2026-09-02, AND THE GAP IT CLOSES COST A FEATURE.

   This file shipped two facets and neither of them is short. `SearchableFacet`
   is ALWAYS EXPANDED — heading, search pill, and every option as its own
   checkbox row — and `RangeFacet` is two numeric fields. A toolbar or a filter
   panel that wants ONE SHORT FIELD reading "Any client" had nothing to reach
   for, so the consuming app composed one out of the kit's `Select`: a
   `SelectTrigger` over `SelectItem`s, with `FacetLabel`'s two classes written
   out again beside it because `FacetLabel` was private to this file.

   WHAT THAT COST, MEASURED. A `Select` scrolls and takes type-ahead; it does
   not SEARCH. The app's Waves screen filters 131 clients, and the moment the
   facet became a compact select those 131 became a plain scroll — the one
   thing `SearchableFacet`'s search pill existed to prevent. Neither of this
   file's two facets could be both short and searchable, so the app had to
   pick one, and picking "short" is what dropped the search.

   So the compact facet IS optionally searchable, and that is the whole design:
   a trigger the size of `SortControl`'s field, over the same filtered list
   `SearchableFacet` already draws. `searchable` defaults to FALSE — a facet
   over eight words does not need a search field, and drawing one there would
   be a control that never earns its keystroke.

   WHAT IT REUSES RATHER THAN REDRAWS, and why each:
   · `selectTriggerVariants` (select.tsx) for the closed field. Not "the same
     measurements as" — literally the same recipe the sort and view pills are
     drawn through, so a compact facet standing beside them cannot drift from
     them the way `CHIP_ADD` did.
   · `FACET_OPTION_ROW` and `FacetSearch`, both shared with `SearchableFacet`
     in this file. The compact facet is that facet's list behind a trigger; it
     is not a second list.
   · `FacetRegister` for busy / empty / failed, so the three registers read the
     same inside the panel as they do in the open facet.
   · `PopoverContent` for the panel — the kit's one floating surface (ch12:
     "Overlay shadow, 24px radius, no blur"), at the TRIGGER'S width instead of
     chapter 12's fixed 300, because a facet panel wider or narrower than the
     field it drops out of reads as a different control. That is the same rule
     `SelectContent` states as `min-w-[var(--radix-select-trigger-width)]`.

   ONE VALUE, NOT A SET, AND THAT IS THE DECISION.
   `SearchableFacet` is multi-select and stays that way. A COMPACT facet shows
   its value IN ITS TRIGGER, and a trigger holding a set has to summarise it —
   "3 selected", or a truncated list of names. That is a wording the kit has
   not been given and would be inventing, and CH11's answer to "several values
   are on" is the chip row this bar already draws. So: one value or none, and
   `null` is the resting state the `anyLabel` row returns to. The multi-select
   compact case is logged on the register rather than guessed at.

   IT IS A FIELD, NOT A TOOLBAR PILL, AND IT KEEPS CH09'S WEIGHT. The closed
   field is 14/300 — `selectTriggerVariants`' own step, measured 13.125px at
   weight 300 on the verify harness's 15px root. It does NOT take the 500 that
   `CHIP_ADD`, `SortControl` and `ViewSwitch` were just brought to: that 500
   is `ViewSwitch`'s override, and the client's ruling behind it names the
   toolbar's own three controls. A facet is not one of them — it lives in the
   panel the Filter pill OPENS, which is where both surfaces put it — and
   giving a field the button weight because it happens to be short would put
   CH09's step back in play for every other field in the system.
   `size="dense"` exists for exactly that placement: a column of facets inside
   a panel, where a stack of 44s is a tall panel.

   NOT A COMBOBOX, deliberately. The trigger is a disclosure button and the
   panel holds a `listbox`; it does not claim `role="combobox"` the way
   `SelectTrigger` does. A combobox's own field IS the text input, and here
   the text input is a SEARCH over the options, not the value — announcing the
   two as one control would tell a screen-reader reader that typing sets the
   facet, which it does not. The list is the same `role="listbox"` of buttons
   `SearchableFacet` draws, so the two facets are the same shape to assistive
   technology as well as to the eye.
   ========================================================================= */

export interface CompactFacetProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /** The facet's heading. Translatable. */
  label?: string;
  /**
   * Draw no visible heading — the facet is then named to assistive technology
   * by `label` alone. For a compact field standing IN a toolbar row, where a
   * caption stacked over a 44 pill would make it two rows tall.
   */
  hideLabel?: boolean;
  /** Everything that can be picked. */
  options?: FacetOption[];
  /** Controlled value. `null` is the facet turned off. */
  value?: string | null;
  /** Uncontrolled starting value. Off by default. */
  defaultValue?: string | null;
  /** Fires with the chosen option's `value`, or `null` when the facet is turned off. */
  onValueChange?: (value: string | null) => void;
  /**
   * What the closed field says while nothing is chosen — the kit's own example
   * is "Any client". Tertiary ink, exactly as a select's placeholder is.
   * Translatable.
   */
  placeholder?: string;
  /**
   * The row that TURNS THE FACET OFF, at the head of the list. Defaults to
   * `placeholder`, because "Any client" is the same sentence in both places.
   * Pass `null` to draw no such row — for a facet that has no off.
   */
  anyLabel?: string | null;
  /**
   * Draw the search pill above the list. OFF by default; turn it on for a
   * list long enough that scrolling it is the problem.
   */
  searchable?: boolean;
  /** Controlled query, for a facet whose options are fetched per keystroke. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** The search field's accessible name AND its placeholder. Translatable. */
  searchLabel?: string;
  /** Shown when nothing matches. Translatable. */
  emptyLabel?: string;
  /** Busy. Translatable label announced with the spinner. */
  loading?: boolean;
  loadingLabel?: string;
  /** The options could not be fetched. */
  error?: boolean;
  errorLabel?: string;
  /** Same contract as `SearchableFacet`'s: pass `() => true` when already filtered. */
  filterOption?: (option: FacetOption, query: string) => boolean;
  /** How tall the list may get before it scrolls. A CSS length. */
  maxHeight?: string;
  /**
   * The closed field's height. `default` is `--control-height-input` (44), the
   * height every `SelectTrigger` in the system stands at — including the sort
   * and view pills. `dense` is `--control-height-dense` (32), for a facet
   * inside a filter panel where a column of 44s is a tall panel.
   */
  size?: "default" | "dense";
  /** Which edge of the trigger the panel lines up with. */
  align?: "start" | "center" | "end";
  disabled?: boolean;
  /**
   * A value the reader may see and not change. Drawn as `disabled` — which is
   * `SelectTrigger`'s own stated answer (its state 10: "a value the user may
   * not change is `disabled`"), and this facet does not invent a second one
   * for the same field.
   */
  readOnly?: boolean;
  /** Controlled open state, for a panel a composition drives itself. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A compact, optionally-searchable, single-value facet: one short field, and
 * the same filtered list `SearchableFacet` draws, behind it.
 *
 * TEN STATES
 *  1. default        — heading (unless `hideLabel`), then the closed field:
 *                      `selectTriggerVariants`' pill with the chosen option's
 *                      words, or the placeholder in tertiary ink.
 *  2. hover          — does not apply to the FIELD. CH09 draws a field at
 *                      rest, at focus and disabled and no hover for any of
 *                      them (override 42), and this field is drawn through
 *                      the very recipe that records it. The option ROWS
 *                      hover, to `--accent`, never mango.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the trigger at its pill
 *                      radius, the search field's shell at its own, and each
 *                      option row at the row's. This file adds none.
 *  4. active/pressed — does not apply. The press OPENS the panel, and the
 *                      panel is the response — the same reasoning
 *                      `SelectTrigger` records. Open takes the ink hairline
 *                      focus takes, which `selectTriggerVariants` already
 *                      draws off `data-[state=open]`.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` label and
 *                      chevron, and the WEAK 8% edge against the resting
 *                      field's 20% (override 42). A fill and an ink.
 *  6. loading        — the spinner register in place of the list, announced
 *                      politely. The trigger stays operable and the search
 *                      field stays usable: the query is the reader's own text
 *                      and no server is filling it in.
 *  7. empty          — no options and no matches are the same register, for
 *                      the same reason `SearchableFacet` gives: to the reader
 *                      they are one event, "there is nothing here to pick".
 *                      A facet with nothing chosen is NOT empty — that is the
 *                      placeholder, and it is a resting state.
 *  8. error          — `Warning` over `errorLabel`, in place of the
 *                      list, inside the panel where the reader can retry.
 *  9. selected       — the chosen option's words replace the placeholder in
 *                      the field and go to primary ink; its row carries the
 *                      tick at the reading end and `aria-selected`. One row
 *                      at a time — see the header.
 * 10. read-only      — `readOnly`: drawn as `disabled`, per the prop.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in shape. The field takes its width
 *  from whatever holds it and the panel takes its width from the field, so
 *  the control is already as narrow as its container at every size; the panel
 *  is additionally capped by the width and height Radix measured, which is
 *  what keeps it on screen at 320. The list's own cap is `maxHeight`,
 *  defaulting to the same 14rem `SearchableFacet` uses — about six rows,
 *  which clears the keyboard on a phone.
 *
 * RTL — safe. The tick trails and the chevron is placed by `justify-between`
 * rather than by a side; Radix mirrors the panel's alignment from `dir`.
 */
const CompactFacet = React.forwardRef<HTMLDivElement, CompactFacetProps>(
  (
    {
      className,
      label = "Filter",
      hideLabel = false,
      options = [],
      value,
      defaultValue,
      onValueChange,
      placeholder = "Any",
      anyLabel,
      searchable = false,
      query,
      defaultQuery = "",
      onQueryChange,
      searchLabel = "Search",
      emptyLabel = "Nothing matches",
      loading = false,
      loadingLabel = "Loading…",
      error = false,
      errorLabel = "These options could not be loaded",
      filterOption = defaultFilterOption,
      maxHeight = "14rem",
      size = "default",
      align = "start",
      disabled = false,
      readOnly = false,
      open,
      defaultOpen,
      onOpenChange,
      ...props
    },
    ref,
  ) => {
    const reactId = React.useId();
    const labelId = `${reactId}-label`;
    const listId = `${reactId}-list`;

    const [uncontrolledValue, setUncontrolledValue] = React.useState<string | null>(
      () => defaultValue ?? null,
    );
    const valueControlled = value !== undefined;
    const selected = valueControlled ? value : uncontrolledValue;

    const [uncontrolledQuery, setUncontrolledQuery] = React.useState(defaultQuery);
    const queryControlled = query !== undefined;
    const currentQuery = queryControlled ? query : uncontrolledQuery;

    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
    const openControlled = open !== undefined;
    const isOpen = openControlled ? open : uncontrolledOpen;

    /* One inert state, resolved once. `readOnly` reaches the same skin as
       `disabled` — see the prop — so the field has one closed drawing and not
       two that have to agree. */
    const inert = disabled || readOnly;
    const fieldState = inert ? "disabled" : "default";

    const visible = React.useMemo(
      () => options.filter((option) => filterOption(option, currentQuery)),
      [options, filterOption, currentQuery],
    );

    /* The chosen option's WORDS, from the options themselves. When the option
       has gone away under a live facet the field falls back to the
       placeholder rather than to the raw value — a facet must not name a
       stored id at the reader (the same hazard `FilterBar`'s chips carry a
       `label` for). */
    const chosen = selected === null ? undefined : options.find((o) => o.value === selected);

    const setOpen = (next: boolean) => {
      if (!openControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    };

    const commit = (next: string | null) => {
      if (!valueControlled) setUncontrolledValue(next);
      onValueChange?.(next);
      setOpen(false);
    };

    const handleQuery = (next: string) => {
      if (!queryControlled) setUncontrolledQuery(next);
      onQueryChange?.(next);
    };

    /* The off row's words default to the placeholder's: "Any client" is the
       same sentence whether the field is saying it or the list is offering
       it. `null` suppresses the row for a facet that has no off. */
    const offLabel = anyLabel === undefined ? placeholder : anyLabel;

    const row = (
      key: string,
      isSelected: boolean,
      onPick: () => void,
      children: React.ReactNode,
      count?: number,
      rowDisabled?: boolean,
    ) => (
      <button
        key={key}
        type="button"
        role="option"
        data-slot="compact-facet-option"
        aria-selected={isSelected}
        aria-disabled={rowDisabled || undefined}
        disabled={rowDisabled}
        onClick={onPick}
        className={cn(
          FACET_OPTION_ROW,
          rowDisabled && "cursor-not-allowed text-ink-disabled",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>

        {/* A count that is zero is not drawn — the kit never shows a "0". */}
        {count !== undefined && count > 0 ? (
          <span className="shrink-0 text-badge tabular-nums text-ink-tertiary">{count}</span>
        ) : null}

        {/* The tick at the reading end, which is how `SelectItem` marks the
            chosen row — NOT the checkbox mark `SearchableFacet` draws. That
            box says "several of these may be on"; this facet holds one. */}
        <span aria-hidden="true" className="grid size-[var(--icon-button)] shrink-0 place-content-center">
          {isSelected ? <CheckFat className="size-[var(--icon-button)]" /> : null}
        </span>
      </button>
    );

    return (
      <div
        ref={ref}
        data-slot="compact-facet"
        data-state={inert ? (disabled ? "disabled" : "readOnly") : "default"}
        role="group"
        aria-labelledby={hideLabel ? undefined : labelId}
        aria-label={hideLabel ? label : undefined}
        aria-busy={loading || undefined}
        className={cn("flex min-w-0 flex-col gap-2", className)}
        {...props}
      >
        {hideLabel ? null : <FacetLabel id={labelId}>{label}</FacetLabel>}

        <Popover open={isOpen} onOpenChange={setOpen}>
          <PopoverTrigger
            data-slot="compact-facet-trigger"
            disabled={inert}
            data-readonly={readOnly ? "true" : undefined}
            aria-readonly={readOnly || undefined}
            aria-invalid={error || undefined}
            className={cn(
              selectTriggerVariants({ state: error ? "error" : "default" }),
              /* The one measure this facet sets over the trigger's own.
                 `dense` is for a column of facets in a panel; the default is
                 the 44 every other field in the system stands at. */
              size === "dense"
                ? "h-[var(--control-height-dense)]"
                : "h-[var(--control-height-input)]",
            )}
          >
            {/* Tertiary ink while nothing is chosen — the same thing
                `data-[placeholder]` does on a real select, said in JS because
                Radix is not the one rendering this value. */}
            <span className={cn("min-w-0 truncate text-start", chosen ? undefined : "text-muted-foreground")}>
              {chosen ? chosen.label : placeholder}
            </span>
            <CaretDown
              aria-hidden="true"
              className="size-[var(--icon-button)] shrink-0"
            />
          </PopoverTrigger>

          <PopoverContent
            data-slot="compact-facet-panel"
            align={align}
            /* Chapter 12's surface, sized by `selectContentClasses`' OWN
               stated rule rather than by chapter 12's fixed 300: never
               narrower than the field it drops out of, free to grow to its
               longest option, and capped by the width Radix measured. A facet
               panel narrower than its field reads as a different control, and
               one pinned to the field truncates the account names these
               facets exist to hold.

               And the floating layer's `--space-2h` inset rather than the
               confirm panel's 20, because this panel holds pill rows that
               carry their own — the same pair, for the same reason. */
            className={cn(
              "w-auto min-w-[var(--radix-popover-trigger-width)]",
              "p-[var(--space-2h)]",
            )}
          >
            {searchable ? (
              <FacetSearch
                slot="compact-facet-search"
                querySlot="compact-facet-query"
                value={currentQuery}
                onValueChange={handleQuery}
                label={searchLabel}
                state="default"
              />
            ) : null}

            {error ? (
              <FacetRegister
                slot="compact-facet-error"
                icon={<Warning size={20} aria-hidden="true" className="text-ink-tertiary" />}
              >
                {errorLabel}
              </FacetRegister>
            ) : loading ? (
              <FacetRegister
                slot="compact-facet-loading"
                busy
                icon={
                  <CircleNotch size={20} aria-hidden="true" className="motion-spinner text-ink-tertiary" />
                }
              >
                {loadingLabel}
              </FacetRegister>
            ) : visible.length === 0 ? (
              <FacetRegister
                slot="compact-facet-empty"
                icon={<MagnifyingGlass size={20} aria-hidden="true" className="text-ink-tertiary" />}
              >
                {emptyLabel}
              </FacetRegister>
            ) : (
              <div
                id={listId}
                data-slot="compact-facet-list"
                role="listbox"
                aria-label={label}
                style={{ maxHeight }}
                className={cn("flex flex-col gap-1 overflow-y-auto", searchable && "mt-2")}
              >
                {/* The off row leads the list, which is where every "Any …"
                    row in the system sits: the way back to no filter is above
                    the filters, not hunted for at the end of 131 of them. */}
                {offLabel === null
                  ? null
                  : row("__any__", selected === null, () => commit(null), offLabel)}

                {visible.map((option) =>
                  row(
                    option.value,
                    selected === option.value,
                    () => commit(option.value),
                    option.label,
                    option.count,
                    option.disabled,
                  ),
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);

CompactFacet.displayName = "CompactFacet";

export {
  FilterBar,
  RangeFacet,
  SearchableFacet,
  CompactFacet,
  FacetLabel,
  filterChipVariants,
  facetFieldVariants,
};
