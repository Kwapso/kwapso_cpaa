"use client";

/* ============================================================================
   Chart — bar, line, area: axis, grid, legend, tooltip, empty, negative
   (5 direct call sites).

   DESIGN SOURCE
   Kit chapter 18 ("Data display · KPIs · progress · charts · calendar ·
   board"), read out of `Design Mothership/kit-current/Kwapso UI Kit.dc.html`.
   The chapter states its own chart spec line verbatim, and it is the whole
   brief for this file:

       "Curve 2.5px forest · fill forest at 16% (no gradient) · grid 6%
        hairlines · axis labels 11px quiet · one accent per chart · a trend
        line closes the card"

   and the drawing under it supplies the rest:
     · the baseline — a 1-wide rule at 14% ink, heavier than the grid
     · the grid     — 1-wide rules at `--hair3` (the kit's 6% hairline)
     · the curve    — 2.5 stroke, `stroke-linecap: round`, no gradient
     · the last point — a 4.5 dot in the series colour
     · the axis text — 11, quiet ink, tabular where numeric

   Chapter 19 draws the same three shapes again as collection view 17
   ("charts"): a bar block at `height: 120px` with the bars flush to a
   baseline, a horizontal bar block, and a donut. Only bar, line and area are
   this component's brief; the donut and the rings are not.

   THE THREE CONTRADICTIONS THIS FILE RESOLVES
   · Axis labels. **RESOLVED THE OTHER WAY, 2026-08-24, AT 11.** CH18's
     caption states them outright — "axis labels 11px quiet" — and a caption
     is the chapter's specification. CHT-2 stepped them to 12 by reading
     ruling 02's "UPPERCASE eyebrows keep 11px" as "only an uppercase eyebrow
     may be 11". The repo has since settled the opposite and twice: `gantt`'s
     bar label and `kanban`'s card meta are both non-eyebrow 11s, both
     corrected TO 11 in the 2026-08-23 pass, and both take
     `text-micro tracking-[var(--tracking-normal)]` — the 11 rung with the
     eyebrow's 0.08em dropped. What ruling 02 forbids is a hardcoded 9/10/11,
     not the ladder's own floor; `text-micro` is a token, not a hardcode.
     CHT-2 is not an override-register row, so the page wins. GAPS-KIT-DE.
   · Bar radius. Chapter 18 draws the bars as `999px 999px 0 0` and chapter 19
     draws them at 24. Ruling 03 states the radius law in full and puts "4px
     on a bar … a bar is not a box". The ruling wins over both drawings.
     Logged as GAPS-COL1 CHT-3.
   · The baseline weight. The kit's 14% ink is not a token: the palette has an
     8% hairline (`--border`) and a 20% section rule (`--hair-strong`), and 14
     is exactly between them. `--hair-strong` is taken, because the one thing
     the drawing is unambiguous about is that the baseline is HEAVIER than the
     6% grid, and a chart's zero line is a rule in the same sense a section
     rule is. Logged as GAPS-COL1 CHT-4.

   THE LAW THIS FILE OBEYS
   · `--chart-1..5` are the data colours and mango is not one of them.
     `tokens.css` is explicit: mango is "a fill, never a data colour". Nothing
     here reaches for `--primary`.
   · `--chart-4` and `--chart-5` are placeholders that repeat 1 and 2, so a
     five-series chart shows two indistinguishable pairs. No colour is
     invented to paper over that; the component warns in its own docs and the
     gap is logged (GAPS-COL1 CHT-1).
   · A negative value takes `--chart-negative`, which is poppy and lifts on
     dark. Poppy means blocked or below the line — it is never a "warning".
   · The area fill is a COLOUR, not an opacity: `color-mix(in srgb, <series>
     16%, transparent)`. An alpha applied to an element is a state mechanism
     and is banned; a mixed colour is a colour the palette can name.
   · No `px`, no hex, no hardcoded font size reaches the SVG. Axis text is
     styled through CSS on the wrapper so it inherits the text scale, rather
     than through recharts' numeric `tick.fontSize`, which would emit a fixed
     pixel attribute that the root text-size control could not move.
   · Focus is one global rule (tokens.css §8). The chart draws no ring.
   · Every user-facing string is a prop with a default, including the
     visually-hidden summary a screen reader reads instead of the picture.

   RENDERING CONTEXT
   `"use client"`. recharts measures the DOM and holds state.
   ========================================================================= */

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "../../lib/utils";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ----------------------------------------------------------------------------
   The five data colours, in order.

   `--chart-4` and `--chart-5` currently resolve to `--chart-1` and
   `--chart-2`. That is a real hole and it is left visible rather than papered
   over: a chart with four or five series will show two indistinguishable
   pairs until the palette gains two more data colours. GAPS-COL1 CHT-1.
   ------------------------------------------------------------------------- */
const SERIES_COLOURS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/**
 * Two absolute figures that are marks rather than measurements, and so are
 * the two things in this file written as bare numbers.
 *
 * `BAR_RADIUS` is ruling 03's "4px on a bar", which is stated as an absolute
 * and must not re-scale with the root text size — a bar corner that grew with
 * the type would stop reading as the same shape. `tokens.css` keeps 1 and 2
 * off the spacing scale for exactly this reason ("grid lines and optical
 * nudges") and this is the third of that kind.
 *
 * `CURVE_WIDTH` is chapter 18's stated 2.5 stroke, for the same reason: a
 * stroke is a mark on the picture, not a distance in the layout.
 */
const BAR_RADIUS = 4;
const CURVE_WIDTH = 2.5;

/** The kit's 16% area fill, expressed as a colour rather than as an alpha. */
function areaFill(colour: string) {
  return `color-mix(in srgb, ${colour} 16%, transparent)`;
}

export interface ChartSeries {
  /** The key in each row of `data` this series reads. */
  key: string;
  /** What the legend and the tooltip call it. Defaults to the key. */
  label?: React.ReactNode;
  /**
   * Override the colour. Must be a token reference, never a literal — the
   * palette flips in dark and a literal would not. Defaults to
   * `--chart-1..5` by position.
   */
  color?: string;
}

/** One row as the tooltip receives it back from recharts. */
interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number | Array<string | number> | null;
  color?: string;
}

export interface ChartProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** Which shape. All three are drawn by chapter 18. */
  type?: "bar" | "line" | "area";
  /** The rows, in the order they should appear along the category axis. */
  data?: ReadonlyArray<Record<string, unknown>>;
  /** The measures. One entry is one bar set, one line or one band. */
  series?: ChartSeries[];
  /** Which key in a row is the category — the x axis. */
  xKey?: string;

  /**
   * How tall the plot is. A rem string, never a px: the applications move the
   * root text size and a chart that did not move with it would drift out of
   * register with the copy beside it.
   */
  height?: string;
  /** Stack the series rather than grouping them. Bar and area only. */
  stacked?: boolean;
  /** Draw the horizontal hairline grid. Chapter 18 draws it on every chart. */
  grid?: boolean;
  /** Draw the value axis. Off for a spark-style block, which chapter 19 draws. */
  yAxis?: boolean;
  /** Draw the category axis. */
  xAxis?: boolean;
  /** Draw the legend. Off with one series — a legend of one is a label. */
  legend?: boolean;
  /** Draw the hover tooltip. */
  tooltip?: boolean;
  /**
   * Draw the zero rule. Defaults to `true` when any value is below zero,
   * because a chart with negatives and no zero line cannot be read; pass it
   * explicitly to force one either way.
   */
  zeroLine?: boolean;
  /**
   * Turn a value into the string the tooltip and the value axis show.
   * No default beyond `String`, deliberately: a number's spelling is a locale
   * decision and the runtime already knows the locale better than this file
   * does. See `Progress`'s `formatValue` for the same reasoning.
   */
  formatValue?: (value: number, series: ChartSeries) => string;

  /** The data has not arrived. Cold cache only. */
  loading?: boolean;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with rows present. */
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;

  /** Accessible name for the figure. */
  label?: string;
  /**
   * The sentence a screen reader is given instead of the picture. There is no
   * useful default — only the caller knows what the chart says — so the
   * default is no string at all rather than an English one that cannot be
   * translated (PATTERN §7).
   */
  summary?: string;
}

/* ----------------------------------------------------------------------------
   The tooltip card. recharts clones this element and injects `active`,
   `payload` and `label`, so every prop is optional.
   ------------------------------------------------------------------------- */
function TooltipCard(props: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: React.ReactNode;
  series?: ChartSeries[];
  formatValue?: ChartProps["formatValue"];
}) {
  const { active, payload, label, series = [], formatValue } = props;
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      data-slot="chart-tooltip"
      /* Chapter 12's overlay paper: `--popover` at the box radius under
         `--shadow-overlay` (`shadow-xl` is re-pointed at it). No border — an
         overlay is separated by elevation and colour, not by a stroke. */
      className={cn(
        "min-w-[8rem] rounded-[var(--radius)] bg-popover p-3 shadow-xl",
        "text-caption text-popover-foreground",
      )}
    >
      {label === undefined || label === null ? null : (
        <div className="mb-2 text-xs text-ink-tertiary">{label}</div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, index) => {
          const match = series.find((s) => s.key === entry.dataKey);
          const raw = Array.isArray(entry.value) ? entry.value[entry.value.length - 1] : entry.value;
          const numeric = typeof raw === "number" ? raw : Number(raw);
          const shown =
            match && formatValue && Number.isFinite(numeric)
              ? formatValue(numeric, match)
              : String(raw ?? "");

          return (
            <div key={`${String(entry.dataKey)}-${index}`} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                /* 9 — the chart key's own dot. `--dot-status` is 7, which is
                   CH22's notification dot; no chapter draws a chart key at 7,
                   and CH18's legend states 9. `tiles.tsx` already writes it
                   this way. */
                className="size-[0.5625rem] shrink-0 rounded-pill"
                style={{ background: entry.color }}
              />
              <span className="min-w-0 truncate text-ink-secondary">
                {match?.label ?? entry.name ?? entry.dataKey}
              </span>
              <span className="ms-auto tabular-nums">{shown}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   The legend. Chapter 18's own: a 9 dot, then the label, at 12.5 — which
   ruling 02 lands on the caption step.
   ------------------------------------------------------------------------- */
function LegendRow(props: { payload?: Array<{ value?: unknown; color?: string }> }) {
  const { payload } = props;
  if (!payload || payload.length === 0) return null;

  return (
    <div
      data-slot="chart-legend"
      className="flex flex-wrap items-center gap-x-[var(--space-3h)] gap-y-2 pt-3"
    >
      {payload.map((entry, index) => (
        <span key={index} className="inline-flex items-center gap-2 text-caption text-ink-secondary">
          <span
            aria-hidden="true"
            /* 9 — CH18's legend dot. See the tooltip key above. */
            className="size-[0.5625rem] shrink-0 rounded-pill"
            style={{ background: entry.color }}
          />
          {String(entry.value ?? "")}
        </span>
      ))}
    </div>
  );
}

/**
 * A bar, line or area chart.
 *
 * TEN STATES
 *  1. default        — the plot, its grid, its two axes and, where asked, its
 *                      legend.
 *  2. hover          — the tooltip, and the series' own active dot. That IS
 *                      the hover; nothing washes, nothing dims, and no other
 *                      series is faded out — fading the rest would be an
 *                      opacity used as a state, which is a rejection.
 *  3. focus-visible  — NOT here, and honestly: the SVG is not focusable, so
 *                      the tooltip is pointer-only. The keyboard path is the
 *                      `summary` string, which says in one sentence what the
 *                      picture says, and the data table a composition should
 *                      put beside a chart that carries decisions. Logged as
 *                      GAPS-COL1 CHT-5.
 *  4. active/pressed — does not apply. A chart is read, not pressed.
 *  5. disabled       — does not apply. A figure cannot be unavailable; a
 *                      measure nobody may see is not rendered.
 *  6. loading        — `loading`: a `Skeleton` block at exactly the plot's
 *                      height, so nothing reflows when the numbers land. Cold
 *                      cache only — a warm re-fetch keeps the old picture and
 *                      marks it busy rather than blanking a figure someone is
 *                      reading.
 *  7. empty          — no rows, no series, or `empty`: the quiet register at
 *                      the plot's height. NOT an empty axis pair: a drawn
 *                      grid with nothing on it reads as "zero everywhere",
 *                      which is a different and wrong answer from "no data".
 *  8. error          — `error`: the register with a poppy dot and its own
 *                      wording, again at the plot's height. Beats `empty`.
 *  9. selected       — does not apply. A chart has no selection; a chart that
 *                      filters something is a control, and the control is the
 *                      `FilterBar` above it.
 * 10. read-only      — always.
 *
 * NEGATIVE VALUES — the state the brief names and most charts get wrong.
 *  A bar below zero takes `--chart-negative` rather than its series colour,
 *  so the direction is legible without reading the axis. The zero rule is
 *  drawn automatically the moment any value is below zero, at the baseline
 *  weight, because a bar chart with negatives and no zero line has no
 *  reference. A LINE or AREA keeps its series colour through zero — a line
 *  that changed colour halfway would read as two series — and gets the zero
 *  rule instead.
 *
 * THREE BREAKPOINTS
 *  · mobile (base) — the plot keeps its stated `height` and fills the width.
 *    The value axis is NARROWED to 2rem of gutter and the category axis
 *    keeps every tick it is given: recharts drops overlapping category labels
 *    on its own, which is the right failure — a missing label is readable, an
 *    overlapping pair is not. The legend wraps under the plot.
 *  · tablet (`sm:`) — UNCHANGED. The plot is width-agnostic; the composition
 *    owns how wide the card is.
 *  · desktop — UNCHANGED, and deliberately: chapter 18 states one chart
 *    geometry and a taller plot on a wide screen would change the slope of
 *    the same data, which is the one thing a chart must not do between two
 *    viewports.
 *
 * RTL — safe, and unused: the system is LTR only. recharts lays the category
 * axis out left to right in both directions, which is a known limitation and
 * is out of scope here.
 */
const Chart = React.forwardRef<HTMLDivElement, ChartProps>(
  (
    {
      className,
      type = "bar",
      data,
      series,
      xKey = "x",
      height = "16rem",
      stacked = false,
      grid = true,
      yAxis = true,
      xAxis = true,
      legend = false,
      tooltip = true,
      zeroLine,
      formatValue,
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "No data",
      emptyBody = "There is nothing to plot for this period.",
      errorLabel = "Chart unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label,
      summary,
      ...props
    },
    ref,
  ) => {
    const rows = data ?? [];
    const measures = series ?? [];

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : rows.length === 0 || measures.length === 0 || empty
          ? "empty"
          : "default";

    /* Does anything fall below the line? Decides the zero rule and, for bars,
       which colour each rectangle takes. */
    const hasNegative = React.useMemo(
      () =>
        rows.some((row) =>
          measures.some((measure) => {
            const value = row[measure.key];
            return typeof value === "number" && value < 0;
          }),
        ),
      [rows, measures],
    );
    const showZeroLine = zeroLine ?? hasNegative;

    const colourFor = (measure: ChartSeries, index: number) =>
      measure.color ?? SERIES_COLOURS[index % SERIES_COLOURS.length];

    /* Axis and grid furniture, shared by all three shapes so a bar chart and
       a line chart of the same data sit on identical rules. */
    const axisCommon = {
      tickLine: false,
      stroke: "var(--hair-strong)",
      /* recharts needs a real length here and it is a mark, not a
         measurement: the gap between a tick and its label. */
      tickMargin: 8,
    } as const;

    const furniture = (
      <>
        {grid ? (
          <CartesianGrid
            vertical={false}
            /* The kit's 6% hairline, exactly — `--hair-faint` IS 6%. */
            stroke="var(--hair-faint)"
          />
        ) : null}
        {xAxis ? <XAxis dataKey={xKey} axisLine={{ stroke: "var(--hair-strong)" }} {...axisCommon} /> : null}
        {yAxis ? <YAxis axisLine={false} width={40} {...axisCommon} /> : null}
        {showZeroLine ? <ReferenceLine y={0} stroke="var(--hair-strong)" /> : null}
        {tooltip ? (
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            content={<TooltipCard series={measures} formatValue={formatValue} />}
          />
        ) : null}
        {legend ? <Legend content={<LegendRow />} /> : null}
      </>
    );

    const plot =
      type === "bar" ? (
        <BarChart data={rows as Record<string, unknown>[]}>
          {furniture}
          {measures.map((measure, index) => {
            const colour = colourFor(measure, index);
            return (
              <Bar
                key={measure.key}
                dataKey={measure.key}
                name={typeof measure.label === "string" ? measure.label : measure.key}
                stackId={stacked ? "stack" : undefined}
                fill={colour}
                radius={BAR_RADIUS}
                isAnimationActive={false}
              >
                {hasNegative
                  ? rows.map((row, rowIndex) => {
                      const value = row[measure.key];
                      const below = typeof value === "number" && value < 0;
                      return (
                        <Cell
                          key={rowIndex}
                          fill={below ? "var(--chart-negative)" : colour}
                        />
                      );
                    })
                  : null}
              </Bar>
            );
          })}
        </BarChart>
      ) : type === "line" ? (
        <LineChart data={rows as Record<string, unknown>[]}>
          {furniture}
          {measures.map((measure, index) => {
            const colour = colourFor(measure, index);
            return (
              <Line
                key={measure.key}
                type="monotone"
                dataKey={measure.key}
                name={typeof measure.label === "string" ? measure.label : measure.key}
                stroke={colour}
                strokeWidth={CURVE_WIDTH}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4.5, fill: colour, stroke: "none" }}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      ) : (
        <AreaChart data={rows as Record<string, unknown>[]}>
          {furniture}
          {measures.map((measure, index) => {
            const colour = colourFor(measure, index);
            return (
              <Area
                key={measure.key}
                type="monotone"
                dataKey={measure.key}
                name={typeof measure.label === "string" ? measure.label : measure.key}
                stackId={stacked ? "stack" : undefined}
                stroke={colour}
                strokeWidth={CURVE_WIDTH}
                strokeLinecap="round"
                /* A colour, not an alpha. The kit's 16%, no gradient. */
                fill={areaFill(colour)}
                dot={false}
                activeDot={{ r: 4.5, fill: colour, stroke: "none" }}
                isAnimationActive={false}
              />
            );
          })}
        </AreaChart>
      );

    return (
      <figure
        ref={ref as React.Ref<HTMLElement>}
        data-slot="chart"
        data-type={type}
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn(
          "min-w-0",
          /* Axis text, styled in CSS rather than through recharts' numeric
             `tick.fontSize`, so it moves with the root text-size control and
             no pixel value ever reaches the SVG. */
          "[&_.recharts-cartesian-axis-tick_text]:fill-[var(--ink-tertiary)]",
          /* 11 — CH18's caption, verbatim: "axis labels 11px quiet". The 11
             rung is `text-micro`, which also drags the eyebrow's 0.08em, so
             the tracking is reset beside it: an axis label is a number, not
             an eyebrow. See the CHT-2 note in the file header for why this
             printed 12 until 2026-08-24. */
          "[&_.recharts-cartesian-axis-tick_text]:text-micro",
          "[&_.recharts-cartesian-axis-tick_text]:tracking-[var(--tracking-normal)]",
          "[&_.recharts-cartesian-axis-tick_text]:tabular-nums",
          /* recharts paints its own focus outline on the surface; the system
             has exactly one focus rule and the SVG is not a control. */
          "[&_.recharts-surface]:overflow-visible",
          className,
        )}
        {...props}
      >
        {summary ? <figcaption className="sr-only">{summary}</figcaption> : null}

        <div style={{ height }} className="min-w-0">
          {state === "loading"
            ? (loadingState ?? (
                <Skeleton variant="card" label={loadingLabel} className="h-full" />
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
            <ResponsiveContainer width="100%" height="100%">
              {plot}
            </ResponsiveContainer>
          ) : null}
        </div>
      </figure>
    );
  },
);

Chart.displayName = "Chart";

export { Chart };
