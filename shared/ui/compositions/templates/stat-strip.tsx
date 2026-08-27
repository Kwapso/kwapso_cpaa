"use client";

/* ============================================================================
   StatStrip — the headline numbers, each with an optional mini chart. A panel
   the reader has no right to renders NOTHING: not a placeholder, not a lock.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.1 (the figure strip on a collection),
   27.11 (the dashboard) and 24.6 (permissions).

     ch27.1 on how many figures, verbatim:
       "Three or four counts a person would act on. The strip is not an
        analytics surface — a fifth number belongs on the dashboard."

     ch27.11 on what a figure is for, verbatim:
       "A figure or a card is a link to the collection that produced it,
        filtered the same way. A dashboard that cannot be opened into its
        records is a poster."

     ch27.11 on series colour, verbatim:
       "Series take sky, forest and poppy in that order and cycle. Mango is
        the brand, not a data colour, and grey reads as disabled. A fourth
        series waits for a fourth accent that carries charcoal type at both
        its values."

     ch24.6 on rights, verbatim: "Permissions HIDE actions rather than
       disabling them, so a client never sees a button they can't press."

   THE LAW THIS FILE OBEYS
   · THE PERMISSION RULE IS ALREADY BUILT. `StatGrid` renders `null` for
     `visible: false` on a tile and for `visible={false}` on the whole grid.
     This file passes the flag through and reinvents nothing — no lock glyph,
     no dimmed tile, no "you don't have access" placeholder.
   · NEVER MORE THAN THREE SERIES. `--chart-4` and `--chart-5` repeat 1 and 2
     today, so a four-series chart shows two indistinguishable pairs. A spark
     with more than three series is cut to three and says so in development.
     Logged as SHP-8 in GAPS-SHAPES.md.
   · A FIFTH FIGURE IS A DASHBOARD. Over `maxFigures` the strip still draws
     every figure it was handed — dropping a number silently would be worse
     than a crowded strip — and warns in development.
   · A FIGURE IS A LINK. `onSelect` is the route through to the records
     behind it, and `StatGrid` makes the whole tile the control.

   · A FIGURE IS BODY, NOT FRAME — SO THE STRIP OWNS ALL FOUR REGISTERS, AND
     THE CALL SITE PASSES ITS STATE VERBATIM. ch27 law 4 keeps the rail, the
     header and the tabs drawn through a state change; a NUMBER is not any of
     those. A strip that survives its own screen's state is a strip asserting
     figures that came out of the request which just failed, or which has not
     answered yet. Three routes had each decided this separately and arrived
     at three different answers (T3B-6/7/8 in GAPS-TRACK3B.md), so the whole
     decision now lives HERE and nowhere else:

       ready    the figures.
       loading  every tile UNFILLED — see the next clause.
       empty    the register, `statStrip`'s own words.
       error    the register, ruling 06's block sentence.

     A route must pass `state={state}` with no ternary in it. Passing a
     doctored state is how the three drifted, and any conditional at a call
     site is now a bug in that call site rather than a local choice.

   · WHATEVER BLANKS THE VALUE BLANKS EVERY OTHER ASSERTION ON THE TILE. This
     is the clause the three routes broke in the same way. `StatGrid` draws a
     `Skeleton` where an unarrived VALUE goes, but it knows nothing about the
     support line, the delta or the spark's accessible description — so a
     loading strip was hiding "76%" and then printing "Retainer use rose from
     sixty-four to seventy-six per cent" two lines below it, and hiding "142"
     while its spark still read "Hours logged per week: 118, 126, 133, 142".
     A number withheld in one channel and published in the next is worse than
     either, because only one of them is marked as unreliable. While a tile is
     busy this file therefore blanks `value` (`StatGrid`'s job), `support`,
     `delta` and `deltaDirection`, and hands the spark `loading` with NO
     `summary`. ch27.6 wants "the destination screen with its body unfilled",
     not a shorter screen, so the support line becomes a `Skeleton` of its own
     rather than being dropped — the tile keeps its height and the strip does
     not jump when the figures land. `Chart loading` does the same for the
     spark, at exactly the plot's height.

   · Focus is one global rule. No fill, no radius and no size decided here.

   WHAT THE ARTIFACT DOES NOT SAY
   The artifact draws no figure strip in a failed register anywhere — every
   drawn strip in ch27.1, 27.11 and 27.43 is a strip with its numbers in it.
   So the error register above is NOT transcribed from a drawing; it is ruling
   06's "a failed block says 'we can't show this right now'" applied to a
   block, which is the register this shape has drawn since it was written.
   Nothing new was invented for the fix — the suppression in front of it was
   removed.

   Removing it then exposed the real question, which was T3B-6: the strip and
   the collection below it fail together, so ONE failure printed ruling 06's
   sentence twice, stacked. Ruled 2026-08-23: a failed strip draws nothing,
   and `errorRegister` opts a standalone strip back in. That follows the
   artifact — which draws no strip in a failed state at all — rather than
   inventing a second register for it.

   RENDERING CONTEXT
   `"use client"`. The spark charts are recharts, and this module builds the
   select handlers during its own render.
   ========================================================================= */

import * as React from "react";

import {
  Chart,
  type ChartSeries,
} from "../../components/chart/chart";
import { Skeleton } from "../../components/skeleton/skeleton";
import {
  StatGrid,
  type StatDeltaDirection,
  type StatItem,
  type StatTone,
} from "../../components/stat-grid/stat-grid";
import { cn } from "../../lib/utils";
import {
  ShapeStateBody,
  shapeCopy,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/** Never more than three, until `--chart-4` and `--chart-5` are real colours. */
export const MAX_SPARK_SERIES = 3;

/** ch27.1 — "Three or four counts a person would act on." */
export const MAX_STRIP_FIGURES = 4;

/**
 * The mini chart beside a headline number. Deliberately thin: a spark states
 * a shape, so it carries no axes, no grid, no legend and no tooltip. A figure
 * that needs any of those is a dashboard card, not a strip figure.
 */
export interface StatSpark {
  /** Bars for counts, a line for a rate, an area for a total. */
  type?: "bar" | "line" | "area";
  /** The points. */
  data: ReadonlyArray<Record<string, unknown>>;
  /** Up to three series. A fourth is cut and warned about. */
  series: ChartSeries[];
  /** Which key is the period. */
  xKey?: string;
  /** Overrides the strip's own spark height. */
  height?: string;
  /** The sentence a screen reader hears instead of the drawing. */
  summary?: string;
}

export interface StatStripFigure {
  /** Stable key. */
  id: string;
  /** What the number counts. */
  label: React.ReactNode;
  /** The number itself. */
  value?: React.ReactNode;
  /**
   * The period or the basis this number belongs to — "this week", "W34".
   * ch27.11: "Every other number in the system is stated with the period it
   * belongs to … and never moves while you look at it."
   */
  support?: React.ReactNode;
  /** The change. */
  delta?: React.ReactNode;
  /** Which way the change went. */
  deltaDirection?: StatDeltaDirection;
  /** The mini chart. */
  spark?: StatSpark;
  /** One tile per view may take mango. */
  tone?: StatTone;
  /** A figure may take two columns. */
  span?: 1 | 2;
  /** The reader has the right to this number. `false` renders NOTHING. */
  visible?: boolean;
  /** This one number has not arrived. */
  loading?: boolean;
  /** Open the records behind the number, filtered the same way (ch27.11). */
  onSelect?: () => void;
  /** Accessible name, when the label and value do not read as a sentence. */
  ariaLabel?: string;
}

export interface StatStripProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The figures, in the order a person reads them. */
  figures: readonly StatStripFigure[];
  /**
   * The reader has the right to this whole strip. `false` renders NOTHING —
   * `StatGrid`'s own rule, not a second implementation of it.
   */
  visible?: boolean;
  /** How many figures the strip is meant to hold. Over this, a development warning. */
  maxFigures?: number;
  /** The narrowest a tile may be before the grid rewraps. */
  minTileWidth?: string;
  /** The height every spark takes unless it overrides it. */
  sparkHeight?: string;
  /**
   * WHETHER THE FIGURES ARE IN CARDS OR LIE BARE ON THE GROUND.
   *
   * `SHELL.md`: "the figure strip on a main screen — bare on the body pane,
   * NOT in cards … the one exception is the dashboard (27.11), where the
   * figures ARE in cards."
   *
   * So `MainScreen` passes `bare` and the dashboard passes nothing. The
   * default stays `card` because every existing call site is drawing 27.11's
   * picture and a default that silently unwrapped forty screens would be a
   * change nobody asked for.
   */
  surface?: "card" | "bare";
  /** Accessible name for the strip. */
  label?: string;

  /** Loading, empty or error. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** The retry on a block failure. Only drawn when `errorRegister` is on. */
  errorAction?: React.ReactNode;
  /**
   * Whether a FAILED strip says so, or says nothing.
   *
   * Off by default, and that is the whole of ruling T3B-6. A strip is almost
   * always a hero over a collection, and both blocks fail together — so with
   * this on, one failure printed ruling 06's sentence TWICE, stacked, once
   * from the strip and once from the body underneath it. The artifact draws
   * no figure strip in a failed register anywhere (27.1, 27.11 and 27.43 all
   * draw a strip with its numbers in it), so the strip going quiet is the
   * faithful reading as well as the legible one.
   *
   * Turn it ON where the strip is the ONLY block on the page and nothing
   * below it would carry the failure — otherwise the reader gets a screen
   * that has silently lost its content.
   */
  errorRegister?: boolean;
}

/** Cut a spark to the three series that have distinguishable colours. */
function safeSeries(series: ChartSeries[], id: string): ChartSeries[] {
  if (series.length <= MAX_SPARK_SERIES) return series;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `StatStrip: figure "${id}" has ${series.length} series; --chart-4 and --chart-5 repeat 1 and 2, so only ${MAX_SPARK_SERIES} are drawn.`,
    );
  }
  return series.slice(0, MAX_SPARK_SERIES);
}

/**
 * The figure strip.
 *
 * TEN STATES
 *  1. default        — the tiles, each with its number and optional spark.
 *  2. hover          — owned by `StatGrid`, and only on a tile with `onSelect`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `StatGrid`'s tile control.
 *  5. disabled       — does not apply. A figure the reader may not see is
 *                      ABSENT (`visible: false`), never dimmed — ch24.6.
 *  6. loading        — per-tile `loading`, or `state="loading"` for the strip.
 *                      A value that has not arrived renders nothing, not "0",
 *                      and NOTHING ELSE ON THE TILE ASSERTS IT EITHER: the
 *                      support line unfills, the delta goes, and the spark
 *                      draws its own skeleton with no description. See the
 *                      law block.
 *  7. empty          — `state="empty"`: the register, no figures. The SAME
 *                      register on every route — this is not a per-route
 *                      decision.
 *  8. error          — `state="error"`: the figures go, because they came out
 *                      of the request that just failed, and by default the
 *                      strip then draws NOTHING — the body below it carries
 *                      the failure, and two blocks saying "we can't show this
 *                      right now" one above the other is worse than one.
 *                      `errorRegister` opts a standalone strip back in to
 *                      ruling 06's sentence. T3B-6.
 *  9. selected       — does not apply. A figure is a link, not a choice; the
 *                      selection lands on the collection it opens.
 * 10. read-only      — the normal case. A figure is never editable.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — the grid rewraps on `minTileWidth` and nothing
 *  else changes. ch27.11: "on narrow the figures go two-up", which is what an
 *  auto-fit grid does at the default tile width.
 *
 * RTL — LTR only by client ruling. Nothing here is directional.
 */
function StatStrip({
  className,
  figures,
  visible = true,
  maxFigures = MAX_STRIP_FIGURES,
  minTileWidth,
  sparkHeight = "3rem",
  surface = "card",
  label,
  state = "ready",
  copy,
  errorAction,
  errorRegister = false,
  ...props
}: StatStripProps) {
  const words = shapeCopy("statStrip", copy);

  if (!visible) return null;

  if (process.env.NODE_ENV !== "production" && figures.length > maxFigures) {
    console.warn(
      `StatStrip: ${figures.length} figures. ch27.1 puts three or four here — a fifth number belongs on the dashboard.`,
    );
  }

  /* A failed strip draws NOTHING unless it is the only block on the page.
     T3B-6, ruled 2026-08-23. See `errorRegister` above for why. */
  if (state === "error" && !errorRegister) return null;

  if (state === "empty" || state === "error") {
    return (
      <ShapeStateBody
        data-slot="stat-strip"
        shape="statStrip"
        state={state}
        copy={copy}
        action={state === "error" ? errorAction : undefined}
        className={className}
        {...props}
      />
    );
  }

  const items: StatItem[] = figures.map((figure) => {
    /* One answer for the whole tile. `StatGrid` computes the same thing for
       the value; it is computed again here because the support line, the
       delta and the spark are this file's to withhold and `StatGrid` cannot
       see them. */
    const busy = state === "loading" || figure.loading === true;

    return {
      id: figure.id,
      label: figure.label,
      value: busy ? undefined : figure.value,
      /* ch27.6 wants the body UNFILLED, not absent: a support line that
         disappeared would shorten the tile and the strip would jump when the
         figure landed. The caption step is 13; `--space-4` is the line box a
         13 sits in. */
      support: busy ? (
        <Skeleton
          announce={false}
          label={words.loadingLabel}
          className="h-[var(--space-4)] w-4/5"
        />
      ) : (
        figure.support
      ),
      /* A delta rides the value's baseline, so withholding it costs no
         height — and "+5 on last month" is an assertion about a number that
         is not on screen. */
      delta: busy ? undefined : figure.delta,
      deltaDirection: busy ? undefined : figure.deltaDirection,
      tone: figure.tone,
      span: figure.span,
      visible: figure.visible,
      loading: figure.loading,
      onSelect: figure.onSelect,
      ariaLabel: figure.ariaLabel,
      chart:
        figure.spark === undefined ? undefined : (
          <Chart
            type={figure.spark.type ?? "bar"}
            data={figure.spark.data}
            series={safeSeries(figure.spark.series, figure.id)}
            xKey={figure.spark.xKey}
            height={figure.spark.height ?? sparkHeight}
            /* A spark states a shape and nothing else. */
            grid={false}
            xAxis={false}
            yAxis={false}
            legend={false}
            tooltip={false}
            /* `Chart loading` is a skeleton at exactly the plot's height, so
               the tile keeps its measure. The summary is the spark's ONLY
               channel to a screen reader, and it spells the series out in
               words — "Hours logged per week: 118, 126, 133, 142". Withheld
               with everything else, or the blank spark is the only reader who
               is told the numbers have not arrived. */
            loading={busy}
            summary={busy ? undefined : figure.spark.summary}
          />
        ),
    };
  });

  return (
    <StatGrid
      data-slot="stat-strip"
      className={cn(className)}
      items={items}
      visible={visible}
      minTileWidth={minTileWidth}
      surface={surface}
      label={label}
      state={state === "loading" ? "loading" : "ready"}
      loadingLabel={words.loadingLabel}
      {...props}
    />
  );
}

StatStrip.displayName = "StatStrip";

export { StatStrip };
