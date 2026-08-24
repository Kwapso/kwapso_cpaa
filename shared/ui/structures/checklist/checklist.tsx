"use client";

/* ============================================================================
   Checklist — ordered tasks with completion (0 direct call sites).

   DESIGN SOURCE
   Kit chapter 19 ("Collection views · 24 view types · one toolbar contract"),
   view 16, read out of `Design Mothership/kit-current/Kwapso UI Kit.dc.html`.
   Kept figure for figure:

     · the row   — `display: grid;
                    grid-template-columns: 26px 30px 1fr 130px 90px;
                    gap: 14px; align-items: center; padding: 12px;
                    box-shadow: inset 0 -1px 0 var(--hair);`
     · the mark  — 18 square, fully rounded, filled per state, with a
                   `box-shadow: inset 0 0 0 1px var(--hair2)` hairline
     · the number— 12 / tertiary ink / tabular figures
     · the title — 14, ink switching with the row's state
     · the owner — 12 / tertiary
     · the when  — 12 / tertiary / tabular / end-aligned

   The optional progress line over the list is chapter 18's own "Sprint days
   3 / 5" row, drawn as a bar plus a tabular count — built here from the
   `Progress` primitive rather than redrawn.

   THE CONTRADICTION THIS FILE RESOLVES (logged as GAPS-COL1 CL-1)
   Chapter 19 draws the completion mark as an 18 PILL. Ruling 03 states the
   radius law in full and puts "6px on marks and selection controls" — and a
   completion mark is a selection control, because the whole point of a
   checklist is that you can tick it. The kit's own appendix rule decides:
   "Where a ruling contradicts an older page, the ruling wins." So the mark is
   the system's `Checkbox`, at `--radius-select`, and the drawn pill is not
   built. That also satisfies the batch brief, which names `Checkbox` as the
   primitive this collection must compose.

   THE LAW THIS FILE OBEYS
   · Never re-implement a primitive. The mark is `Checkbox`, the bar is
     `Progress`, the registers are `CollectionRegister`.
   · Same-tone row separation is the blessed hairline, at `--border`. The
     heavier `--hair-strong` is a SECTION rule and is not used between rows.
   · Ruling 02: nothing hardcodes 9, 10 or 11 any more. The kit's 12 lands on
     `text-xs` and its 14 on `text-sm`.
   · Every number in a column or a timestamp is tabular.
   · Disabled is a fill and an ink. A done row is a MEANING, not a state, and
     takes tertiary ink rather than a dimming.
   · Focus is one global rule (tokens.css §8). `Checkbox` takes it already.
   · No product vocabulary: these are TASKS with an owner and a date, and
     every word in them is the caller's.

   RENDERING CONTEXT
   `"use client"` — `React.useId` ties each label to its own mark, and the
   toggle handler is created during this module's own render.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Checkbox } from "../../controls/checkbox/checkbox";
import { Progress } from "../../controls/progress/progress";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

const checklistRowVariants = cva(
  [
    /* The kit's columns, with the two trailing ones folded into one meta cell
       so the row can restack without the strings appearing twice in the DOM.
       30 snaps to the ladder's 32 (`w-8`); 130 and 90 are not needed as fixed
       widths once the pair travels together. */
    "grid grid-cols-[auto_2rem_1fr] md:grid-cols-[auto_2rem_1fr_auto]",
    "items-center gap-x-[var(--space-3h)] gap-y-1",
    // Same-tone row separation. The last row drops the rule.
    /* Inset shadow, never a border. The artifact draws every rule this
     way; these two survived the border sweep because a row divider
     reads as layout rather than decoration. */
  "shadow-[var(--hairline-under)] last:shadow-none",
    "min-w-0",
  ],
  {
    variants: {
      /** Chapter 19 draws 12 of inset; `compact` is the dense row. */
      density: {
        default: "px-3 py-3",
        compact: "px-3 py-2",
      },
    },
    defaultVariants: { density: "default" },
  },
);

export interface ChecklistItem {
  /** Stable key. Never an array index — a list reorders. */
  id: string;
  /** What the task is. A node, so a link or a code chip can ride inside it. */
  label: React.ReactNode;
  /** Ticked. A meaning, not a state: a done row keeps its paper and takes tertiary ink. */
  done?: boolean;
  /** Neither ticked nor unticked — a task whose answer is partly in. */
  indeterminate?: boolean;
  /** Who holds it. 12, tertiary. */
  owner?: React.ReactNode;
  /** When it is due or when it closed, already formatted by the caller (ruling 07). */
  when?: React.ReactNode;
  /** Machine-readable instant for `<time datetime>`. */
  dateTime?: string;
  /** This task cannot be ticked: a fill and an ink, never an opacity. */
  disabled?: boolean;
  /** This task's own value failed to save. Poppy border on the mark, and the words say so. */
  error?: boolean;
  /** A second line under the label — a note, a blocker, a reason. */
  meta?: React.ReactNode;
  /**
   * Override the row's number. Undefined uses the position in the array,
   * which is what "ordered" means; pass this where the caller owns the
   * numbering (a stable reference that survives a filter).
   */
  number?: React.ReactNode;
}

export interface ChecklistProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "onToggle"> {
  /** The tasks, in order. Order IS the numbering unless an item overrides it. */
  items?: ChecklistItem[];
  /** Draw the number column. On, as chapter 19 draws it. */
  numbered?: boolean;
  /** Ticking one. Absent, the whole list is read-only and no mark is interactive. */
  onToggle?: (item: ChecklistItem, done: boolean) => void;
  /** How much air a row spends on itself. */
  density?: VariantProps<typeof checklistRowVariants>["density"];

  /** Draw the completion bar and count over the list. Chapter 18's own row. */
  showProgress?: boolean;
  /**
   * Turn the two counts into the line beside the bar. Defaulted to the kit's
   * own "3 / 5" spelling, and a prop because a locale may want other numerals
   * or another separator.
   */
  formatProgress?: (done: number, total: number) => string;
  /** Accessible name for the bar, where no visible heading sits over it. */
  progressLabel?: string;

  /** The list has not arrived. Cold cache only. */
  loading?: boolean;
  /** How many placeholder rows to draw while `loading`. */
  loadingRows?: number;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
  /** Accessible name for the list as a whole. */
  label?: string;
}

/**
 * An ordered list of tasks with completion.
 *
 * TEN STATES
 *  1. default        — mark, number, label, then the owner and date travelling
 *                      together as one meta cell; hairline-separated rows.
 *  2. hover          — does not apply to the ROW. A checklist row is not a
 *                      target — the mark is, and `Checkbox` carries its own
 *                      hover (`--hair-strong` on the border). A whole row that
 *                      washed on hover would imply the row opens something,
 *                      and it does not. Logged as GAPS-COL1 CL-3.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The mark is a real
 *                      checkbox and the label is tied to it with `htmlFor`,
 *                      so the whole row is operable from the keyboard without
 *                      this file adding anything.
 *  4. active/pressed — belongs to `Checkbox`. The kit draws no pressed row.
 *  5. disabled       — per item (`item.disabled`): `Checkbox` takes
 *                      `--surface-quiet` and `cursor-not-allowed`, the label
 *                      takes `--ink-disabled`. A fill and an ink. With no
 *                      `onToggle` at all the marks are simply not
 *                      interactive, which is read-only rather than disabled —
 *                      see state 10.
 *  6. loading        — `loading`: `Skeleton variant="list"`. Cold cache only;
 *                      the kit's third loading tier keeps stale rows on a warm
 *                      re-fetch and marks them busy instead of blanking them.
 *  7. empty          — no items: the quiet register. NOT `null` — a list with
 *                      nothing on it is a real answer, and the register is
 *                      where the one next step lives.
 *  8. error          — two, and they are different pictures. `error` on the
 *                      list is the whole thing failing to load: the register,
 *                      poppy dot, its own wording. `item.error` is one row's
 *                      value failing to save: `Checkbox error`, which draws
 *                      the poppy border and sets `aria-invalid`.
 *  9. selected       — the tick IS the selection, and it is `data-state` on
 *                      `Checkbox`. There is no second, separate row selection;
 *                      a checklist that also had selectable rows would have
 *                      two marks meaning two different things in one row.
 * 10. read-only      — no `onToggle`: every mark renders `disabled` with
 *                      `aria-readonly` on the list, so a done task still reads
 *                      as done and cannot be changed. This is the honest
 *                      read-only — the ticks stay legible rather than being
 *                      replaced by a different glyph.
 *
 * THREE BREAKPOINTS
 *  · mobile (base) — three columns: mark, number, label. The owner and the
 *    date drop to a second row UNDER the label, in the label's own column, as
 *    one wrapped meta line. Chapter 19's five columns need about 380 of
 *    horizontal room before the label column stops being a two-word column,
 *    and a task you cannot read is worse than a date you have to look down
 *    for. The strings are not duplicated in the DOM: the meta cell is one
 *    grid item that changes which cell it occupies.
 *  · tablet (`sm:`, 40rem) — UNCHANGED from mobile, deliberately. 40rem is
 *    640, and the drawn row wants 26 + 30 + 130 + 90 plus four 14 gaps before
 *    the label gets anything, which leaves a portrait tablet reading a
 *    truncated task.
 *  · desktop (`md:`, 48rem) — the drawn state: the meta cell moves up beside
 *    the label and is pushed to the inline end. This is the one place in the
 *    batch where the step is `md:` rather than `sm:`, and the reason is the
 *    width the drawing actually needs.
 *
 * RTL — safe, and unused: the system is LTR only. Every inset is logical, the
 * grid columns follow the writing direction, and the meta cell is end-aligned
 * with `text-end` rather than a physical side.
 */
const Checklist = React.forwardRef<HTMLDivElement, ChecklistProps>(
  (
    {
      className,
      items,
      numbered = true,
      onToggle,
      density = "default",
      showProgress = false,
      formatProgress = (done, total) => `${done} / ${total}`,
      progressLabel,
      loading = false,
      loadingRows = 5,
      error = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading tasks…",
      emptyLabel = "Nothing to do",
      emptyBody = "There are no tasks on this list yet.",
      errorLabel = "Tasks unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label,
      ...props
    },
    ref,
  ) => {
    const list = items ?? [];
    const readOnly = onToggle === undefined;
    const baseId = React.useId();

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. */
    const state = loading ? "loading" : error ? "error" : list.length === 0 ? "empty" : "default";

    const doneCount = list.reduce((n, item) => (item.done ? n + 1 : n), 0);

    return (
      <div
        ref={ref}
        data-slot="checklist"
        data-state={state}
        aria-busy={loading || undefined}
        aria-readonly={readOnly || undefined}
        aria-label={label}
        className={cn("flex min-w-0 flex-col gap-4", className)}
        {...props}
      >
        {showProgress && state === "default" ? (
          <div
            data-slot="checklist-progress"
            /* Chapter 18's own progress row: the bar, then the count, tabular. */
            className="flex min-w-0 items-center gap-[var(--space-3h)]"
          >
            <Progress
              value={list.length === 0 ? 0 : (doneCount / list.length) * 100}
              label={progressLabel}
              className="flex-1"
            />
            <span className="text-xs tabular-nums text-ink-tertiary">
              {formatProgress(doneCount, list.length)}
            </span>
          </div>
        ) : null}

        {state === "loading"
          ? (loadingState ?? (
              <Skeleton variant="list" lines={loadingRows} label={loadingLabel} />
            ))
          : null}

        {state === "error"
          ? (errorState ?? (
              <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
            ))
          : null}

        {state === "empty"
          ? (emptyState ?? (
              <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
            ))
          : null}

        {state === "default" ? (
          <ol data-slot="checklist-items" className="flex min-w-0 list-none flex-col">
            {list.map((item, index) => {
              const markId = `${baseId}-${item.id}`;
              const dead = item.disabled || readOnly;
              const hasMeta =
                (item.owner !== undefined && item.owner !== null) ||
                (item.when !== undefined && item.when !== null);

              return (
                <li
                  key={item.id}
                  data-slot="checklist-item"
                  data-done={item.done ? "" : undefined}
                  className={cn(checklistRowVariants({ density }))}
                >
                  <Checkbox
                    id={markId}
                    checked={item.indeterminate ? "indeterminate" : Boolean(item.done)}
                    disabled={dead}
                    error={item.error}
                    onCheckedChange={(next) => onToggle?.(item, next === true)}
                  />

                  {numbered ? (
                    <span
                      aria-hidden="true"
                      className="text-xs tabular-nums text-ink-tertiary"
                    >
                      {item.number ?? index + 1}
                    </span>
                  ) : (
                    /* The column is kept even when unnumbered, so a numbered
                       and an unnumbered list line up when they sit in the same
                       panel. Nothing is drawn in it. */
                    <span aria-hidden="true" />
                  )}

                  <label
                    htmlFor={markId}
                    className={cn(
                      "flex min-w-0 flex-col gap-1 text-sm",
                      // A done task is a MEANING, so it steps down an ink
                      // tier. A disabled one is a STATE and takes the
                      // disabled ink. Neither is an opacity.
                      item.disabled
                        ? "text-ink-disabled"
                        : item.done
                          ? "text-ink-tertiary"
                          : "text-foreground",
                      !dead && "cursor-pointer",
                    )}
                  >
                    <span className="min-w-0">{item.label}</span>
                    {item.meta === undefined || item.meta === null ? null : (
                      <span className="text-xs text-ink-tertiary">{item.meta}</span>
                    )}
                  </label>

                  {hasMeta ? (
                    <span
                      data-slot="checklist-meta"
                      /* One grid cell in both layouts: column 3 row 2 on a
                         phone, column 4 row 1 from `md:`. No string appears
                         twice in the DOM. */
                      className={cn(
                        "col-start-3 flex flex-wrap items-center gap-x-[var(--space-3h)] gap-y-1",
                        "text-xs text-ink-tertiary",
                        "md:col-start-4 md:row-start-1 md:flex-nowrap md:justify-end md:text-end",
                      )}
                    >
                      {item.owner === undefined || item.owner === null ? null : (
                        <span className="truncate">{item.owner}</span>
                      )}
                      {item.when === undefined || item.when === null ? null : (
                        <time dateTime={item.dateTime} className="tabular-nums">
                          {item.when}
                        </time>
                      )}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    );
  },
);

Checklist.displayName = "Checklist";

export { Checklist, checklistRowVariants };
