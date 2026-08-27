/* ============================================================================
   Swimlane — the board split into rows.

   DESIGN SOURCE
   CH19 view 08 — the kit's own HTML, which is the authority the client's
   re-audit points at (2026-08-26, "reference to the pdf"). The chapter's
   template holes name every part of it and nothing else:

       {{ lane.label }} · {{ lane.count }} · {{ card.stage }} · {{ card.title }}

   and the drawn block is:

       lane head — `display: flex; gap: 10px; padding: 4px 6px 8px`: the
         label at 12/500 uppercase 0.08em, the count at 11 tabular `--fg3`,
         then a 1px RULE flexing from the count to the panel's far edge;
       cards — `grid-template-columns: repeat(4, 1fr); gap: 10px`, each card
         `--card` at radius 24, `padding: 11px 13px`, carrying its stage as a
         10/500 uppercase eyebrow INSIDE the card, then the 13 title.

   THERE IS NO LANE-LABEL COLUMN AND NO SHARED HEAD ROW OF STAGE NAMES. The
   `130px repeat(3, 1fr)` ladder this file used to transcribe was
   `KWAPSO-SPEC.md`'s older extract reading view 22 (compare) — GAPS-KIT-DE
   L19-4 traced it against the rendered page and the L-8 audit before it. The
   wide arrangement below is now the chapter's own: the narrow arrangement,
   promoted to every width. `labelWidth` is accepted and INERT — there is no
   label column for it to size — kept so no call site breaks.

   THE LAW THIS FILE OBEYS
   · A SWIMLANE IS A BOARD SPLIT INTO ROWS, AND THE BOARD IS `Kanban`'S. What
     is shared with it is stated rather than copied: the CELL is `Card`, the
     count is a QUIET 11 TABULAR NUMBER and not a `Badge`, and the lane has
     NO ground at all — both of those moved with `kanban`'s, for the same
     two reasons (GAPS-FIDELITY-DE L-17 and L-18). What is NOT
     shared is drag — `Kanban` owns every drag moment and the kit draws none
     for a swimlane, so this view opens cards and does not move them. A caller
     that needs to move a card uses `Kanban`. GAPS-TRACK2A SWL-1.
   · EVERY LANE NAMES ITSELF AND EVERY CARD NAMES ITS STAGE. The chapter
     draws no shared head row: the stage word is the card's own eyebrow, so a
     card is legible wherever it stands and nothing has to stay in register
     across lanes.
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
import { Card, CardContent } from "../card/card";
import { Skeleton } from "../skeleton/skeleton";
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
  /** The stage's name. Announced on the column; drawn on each card's eyebrow. */
  title: React.ReactNode;
  /**
   * INERT since L19-4: the chapter draws a count on the LANE only, never on
   * a stage. Accepted so no call site breaks; it renders nothing.
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

  /**
   * INERT. The chapter draws no lane-label column (GAPS-KIT-DE L19-4): the
   * lane names itself on its own head row. Accepted so no call site breaks;
   * it sizes nothing.
   */
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
 * THREE BREAKPOINTS — ONE ARRANGEMENT (L19-4). The chapter's drawing holds at
 * every width: the lane's own head row (label · count · rule), then the stage
 * cells with the stage word inside each card. Only the grid changes:
 *  · mobile (base, to 45rem) — the stage columns SCROLL ON THE INLINE AXIS
 *    with scroll-snap, one column per stop, following `Kanban`'s own stated
 *    law ("a board that wraps is not a board") because chapter 19 states no
 *    narrow render for view 08. Logged as GAPS-TRACK2A SWL-2.
 *  · tablet (`min-[45rem]:`) — the chapter's `repeat(n, 1fr)`: equal stage
 *    columns, no scrolling, no label column and no shared head.
 *  · desktop — unchanged in kind; more width goes to the stage columns.
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
      /* Inert — see the prop's doc. Destructured so it never lands on the
         DOM element with the rest of the spread. */
      labelWidth: _labelWidth,
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

    /* The two templates. `--sw-ladder` is the chapter's `repeat(4, 1fr)` —
       equal stage columns, NO label column (L19-4); `--sw-scroll` is the same
       columns at a fixed measure, for the widths where they scroll instead.
       The class ladder above decides which is live. */
    const ladder = `repeat(${columns.length}, minmax(0, 1fr))`;
    const scroller = `repeat(${columns.length}, minmax(var(--sw-column), 1fr))`;

    /* THE LANE HEAD — the chapter's own row, at every width: the label at
       12/500 uppercase 0.08em, the quiet count, then a 1px rule flexing from
       the count to the panel's far edge (`flex: 1 1 auto; height: 1px` in the
       drawing; `--hair-strong` is the section-rule strength the build maps
       the artifact's stroke to). GAPS-KIT-DE L19-4 — the third of the three
       parts, the rule, lands with this pass. */
    const laneName = (lane: SwimlaneLane, cards: readonly SwimlaneCard[]) => (
      <span
        data-slot="swimlane-lane-label"
        className={cn(
          "flex min-w-0 items-center gap-[var(--space-2h)] px-1 pb-2",
          "text-xs font-[var(--font-weight-medium)] uppercase tracking-[var(--tracking-eyebrow)]",
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
        <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-hair-strong" />
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
        {/* NO SHARED HEAD ROW. The chapter draws none (L19-4): every lane
            names itself and every card carries its stage. */}
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
              {laneName(lane, cards)}

              <div className="min-w-0 snap-x snap-mandatory scroll-p-1 overflow-x-auto min-[45rem]:snap-none min-[45rem]:overflow-visible">
                <div className={cn("grid items-start gap-3", LADDER_COLS)}>
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
                        {/* No cell heading at any width — the chapter puts
                            the stage word INSIDE the card as its eyebrow
                            (`card.stage`), so a card is legible wherever it
                            stands. */}
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
