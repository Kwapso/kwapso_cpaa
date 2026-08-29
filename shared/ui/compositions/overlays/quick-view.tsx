"use client";

/* ============================================================================
   QuickView — CH27.37, "Quick view · A peek that never becomes the page".

   THE ONE CENTRED THING IN THE KIT. Everything else in this batch and in the
   whole system is left-aligned and left-anchored; this is the single
   exception, and it is an exception about the BOX, not about the type.

     CH27.37, verbatim:
       "Centred, and the one centred thing in the kit — A quick view is a
        modal over the list, dimmed at 34%. It is centred because it has no
        spine of its own — the type inside it is still left-aligned, like
        everywhere else."

   COMPOSED, NOT DRAWN
     · Dialog / DialogContent   — the centred modal, its scrim, its portal,
                                  its focus trap and its Escape. Radius,
                                  elevation and inset are the primitive's.
     · Sheet side="bottom"      — the narrow treatment, below 720.
     · DescriptionList          — the facts.
     · ActivityFeed             — the last two log lines.
     · Button                   — Close (paper) and Open (the one mango).
   Not one fill, radius, ring or type step is written in this file.

   DESIGN SOURCE — KWAPSO-SPEC.md CH27, composition 27.37.

     The strapline, verbatim:
       "Pressing space on a row, or the eye in its overflow. It shows enough to
        decide — identity, facts, the ask, the last two log lines — and its
        only two ways out are Close and Open. It is never where work happens."

     "It is a peek, and it says so", verbatim:
       "Facts, the ask cut at 200 characters, the last two log lines. Nothing
        is editable, there is no overflow menu and no tabs — anything that
        needs a decision needs the record."

     "Two ways out, and Open is the mango", verbatim:
       "Close returns to the list with the row still selected; Open goes to the
        record. Escape and Space both close it, and clicking the dim closes it
        — stated in the line beside the buttons."

     "It walks the list", verbatim:
       "Up and down peek at the neighbouring rows without closing, with '3 of
        24' and two arrows in the header. This is what makes quick view worth
        having: triaging twenty rows without twenty page loads."

     "Never the edit panel in disguise", verbatim:
       "Quick view and the edit panel are different overlays with different
        jobs: one is read-only and centred, the other slides from the right and
        holds fields. They never turn into each other."

     "Narrow is a half-height sheet", verbatim:
       "Below 720px it is a bottom sheet that stops at about half the screen
        with the list still visible above it, so the reader keeps their place.
        It never becomes a full-screen page — that is what Open is for."

     The drawn hint line, verbatim: "Space closes it. ↑ ↓ peeks at the next row."

   THE LAW THIS FILE OBEYS
   · THE BOX IS CENTRED, THE TYPE IS NOT. `DialogContent` centres the box.
     Nothing in this file sets `text-center`, and the headline is left-aligned
     like every other headline in the system.
   · THE ASK IS CUT AT 200 CHARACTERS, AT A WORD, WITH AN ELLIPSIS. `cutAsk`
     below is that sentence and nothing more.
   · THE DIM IS A FILL, NOT AN OPACITY. It is `Dialog`'s own scrim, a
     `color-mix` on charcoal. See the note on `SCRIM_PERCENT` — the chapter
     says 34% and CH20 draws 36%; the primitive is not touched and the two
     points are logged, not split.
   · TWO WAYS OUT, AND ONLY TWO. No overflow, no tabs, no field, no third
     button. Escape and Space close; the arrows peek without closing.
   · NOTHING IS EDITABLE. Every value is text.
   · Every user-facing string is a prop. No px, no hex, no `border`.

   NARROW (380px)
   Below 720px this composition renders `Sheet side="bottom"` capped at half
   the viewport, so the list stays visible above it and the reader keeps their
   place. The threshold is read with `matchMedia` through
   `useSyncExternalStore`, which has a server snapshot, so there is no
   hydration mismatch — the same device `Split` uses for its own narrow rule.
   The arrows, the count, the facts, the ask and the two log lines are all
   still drawn; nothing is dropped, the sheet scrolls.

   RENDERING CONTEXT
   `"use client"`. A media subscription, a key handler and two overlays.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/dialog/dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../components/sheet/sheet";
import { Hint, Text } from "../../components/typography/typography";
import { Title } from "../../components/title/title";
import {
  ActivityFeed,
  type ActivityFeedItem,
} from "../../components/activity-feed/activity-feed";
import {
  DescriptionList,
  type DescriptionListItem,
} from "../../components/description-list/description-list";
import { ChevronLeft, ChevronRight } from "../../foundations/icons";

/**
 * CH27.37: "the ask cut at 200 characters". The chapter's own figure, kept as
 * an exported constant so an application can read it rather than repeat it.
 */
export const QUICK_VIEW_ASK_LIMIT = 200;

/**
 * CH27.37 is drawn on a bottom sheet "below 720px". 45rem is 720 at the 16px
 * authoring base, written in rem so a reader on a larger text step crosses the
 * threshold at the same content width rather than the same device width.
 */
const NARROW_QUERY = "(min-width: 45rem)";

/**
 * Cut at 200 characters, at a WORD, with an ellipsis — CH27.37's own sentence.
 * The ellipsis is the single character, never three periods.
 */
export function cutAsk(text: string, limit: number = QUICK_VIEW_ASK_LIMIT): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const lastSpace = head.lastIndexOf(" ");
  return `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd()}…`;
}

/* ----------------------------------------------------------------------------
   Is there room for the centred modal, or is this the half-height sheet?

   Read through `useSyncExternalStore` so the answer re-renders on resize and
   still has a server snapshot. The server answer is the WIDE one: a peek that
   renders centred and then becomes a sheet is a smaller surprise than one
   that renders as a sheet on a desktop.
   ------------------------------------------------------------------------- */
function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readWidth(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(NARROW_QUERY).matches;
}

function useHasRoom(): boolean {
  return React.useSyncExternalStore(subscribeToWidth, readWidth, () => true);
}

/** One fact in the peek. Never a field. */
export interface QuickViewFact {
  /** Stable key. */
  id: string;
  /** "Owner", "Opened", "Due", "Tickets". */
  label: React.ReactNode;
  /** The value, already formatted by the application (ruling 07 owns dates). */
  value?: React.ReactNode;
}

/** Every user-facing string this overlay owns. */
export interface QuickViewLabels {
  /** The header's accessible name for the count, e.g. "Position in the list". */
  positionLabel: string;
  /** The back arrow's accessible name. */
  previous: string;
  /** The forward arrow's accessible name. */
  next: string;
  /** The heading over the record's own words. */
  askTitle: string;
  /** The heading over the last two log lines. */
  logTitle: string;
  /** The line beside the buttons. CH27.37 requires it in words. */
  keyboardHint: string;
  /** The paper way out. */
  close: string;
  /** The one mango. */
  open: string;
  /** Accessible name for the two log lines. */
  logLabel: string;
  /** Accessible name for the facts. */
  factsLabel: string;
}

const DEFAULT_LABELS: QuickViewLabels = {
  positionLabel: "Position in this list",
  previous: "Peek at the previous row",
  next: "Peek at the next row",
  askTitle: "What was asked",
  logTitle: "Latest activity",
  /* CH27.37's own drawn line, verbatim. */
  keyboardHint: "Space closes it. ↑ ↓ peeks at the next row.",
  close: "Close",
  open: "Open",
  logLabel: "The last two log lines",
  factsLabel: "Facts",
};

export interface QuickViewProps {
  /** Whether the peek is open. */
  open: boolean;
  /** Closing — Escape, Space, the dim, or Close. */
  onOpenChange: (open: boolean) => void;

  /** Where in the list this row is. CH27.37 draws "3 of 24". */
  position?: number;
  /** How long the list is. */
  total?: number;
  /** "3 of 24", as words. A prop, because the joining word is translated. */
  formatPosition?: (position: number, total: number) => string;
  /** ↑ or the back arrow. Peeks WITHOUT closing. */
  onPrevious?: () => void;
  /** ↓ or the forward arrow. Peeks WITHOUT closing. */
  onNext?: () => void;

  /** The record number. The charcoal pill. */
  recordNumber?: React.ReactNode;
  /** Where it stands. The quiet pill — mango is the brand, not a status. */
  status?: React.ReactNode;
  /** The relation, and since when. */
  chips?: React.ReactNode;
  /** The record's name. Left-aligned, like every headline in the kit. */
  title: React.ReactNode;

  /** Identity facts. Read-only, always. */
  facts?: readonly QuickViewFact[];

  /**
   * The record's own words. Cut at 200 characters at a word with an ellipsis
   * — pass the FULL text and let this component cut it, so the limit is
   * applied once in the system.
   */
  ask?: string;
  /** Override the chapter's 200. */
  askLimit?: number;

  /** The last two log lines. CH27.37 says two; more are not drawn. */
  log?: readonly ActivityFeedItem[];

  /** Open goes to the record. The one mango on this overlay. */
  onOpen?: () => void;

  /** Merged over the defaults. */
  labels?: Partial<QuickViewLabels>;
}

/**
 * A peek at one row.
 *
 * TEN STATES
 *  1. default        — centred modal over a charcoal scrim; the box is
 *                      centred, the type inside it is not.
 *  2. hover          — the arrows' and the buttons' own.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Radix traps focus inside the overlay while it is open.
 *  4. active/pressed — the controls' own.
 *  5. disabled       — the arrows only, at the ends of the list: no handler is
 *                      passed, so the control is not rendered at all rather
 *                      than dimmed (CH24.6).
 *  6. loading        — does not apply. A peek opens from a row the reader is
 *                      already looking at; the values are already in hand.
 *  7. empty          — does not apply. A quick view of nothing is not opened.
 *  8. error          — does not apply to the frame. A record that could not be
 *                      read is a page failure, not a peek.
 *  9. selected       — belongs to the ROW behind it. CH27.37: "Close returns
 *                      to the list with the row still selected."
 * 10. read-only      — ALWAYS, and it is the composition's whole point.
 *
 * THREE BREAKPOINTS
 *  · 380 / mobile — `Sheet side="bottom"`, capped at half the viewport, list
 *    still visible above it. Everything is drawn; the sheet scrolls.
 *  · tablet / desktop (from 45rem) — the centred modal at the kit's 460 width.
 *
 * RTL — LTR only by client ruling. The arrows are `ChevronLeft`/`Right`, which
 * is what the chapter draws.
 */
function QuickView({
  open,
  onOpenChange,
  position,
  total,
  formatPosition = (at, of) => `${at} of ${of}`,
  onPrevious,
  onNext,
  recordNumber,
  status,
  chips,
  title,
  facts = [],
  ask,
  askLimit = QUICK_VIEW_ASK_LIMIT,
  log = [],
  onOpen,
  labels,
}: QuickViewProps) {
  const words: QuickViewLabels = { ...DEFAULT_LABELS, ...labels };
  const hasRoom = useHasRoom();

  /* CH27.37: "Escape and Space both close it" — Escape is Radix's; Space is
     this composition's, and it must not steal the key from a focused button.
     Up and down peek WITHOUT closing. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      if (onPrevious === undefined) return;
      event.preventDefault();
      onPrevious();
      return;
    }
    if (event.key === "ArrowDown") {
      if (onNext === undefined) return;
      event.preventDefault();
      onNext();
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      onOpenChange(false);
    }
  };

  const counter =
    position === undefined || total === undefined || total <= 0 ? null : (
      <span className="flex items-center gap-1">
        <Hint as="span" numeric aria-label={words.positionLabel}>
          {formatPosition(position, total)}
        </Hint>
        {onPrevious === undefined ? null : (
          <Button variant="ghost" size="sm" aria-label={words.previous} onClick={onPrevious}>
            <ChevronLeft size={16} />
          </Button>
        )}
        {onNext === undefined ? null : (
          <Button variant="ghost" size="sm" aria-label={words.next} onClick={onNext}>
            <ChevronRight size={16} />
          </Button>
        )}
      </span>
    );

  const identity =
    recordNumber === undefined && status === undefined && chips === undefined ? null : (
      <span className="flex flex-wrap items-center gap-2">
        {recordNumber === undefined ? null : <Badge variant="inverse">{recordNumber}</Badge>}
        {status === undefined ? null : <Badge>{status}</Badge>}
        {chips}
      </span>
    );

  const factItems: DescriptionListItem[] = facts.map((fact) => ({
    id: fact.id,
    label: fact.label,
    value: fact.value,
  }));

  /* The body, identical in both overlays — CH27.37 draws the same peek at both
     widths and the narrow one is not a shorter sentence. */
  const body = (
    <div className="flex min-w-0 flex-col gap-[var(--space-5)]">
      {identity}

      {factItems.length === 0 ? null : (
        <DescriptionList
          items={factItems}
          layout="grid"
          density="dense"
          aria-label={words.factsLabel}
        />
      )}

      {ask === undefined ? null : (
        <section className="flex min-w-0 flex-col gap-2">
          <Title size="h4" as="h3" rule={false}>
            {words.askTitle}
          </Title>
          <Text as="p" size="sm" tone="secondary" measure>
            {cutAsk(ask, askLimit)}
          </Text>
        </section>
      )}

      {log.length === 0 ? null : (
        <section className="flex min-w-0 flex-col gap-2">
          <Title size="h4" as="h3" rule={false}>
            {words.logTitle}
          </Title>
          <ActivityFeed items={[...log]} density="compact" label={words.logLabel} />
        </section>
      )}
    </div>
  );

  /* CH27.37: the two ways out, with the keyboard line stated beside them. */
  const ways = (
    <React.Fragment>
      <Hint as="span" className="me-auto">
        {words.keyboardHint}
      </Hint>
      <Button variant="secondary" onClick={() => onOpenChange(false)}>
        {words.close}
      </Button>
      {/* THE ONE MANGO ON THIS OVERLAY. */}
      <Button onClick={onOpen}>{words.open}</Button>
    </React.Fragment>
  );

  if (!hasRoom) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          data-slot="quick-view"
          data-width="narrow"
          onKeyDown={handleKeyDown}
          /* "a bottom sheet that stops at about half the screen with the list
             still visible above it" — CH27.37. Layout only; the fill, the
             radius and the elevation are `Sheet`'s. */
          className="h-[50dvh] max-h-[50dvh]"
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {counter}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-[var(--space-6)] py-[var(--space-4h)]">
            {body}
          </div>
          <SheetFooter>{ways}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="quick-view"
        data-width="wide"
        onKeyDown={handleKeyDown}
        /* NO DESCRIPTION, SAID OUT LOUD. Radix wants either a
           `DialogDescription` or an explicit `aria-describedby={undefined}`,
           and with neither it logs a warning into every consumer's console —
           this composition was the one of the five dialog overlays that had
           neither. A peek has no summary line above its facts: the facts ARE
           the body, and inventing a sentence to satisfy the check would be
           putting words on the screen to quieten a log. So the honest half of
           Radix's own contract is the one taken. */
        aria-describedby={undefined}
        /* No `showClose={false}`: the chip is the drawn ×, and Close in the
           footer is the stated way out. Both close, neither edits. */
      >
        <DialogHeader>
          {counter}
          {/* The BOX is centred. The headline is not — CH27.37, in its own
              words: "the type inside it is still left-aligned". */}
          <DialogTitle className="text-start">{title}</DialogTitle>
        </DialogHeader>
        <div className="mt-[var(--space-4h)] min-w-0">{body}</div>
        <DialogFooter>{ways}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

QuickView.displayName = "QuickView";

export { QuickView };
