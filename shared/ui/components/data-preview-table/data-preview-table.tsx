/* ============================================================================
   DataPreviewTable — imported rows before they are committed.

   DESIGN SOURCE
   No new drawing. This is `DataTable` with three additions, and every one of
   the three is a mark the kit already draws:

     the table itself            — `DataTable`, which is `Table` / `Checkbox` /
                                   `Pagination` / `SortControl` / `Skeleton` /
                                   `useVirtualRows` assembled
     a row's outcome             — `Badge`, the kit's `.kw-badge` family
     a cell's problem            — chapter 9's message, drawn once in
                                   `field.tsx`: a small poppy dot leading INK
                                   words. Never poppy words.
     the head's source line      — `.kw-list__meta` / `.kw-comment__time`, the
                                   badge step in tertiary ink

   THE LAW THIS FILE OBEYS
   · A PROPOSAL IS NOT AN ACTION. The kit's ruling 33 in its own words:
     "Where the system guesses … the guess is shown with a confidence per
     field, the unsure ones are surfaced first, and nothing is written until a
     person presses Approve." This component is the SHOWING. It commits
     nothing and it owns no submit control; the wizard around it does.
   · A BAD ROW IS NOT A POPPY ROW. `table.tsx` state 8 rules it: "a row whose
     record failed says so in a cell, with a Badge — colour is the whole
     treatment and it belongs on the pill, not smeared across the row." So an
     invalid row keeps its paper and carries a `Badge variant="destructive"`.
   · THE MESSAGE IS INK, NEVER POPPY. Chapter 9, and `field.tsx` already draws
     the mark: a 6 poppy dot and ink words. The same drawing is used for a
     cell's problem so the two never diverge.
   · SOURCE ORDER IS THE DEFAULT ORDER, AND IT IS NOT SORTABLE BY DEFAULT. A
     preview exists so a reader can match what is on the screen to what is in
     the file they handed over. Re-ordering it silently breaks that. A column
     may opt in with `sortable`, and then the caller owns the consequence.
   · Disabled is a fill and an ink. An excluded row is `TableRow disabled` by
     way of `DataTable`'s `isRowDisabled` — no opacity anywhere.
   · Focus is ONE global rule (tokens.css §8). Nothing here rings.
   · Every user-facing string is a prop with a default, including every one of
     the five outcome words.
   · No product vocabulary (commission §11). Rows, columns, sources, outcomes.

   THE FIVE OUTCOMES, AND WHY EACH TAKES THE COLOUR IT TAKES
   The kit names no set of import outcomes at all (GAPS-COL2 DPT-1), so the
   mapping is reasoned from the palette's own meanings rather than picked:
     unchanged — quiet. Nothing will happen to this row; it is the baseline.
     added     — `info`, sky. The kit's informational tone: a fact, not a
                 success. Forest would claim the row had already landed.
     changed   — `warning`. Per the batch ruling `--warning` is the QUIET chip
                 and poppy means blocked only; a changed row is the one to
                 look at, not the one that is broken.
     invalid   — `destructive`, poppy. Blocked: this row cannot be written.
     skipped   — `outline`. The one uncoloured variant, and so the only one
                 that may carry a hairline. A row that takes no part in the
                 commit should take no colour either.

   RENDERING CONTEXT
   `"use client"`. It renders `DataTable`, which is a client module, and it
   creates handlers during its own render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../badge/badge";
import { DataTable, type DataTableColumn } from "../data-table/data-table";

/* ============================================================================
   Outcomes
   ========================================================================= */

/** What will happen to a row when the batch is committed. */
export type DataPreviewOutcome = "unchanged" | "added" | "changed" | "invalid" | "skipped";

const OUTCOME_ORDER: readonly DataPreviewOutcome[] = [
  "invalid",
  "changed",
  "added",
  "skipped",
  "unchanged",
] as const;

/** Reasoned in the file header; the kit names no outcome set (GAPS-COL2 DPT-1). */
const OUTCOME_VARIANT: Record<
  DataPreviewOutcome,
  "secondary" | "info" | "warning" | "destructive" | "outline"
> = {
  unchanged: "secondary",
  added: "info",
  changed: "warning",
  invalid: "destructive",
  skipped: "outline",
};

/* ============================================================================
   Rows and columns
   ========================================================================= */

export interface DataPreviewColumn {
  /** Stable key. The key `row.values` and `row.issues` are read with. */
  key: string;
  /** The column this row will be written into, in words. */
  header: React.ReactNode;
  /**
   * The column it came FROM in the source — the spreadsheet heading, the
   * field name in the file. Drawn as a quiet second line under the header,
   * because "which of my columns became this one" is the single question a
   * preview exists to answer. Omit it for a column the system derived itself.
   */
  source?: React.ReactNode;
  /**
   * The system GUESSED this mapping and is not sure. Ruling 33 asks for "a
   * confidence per field, the unsure ones surfaced first"; this is the flag
   * that lets the wizard around this table surface them. Drawn as a quiet
   * `Badge` beside the source line — words, never a colour alone.
   */
  unsure?: boolean;
  /** `end` for a column of numbers. Passed straight through to `DataTable`. */
  align?: "start" | "end";
  /** A measure for this column, in rem. */
  width?: string;
  /** This column may re-order the table. Off by default — see the law block. */
  sortable?: boolean;
  /**
   * Draw the value yourself, for a column whose value is a mark rather than
   * text. Given one, `row.values[key]` is ignored. The cell's PROBLEM is
   * still drawn under whatever this returns.
   */
  cell?: (row: DataPreviewRow, index: number) => React.ReactNode;
}

export interface DataPreviewRow {
  /** Stable id. The React key, and the value inclusion is kept in. */
  id: string;
  /** The values, keyed by column key. A node, so a chip or a link may ride along. */
  values?: Record<string, React.ReactNode>;
  /**
   * What is wrong with one cell, keyed by column key. Drawn as chapter 9's
   * message — a 6 poppy dot and INK words — under the value it belongs to.
   */
  issues?: Record<string, React.ReactNode>;
  /** What will happen to this row. Defaults to `unchanged`. */
  outcome?: DataPreviewOutcome;
  /**
   * A problem with the whole row rather than one cell — a missing key, a
   * duplicate. Drawn under the outcome pill, in the same ink-and-dot message.
   */
  issue?: React.ReactNode;
  /**
   * Where this row came from in the source: a line number, a sheet and cell
   * reference. Drawn in the leading column, tabular, so a reader can go and
   * look. A node, because "row 12" is a sentence and sentences are localised
   * at the call site, where the data is.
   */
  origin?: React.ReactNode;
}

/* ----------------------------------------------------------------------------
   Chapter 9's message, transcribed. `field.tsx` draws exactly this mark and
   keeps the kit's drawn 6 rather than snapping to the 7 of `--dot-status`
   (t9-gaps T9-7); the same figure is kept here so the two cannot diverge.
   ------------------------------------------------------------------------- */
function Problem({ children }: { children: React.ReactNode }) {
  return (
    <span
      data-slot="data-preview-problem"
      className="mt-1 flex items-center gap-2 text-badge text-foreground"
    >
      <span
        aria-hidden="true"
        className="size-[0.375rem] shrink-0 rounded-pill bg-destructive"
      />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/* ============================================================================
   DataPreviewTable
   ========================================================================= */

export interface DataPreviewTableProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The columns the batch will be written into, in the order they should read. */
  columns: DataPreviewColumn[];
  /** The rows, in SOURCE order. This component never re-orders them itself. */
  rows: DataPreviewRow[];

  /** Draw the leading column of origins. On by default: it is why a preview is readable. */
  showOrigin?: boolean;
  /** The origin column's heading. */
  originLabel?: string;
  /** Draw the outcome column. On by default; it is the whole point of a preview. */
  showOutcome?: boolean;
  /** The outcome column's heading. */
  outcomeLabel?: string;
  /** The five outcome words. Every one is overridable; every one has a default. */
  outcomeLabels?: Partial<Record<DataPreviewOutcome, string>>;
  /** The chip beside an unsure column's source line. */
  unsureLabel?: string;

  /* ---- inclusion ---------------------------------------------------------- */
  /**
   * Rows may be taken out of the batch before it is committed. Draws
   * `DataTable`'s checkbox column, with EVERY row included to start with —
   * a preview whose rows all began excluded would need clearing before it
   * could be used.
   */
  selectable?: boolean;
  /** Controlled: the ids that WILL be committed. */
  includedIds?: readonly string[];
  /** Uncontrolled starting set. Left off, every row is included. */
  defaultIncludedIds?: readonly string[];
  /** The set changed. Called with the whole new list of included ids. */
  onIncludedChange?: (ids: string[]) => void;
  /**
   * An invalid row may not be included. Default `true`: ruling 33 says
   * nothing is written until a person approves it, and approving a row the
   * system already knows will fail is not an approval, it is a trap.
   */
  lockInvalid?: boolean;
  /** The select-all checkbox's name. */
  selectAllLabel?: string;
  /** One row's checkbox name. Given the row, so it can name the record. */
  getRowSelectLabel?: (row: DataPreviewRow, index: number) => string;

  /* ---- the summary strip -------------------------------------------------- */
  /**
   * Draw the count-per-outcome strip above the table. On by default: it is
   * the sentence a reader needs before they read a single row, and it is the
   * only part of a long preview that fits on a phone.
   */
  showSummary?: boolean;
  /** Turns one outcome's count into its chip. Both numbers go through the runtime's own numerals. */
  formatSummary?: (outcome: DataPreviewOutcome, count: number, label: string) => React.ReactNode;
  /** The summary strip's accessible name. */
  summaryLabel?: string;

  /* ---- the frame ---------------------------------------------------------- */
  /** Bound the height so the table scrolls inside itself. rem only. */
  maxHeight?: string;
  /** Pin the header while the rows scroll. On by default when `maxHeight` is set. */
  stickyHeader?: boolean;
  /** A width below which the table overflows and scrolls. Passed to `Table`. */
  minWidth?: string;
  /** The table's own name, below the data. */
  caption?: React.ReactNode;
  /** The table's accessible name, when there is no visible caption. */
  label?: string;

  /* ---- the three states --------------------------------------------------- */
  /** The rows are still being read out of the source. Skeleton rows, header kept. */
  loading?: boolean;
  /** How many placeholder rows to draw while `loading`. */
  loadingRows?: number;
  /** The source could not be read at all. CH21's register replaces the body. */
  error?: boolean;
  /** The register's eyebrow. Ruling 26: the poppy dot never speaks alone. */
  errorEyebrow?: string;
  /** The register's title line. */
  errorTitle?: string;
  /** The register's sentence. */
  errorBody?: React.ReactNode;
  /** The register's one next step — usually `Button variant="secondary"` (T21-3). */
  errorAction?: React.ReactNode;
  /** The words when the source was read and held nothing. */
  emptyLabel?: string;
  /** A control under the empty words — "choose another file". */
  emptyAction?: React.ReactNode;
}

const DEFAULT_OUTCOME_LABELS: Record<DataPreviewOutcome, string> = {
  unchanged: "Unchanged",
  added: "Will be added",
  changed: "Will change",
  invalid: "Cannot be written",
  skipped: "Skipped",
};

/**
 * The batch, as it will be written, before it is written.
 *
 * TEN STATES
 *  1. default        — the summary strip, then the table: an origin column, a
 *                      column per mapped field with its source named under the
 *                      heading, and the outcome pill at the end.
 *  2. hover          — `bg-accent` on the row, inherited from `TableRow`. The
 *                      kit's neutral wash; never mango, never an opacity.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      This file adds none and hides none; the scroll shell is
 *                      `DataTable`'s and carries `scroll-p-1`.
 *  4. active/pressed — the controls': a checkbox's press IS its state change.
 *                      A row is not pressed — a preview row navigates nowhere.
 *  5. disabled       — an EXCLUDED row, and an invalid one when `lockInvalid`:
 *                      `TableRow disabled`, which is `--btn-disabled-fill` /
 *                      `--btn-disabled-label` with the hover dropped, plus
 *                      `aria-disabled`. A fill and an ink. It still READS —
 *                      an unavailable row is still a row, and the reader has
 *                      to be able to see what they are leaving behind.
 *  6. loading        — `loading`: skeleton rows, the header and the column
 *                      mapping kept, `aria-busy`, the summary strip withdrawn
 *                      (a count of nothing is not a count) and the empty
 *                      register suppressed.
 *  7. empty          — the source was read and held no rows: `.kw-empty`, the
 *                      centred register, inside one full-width cell with the
 *                      header still above it. Never a skeleton.
 *  8. error          — TWO tiers, deliberately separate. A CELL's problem is
 *                      chapter 9's message under the value — a 6 poppy dot and
 *                      ink words. A ROW's problem is the same message under
 *                      its outcome pill. The SOURCE failing to load is
 *                      CH21's `.kw-register` instead of the body. A whole row
 *                      is never filled poppy: colour belongs on the pill.
 *  9. selected       — a row that will be committed: `TableRow selected`
 *                      (`--surface-panel`) and its `Checkbox`, both channels,
 *                      because colour alone must never carry a meaning. The
 *                      header checkbox goes `indeterminate` on a partial set.
 * 10. read-only      — ALWAYS for the values. Nothing in this table can be
 *                      edited; the only thing a reader may change is whether a
 *                      row takes part. Correcting a value is the source's job
 *                      or the wizard's mapping step, and either way it is a
 *                      `Form`, not a grid of live inputs.
 *
 * THREE BREAKPOINTS
 *  mobile   — the SUMMARY STRIP is the mobile answer, and it is why it exists.
 *             The table itself scrolls on the inline axis inside its own shell
 *             (`table.tsx`'s ruling, inherited through `DataTable`): it does
 *             not restack into cards and it does not drop a column, because a
 *             preview that hides a column is hiding exactly the thing the
 *             reader came to check. What a phone gets INSTEAD of the whole
 *             grid at a glance is the strip of counts above it, which wraps
 *             and stays readable at 320.
 *  tablet   — the same table, usually with less to scroll. The strip stays: it
 *             is a summary, not a fallback.
 *  desktop  — UNCHANGED. The row is 56 at all three widths and no column is
 *             added or removed at any of them.
 *
 * RTL — safe. Every inset is logical, the outcome pill is at the DOM end
 * rather than at a named side, and the origin column is the first child so it
 * leads in Arabic, Urdu and Persian as it does in English.
 */
const DataPreviewTable = React.forwardRef<HTMLDivElement, DataPreviewTableProps>(
  (
    {
      className,
      columns,
      rows,
      showOrigin = true,
      originLabel = "Source",
      showOutcome = true,
      outcomeLabel = "Outcome",
      outcomeLabels,
      unsureLabel = "Guessed",
      selectable = false,
      includedIds,
      defaultIncludedIds,
      onIncludedChange,
      lockInvalid = true,
      selectAllLabel = "Include every row",
      getRowSelectLabel,
      showSummary = true,
      formatSummary,
      summaryLabel = "What this batch will do",
      maxHeight,
      stickyHeader,
      minWidth,
      caption,
      label,
      loading = false,
      loadingRows = 6,
      error = false,
      errorEyebrow = "Load failed",
      errorTitle = "This source could not be read",
      errorBody,
      errorAction,
      emptyLabel = "This source holds no rows",
      emptyAction,
      ...props
    },
    ref,
  ) => {
    /* Memoised, not rebuilt each render: it is a dependency of the column
       list below, and a fresh object every render would rebuild every column. */
    const words = React.useMemo(
      () => ({ ...DEFAULT_OUTCOME_LABELS, ...outcomeLabels }),
      [outcomeLabels],
    );

    /* Every row is in to start with. A preview that began with everything
       excluded would have to be cleared before it could be used, which is the
       opposite of what a reader means by "preview". */
    const allIds = React.useMemo(() => rows.map((row) => row.id), [rows]);
    const startingSet = defaultIncludedIds ?? allIds;

    const counts = React.useMemo(() => {
      const tally = new Map<DataPreviewOutcome, number>();
      for (const row of rows) {
        const outcome = row.outcome ?? "unchanged";
        tally.set(outcome, (tally.get(outcome) ?? 0) + 1);
      }
      return tally;
    }, [rows]);

    const tableColumns = React.useMemo<Array<DataTableColumn<DataPreviewRow>>>(() => {
      const built: Array<DataTableColumn<DataPreviewRow>> = [];

      if (showOrigin) {
        built.push({
          key: "__origin",
          header: originLabel,
          headerLabel: originLabel,
          cell: (row) =>
            row.origin === undefined ? null : (
              <span className="tabular-nums text-ink-tertiary">{row.origin}</span>
            ),
        });
      }

      for (const column of columns) {
        built.push({
          key: column.key,
          align: column.align,
          width: column.width,
          sortable: column.sortable,
          headerLabel:
            typeof column.header === "string" ? column.header : undefined,
          header: (
            /* The heading, and under it the source it was mapped from. The
               second line resets the header cell's UPPERCASE and micro step —
               it is a value from the reader's own file, not an eyebrow, and
               shouting a filename back at someone is not a design. */
            <span className="flex flex-col items-start gap-1">
              <span>{column.header}</span>
              {column.source !== undefined || column.unsure === true ? (
                <span className="flex items-center gap-2 text-badge normal-case text-ink-tertiary">
                  {column.source !== undefined ? (
                    <span className="min-w-0">{column.source}</span>
                  ) : null}
                  {column.unsure === true ? <Badge>{unsureLabel}</Badge> : null}
                </span>
              ) : null}
            </span>
          ),
          cell: (row, index) => {
            const value = column.cell ? column.cell(row, index) : row.values?.[column.key];
            const issue = row.issues?.[column.key];
            if (issue === undefined || issue === null) return value;
            return (
              <span className="flex min-w-0 flex-col">
                <span className="min-w-0">{value}</span>
                <Problem>{issue}</Problem>
              </span>
            );
          },
        });
      }

      if (showOutcome) {
        built.push({
          key: "__outcome",
          header: outcomeLabel,
          headerLabel: outcomeLabel,
          cell: (row) => {
            const outcome = row.outcome ?? "unchanged";
            return (
              <span className="flex min-w-0 flex-col items-start">
                <Badge variant={OUTCOME_VARIANT[outcome]}>{words[outcome]}</Badge>
                {row.issue !== undefined && row.issue !== null ? (
                  <Problem>{row.issue}</Problem>
                ) : null}
              </span>
            );
          },
        });
      }

      return built;
    }, [columns, showOrigin, originLabel, showOutcome, outcomeLabel, unsureLabel, words]);

    const summary = OUTCOME_ORDER.filter((outcome) => (counts.get(outcome) ?? 0) > 0);

    return (
      <div
        ref={ref}
        data-slot="data-preview-table"
        className={cn("flex min-w-0 flex-col gap-4", className)}
        {...props}
      >
        {showSummary && !loading && !error && summary.length > 0 ? (
          <ul
            data-slot="data-preview-summary"
            aria-label={summaryLabel}
            className="flex flex-wrap items-center gap-2"
          >
            {summary.map((outcome) => {
              const count = counts.get(outcome) ?? 0;
              return (
                <li key={outcome}>
                  {formatSummary !== undefined ? (
                    formatSummary(outcome, count, words[outcome])
                  ) : (
                    /* Digits from the runtime's own numbering system, and the
                       words beside them from a prop — so the chip carries no
                       untranslatable string and no invented separator. */
                    <Badge variant={OUTCOME_VARIANT[outcome]} className="gap-1">
                      <span className="tabular-nums">{plainNumber(count)}</span>
                      <span>{words[outcome]}</span>
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        <DataTable<DataPreviewRow>
          columns={tableColumns}
          rows={rows}
          getRowId={(row) => row.id}
          /* Source order is the order. See the law block. */
          showSortControl={false}
          selectable={selectable}
          selectedIds={includedIds}
          defaultSelectedIds={startingSet}
          onSelectionChange={onIncludedChange}
          isRowSelectable={(row) => !(lockInvalid && (row.outcome ?? "unchanged") === "invalid")}
          isRowDisabled={(row) =>
            (row.outcome ?? "unchanged") === "skipped" ||
            (lockInvalid && (row.outcome ?? "unchanged") === "invalid")
          }
          selectAllLabel={selectAllLabel}
          getRowSelectLabel={getRowSelectLabel}
          stickyHeader={stickyHeader ?? maxHeight !== undefined}
          maxHeight={maxHeight}
          minWidth={minWidth}
          caption={caption}
          label={label}
          loading={loading}
          loadingRows={loadingRows}
          error={error}
          errorEyebrow={errorEyebrow}
          errorTitle={errorTitle}
          errorBody={errorBody}
          errorAction={errorAction}
          emptyLabel={emptyLabel}
          emptyAction={emptyAction}
        />
      </div>
    );
  },
);

/** One number in the runtime's own numbering system, ungrouped. */
function plainNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { useGrouping: false }).format(value);
}

DataPreviewTable.displayName = "DataPreviewTable";

export { DataPreviewTable };
