/* ============================================================================
   DescriptionList — label/value pairs on a record (2 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → the kit draws this shape
   twice and both drawings are transcribed here as the two densities:

     .kw-accountcard__kv   display: grid;
                           grid-template-columns: 6.875rem 1fr;   — 110
                           gap: var(--space-3) var(--space-4);
                           font-size: var(--text-caption);
     .kw-accountcard__kv dt { color: var(--ink-tertiary); margin: 0 }
     .kw-accountcard__kv dd { margin: 0 }

     .kw-drawer__kv        display: grid;
                           grid-template-columns: 6.25rem 1fr;    — 100
                           gap: var(--space-2h) var(--space-4);
                           font-size: var(--text-caption);

   The two differ only in the label measure (110 vs 100) and the row gap
   (12 vs 10). `density="default"` is the record card's, `density="dense"` is
   the drawer's — the kit's own two, neither invented.
   design-mothership/specimens/kwapso-ui.css → `.kw-empty` for the empty
   register; kwapso-patterns.css CH21 → `.kw-register` for the error register.
   Both are transcribed at the bottom of this file.

   THE LAW THIS FILE OBEYS
   · A LABEL IS TERTIARY INK, A VALUE IS PRIMARY. That is the whole visual
     difference between the two columns; the kit draws no rule, no fill and
     no hairline between them, and none is added here.
   · NEVER INVENT A VALUE. A pair whose value is absent is DROPPED, not
     rendered as a dash or a zero (PATTERN §4, "prefer nothing"). A call site
     that wants the row held for layout passes `emptyValueLabel`, and then it
     owns the words.
   · Focus is ONE global rule (tokens.css §8). Nothing here is focusable, so
     nothing here rings. A value that is a link brings its own control and
     tokens.css rings that.
   · Disabled is a fill and an ink, never an opacity — and it does not apply
     here at all, for the reason written in state 5.
   · No px, no hex, no font size. `text-caption` and `text-micro` are real
     utilities (tokens.css §10) and carry size, leading and tracking together.
     The two label measures are the kit's own rem figures.
   · Every user-facing string is a prop with a default.
   · No product vocabulary (commission §11). A pair has a `label` and a
     `value`; the thing it describes is a "record".

   THE TWO-COLUMN QUESTION, STATED
   The kit's grid is two columns AT EVERY WIDTH — 110 of label and the rest
   for the value. At 320 that leaves ~14rem for the value, which is enough
   for a date, a name or a status but not for a sentence. So `layout="rows"`
   (the kit's grid) collapses to one column below 48rem, which is chapter 9's
   only stated form breakpoint and the one this system already uses for a two
   column layout. `layout="grid"` is the opposite arrangement — several pairs
   ACROSS — and it is stated in full in the breakpoint block below.

   RENDERING CONTEXT
   No `"use client"`. This module holds no hook, no state and no handler. It
   renders `Skeleton`, which carries its own directive where it needs one.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Skeleton } from "../skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ============================================================================
   The pair
   ========================================================================= */

export interface DescriptionListItem {
  /**
   * React key. Required, because a record's pairs are re-ordered whenever the
   * caller filters them and a positional key would carry the wrong value over.
   */
  id: string;
  /** The words in the tertiary column. A node, so a unit or a hint may ride along. */
  label: React.ReactNode;
  /**
   * The value. `undefined` or `null` means "not known", which is NOT the same
   * as an empty string: an empty string is a value someone stored. The
   * absent case is dropped unless `emptyValueLabel` is given.
   */
  value?: React.ReactNode;
  /**
   * This pair's value is still arriving. Draws a `Skeleton` bar in the value
   * column and keeps the label — a label is known before its value is, which
   * is the same argument `field.tsx` makes for keeping its label while the
   * control is busy.
   */
  loading?: boolean;
  /**
   * The value spans the whole measure rather than sitting beside its label —
   * a paragraph, a list of chips, an embedded control. Mirrors the kit's own
   * `.kw-form__full { grid-column: 1 / -1 }`.
   */
  full?: boolean;
}

/* ============================================================================
   Registers — both transcribed, both local
   ========================================================================= */

/* `.kw-empty` (kwapso-ui.css, the last block in the file): a centred column,
   `--space-2` between its lines, `--space-8` / `--space-6` inset, tertiary
   ink at the 14 step. The kit gives it no title, no body and no action row —
   those belong to `.kw-register`, which is a different, left-aligned block. */
function EmptyRegister({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-slot="description-list-empty"
      /* Left-aligned -- 27.21, DEF-2. */
      className="flex flex-col items-start gap-2 px-6 py-[var(--space-8)] text-start text-sm text-ink-tertiary"
    >
      {children}
    </div>
  );
}

/* ============================================================================
   THE ERROR REGISTER IS THE SHARED ONE — `CollectionRegister`.

   CH21's `.kw-register` was declared LOCALLY in six files, byte-for-byte the
   same markup in every one of them, and one record could show two different
   copies of it at once (a `detail-view` rendering a `DescriptionList`). The
   values inside all six were corrected in place on 2026-08-23, so nothing
   drew wrongly; six chances to drift is the defect, and this is the follow-up
   GAPS-FIDELITY-DE L-2 wrote out. `variant="block"` IS `.kw-register` — the
   panel tone at the 24 radius, `--space-7` inset, left-aligned per 27.21 —
   and `tone="error"` is the 7px poppy dot CH21 puts on exactly one of its
   four registers.

   `.kw-empty` STAYS LOCAL, and that is not an oversight. It is a different
   kit object: one line of words at the 14 step in tertiary ink, not an
   eyebrow / title / body / action column. `CollectionRegister`'s `inline`
   variant carries `.kw-empty`'s box but not its step or its ink, so folding
   the two together would either shrink this register's words or hand every
   inline register a container ink its title would inherit. Logged rather
   than forced.
   ========================================================================= */

/* ============================================================================
   DescriptionList
   ========================================================================= */

export interface DescriptionListProps
  extends Omit<React.ComponentPropsWithoutRef<"dl">, "children"> {
  /** The pairs, in the order they should read. This component never sorts. */
  items?: DescriptionListItem[];
  /**
   * Fully-composed `<dt>` / `<dd>` children, for a call site whose value is
   * richer than a node — a chip row with its own keys, a nested list. Given
   * children, `items` is ignored and this component supplies only the grid.
   */
  children?: React.ReactNode;
  /**
   * `rows` is the kit's own drawing: one pair per line, label beside value.
   * `grid` puts several pairs ACROSS, each one label-above-value, for a
   * summary strip at the top of a record. Both are stated at all three
   * widths in the breakpoint block below.
   */
  layout?: "rows" | "grid";
  /**
   * `default` is `.kw-accountcard__kv` — 110 of label, `--space-3` rows.
   * `dense` is `.kw-drawer__kv` — 100 of label, `--space-2h` rows. Both are
   * kit drawings; there is no third.
   */
  density?: "default" | "dense";
  /**
   * How wide the label column is in `layout="rows"`. Defaults to the kit
   * figure for the chosen density. rem only — a call site with long labels
   * passes its own measure rather than letting them wrap to three lines.
   */
  labelWidth?: string;
  /**
   * Smallest width a `layout="grid"` cell may take before the grid drops a
   * column. `auto-fit` / `minmax` throughout, so the count follows the
   * container and not the viewport. The kit's own summary grids use 18rem
   * and 19rem (`.kw-laws`, `.t22-blocks`); 12rem is chosen for a label/value
   * pair, which is shorter than a paragraph. GAPS-COL2 DSL-2.
   */
  minColumn?: string;
  /**
   * The words for a pair whose value is absent. Defaults to **"Not set"**,
   * which is OVERRIDE 21: "An unset fact reads 'Not set', everywhere.
   * `DescriptionList` keeps one label for the whole list, so no screen
   * author picks their own phrase and 'Not set / None / Not yet / —' cannot
   * drift back in."
   *
   * It used to have no default, which had two consequences the override
   * exists to stop: an unset fact DROPPED ITS WHOLE ROW rather than saying
   * it was unset, and the phrase stayed the screen author's to choose — one
   * screen was already carrying its own `notSet: "Not set"` string. Pass
   * `null` for the old behaviour on a list where a missing row is right.
   */
  emptyValueLabel?: React.ReactNode;
  /**
   * Every value is still arriving. Draws a `Skeleton` bar in each value
   * column and announces `aria-busy`; the labels stay, because they are known
   * before the values are. Per-pair loading is `item.loading`.
   */
  loading?: boolean;
  /** How many placeholder pairs to draw while `loading` and `items` is empty. */
  loadingRows?: number;
  /** The record could not be read. Draws the error register instead of the list. */
  error?: boolean;
  /** The eyebrow beside the register's poppy dot. Ruling 26: the dot never speaks alone. */
  errorEyebrow?: string;
  /** The register's title line. */
  errorTitle?: string;
  /** The register's sentence. Says what happened. */
  errorBody?: React.ReactNode;
  /** The register's one next step — a `Button`, usually `variant="secondary"` (t21-gaps T21-3). */
  errorAction?: React.ReactNode;
  /** The words when there is nothing to show at all. */
  emptyLabel?: string;
  /**
   * Render nothing when there are no pairs. Default `false`: a panel that
   * vanishes leaves the reader unsure whether it failed or was never there.
   * `.kw-empty`'s own note says hide-when-empty is a real pattern elsewhere
   * and must not be "fixed" into the register, so it is offered, not decided.
   */
  hideWhenEmpty?: boolean;
}

/* The two kit drawings, as class sets. Kept adjacent so they cannot drift. */
const DENSITY_ROW_GAP = {
  /** `.kw-accountcard__kv` — 12 between rows, 16 between the columns. */
  default: "gap-x-4 gap-y-3",
  /** `.kw-drawer__kv` — 10 between rows, 16 between the columns. */
  dense: "gap-x-4 gap-y-[var(--space-2h)]",
} as const;

const DENSITY_LABEL_WIDTH = {
  /** 110 — `.kw-accountcard__kv`. */
  default: "6.875rem",
  /** 100 — `.kw-drawer__kv`. */
  dense: "6.25rem",
} as const;

/**
 * A record's label/value pairs.
 *
 * TEN STATES
 *  1. default        — the kit's grid: tertiary labels, primary values, at
 *                      the caption step, no rule and no fill between them.
 *  2. hover          — does not apply. A pair is read, not operated. Where a
 *                      whole record row IS a target that is `list`'s or
 *                      `table`'s job and the row carries `--accent`; a pair
 *                      that lit up under the pointer would promise a press
 *                      that does not exist.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Nothing in this file is focusable; a link or a copy
 *                      control placed in a value is the caller's and rings
 *                      itself.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply, deliberately. A stated value is a
 *                      fact; there is nothing to switch off. A record the
 *                      reader may not ACT on disables its controls and keeps
 *                      its values legible — greying the words would be an
 *                      opacity in spirit even when written as an ink, and it
 *                      would hide information for no reason.
 *  6. loading        — `loading`, or `item.loading`: the label stays and the
 *                      value column becomes a `Skeleton` bar. `aria-busy` on
 *                      the list. The empty register is SUPPRESSED while busy —
 *                      "there is nothing here" is a fact that has not been
 *                      established yet.
 *  7. empty          — no pairs: `.kw-empty`, the centred register, with
 *                      `emptyLabel`. Or nothing at all with `hideWhenEmpty`.
 *                      A single pair whose value is absent is DROPPED rather
 *                      than filled with a dash.
 *  8. error          — `error`: `.kw-register`, the left-aligned panel card —
 *                      a 7 poppy dot, its eyebrow, a title, a sentence and one
 *                      next step. Announced as an alert; the empty case is
 *                      only a status.
 *  9. selected       — does not apply. The kit draws no selected pair, and a
 *                      description list is not a chooser. Where one pair must
 *                      stand out the call site puts a `Badge` in the value.
 * 10. read-only      — ALWAYS. This component displays a record; it never
 *                      edits one. The editable twin is `form`, which is a
 *                      grid of `Field`s and a different component on purpose.
 *
 * THREE BREAKPOINTS — and the answer is NOT "unchanged".
 *  layout="rows"
 *   mobile   — ONE column. The label sits above its value. The kit's 110/1fr
 *              grid leaves about 14rem for the value at 320, which is enough
 *              for a date and not enough for an address, and a wrapped value
 *              beside a wrapped label reads as four unrelated fragments.
 *   tablet   — the kit's two-column grid, from 48rem. That is chapter 9's one
 *              stated breakpoint (t9.css `.kw-form`), reused rather than a
 *              second number invented for the same job.
 *   desktop  — UNCHANGED from tablet. The label column stays at its kit
 *              measure and the value takes the rest; a wider viewport gives
 *              the value more room, which is the right place to spend it.
 *  layout="grid"
 *   mobile / tablet / desktop — `auto-fit` / `minmax(minColumn, 1fr)`, so the
 *              column count follows the CONTAINER, not the viewport. One
 *              column on a phone, two or three in a panel, more on a wide
 *              page — with no breakpoint at all, which is what makes the same
 *              strip correct inside a 420 drawer and across a 1240 page.
 *
 * RTL — safe. The grid is `grid-cols-*` on the inline axis and follows the
 * document direction; every inset is `px-*` (padding-inline) or on the block
 * axis; nothing is positioned by side and no `left`/`right` appears.
 */
const DescriptionList = React.forwardRef<HTMLDListElement, DescriptionListProps>(
  (
    {
      className,
      items,
      children,
      layout = "rows",
      density = "default",
      labelWidth,
      minColumn = "12rem",
      emptyValueLabel = "Not set",
      loading = false,
      loadingRows = 4,
      error = false,
      errorEyebrow = "Load failed",
      errorTitle = "This record could not be read",
      errorBody,
      errorAction,
      emptyLabel = "Nothing recorded yet",
      hideWhenEmpty = false,
      style,
      ...props
    },
    ref,
  ) => {
    const composed = React.Children.count(children) > 0;

    /* An absent value drops its pair, unless the call site said what to print
       instead. Done here rather than in the renderer so `isEmpty` below is
       true for a record whose every value is missing. */
    const rows = React.useMemo(() => {
      if (composed) return [];
      return (items ?? []).filter(
        (item) =>
          item.loading === true ||
          emptyValueLabel !== undefined ||
          (item.value !== undefined && item.value !== null),
      );
    }, [composed, items, emptyValueLabel]);

    const isEmpty = !composed && rows.length === 0;

    if (error) {
      return (
        <CollectionRegister
          variant="block"
          tone="error"
          role="alert"
          eyebrow={errorEyebrow}
          title={errorTitle}
          body={errorBody}
          actions={errorAction}
        />
      );
    }

    if (isEmpty && !loading && hideWhenEmpty) return null;

    if (isEmpty && !loading) {
      return (
        <EmptyRegister>
          <span role="status">{emptyLabel}</span>
        </EmptyRegister>
      );
    }

    const resolvedLabelWidth = labelWidth ?? DENSITY_LABEL_WIDTH[density];

    /* `layout="rows"` is one column below 48rem and the kit's `label 1fr`
       grid at and above it. The measure travels as a custom property so the
       whole rule stays one class rather than an arbitrary value repeated in
       two places. */
    const gridClasses =
      layout === "grid"
        ? "grid grid-cols-[repeat(auto-fit,minmax(var(--kw-dl-col),1fr))]"
        : "grid grid-cols-1 md:grid-cols-[var(--kw-dl-label)_1fr]";

    const placeholders = loading && rows.length === 0 ? Math.max(loadingRows, 0) : 0;

    return (
      <dl
        ref={ref}
        data-slot="description-list"
        data-layout={layout}
        data-density={density}
        aria-busy={loading || undefined}
        style={
          {
            "--kw-dl-label": resolvedLabelWidth,
            "--kw-dl-col": minColumn,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "min-w-0 text-caption",
          gridClasses,
          DENSITY_ROW_GAP[density],
          className,
        )}
        {...props}
      >
        {composed
          ? children
          : rows.map((item) => (
              <Pair
                key={item.id}
                item={item}
                layout={layout}
                loading={loading}
                emptyValueLabel={emptyValueLabel}
              />
            ))}

        {Array.from({ length: placeholders }, (_, index) => (
          <Pair
            key={`placeholder-${index}`}
            item={{ id: `placeholder-${index}`, label: <Skeleton className="w-2/3" announce={false} />, loading: true }}
            layout={layout}
            loading
            emptyValueLabel={undefined}
          />
        ))}
      </dl>
    );
  },
);

DescriptionList.displayName = "DescriptionList";

/* ----------------------------------------------------------------------------
   One pair. Local: a `<dt>`/`<dd>` couple is meaningless outside the `<dl>`
   that supplies the grid, so it is not exported and cannot be misplaced.

   In `layout="grid"` the pair is its own cell and stacks inside it, which is
   why the two elements are wrapped in a `<div>` there and are bare grid
   children in `layout="rows"`. A `<div>` between `<dl>` and `<dt>` is valid
   HTML and is the only way to make one grid cell hold both halves.
   ------------------------------------------------------------------------- */
function Pair({
  item,
  layout,
  loading,
  emptyValueLabel,
}: {
  item: DescriptionListItem;
  layout: "rows" | "grid";
  loading: boolean;
  emptyValueLabel?: React.ReactNode;
}) {
  const busy = loading || item.loading === true;
  const absent = item.value === undefined || item.value === null;

  const term = (
    <dt
      data-slot="description-term"
      className={cn(
        // `.kw-accountcard__kv dt` — tertiary ink, no margin of its own.
        "m-0 min-w-0 text-ink-tertiary",
        // Below the 48rem breakpoint the label sits above its value with no
        // extra gap, so the pair reads as one block rather than two rows.
        // A `full` pair puts its label on its own line and gives the value
        // the whole measure — the kit's own `.kw-form__full`, applied here.
        layout === "rows" && (item.full === true ? "md:col-span-2" : "md:col-start-1"),
      )}
    >
      {item.label}
    </dt>
  );

  const detail = (
    <dd
      data-slot="description-detail"
      className={cn(
        // `.kw-accountcard__kv dd` — the value keeps the primary ink it
        // inherits; the kit gives it no colour rule of its own.
        "m-0 min-w-0 leading-[var(--leading-normal)]",
        layout === "rows" && item.full === true && "md:col-span-2",
      )}
    >
      {busy ? (
        <Skeleton className="w-1/2" announce={false} />
      ) : absent ? (
        emptyValueLabel
      ) : (
        item.value
      )}
    </dd>
  );

  if (layout === "grid") {
    return (
      <div data-slot="description-pair" className="flex min-w-0 flex-col gap-1">
        {term}
        {detail}
      </div>
    );
  }

  return (
    <React.Fragment>
      {term}
      {detail}
    </React.Fragment>
  );
}

export { DescriptionList };
