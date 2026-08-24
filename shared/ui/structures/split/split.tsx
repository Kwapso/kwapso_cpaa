/* ============================================================================
   Split — a list that keeps its place while you read.

   DESIGN SOURCE
   `KWAPSO-SPEC.md` CH19 view 12 and CH27.27 "Split list and preview". Its
   drawn value is the whole layout:

       grid-template-columns: 300px 1fr

   and CH27.27's rules are the brief, verbatim:

       "For collections a person works down one by one — an inbox of requests,
        a review queue. The list holds the left third, the selected record
        fills the rest, and the reading pane is the detail composition (27.8)
        with its breadcrumb removed."

       "The list keeps its place — Selecting a record never re-sorts, never
        scrolls the list and never collapses it. The two panes are separate
        scroll containers, so a long record cannot push the list away."

       "One row is always selected — Opening the view selects the first row.
        There is no empty reading pane with 'select a record' in the middle —
        that is a wasted half-screen, and the brand does not draw instructions
        where content belongs."

       "Keyboard is part of the composition — Up and down move the selection,
        Enter opens the record in full, Escape returns to the list. The line
        under the pane says so in words, because a keyboard affordance nobody
        knows about is not one."

       "300px list, and it truncates — The list column is fixed — number,
        title on one line with an ellipsis, one metadata line. It never wraps
        to three lines to fit a long title: the pane beside it holds the full
        text."

       "Narrow has no split — Below 900 the split becomes an ordinary list and
        a row opens the record as its own screen."

   THE LAW THIS FILE OBEYS
   · THE LIST IS `List`. The row height, the hairline under it, the truncation,
     the leading index, the hover wash and the selected fill are all the
     primitive's. This file supplies the two panes, the selection, the
     keyboard and the words under the pane — and nothing else.
   · THE PANE IS THE CALLER'S. CH27.27 says the pane is composition 27.8 minus
     the breadcrumb, and 27.8 is `RecordDetail`. Passing a node rather than
     rendering one keeps this file from having a second opinion about what a
     record looks like.
   · ONE ROW IS ALWAYS SELECTED. Uncontrolled, the first row is selected on
     mount. There is no "select a record" pane, ever.
   · TWO SCROLL CONTAINERS, NOT ONE. Each pane scrolls on its own, so a long
     record cannot push the list off the screen. Neither sets
     `overflow: hidden`, so the global focus ring is never shaved.
   · THE KEYBOARD LINE IS DRAWN, IN WORDS, AND IT IS A PROP. CH27.27 requires
     the sentence; a translated app needs to be able to change it, including
     the key names.
   · NARROW HAS NO SPLIT, AND THAT CHANGES BEHAVIOUR AS WELL AS LAYOUT: below
     the threshold a row press OPENS rather than selects. Read from
     `matchMedia` at the moment of the press, so nothing is decided during
     render and there is no hydration mismatch to manage.
   · Radii 24. No `border` property. Focus is one global rule (tokens.css §8).
     Never an opacity, rem only, LTR only.
   · THE SELECTED ROW IS MANGO — and this line used to read "never mango".
     The kit draws it, sampled: `#FED069` on the chosen row, `#FFFEF9` on the
     rest. Override 17 licenses it (one mango ACTION per screen, and this is
     a mark, not an action) and it is scoped to this view rather than pushed
     into `List`, because override 40 owns the system's selected wash and is
     logged as still open. The full argument is on the `List` below.

   RENDERING CONTEXT
   `"use client"`. Selection state, a keyboard handler and a media query read
   at press time.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "../../controls/button/button";
import { List, type ListRow } from "../list/list";
import { CollectionRegister } from "../collection-frame/collection-frame";

export interface SplitRecord {
  /** Stable id. The selection value, and the handle every callback is given. */
  id: string;
  /** The record's number, leading the row in the faintest ink. */
  number?: React.ReactNode;
  /** The record's name. One line, with an ellipsis. */
  title: React.ReactNode;
  /** The one metadata line under it — owner and age, in the kit's drawing. */
  meta?: React.ReactNode;
  /** Cannot be opened. `List` owns the fill and the ink. */
  disabled?: boolean;
}

export interface SplitProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /** The records, in the order they should read. This view never sorts. */
  records: readonly SplitRecord[];

  /** Controlled selection. */
  selectedId?: string;
  /** Uncontrolled starting selection. Defaults to the first record. */
  defaultSelectedId?: string;
  /** The selection moved — by press, or by an arrow key. */
  onSelectionChange?: (id: string, record: SplitRecord) => void;
  /**
   * Open the record in full — Enter, the pane's own control, or a row press
   * at the widths where there is no split.
   */
  onOpen?: (record: SplitRecord) => void;
  /** Escape was pressed inside the view. CH27.27: "Escape returns to the list." */
  onEscape?: () => void;

  /** The reading pane. CH27.27: composition 27.8 with its breadcrumb removed. */
  detail?: React.ReactNode;
  /** A pager under the list — the kit draws "1–5 of 24 · Next" there. */
  listFooter?: React.ReactNode;

  /** How wide the list column is. CH27.27 fixes it. rem only. */
  listWidth?: string;
  /**
   * Bound the two panes so each scrolls inside itself rather than scrolling
   * the page. rem only. Undefined lets the taller pane set the height, which
   * is right for a short list inside an already-scrolling page.
   */
  maxHeight?: string;

  /** The sentence under the pane. CH27.27 requires it in words. */
  hint?: React.ReactNode;
  /** The pane's own way out to the whole page. */
  openLabel?: string;
  /** The list's accessible name. */
  listLabel?: string;
  /** The pane's accessible name. */
  detailLabel?: string;

  /* ---- the three registers ------------------------------------------------ */
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
}

/** The kit's 900 — the width below which there is no split. */
const SPLIT_QUERY = "(min-width: 56.25rem)";

/**
 * A fixed list beside a reading pane.
 *
 * TEN STATES
 *  1. default        — the list at its fixed measure, one row selected, the
 *                      pane beside it, the keyboard line under the pane.
 *  2. hover          — the ROW's, which is `List`'s neutral `--accent` wash.
 *                      A selected row does not change again on hover: it is
 *                      already the loudest row on screen.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Both panes scroll rather than hiding, and both carry
 *                      `scroll-p-1`, so a ring at the edge of a scrolled pane
 *                      is brought into view whole.
 *  4. active/pressed — does not apply as a skin. A press moves the selection,
 *                      and the acknowledgement is the pane changing.
 *  5. disabled       — per record, via `List`: a fill and an ink, and the row
 *                      takes no tab stop that does nothing. The arrow keys
 *                      still step OVER a disabled row rather than onto it.
 *  6. loading        — `loading`: the busy register in place of the whole
 *                      view. Both halves are unknown at once — a list without
 *                      records has no row to select and therefore no pane to
 *                      fill — so half a skeleton would be a lie about which
 *                      half arrived.
 *  7. empty          — no records, or `empty`: the quiet register in place of
 *                      the whole view. CH27.27 forbids the half-empty case
 *                      ("no empty reading pane with 'select a record'"), and
 *                      an empty list beside a full pane is the same fault
 *                      mirrored.
 *  8. error          — `error`: the register with a poppy dot. Beats empty.
 *  9. selected       — ALWAYS exactly one. `List` carries `aria-selected`;
 *                      the FILL is CH19 view 12's own mango, scoped here.
 * 10. read-only      — the view holds no value of its own. A read-only
 *                      collection passes a read-only pane.
 *
 * THREE BREAKPOINTS
 *  · mobile and tablet (base, to 56.25rem — the kit's 900) — THERE IS NO
 *    SPLIT. The list is the whole body at full width, the pane is not
 *    rendered, and a row press calls `onOpen` rather than moving a selection
 *    nobody can see. CH27.27: "Two panes on a phone means neither is
 *    readable, so the view degrades to the pattern people already know." The
 *    keyboard line goes with the pane, because the keys it names do nothing
 *    without one.
 *  · desktop (`min-[56.25rem]:`) — the split: a fixed list column and the pane
 *    beside it, each scrolling on its own.
 *  The threshold is the kit's, not a Tailwind default, so it is written as
 *  one.
 *
 * RTL — LTR only (ruling 10). Every inset is logical, the two panes are grid
 * columns which follow the document, and no rule names a side.
 */
const Split = React.forwardRef<HTMLDivElement, SplitProps>(
  (
    {
      className,
      records,
      selectedId,
      defaultSelectedId,
      onSelectionChange,
      onOpen,
      onEscape,
      detail,
      listFooter,
      listWidth = "18.75rem",
      maxHeight,
      hint = "↑ ↓ moves through the list. Enter opens the full record. Escape returns to the list.",
      openLabel = "Open in full",
      listLabel = "Records",
      detailLabel = "Record",
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing here",
      emptyBody = "Nothing matches what you are looking at right now.",
      errorLabel = "Unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      style,
      ...props
    },
    ref,
  ) => {
    /* One row is always selected, so the uncontrolled start is the first
       record rather than nothing. */
    const [internal, setInternal] = React.useState<string | undefined>(
      defaultSelectedId ?? records[0]?.id,
    );
    const current = selectedId ?? internal;

    /* A record that left the list cannot stay selected, and the pane may not
       be empty: the selection falls back to the first row. */
    const active =
      records.find((record) => record.id === current) ?? records.find((r) => !r.disabled) ?? records[0];

    const select = React.useCallback(
      (record: SplitRecord) => {
        if (selectedId === undefined) setInternal(record.id);
        onSelectionChange?.(record.id, record);
      },
      [selectedId, onSelectionChange],
    );

    /* The split exists or it does not, and that decides what a press means.
       Read at the moment of the press rather than during render: no state, no
       effect, and nothing for the server and the client to disagree about. */
    const isSplit = () =>
      typeof window === "undefined" || window.matchMedia(SPLIT_QUERY).matches;

    const handleRow = (index: number) => {
      const record = records[index];
      if (!record) return;
      if (!isSplit()) {
        // No pane to fill: a press is an open.
        (onOpen ?? (() => select(record)))(record);
        return;
      }
      select(record);
    };

    /* Up and down move the selection over the records that can take it; Enter
       opens; Escape returns. Bound on the view rather than on a row, so the
       keys work from the pane as well — CH27.27 calls the keyboard part of
       the composition, not part of the list. */
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        if (onEscape) {
          event.preventDefault();
          onEscape();
        }
        return;
      }

      if (event.key === "Enter") {
        if (onOpen && active) {
          event.preventDefault();
          onOpen(active);
        }
        return;
      }

      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

      const step = event.key === "ArrowDown" ? 1 : -1;
      const from = records.findIndex((record) => record.id === active?.id);
      for (let i = from + step; i >= 0 && i < records.length; i += step) {
        const candidate = records[i];
        if (candidate.disabled === true) continue;
        event.preventDefault();
        select(candidate);
        return;
      }
    };

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : empty || records.length === 0
          ? "empty"
          : "default";

    if (state !== "default") {
      const register =
        state === "loading"
          ? (loadingState ?? (
              <CollectionRegister tone="busy" eyebrow={loadingLabel} busyLabel={loadingLabel} />
            ))
          : state === "error"
            ? (errorState ?? <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />)
            : (emptyState ?? <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />);

      return (
        <div
          ref={ref}
          data-slot="split"
          data-state={state}
          aria-busy={loading || undefined}
          className={cn("min-w-0", className)}
          {...props}
        >
          {register}
        </div>
      );
    }

    const rows: ListRow[] = records.map((record) => ({
      id: record.id,
      index: record.number,
      title: record.title,
      description: record.meta,
      selected: record.id === active?.id,
      disabled: record.disabled,
    }));

    return (
      <div
        ref={ref}
        data-slot="split"
        data-state="default"
        onKeyDown={handleKeyDown}
        style={{
          ["--split-list" as string]: listWidth,
          ["--split-height" as string]: maxHeight,
          ...style,
        }}
        className={cn(
          // No split until the kit's threshold; the fixed ladder above it.
          /* The two panes are drawn 12 apart: CH19 view 12 is
             `grid-template-columns: 300px 1fr; gap: 12px`. */
          "grid min-w-0 gap-3",
          "[grid-template-columns:minmax(0,1fr)]",
          "min-[56.25rem]:[grid-template-columns:var(--split-list)_minmax(0,1fr)]",
          className,
        )}
        {...props}
      >
        {/* The list. Its own scroll container, so a long record beside it
            cannot push it away. */}
        <div
          data-slot="split-list"
          className={cn(
            "flex min-w-0 flex-col gap-3",
            maxHeight && "overflow-y-auto scroll-p-1 [max-height:var(--split-height)]",
          )}
        >
          {/* THE SELECTED ROW IS MANGO, AND THE KIT NAMES THE COLOUR.
              Sampled off the kit's own render of CH19 view 12: the chosen row
              is `rgb(253,208,105)` — `#FED069` — with the rest at
              `rgb(255,254,249)` on a `rgb(247,242,236)` panel. The mango is
              the mark that says which record the pane beside it is showing.

              WHY IT IS SCOPED HERE AND NOT IN `List`. Override 40 rules the
              SYSTEM's selected wash and rules it `--surface-panel`; `List`,
              `TableRow` and `Card` all take it and none of them may move.
              But that ruling's own amendment records where it under-delivers:
              *"a selected row takes the same `--surface-panel` it is already
              standing on, which is the one place this ruling now
              under-delivers"* — and inside `CollectionFrame`'s soft-paper
              panel that is exactly this row, painting nothing. This view is
              the one place the kit answers the question outright, so the
              answer is applied HERE, at the view that draws it, and the
              system default is left alone for the client to name (override
              40 is logged as still open).

              THE MANGO IS LEGAL. Override 17: "one mango per screen counts
              ACTIONS, not objects … any number of non-interactive marks."
              The one action on this view is the toolbar's `+`; this is
              ruling 30's mark that identifies a record, and there is exactly
              one of them because exactly one row is ever selected.

              THE INK GOES WITH THE FILL. A tertiary charcoal meta line on
              mango is dirt, so the description takes
              `--ink-on-accent-secondary` — the same pair `stat-grid`'s brand
              tile and `tiles`' brand tile already use (override 13). It is a
              solid ink, never an opacity. */}
          <List
            rows={rows}
            variant="panel"
            density="comfortable"
            label={listLabel}
            onRowSelect={(index) => handleRow(index)}
            className={cn(
              "[&_[data-slot=list-row][aria-selected=true]]:bg-surface-brand",
              "[&_[data-slot=list-row][aria-selected=true]]:text-ink-on-accent",
              "[&_[data-slot=list-row][aria-selected=true]_[data-slot=list-description]]:text-ink-on-accent-secondary",
              "[&_[data-slot=list-row][aria-selected=true]_[data-slot=list-index]]:text-ink-on-accent-secondary",
            )}
          />
          {listFooter}
        </div>

        {/* The pane. Not rendered at all below the threshold — `hidden` rather
            than unmounted, so the caller's node keeps its own state when the
            window crosses back over. */}
        <div
          data-slot="split-detail"
          aria-label={detailLabel}
          className={cn(
            "hidden min-w-0 flex-col gap-3 min-[56.25rem]:flex",
            maxHeight && "overflow-y-auto scroll-p-1 [max-height:var(--split-height)]",
          )}
        >
          {detail}

          {/* The keyboard line, in words, and the way out to the whole page. */}
          {hint !== undefined && hint !== null ? (
            <div className="flex flex-wrap items-center gap-3 pt-[var(--space-3h)] shadow-[var(--hairline-over)]">
              <span className="min-w-0 text-caption text-ink-tertiary">{hint}</span>
              {onOpen && active ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="ms-auto"
                  onClick={() => onOpen(active)}
                >
                  {openLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);

Split.displayName = "Split";

export { Split };
