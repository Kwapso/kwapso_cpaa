"use client";

/* ============================================================================
   ActivityFeed — a record's history, newest first (3 direct call sites).

   DESIGN SOURCE
   Kit chapter 18 ("Data display · KPIs · progress · charts · calendar ·
   board"), the block captioned "Activity feed", read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. Kept figure for
   figure:

     · the row    — `display: grid; grid-template-columns: 74px 24px 1fr;
                     BUILT as `24px 1fr auto` -- ruling R2 moved the time to
                     the trailing end, per 27.9 and 27.34. See the cva.
                     gap: 14px; align-items: start; padding: 12px 0;
                     box-shadow: inset 0 -1px 0 var(--hair);` and the last row
                     drops the rule
     · the time   — 12 / tertiary ink / tabular figures
     · the mark   — 24 pill on `--card`, initials at 10 / 500, `flex: none`
     · the line   — 13.5 / 1.45, primary ink, with the record's name at 500

   Chapter 19 draws the same block a second time as collection view 15
   ("feed") at `96px 28px 1fr`. Two drawings, one picture; chapter 18's
   figures are the ones taken, because 74 is the narrower and therefore the
   one that survives a 320 viewport.

   The three registers are `kwapso-ui.css` → `.kw-empty` and
   `kwapso-patterns.css` → `.kw-register`, reached through
   `CollectionRegister` so that nine collections cannot drift apart.

   THE LAW THIS FILE OBEYS
   · A pill is a person, a square is a thing, at 24 / 32 / 48 with `flex:
     none` (ruling 30). The feed's mark is 24 — `Avatar size="sm"` — and it
     never shrinks, so the text column never eats it on a narrow row.
   · Every number in a column or a timestamp is tabular (kit chapter 03).
   · Blocks are separated by colour, not by strokes — but same-tone row
     separation is the blessed hairline, and that is exactly what these rules
     are. `--border`, not the heavier `--hair-strong`, which is a SECTION rule.
   · Ruling 02: nothing hardcodes 9, 10 or 11 any more, and uppercase eyebrows
     keep 11. The kit's 12 time and 13.5 line therefore land on `text-xs` and
     `text-caption`; the 10 initials are `Avatar size="sm"`'s own `text-micro`,
     which is the eyebrow step and is allowed to be 11.
   · A row that is a target takes `--accent`, the neutral row wash. Never
     mango: mango is a brand fill, never a hover.
   · Focus is one global rule (tokens.css §8). Nothing here draws a ring.
   · No product vocabulary. This is a history of ENTRIES about RECORDS, and
     the words in it are the caller's.

   RENDERING CONTEXT
   `"use client"` — `onSelect` is turned into a per-row handler during this
   module's own render (PATTERN §8).
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../controls/avatar/avatar";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

const feedRowVariants = cva(
  [
    /* MARK, SENTENCE, TIME -- in that order. RULED R2, 2026-08-23,
       verify/decisions.html R.

       Chapter 18 draws `74px 24px 1fr`: time first, in a fixed column, every
       timestamp aligned down the page. 27.9 and 27.34 both draw the time at
       the TRAILING end instead, and 27.34's whole argument is that the inbox
       reuses the log's row rather than teaching a second one -- so the two
       could not both stand. The client took the trailing time: the sentence
       starts at the margin and gets the full measure, and the time is where
       the eye lands last.

       The time column is `auto`, not a fixed 74: trailing, its job is to take
       what the string needs and no more. One answer applied here fixes 27.9,
       27.34 and the record footer at once, which is why it is one component. */
    "grid grid-cols-[var(--avatar-sm)_1fr_auto]",
    "items-start gap-[var(--space-3h)]",
    // Same-tone row separation, the blessed hairline. The last row drops it.
    /* Inset shadow, never a border. The artifact draws every rule this
     way; these two survived the border sweep because a row divider
     reads as layout rather than decoration. */
  "shadow-[var(--hairline-under)] last:shadow-none",
    // A row holds long unbreakable strings; without this one of them widens
    // the whole feed.
    "min-w-0 text-start",
  ],
  {
    variants: {
      /** Chapter 18 draws 12 of block padding; `compact` is the dense row. */
      density: {
        default: "py-3",
        compact: "py-2",
      },
    },
    defaultVariants: { density: "default" },
  },
);

export interface ActivityFeedItem {
  /** Stable key. Never an array index — the feed prepends. */
  id: string;
  /**
   * When it happened, already formatted by the caller. Ruling 07 makes date
   * format follow the APP language rather than the browser, which this
   * component cannot know, so it renders what it is handed and formats
   * nothing itself.
   */
  time?: React.ReactNode;
  /** Machine-readable instant for the `<time datetime>` attribute. */
  dateTime?: string;
  /** What happened. A node, so a record's name can be emphasised inside it. */
  description: React.ReactNode;
  /** Who did it, for the mark's accessible name. */
  actor?: string;
  /** Two characters. Ruling 30: never three, never a photograph as initials. */
  initials?: React.ReactNode;
  /** A photograph. Falls back to the initials silently if it fails. */
  avatarSrc?: string;
  /**
   * `pill` for a person, `square` for a thing (ruling 30). Defaults to `pill`
   * because a feed entry is normally somebody doing something.
   */
  shape?: "pill" | "square";
  /** One mark per view may take mango (ruling 30). Opt in per entry. */
  variant?: "default" | "inverse" | "brand" | "quiet";
  /** A second line under the description — a context line, a value, a note. */
  meta?: React.ReactNode;
  /** This entry cannot be opened. Only meaningful with `onSelect`. */
  disabled?: boolean;
}

export interface ActivityFeedProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect">,
    VariantProps<typeof feedRowVariants> {
  /**
   * The history, NEWEST FIRST. This component does not sort: ordering is a
   * data decision and a component that silently re-ordered its input would be
   * lying about what the caller handed it. Pass `reverse` if the data arrives
   * oldest-first.
   */
  items?: ActivityFeedItem[];
  /** Render the array back to front, for data that arrives oldest-first. */
  reverse?: boolean;
  /** Opening an entry. Given, every row becomes a real button. */
  onSelect?: (item: ActivityFeedItem) => void;
  /** The history has not arrived. Cold cache only — a warm re-fetch keeps the rows. */
  loading?: boolean;
  /** How many placeholder rows to draw while `loading`. */
  loadingRows?: number;
  /** The request failed. Beats `empty`: a failed request has not come back. */
  error?: boolean;
  /** Replace the busy register. */
  loadingState?: React.ReactNode;
  /** Replace the empty register. */
  emptyState?: React.ReactNode;
  /** Replace the error register. */
  errorState?: React.ReactNode;
  /** Wording for the three registers, and for the wait a screen reader hears. */
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
  /** Accessible name for the feed as a whole. */
  label?: string;
}

/** One entry. Local: a feed's parts are never addressable from outside. */
function FeedRow({
  item,
  density,
  onSelect,
}: {
  item: ActivityFeedItem;
  density: ActivityFeedProps["density"];
  onSelect?: (item: ActivityFeedItem) => void;
}) {
  const interactive = Boolean(onSelect) && !item.disabled;

  const inner = (
    <>
      {/* Column 1 — who. 24, `flex: none`, initials or a photograph. */}
      <Avatar
        size="sm"
        shape={item.shape ?? "pill"}
        variant={item.variant ?? "default"}
        className="mt-px"
      >
        {item.avatarSrc ? <AvatarImage src={item.avatarSrc} alt={item.actor ?? ""} /> : null}
        <AvatarFallback aria-label={item.actor}>{item.initials}</AvatarFallback>
      </Avatar>

      {/* Column 2 — what. Wraps; a history line is prose, not a row cell. */}
      <span data-slot="activity-feed-body" className="flex min-w-0 flex-col gap-1">
        <span className="text-caption leading-[var(--leading-normal)]">{item.description}</span>
        {item.meta === undefined || item.meta === null ? null : (
          <span className="text-xs text-ink-tertiary">{item.meta}</span>
        )}
      </span>

      {/* Column 3 — when. Tabular, tertiary, and a real `time` element so the
          instant is machine-readable where the caller knows it. Trailing per
          ruling R2; `flex-none` so a long sentence never squeezes it, and
          `mt-px` to sit on the first line of the prose rather than its box. */}
      <time
        data-slot="activity-feed-time"
        dateTime={item.dateTime}
        className="mt-px flex-none text-xs tabular-nums text-ink-tertiary"
      >
        {item.time}
      </time>
    </>
  );

  if (!interactive) {
    return (
      <div
        data-slot="activity-feed-item"
        data-disabled={item.disabled ? "" : undefined}
        className={cn(
          feedRowVariants({ density }),
          // A dead entry is a fill and an ink, never an opacity.
          /* GENUINELY DISABLED — do not re-flag. GAPS-CONTRAST §2 row 7 lists
             `ActivityFeed` among the disabled-tier misuses at 2.206:1 light /
             3.689:1 dark. It is not a misuse: this ink is gated on
             `item.disabled`, the caller's own declaration that the entry
             cannot be opened, and the demo's one such entry says so in its
             own words ("Draft entries cannot be opened"). Exactly one of the
             feed's rows measured in the exempt tier and it is that row. An
             entry with no `disabled` flag never reaches this branch. */
          item.disabled && "text-ink-disabled",
        )}
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-slot="activity-feed-item"
      onClick={() => onSelect?.(item)}
      className={cn(
        feedRowVariants({ density }),
        // The neutral row wash, and the kit's own row transition. Guarded with
        // `enabled:` so a dead row can never match it.
        "w-full cursor-pointer rounded-[var(--radius)] px-3 -mx-3",
        "transition-colors duration-[var(--duration-colour)] ease-kwapso",
        "enabled:hover:bg-accent",
      )}
    >
      {inner}
    </button>
  );
}

/**
 * A record's history.
 *
 * TEN STATES
 *  1. default        — a column of entries, each a time, a mark and a line,
 *                      hairline-separated, newest first.
 *  2. hover          — only with `onSelect`: `--accent`, the neutral row and
 *                      item wash. Never mango, never an opacity. A feed whose
 *                      entries do not open has no hover, deliberately — a
 *                      page of reacting rows that lead nowhere is noise.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. An interactive row is a
 *                      real `button`, so it is reachable and ringed without
 *                      this file writing anything.
 *  4. active/pressed — does not apply. The kit draws no pressed feed row, and
 *                      a row that nudged would fight the page scroll under a
 *                      thumb. Logged as GAPS-COL1 AF-3.
 *  5. disabled       — per entry (`item.disabled`): `--ink-disabled` and no
 *                      button at all, so it is neither hoverable nor
 *                      focusable. A fill is not used because the row has none
 *                      to begin with; the ink alone is the whole treatment.
 *  6. loading        — `loading`: `Skeleton variant="list"`, which is that
 *                      primitive's whole job. Cold cache only — the kit's
 *                      third loading tier says a warm re-fetch keeps the
 *                      stale rows and marks them busy rather than blanking
 *                      the panel.
 *  7. empty          — no entries: the quiet register. NOT `null`, because a
 *                      record with no history is a real answer and an
 *                      unexplained hole is not. Where a composition wants the
 *                      whole block to vanish it does not mount the feed —
 *                      kwapso-ui.css warns about exactly that beside
 *                      `.kw-empty`.
 *  8. error          — `error`: the register with a poppy dot and its own
 *                      wording, which is chapter 21's "say what happened,
 *                      then the one next step". Beats `empty` in precedence:
 *                      a request that failed has not come back empty, it has
 *                      not come back.
 *  9. selected       — the kit draws no selected feed entry. Not invented;
 *                      logged as GAPS-COL1 AF-2. A composition that needs one
 *                      marks it with its own `className` on the item until
 *                      there is a ruling.
 * 10. read-only      — always. A history is a record of what happened; there
 *                      is nothing here to write to.
 *
 * THREE BREAKPOINTS — one geometry, at every width
 *  Ruling R2 simplified this. While the time led, the column had to be `auto`
 *  at 320 (a fixed 74 left 200 for the line) and step to the drawn 74 from
 *  `sm:` so the times aligned — two states, and a deliberate raggedness at the
 *  small one. Trailing, the time takes what its string needs and no more at
 *  every width, so mobile, tablet and desktop draw the SAME three columns:
 *  `24px 1fr auto`. Nothing steps and nothing is ragged, because there is no
 *  longer a column edge for the times to fail to meet.
 *
 *  The sentence gets the full remaining measure at 320, which is what a
 *  history line needed all along.
 *
 * RTL — safe, and unused: the system is LTR only. Every inset is logical, the
 * grid columns follow the writing direction on their own, and `text-start`
 * rather than `text-left` keeps the button's label where the reader expects.
 */
const ActivityFeed = React.forwardRef<HTMLDivElement, ActivityFeedProps>(
  (
    {
      className,
      density = "default",
      items,
      reverse = false,
      onSelect,
      loading = false,
      loadingRows = 4,
      error = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading history…",
      emptyLabel = "No history yet",
      emptyBody = "Nothing has happened here so far.",
      errorLabel = "History unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label,
      ...props
    },
    ref,
  ) => {
    const list = items ?? [];
    const ordered = reverse ? [...list].reverse() : list;

    /* Exclusive states resolved in JS, not stacked as classes (PATTERN §4).
       Loading beats error beats empty. */
    const state = loading ? "loading" : error ? "error" : ordered.length === 0 ? "empty" : "default";

    return (
      <div
        ref={ref}
        data-slot="activity-feed"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("flex min-w-0 flex-col", className)}
        {...props}
      >
        {state === "loading"
          ? (loadingState ?? (
              <Skeleton variant="list" lines={loadingRows} label={loadingLabel} />
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

        {state === "default"
          ? ordered.map((item) => (
              <FeedRow key={item.id} item={item} density={density} onSelect={onSelect} />
            ))
          : null}
      </div>
    );
  },
);

ActivityFeed.displayName = "ActivityFeed";

export { ActivityFeed, feedRowVariants as activityFeedRowVariants };
