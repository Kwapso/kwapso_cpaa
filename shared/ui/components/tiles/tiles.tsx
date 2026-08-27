/* ============================================================================
   Tiles — collection view 20, "one big tile per record" (0 direct call sites;
   a body swap for `CollectionFrame`).

   DESIGN SOURCE
   Kit chapter 19 ("Collection views"), view 20, read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. The chapter's own
   line for it, verbatim from the view table:

       tiles · "One big tile per record, room-readable"
             · fits "Portfolio health on a wall screen"
             · switch label "Tiles"

   and the contract the whole chapter is built on, also verbatim:

       "Every view carries the same contract: search, filters, three actions,
        view switch. Only the body below the toolbar changes."

   So this file is a BODY. No toolbar, no pager, no heading.

   ROOM-READABLE IS THE WHOLE DESIGN
   The tile carries one figure at the 44 step with -0.025em tracking — the
   same step chapter 18 gives its KPI numbers — because the view's stated fit
   is a wall screen: a portfolio read from across a room. Everything else on
   the tile is small and quiet around it. That is why there is no body copy
   slot: a paragraph on a wall screen is not read, and adding one would turn
   this view back into `CardGrid`.

   THE DRAWING, transcribed
     · the wall  — `grid-template-columns: repeat(4, 1fr)`, `gap: 12px`,
                   cells stretched to a common height
     · a tile    — radius 24, `padding: 18px`, column, `gap: 8px`
     · the head  — a 9px dot at `border-radius: 999px` and the record name at
                   12/500, `gap: 8px`
     · the figure— 44/500, `letter-spacing: -0.025em`, tabular, pushed to the
                   bottom of the tile with `margin-top: auto`
     · the meta  — 12px under it

   COMPOSE, DO NOT REBUILD
   A tile is a `Card`. The artifact's three tile fills are the three `Card`
   variants already in the system, one for one:
     `var(--card)` -> `raised` · `var(--mango)` -> `brand` ·
     `var(--inv)`  -> `inverse`
   This file draws no fill, no radius and no shadow of its own.

   THE META LINE, AND HOW IT IS QUIETENED
   The drawn meta line is `opacity: .7`. An opacity is a standing rejection
   (PATTERN 9), and until 2026-08-23 there was no "secondary ink on an accent"
   token to reach for instead - `--ink-secondary` is the charcoal-page tier
   and is unreadable on the inverse tile - so the meta printed unquietened.
   Client ruling M2 added `--ink-on-accent-secondary` and
   `--ink-on-inverse-secondary`, and TILE_META_INK below picks one per tone.
   The artifact's intent, expressed as an ink rather than a filter. Asked as
   GAPS-TRACK2B TIL-1.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref, holds no state, calls no
   hook and creates no handler during its own render.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card } from "../card/card";
import { Skeleton } from "../skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ----------------------------------------------------------------------------
   The column ladders, written out rather than interpolated — Tailwind
   compiles the class names it can SEE, and `lg:grid-cols-${n}` produces no
   rule at all. Same reasoning as `CardGrid`.
   ------------------------------------------------------------------------- */
const COLUMNS = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
} as const;

export type TilesColumns = keyof typeof COLUMNS;

/**
 * The tile's fill. The artifact's own three, named as `Card` names them.
 * `brand` is mango with charcoal ink and the kit rules ONE per view, so it is
 * per-tile and opt-in; `inverse` is chapter 13's closing block.
 */
export type TileTone = "default" | "brand" | "inverse";

/** The tile fill -> the `Card` variant that already draws it. */
const TILE_VARIANT = {
  default: "raised",
  brand: "brand",
  inverse: "inverse",
} as const;

/* The meta line's ink, one entry per tone. RULED M2, 2026-08-23,
   verify/decisions.html M. The artifact draws this line at `opacity: .7`,
   which PATTERN 9 rejects, and until now there was no quieter ink to reach
   for on an accent - so the meta printed at the tile's own full strength and
   nothing receded. `--ink-on-accent-secondary` and
   `--ink-on-inverse-secondary` now exist for exactly this, and the paper tile
   uses the tier it always had. The intent is the artifact's; only the
   mechanism is ours, an ink instead of a filter. */
const TILE_META_INK = {
  default: "text-ink-secondary",
  brand: "text-ink-on-accent-secondary",
  inverse: "text-ink-on-inverse-secondary",
} as const;

/** The mark's fill. A status dot, ruling 26: the dot never speaks alone. */
export type TileDotTone = "none" | "shipped" | "info" | "blocked" | "brand";

const DOT_TONE = {
  none: "",
  shipped: "bg-success",
  info: "bg-info",
  blocked: "bg-destructive",
  /* The kit's own drawing puts mango on a tile's dot. It is the BRAND on a
     record, not a status — the words beside it carry the state. */
  brand: "bg-surface-brand",
} as const;

export interface TileItem {
  /**
   * React key. Required, because a wall is re-sorted whenever the toolbar
   * sorts the collection and a positional key would carry the wrong figure
   * onto the wrong record.
   */
  id: string;
  /** The record's name, at the badge step beside its dot. */
  name: React.ReactNode;
  /** The one figure the room reads. Rendered tabular at the 44 step. */
  value: React.ReactNode;
  /** The line under the figure — what the figure counts. */
  meta?: React.ReactNode;
  /** Which fill the tile takes. Mango is one per view; the kit says so. */
  tone?: TileTone;
  /** Which mark sits beside the name, if any. */
  dot?: TileDotTone;
  /**
   * What the dot means, in words. Required by ruling 26 whenever a dot is
   * drawn: colour never carries a state alone. Read by a screen reader.
   */
  dotLabel?: string;
}

export interface TilesProps extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The records, one tile each, in the order they should read. This view never sorts. */
  items?: TileItem[];
  /**
   * How many columns the wall reaches at DESKTOP. Mobile is always one and
   * tablet always two; see the breakpoint block. The artifact draws four.
   */
  columns?: TilesColumns;
  /** Render as a list, where the wall really is one. The tiles stay `Card`s. */
  as?: "div" | "ul";
  /** Accessible name for the wall as a whole. */
  label?: string;

  /** The wall has not arrived. Cold cache only. */
  loading?: boolean;
  /** How many placeholder tiles to draw while `loading`. */
  loadingCells?: number;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with items present. */
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
 * One big tile per record.
 *
 * TEN STATES
 *  1. default        — a flush grid of equal-height tiles at the token gap.
 *  2. hover          — NONE. The artifact's tile is a READING on a wall
 *                      screen, not a target: nobody is pointing at a screen
 *                      across a room. A tile that is a link is wrapped by the
 *                      call site, which is also where `Card interactive`
 *                      belongs.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The wall sets no
 *                      `overflow: hidden`, so a wrapped tile shows its ring
 *                      in full.
 *  4. active/pressed — belongs to whatever the call site wraps a tile in.
 *  5. disabled       — does not apply. A wall is a layout, and an unavailable
 *                      record keeps its paper: dimming a tile would be an
 *                      opacity, which is a rejection.
 *  6. loading        — `loading`: `Skeleton variant="card"` in the same grid,
 *                      so the placeholder wall is the shape of the real one
 *                      and nothing reflows when the figures land.
 *  7. empty          — no items, or `empty`: the quiet register spanning the
 *                      whole grid. NOT `null` — a filter that matched nothing
 *                      must say so.
 *  8. error          — `error`: the register with a poppy dot, spanning the
 *                      grid. Beats `empty`.
 *  9. selected       — does not apply. The artifact draws no selected tile,
 *                      and `Card` has no selected state either (GAPS-F CRD-3);
 *                      a wall may not invent one on its behalf.
 * 10. read-only      — always. A tile holds no value.
 *
 * THREE BREAKPOINTS, and the 380 answer
 *  · mobile (base) — ONE column. The tile's whole point is a 44-step figure;
 *    two tiles side by side at 380 leave about 11rem each, and the figure
 *    plus a two-word name no longer fits on one line. One column at 380 is
 *    still room-readable, which four columns of 5rem would not be.
 *  · tablet (`sm:`, 40rem) — TWO columns at every `columns` setting.
 *  · desktop (`lg:`, 64rem) — `columns` columns: 2, 3 or 4. Four is the
 *    artifact's own figure and the default.
 *
 * RTL — safe, and unused: the system is LTR only (ruling 10). No side is
 * named and the grid order follows the document.
 */
const Tiles = React.forwardRef<HTMLDivElement, TilesProps>(
  (
    {
      className,
      items = [],
      columns = 4,
      as = "div",
      label,
      loading = false,
      loadingCells = 4,
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
      ...props
    },
    ref,
  ) => {
    /* Narrowed for the ref: `ul` and `div` do not share one element type, and
       the root is the same box either way. Same shape as `CardGrid`. */
    const Root = as as "div";

    /* Exclusive states resolved in JS (PATTERN §4). */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : items.length === 0 || empty
          ? "empty"
          : "default";

    const register = (node: React.ReactNode) => (
      <div className="col-span-full min-w-0">{node}</div>
    );

    return (
      <Root
        ref={ref as React.Ref<HTMLDivElement>}
        data-slot="tiles"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("grid min-w-0 items-stretch gap-3", COLUMNS[columns], "[&>*]:h-full", className)}
        {...props}
      >
        {state === "loading"
          ? (loadingState ??
            Array.from({ length: loadingCells }, (_, i) => (
              <Skeleton
                key={i}
                variant="card"
                label={loadingLabel}
                announce={i === 0}
                className="h-[9rem]"
              />
            )))
          : null}

        {state === "error"
          ? register(
              errorState ?? (
                <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
              ),
            )
          : null}

        {state === "empty"
          ? register(
              emptyState ?? (
                <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
              ),
            )
          : null}

        {state === "default"
          ? items.map((item) => {
              const tone = item.tone ?? "default";
              const dot = item.dot ?? "none";

              return (
                <Card
                  key={item.id}
                  data-slot="tile"
                  data-tone={tone}
                  variant={TILE_VARIANT[tone]}
                  /* `padding: 18px` and `gap: 8px`, as drawn. The inset is
                     the tile's own, not `CardContent`'s 24: a tile is a
                     figure in a box, not a card with a body. */
                  className="gap-2 p-[var(--space-4h)]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {dot === "none" ? null : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-[0.5625rem] shrink-0 rounded-pill",
                          DOT_TONE[dot],
                        )}
                      />
                    )}
                    <span className="min-w-0 truncate text-badge font-[var(--font-weight-medium)]">
                      {item.name}
                    </span>
                    {/* Ruling 26: the dot never speaks alone. Said in words,
                        to whoever cannot see the colour. */}
                    {dot === "none" || item.dotLabel === undefined ? null : (
                      <span className="sr-only">{item.dotLabel}</span>
                    )}
                  </span>

                  <span className="mt-auto text-4xl font-[var(--font-weight-medium)] tabular-nums">
                    {item.value}
                  </span>

                  {item.meta === undefined ? null : (
                    <span className={cn("text-badge", TILE_META_INK[tone])}>{item.meta}</span>
                  )}
                </Card>
              );
            })
          : null}
      </Root>
    );
  },
);

Tiles.displayName = "Tiles";

export { Tiles };
