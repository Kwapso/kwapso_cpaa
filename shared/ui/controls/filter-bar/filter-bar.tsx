/* ============================================================================
   FilterBar · RangeFacet · SearchableFacet — the narrowing controls
   (1 direct call site on the bar).

   DESIGN SOURCE
   · design-mothership/specimens/_fragments/t11.css → `.kw-chip`,
     `.kw-chip__x`, `.kw-chip--add`, read alongside t11-chips.html. This is
     the core reference: an active facet is a KIT-DRAWN CHIP — a raised pill
     at the 26 pill height, badge type, `--space-3` of inline-start padding
     and `--space-1` at the inline end, with an 18 circle on the `--hair` fill
     as its remove control. "+ Filter" is the same chip with its ink dropped a
     tier, and that is the drawing "Clear filters" reuses.
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
   · components/primitives/select/select.tsx and dropdown-menu — an option row
     in this system is `rounded-pill px-3 py-[var(--space-2h)]` on `--accent`.
     Matched rather than re-drawn.
   Everything left open is in GAPS-G.md (FLT-1 … FLT-7).

   THE LAW THIS FILE OBEYS
   · Chips and facet pills take `--radius-pill`. Marks take `--radius-select`
     (6). Nothing here takes a fifth radius.
   · A chip here is NEUTRAL — raised paper, primary ink — so it may carry
     nothing coloured. Ruling 26 forbids an edge on a coloured pill; these
     are not coloured, and they still carry none, because the kit draws
     them on the raised fill with elevation doing the work.
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
   `"use client"`. Two of the three components hold state and all three attach
   handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Check, Loader2, Search, SearchX, TriangleAlert, X } from "../../icons";

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
    // 26 tall · full pill · badge type, and it never wraps.
    "h-[var(--control-height-pill)] rounded-pill whitespace-nowrap",
    "text-badge leading-none",
    // 4 at the inline end, holding the remove control off the edge (T11-4).
    "pe-1",
    "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      /** Mutually exclusive. Resolved once, in JS, at each call. */
      state: {
        /** Raised paper, primary ink — the kit's resting chip. */
        default: "bg-[var(--surface-raised)] text-ink-primary",
        /** A fill and an ink. Never an opacity, never a faded chip. */
        disabled: "cursor-not-allowed bg-hair-faint text-ink-disabled",
      },
    },
    defaultVariants: { state: "default" },
  },
);

/** The chip's label half. A button when the chip is selectable, else a span. */
const CHIP_LABEL =
  "inline-flex h-full items-center rounded-pill ps-3 pe-1 leading-none [font:inherit] text-inherit";

const CHIP_LABEL_INTERACTIVE =
  "cursor-pointer appearance-none border-0 bg-transparent enabled:hover:bg-accent";

/* `.kw-chip--add` — the "+ filter" slot, and the one bordered control in the
   system.

   FLT-C1. CH11 draws this chip in its "Filter chips — removable" block, at the
   end of the applied row, and the build had no slot for it at all: the only
   thing rendered after the chips was `Clear`, wearing a comment that named
   `.kw-chip--add` for a control that is not it.

   THE DASH. ch26, verbatim: 'Dashed "+ filter" — the one exception. A dashed
   outline signals "not yet set" for an empty filter slot. This is the only
   bordered control in the system; don't extend the pattern elsewhere.' That is
   the only statement in the artifact of what this control IS, so it is taken.
   Recorded honestly, because a later reader will check: CH11, which DRAWS the
   chip, gives it no edge in any of its 88 declarations, and ch26 draws nothing
   at all. The stroke used is the artifact's own dashed stroke — `1px dashed
   var(--hair2)`, the declaration CH16 writes on the dropzone — rather than a
   new one, so nothing is invented either way. Flagged for a ruling.

   Symmetrical padding, because unlike a removable chip there is no control to
   hold off the inline end, and the ink drops one tier: this is a slot that is
   not yet set, not a facet that is on. */
const CHIP_ADD = [
  "inline-flex h-[var(--control-height-pill)] shrink-0 items-center gap-1",
  "cursor-pointer appearance-none rounded-pill whitespace-nowrap px-3",
  "text-badge leading-none",
  "border border-dashed border-[var(--hair-strong)] bg-transparent",
  "text-ink-tertiary enabled:hover:text-foreground",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  "disabled:cursor-not-allowed disabled:border-[var(--hair)] disabled:text-ink-disabled",
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

/** A facet's own heading. Caption step, secondary ink — the register's tier. */
function FacetLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} className="text-caption text-ink-secondary">
      {children}
    </span>
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
 *  8. error          — `TriangleAlert` over `errorLabel`, in place of the list.
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

        {/* `.kw-search` at the dense height: the raised, borderless pill. */}
        <div
          data-slot="searchable-facet-search"
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
          <Search size={16} aria-hidden="true" className="text-ink-tertiary" />
          <input
            type="search"
            data-slot="searchable-facet-query"
            /* The bare node inside the pill shell: the ring belongs to the
               shell, which is the shape the reader sees (review 1A · fix 4). */
            data-focus-proxy=""
            value={currentQuery}
            disabled={disabled}
            readOnly={readOnly}
            data-readonly={readOnly ? "true" : undefined}
            tabIndex={readOnly ? -1 : undefined}
            aria-label={searchLabel}
            placeholder={searchLabel}
            onChange={(event) => handleQuery(event.currentTarget.value)}
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

        {error ? (
          <FacetRegister
            slot="searchable-facet-error"
            icon={<TriangleAlert size={20} aria-hidden="true" className="text-ink-tertiary" />}
          >
            {errorLabel}
          </FacetRegister>
        ) : loading ? (
          <FacetRegister
            slot="searchable-facet-loading"
            busy
            icon={
              <Loader2 size={20} aria-hidden="true" className="motion-spinner text-ink-tertiary" />
            }
          >
            {loadingLabel}
          </FacetRegister>
        ) : visible.length === 0 ? (
          <FacetRegister
            slot="searchable-facet-empty"
            icon={<SearchX size={20} aria-hidden="true" className="text-ink-tertiary" />}
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
                    // The system's option row: pill, 12 inline, 10 block.
                    "flex w-full cursor-pointer appearance-none items-center gap-[var(--space-2h)]",
                    "rounded-pill border-0 bg-transparent px-3 py-[var(--space-2h)]",
                    "text-start text-sm [font:inherit] text-foreground",
                    "enabled:hover:bg-accent",
                    "transition-colors duration-[var(--duration-colour)] ease-kwapso",
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
                    {isSelected ? <Check size={12} /> : null}
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

export { FilterBar, RangeFacet, SearchableFacet, filterChipVariants, facetFieldVariants };
