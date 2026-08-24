/* ============================================================================
   Queue — one record at a time: decide, and advance.

   DESIGN SOURCE
   `KWAPSO-SPEC.md` CH19 view 13 and CH27.41 "Triage sitting · Figures, then
   one card at a time". CH19 draws the view with real content — a counted line
   ("3 of 18 to decide"), a record card carrying its number and the day it was
   raised, a title at the 24 step, the record's own words, and a row of
   decisions with a skip at the end. Its drawn values for the strip are
   `height: 4px` on the bar and a width that is the fraction itself.

   CH27.41's rules are the brief, verbatim:

       "A counted strip over a queue that hands you one item. The figures come
        from chapter 13, the card is the record card, and the rest of the queue
        sits in the quiet fill — present and countable, but not yet yours. It
        ends, which is what separates a sitting from a list."

       "One card is raised, the rest are quiet — The item in hand takes a paper
        card with the resting shadow. Everything behind it sits in the quiet
        fill with disabled ink — visible, ordered, not yet yours."

       "Pass is not a delete — Pass sends the item to the end of the queue and
        names who passed it in the log. Nothing leaves a sitting silently, and
        the count never drops without a reason attached."

       "It ends, and it remembers — Six of eighteen is stated on the card.
        Leaving mid-sitting keeps your place the way a draft does (ruling 11),
        so triage can be done in two sittings without losing the order."

   OVERRIDE 29 (2026-08-23) — THE WORD IS "SKIP".
   CH19 view 13 draws the control as "Skip →" and 27.41 calls it Pass. The
   client ruled: the word is SKIP, everywhere, and `skipLabel` already
   defaults to it. `TriageSittingScreen`, which was drawing 27.41's "Pass"
   over the top of this component, now says Skip too.

   OVERRIDE 34, AMENDED 2026-08-23 — SKIP RE-QUEUES, AND WRITES NOTHING.
   THE EARLIER READING OF THIS ROW WAS WRONG AND THE CLIENT CORRECTED IT.
   For three hours this row read "a plain advance: next item, nothing else",
   and this header said NO RE-QUEUE, NO LOG LINE. The client's answer to N3
   was "n3-1 but without the log", which takes the FIRST half of 27.41's
   paragraph and rejects only the second:

       "Pass sends the item to the end of the queue"      — STANDS. RULED.
       "and names who passed it in the log."              — OVERRULED.
       "Nothing leaves a sitting silently"                — falls with it.

   So the item does NOT leave the sitting. It goes to the END of the order and
   comes back before the sitting ends, the count never drops, and NO log line
   is written by anyone. 27.41 is owed a correction upstream on its log clause
   only (KWAPSO-SPEC.md, ARTIFACT CORRECTIONS OWED — the CH27.41 line).

   The word is still Skip (override 29) and the prop is still `onSkip`.

   WHAT THIS COSTS, AND WHY THE COMPONENT DID NOT ABSORB IT
   A queue that re-queues OWNS ITS ORDER. This one does not and cannot be made
   to without breaking the applications that already import it:

     · the item in hand arrives as FOUR SEPARATE PROPS — `eyebrow`, `title`,
       `body`, `children` — not as an element of a list;
     · the tail arrives as `upcoming`, whose element type `QueueUpcoming` is
       `{ id?, label }` and holds none of those four fields.

   For this component to move an item to the end of its own order, the card in
   hand and the tail rows would have to be the SAME kind of thing. Making them
   so means either widening `QueueUpcoming` to carry the card, or replacing
   `title`/`body`/`eyebrow` with an items array. Both change a PUBLIC PROP'S
   TYPE, and both apps vendor this file, so neither is taken. The order stays
   the application's, and the obligation is written down here instead.

   WHAT AN APPLICATION MUST DO — THIS IS THE RULED MECHANIC, NOT A SUGGESTION
   `onSkip` fires and this component re-renders from whatever props it is then
   handed. All four of these are the caller's to honour:

     1. MOVE, DO NOT DROP. On `onSkip`, take the item in hand out of the front
        of the sitting's order and put it at the BACK. It is not removed, not
        filtered out, and not marked resolved.
     2. `total` DOES NOT MOVE. Nothing left the sitting, so the denominator is
        fixed for the life of the sitting. `position` advances; `total` does
        not. A `total` that drops on a skip is the overturned mechanic still
        running, and this file warns about it in development (see below).
     3. THE TAIL MUST SHOW IT. Pass the re-queued item at the END of
        `upcoming`, so the sitting reads as the ring it now is rather than as
        a runway. A tail that silently omits the skipped record contradicts
        the ruling on the one surface a reader can check it on.
     4. WRITE NOTHING. No log line, no activity entry, no "M. Renz skipped
        #4182". The client struck that half. A caller that logs is adding a
        behaviour the kit did not ask for.

   AND ONE THING AN APPLICATION MUST NOT DO: mark the re-queued row. The
   client ruled a MECHANIC, not a mark. There is no `skippedLabel`, no second
   tone on the tail's last row and no badge — inventing one would be putting a
   word in front of a reader that nobody chose, which is the mistake N4 exists
   to stop. `nextLabel` on the first row is the only mark the tail carries.

   A RECORD CAN BE SKIPPED TWICE, AND THERE IS NO LIMIT. RULED 2026-08-23,
   OVERRIDE 48 — the last thing 27.41 left open about the mechanic.
     · 27.41 says a pass sends the record to the end of the queue AND that a
       sitting "ends, which is what separates a sitting from a list". It never
       says what stops the second skip. This file used to carry that as an
       open question with a suggestion attached — "an item already skipped
       once has no Skip offered the second time it comes round" — and the
       suggestion is now WITHDRAWN, not merely unimplemented.
     · THE RULE: a record may be skipped any number of times. Skip is always
       offered. Nothing counts skips, nothing exhausts, no record is ever
       barred from the control, and the kit holds no per-record skip state to
       do it with. A sitting ends when the reader DECIDES the last undecided
       record, not when the queue runs out of patience — which keeps 27.41's
       own sentence true without a guard the chapter never asked for.
     · NOTHING ENFORCES A LIMIT, AND NOTHING MAY BE ADDED THAT DOES. No
       counter, no `skipsRemaining`, no disabled Skip, no warning on the
       second pass. An application that wants a bounded sitting bounds it
       upstream by not handing the record back; that is its order to keep
       (obligation 1 above), not this component's.
     · The `total` guard below is untouched and is NOT a skip limit: it
       checks that the denominator did not fall, which is the re-queue
       obligation, and it fires on the first skip exactly as on the fiftieth.

   WHAT 27.41 STILL DOES NOT SETTLE, AND THE APPLICATION MUST DECIDE
     · WHAT THE COUNTER COUNTS. "6 of 18" is now unambiguously HOW MANY YOU
       HAVE BEEN HANDED, not how many are decided, because a skipped record
       is handed to you twice. Applications should not re-point `position` at
       a count of decisions without changing `formatCount` to say so.

   THE LAW THIS FILE OBEYS
   · THE BAR IS `Progress`. Its 4 height, its 4 radius and its charcoal runner
     are the primitive's; this file only says how far along. A queue that drew
     its own bar would be a second bar in the system.
   · THE DECISIONS ARE THE CALLER'S. CH19 names three of them on one screen,
     and they are that screen's vocabulary, not the kit's — a component that
     shipped them as defaults would put product words in the design system.
     What this file owns is the MECHANIC: a decision row, and one advance that
     does not decide. Logged as GAPS-TRACK2A QUE-1.
   · ADVANCING IS NOT DELETING. The advance control is a `ghost` button —
     chapter 26 names "Skip" as the example of exactly that variant — never
     destructive and never mango. The one mango on the screen, if there is
     one, is a decision the caller passes. And "not deleting" is now literal
     rather than decorative: under the amended override 34 the record goes to
     the END of the sitting and comes back, so a skip removes nothing at all.
   · ONE CARD IS RAISED, THE REST ARE QUIET. The item in hand is `Card`; the
     rest of the queue is `--surface-quiet` with `--ink-disabled`. That is a
     FILL and an INK, not an opacity, and it is what CH27.41 asks for in those
     words.
   · IT ENDS — AND UNDER THE AMENDED OVERRIDE 34 THE CALLER HAS TO MAKE THAT
     TRUE. `done` is a real state with its own register, not an empty list: a
     sitting that finished must say so, or it is indistinguishable from one
     that failed to load. A re-queueing sitting does not reach `done` on its
     own; see "what 27.41 still does not settle" above.
   · Radii 24 on the card, 4 on the bar, 999 on the buttons. No `border`
     property. Focus is one global rule (tokens.css §8). rem only, every
     string a prop with a default, LTR only.

   RENDERING CONTEXT
   `"use client"`. The advance control builds a handler during this module's
   own render, and the file holds two refs and one development-only effect —
   the `total` guard described above. Nothing about the drawing depends on
   them and they compile away to nothing in production.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "../../controls/button/button";
import { Card, CardContent } from "../../controls/card/card";
import { Progress } from "../../controls/progress/progress";
import { CollectionRegister } from "../collection-frame/collection-frame";

export interface QueueUpcoming {
  /** Stable key. Falls back to the index. */
  id?: string;
  /** What the waiting item says. One line, with an ellipsis. */
  label: React.ReactNode;
}

export interface QueueProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /**
   * Which item is in hand, one-based. The kit states it on the card.
   *
   * It counts HOW MANY YOU HAVE BEEN HANDED, not how many you have decided —
   * a skipped record is handed to you twice under the amended override 34 —
   * and any number of times beyond that, since override 48 puts no limit on
   * how often one record may be skipped.
   */
  position?: number;
  /**
   * How many the sitting holds. Zero or undefined draws no strip.
   *
   * IT DOES NOT MOVE WHEN AN ITEM IS SKIPPED. Skipping re-queues (override
   * 34, amended 2026-08-23): nothing leaves the sitting, so the denominator
   * is fixed for the sitting's life. A `total` that drops across a skip is
   * warned about in development.
   */
  total?: number;
  /** The counted line. A prop, because "of" is a word and words translate. */
  formatCount?: (position: number, total: number) => string;
  /** What a screen reader hears for the bar. */
  progressLabel?: string;

  /** The line over the record's name — its number and when it was raised. */
  eyebrow?: React.ReactNode;
  /** The record's name, at the kit's 24 step. */
  title?: React.ReactNode;
  /** The record's own words, kept whole. */
  body?: React.ReactNode;
  /** Anything else inside the card — facts, a mark, an attachment row. */
  children?: React.ReactNode;

  /**
   * The decisions, as controls. The kit draws three on its own screen and
   * they belong to that screen; pass `Button`s. One of them may be mango.
   */
  decisions?: React.ReactNode;
  /**
   * Advance without deciding. Without it the control is not rendered.
   *
   * IT RE-QUEUES, AND IT WRITES NOTHING — override 34 as AMENDED on
   * 2026-08-23, after the client corrected the earlier "plain advance"
   * reading with "n3-1 but without the log".
   *
   * This component cannot do the re-queue itself: it is handed the item in
   * hand as `eyebrow`/`title`/`body` and the tail as `upcoming`, and those
   * are different shapes, so it has no single order to rotate. THE HANDLER
   * OWES ALL OF THIS:
   *
   *   · move the item in hand to the END of the sitting's order — do not
   *     drop it, do not resolve it, do not filter it out;
   *   · leave `total` alone; advance `position`;
   *   · pass the moved item back at the end of `upcoming`;
   *   · write NO log line. The client struck that half of 27.41 explicitly.
   *
   * Do not mark the re-queued row. A mechanic was ruled, not a mark.
   *
   * NO LIMIT ON HOW OFTEN ONE RECORD IS SKIPPED (override 48, 2026-08-23).
   * Skip is offered on every render of every record, however many times that
   * record has come round. Do not withhold this handler to exhaust a record,
   * and do not count skips: the sitting ends when the last undecided record
   * is DECIDED.
   */
  onSkip?: () => void;
  /** What the advance says. Ruled: "Skip" (override 29). Chapter 26's own
      example of the `ghost` variant, and CH19 view 13's own word. */
  skipLabel?: string;

  /**
   * The rest of the queue — present and countable, not yet yours.
   *
   * Under the amended override 34 this is a RING, not a runway: the record
   * just skipped belongs at the END of this list, because it comes back. The
   * caller supplies that; this component renders the order it is given and
   * puts no mark on the returning row.
   */
  upcoming?: readonly QueueUpcoming[];
  /** The micro line over the waiting items. */
  upcomingLabel?: string;
  /** The mark on the first waiting item, which is the one that comes next. */
  nextLabel?: string;

  /** The sitting is finished. Its own register, and it beats `empty`. */
  done?: boolean;
  doneLabel?: string;
  doneBody?: string;
  doneAction?: React.ReactNode;
  doneState?: React.ReactNode;

  /* ---- the three registers ------------------------------------------------ */
  loading?: boolean;
  error?: boolean;
  /** Nothing was ever in the sitting. Different from `done`, which finished it. */
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;

  /** The sitting's accessible name. */
  label?: string;
}

/**
 * A sitting: one record in hand, the rest counted behind it.
 *
 * TEN STATES
 *  1. default        — the counted strip, the raised card, the decisions, and
 *                      the rest of the queue in the quiet fill.
 *  2. hover          — the BUTTONS' own. The card does not hover: it is not a
 *                      target, it is the thing you are looking at. A quiet
 *                      upcoming item does not hover either — it is not yours
 *                      yet, and a hover would say it was.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Nothing in this file sets `overflow: hidden`.
 *  4. active/pressed — `Button`'s own nudge, on the decisions and the advance.
 *  5. disabled       — a decision disables itself; the caller passes a
 *                      disabled `Button`, which is a fill and an ink. The
 *                      advance disables itself by not being handed a handler.
 *  6. loading        — `loading`: the busy register in place of the sitting.
 *                      The card's shape is not known before its record is —
 *                      the prose is the caller's and its length is the whole
 *                      of the card's height.
 *  7. empty          — `empty`: nothing was ever in the sitting. Distinct
 *                      from `done`, which is a sitting that FINISHED, and the
 *                      two say different things because they mean different
 *                      things.
 *  8. error          — `error`: the register with a poppy dot. Beats empty.
 *  9. selected       — does not apply. A queue hands you one item; there is
 *                      nothing to choose between.
 * 10. read-only      — no decisions and no advance: the sitting still reads,
 *                      which is what a client's "waiting on you" needs.
 *
 *  Precedence: loading beats error beats done beats empty.
 *
 * THREE BREAKPOINTS
 *  · mobile — the card FILLS THE WIDTH and the decision row wraps rather than
 *    squeezing, so a decision is never a half-width target. CH27.41's own
 *    narrow render: "figures scroll, the card fills the screen." The counted
 *    strip stays: it is the one thing that tells a person how much is left,
 *    and it is a line and a bar, which fit anywhere.
 *  · tablet — unchanged.
 *  · desktop — unchanged in kind; the card takes a measure rather than the
 *    whole window, because a record's prose at 1200 wide is unreadable and
 *    `Card` is already the thing that holds a measure.
 *
 * RTL — LTR only (ruling 10). Every inset is logical, the advance is pushed
 * with `ms-auto`, and no rule names a side.
 */
const Queue = React.forwardRef<HTMLDivElement, QueueProps>(
  (
    {
      className,
      position,
      total,
      formatCount = (at, of) => `${at} of ${of}`,
      progressLabel = "Progress through this sitting",
      eyebrow,
      title,
      body,
      children,
      decisions,
      onSkip,
      skipLabel = "Skip",
      upcoming,
      upcomingLabel = "Next",
      nextLabel = "next",
      done = false,
      doneLabel = "Nothing left",
      doneBody = "You have been through everything in this sitting.",
      doneAction,
      doneState,
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing here",
      emptyBody = "There is nothing waiting for you right now.",
      errorLabel = "Unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label = "Queue",
      ...props
    },
    ref,
  ) => {
    /* THE ONE PIECE OF THE AMENDED OVERRIDE 34 THIS COMPONENT CAN ENFORCE.
       It cannot do the re-queue — it does not own the order — but it IS
       handed `total` on every render, and the ruling fixes `total` for the
       life of a sitting: nothing leaves, so the denominator cannot drop. A
       `total` that falls across a skip is the OVERTURNED mechanic still
       running in a call site written against the three-hour-old reading of
       row 34, and that is exactly the bug worth catching.

       Only a skip is checked, so a caller that legitimately hands the same
       element a different, shorter sitting is not warned at. Development
       only: `console.warn`, never a throw, and dead code in production.
       The precedent for a development warning in a composition is
       `TriageSittingScreen`'s fourth figure. */
    const totalOnSkip = React.useRef<number | undefined>(undefined);
    const skipPending = React.useRef(false);

    React.useEffect(() => {
      if (process.env.NODE_ENV === "production") return;
      if (!skipPending.current) return;
      skipPending.current = false;
      const before = totalOnSkip.current;
      if (before !== undefined && total !== undefined && total < before) {
        console.warn(
          `Queue: \`total\` fell from ${String(before)} to ${String(total)} across a skip. Skipping RE-QUEUES (override 34, amended 2026-08-23) — the item goes to the end of the sitting and nothing leaves it, so \`total\` is fixed for the sitting's life. A caller that drops it is still running the overturned "plain advance".`,
        );
      }
    });

    const handleSkip = React.useCallback(() => {
      totalOnSkip.current = total;
      skipPending.current = true;
      onSkip?.();
    }, [onSkip, total]);

    /* Exclusive states resolved in JS (PATTERN §4). `done` sits between error
       and empty: a sitting that finished is not a sitting that was never
       filled, and the two must not share one sentence. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : done
          ? "done"
          : empty
            ? "empty"
            : "default";

    if (state !== "default") {
      const register =
        state === "loading"
          ? (loadingState ?? (
              <CollectionRegister tone="busy" eyebrow={loadingLabel} busyLabel={loadingLabel} />
            ))
          : state === "error"
            ? (errorState ?? <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />)
            : state === "done"
              ? (doneState ?? (
                  <CollectionRegister
                    tone="quiet"
                    eyebrow={doneLabel}
                    body={doneBody}
                    actions={doneAction}
                  />
                ))
              : (emptyState ?? <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />);

      return (
        <div
          ref={ref}
          data-slot="queue"
          data-state={state}
          aria-busy={loading || undefined}
          className={cn("min-w-0", className)}
          {...props}
        >
          {register}
        </div>
      );
    }

    const counted =
      position !== undefined && total !== undefined && total > 0 ? (
        /* ONE ROW, count first, bar taking the rest. CH19 view 13 draws
           `display: flex; align-items: center; gap: 12px; padding: 0 12px`
           with the counted line at the reading start and the track at
           `flex: 1 1 auto`. It was stacked, count over bar, which read as two
           statements instead of one. */
        <div data-slot="queue-count" className="flex min-w-0 items-center gap-3 px-3">
          <span className="flex-none text-xs tabular-nums text-ink-tertiary">
            {formatCount(position, total)}
          </span>
          {/* `Progress` owns the bar. This says how far along, and nothing more. */}
          <Progress value={position} max={total} label={progressLabel} className="flex-1" />
        </div>
      ) : null;

    return (
      <div
        ref={ref}
        data-slot="queue"
        data-state="default"
        aria-label={label}
        /* Strip to card is the drawn 12. */
        className={cn("flex min-w-0 flex-col gap-3", className)}
        {...props}
      >
        {counted}

        {/* The one raised thing on the screen. */}
        {/* CH27.41: "The item in hand takes a paper card with the resting
            shadow." `raised` is off-beige over soft paper plus `--shadow-rest`,
            which is that sentence as a variant. */}
        <Card data-slot="queue-card" variant="raised" className="min-w-0">
          <CardContent className="flex min-w-0 flex-col gap-3">
            {eyebrow !== undefined && eyebrow !== null ? (
              /* NOT an eyebrow in the typographic sense. The artifact draws
                 this line `font-size: 11px; color: var(--fg3);
                 font-variant-numeric: tabular-nums` — no uppercase, no 500 —
                 because what it holds is a record number and a date
                 ("#1513 · raised 10 June 2025"), which have to be tabular and
                 must not be shouted. */
              <span className="text-micro tracking-[var(--tracking-normal)] tabular-nums text-ink-tertiary">
                {eyebrow}
              </span>
            ) : null}

            {title !== undefined && title !== null ? (
              <p className="min-w-0 text-2xl font-[var(--font-weight-medium)]">{title}</p>
            ) : null}

            {body !== undefined && body !== null ? (
              <p className="min-w-0 max-w-[60ch] text-sm leading-[var(--leading-normal)] text-ink-secondary">
                {body}
              </p>
            ) : null}

            {children}

            {decisions || onSkip ? (
              <div
                data-slot="queue-decisions"
                /* `margin-top: auto; display: flex; gap: 8px; flex-wrap:
                   wrap` — and NOTHING else. The artifact draws no rule over
                   the decision row and no 14 of padding above it; the
                   decisions are pinned to the foot of the card by `mt-auto`,
                   which is what makes the card read as one held item rather
                   than as a card with a footer bolted on. */
                className="mt-auto flex flex-wrap items-center gap-2"
              >
                {decisions}
                {onSkip ? (
                  /* Advancing is not deciding, and it is not deleting.
                     Chapter 26 names "Skip" as the ghost variant's example. */
                  <Button variant="ghost" className="ms-auto" onClick={handleSkip}>
                    {skipLabel}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* The rest of the sitting: present and countable, not yet yours. */}
        {upcoming && upcoming.length > 0 ? (
          <div data-slot="queue-upcoming" className="flex min-w-0 flex-col gap-2">
            <span className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
              {upcomingLabel}
            </span>
            <ul className="flex min-w-0 flex-col gap-1">
              {upcoming.map((item, index) => (
                <li
                  key={item.id ?? String(index)}
                  data-slot="queue-upcoming-item"
                  /* A fill and an ink — CH27.41's own words — never an
                     opacity, and never a control: it is not yours yet. */
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-[var(--radius)]",
                    "bg-surface-quiet px-[var(--space-3h)] py-[var(--space-2h)]",
                    "text-caption text-ink-disabled",
                  )}
                >
                  <span className="min-w-0 truncate">{item.label}</span>
                  {index === 0 ? (
                    <span className="ms-auto flex-none text-micro uppercase">{nextLabel}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  },
);

Queue.displayName = "Queue";

export { Queue };
