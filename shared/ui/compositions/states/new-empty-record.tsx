"use client";

/* ============================================================================
   NewEmptyRecordScreen — CH27.39, "A record with nothing in it yet · Just
   created — and every panel says what it is waiting for".

   COMPOSED, NOT DRAWN
     · DetailScreen     — shape 0b: `ScreenShell`'s four levels with the three
                          things a record puts in them, and `RecordChrome` —
                          which IS 27.8 — inside them. The band, the identity
                          row, the line tabs, the one opaque panel and the
                          footer are all its. 27.39's own last rule is "It is
                          27.8, not a special screen", so this file adds no
                          region — and the shell it now stands on is the one
                          BOTH screens share, not a region of this screen's.
     · DescriptionList  — the facts row. Unset facts are its `emptyValueLabel`.
     · CollectionFrame  — one per empty panel, `tone="bare"`, in its own
                          `empty` state, carrying that panel's own sentence
                          and that panel's own paper action.
     · the ink footer   — `RecordChrome`'s, which is `RecordDetail`'s. The log
                          and 27.8's add-a-note field are its LEFT column and
                          the key/value pairs its right; this file supplies the
                          content and composes no feed and no field of its own.
   Not one fill, radius, type step or ring is written in this file. The one
   exception is stated and justified below: `text-ink-disabled` on "Not set".

   DESIGN SOURCE — KWAPSO-SPEC.md CH27, composition 27.39.

     The strapline, verbatim:
       "The first minute of a record's life. It is 27.8 with empty panels, and
        each one names what will fill it and who fills it. This is the screen
        that decides whether a new record feels started or abandoned."

     "Empty panels stay, and explain themselves", verbatim:
       "Every panel a full record would have is drawn, each with one sentence
        naming what fills it and when. A record that hides its empty sections
        teaches nobody what happens next."

     "Unset facts read 'Not set' in disabled ink", verbatim:
       "Not blank, not a dash, not hidden. Disabled ink is exactly the right
        weight for a value that is legitimately absent, and it keeps the facts
        row the same shape as a filled record's."

     "One action per empty panel, in paper", verbatim:
       "Link a ticket, Write to the client. Each is the paper secondary — the
        page already has its mango on Edit, and an empty record should not
        shout three primaries at a reader."

     "The log is never empty", verbatim:
       "It always holds the creation line with the actor and the time, so the
        footer is a real panel from the first second. A record with an empty
        history looks broken and unowned."

     "It is 27.8, not a special screen", verbatim:
       "Same identity row, same facts row, same charcoal footer, same tabs.
        Nothing about being new changes the composition — only what the panels
        say."

     "Doors differ", verbatim:
       "A request raised in the portal lands here with the client's words
        already in 'What was asked' and Owner unset — which is why Owner is
        the first thing the system asks a member to fill."

     Narrow, verbatim: "Narrow · the same sentences, one panel per screen
       width".

   IT IS A DETAIL SCREEN, AND THE TEST IS THE CLIENT'S OWN
   `SHELL.md`: "a main screen is in the navbar; a detail screen has
   breadcrumbs." This screen has the trail and 27.39 draws the eyebrow
   spelling of it too. So it is `DetailScreen`, and the four levels arrive
   with the shape rather than being missing: off-beige page, soft-paper screen
   card, the rail and the header band lying on it, and THE OFF-BEIGE BODY PANE
   the panels stand on. The title moves up into the header band, which is the
   split 27.39 itself draws, and 27.39's "same identity row … same charcoal
   footer, same tabs" is untouched: every one of them is still drawn, in the
   same order, by the same `RecordChrome` one level down.

   THE LAW THIS FILE OBEYS
   · IT IS 27.8. `RecordChrome` is the whole composition. This file supplies
     facts, prose, empty panels and a log; it invents no region and moves
     none.
   · "NOT SET" IS DISABLED INK, AND IT IS A REAL VALUE. `DescriptionList`'s
     `emptyValueLabel` renders wherever a fact's value is `undefined`, so the
     facts row keeps a filled record's shape. `text-ink-disabled` is a TOKEN
     utility, not a literal, and the precedent is `empty-collection.tsx`,
     which draws its zeros the same way for the same reason.
   · EVERY EMPTY PANEL IS DRAWN AND EXPLAINS ITSELF, LEFT-ALIGNED. `body` is
     REQUIRED on an empty panel: a panel that cannot say what fills it is
     exactly the panel the chapter forbids, and in development an omission
     warns. The sentence is composed rather than routed through
     `CollectionFrame`'s empty register, because that register is CENTRED —
     the same reason `empty-collection.tsx` composes its own body for 27.21's
     "left-aligned like everything else".
   · ONE PAPER ACTION PER EMPTY PANEL. `action` renders `variant="secondary"`
     and nothing else — this file offers no way to make a panel action mango.
   · ONE MANGO, AND IT IS EDIT. There are no stages on a record this new, so
     chapter 23's "Edit drops to the paper secondary" does not fire here and
     Edit keeps the page's single mango.
   · THE LOG IS NEVER EMPTY. `log` defaults to the creation line and an empty
     array warns in development. There is no state of this screen in which
     the log renders a register.
   · NOTHING IS CENTRED. 27.37 is the only centred composition in the kit.
   · Every user-facing string is a prop. No px, no hex, no `border`, no
     gradient, no exclamation mark.

   THE DIVERGENCE THAT WAS LOGGED HERE IS CLOSED (DEF-1, 2026-08-23)
   This header used to record that `RecordDetail`'s region 4 drew a wrapping
   line of tertiary sentences instead of CH27.8's charcoal card, and that the
   log therefore rode in the panel as its last section. Region 4 IS the card
   now. The log and its note field moved out of the panel and into the
   footer's left column, the key/value pairs are the right column, and this
   screen draws what the chapter draws. NEW-1 closes with it.

   NARROW (380px)
   "The same sentences, one panel per screen width." The panel is already one
   column at every width — 27.8: "No side rail of metadata … the reading
   column stays single" — so nothing restacks and nothing is dropped. What
   changes at 380 is `DescriptionList`'s pair layout, which puts each label
   above its value below 48rem, and `ActivityFeed`'s time column, which drops
   to `auto` so a history line keeps its measure. Every empty panel, every
   sentence, every paper action and the whole log are drawn at 380: the
   chapter's rule is that they stay, so they stay.

   RENDERING CONTEXT
   `"use client"`. Tab, action and note handlers are built during this render.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../controls/badge/badge";
import { Button } from "../../controls/button/button";
import { Text } from "../../controls/typography/typography";
import type { BreadcrumbsItem } from "../../controls/breadcrumbs/breadcrumbs";
import type { ActivityFeedItem } from "../../structures/activity-feed/activity-feed";
import { CollectionFrame } from "../../structures/collection-frame/collection-frame";
import {
  DescriptionList,
  type DescriptionListItem,
} from "../../structures/description-list/description-list";
import type { RecordDetailAuditEntry } from "../../structures/record-detail/record-detail";
import { DetailScreen } from "../templates";
import { type ShapeState, type ShapeStateCopy } from ".";

/**
 * One panel a full record would have, drawn while it is still empty.
 *
 * CH27.39: "Every panel a full record would have is drawn, each with one
 * sentence naming what fills it and when."
 */
export interface EmptyRecordPanel {
  /** Stable key. */
  id: string;
  /** The panel's heading — "No tickets under it yet", "Nothing said yet". */
  heading: string;
  /**
   * THE SENTENCE. What fills this panel, and when or by whom. Required: a
   * panel that cannot answer that is the panel the chapter forbids.
   */
  body: string;
  /**
   * The panel's ONE action, in paper. "Link a ticket", "Write to the client".
   * Omit it for a panel with nothing to offer yet; there is no way to make it
   * mango, because the page's mango is Edit.
   */
  actionLabel?: string;
  /** Pressing that action. */
  onAction?: () => void;
}

/** Every user-facing string this screen owns that is not per-panel. */
export interface NewEmptyRecordLabels {
  breadcrumbLabel: string;
  tabsLabel: string;
  tabOverview: string;
  tabActivity: string;
  tabFiles: string;
  /** The one mango. */
  edit: string;
  /** The overflow beside it. Archive, duplicate, delete live inside it. */
  more: string;
  /** Accessible name for the facts row. */
  factsLabel: string;
  /** The value drawn wherever a fact is unset. Disabled ink, never a dash. */
  notSet: string;
  /** The heading over the record's own words. */
  askedHeading: string;
  /** The eyebrow over the log, in the ink footer's left column. */
  logHeading: string;
  /** Accessible name for the log. */
  logLabel: string;
  /** The add-a-note field's placeholder AND its accessible name — CH27.8. */
  noteLabel: string;
  /** The eyebrow over the ink footer's right column. */
  recordHeading: string;
  /**
   * RETAINED, NO LONGER DRAWN. It was the paper Add beside a two-row
   * `Textarea` while the note lived in the panel; 27.8's footer field is a
   * single pill line that commits on Enter and draws no button, so there is
   * nothing for this word to sit on. Kept because `NewEmptyRecordLabels` is
   * exported and a call site translating the screen is passing it today —
   * deleting the key would be a compile error in an application this folder
   * promises not to touch. Remove at the next intentional break.
   *
   * @deprecated The footer's note field commits on Enter and has no button.
   */
  noteSubmit: string;
}

const DEFAULT_LABELS: NewEmptyRecordLabels = {
  breadcrumbLabel: "Breadcrumb",
  tabsLabel: "Record sections",
  tabOverview: "Overview",
  tabActivity: "Activity",
  tabFiles: "Files",
  edit: "Edit",
  more: "More",
  factsLabel: "Facts",
  notSet: "Not set",
  askedHeading: "What was asked",
  logHeading: "Latest activity",
  logLabel: "Latest activity",
  /* 27.8's own placeholder, verbatim. It was "Add a note to the file" while
     the field was a labelled textarea in the panel; in the footer it is the
     chapter's own pill and the chapter's own two words. */
  noteLabel: "Add a note",
  recordHeading: "Record",
  noteSubmit: "Add",
};

const DEFAULT_COPY: Partial<ShapeStateCopy> = {
  emptyTitle: "This section has nothing in it yet",
  emptyDescription: "It fills as work happens on this record.",
};

/* CH27.39's own facts row. Owner and Opened are set the moment a record is
   created; Due and Sprint are not, and both render the disabled-ink value.
   Obviously fictional content — no real client name appears in this repo. */
const DEFAULT_FACTS: readonly DescriptionListItem[] = [
  { id: "owner", label: "Owner", value: "Member name" },
  { id: "opened", label: "Opened", value: "Today" },
  /* No `value` at all — that is what makes `emptyValueLabel` render. */
  { id: "due", label: "Due" },
  { id: "sprint", label: "Sprint", value: undefined },
];

/* The chapter's own words for a record raised from the portal. */
const DEFAULT_ASKED =
  "The court booking page drops the second attendee when two people join within a minute of each other. Reported by the club on Monday.";

/* The chapter's own two empty panels, in its own words. */
const DEFAULT_PANELS: readonly EmptyRecordPanel[] = [
  {
    id: "tickets",
    heading: "No tickets under it yet",
    body: "Tickets appear here when the work is broken down — usually at the next sprint planning.",
    actionLabel: "Link a ticket",
  },
  {
    id: "thread",
    heading: "Nothing said yet",
    body: "The client can read this thread. The first message is usually ours, confirming we have it.",
    actionLabel: "Write to the client",
  },
];

/**
 * THE LOG IS NEVER EMPTY. This is the creation line, and it is the default
 * rather than an example a call site may forget to pass.
 */
const DEFAULT_LOG: readonly ActivityFeedItem[] = [
  {
    id: "created",
    time: "Just now",
    initials: "MN",
    actor: "Member name",
    description: "Member name created 4183.",
  },
];

/* The ink footer's RIGHT column — 27.8's own three rows, now as the key/value
   pairs the chapter draws rather than three run-together sentences. Three is
   inside its stated "two to four". */
const DEFAULT_AUDIT: readonly RecordDetailAuditEntry[] = [
  { id: "created", label: "Created", children: "Today, 11:42" },
  { id: "latest", label: "Latest activity", children: "Today, 11:42" },
  { id: "record", label: "Record", children: "4183" },
];

export interface NewEmptyRecordScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** Which door. The portal lands here with the client's words already in place. */
  door?: "system" | "portal";

  /* ---- The shell's rail -------------------------------------------------
     The screen this route renders is one of the two the kit has, and both of
     them carry the same rail: `SHELL.md`, "the shell above is identical on
     both. The rail never changes between them." The rail's CONTENTS are the
     application's navigation, so they arrive as a node; its placement, its
     measure and the one law about it — dropped entirely below the narrow
     breakpoint, because the kit draws no hamburger anywhere — all belong to
     `ScreenShell` and are not this file's to decide. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;

  /** The trail above the identity row. */
  breadcrumb?: BreadcrumbsItem[];
  /** The record number, drawn in the charcoal pill by the shape. */
  recordNumber?: React.ReactNode;
  /** Status and "Created just now" — the rest of the identity row. */
  chips?: React.ReactNode;
  /** The record's name. */
  title?: React.ReactNode;

  /**
   * The facts row. A fact with NO `value` draws `labels.notSet` in disabled
   * ink; that is the chapter's rule, and it is why an unset fact must be
   * passed rather than left out of the array.
   */
  facts?: readonly DescriptionListItem[];
  /** The record's own words. Never truncated on this screen (CH27.8). */
  asked?: React.ReactNode;
  /** Every panel a full record would have, while it is still empty. */
  panels?: readonly EmptyRecordPanel[];

  /**
   * The log. Never empty: it always holds the creation line with the actor
   * and the time. An empty array warns in development.
   */
  log?: readonly ActivityFeedItem[];
  /** CH27.8's add-a-note field. Omit the handler to draw no field. */
  onAddNote?: (value: string) => void;
  /** The audit line. */
  audit?: readonly RecordDetailAuditEntry[];

  /** Controlled tab. */
  tab?: string;
  /** Uncontrolled first tab. The reading view is always first (CH27.13). */
  defaultTab?: string;
  /** The tab belongs in the URL. */
  onTabChange?: (value: string) => void;

  /** The one mango. Opens the 27.3 slide-in; this page never holds a form. */
  onEdit?: () => void;
  /** The overflow holding archive, duplicate and delete. */
  moreActions?: React.ReactNode;
  /** The reader may act. `false` draws no actions at all, never a disabled one. */
  actionsVisible?: boolean;

  /** Loading, empty or error — swaps the panel, keeps the band. */
  state?: ShapeState;
  /** Per-locale words for the states. */
  copy?: Partial<ShapeStateCopy>;
  /** Merged over the defaults. */
  labels?: Partial<NewEmptyRecordLabels>;
}

/**
 * The first minute of a record's life.
 *
 * TEN STATES
 *  1. default        — band, line tabs, one panel holding the facts row, the
 *                      record's words, every empty panel and the log.
 *  2. hover          — the buttons' and the tabs'. Never this file's.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — the controls' own.
 *  5. disabled       — does not apply as a control state. "Not set" is
 *                      DISABLED INK on a value that is legitimately absent,
 *                      which is a meaning and not a state; a reader who may
 *                      not act is passed `actionsVisible={false}` and sees no
 *                      action rather than a grey one (CH24.6).
 *  6. loading        — `state="loading"`: the panel unfills, the band stays.
 *  7. empty          — IS THE SCREEN. Every panel is drawn in its own empty
 *                      state with its own sentence; `state="empty"` on the
 *                      shape is a different thing (a record whose sections do
 *                      not exist) and is left available rather than used.
 *  8. error          — `state="error"`: ruling 06's block failure in the panel.
 *  9. selected       — the active tab, owned by the shape.
 * 10. read-only      — the normal case. Nothing here is a field except the
 *                      add-a-note composer, which CH27.8 puts in the log.
 *
 * THREE BREAKPOINTS
 *  · 380 — one panel per screen width, which is what the composition already
 *    is. The facts row puts each label above its value, the log's time column
 *    goes `auto`, and nothing is hidden: every empty panel keeps its sentence
 *    and its paper action.
 *  · tablet / desktop — the facts row pairs label and value on one line and
 *    the log's times align at the drawn 74.
 *
 * RTL — LTR only by client ruling. Nothing here names a side.
 */
function NewEmptyRecordScreen({
  className,
  door = "system",
  rail,
  railLabel,
  breadcrumb,
  recordNumber,
  chips,
  title,
  facts = DEFAULT_FACTS,
  asked = DEFAULT_ASKED,
  panels = DEFAULT_PANELS,
  log = DEFAULT_LOG,
  onAddNote,
  audit = DEFAULT_AUDIT,
  tab,
  defaultTab = "overview",
  onTabChange,
  onEdit,
  moreActions,
  actionsVisible = true,
  state = "ready",
  copy,
  labels,
  ...props
}: NewEmptyRecordScreenProps) {
  const words: NewEmptyRecordLabels = { ...DEFAULT_LABELS, ...labels };

  if (process.env.NODE_ENV !== "production") {
    /* "The log is never empty … A record with an empty history looks broken
       and unowned." A call site that empties it has broken the chapter, and
       an empty feed would silently render a register instead. */
    if (log.length === 0) {
      console.warn(
        "NewEmptyRecordScreen: CH27.39 — the log is never empty. It must hold the creation line with the actor and the time.",
      );
    }
    for (const panel of panels) {
      if (panel.body.trim() === "") {
        console.warn(
          `NewEmptyRecordScreen: CH27.39 — the empty panel "${panel.id}" must name what fills it and when.`,
        );
      }
    }
  }

  /* "Unset facts read 'Not set' in disabled ink." A token utility, not a
     literal; the same treatment `empty-collection.tsx` gives its zeros.

     CORRECTLY DIVERGENT — do not "fix" this to tertiary. GAPS-CONTRAST §2
     row 6 measures it at 2.433:1 light / 3.321:1 dark against a 4.5
     threshold, and it stays, because the ARTIFACT ASKS FOR THIS TIER BY
     NAME. CH27.39, verbatim: "Unset facts read 'Not set' in disabled ink …
     Disabled ink is exactly the right weight for a value that is
     legitimately absent, and it keeps the facts row the same shape as a
     filled record's." OVERRIDE 21 confirms the string and settles the
     27.39-draws-two contradiction without disturbing the ink.

     What the artifact chose, stated plainly so nobody has to rediscover it:
     an absence is not a disabled control, so painting it in the exempt tier
     buys the right weight at the price of a reader who cannot read it. The
     value here is one a reader is meant to read — "Due: Not set" is the
     sentence the screen exists to say. This is a KNOWN, RULED divergence
     from 1.4.3, recorded in GAPS-CONTRAST "Resolved", not a defect. It is
     the artifact's call to reverse, not the build's. */
  const notSet = (
    <span data-slot="fact-unset" className="text-ink-disabled">
      {words.notSet}
    </span>
  );

  const panel = (
    <div data-slot="new-record-body" className="flex min-w-0 flex-col gap-[var(--space-7)]">
      {/* CH27.8's order: facts strip, then the record's own text, then the
          panels, then the log. "That order never changes." */}
      <DescriptionList
        items={[...facts]}
        emptyValueLabel={notSet}
        aria-label={words.factsLabel}
      />

      {asked === undefined ? null : (
        <CollectionFrame
          tone="bare"
          density="compact"
          heading={words.askedHeading}
          headingSize="h4"
          headingAs="h2"
          rule={false}
        >
          {/* "Long text sets to 66 characters and keeps its paragraphs." */}
          <Text as="p" measure>
            {asked}
          </Text>
        </CollectionFrame>
      )}

      {/* Every panel a full record would have, drawn empty and explaining
          itself.

          NOT `CollectionFrame`'s `empty` register: that register is CENTRED
          and repeats the heading as its eyebrow. 27.21 rules on the same
          question in the same words — "left-aligned like everything else" —
          and `empty-collection.tsx` composes its body for exactly this
          reason. So the sentence is a `Text` and the action is a `Button`,
          both at the inline start, and nothing here is centred. */}
      {panels.map((item) => (
        <CollectionFrame
          key={item.id}
          tone="bare"
          density="compact"
          heading={item.heading}
          headingSize="h4"
          headingAs="h2"
          rule={false}
        >
          <Text as="p" size="sm" tone="secondary" measure>
            {item.body}
          </Text>
          {item.actionLabel === undefined ? null : (
            /* One action per empty panel, in paper. The page's mango is Edit. */
            <Button variant="secondary" className="self-start" onClick={item.onAction}>
              {item.actionLabel}
            </Button>
          )}
        </CollectionFrame>
      ))}

      {/* THE LOG IS NO LONGER A PANEL SECTION. DEF-1, 2026-08-23: the log and
          its note field are the ink footer's LEFT COLUMN, which is where
          27.8 draws them and where `RecordDetail` now renders them. They ride
          `activity` and `onAddNote` below. Nothing was lost in the move — the
          same `ActivityFeed`, the same never-empty guarantee, the same
          strings — and the panel stops carrying a section the chapter puts
          outside it. */}
    </div>
  );

  return (
    <DetailScreen
      data-slot="screen-new-empty-record"
      className={className}
      door={door}
      rail={rail}
      railLabel={railLabel}
      breadcrumb={breadcrumb}
      breadcrumbLabel={words.breadcrumbLabel}
      recordNumber={recordNumber}
      chips={chips}
      title={title}
      actionsVisible={actionsVisible}
      /* THE ONE MANGO ON THIS SCREEN, AND IT IS EDIT, IN THE IDENTITY ROW.
         `SHELL.md` puts a detail screen's mango there rather than in the
         header band, and 27.39 draws it in exactly that row; `DetailScreen`
         owns the pencil and the word (26.01's stated exception for a lone
         Edit). A record this new has no stage progression, so chapter 23's
         step-down does not fire and Edit keeps the mango. The overflow is the
         only other thing in the cluster, which is why it goes to
         `identityActions` and not to the band. */
      onEdit={onEdit}
      editLabel={words.edit}
      identityActions={moreActions}
      tabs={[
        { value: "overview", label: words.tabOverview },
        { value: "activity", label: words.tabActivity, count: log.length },
        { value: "files", label: words.tabFiles },
      ]}
      tab={tab}
      defaultTab={defaultTab}
      onTabChange={onTabChange}
      tabsLabel={words.tabsLabel}
      body={panel}
      /* ---- 27.8's ink footer, both columns ---------------------------- */
      activity={log}
      activityLabel={words.logHeading}
      activityFeedLabel={words.logLabel}
      /* "an add-a-note field". Only where the route hands over a handler; the
         system door does, the portal door must not (ch27.8). */
      onAddNote={door === "portal" ? undefined : onAddNote}
      notePlaceholder={words.noteLabel}
      audit={audit}
      auditLabel={words.recordHeading}
      state={state}
      copy={{ ...DEFAULT_COPY, ...copy }}
      {...props}
    />
  );
}

NewEmptyRecordScreen.displayName = "NewEmptyRecordScreen";

export {
  NewEmptyRecordScreen,
  DEFAULT_PANELS as NEW_RECORD_EMPTY_PANELS,
  DEFAULT_LOG as NEW_RECORD_CREATION_LOG,
};
