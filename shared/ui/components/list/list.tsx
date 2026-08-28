/* ============================================================================
   List — the primary collection row (7 direct call sites).

   DESIGN SOURCE
   Two drawings, both the kit's, and neither is a skin of the other:

     · design-mothership/specimens/kwapso-ui.css → `.kw-list`, `.kw-list__item`,
       `.kw-list__well`, `.kw-list__body`, `.kw-list__title`, `.kw-list__meta`
       — a flex column of rows, each `--space-4`/`--space-5` inset at
       `--radius-card`, hovering to a paper tone; a 32 pill "well" holding a
       mark; the title at `--text-body-s`/`--weight-strong` and the meta at
       `--text-caption`/`--ink-tertiary`. That is `variant="rows"`.

     · "Kwapso UI Kit.dc.html" → chapter 17 "Tables & lists", the two
       specimens headed "List rows — comfortable" and "List rows — compact",
       inside a `--card` box at radius 24 with `inset 0 -1px 0 var(--hair)`
       under every row but the last. That is `variant="panel"`, the default.

   Chapter 17's own spec line is quoted verbatim because it settles three
   numbers at once:

       "Header 11px/500 uppercase · rows 56px comfortable / 44px compact ·
        8% hairline under each row · first column is always the record name ·
        row action pinned right"

   THE LAW THIS FILE OBEYS
   · THE ROW IS 56 COMFORTABLE, 44 COMPACT. `--control-height-row` and
     `--control-height-input`, both kit-stated, both fixed at every width.
     They are minimums, not clips: a wrapped title grows the row.
   · The hairline under a row is the 8% one (`--border`), not the heavy
     `--hair-strong` — that weight is a SECTION rule and belongs to `Title`
     and to a table's header. The last row drops its rule, so a list never
     ends on a line separating it from nothing.
   · Hover is `--accent`, the neutral row wash, timed by
     motion.css `.motion-row-hover`. NEVER `--primary`: mango is a brand
     fill, and a hovered list would otherwise go mango row by row. The kit's
     own `.kw-list__item:hover` names `--surface-panel`, which is a different
     answer — see GAPS-COL3 LST-2 for why `--accent` was taken instead.
   · Selected is `--surface-selected` (override 44; `--surface-panel` until
     the K1 reversal put that paper under the rows), exactly as `TableRow`
     resolves it, and it does not change again on hover: it is already the
     loudest row on screen.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label`) with the hover dropped, never an opacity.
   · The exclusive states are resolved in JS and emitted as ONE class set
     (PATTERN §4). Precedence: disabled > selected > default.
   · The mark is `Avatar` and the counts are `Badge`. Neither is redrawn
     here — the well is `Avatar variant="quiet"`, which is the same hairline
     fill `.kw-list__well` names.
   · Only four radii. Focus is one global rule (tokens.css §8).

   RENDERING CONTEXT
   `"use client"`. A pressable row means this module builds an event handler
   during its own render, and `Avatar` is Radix-shaped underneath.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar/avatar";
import { Badge } from "../badge/badge";
import { ScreenRegister } from "../screen-renderer/screen-renderer";

/** 56 comfortable, 44 compact. Chapter 17 states both. */
export type ListDensity = "comfortable" | "compact";

/** A card of hairline-separated rows, standalone rows on the page, or a
    column of SEPARATE cards — CH19 view 12's list, each row its own `--card`
    block at radius 24 with air between them (GAPS-KIT-DE L19-5, closed on
    the client's re-audit 2026-08-26). */
export type ListVariant = "panel" | "rows" | "cards";

export interface ListRow {
  /** Stable key, and the value handed to `onRowSelect`. Falls back to the index. */
  id?: string;
  /**
   * The record's name. Chapter 17: "first column is always the record name",
   * at `--weight-strong`.
   */
  title: React.ReactNode;
  /** The quiet line under it — what the record is, in a few words. */
  description?: React.ReactNode;
  /** The trailing value: a week, a time, a state. Quiet, tabular, at the end. */
  meta?: React.ReactNode;
  /**
   * The compact row's leading index — chapter 17 draws "01", "02", tabular,
   * in the faintest ink, at a fixed width so the titles line up.
   */
  index?: React.ReactNode;
  /** Initials for the leading mark. Two characters; `Avatar` truncates. */
  initials?: React.ReactNode;
  /** A photograph for the mark. Falls back to `initials` when it fails. */
  image?: string;
  /** Alt text for `image`. Empty is correct when the title repeats the name. */
  imageAlt?: string;
  /** An icon or any node in the well instead of initials. */
  mark?: React.ReactNode;
  /** A count at the inline end. Zero and undefined render nothing. */
  count?: number;
  /** A `Badge`, a `Button`, an overflow menu — pinned to the inline end. */
  action?: React.ReactNode;
  /** Chosen. `--surface-selected` (override 44), and no hover on top of it. */
  selected?: boolean;
  /** Cannot be acted on. A fill and an ink; the row still reads. */
  disabled?: boolean;
  /** The row has just arrived — motion.css `.motion-row-enter`. */
  entering?: boolean;
  /** The row is leaving — motion.css `.motion-row-exit`. */
  exiting?: boolean;
}

/* ----------------------------------------------------------------------------
   The three exclusive row skins, composed in JS.

   `data-[state=selected]:bg-x`, `[aria-disabled]:bg-y` and `hover:bg-z` carry
   identical specificity, so which one paints would be decided by Tailwind's
   emission order — which a component may not depend on (PATTERN §4).
   Precedence, written down once:  disabled > selected > default.
   ------------------------------------------------------------------------- */
const ROW_DEFAULT = "motion-row-hover";
const ROW_DEFAULT_INTERACTIVE = "motion-row-hover cursor-pointer hover:bg-accent";
/* OVERRIDE 44 (2026-08-23) — the selected paper is its own token now.
   Override 40 pointed this at `--surface-panel`. The K1 reversal then moved
   the papers underneath it: a row now sits INSIDE a soft-paper panel, so the
   "selected" wash painted the row the paper it was already standing on and
   measured 1.000. `--surface-selected` is the paper one rung further from the
   page than the panel -- #EFE6DD in light, --kw-unlit-quiet in dark. Still
   ONE answer for a chosen record: `TableRow`, `List`, `map`'s list row and
   `Card` all take this exact string. */
/* OVERRIDE 77 (2026-08-27, the client's D15-B) — override 44 is OVERTURNED:
   the selected paper is the lift the artifact drew. The string below is
   unchanged on purpose (one answer for a chosen record survives), but
   `--surface-selected` now points at `--surface-raised`, so the values in
   the note above are history. A selected row still separates inside the
   soft-paper panel (1.103 light / 1.111 dark against its unselected
   neighbour) and now reads 1.000 against the off-beige body pane in light
   — chosen from the drawing, which printed that figure. Register row 77. */
const ROW_SELECTED = "bg-surface-selected";
const ROW_DISABLED =
  "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]";

const ROW_GEOMETRY: Record<ListDensity, string> = {
  /* `.kw-list__item` / ch17 comfortable: 14 between parts, 16 block and 18
     inline inset, a 56 floor. */
  comfortable: "gap-[var(--space-3h)] px-[var(--space-4h)] py-4 min-h-[var(--control-height-row)]",
  /* ch17 compact: 12 between parts, 10 block and 16 inline inset, a 44 floor. */
  compact: "gap-3 px-4 py-[var(--space-2h)] min-h-[var(--control-height-input)]",
};

const TITLE_TYPE: Record<ListDensity, string> = {
  /* `.kw-list__title` — the body-s step at weight 500. */
  comfortable: "text-sm font-[var(--font-weight-medium)]",
  /* ch17's compact row runs at the caption step and at the normal weight:
     a compact list is a log, and a log of bold lines is unreadable. */
  compact: "text-caption",
};

export interface ListProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The rows, in order. An empty array draws the empty register. */
  rows: readonly ListRow[];
  /** `panel` is chapter 17's card of hairline-separated rows — the default.
      `rows` is the bare column. `cards` is CH19 view 12's list: every row
      its own `--card` block (`border-radius: 24px; padding: 11px 14px`,
      title 13, meta 11) with the drawn 4 of air between rows. */
  variant?: ListVariant;
  /** 56 or 44. Chapter 17 states both and nothing between them. */
  density?: ListDensity;
  /**
   * Pressing a row opens it. Absent, the rows render as plain blocks: a
   * control that silently does nothing is worse than a label.
   */
  onRowSelect?: (index: number, row: ListRow) => void;
  /** Nothing may be pressed. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /** Which body is drawn — the list's own three states. */
  state?: "ready" | "loading" | "empty" | "error";
  /** The list's accessible name. Defaulted so no call site ships a nameless list. */
  label?: string;
  /** How many skeleton lines the loading body draws. ch24.4's range is 2–5. */
  loadingLines?: number;
  /** What a screen reader hears while the list is loading. */
  loadingLabel?: string;
  /** The empty register's sentence. Undefined draws the mark alone. */
  emptyTitle?: React.ReactNode;
  /** The line under it, at the 40ch measure. */
  emptyDescription?: React.ReactNode;
  /** The one next step, where the list is a collection nobody has filled yet. */
  emptyAction?: React.ReactNode;
  /** The error register's sentence. */
  errorTitle?: React.ReactNode;
  /** The line under it. */
  errorDescription?: React.ReactNode;
  /** The retry. */
  errorAction?: React.ReactNode;
}

/**
 * The system's collection row.
 *
 * TEN STATES
 *  1. default        — a row per record at the density's geometry, on the 8%
 *                      hairline, the last one without it.
 *  2. hover          — `bg-accent`, the neutral wash, timed by
 *                      `.motion-row-hover`. Only on a row that is pressable
 *                      and neither selected nor disabled; the precedence is
 *                      resolved in JS so there is no race to lose. A list
 *                      that is not pressable has no hover at all, because a
 *                      page of reacting rows that go nowhere is noise.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the row's own radius. Nothing here clips it: the
 *                      `panel` shell keeps `overflow-hidden` OFF and clips
 *                      its corners with the rows' own radius instead — see
 *                      the note at the shell.
 *  4. active/pressed — does not apply as a skin. Pressing a row navigates,
 *                      and the acknowledgement is the destination arriving.
 *                      The kit draws no pressed list row (GAPS-COL3 LST-4).
 *  5. disabled       — per row, or the whole list: `--btn-disabled-fill` /
 *                      `--btn-disabled-label`, `aria-disabled`, no hover, and
 *                      the row is a block rather than a button so there is no
 *                      tab stop that does nothing.
 *  6. loading        — `state="loading"`: the ROWS are replaced with skeleton
 *                      lines and the shell stays, so the page does not jump
 *                      when the records land. ch24.4: "Never a spinner where
 *                      a shape is known."
 *  7. empty          — `state="empty"`, or `rows: []`, draws chapter 21's
 *                      register inside the shell. A list with no rows and no
 *                      register renders `null` rather than an empty box.
 *  8. error          — `state="error"`: the register in its error tone,
 *                      `role="alert"`. Never a poppy row: colour belongs on
 *                      the pill in the row, not smeared across it.
 *  9. selected       — `--surface-selected` and `aria-selected`, and it does not
 *                      change again on hover.
 * 10. read-only      — always. A list shows values; it never edits one. An
 *                      editable row is `data-table`'s job.
 *
 * THREE BREAKPOINTS
 *  mobile   — the row keeps its height and its parts. The TITLE COLUMN
 *             shrinks and truncates (`min-w-0` + `truncate`), the trailing
 *             meta and action stay whole. That is the right sacrifice: a
 *             record's name can be cut and still recognised, whereas a
 *             half-visible state pill or a cut-off action is useless. The
 *             row never restacks into two lines, because a two-line row at
 *             44 or 56 either overflows its own height or abandons a stated
 *             number, and both are worse than a truncated name.
 *  tablet   — unchanged.
 *  desktop  — unchanged. The kit states one geometry per density at every
 *             width; the list fills the column its parent gives it.
 *
 * RTL — safe. Every inset is `px-*`/`py-*`, the trailing group is pushed with
 * `ms-auto` (margin-inline-start), the leading mark is first in DOM order and
 * therefore at the reading start in Arabic, Urdu and Persian, and no rule in
 * this file names a physical side.
 */
const List = React.forwardRef<HTMLDivElement, ListProps>(
  (
    {
      className,
      rows,
      variant = "panel",
      density = "comfortable",
      onRowSelect,
      disabled = false,
      state = "ready",
      label = "Records",
      loadingLines = 5,
      loadingLabel = "Loading…",
      emptyTitle,
      emptyDescription,
      emptyAction,
      errorTitle,
      errorDescription,
      errorAction,
      ...props
    },
    ref,
  ) => {
    const pressable = Boolean(onRowSelect) && !disabled;

    /* An empty array IS the empty state, so a call site cannot render a box
       with nothing in it by forgetting to set `state`. */
    const resolved = state === "ready" && rows.length === 0 ? "empty" : state;

    /* The `panel` shell is chapter 17's card: `--card` at radius 24. It does
       NOT set `overflow: hidden` — that would shave the global focus ring off
       the first and last row. The rows' own corners are rounded instead, so
       the fill still stops at the shell's radius. */
    const shell =
      variant === "panel"
        ? "rounded-[var(--radius)] bg-card"
        : variant === "cards"
          ? // CH19 view 12: separate cards, the drawn 4 of air between them.
            "gap-1"
          : // `.kw-list` — a plain column; each row carries its own radius.
            "";

    if (resolved !== "ready") {
      const register =
        resolved === "loading" ? (
          <ScreenRegister
            tone="loading"
            lines={loadingLines}
            loadingLabel={loadingLabel}
            className="p-[var(--space-4h)]"
          />
        ) : resolved === "error" ? (
          <ScreenRegister
            tone="error"
            title={errorTitle}
            description={errorDescription}
            action={errorAction}
          />
        ) : (
          <ScreenRegister
            tone="empty"
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        );

      // Nothing to say and nothing to show: render nothing at all.
      if (register === null) return null;

      return (
        <div
          ref={ref}
          data-slot="list"
          data-state={resolved}
          data-variant={variant}
          data-density={density}
          className={cn("flex w-full flex-col", shell, className)}
          {...props}
        >
          {register}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="list"
        data-state="ready"
        data-variant={variant}
        data-density={density}
        role="list"
        aria-label={label}
        className={cn("flex w-full flex-col", shell, className)}
        {...props}
      >
        {rows.map((row, index) => {
          const rowDisabled = disabled || row.disabled === true;
          const rowState = rowDisabled
            ? "disabled"
            : row.selected === true
              ? "selected"
              : "default";
          const rowPressable = pressable && !rowDisabled;

          const hasMark =
            row.mark !== undefined || row.initials !== undefined || row.image !== undefined;

          const inner = (
            <>
              {/* The compact row's index: fixed width so titles align.
                  CH17 draws it `color: var(--fg4)`, which is TERTIARY — see
                  the note in `chat.tsx`. It is a row number a person reads,
                  not a switched-off control. */}
              {row.index !== undefined ? (
                <span
                  data-slot="list-index"
                  className="w-[var(--control-height-pill)] flex-none tabular-nums text-ink-tertiary"
                >
                  {row.index}
                </span>
              ) : null}

              {/* `.kw-list__well` — a 32 pill holding a mark. `Avatar` owns
                  the drawing; `variant="quiet"` is the hairline fill the
                  well names, and `shape="pill"` its radius. */}
              {hasMark ? (
                <Avatar size="md" variant="quiet" className="flex-none">
                  {row.image ? (
                    <AvatarImage src={row.image} alt={row.imageAlt ?? ""} />
                  ) : null}
                  <AvatarFallback>{row.mark ?? row.initials}</AvatarFallback>
                </Avatar>
              ) : null}

              {/* `.kw-list__body` — flex 1, min-width 0, so a long name
                  truncates instead of pushing the trailing group out. */}
              <span data-slot="list-body" className="flex min-w-0 flex-1 flex-col">
                <span
                  data-slot="list-title"
                  className={cn(
                    "truncate",
                    variant === "cards"
                      ? /* CH19 view 12: title 13; only the CHOSEN row's
                           title carries 500 (`s.weight`). */
                        cn(
                          "text-caption",
                          rowState === "selected" && "font-[var(--font-weight-medium)]",
                        )
                      : TITLE_TYPE[density],
                  )}
                >
                  {row.title}
                </span>
                {row.description !== undefined && row.description !== null ? (
                  /* `.kw-list__meta` — the caption step in tertiary ink, 4
                     under the title (ch17 draws 2; 4 is `--space-1`, the
                     nearest ladder step — GAPS-COL3 LST-3). The cards
                     variant's meta is CH19 view 12's 11 — `text-micro` with
                     the eyebrow tracking reset. */
                  <span
                    data-slot="list-description"
                    className={cn(
                      "mt-1 truncate text-ink-tertiary",
                      variant === "cards"
                        ? "text-micro tracking-[var(--tracking-normal)]"
                        : "text-caption",
                    )}
                  >
                    {row.description}
                  </span>
                ) : null}
              </span>

              {/* The trailing group. Pushed to the inline END with `ms-auto`
                  rather than the kit's physical `margin-left: auto`. */}
              <span
                data-slot="list-trailing"
                className="ms-auto flex flex-none items-center gap-2"
              >
                {row.meta !== undefined && row.meta !== null ? (
                  <span className="text-caption tabular-nums text-ink-tertiary">
                    {row.meta}
                  </span>
                ) : null}
                {/* Zero renders nothing — `Badge`'s law, not re-derived here. */}
                <Badge count={row.count} />
                {row.action}
              </span>
            </>
          );

          const rowClasses = cn(
            "flex w-full items-center text-start",
            ROW_GEOMETRY[density],
            // The 8% hairline under every row but the last (ch17). A cards
            // row has air under it instead — separation is the gap, not a
            // rule.
            /* The artifact draws a row rule as an inset shadow, never a border.
               Missed by the border sweep because it reads as layout. */
            variant !== "cards" && "shadow-[var(--hairline-under)] last:shadow-none",
            // `.kw-list__item` gives a standalone row the card radius; in the
            // panel the first and last rows round to the shell's corners so
            // the fill stops where the shell does without `overflow: hidden`.
            // A cards row is its own `--card` box at the full radius, at the
            // drawn `padding: 11px 14px` (11 snapped to the ladder's 12).
            variant === "rows"
              ? "rounded-[var(--radius)]"
              : variant === "cards"
                ? "rounded-[var(--radius)] bg-card px-[var(--space-3h)] py-3 min-h-0"
                : "first:rounded-t-[var(--radius)] last:rounded-b-[var(--radius)]",
            rowState === "default" && (rowPressable ? ROW_DEFAULT_INTERACTIVE : ROW_DEFAULT),
            rowState === "selected" && ROW_SELECTED,
            // Last, so tailwind-merge drops the loser rather than leaving two
            // same-specificity rules to race.
            rowState === "disabled" && ROW_DISABLED,
            row.entering && "motion-row-enter",
            row.exiting && "motion-row-exit",
          );

          const key = row.id ?? String(index);

          return (
            /* A real wrapper rather than `display: contents`: a listitem
               that generates no box is dropped from the accessibility tree
               in more than one engine, and `role` cannot go on the row
               itself because that row is a `<button>` when it is pressable
               and a listitem role would erase the button role. */
            <div key={key} role="listitem" data-slot="list-item">
              {rowPressable ? (
                <button
                  type="button"
                  data-slot="list-row"
                  data-state={rowState}
                  aria-selected={row.selected === true ? true : undefined}
                  onClick={() => onRowSelect?.(index, row)}
                  /* The reset line, WITHOUT `[font:inherit]`: Tailwind emits
                     that arbitrary property AFTER the named utilities in the
                     bundle, where it silently outranks any control's own type
                     step (the accordion/mode-toggle bug). The row's type lives
                     on its children, so preflight's `button { font: inherit }`
                     already does the whole job — measured identical live. */
                  className={cn(
                    "appearance-none border-0 bg-transparent text-inherit",
                    rowClasses,
                  )}
                >
                  {inner}
                </button>
              ) : (
                <span
                  data-slot="list-row"
                  data-state={rowState}
                  aria-disabled={rowDisabled || undefined}
                  aria-selected={row.selected === true ? true : undefined}
                  className={rowClasses}
                >
                  {inner}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  },
);

List.displayName = "List";

export { List };
