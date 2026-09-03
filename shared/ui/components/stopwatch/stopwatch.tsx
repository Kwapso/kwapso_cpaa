/* ============================================================================
   Stopwatch — the running timer pill (0 direct call sites; the floating
   layer's second tenant).

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" → `<section id="ch19">`, "The floating layer",
   which is the only place in the kit a clock is drawn. Its rule is the
   chapter's opening sentence:

       "Exactly two things may sit over the work: the assistant and a running
        timer. Neither dims the page, neither traps focus, and neither closes
        because you clicked something else — you can type in a table while the
        assistant is open and stop the clock without leaving the record."

   and the pill itself, transcribed:

       inline-flex · gap 10 · charcoal fill with the on-inverse ink · 999
       radius · padding 8 / 8 / 8 / 14 · the overlay shadow · a 13 clock
       glyph · the time at 13 / 500, tabular · a 26 mango disc carrying the
       stop mark

   Chapter 19 also states the phone behaviour outright: "Both collapse to a
   mark … the timer to its pill. Collapsed is the default on a phone, where
   the stack sits above the bottom bar and never over a control."

   THE LAW THIS FILE OBEYS
   · THE PILL IS INVERSE, NOT MANGO. `--surface-inverse` fill and
     `--ink-on-inverse` ink, so the whole thing flips with the palette and is
     charcoal-on-beige in light and beige-on-charcoal in dark with no second
     drawing. The ONE mango is the action disc, and it is a brand fill on a
     control — not a status, not a data colour.
   · Charcoal on every accent: the disc's glyph is `--ink-on-accent` in both
     palettes, never white.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label` on the disc), never an opacity.
   · Focus is ONE global rule (tokens.css §8). The disc is a real button and
     the ring lands on it at its own radius. Nothing here defines a ring.
   · No keyframe, no CSS duration and no curve is written in this file. The
     disc's colour swap rides `transition-colors`, which tokens.css has
     already timed at `--duration-colour` on `--ease`. A clock does not
     animate; it counts.
   · Every string is a prop with a default, and the TIME ITSELF goes through a
     formatter prop — digits and separators differ by locale, and a stopwatch
     that prints ASCII numerals into an Urdu page is a bug, not a default.

   THE ONE JAVASCRIPT INTERVAL, AND WHY IT IS NOT A MOTION VALUE
   `tickInterval` defaults to one second. That is a sampling rate for a
   measurement, not a duration in the motion system: nothing moves, nothing
   eases, and `prefers-reduced-motion` has no opinion about how often a clock
   re-reads itself. It is a prop so a caller showing tenths can raise it.
   Elapsed time is measured from the wall clock on every tick rather than
   accumulated from the interval, so a throttled background tab does not lose
   minutes.

   RENDERING CONTEXT
   `"use client"`. State, an effect, a browser timer and a click handler.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Clock,
  StopCircle,
  Play,
} from "../../foundations/icons";

/* The pill. `--space-2h` (10) between the parts; block inset `--space-2` (8);
   the inline start carries `--space-3h` (14) because the glyph needs more air
   from the edge than the 26 disc does at the other end. */
const pillClasses = [
  "inline-flex items-center gap-[var(--space-2h)]",
  "rounded-pill py-2 ps-[var(--space-3h)] pe-2",
  "bg-surface-inverse text-ink-on-inverse",
  "shadow-xl", // bridged to --shadow-overlay
];

/* The action disc: 26, a circle, the one mango in the pill. */
const discClasses = [
  "inline-grid size-[var(--control-height-pill)] shrink-0 place-content-center",
  "rounded-pill border-0 p-0",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
];

export interface StopwatchProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue" | "children"> {
  /**
   * WHAT THIS PILL IS TIMING — between the clock glyph and the count.
   *
   * A placement, not a drawing: nothing here styles the node, exactly as
   * `ScreenShell` places a rail and `CollectionFrame` places a toolbar. The
   * pill's own shape — the fill, the radius, the glyph, the disc — is
   * untouched, and `undefined` renders what this component has always
   * rendered, byte for byte.
   *
   * IT EXISTS BECAUSE A SECOND CLOCK MAKES THE FIRST ONE AMBIGUOUS. One
   * stopwatch needs no name; two running at once are two durations and
   * nothing else, and a name in a `title` tooltip is invisible on a phone.
   * The consuming app had already reached that conclusion and hand-drew a
   * near-identical pill beside this one to get a name into it — which is a
   * duplicated component, and the reason this is a gap rather than a
   * preference.
   *
   * AND `children` IS OMITTED ABOVE, WHICH IS THE OTHER HALF. This interface
   * extends the div props, so the TYPE said children were accepted while the
   * render wrote its own JSX children — and explicit children beat a spread,
   * so anything passed was discarded in silence. Omitting it makes the type
   * tell the truth: a stopwatch takes named slots, not arbitrary content.
   */
  leading?: React.ReactNode;
  /** Whether the clock is counting, controlled. */
  running?: boolean;
  /** Whether the clock starts counting when it manages its own state. */
  defaultRunning?: boolean;
  /** Fired when the action disc is pressed, with the state it is moving to. */
  onRunningChange?: (running: boolean) => void;
  /** Milliseconds on the clock, controlled. Pass this to own the count entirely. */
  elapsed?: number;
  /** Milliseconds on the clock when it manages its own count. */
  defaultElapsed?: number;
  /** Fired on every tick with the new count, for a caller that persists it. */
  onElapsedChange?: (elapsed: number) => void;
  /**
   * How often the display re-reads the clock, in milliseconds. A sampling
   * rate, not a motion value — see the header. Raise it for tenths.
   */
  tickInterval?: number;
  /** The action disc cannot be pressed. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /** The clock is shown but cannot be started or stopped. The disc is withdrawn. */
  readOnly?: boolean;
  /**
   * The whole pill's accessible name. Defaulted so no call site ships a
   * nameless clock, and a prop because the apps run in Arabic, Urdu and
   * Persian.
   */
  label?: string;
  /** The action disc's name while the clock is stopped. */
  startLabel?: string;
  /** The action disc's name while the clock is running. */
  stopLabel?: string;
  /**
   * Milliseconds into words. The default prints `mm:ss`, and `h:mm:ss` once
   * the hour is passed, with the digits taken from the runtime's own
   * numbering system. Replace it wholesale for tenths, for a written-out
   * duration, or for a locale that does not use a colon.
   */
  formatDuration?: (elapsed: number) => string;
}

/** `mm:ss`, or `h:mm:ss` past the hour, in the runtime's own numerals. */
function defaultFormatDuration(elapsed: number): string {
  const total = Math.max(0, Math.floor(elapsed / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const two = new Intl.NumberFormat(undefined, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  const plain = new Intl.NumberFormat(undefined, { useGrouping: false });

  return hours > 0
    ? `${plain.format(hours)}:${two.format(minutes)}:${two.format(seconds)}`
    : `${two.format(minutes)}:${two.format(seconds)}`;
}

/**
 * The system's running timer.
 *
 * TEN STATES
 *  1. default        — inverse pill, clock glyph, the time at 13/500 tabular,
 *                      the mango disc carrying the stop or start mark.
 *  2. hover          — the disc takes `--btn-primary-hover`, which is the
 *                      defined hover for a mango fill. A colour swap, never a
 *                      fade, and never `--primary` itself. The PILL has no
 *                      hover: it is a surface, not a target, and the kit
 *                      draws none.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the disc's own pill radius.
 *  4. active/pressed — does not apply as a skin. The acknowledgement is the
 *                      clock starting or stopping, which is the loudest
 *                      possible feedback; the kit draws no pressed state for
 *                      the disc.
 *  5. disabled       — `--btn-disabled-fill` under `--btn-disabled-label` on
 *                      the disc, `cursor: not-allowed`. The TIME stays fully
 *                      legible: a clock you may not stop is still a clock you
 *                      have to be able to read.
 *  6. loading        — does not apply, deliberately. A count that has not
 *                      arrived is not zero, and drawing `00:00` would state a
 *                      wrong duration. The caller renders a `Skeleton` in the
 *                      pill's place until the count exists.
 *  7. empty          — `elapsed` of `0` is the resting state and prints as
 *                      zero, which is correct: the clock exists and has run
 *                      for no time. Nothing renders `null`; a stopwatch that
 *                      disappeared at zero could never be started.
 *  8. error          — does not apply, and must not be faked. A timer that
 *                      failed to save is a fact about the save, and it
 *                      belongs to the `Alert` or `toast` that reports it. A
 *                      poppy pill would make the clock itself look wrong.
 *  9. selected       — does not apply. A stopwatch is running or stopped, and
 *                      that is state 1 against state 10, not a selection.
 * 10. read-only      — `readOnly`: the disc is withdrawn entirely rather than
 *                      drawn dead, because chapter 19's pill is already the
 *                      collapsed form and a pill with a decorative button on
 *                      it invites a press that does nothing. The time and the
 *                      glyph stay.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and chapter 19 says why in its own
 *  words: the timer's phone form IS this pill ("the timer to its pill.
 *  Collapsed is the default on a phone"). There is nothing left to collapse,
 *  so nothing changes with width. Where the pill SITS — over the work, above
 *  the bottom bar, never over a control — is the floating layer's placement
 *  and belongs to the composition that hosts it, not to this primitive; this
 *  file draws an `inline-flex` pill and positions nothing.
 *
 * RTL — safe. The glyph, the time and the disc are ordered by `flex` in DOM
 * order with no side named, so the glyph leads at the reading start in
 * Arabic, Urdu and Persian and the disc trails at the reading end. The
 * asymmetric inset is `ps-*` / `pe-*`, which are padding-inline-start and
 * -end, so the wider side follows the glyph. The clock face is not mirrored —
 * time does not run backwards in an RTL script.
 */
const Stopwatch = React.forwardRef<HTMLDivElement, StopwatchProps>(
  (
    {
      className,
      running,
      defaultRunning = false,
      onRunningChange,
      elapsed,
      defaultElapsed = 0,
      onElapsedChange,
      tickInterval = 1000,
      disabled = false,
      readOnly = false,
      label = "Stopwatch",
      leading,
      startLabel = "Start",
      stopLabel = "Stop",
      formatDuration = defaultFormatDuration,
      ...props
    },
    ref,
  ) => {
    const [innerRunning, setInnerRunning] = React.useState(defaultRunning);
    const isRunning = running ?? innerRunning;

    // The count is held in a ref and the render is nudged, so a tick costs one
    // paint rather than a state reconciliation of the whole subtree.
    const countRef = React.useRef(defaultElapsed);
    const [, nudge] = React.useReducer((n: number) => n + 1, 0);

    const reportRef = React.useRef(onElapsedChange);
    reportRef.current = onElapsedChange;

    const owned = elapsed === undefined;

    React.useEffect(() => {
      if (!owned || !isRunning) return;
      // Measured against the wall clock, so a throttled tab does not lose time.
      let last = Date.now();
      const id = window.setInterval(() => {
        const now = Date.now();
        countRef.current += now - last;
        last = now;
        reportRef.current?.(countRef.current);
        nudge();
      }, Math.max(1, tickInterval));
      return () => window.clearInterval(id);
    }, [owned, isRunning, tickInterval]);

    const shown = elapsed ?? countRef.current;
    const time = formatDuration(shown);

    const toggle = () => {
      if (disabled || readOnly) return;
      const next = !isRunning;
      if (running === undefined) setInnerRunning(next);
      onRunningChange?.(next);
    };

    return (
      <div
        ref={ref}
        data-slot="stopwatch"
        data-state={isRunning ? "running" : "stopped"}
        data-disabled={disabled ? "" : undefined}
        role="group"
        aria-label={label}
        className={cn(pillClasses, className)}
        {...props}
      >
        <Clock size={16} aria-hidden="true" className="shrink-0" />

        {/* The name of the thing being timed. Undefined renders nothing at
            all — not an empty span — so the pill is unchanged for every
            caller that does not need it. */}
        {leading === undefined ? null : leading}

        {/* `aria-live` is off on purpose: a clock that announced every second
            would talk over everything else on the page. The value is read on
            demand, which is what a screen-reader user actually does with it. */}
        <span
          data-slot="stopwatch-time"
          className="text-caption font-[var(--font-weight-medium)] tabular-nums"
        >
          {time}
        </span>

        {readOnly ? null : (
          <button
            type="button"
            data-slot="stopwatch-action"
            disabled={disabled}
            aria-label={isRunning ? stopLabel : startLabel}
            onClick={toggle}
            className={cn(
              discClasses,
              disabled
                ? "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]"
                : [
                    "cursor-pointer bg-[var(--surface-brand)] text-ink-on-accent",
                    "hover:bg-[var(--btn-primary-hover)]",
                  ],
            )}
          >
            {isRunning ? (
              <StopCircle size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    );
  },
);

Stopwatch.displayName = "Stopwatch";

export { Stopwatch };
