/* ============================================================================
   Kanban — columns, draggable cards.

   DESIGN SOURCE — AND WHAT IS MISSING
   The kit draws NO board. There is no `.kw-board`, no `.kw-column`, no
   swimlane and no drag specimen anywhere in `kwapso-ui.css`,
   `kwapso-patterns.css` or `_fragments/`. Every gap that follows from that is
   logged in GAPS-COL2 (KAN-1 … KAN-4). What the kit DOES supply, and what
   this file is built from without inventing anything else:

     the card            `Card` — `.kw-card`, the 24 radius, the `--card` fill
                         on a `--surface-panel` ground (PATTERN §11)
     the column ground   THERE IS NONE. CH19 view 02 draws the head and the
                         cards as siblings straight on the frame's soft
                         paper. This file used to paint one and the reason
                         died with the K1 reversal — see the note on the
                         column below (GAPS-FIDELITY-DE L-17).
     the column measure  `.kw-laws { grid-template-columns: repeat(auto-fit,
                         minmax(18rem, 1fr)) }` — 18rem is the kit's own
                         smallest stated column minimum, so it is taken rather
                         than a new number chosen. KAN-1.
     the count           NOT a `Badge`. CH19 view 02 draws it as a quiet
                         11 tabular number and CH14 states the rule in words
                         on the identical object — "counts are quiet, never
                         badges" (GAPS-FIDELITY-DE L-18).
     every drag moment   motion/motion.css §15, which is fully specified:
                         `.motion-drag` (pick up on `--duration-lift`, held
                         `--motion-lift-scale`, `--shadow-overlay`),
                         `.motion-drag-settle` (drop on `--duration-settle`),
                         `.motion-drag-placeholder` (the hole it came from),
                         `.motion-drop-target` (`--accent` while over),
                         `.motion-row-move` (the cards shuffling to make room).
     the two registers   `.kw-empty` (kwapso-ui.css) and `.kw-register`
                         (kwapso-patterns.css CH21).

   THE LAW THIS FILE OBEYS
   · EVERY DRAG MOMENT IS motion.css'S, NOT THIS FILE'S. No keyframe, no
     duration and no easing is written here; the four classes are attached and
     the two data attributes they select on are set. motion.css §15 explains
     why the lift is `scale:` and not a `transform` and this file must not
     undo that by putting a transform on a dragging card.
   · A DROP TARGET IS `--accent`, THE NEUTRAL WASH. `.motion-drop-target`
     already sets it. Never `--primary`: mango is a brand fill, never a hover
     and never a status, and a board of mango columns would be unreadable.
   · THE BOARD SCROLLS ON THE INLINE AXIS. It does not wrap columns onto a
     second line and it does not restack into one list. A wrapped board is not
     a board — the whole point is that the columns are peers you read across.
   · A DRAG MUST HAVE A KEYBOARD DOOR. Commission §5: "every interactive
     element reachable and operable by keyboard". Pointer drag alone would
     make a whole component unusable without a mouse, so a card is focusable
     and moves with the arrow keys while a live region says where it went. No
     kit ruling exists for this; the behaviour is built and logged as KAN-3.
   · Focus is ONE global rule (tokens.css §8). A card is focusable and rings
     at its own 24 radius; nothing here sets a ring or an `outline`.
   · Disabled is a fill and an ink. A locked card takes `--btn-disabled-fill`
     / `--btn-disabled-label` and cannot be picked up. No opacity anywhere.
   · Every user-facing string is a prop with a default, including the ones
     only a screen reader hears — which on this component is most of them.
   · No product vocabulary (commission §11). Columns, cards, moves.

   RENDERING CONTEXT
   `"use client"`. State for the card being carried, handlers made during
   render, and a live region updated from an event.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card, CardContent } from "../../controls/card/card";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ============================================================================
   The shapes
   ========================================================================= */

export interface KanbanCard {
  /** Stable id. The React key, and the handle every callback is given. */
  id: string;
  /** The card's name. Caption step in Saans Medium — the kit's `.kw-list__title`. */
  title: React.ReactNode;
  /** A quiet line under it. Caption in tertiary ink — `.kw-list__meta`. */
  description?: React.ReactNode;
  /** Chips along the foot — `Badge`s from the call site. */
  badges?: React.ReactNode;
  /** Anything else inside the card — a mark, a bar, a row of avatars. */
  content?: React.ReactNode;
  /** This card cannot be moved. A fill and an ink, and the drag handlers refuse it. */
  disabled?: boolean;
}

export interface KanbanColumn {
  /** Stable id. The React key, and the destination handed to `onMove`. */
  id: string;
  /** The column's name. */
  title: React.ReactNode;
  /**
   * The count beside the name. Undefined uses `cards.length`, which is right
   * for a board that holds everything; pass one where the column is paged and
   * the total is larger than what is on screen.
   */
  count?: number;
  /** The cards, in order. This component never sorts. */
  cards?: KanbanCard[];
  /** Nothing may be dropped here. The column refuses every drop and says so. */
  locked?: boolean;
  /** A control in the column's head — a filter, a menu. */
  action?: React.ReactNode;
  /** A control at the column's foot — "add". */
  footer?: React.ReactNode;
  /** The words when this column is empty. Falls back to the board's `emptyColumnLabel`. */
  emptyLabel?: string;
}

/** Where a card came from and where it went. */
export interface KanbanMove {
  cardId: string;
  fromColumnId: string;
  toColumnId: string;
  /** Where in the destination column it landed, zero-based. */
  toIndex: number;
}

/* ============================================================================
   The registers — transcribed, local
   ========================================================================= */

/* `.kw-empty` (kwapso-ui.css, the last block): a centred column, `--space-2`
   between its lines, `--space-8` / `--space-6` inset, tertiary ink at 14.
   Kept at the kit's full inset inside a column rather than shrunk, and for a
   reason beyond fidelity: the empty block is also the DROP TARGET for the
   first card into an empty column, and a 12-tall strip is not something a
   pointer can reliably find. */
function EmptyRegister({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-slot="kanban-empty"
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
   Kanban
   ========================================================================= */

export interface KanbanProps extends Omit<React.ComponentPropsWithoutRef<"div">, "onDrop"> {
  /** The columns, in the order they should read. */
  columns?: KanbanColumn[];
  /**
   * A card was moved. Without it the board is READ-ONLY: no card is
   * draggable, no card takes the move keys, and no drop target lights up. A
   * control that silently does nothing is worse than no control.
   */
  onMove?: (move: KanbanMove) => void;
  /** A card was pressed — opened, usually. Without it a card is not a target. */
  onCardSelect?: (card: KanbanCard, column: KanbanColumn) => void;

  /**
   * How wide one column is. `18rem` by default, which is the kit's own
   * smallest stated column minimum (`.kw-laws`); the kit draws no board and
   * states no board column, so nothing narrower or wider is invented.
   * GAPS-COL2 KAN-1. rem only.
   */
  columnWidth?: string;
  /**
   * Bound a column's card list so it scrolls inside itself and the column
   * heads stay level. rem only. Undefined lets the tallest column set the
   * board's height, which is right for a short board.
   */
  columnMaxHeight?: string;

  /* ---- strings — most of this component is announced, not seen ------------ */
  /** The board's accessible name. */
  label?: string;
  /** The words in an empty column, unless the column overrides them. */
  emptyColumnLabel?: string;
  /** The words when there are no columns at all. */
  emptyLabel?: string;
  /**
   * What a screen reader hears as a card's role. The platform has no "card
   * you can move", so it is said in words — and it must be translatable.
   */
  cardRoleLabel?: string;
  /**
   * The instructions read once when a card takes focus. The default names the
   * keys; a locale that uses different words for them passes its own.
   */
  moveHintLabel?: string;
  /** Announced after a move. Given the card, the column and the position. */
  formatMoveAnnouncement?: (
    cardTitle: string,
    columnTitle: string,
    position: number,
    total: number,
  ) => string;
  /** Announced when a move is refused — a locked column, a locked card. */
  moveRefusedLabel?: string;

  /* ---- the three states --------------------------------------------------- */
  /** The board has not arrived. Skeleton cards in each column; the heads stay. */
  loading?: boolean;
  /** How many placeholder cards to draw per column while `loading`. */
  loadingCards?: number;
  /** The board could not be read. CH21's register instead of the board. */
  error?: boolean;
  /** The register's eyebrow. Ruling 26: the poppy dot never speaks alone. */
  errorEyebrow?: string;
  /** The register's title line. */
  errorTitle?: string;
  /** The register's sentence. */
  errorBody?: React.ReactNode;
  /** The register's one next step — usually `Button variant="secondary"` (T21-3). */
  errorAction?: React.ReactNode;
}

/** The text of a node, for an announcement. Only a string can be announced. */
function textOf(node: React.ReactNode): string {
  return typeof node === "string" ? node : "";
}

/**
 * A board of columns of movable cards.
 *
 * TEN STATES
 *  1. default        — columns on `--surface-panel` at the 24 radius, cards
 *                      on `--card` inside them, a quiet count beside each
 *                      column's name.
 *  2. hover          — the card takes `Card interactive`'s `--accent` wash and
 *                      `.motion-hover-lift`'s elevation. A named token and a
 *                      named shadow; never an opacity, never mango. A COLUMN
 *                      does not hover — only the card is a target, and a
 *                      column that lit up under the pointer would compete with
 *                      the drop target below.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once, at
 *                      the control's own radius, which for a card is 24. This
 *                      file sets no `overflow: hidden` on a card and gives the
 *                      column list `scroll-p-1`, so a ring on a card at the
 *                      edge of a scrolled column is brought into view whole.
 *  4. active/pressed — the drag PICK-UP is this component's pressed state, and
 *                      it is motion.css's: `--duration-lift` (90ms) to
 *                      `--motion-lift-scale` and `--shadow-overlay`, held for
 *                      the whole carry. A separate press nudge would be two
 *                      answers to one gesture, which motion.css §15 warns
 *                      against by name.
 *  5. disabled       — `card.disabled`: `--btn-disabled-fill` /
 *                      `--btn-disabled-label`, `aria-disabled`, not draggable,
 *                      out of the tab order for the move keys, and no hover so
 *                      a locked card cannot look movable. `column.locked`
 *                      refuses every drop and never lights up. A fill and an
 *                      ink; no opacity is written anywhere in this file.
 *  6. loading        — `loading`: `Skeleton` cards inside each column with the
 *                      column HEADS KEPT, so the board's shape does not jump
 *                      when the cards land. `aria-busy` on the board, the
 *                      empty registers suppressed, and every drag affordance
 *                      withdrawn — a card cannot be moved to a column whose
 *                      contents are not known.
 *  7. empty          — two kinds. An empty COLUMN gets `.kw-empty` inside it,
 *                      at the kit's full inset, which doubles as the drop
 *                      target for the first card. An empty BOARD — no columns
 *                      at all — gets `.kw-empty` in place of the board.
 *  8. error          — `error`: `.kw-register`, the left-aligned panel card,
 *                      announced as an alert. A move that FAILS is the caller's
 *                      to report: the card returns to where it was (the caller
 *                      simply does not apply the move) and the reason belongs
 *                      in a toast or an `Alert`, not smeared over the card.
 *  9. selected       — does not apply, and this is a real decision. A board is
 *                      not a chooser; the thing you do to a card is MOVE it or
 *                      OPEN it. The kit draws no selected card (GAPS-F CRD-3)
 *                      and none is invented. A card being CARRIED is a
 *                      different thing and has its own drawing — the lift.
 * 10. read-only      — no `onMove`: nothing is draggable, no card takes the
 *                      move keys, and no drop target exists. The board still
 *                      reads completely, which is the point.
 *
 * THREE BREAKPOINTS
 *  mobile   — the board SCROLLS ON THE INLINE AXIS with scroll-snap, one
 *             column per stop. It does not wrap and it does not restack into
 *             a single list: a board that wraps is not a board, because the
 *             columns stop being peers you read across, and a board that
 *             becomes one list has silently become `List`. Snap is what makes
 *             the scroll usable with a thumb — without it an 18rem column on
 *             a 320 screen always ends up half off the edge.
 *  tablet   — the same board, two columns and a bit in view, snap still on.
 *             Nothing about a column changes; there are simply more of them
 *             visible.
 *  desktop  — UNCHANGED in kind. The column stays at its measure rather than
 *             stretching to fill: a 40rem-wide column of 13/1.45 cards is a
 *             worse column, and the point of a wide screen here is MORE
 *             columns, not fatter ones.
 *
 * RTL — safe. The board is a flex row, which follows the document direction;
 * the columns' order mirrors with it; every inset is `p-*` / `px-*`; the
 * scroll axis mirrors on its own. The move keys read `ArrowLeft` and
 * `ArrowRight` as PHYSICAL keys and map them to the previous and next column
 * through the document direction, which is read from the board element at the
 * moment of the press — a physical-left press in Arabic moves the card to the
 * NEXT column, which is what the finger expects.
 */
const Kanban = React.forwardRef<HTMLDivElement, KanbanProps>(
  (
    {
      className,
      columns,
      onMove,
      onCardSelect,
      columnWidth = "18rem",
      columnMaxHeight,
      label,
      emptyColumnLabel = "Nothing here",
      emptyLabel = "No columns yet",
      cardRoleLabel = "Movable card",
      moveHintLabel = "Use the arrow keys to move this card between columns.",
      formatMoveAnnouncement,
      moveRefusedLabel = "This card cannot be moved there",
      loading = false,
      loadingCards = 3,
      error = false,
      errorEyebrow = "Load failed",
      errorTitle = "This board could not be loaded",
      errorBody,
      errorAction,
      style,
      ...props
    },
    ref,
  ) => {
    const boardRef = React.useRef<HTMLDivElement | null>(null);
    const [carrying, setCarrying] = React.useState<string | null>(null);
    const [over, setOver] = React.useState<string | null>(null);
    const [announcement, setAnnouncement] = React.useState("");

    const all = columns ?? [];
    const movable = onMove !== undefined && !loading;

    const locate = React.useCallback(
      (cardId: string) => {
        for (let c = 0; c < all.length; c += 1) {
          const cards = all[c].cards ?? [];
          const index = cards.findIndex((card) => card.id === cardId);
          if (index >= 0) return { columnIndex: c, cardIndex: index };
        }
        return null;
      },
      [all],
    );

    const announceMove = React.useCallback(
      (card: KanbanCard, column: KanbanColumn, position: number, total: number) => {
        const sentence =
          formatMoveAnnouncement !== undefined
            ? formatMoveAnnouncement(textOf(card.title), textOf(column.title), position, total)
            : /* No default sentence is invented: with none given, the live
                 region stays silent and the reader still hears the card's own
                 label re-read by the browser when focus follows it. A default
                 English sentence here could not be translated (PATTERN §7). */
              "";
        setAnnouncement(sentence);
      },
      [formatMoveAnnouncement],
    );

    const commit = React.useCallback(
      (cardId: string, toColumnId: string, toIndex: number) => {
        const at = locate(cardId);
        if (at === null || onMove === undefined) return;
        const from = all[at.columnIndex];
        const to = all.find((column) => column.id === toColumnId);
        const card = (from.cards ?? [])[at.cardIndex];
        if (to === undefined || card === undefined) return;
        if (to.locked === true || card.disabled === true) {
          setAnnouncement(moveRefusedLabel);
          return;
        }
        onMove({ cardId, fromColumnId: from.id, toColumnId, toIndex });
        announceMove(card, to, toIndex + 1, (to.cards ?? []).length + (to.id === from.id ? 0 : 1));
      },
      [all, locate, onMove, announceMove, moveRefusedLabel],
    );

    /* ArrowLeft / ArrowRight are PHYSICAL keys. They are mapped through the
       document's own direction so that pressing the key on the reading-start
       side always moves the card towards the reading start — which in Arabic,
       Urdu and Persian is the opposite column from English. */
    const moveByKey = React.useCallback(
      (cardId: string, key: string) => {
        const at = locate(cardId);
        if (at === null) return;
        const rtl =
          boardRef.current !== null &&
          typeof window !== "undefined" &&
          window.getComputedStyle(boardRef.current).direction === "rtl";

        if (key === "ArrowUp" || key === "ArrowDown") {
          const column = all[at.columnIndex];
          const next = at.cardIndex + (key === "ArrowUp" ? -1 : 1);
          if (next < 0 || next > (column.cards ?? []).length - 1) return;
          commit(cardId, column.id, next);
          return;
        }

        const towardsStart = rtl ? key === "ArrowRight" : key === "ArrowLeft";
        const target = at.columnIndex + (towardsStart ? -1 : 1);
        if (target < 0 || target > all.length - 1) return;
        commit(cardId, all[target].id, (all[target].cards ?? []).length);
      },
      [all, locate, commit],
    );

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

    if (all.length === 0 && !loading) {
      return (
        <EmptyRegister>
          <span role="status">{emptyLabel}</span>
        </EmptyRegister>
      );
    }

    return (
      <div
        ref={(node) => {
          boardRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref !== null) ref.current = node;
        }}
        data-slot="kanban"
        aria-label={label}
        aria-busy={loading || undefined}
        style={{ "--kw-kanban-col": columnWidth, ...style } as React.CSSProperties}
        className={cn(
          // The board: a scrolling row of columns, snapped so a thumb lands a
          // column square on a phone. `scroll-p-1` keeps a focus ring whole.
          // The gap is the artifact's own: CH19 view 02 draws the board at
          // `gap: 10px`, which is `--space-2h`.
          "flex min-w-0 snap-x snap-mandatory gap-[var(--space-2h)] overflow-x-auto scroll-p-1 pb-2",
          className,
        )}
        {...props}
      >
        {all.map((column) => (
          <Column
            key={column.id}
            column={column}
            columnMaxHeight={columnMaxHeight}
            movable={movable}
            loading={loading}
            loadingCards={loadingCards}
            carrying={carrying}
            over={over}
            emptyColumnLabel={emptyColumnLabel}
            cardRoleLabel={cardRoleLabel}
            moveHintLabel={moveHintLabel}
            onCardSelect={onCardSelect}
            onCarry={setCarrying}
            onOver={setOver}
            onDropCard={(cardId, toIndex) => {
              commit(cardId, column.id, toIndex);
              setCarrying(null);
              setOver(null);
            }}
            onMoveKey={moveByKey}
          />
        ))}

        {/* Where a move is said out loud. Polite, never assertive: a move is
            something the reader just did, not an interruption. It is empty
            unless `formatMoveAnnouncement` was given, because a default
            English sentence could not be translated. */}
        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>
    );
  },
);

Kanban.displayName = "Kanban";

/* ----------------------------------------------------------------------------
   One column. Local — a column outside a board has no measure and no
   neighbours to move a card to.
   ------------------------------------------------------------------------- */
function Column({
  column,
  columnMaxHeight,
  movable,
  loading,
  loadingCards,
  carrying,
  over,
  emptyColumnLabel,
  cardRoleLabel,
  moveHintLabel,
  onCardSelect,
  onCarry,
  onOver,
  onDropCard,
  onMoveKey,
}: {
  column: KanbanColumn;
  columnMaxHeight?: string;
  movable: boolean;
  loading: boolean;
  loadingCards: number;
  carrying: string | null;
  over: string | null;
  emptyColumnLabel: string;
  cardRoleLabel: string;
  moveHintLabel: string;
  onCardSelect?: (card: KanbanCard, column: KanbanColumn) => void;
  onCarry: (id: string | null) => void;
  onOver: (id: string | null) => void;
  onDropCard: (cardId: string, toIndex: number) => void;
  onMoveKey: (cardId: string, key: string) => void;
}) {
  const cards = column.cards ?? [];
  const count = column.count ?? cards.length;
  const droppable = movable && column.locked !== true;
  const isOver = droppable && over === column.id;

  return (
    <section
      data-slot="kanban-column"
      data-locked={column.locked === true ? "" : undefined}
      /* `.motion-drop-target` owns the `--accent` wash and its timing; this
         file only sets the attribute it selects on. */
      data-over={isOver ? "true" : undefined}
      onDragOver={
        droppable
          ? (event) => {
              event.preventDefault();
              onOver(column.id);
            }
          : undefined
      }
      onDragLeave={droppable ? () => { onOver(null); } : undefined}
      onDrop={
        droppable
          ? (event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/plain");
              if (id) onDropCard(id, cards.length);
            }
          : undefined
      }
      className={cn(
        "motion-drop-target",
        // CH19 view 02 draws the column as a flex column at `gap: 8px`.
        "flex w-[var(--kw-kanban-col)] shrink-0 snap-start flex-col gap-2",
        /* THE COLUMN IS BARE — no fill, no radius, no inset. CH19 view 02
           draws the head and the cards as siblings straight on the frame's
           soft paper; there is no column band in the chapter at all.

           This file previously painted `bg-surface-panel` at the card radius
           and gave the reason as PATTERN §11 legibility — "what makes the
           `--card` cards inside it visible in LIGHT". THAT REASON DIED WITH
           THE K1 REVERSAL (override 15): the frame's own panel is now
           `--surface-panel`, so a `--surface-panel` column band measured
           1.000 against the ground it stood on — invisible — while the
           `--card` cards it was there to lift already read at 1.103 light /
           1.111 dark against that same soft paper on their own. The band was
           doing nothing but adding a 12 inset the chapter does not draw.
           GAPS-FIDELITY-DE L-17. */
      )}
    >
      {/* `padding: 4px 6px` — CH19 view 02's own head inset, which the column
          band's 12 had been standing in for. */}
      <header className="flex min-w-0 items-center gap-2 px-[var(--space-1h)] py-1">
        {/* 12 / 500. CH19 view 02 draws the column name at
            `font-size: 12px; font-weight: 500`, which is `text-badge`'s step
            — `text-caption` is 13 and was one rung high. */}
        <h3 className="min-w-0 flex-1 text-xs font-[var(--font-weight-medium)]">
          {column.title}
        </h3>
        {/* A COUNT IS A QUIET NUMBER, NOT A PILL. CH19 view 02 draws the
            column count `font-size: 11px; color: var(--fg3);
            font-variant-numeric: tabular-nums` — no fill, no radius, no
            inset. CH14 states the rule in words on the folder strip, which
            draws the identical object: "counts are quiet, never badges."
            This was a `<Badge count>`, whose quiet variant is a
            `--surface-quiet` pill at 12/500. GAPS-FIDELITY-DE L-18.

            THE TWO BADGE LAWS THAT MATTERED ARE KEPT, not lost with the pill:
            a count renders EMPTY at zero and never "0", and a count that has
            not arrived renders nothing rather than a placeholder zero.
            `text-micro` is the 11 rung and drags the eyebrow's 0.08em, which
            a number is not, so the tracking is reset — the same pair
            `kanban`'s own card meta line and `gantt`'s period head use. */}
        {!loading && count > 0 ? (
          <span className="text-micro tracking-[var(--tracking-normal)] tabular-nums text-ink-tertiary">
            {count}
          </span>
        ) : null}
        {column.action}
      </header>

      <div
        data-slot="kanban-column-cards"
        className={cn(
          // 8, with the column. The artifact stacks head and cards as
          // siblings of one `gap: 8px` column, so the cards keep that
          // measure rather than opening to 12.
          "flex min-w-0 flex-col gap-2",
          columnMaxHeight !== undefined && "overflow-y-auto scroll-p-1",
        )}
        style={columnMaxHeight === undefined ? undefined : { maxHeight: columnMaxHeight }}
      >
        {loading ? (
          Array.from({ length: Math.max(loadingCards, 0) }, (_, index) => (
            <Card variant="raised" key={`placeholder-${index}`}>
              <CardContent>
                <Skeleton variant="text" lines={2} announce={index === 0} />
              </CardContent>
            </Card>
          ))
        ) : cards.length === 0 ? (
          <EmptyRegister>
            <span role="status">{column.emptyLabel ?? emptyColumnLabel}</span>
          </EmptyRegister>
        ) : (
          cards.map((card, index) => (
            <BoardCard
              key={card.id}
              card={card}
              column={column}
              index={index}
              movable={movable}
              carrying={carrying}
              cardRoleLabel={cardRoleLabel}
              moveHintLabel={moveHintLabel}
              onCardSelect={onCardSelect}
              onCarry={onCarry}
              onDropCard={onDropCard}
              onMoveKey={onMoveKey}
            />
          ))
        )}
      </div>

      {column.footer}
    </section>
  );
}

/* ----------------------------------------------------------------------------
   One card. Local for the same reason a column is: outside a board it is just
   a `Card`, which the call site already has.

   Everything drawn here is `card.tsx`'s — the 24 radius, the `--card` fill,
   the inset, the `--accent` hover and the elevation. What this function adds
   is the drag wiring and the keyboard door, neither of which is a drawing.
   ------------------------------------------------------------------------- */
function BoardCard({
  card,
  column,
  index,
  movable,
  carrying,
  cardRoleLabel,
  moveHintLabel,
  onCardSelect,
  onCarry,
  onDropCard,
  onMoveKey,
}: {
  card: KanbanCard;
  column: KanbanColumn;
  index: number;
  movable: boolean;
  carrying: string | null;
  cardRoleLabel: string;
  moveHintLabel: string;
  onCardSelect?: (card: KanbanCard, column: KanbanColumn) => void;
  onCarry: (id: string | null) => void;
  onDropCard: (cardId: string, toIndex: number) => void;
  onMoveKey: (cardId: string, key: string) => void;
}) {
  const draggable = movable && card.disabled !== true;
  const dragging = carrying === card.id;
  const pressable = onCardSelect !== undefined && card.disabled !== true;
  const reachable = draggable || pressable;

  return (
    <Card
      variant="raised"
      data-slot="kanban-card"
      data-dragging={dragging ? "true" : undefined}
      aria-disabled={card.disabled === true || undefined}
      aria-roledescription={draggable ? cardRoleLabel : undefined}
      interactive={reachable}
      draggable={draggable}
      tabIndex={reachable ? 0 : undefined}
      role={pressable ? "button" : undefined}
      onDragStart={
        draggable
          ? (event) => {
              event.dataTransfer.setData("text/plain", card.id);
              event.dataTransfer.effectAllowed = "move";
              onCarry(card.id);
            }
          : undefined
      }
      onDragEnd={draggable ? () => { onCarry(null); } : undefined}
      onDragOver={
        movable
          ? (event) => {
              event.preventDefault();
            }
          : undefined
      }
      onDrop={
        movable
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              const id = event.dataTransfer.getData("text/plain");
              if (id && id !== card.id) onDropCard(id, index);
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (
          draggable &&
          (event.key === "ArrowLeft" ||
            event.key === "ArrowRight" ||
            event.key === "ArrowUp" ||
            event.key === "ArrowDown")
        ) {
          event.preventDefault();
          onMoveKey(card.id, event.key);
          return;
        }
        if (pressable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onCardSelect?.(card, column);
        }
      }}
      onClick={
        pressable
          ? () => {
              onCardSelect?.(card, column);
            }
          : undefined
      }
      className={cn(
        // motion.css §15 owns the lift, the carry and the settle. No keyframe,
        // no duration and no easing is written in this file.
        "motion-drag",
        draggable && "cursor-grab",
        // A fill and an ink. Never an opacity, and no hover — a locked card
        // must not look movable.
        card.disabled === true &&
          "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]",
      )}
    >
      <CardContent className="flex min-w-0 flex-col gap-2">
        {/* No weight. CH19 view 02 draws the card title
            `font-size: 13px; line-height: 1.35` and writes no `font-weight`,
            so it inherits the demo's 300 — the id above it and the meta
            below carry the hierarchy, not the title. The RECORD NAME in
            view 01 is 500; a board card's title is not. */}
        <p className="min-w-0 text-caption leading-[var(--leading-h3)]">{card.title}</p>
        {card.description !== undefined && card.description !== null ? (
          /* 11, the artifact's meta step. `text-micro` is the eyebrow rung
             and drags 0.08em with it; a meta line is not an eyebrow, so the
             tracking is reset the way `timeline.tsx` already does. */
          <p className="min-w-0 text-micro tracking-[var(--tracking-normal)] leading-[var(--leading-normal)] text-ink-tertiary">
            {card.description}
          </p>
        ) : null}
        {card.content}
        {card.badges !== undefined && card.badges !== null ? (
          <div className="flex flex-wrap items-center gap-2">{card.badges}</div>
        ) : null}
        {/* Read once when the card takes focus. A prop, because the key names
            and the sentence around them both have to reach Arabic, Urdu and
            Persian. */}
        {draggable ? <span className="sr-only">{moveHintLabel}</span> : null}
      </CardContent>
    </Card>
  );
}

export { Kanban };
