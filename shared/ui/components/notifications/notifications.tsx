"use client";

/* ============================================================================
   Notifications — CH27.34, "Notifications · A collection of sentences,
   not a bell of badges".

   ┌── IT IS A CONTROL NOW, AND IT USED TO BE A 619-LINE SCREEN ──────────────
   │ The client, 2026-08-24: "notifications is also component". So it moved
   │ from compositions/screens/ to controls/, and the thing that moved is the
   │ PANEL — what the rail's count opens — because that is the part of it that
   │ is a control.
   │
   │ WHAT WAS REMOVED, EXACTLY. The file had two branches. `surface="page"`
   │ wrapped the rows in `MainScreen` with a `rail` and a `railLabel`: that is
   │ a screen, and it is gone, along with the `surface` prop, the `rail` and
   │ `railLabel` props, and the `ShapeStateBody` registers that only the page
   │ used. `surface="panel"` was already self-contained — its own measure, its
   │ own bare frame, its own "and ends with a link" tail — and it is what is
   │ left, unchanged line for line. Nothing was invented to make this happen;
   │ one of two existing branches was deleted and the other kept.
   │
   │ THE EXPORT IS `Notifications`, not `NotificationsScreen`. A control is
   │ not a screen and the name said otherwise.
   │
   │ TWO THINGS THE CLIENT SHOULD KNOW THEY ARE OVERRIDING
   │  1. THE FULL-PAGE INBOX IS GONE. This chapter's own strapline asks for
   │     the rows "in a panel from the rail AND as a full page — same rows in
   │     both, because a person should not have to learn two inboxes." The
   │     panel survives; the full page does not. An application that wants the
   │     page renders `<Notifications panelRows={items.length} />` inside its
   │     own `MainScreen`, which is three lines and is the same rows.
   │  2. THIS CONTROL IMPORTS TWO STRUCTURES — `CollectionFrame` and
   │     `ActivityFeed`. Every other control in this folder imports only
   │     controls, so the tier ordering runs backwards here. That is not
   │     fixable by filing: 27.34 requires the log's own row component ("a
   │     second row grammar for an inbox is the exact thing the chapter
   │     forbids"), so a notifications control that draws its own rows would
   │     break the chapter to satisfy the folder. Written down, not fixed.
   └──────────────────────────────────────────────────────────────────────────

   COMPOSED, NOT DRAWN
     · CollectionFrame — the panel, the heading, the count chip and the one
                         paper action. `tone="bare"`, because the popover the
                         rail opens is already the surface.
     · ToggleGroup     — the four facets. The kit's own copy for it is "two to
                         four options that change how the same data is drawn",
                         which is this row exactly. Pills, not tabs.
     · ActivityFeed    — the rows. It IS the log's row: a time, a mark, and a
                         sentence that wraps. 27.34 is the log filtered to you,
                         so it uses the log's component and not a second one.
     · Button          — "Mark all read", and the panel's "Open all".
   Not one fill, radius, type step or ring is written in this file.

   DESIGN SOURCE — KWAPSO-SPEC.md CH27, composition 27.34.

     The strapline, verbatim:
       "What the rail's count opens. It is the activity-log composition (27.9)
        filtered to things addressed to you, in a panel from the rail and as a
        full page — same rows in both, because a person should not have to
        learn two inboxes."

     "One inbox, two widths", verbatim:
       "The panel from the rail and the full page are the same rows with the
        same wording — the panel simply shows fewer and ends with a link.
        Nothing is written differently in the short version."

     "A row is a sentence, like the log", verbatim:
       "Actor, what they did, which record, and the words if it was a message.
        Notifications are the log filtered to you, so they read the same way —
        no 'new activity', no '1 update'."

     "Unread is the avatar and the ink", verbatim:
       "An unread row keeps the mango avatar and primary ink; a read one drops
        to secondary. No dots down the left, no bold-versus-regular trick, no
        blue — and the count in the rail is a mango pill on the item, not a
        floating badge."

     "Four facets, and Unread is first", verbatim:
       "Unread, Mentions, Assigned to me, All. They are pills, not tabs,
        because this is not a collection with subsets — and the count sits
        inside the Unread pill where it is being acted on."

     "Reading is not an action", verbatim:
       "Opening a row marks it read and takes you to the record. There is no
        per-row tick, no swipe-to-dismiss, and nothing is ever deleted — the
        log is the permanent copy, so an inbox needs no bin."

     "Never a toast", verbatim:
       "Notifications do not appear over the work. Nothing slides in from a
        corner, nothing steals focus; the rail count changes and that is the
        whole announcement."

     "Doors differ", verbatim:
       "The portal notifies on three things only: kwapso replied, a
        deliverable is ready to review, and we are waiting on you. No
        assignments, no mentions, no automations."

     Narrow, verbatim: "Narrow · the full page, same rows and same facets".

   THE LAW THIS FILE OBEYS
   · NEVER A TOAST. This file imports no toaster, mounts no `Sonner`, sets no
     timer and renders nothing positioned. There is no prop that could make it
     appear over the work. The rail's count is the announcement, and the rail
     belongs to the application shell, not to this composition.
   · NOTHING IS EVER DELETED. There is no remove handler, no per-row tick, no
     swipe and no bin on this screen or in this file's API. `onOpen` marks a
     row read and takes the reader to the record; that is the only per-row
     verb there is.
   · THE ROWS ARE THE LOG'S ROWS. `ActivityFeed` is the component 27.9 is
     built from. A second row grammar for an inbox is the exact thing the
     chapter forbids.
   · UNREAD IS THE MARK AND THE INK. Unread takes `variant="brand"` — the
     mango mark — and the sentence's default primary ink; read drops the mark
     to `quiet` and the sentence to `tone="secondary"`. No dot, no bold, no
     blue, and never an opacity.
   · FOUR FACETS, UNREAD FIRST, AND THE COUNT IS INSIDE IT. The order is fixed
     in `NOTIFICATION_FACETS` rather than passed, because the chapter states
     it as an order and not as a set.
   · ONE INBOX, ONE WORDING. The panel shows fewer of the SAME rows and ends
     with a link. There is no separate short copy: it is handed the same items
     and slices them, and `panelRows={items.length}` draws all of them.
   · NOTHING IS CENTRED. 27.37 is the only centred composition in the kit.
   · Every user-facing string is a prop. No px, no hex, no `border`.

   TWO THINGS THE ARTIFACT AND THE BUILD ONCE DISAGREED ON — BOTH NOW RULED.
   They were logged as NOT-1 and NOT-2 in GAPS-TRACK3C.md and this block
   recorded them as open. They are not open any more, and the record is
   corrected here rather than left to be "fixed" back:
     · NOT-1 · CLOSED BY OVERRIDE 17. The mango mark on every unread row was
       logged as sitting against ruling 30's "one mark per view may take
       mango". The override reads that sentence as being about *marks that
       identify a record*, which an unread flag is not, and counts ACTIONS
       rather than objects — so "27.34's unread rows each keep the mango
       mark" is now the ruled answer, not merely the newer chapter's.
     · NOT-2 · CLOSED BY OVERRIDE 18, AND THE BUILD MOVED. This block used to
       say `ActivityFeed` draws the time in the LEADING column on CH18's
       geometry. It does not: ruling R2 took CH18's `74px 24px 1fr` and built
       27.9's and 27.34's trailing time instead, `24px 1fr auto` —
       `activity-feed.tsx` draws `grid-cols-[var(--avatar-sm)_1fr_auto]`. The
       artifact and the build now AGREE, and the chapter that lost was CH18.

   NARROW (380px)
   Nothing is dropped, nothing collapses and no facet is hidden behind a
   control. `ToggleGroup` wraps rather than scrolls, so all four pills stay
   reachable with no horizontal scroll, and "Mark all read" moves under the
   heading because `CollectionFrame`'s heading row wraps. The 22.5rem measure
   — the chapter's 360 — is a MAX and not a width, so at 380 the panel simply
   fills what it is given.

   RENDERING CONTEXT
   `"use client"`. The facet handler and the per-row open handler are built
   during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../badge/badge";
import { Button } from "../button/button";
import { Text } from "../typography/typography";
import { ToggleGroup, ToggleGroupItem } from "../toggle-group/toggle-group";
import {
  ActivityFeed,
  type ActivityFeedItem,
} from "../activity-feed/activity-feed";
import { CollectionFrame } from "../collection-frame/collection-frame";
import { cn } from "../../lib/utils";

/** The four, in the chapter's own order. Unread is first, and that is a rule. */
export const NOTIFICATION_FACETS = ["unread", "mentions", "assigned", "all"] as const;
export type NotificationFacet = (typeof NOTIFICATION_FACETS)[number];

/** The rail panel's measure. CH27.34: "the same rows, 360px wide". */
export const NOTIFICATION_PANEL_MEASURE = "22.5rem";

/** How many rows the rail panel shows before its link. The chapter draws three. */
export const NOTIFICATION_PANEL_ROWS = 3;

/** One notification. A sentence, exactly as a log line is. */
export interface NotificationItem {
  /** Stable key. */
  id: string;
  /**
   * THE SENTENCE. Actor, what they did, which record, and the words if it was
   * a message: "Client name replied on 4182 — “no rush on the re-run”". One
   * node, because splitting it would invent a separator the log does not have.
   */
  sentence: React.ReactNode;
  /** When. Drawn tabular, in the feed's own time column. */
  time?: React.ReactNode;
  /** Machine-readable instant for that time. */
  dateTime?: string;
  /** Two initials for the mark. `Avatar` cuts to two on its own. */
  initials?: React.ReactNode;
  /** Who the mark belongs to, for the accessible name. */
  actor?: string;
  /**
   * A person is a pill, a thing is a square (ruling 30). An automation line —
   * the chapter's "k · The system moved 4171 to Blocked" — is a THING.
   */
  shape?: "pill" | "square";
  /** The quiet line under the sentence: "Client thread", "Assigned", "Blocked". */
  meta?: React.ReactNode;
  /** Not yet read. Keeps the mango mark and the primary ink. */
  unread?: boolean;
  /** Which day group it belongs to. */
  group?: string;
}

/** Every user-facing string this screen owns. */
export interface NotificationsLabels {
  heading: string;
  /** The one paper action. */
  markAllRead: string;
  /** The rail panel's closing link. */
  openAll: string;
  /** Accessible name for the facet row. */
  facetsLabel: string;
  facetUnread: string;
  facetMentions: string;
  facetAssigned: string;
  facetAll: string;
  /** Accessible name for the rows. */
  rowsLabel: string;
  /** Screen-reader wording for the unread count. */
  countLabel: string;
  emptyLabel: string;
  emptyBody: string;
  loadingLabel: string;
  errorLabel: string;
  errorBody: string;
}

const DEFAULT_LABELS: NotificationsLabels = {
  heading: "Notifications",
  markAllRead: "Mark all read",
  openAll: "Open all notifications",
  facetsLabel: "Filter notifications",
  facetUnread: "Unread",
  facetMentions: "Mentions",
  facetAssigned: "Assigned to me",
  facetAll: "All",
  rowsLabel: "Notifications",
  countLabel: "unread",
  emptyLabel: "Nothing addressed to you",
  emptyBody: "A line arrives here when someone writes to you, assigns you something or mentions you.",
  loadingLabel: "Loading…",
  errorLabel: "Unavailable",
  errorBody: "We can’t show this right now. Try again in a moment.",
};

/* The chapter's own rows, in its own words. Obviously fictional content: no
   real client name appears in this repo. */
const DEFAULT_ITEMS: readonly NotificationItem[] = [
  {
    id: "n-1",
    group: "Today",
    time: "10:09",
    initials: "GP",
    actor: "Client name",
    sentence: "Client name replied on 4182 — “no rush on the re-run”",
    meta: "Client thread",
    unread: true,
  },
  {
    id: "n-2",
    group: "Today",
    time: "09:40",
    initials: "MN",
    actor: "Member name",
    sentence: "Member name assigned 4176 to you",
    meta: "Assigned",
    unread: true,
  },
  {
    id: "n-3",
    group: "Today",
    time: "08:12",
    initials: "k",
    actor: "The system",
    /* An automation is a THING, so its mark is the square (ruling 30). */
    shape: "square",
    sentence: "The system moved 4171 to Blocked — waiting on the account",
    meta: "Blocked",
    unread: true,
  },
  {
    id: "n-4",
    group: "Yesterday",
    time: "17:20",
    initials: "AR",
    actor: "Member name",
    sentence: "Member name mentioned you in sprint W34",
    unread: true,
  },
  {
    id: "n-5",
    group: "Yesterday",
    time: "14:02",
    initials: "MN",
    actor: "Member name",
    sentence: "Member name closed 4160",
  },
];

export interface NotificationsProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onSelect"> {
  /** The rows. */
  items?: readonly NotificationItem[];
  /**
   * The unread total. Rides INSIDE the Unread pill, where it is being acted
   * on. Defaults to the number of unread rows in `items`.
   */
  unreadCount?: number;

  /** Controlled facet. */
  facet?: NotificationFacet;
  /** Uncontrolled first facet. Unread is first, and that is the chapter's rule. */
  defaultFacet?: NotificationFacet;
  /** The facet belongs in the URL. */
  onFacetChange?: (facet: NotificationFacet) => void;

  /**
   * Opening a row. It marks the row read and takes the reader to the record —
   * the chapter's whole per-row vocabulary. There is deliberately no remove,
   * no tick and no dismiss on this API.
   */
  onOpen?: (item: NotificationItem) => void;
  /** The one paper action. */
  onMarkAllRead?: () => void;
  /** The link at the foot, through to wherever the inbox is read in full. */
  onOpenAll?: () => void;

  /** How many rows the rail panel shows before its link. */
  panelRows?: number;

  /** Busy, failed, or nothing addressed to you. */
  state?: "ready" | "loading" | "empty" | "error";
  /** Merged over the defaults. */
  labels?: Partial<NotificationsLabels>;
}

/** Group the rows by day, keeping the order they arrived in. */
function byGroup(
  items: readonly NotificationItem[],
): Array<{ group: string | undefined; rows: NotificationItem[] }> {
  const out: Array<{ group: string | undefined; rows: NotificationItem[] }> = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last !== undefined && last.group === item.group) last.rows.push(item);
    else out.push({ group: item.group, rows: [item] });
  }
  return out;
}

/**
 * The inbox the rail's count opens. A panel of sentences, each naming a
 * person and a record.
 *
 * TEN STATES
 *  1. default        — the heading with the count, four facet pills, and the
 *                      rows grouped by day.
 *  2. hover          — the rows' (`ActivityFeed`'s `--accent` wash, and only
 *                      with `onOpen`), the pills' and the buttons'. Never
 *                      this file's, and never an opacity.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — the controls' own.
 *  5. disabled       — does not apply. A notification cannot be switched off.
 *                      A reader with no rights does not reach this screen.
 *  6. loading        — `state="loading"`: the busy register; the
 *                      heading, the count and the facets stay drawn.
 *  7. empty          — `state="empty"`, or no rows: the quiet register with a
 *                      sentence naming what arrives here. The facets stay, so
 *                      a reader can see the filter is what emptied it.
 *  8. error          — `state="error"`: ruling 06's block failure.
 *  9. selected       — the chosen facet pill, owned by `ToggleGroup`.
 * 10. read-only      — the inbox itself. Reading is not an action, and
 *                      nothing here is ever deleted.
 *
 * THREE BREAKPOINTS
 *  · 380 — the full page, same rows and same facets. The pills wrap and
 *    "Mark all read" wraps under the heading. Nothing is hidden and no row is
 *    shortened.
 *  · tablet / desktop — the heading row holds its action on one line.
 *
 *  THE FEED'S GEOMETRY DOES NOT CHANGE WITH WIDTH. This block used to say the
 *  time column "goes `auto`" at 380 and aligned "at the drawn 74" above it.
 *  Override 18 removed that two-state behaviour with the column it belonged
 *  to: the feed is `24px 1fr auto` at EVERY width, the time trailing, and
 *  "the two-state breakpoint CH18's fixed column needed is gone with it".
 *
 * RTL — LTR only by client ruling. Nothing here names a side.
 */
function Notifications({
  className,
  items = DEFAULT_ITEMS,
  unreadCount,
  facet,
  defaultFacet = "unread",
  onFacetChange,
  onOpen,
  onMarkAllRead,
  onOpenAll,
  panelRows = NOTIFICATION_PANEL_ROWS,
  state = "ready",
  labels,
  ...props
}: NotificationsProps) {
  const words: NotificationsLabels = { ...DEFAULT_LABELS, ...labels };
  const [ownFacet, setOwnFacet] = React.useState<NotificationFacet>(defaultFacet);
  const active = facet ?? ownFacet;

  const unread = unreadCount ?? items.filter((item) => item.unread === true).length;

  /* The panel shows FEWER OF THE SAME ROWS — never a second wording and never
     a second data set. `panelRows={items.length}` draws every one of them. */
  const shown = items.slice(0, panelRows);

  const rowsFor = (rows: readonly NotificationItem[]): ActivityFeedItem[] =>
    rows.map((item) => ({
      id: item.id,
      time: item.time,
      dateTime: item.dateTime,
      initials: item.initials,
      actor: item.actor,
      shape: item.shape ?? "pill",
      /* Unread is THE MARK: mango. Read drops to the quiet mark. Never a dot
         down the left, never a bold-versus-regular trick, never blue. */
      variant: item.unread === true ? "brand" : "quiet",
      /* Unread is THE INK: primary. Read drops to secondary. Composed here
         because the sentence is this screen's to tone, not the feed's. */
      description:
        item.unread === true ? (
          item.sentence
        ) : (
          <Text as="span" size="sm" tone="secondary">
            {item.sentence}
          </Text>
        ),
      meta: item.meta,
    }));

  const openHandler =
    onOpen === undefined
      ? undefined
      : (entry: ActivityFeedItem) => {
          const found = items.find((item) => item.id === entry.id);
          if (found !== undefined) onOpen(found);
        };

  const groups = byGroup(shown);
  const bodyEmpty = state === "empty" || (state === "ready" && shown.length === 0);

  /* Four facets, Unread first, and the count INSIDE the Unread pill. Pills,
     not tabs: this is not a collection with subsets. */
  const facets = (
    <ToggleGroup
      type="single"
      value={active}
      onValueChange={(value) => {
        if (value === "") return;
        const next = value as NotificationFacet;
        setOwnFacet(next);
        onFacetChange?.(next);
      }}
      aria-label={words.facetsLabel}
      className="flex-wrap"
    >
      <ToggleGroupItem value="unread">
        {words.facetUnread}
        {/* The count sits inside the pill where it is being acted on. */}
        <Badge count={unread} aria-label={`${String(unread)} ${words.countLabel}`} />
      </ToggleGroupItem>
      <ToggleGroupItem value="mentions">{words.facetMentions}</ToggleGroupItem>
      <ToggleGroupItem value="assigned">{words.facetAssigned}</ToggleGroupItem>
      <ToggleGroupItem value="all">{words.facetAll}</ToggleGroupItem>
    </ToggleGroup>
  );

  const body = (
    <div data-slot="notifications-body" className="flex min-w-0 flex-col gap-[var(--space-6)]">
      {groups.map((group, index) => (
        <div
          key={group.group ?? String(index)}
          data-slot="notifications-group"
          className="flex min-w-0 flex-col gap-2"
        >
          {/* SMALL-CAPPED. p38 heads the two day groups `TODAY` and
              `YESTERDAY` at the micro step in tertiary — the same eyebrow
              step every other divider in the kit takes. `Hint` is the caption
              step in sentence case, which read as a row rather than as a
              divider. The strings stay natural-case: the transform is the
              kit's, not the copy's. */}
          {group.group === undefined ? null : (
            <span className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
              {group.group}
            </span>
          )}
          <ActivityFeed
            items={rowsFor(group.rows)}
            label={`${words.rowsLabel} — ${group.group ?? ""}`.trim()}
            onSelect={openHandler}
          />
        </div>
      ))}
    </div>
  );

  /* THE ONE PAPER ACTION. Never mango: CH27.34 puts the mango on the RAIL's
     count pill and the rail belongs to the application shell, so this screen
     has no mango of its own at all — which is also `SHELL.md`'s sentence,
     "on Archive, Activity log and Link sent there is no mango at all", and
     `MainScreen` is given no `onCreate` so none can appear. */
  const markAllRead =
    onMarkAllRead === undefined ? undefined : (
      /* AN UNDERLINED WORD, NOT A PILL. p38's rail panel — the render this
         control IS, since the client made notifications a component — draws
         "Mark all read" as underlined quiet type at the heading's trailing
         end (12.5, fg2, underline offset 3). The paper pill with the ✓
         belongs to the FULL-PAGE header, which went with the deleted screen
         branch; the pill had survived the deletion when its render did not. */
      <Button variant="text" onClick={onMarkAllRead}>
        {words.markAllRead}
      </Button>
    );

  return (
    <div
      data-slot="notifications"
      className={cn("flex min-w-0 flex-col gap-4", className)}
      /* The rail panel's 360. A rem, never a px, and a measure rather than a
         width so the panel can be narrower where the rail is. */
      style={{ maxWidth: NOTIFICATION_PANEL_MEASURE }}
      {...props}
    >
      <CollectionFrame
        /* The popover is already the surface, so the frame adds no second
           fill. */
        tone="bare"
        density="compact"
        heading={words.heading}
        headingSize="h4"
        headingAs="h1"
        count={unread}
        countLabel={words.countLabel}
        rule={false}
        filters={facets}
        actions={markAllRead}
        loading={state === "loading"}
        error={state === "error"}
        empty={bodyEmpty}
        loadingLabel={words.loadingLabel}
        emptyLabel={words.emptyLabel}
        emptyBody={words.emptyBody}
        errorLabel={words.errorLabel}
        errorBody={words.errorBody}
      >
        {body}
      </CollectionFrame>

      {/* "The panel simply shows fewer and ends with a link." Outside the
          frame, so it is still there when the body is a register. */}
      {onOpenAll === undefined ? null : (
        <Button variant="text" className="self-start" onClick={onOpenAll}>
          {words.openAll}
        </Button>
      )}
    </div>
  );
}

Notifications.displayName = "Notifications";

export { Notifications, DEFAULT_ITEMS as NOTIFICATION_ITEMS };
