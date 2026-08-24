/* ============================================================================
   StatGrid — the strip of headline numbers (3 direct call sites).

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" → chapter 18 "Data display", the first specimen
   block: four KPI cards headed "Due today", "Open sprints", "Retainer
   coverage" and "Hours logged". Read off the specimen's inline styles, figure
   by figure:

     · the strip   — `display:grid;
                      grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
                      gap:14px` — auto-fit, so the strip decides its own
                      column count from the width it is given and needs no
                      breakpoint of its own.
     · the tile    — `border-radius:24px; padding:22px; display:flex;
                      flex-direction:column; gap:6px`
     · the eyebrow — `font-size:11px; font-weight:500; text-transform:uppercase;
                      letter-spacing:0.08em`, tertiary ink
     · the figure  — `font-size:44px; font-weight:500; letter-spacing:-0.025em;
                      line-height:1.04; font-variant-numeric:tabular-nums`.
                      44 / -0.025em is `--text-4xl` exactly, so `text-4xl`
                      sets the size, the leading and the tracking in one class
                      and nothing is hand-set.
     · the support — `font-size:13px`, tertiary ink — the caption step.
     · the delta   — a 7px pill dot in `--forest` beside a 12.5 secondary
                      figure. The 7 is `.kw-notif__dot`'s own 0.4375rem in
                      design-mothership/specimens/kwapso-patterns.css.
     · the tones   — three, and only three: `--sheet` (the default),
                      `--mango` with charcoal ink, `--inv` with off-beige ink.
                      Chapter 26's own dev note is why there is no fourth:
                      "Sky, forest, and poppy never become a card/section
                      background — they stay inline marks."

   THE PERMISSION RULE, WHICH IS THIS COMPONENT'S WHOLE POINT
   Commission §9.3: a stat strip is "headline numbers with mini charts, where
   a panel renders *nothing* if the viewer lacks the right to see it." Chapter
   24.6 says the same thing about the record chrome: "Permissions hide actions
   rather than disabling them, so a client never sees a button they can't
   press."

   So `visible: false` renders NOTHING. Not a placeholder, not a lock icon,
   not a dimmed tile, not a gap in the grid. The tile is absent, the grid
   re-flows around it because `auto-fit` was always going to, and a strip
   whose every tile is hidden renders `null` rather than an empty band. A
   reader with no rights to any figure sees no figures region at all — which
   is the difference between "you may not see this" and "there is nothing
   here", and the strip must never say the first thing out loud.

   THE LAW THIS FILE OBEYS
   · One mango per view (kit ruling). `tone="brand"` is OPT-IN and never the
     default, exactly as `Card variant="brand"` and `Avatar variant="brand"`
     are. Chapter 18's own strip uses it once, on the first tile.
   · Charcoal on every accent: the mango tile's ink is `--ink-on-accent`,
     never white, in both palettes. `Card` already resolves that.
   · A figure that has not arrived renders NOTHING, never "0" — the same law
     `Badge` obeys. `loading` on a tile draws a `Skeleton` in the figure's
     place and keeps the tile, so the strip does not reflow when the number
     lands.
   · The delta's dot never carries the meaning alone (ruling 26): the delta's
     own words are always beside it.
   · Every number is tabular. A strip of figures that shifted column by
     column as digits changed would be unreadable.
   · Only four radii, no px, no hex, no font size. Focus is one global rule
     (tokens.css §8); a tile that is a LINK takes it at the tile's own radius,
     which is why nothing here sets `overflow: hidden`.

   RENDERING CONTEXT
   `"use client"`. A pressable tile means this module builds an event handler
   during its own render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card, cardVariants } from "../../controls/card/card";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { ScreenRegister } from "../screen-renderer/screen-renderer";

/**
 * Which of chapter 18's three tones the tile takes.
 *
 * `quiet` is the default and maps to `Card variant="default"` — SOFT PAPER,
 * the kit's `--sheet`, which is what CH18 draws.
 *
 * IT USED TO MAP TO `raised`, AND THE REASON DIED WITH THE K1 REVERSAL.
 * The old note read: "PATTERN §11 rules that a region holding cards is itself
 * `--surface-panel`, and a `--surface-panel` tile on a `--surface-panel` band
 * has contrast 1.000 in light" (GAPS-COL3 STG-1). That was true while a figure
 * strip stood on a soft-paper band. It does not stand on one any more, and it
 * never did in the kit:
 *
 *   · `SHELL.md`, the merged law — the figure strip lies BARE ON THE BODY
 *     PANE, which is OFF-BEIGE, and the one exception (the dashboard, 27.11)
 *     puts the figures in cards on that same off-beige pane. CH27.1 puts the
 *     strip ABOVE the collection panel, never inside it, so a tile is never
 *     standing on soft paper in the first place.
 *   · The page settles it. Sampled off the kit's own render of CH18: the
 *     page gutter is `rgb(255,254,249)` and the two quiet tiles beside the
 *     mango one are `rgb(247,242,236)` — `#F7F2EB`, soft paper on off-beige.
 *
 * So `raised` (`--card`, off-beige) measured 1.000 against the pane it
 * actually stands on: the exact failure the old note was written to avoid,
 * inverted by the papers moving. Register rows 15, 38 and 39 are the same
 * move. `Card`'s own comment says it in one line — `default` is soft paper
 * and is "the tone that is VISIBLE on the page".
 */
export type StatTone = "quiet" | "brand" | "inverse";

/** Which way the delta points. The words always say it too. */
export type StatDeltaDirection = "up" | "down" | "flat";

export interface StatItem {
  /** Stable key, and the value handed to `onItemSelect`. Falls back to the index. */
  id?: string;
  /** The uppercase micro line over the figure — what the number counts. */
  label: React.ReactNode;
  /**
   * The headline number, already formatted. A node, not a number: "87%",
   * "312", "6d" and "40 h / month" all appear in the kit's own strips, and a
   * component that formatted them would have to know a locale it cannot see.
   */
  value?: React.ReactNode;
  /** The quiet line under it — the kit's "two are overdue", "across 8 apps". */
  support?: React.ReactNode;
  /** The change beside the figure — the kit's "+4". Already formatted. */
  delta?: React.ReactNode;
  /** Which way it points. Sets the dot's colour; the words carry the meaning. */
  deltaDirection?: StatDeltaDirection;
  /**
   * A sparkline or mini chart under the figure. A node, so `Chart` draws it
   * and this file never touches a plotting library.
   */
  chart?: React.ReactNode;
  /** Chapter 18's three tones. `brand` is opt-in and used once per view. */
  tone?: StatTone;
  /** How much of the strip this tile takes. `2` is the kit's own wide tile. */
  span?: 1 | 2;
  /**
   * THE PERMISSION FLAG. `false` renders NOTHING — no placeholder, no lock,
   * no dimmed tile. Defaults to `true`, so a recipe that says nothing about
   * rights shows everything and hiding is always explicit.
   */
  visible?: boolean;
  /**
   * The figure has not arrived. The tile keeps its shell and its label and
   * draws a `Skeleton` where the number will be, so the strip does not
   * reflow when it lands. Never "0" — a count that has not arrived is not
   * zero.
   */
  loading?: boolean;
  /** Pressing the tile opens the records behind the number. */
  onSelect?: () => void;
  /**
   * What a screen reader hears for the whole tile, when the label and the
   * figure read badly in sequence. Undefined announces the tile's own text,
   * which is usually right — so nothing is hardcoded.
   */
  ariaLabel?: string;
}

/** Chapter 18's three tones, mapped onto `Card`'s own variants. */
const TONE_VARIANT: Record<StatTone, "default" | "brand" | "inverse"> = {
  /* Soft paper on the off-beige body pane — CH18's own drawing, sampled.
     See the note on `StatTone` for why this was `raised` and is not. */
  quiet: "default",
  brand: "brand",
  inverse: "inverse",
};

/* The eyebrow and the support line are one ink tier down from the figure, and
   on the two COLOURED tones that tier is the accent's own dimmed ink rather
   than `--ink-tertiary` — a tertiary charcoal on mango is dirt, not a
   hierarchy. The kit uses `rgba(26,25,24,.62)` on mango and `--invfg2` on
   charcoal.

   OVERRIDE 13 SETTLED BOTH, AND IT SETTLED THEM AS SOLID INKS. This file
   used to express the tier as `color-mix(… , transparent)` — the ink at 72%
   — which is an ALPHA, and an alpha is exactly the mechanism override 13
   removed ("an opacity is a standing rejection (PATTERN 9)"). The override
   resolves the artifact's unstated `--invfg2` and its unnamed mango twin to
   two solid hexes, `--ink-on-inverse-secondary` and
   `--ink-on-accent-secondary`, measured against their grounds; `tiles.tsx`
   and `flowchart.tsx` already take them and this file was the last one
   still mixing. GAPS-COL3 STG-2 closes with it. */
const TONE_QUIET_INK: Record<StatTone, string> = {
  quiet: "text-ink-tertiary",
  brand: "text-ink-on-accent-secondary",
  inverse: "text-ink-on-inverse-secondary",
};

/* The delta dot. `.kw-notif__dot`'s 0.4375rem, at the pill radius. Forest for
   a rise, poppy for a fall — the kit's own chart note licenses poppy for a
   negative figure outright ("a negative bar … is poppy at each mode's
   value") — and the hairline fill for flat, because a flat delta has no
   direction to colour. Never mango: mango is the brand, not a data colour. */
const DELTA_DOT: Record<StatDeltaDirection, string> = {
  up: "bg-success",
  down: "bg-destructive",
  flat: "bg-border",
};

export interface StatGridProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The figures, in order. An empty array — or all hidden — renders `null`. */
  items: readonly StatItem[];
  /**
   * The reader may not see the strip at all. `false` renders NOTHING, for
   * the same reason a hidden tile does.
   */
  visible?: boolean;
  /**
   * The narrowest a tile may get before the strip drops a column. The kit's
   * own figure is 210px; expressed in rem against the 16px authoring base so
   * it rescales with the text-size control. A call site with two very wide
   * figures passes a larger measure.
   */
  minTileWidth?: string;
  /** Every tile is waiting. Draws the strip with skeleton figures in place. */
  loading?: boolean;
  /** The whole strip failed. Draws chapter 21's register in the error tone. */
  state?: "ready" | "loading" | "empty" | "error";
  /**
   * WHETHER A FIGURE IS IN A CARD OR LIES BARE ON THE GROUND.
   *
   * `SHELL.md`, from the kit's own rendered pages: "the figure strip on a
   * main screen — bare on the body pane, NOT in cards … the one exception is
   * the dashboard (27.11), where the figures ARE in cards."
   *
   * `card` is the dashboard's, and the default, because `StatGrid` was built
   * for 27.11 and every existing call site is drawing that picture. `bare`
   * is what a main screen's figure strip actually is: label, number,
   * qualifier, standing directly on the off-beige body pane with no fill, no
   * radius, no inset and no shadow. p15's `03 List page` draws three of them
   * and there is not a card edge among them.
   *
   * `bare` is a CONTAINER decision and nothing else. The three lines keep
   * their own type steps, their own inks and their own order; a bare tile is
   * the same tile with its card taken away.
   */
  surface?: "card" | "bare";
  /** The strip's accessible name. Defaulted so no call site ships a nameless group. */
  label?: string;
  /** What a screen reader hears while a figure is loading. */
  loadingLabel?: string;
  /** The empty register's sentence, for a strip with no figures to show. */
  emptyTitle?: React.ReactNode;
  /** The line under it. */
  emptyDescription?: React.ReactNode;
  /** The error register's sentence. */
  errorTitle?: React.ReactNode;
  /** The line under it. */
  errorDescription?: React.ReactNode;
  /** The retry. */
  errorAction?: React.ReactNode;
}

/**
 * The strip of headline numbers.
 *
 * TEN STATES
 *  1. default        — an auto-fit row of tiles, each label / figure /
 *                      support, at the tone it was given.
 *  2. hover          — only on a tile that is pressable, and then it is
 *                      `Card interactive`'s own treatment: the `--accent`
 *                      wash on the quiet tone, `motion-hover-lift` on all
 *                      three. A named token and a named shadow, never an
 *                      opacity and never mango. A tile that is not a target
 *                      has no hover, deliberately: ch27.11 says "every
 *                      number is clickable through to the records behind
 *                      it", but a strip whose tiles are not wired must not
 *                      pretend otherwise.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the tile's own radius. Nothing here sets
 *                      `overflow: hidden`, so a pressable tile's ring shows
 *                      in full rather than having its corners shaved.
 *  4. active/pressed — does not apply as a skin. Pressing a figure navigates
 *                      to the records behind it; the acknowledgement is the
 *                      destination. The kit draws no pressed KPI tile.
 *  5. disabled       — DOES NOT APPLY, and this is a decision rather than an
 *                      omission. §9.3 and ch24.6 both rule that a figure the
 *                      reader may not see is HIDDEN, not disabled — so the
 *                      state a disabled tile would express is expressed by
 *                      the tile not existing. A greyed-out figure tells a
 *                      client there is a number they are not allowed to see,
 *                      which is exactly what the rule exists to prevent.
 *  6. loading        — per tile (`item.loading`) or for the whole strip
 *                      (`loading`): the tile keeps its shell and its label
 *                      and draws a `Skeleton` where the figure goes. Never a
 *                      "0", never a dash, and never a spinner — ch24.4:
 *                      "Never a spinner where a shape is known."
 *  7. empty          — a tile with no `value` and no `loading` draws its
 *                      label and support and nothing between them, which is
 *                      the honest picture for a figure that does not apply.
 *                      A STRIP with no visible tiles renders `null`.
 *  8. error          — `state="error"`: chapter 21's register in place of the
 *                      whole strip. A single tile has no error skin: a figure
 *                      that could not be fetched is a figure that has not
 *                      arrived, and poppy on a KPI would read as a bad
 *                      number rather than a failed request.
 *  9. selected       — does not apply. A figure is not a choice. A tile that
 *                      is the current filter is the toolbar's business.
 * 10. read-only      — always. A figure is a report; nothing here is
 *                      editable.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — the strip responds at EVERY width rather than
 *  at a breakpoint, and that is the kit's own mechanism, not a shortcut:
 *  `repeat(auto-fit, minmax(<minTileWidth>, 1fr))` drops from four columns to
 *  two to one as the container narrows, so the same strip is correct inside a
 *  narrow panel on a wide screen — which a media query could not express,
 *  because a media query asks about the viewport and a KPI strip cares about
 *  its container. Nothing restacks, nothing changes size, and the 44 figure
 *  is the same 44 at 320 as at 1440: shrinking a headline number would make
 *  the largest type on the page the same size as its caption.
 *  A tile with `span={2}` claims two columns wherever two exist and falls
 *  back to one when the strip is down to a single column.
 *
 * RTL — safe. The grid mirrors on its own, every inset is logical, the delta
 * dot sits before its words in DOM order and therefore at the reading start
 * in Arabic, Urdu and Persian, and the figures are `tabular-nums`, which is
 * direction-neutral.
 */
const StatGrid = React.forwardRef<HTMLDivElement, StatGridProps>(
  (
    {
      className,
      items,
      visible = true,
      minTileWidth = "13.125rem",
      loading = false,
      state = "ready",
      surface = "card",
      label = "Figures",
      loadingLabel = "Loading…",
      emptyTitle,
      emptyDescription,
      errorTitle,
      errorDescription,
      errorAction,
      style,
      ...props
    },
    ref,
  ) => {
    /* THE PERMISSION RULE. Nothing at all — not a placeholder, not a band. */
    if (!visible) return null;

    const shown = items.filter((item) => item.visible !== false);

    /* A strip whose every figure is hidden renders nothing, so a client never
       sees a band that says "there were numbers here". */
    if (shown.length === 0 && state === "ready") return null;

    const gridStyle: React.CSSProperties = {
      gridTemplateColumns: `repeat(auto-fit, minmax(${minTileWidth}, 1fr))`,
      ...style,
    };

    if (state === "error" || state === "empty") {
      const register =
        state === "error" ? (
          <ScreenRegister
            tone="error"
            title={errorTitle}
            description={errorDescription}
            action={errorAction}
          />
        ) : (
          <ScreenRegister tone="empty" title={emptyTitle} description={emptyDescription} />
        );
      if (register === null) return null;
      return (
        <div
          ref={ref}
          data-slot="stat-grid"
          data-state={state}
          className={cn("w-full", className)}
          {...props}
        >
          {register}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="stat-grid"
        data-state={state === "loading" || loading ? "loading" : "ready"}
        role="group"
        aria-label={label}
        data-surface={surface}
        /* `gap:14px` — `--space-3h`, the kit's own figure, for the carded
           strip. A BARE strip is not a grid of tiles: p15 draws three figures
           packed at the inline start, each only as wide as its own number,
           with the strip's air between them rather than a column measure. A
           `minmax()` grid would have stretched three short numbers across the
           whole body pane. */
        className={cn(
          surface === "bare"
            ? "flex w-full min-w-0 flex-wrap gap-x-[var(--space-7)] gap-y-[var(--space-5)]"
            : "grid w-full gap-[var(--space-3h)]",
          className,
        )}
        style={surface === "bare" ? style : gridStyle}
        {...props}
      >
        {shown.map((item, index) => {
          const tone = item.tone ?? "quiet";
          const busy = loading || state === "loading" || item.loading === true;
          const pressable = Boolean(item.onSelect);

          const inner = (
            <>
              {/* 11 / 500 / uppercase / 0.08em — `text-micro` carries all
                  three, so no arbitrary value is written. */}
              <span
                data-slot="stat-label"
                className={cn(
                  "text-micro font-[var(--font-weight-medium)] uppercase",
                  TONE_QUIET_INK[tone],
                )}
              >
                {item.label}
              </span>

              {/* The figure, and the delta on its baseline. */}
              {busy ? (
                /* A number that has not arrived is not "0". The tile keeps
                   its height so the strip does not jump when it lands. */
                <Skeleton
                  announce={false}
                  label={loadingLabel}
                  className="h-[var(--space-7)] w-3/5"
                />
              ) : item.value !== undefined && item.value !== null ? (
                <span className="flex flex-wrap items-baseline gap-[var(--space-2h)]">
                  <span
                    data-slot="stat-value"
                    /* 44 / 500 / -0.025em / 1.04 — `text-4xl` is that step. */
                    className="text-4xl font-[var(--font-weight-medium)] tabular-nums"
                  >
                    {item.value}
                  </span>
                  {item.delta !== undefined && item.delta !== null ? (
                    <span
                      data-slot="stat-delta"
                      className={cn(
                        "inline-flex items-center gap-[var(--space-1h)] text-badge tabular-nums",
                        tone === "quiet" ? "text-ink-secondary" : TONE_QUIET_INK[tone],
                      )}
                    >
                      {/* The dot never carries the meaning alone — ruling 26.
                          `.kw-notif__dot`'s 0.4375rem at the pill radius. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-[0.4375rem] flex-none rounded-pill",
                          DELTA_DOT[item.deltaDirection ?? "flat"],
                        )}
                      />
                      {item.delta}
                    </span>
                  ) : null}
                </span>
              ) : null}

              {/* 13 / one ink tier down — the caption step. */}
              {item.support !== undefined && item.support !== null ? (
                <span
                  data-slot="stat-support"
                  className={cn("text-caption", TONE_QUIET_INK[tone])}
                >
                  {item.support}
                </span>
              ) : null}

              {/* §9.3's "mini charts". A node: `Chart` draws it, not this file. */}
              {item.chart ? (
                <span data-slot="stat-chart" className="mt-2 block min-w-0">
                  {item.chart}
                </span>
              ) : null}
            </>
          );

          /* 22 inset snaps to 24 (`--space-6`), the card inset chapter 5
             states; 6 between the parts is `--space-1h`. The inset is written
             here rather than reached for through `CardContent` because a KPI
             tile is a single column of four lines, not a header/body/footer
             card, and `CardContent`'s `flex-1` would fight the tile's own
             column. */
          const tileClasses =
            surface === "bare"
              ? /* No fill, no radius, no inset, no shadow — the figure lies on
                   whatever ground it was dropped onto. The 6 between the
                   label, the number and the qualifier is the carded tile's
                   own `--space-1h`, because the INSIDE of a figure did not
                   change when its card went away. */
                "flex min-w-0 flex-col gap-[var(--space-1h)]"
              : "gap-[var(--space-1h)] p-6 min-w-0";

          const key = item.id ?? String(index);

          /* A pressable tile is a REAL BUTTON wearing the card's skin, not a
             div with a click handler inside a Card: only a real button gets
             the keyboard, the announced role and — because the skin carries
             the card's own radius — the global focus ring at the right
             shape. `cardVariants` is exported by `card.tsx` for exactly this
             ("the cva when other components will need the same skin"), and
             the hover pair below is card.tsx's own: the `--accent` wash on
             the neutral tone and `motion-hover-lift` on all three, never an
             opacity and never mango. */
          /* A BARE FIGURE IS NOT A CARD, so it does not wear `cardVariants`
             and it does not take a `span`: there is no grid for it to span.
             A pressable bare figure is still a real button — the keyboard,
             the announced role and the global focus ring are not decoration
             — it just has no skin. Its hover is the ink going to full, which
             is the kit's own treatment for a control with no fill (ch26.01
             on the ghost), never a wash on a shape that is not there. */
          if (surface === "bare") {
            return pressable ? (
              <button
                key={key}
                type="button"
                data-slot="stat-tile"
                data-surface="bare"
                data-tone={tone}
                onClick={item.onSelect}
                aria-label={item.ariaLabel}
                className={cn(
                  "cursor-pointer border-0 bg-transparent p-0 text-start [font:inherit]",
                  tileClasses,
                )}
              >
                {inner}
              </button>
            ) : (
              <div
                key={key}
                data-slot="stat-tile"
                data-surface="bare"
                data-tone={tone}
                aria-label={item.ariaLabel}
                className={tileClasses}
              >
                {inner}
              </div>
            );
          }

          return pressable ? (
            <button
              key={key}
              type="button"
              data-slot="stat-tile"
              data-surface="card"
              data-tone={tone}
              onClick={item.onSelect}
              aria-label={item.ariaLabel}
              className={cn(
                cardVariants({ variant: TONE_VARIANT[tone] }),
                "cursor-pointer motion-hover-lift border-0 text-start [font:inherit]",
                tone === "quiet" && "hover:bg-accent",
                tileClasses,
                item.span === 2 && "sm:col-span-2",
              )}
            >
              {inner}
            </button>
          ) : (
            <Card
              key={key}
              variant={TONE_VARIANT[tone]}
              data-slot="stat-tile"
              data-surface="card"
              data-tone={tone}
              aria-label={item.ariaLabel}
              className={cn(tileClasses, item.span === 2 && "sm:col-span-2")}
            >
              {inner}
            </Card>
          );
        })}
      </div>
    );
  },
);

StatGrid.displayName = "StatGrid";

export { StatGrid };
