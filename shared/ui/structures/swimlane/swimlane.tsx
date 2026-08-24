/* ============================================================================
   Swimlane — the board split into rows.

   DESIGN SOURCE
   `KWAPSO-SPEC.md` CH19 view 08. The chapter's template holes name every part
   of it and nothing else:

       {{ lane.label }} · {{ lane.count }} · {{ card.stage }} · {{ card.title }}

   and the drawn value settles the ladder:

       grid-template-columns: 130px repeat(3, 1fr)

   — a fixed lane-label column, then one column per stage. The rest of the
   drawn block is the lane's own inset (`padding: 10px 4px 4px`), the head
   clearance over the first lane (`padding-top: 54px`) and the card measure
   (`max-width: 200px`).

   THE LAW THIS FILE OBEYS
   · A SWIMLANE IS A BOARD SPLIT INTO ROWS, AND THE BOARD IS `Kanban`'S. What
     is shared with it is stated rather than copied: the CELL is `Card`, the
     count is a QUIET 11 TABULAR NUMBER and not a `Badge`, and the lane has
     NO ground at all — both of those moved with `kanban`'s, for the same
     two reasons (GAPS-FIDELITY-DE L-17 and L-18). What is NOT
     shared is drag — `Kanban` owns every drag moment and the kit draws none
     for a swimlane, so this view opens cards and does not move them. A caller
     that needs to move a card uses `Kanban`. GAPS-TRACK2A SWL-1.
   · ONE HEAD, NOT ONE PER LANE — at the widths where one head can stay in
     register with every lane under it. Below that the head goes down into the
     lanes, because two independent scrollers that only LOOK aligned are worse
     than a repeated label.
   · Hover belongs to the card, which takes `Card interactive`'s `--accent`
     wash and `.motion-hover-lift`. A LANE does not hover: it is a band.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label`), never an opacity.
   · Radii: 24 on the card. The lane has none — it has no fill to round —
     and the count is a bare number, so it has none either.
   · No `border` property. Focus is one global rule (tokens.css §8), and
     nothing here sets `overflow: hidden` on a lane or a card.
   · Colour is separation (law 3): the card is `--card` and the ground it
     stands on is the FRAME's soft paper, so a card is never the tone of the
     surface under it. The lane itself paints nothing — see the note on the
     lane element for why it used to.
   · Never mango. rem only. Every string a prop with a default. LTR only.

   A NOTE ON THE TWO LADDERS
   The template a grid takes has to change at a breakpoint, and an inline
   `style` beats every class including one inside a media query. So the two
   templates are carried as custom properties and the BREAKPOINT SWAPS THE
   VARIABLE, in a class, where a media query can reach it. Written down
   because it looks like indirection and is in fact the only way round the
   cascade.

   RENDERING CONTEXT
   `"use client"`. A pressable card means a handler is built during this
   module's own render, and `Card` reacts to the pointer.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card, CardContent } from "../../controls/card/card";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* The column ladder both the head and every lane read from. The active
   template is `--sw-cols`, and the only thing the breakpoint changes is which
   of the two it points at. It carries NO display utility: `grid` is written at
   each use site, because `hidden` and `grid` are the same Tailwind property
   and the later class would win over the earlier one wherever both appeared.
   */
const LADDER_COLS =
  "[grid-template-columns:var(--sw-cols)] [--sw-cols:var(--sw-scroll)] min-[45rem]:[--sw-cols:var(--sw-ladder)]";

/* ----------------------------------------------------------------------------
   THE COUNT — a quiet number, not a pill.

   CH19 view 08 draws both counts, the stage's and the lane's, as
   `font-size: 11px; color: var(--fg3); font-variant-numeric: tabular-nums`.
   CH14 states the same rule in words on the folder strip, which draws the
   identical object: "counts are quiet, never badges."

   This was `<Badge count>`, whose quiet variant is a `--surface-quiet` pill
   at 12/500 — a drawing the chapter never makes. The two laws the badge WAS
   carrying are kept here rather than lost with the pill: a count renders
   EMPTY at zero and never "0", and a count still in flight renders nothing
   rather than a placeholder zero.

   `text-micro` is the ladder's 11 rung and drags the eyebrow's 0.08em, which
   a number is not, so the tracking is reset — the same pair `gantt`'s period
   head and `kanban`'s card meta already use. GAPS-FIDELITY-DE L-18.
   ------------------------------------------------------------------------- */
function SwimlaneCount({ value, loading }: { value: number; loading?: boolean }) {
  if (loading || value <= 0) return null;
  return (
    <span className="text-micro tracking-[var(--tracking-normal)] tabular-nums text-ink-tertiary">
      {value}
    </span>
  );
}

export interface SwimlaneColumn {
  /** Stable id. The value a card's `columnId` points at. */
  id: string;
  /** The stage's name. */
  title: React.ReactNode;
  /**
   * The count beside it. Undefined counts the cards in the column across
   * every lane, which is right for a view that holds everything; pass one
   * where the view is paged and the total is larger than what is on screen.
   */
  count?: number;
}

export interface SwimlaneCard {
  /** Stable id. The React key, and the handle every callback is given. */
  id: string;
  /** Which stage column it sits in. A card whose column is unknown is not drawn. */
  columnId: string;
  /** The card's name — `{{ card.title }}`. */
  title: React.ReactNode;
  /** The quiet line over it — `{{ card.stage }}`, in the kit's own drawing. */
  stage?: React.ReactNode;
  /** Chips along the foot. `Badge`s from the call site. */
  badges?: React.ReactNode;
  /** Anything else inside the card — a mark, a bar, a row of avatars. */
  content?: React.ReactNode;
  /** Cannot be opened. A fill and an ink; the card still reads. */
  disabled?: boolean;
}

export interface SwimlaneLane {
  /** Stable id. Falls back to the index. */
  id?: string;
  /** The lane's name — `{{ lane.label }}`. Truncates at the fixed column. */
  label: React.ReactNode;
  /** The count beside it — `{{ lane.count }}`. Undefined counts the lane's cards. */
  count?: number;
  /** The lane's cards, in the order they should read. This view never sorts. */
  cards?: readonly SwimlaneCard[];
  /** The words when this lane holds nothing. Falls back to `emptyLaneLabel`. */
  emptyLabel?: string;
}

export interface SwimlaneProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /** The stage columns, in the order they should read. */
  columns: readonly SwimlaneColumn[];
  /** The lanes, in the order they should read. */
  lanes: readonly SwimlaneLane[];

  /** Opening a card. Without it a card is not a target and takes no tab stop. */
  onCardSelect?: (card: SwimlaneCard, lane: SwimlaneLane, column: SwimlaneColumn) => void;

  /** How wide the lane-label column is. The kit's figure, in rem. */
  labelWidth?: string;
  /** The narrowest a stage column may be before the lane scrolls. rem only. */
  columnWidth?: string;
  /** The card measure the kit draws. rem only. */
  cardWidth?: string;

  /** The view's accessible name. */
  label?: string;
  /** The words in a lane that holds nothing, unless the lane overrides them. */
  emptyLaneLabel?: string;

  /* ---- the three registers ------------------------------------------------ */
  /** The cards have not arrived. The heads and the lane labels stay. */
  loading?: boolean;
  /** How many placeholder cards per cell while `loading`. */
  loadingCards?: number;
  /** The view failed to arrive. Beats `empty`. */
  error?: boolean;
  /** Force the empty register. No lanes, or no columns, is already empty. */
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

/**
 * A board of stages, split into a row per lane.
 *
 * TEN STATES
 *  1. default        — the stage names, then a lane per record group. A lane
 *                      is a label and its cards, bare on the frame's paper;
 *                      it is not a band.
 *  2. hover          — the CARD's, via `Card interactive`: the `--accent` wash
 *                      and `.motion-hover-lift`. Never mango, never an
 *                      opacity. A lane does not hover.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once, at
 *                      the card's own 24. Nothing in this file clips a ring;
 *                      the lane's scroll container carries `scroll-p-1` so a
 *                      ring at the edge is brought in whole.
 *  4. active/pressed — does not apply as a skin. Pressing a card opens the
 *                      record, and the acknowledgement is the record arriving.
 *  5. disabled       — per card: `--btn-disabled-fill` /
 *                      `--btn-disabled-label`, `aria-disabled`, no hover and
 *                      no tab stop that does nothing. A fill and an ink.
 *  6. loading        — `loading`: the heads and the lane labels STAY and the
 *                      cells fill with `Skeleton` cards, so nothing moves when
 *                      the records land. The lane count is known from the
 *                      props; only the cards are not.
 *  7. empty          — two kinds. An empty CELL draws nothing at all: a stage
 *                      a lane has no work in is a normal reading of the grid,
 *                      and a register in every hole would be noise. An empty
 *                      LANE says so once across its whole width. No lanes at
 *                      all draws the register in place of the view.
 *  8. error          — `error`: the register with a poppy dot. Beats empty.
 *  9. selected       — does not apply. The kit draws no selected card
 *                      (GAPS-F CRD-3) and a swimlane may not invent one.
 * 10. read-only      — without `onCardSelect` the whole view is read-only and
 *                      still reads completely.
 *
 * THREE BREAKPOINTS
 *  · mobile (base, to 45rem) — the lane label moves ABOVE its lane as a row
 *    heading, each lane carries its own stage names, and the stage columns
 *    SCROLL ON THE INLINE AXIS with scroll-snap, one column per stop. This
 *    follows `Kanban`'s own stated law — "a board that wraps is not a board,
 *    because the columns stop being peers you read across" — rather than a new
 *    answer, because chapter 19 states no narrow render for view 08. Logged as
 *    GAPS-TRACK2A SWL-2. At 380 the label sits on its own line and one full
 *    stage column is in view.
 *  · tablet (`min-[45rem]:`) — the ladder: one head across the top, a fixed
 *    label column, the stage columns beside it, and no scrolling anywhere.
 *  · desktop — unchanged in kind. More width goes to the stage columns; the
 *    label column stays fixed, which is what keeps the lanes readable.
 *
 * RTL — LTR only (ruling 10). Every inset is logical and no rule names a side.
 */
const Swimlane = React.forwardRef<HTMLDivElement, SwimlaneProps>(
  (
    {
      className,
      columns,
      lanes,
      onCardSelect,
      labelWidth = "8.125rem",
      columnWidth = "13.75rem",
      cardWidth = "12.5rem",
      label = "Swimlanes",
      emptyLaneLabel = "Nothing here",
      loading = false,
      loadingCards = 2,
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
    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. `loading` keeps the chrome, so unless the caller overrides it
       with its own node, it is not a whole-view register. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : empty || lanes.length === 0 || columns.length === 0
          ? "empty"
          : "default";

    const register =
      state === "loading" && loadingState
        ? loadingState
        : state === "error"
          ? (errorState ?? <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />)
          : state === "empty"
            ? (emptyState ?? <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />)
            : null;

    if (register) {
      return (
        <div
          ref={ref}
          data-slot="swimlane"
          data-state={state}
          aria-busy={loading || undefined}
          className={cn("min-w-0", className)}
          {...props}
        >
          {register}
        </div>
      );
    }

    /* The two templates. `--sw-ladder` is the kit's stated grid; `--sw-scroll`
       is the same columns at a fixed measure, for the widths where they
       scroll instead. The class ladder above decides which is live. */
    const ladder = `var(--sw-label) repeat(${columns.length}, minmax(0, 1fr))`;
    const scroller = `repeat(${columns.length}, minmax(var(--sw-column), 1fr))`;

    const countFor = (column: SwimlaneColumn) =>
      column.count ??
      lanes.reduce(
        (total, lane) => total + (lane.cards ?? []).filter((c) => c.columnId === column.id).length,
        0,
      );

    const stageName = (column: SwimlaneColumn, narrowOnly: boolean) => (
      <span
        data-slot="swimlane-stage"
        className={cn(
          "flex min-w-0 items-center gap-2 px-1 pb-1",
          "text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary",
          narrowOnly && "min-[45rem]:hidden",
        )}
      >
        <span className="truncate">{column.title}</span>
        {/* A COUNT IS A QUIET NUMBER, NOT A PILL — CH19 view 08 draws it
            `font-size: 11px; color: var(--fg3); font-variant-numeric:
            tabular-nums`, and CH14 says it in words on the identical object:
            "counts are quiet, never badges." The two laws a `Badge` was
            carrying are kept: empty at zero, and nothing while it is still
            coming. GAPS-FIDELITY-DE L-18. */}
        <SwimlaneCount value={countFor(column)} loading={loading} />
      </span>
    );

    const laneName = (lane: SwimlaneLane, cards: readonly SwimlaneCard[], narrowOnly: boolean) => (
      <span
        data-slot="swimlane-lane-label"
        className={cn(
          /* 12 / 500 / UPPERCASE / 0.08em. CH19 view 08 draws the lane name
             `font-size: 12px; font-weight: 500; text-transform: uppercase;
             letter-spacing: 0.08em` — built at 14 with no uppercase, it read
             as a heading rather than as the lane's label. The step is
             `text-badge`; `--tracking-eyebrow` restates the 0.08em, which
             that rung does not carry. The head's own gap is the drawn 10. */
          "flex min-w-0 items-center gap-[var(--space-2h)] px-1",
          "text-xs font-[var(--font-weight-medium)] uppercase tracking-[var(--tracking-eyebrow)]",
          narrowOnly ? "pb-[var(--space-2h)] min-[45rem]:hidden" : "hidden pt-1 min-[45rem]:flex",
        )}
      >
        <span className="truncate">{lane.label}</span>
        {/* A COUNT IS A QUIET NUMBER, NOT A PILL — CH19 view 08 draws it
            `font-size: 11px; color: var(--fg3); font-variant-numeric:
            tabular-nums`, and CH14 says it in words on the identical object:
            "counts are quiet, never badges." The two laws a `Badge` was
            carrying are kept: empty at zero, and nothing while it is still
            coming. GAPS-FIDELITY-DE L-18. */}
        <SwimlaneCount value={lane.count ?? cards.length} loading={loading} />
      </span>
    );

    return (
      <div
        ref={ref}
        data-slot="swimlane"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        style={{
          ["--sw-label" as string]: labelWidth,
          ["--sw-column" as string]: columnWidth,
          ["--sw-card" as string]: cardWidth,
          ["--sw-ladder" as string]: ladder,
          ["--sw-scroll" as string]: scroller,
          ...style,
        }}
        /* The lanes stack at the drawn 10. */
        className={cn("flex min-w-0 flex-col gap-[var(--space-2h)]", className)}
        {...props}
      >
        {/* One head, at the widths where it can stay in register. */}
        <div data-slot="swimlane-head" className={cn("hidden gap-3 min-[45rem]:grid", LADDER_COLS)}>
          {/* The label column has no head: the lanes name themselves. */}
          <span aria-hidden="true" />
          {columns.map((column) => (
            <React.Fragment key={column.id}>{stageName(column, false)}</React.Fragment>
          ))}
        </div>

        {lanes.map((lane, laneIndex) => {
          const cards = lane.cards ?? [];
          const laneEmpty = !loading && cards.length === 0;

          return (
            <div
              key={lane.id ?? String(laneIndex)}
              data-slot="swimlane-lane"
              /* THE LANE IS BARE — no fill, no radius, no inset. CH19 view 08
                 draws the lane label and the `--card` cards straight on the
                 frame's soft paper; there is no lane band in the chapter.
                 The `bg-surface-panel` band this carried was PATTERN §11
                 legibility, and THAT REASON DIED WITH THE K1 REVERSAL
                 (override 15): the frame's panel is soft paper now, so a
                 soft-paper lane measured 1.000 against its own ground while
                 the cards it was lifting already read 1.103 light / 1.111
                 dark on that paper unaided. Same edit, same reason, as
                 `kanban`'s column. GAPS-FIDELITY-DE L-17. */
              className="min-w-0"
            >
              {laneName(lane, cards, true)}

              <div className="min-w-0 snap-x snap-mandatory scroll-p-1 overflow-x-auto min-[45rem]:snap-none min-[45rem]:overflow-visible">
                <div className={cn("grid items-start gap-3", LADDER_COLS)}>
                  {laneName(lane, cards, false)}

                  {laneEmpty ? (
                    <span className="col-span-full px-1 py-[var(--space-3h)] text-caption text-ink-tertiary">
                      {lane.emptyLabel ?? emptyLaneLabel}
                    </span>
                  ) : (
                    columns.map((column) => (
                      <div
                        key={column.id}
                        data-slot="swimlane-cell"
                        className="flex min-w-0 snap-start flex-col p-1 min-[45rem]:snap-align-none"
                      >
                        {/* Narrow only: without the shared head each lane has
                            to say which stage it is showing. */}
                        {stageName(column, true)}

                        <div className="flex min-w-0 flex-col gap-[var(--space-2h)]">
                          {loading
                            ? Array.from({ length: loadingCards }, (_, i) => (
                                <Skeleton
                                  key={i}
                                  variant="card"
                                  label={loadingLabel}
                                  announce={false}
                                  className="h-[5rem] w-full max-w-[var(--sw-card)]"
                                />
                              ))
                            : cards
                                .filter((card) => card.columnId === column.id)
                                .map((card) => {
                                  const pressable =
                                    Boolean(onCardSelect) && card.disabled !== true;
                                  return (
                                    <Card
                                      key={card.id}
                                      data-slot="swimlane-card"
                                      /* Law 3. The lane is soft paper and
                                         `Card`'s default is soft paper too, so
                                         a default card on a lane is one flat
                                         sheet. `raised` is off-beige over soft
                                         paper — the pairing the law names. */
                                      variant="raised"
                                      interactive={pressable}
                                      aria-disabled={card.disabled === true || undefined}
                                      role={pressable ? "button" : undefined}
                                      tabIndex={pressable ? 0 : undefined}
                                      onClick={
                                        pressable
                                          ? () => onCardSelect?.(card, lane, column)
                                          : undefined
                                      }
                                      onKeyDown={
                                        pressable
                                          ? (event) => {
                                              if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                onCardSelect?.(card, lane, column);
                                              }
                                            }
                                          : undefined
                                      }
                                      className={cn(
                                        "w-full max-w-[var(--sw-card)]",
                                        pressable && "cursor-pointer",
                                        card.disabled === true &&
                                          "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]",
                                      )}
                                    >
                                      <CardContent className="flex min-w-0 flex-col gap-2">
                                        {card.stage !== undefined && card.stage !== null ? (
                                          <p className="min-w-0 truncate text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
                                            {card.stage}
                                          </p>
                                        ) : null}
                                        {/* No weight. The artifact draws the
                                            card title `font-size: 13px` and
                                            writes no `font-weight`; the STAGE
                                            line above it is the 500 one. */}
                                        <p className="min-w-0 text-caption">
                                          {card.title}
                                        </p>
                                        {card.content}
                                        {card.badges !== undefined && card.badges !== null ? (
                                          <div className="flex flex-wrap items-center gap-2">
                                            {card.badges}
                                          </div>
                                        ) : null}
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);

Swimlane.displayName = "Swimlane";

export { Swimlane };
