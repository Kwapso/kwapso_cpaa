/* ============================================================================
   Gallery — the one view where an image leads.

   DESIGN SOURCE
   `KWAPSO-SPEC.md` CH19 view 11 and CH27.28 "Gallery · For records whose
   content is a picture". CH27.28's rules are the brief, verbatim:

       "Offered only where images exist — Gallery appears in the view switcher
        for deliverables, assets and screens. It is never offered for tickets,
        accounts or sprints — an image-led view of text records is a grid of
        empty boxes pretending to be content."

       "One ratio, no cropping surprises — Every tile is 16:9 with the image
        contained, corners at the 24 radius, and the caption below it. Portrait
        assets letterbox onto paper rather than being cropped to fill — the
        brand shows the whole artefact."

       "The caption is a row, not a paragraph — Title on one line with an
        ellipsis, then one line carrying the status pill and the age. Two lines
        maximum under any tile, so the grid stays a grid."

       "No image is a state, not a placeholder — A record with nothing attached
        shows its title on soft paper at the same tile size — never a camera
        glyph, never a dashed box, never a mango 'upload' prompt in the grid."

       "The grid fills, it does not stretch — Columns are auto-filled at a 200
        minimum, so the tile size stays constant and the number of columns
        changes with the window. A tile never grows to 400 because there are
        only two records."

       "Narrow goes two-up — Below 720 the grid is two columns with a shorter
        image and a two-line caption; below 420 it is one. The image shrinks,
        the type does not."

   CH27.28's drawn value is the grid itself:

       grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))

   THE LAW THIS FILE OBEYS
   · `auto-fill`, NOT `auto-fit`. The two differ in exactly the case CH27.28
     rules on: `auto-fit` collapses the empty tracks and lets two tiles stretch
     across the whole row, which is the "never grows to 400" the chapter
     forbids. `CardGrid`'s `fluid` is `auto-fit`, so it is not used here — the
     wall in this file is a template, not a second card. Logged as
     GAPS-TRACK2A GAL-1.
   · NO CROPPING. `Image fit="contain"` at 16:9, which letterboxes a portrait
     asset onto the quiet ground rather than trimming it. `cover` would cut a
     face out of the frame, which CH27.28 rules out by name.
   · NO PLACEHOLDER GLYPH. A tile with no picture draws its own title on soft
     paper, at the same 16:9 box. It is `aria-hidden`, because the caption
     under it already carries the title and a screen reader must not hear the
     name of the record twice; the stand-in is a picture of the words, not a
     second label.
   · THE CAPTION IS TWO LINES, HARD. Title on one line with an ellipsis; then
     one line for the status pill and the age. Nothing else fits under a tile.
   · The tile is `Card` and the picture is `Image`. Neither is redrawn: the
     radius, the fill, the hover lift, the picture's own loading and failure
     registers are all theirs.
   · Radii: 24 on the tile and on the media box. Nothing else.
   · Never mango — including for the missing-image state, which CH27.28 names.
   · Focus is one global rule (tokens.css §8). No `border` property, no
     opacity, rem only, LTR only.

   RENDERING CONTEXT
   `"use client"`. A pressable tile means a handler is built during this
   module's own render, and `Image` and `Card` are both client components.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card } from "../card/card";
import { Image } from "../image/image";
import { Skeleton } from "../skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

export interface GalleryTile {
  /** Stable id. The React key, and the handle `onTileSelect` is given. */
  id: string;
  /** The record's name. One line, with an ellipsis. */
  title: React.ReactNode;
  /** The picture. Absent, the tile shows its title on soft paper instead. */
  src?: string;
  /**
   * What the picture shows, for a reader who cannot see it. Empty is correct
   * where the title already says it — which on a deliverable it usually does.
   */
  alt?: string;
  /** The status pill. A `Badge` from the call site; this file draws no pill. */
  status?: React.ReactNode;
  /** The age, at the inline end of the caption line. Already formatted. */
  meta?: React.ReactNode;
  /** The picture could not be fetched. `Image`'s own failure register. */
  error?: boolean;
  /** Cannot be opened. A fill and an ink; the tile still reads. */
  disabled?: boolean;
}

export interface GalleryProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /** The tiles, in the order they should read. This view never sorts. */
  tiles: readonly GalleryTile[];
  /** Opening a tile. Without it a tile is not a target and takes no tab stop. */
  onTileSelect?: (tile: GalleryTile) => void;

  /**
   * The narrowest a tile may be before the grid drops a column. CH27.28's
   * figure, in rem. Only read at the widths where the grid auto-fills.
   */
  minTileWidth?: string;
  /** The tile's ratio. CH27.28 states one and this is it. */
  ratio?: number;

  /** The wall's accessible name. */
  label?: string;

  /* ---- the three registers ------------------------------------------------ */
  loading?: boolean;
  /** How many placeholder tiles to draw while `loading`. */
  loadingTiles?: number;
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

/**
 * A wall of picture-led records.
 *
 * TEN STATES
 *  1. default        — tiles at one ratio in an auto-filled grid, each with a
 *                      two-line caption under it.
 *  2. hover          — the TILE's, via `Card interactive`: the `--accent` wash
 *                      and `.motion-hover-lift`. The picture itself does not
 *                      move, zoom or dim — CH35 puts photography under type,
 *                      and a picture that scaled under the pointer would be
 *                      the scrim rule broken by motion instead of colour.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once, at
 *                      the tile's own 24. The wall sets no `overflow: hidden`.
 *  4. active/pressed — does not apply as a skin. Pressing a tile opens the
 *                      record.
 *  5. disabled       — per tile: `--btn-disabled-fill` /
 *                      `--btn-disabled-label`, `aria-disabled`, no hover, no
 *                      tab stop that does nothing. A fill and an ink.
 *  6. loading        — `loading`: `Skeleton variant="media"` in the same grid
 *                      at the same ratio, so the placeholder wall is the shape
 *                      of the real one and nothing reflows on arrival.
 *  7. empty          — no tiles, or `empty`: the quiet register across the
 *                      whole wall. Distinct from a tile with no picture, which
 *                      is a normal tile and NOT a register — CH27.28 makes the
 *                      distinction itself.
 *  8. error          — `error`: the register with a poppy dot, also across the
 *                      whole wall. A single PICTURE that failed is `Image`'s
 *                      own register inside its tile, and the tile stays.
 *  9. selected       — does not apply. The kit draws no selected card
 *                      (GAPS-F CRD-3) and a gallery may not invent one.
 * 10. read-only      — without `onTileSelect` the wall is read-only.
 *
 * THREE BREAKPOINTS — and here the answer is CH27.28's own, at its own two
 * thresholds rather than Tailwind's.
 *  · base, to 26.25rem (the kit's 420) — ONE column. "Below 420 it is one."
 *  · 26.25rem to 45rem (the kit's 720) — TWO columns, fixed, not auto-filled:
 *    "below 720 the grid is two columns with a shorter image". The image
 *    shrinks with the column because the ratio is fixed; the type does not,
 *    because nothing here scales a type step.
 *  · 45rem and up — the auto-filled grid at the 200 minimum. The tile size
 *    stays constant and the COLUMN COUNT changes with the window.
 *
 * RTL — LTR only (ruling 10). Every inset is logical, the grid's order follows
 * the document and no rule names a side.
 */
const Gallery = React.forwardRef<HTMLDivElement, GalleryProps>(
  (
    {
      className,
      tiles,
      onTileSelect,
      minTileWidth = "12.5rem",
      ratio = 16 / 9,
      label = "Gallery",
      loading = false,
      loadingTiles = 6,
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
       empty. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : empty || tiles.length === 0
          ? "empty"
          : "default";

    /* The three column ladders, as custom properties so the breakpoint can
       swap which one is live from inside a class — an inline `style` beats a
       media query, so the template itself cannot be an inline value. */
    const grid = cn(
      "grid min-w-0 items-start gap-[var(--space-3h)]",
      "[grid-template-columns:var(--gal-cols)]",
      // Below the kit's 420: one column.
      "[--gal-cols:minmax(0,1fr)]",
      // The kit's 420: two, fixed.
      "min-[26.25rem]:[--gal-cols:repeat(2,minmax(0,1fr))]",
      // The kit's 720: auto-FILL, so a short wall does not stretch its tiles.
      "min-[45rem]:[--gal-cols:repeat(auto-fill,minmax(var(--gal-min),1fr))]",
    );

    if (state !== "default") {
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
            data-slot="gallery"
            data-state={state}
            aria-busy={loading || undefined}
            className={cn("min-w-0", className)}
            {...props}
          >
            {register}
          </div>
        );
      }
    }

    return (
      <div
        ref={ref}
        data-slot="gallery"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        style={{ ["--gal-min" as string]: minTileWidth, ...style }}
        className={cn(grid, className)}
        {...props}
      >
        {state === "loading"
          ? Array.from({ length: loadingTiles }, (_, i) => (
              <Skeleton
                key={i}
                variant="media"
                label={loadingLabel}
                /* One voice. Six saying "Loading" at once is worse than one. */
                announce={i === 0}
              />
            ))
          : tiles.map((tile) => {
              const pressable = Boolean(onTileSelect) && tile.disabled !== true;

              return (
                <Card
                  key={tile.id}
                  data-slot="gallery-tile"
                  /* Law 3, tone alternates on nesting. The wall sits inside a
                     soft-paper frame, `Card`'s own default IS soft paper, and
                     CH27.28 puts the missing-picture title ON soft paper — so
                     a default tile would be the same tone as the band under it
                     AND the same tone as the block inside it, twice invisible.
                     `raised` is off-beige over soft paper, which is the pairing
                     the chapter's drawing shows. */
                  variant="raised"
                  interactive={pressable}
                  aria-disabled={tile.disabled === true || undefined}
                  role={pressable ? "button" : undefined}
                  tabIndex={pressable ? 0 : undefined}
                  onClick={pressable ? () => onTileSelect?.(tile) : undefined}
                  onKeyDown={
                    pressable
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onTileSelect?.(tile);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    "flex min-w-0 flex-col gap-[var(--space-2h)] p-[var(--space-2h)]",
                    pressable && "cursor-pointer",
                    tile.disabled === true &&
                      "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]",
                  )}
                >
                  {tile.src ? (
                    /* Contained, never cropped: a portrait asset letterboxes
                       onto the quiet ground rather than losing its edges. */
                    <Image
                      src={tile.src}
                      alt={tile.alt ?? ""}
                      ratio={ratio}
                      fit="contain"
                      error={tile.error}
                      errorLabel={errorLabel}
                      loadingLabel={loadingLabel}
                    />
                  ) : (
                    /* No picture is a STATE, not a placeholder: the title on
                       soft paper at the same tile size. Hidden from the
                       accessibility tree because the caption below already
                       says it, and a reader must not hear it twice. */
                    <div
                      data-slot="gallery-tile-untitled"
                      aria-hidden="true"
                      style={{ aspectRatio: String(ratio) }}
                      className={cn(
                        "flex w-full items-end rounded-[var(--radius)] bg-surface-panel p-[var(--space-3h)]",
                        "text-sm font-[var(--font-weight-medium)] text-ink-tertiary",
                      )}
                    >
                      <span className="line-clamp-3 min-w-0">{tile.title}</span>
                    </div>
                  )}

                  {/* Two lines, and no more. */}
                  {/* The two caption lines sit at the tile's own 10: in the
                      artifact the media well, the name and the meta are three
                      siblings of one `gap: 10px` column, so grouping the pair
                      must not shrink the measure between them to 4. */}
                  <div
                    data-slot="gallery-caption"
                    className="flex min-w-0 flex-col gap-[var(--space-2h)] px-1 pb-1"
                  >
                    {/* 14 / 500, as drawn. `text-caption` is 13. */}
                    <span className="truncate text-sm font-[var(--font-weight-medium)]">
                      {tile.title}
                    </span>
                    {tile.status !== undefined ||
                    (tile.meta !== undefined && tile.meta !== null) ? (
                      <span className="flex min-w-0 items-center gap-2">
                        {tile.status}
                        {tile.meta !== undefined && tile.meta !== null ? (
                          <span className="ms-auto flex-none text-xs tabular-nums text-ink-tertiary">
                            {tile.meta}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </Card>
              );
            })}
      </div>
    );
  },
);

Gallery.displayName = "Gallery";

export { Gallery };
