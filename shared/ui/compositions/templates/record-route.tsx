"use client";

/* ============================================================================
   RecordRoute — `/t/[...path]` in the system app: the one dynamic record
   route, and the screen that proves the record chrome.

   THE SHAPES
   `ScreenShell` (the rail and the page frame, header slot left empty — see
   override 73 below) wrapping `RecordChrome` (shape 1) with `StepperHero`
   (shape 4) in its hero slot. `door="system"`, so the measure is
   `comfortable` and the progression is the seven-stage vocabulary (ruling 04).

   WHY THIS ROUTE MATTERS MORE THAN THE OTHER TEN
   The record chrome applies to fourteen screens across the two doors. Every
   one of them is this file with a different `kind`, a different tab set and
   different facts — a ticket, a story, a sprint, a task, a process, a
   purpose, a meeting, a time entry, and their portal twins. If the four
   regions are right here they are right in all fourteen; if they are wrong
   here they are wrong fourteen times.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.8 (record detail), 27.13 (tabs) and
   chapter 23 (the record hero with the stages in it).

     ch27.8, the region order, verbatim:
       "Breadcrumb, then the identity row — record number in the charcoal
        pill, status, relation, since — then the title on its own line, then
        tags beneath it. Keys sit above because they tell you which record
        this is before you read what it's called; tags sit below because they
        describe it afterwards. Facts strip, the record's own text,
        attachments, then the ink footer. That order never changes."

     REVERSED BY OVERRIDE 73 (2026-08-26) — SEE `record-chrome.tsx`'S HEADER
     FOR THE CLIENT'S VERBATIM RULING. There is no breadcrumb on this route
     any more, and the identity row moves BELOW the title instead of above
     it. That override is what moved this route OFF `DetailScreen` and back
     onto `ScreenShell` + `RecordChrome` directly, which is the second, load-
     bearing change in this file: `DetailScreen` draws its own breadcrumb,
     eyebrow and title in `ScreenShell`'s header band — a region entirely
     apart from `RecordChrome`'s identity row in the body pane below — and
     that split is what produced the exact bug the client's screenshot
     showed: a breadcrumb-plus-eyebrow bar, a gap, then the ID chip and Edit
     on their own row far below. `RecordChrome` now carries `title` itself
     (see override 73's own comment for why that also puts Edit "aligned
     with the title" for free), so this route no longer needs a separate
     header band at all — `ScreenShell`'s `header` slot is left empty and
     everything the record needs to say lives in `RecordChrome`'s body pane.
     `segments`, `breadcrumb` and `breadcrumbLabel` are removed from this
     route's own props with the same reasoning override 73 used for
     `RecordChrome`'s API: nothing renders a breadcrumb on a record screen
     any more, and the one caller of this route in the demo
     (`demo/routes/system-s-t.tsx`) never passed them.

     ch27.8 on what the ink footer holds, verbatim: "Latest activity on the
       left — a short reverse-chronological feed with an add-a-note field —
       and Record on the right, two to four key/value rows."

   THE FOOTER'S FEED IS NOT THE ACTIVITY TAB. Both are this record's history
   and they are two props on purpose: `activity` is the TAB and holds all of
   it, `latest` is the footer's left column and holds the newest few, which is
   the chapter's own word — "a SHORT reverse-chronological feed". One prop
   feeding both would put the whole history in a summary card or two lines in
   a tab, and neither is what 27.8 draws.

   THE NOTE FIELD IS THE SYSTEM DOOR'S, AND IT IS THE APPLICATION'S TO WIRE.
   ch27.8 draws it on a record like this one, so the route offers it — but it
   appears only when a handler arrives, because a field that accepts a note
   nothing stores is worse than no field. No handler is defaulted here: where
   a note goes is the application's fact, not a screen's. The portal door
   never gets one at all, and `RecordChrome` warns if it is handed one.

     ch27.8 on what the page is FOR, verbatim: "The detail screen is for
       reading … Everything that changes the record happens in the slide-in
       from 27.3, so this page never contains a form."

     ch27.13, verbatim: "A record's sections — Overview, Activity, Files — use
       the underline strip with a quiet count, never the folder shape. Folder
       tabs belong to collections and main screens only; inside a record they
       would claim the page is a different collection."

     ch23 on the one mango, verbatim: "The current stage carries the only
       mango in the hero, so Edit drops to the paper secondary when a stage is
       highlighted. Two mangos in one header is the most common way this
       composition goes wrong."

   THE LAW THIS FILE OBEYS
   · THE PROGRESSION IS DRAWN ONCE. `RecordChrome` has a `stages` slot of its
     own AND a `hero` slot. Passing both would draw two steppers on one
     screen, so this route passes the stages to `StepperHero` and leaves
     `RecordChrome`'s own slot empty. One progression, one hero.
   · EDIT IS THE PAPER SECONDARY (ch23). Whenever the hero is drawn with a
     current stage — which is every ready render of this route — the mango
     belongs to that stage and the header's Edit steps down. It is computed,
     not remembered: `stagesShown` decides it.
   · NO FORM ON THIS PAGE (ch27.8). There is no field, no save and no dirty
     state in this file. Edit is a handler the route hands upward.
   · THE TAB SET IS THE UNDERLINE STRIP (ch27.13), and the counts are quiet.
   · A STATE SWAPS THE PANEL, NEVER THE FRAME (ch27 law 4). The identity row,
     the title, the hero and the strip stay drawn through loading, empty and
     error, because the route already knows them.
   · DESTRUCTIVE NEVER GETS A BUTTON (ch27.8). Archive and delete are the
     route's overflow, not a control drawn here.
   · EVERY USER-FACING STRING IS A PROP (PATTERN §7), including all seven
     stage labels — see the note on `SYSTEM_STAGES` below.
   · No fill, no radius, no ring and no type step is written in this file.

   RENDERING CONTEXT
   `"use client"`. The tab handler and the stage handler are built during this
   module's own render.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Text } from "../../components/typography/typography";
import type { StatusStage } from "../../components/status-stepper/status-stepper";
import {
  DescriptionList,
  type DescriptionListItem,
} from "../../components/description-list/description-list";
import type { ActivityFeedItem } from "../../components/activity-feed/activity-feed";
import { List, type ListRow } from "../../components/list/list";
import type {
  RecordDetailAuditEntry,
  RecordDetailTab,
} from "../../components/record-detail/record-detail";
import { Pencil } from "../../foundations/icons";
import { RecordChrome } from "./record-chrome";
import { ScreenShell } from "./screen-shell";
import { StepperHero } from "./stepper-hero";
import type { ShapeState, ShapeStateCopy } from "../states/states";

/**
 * THE SEVEN SYSTEM STAGES ARE THIS ROUTE'S OWN WORDS, NOT THE KIT'S.
 * `StepperHero`'s header states it plainly: the kit names five of the seven
 * in one render and none of them as a canonical list, so no shape ships a
 * vocabulary and labels are always the caller's. This route is a caller, so
 * it names seven — and says so out loud rather than letting them read as law.
 * Logged as SYS2-5 in GAPS-SYSTEM2.md. Every one is replaceable through the
 * `stages` prop, which is how a different record kind gets its own seven.
 */
export const SYSTEM_STAGES: readonly string[] = [
  "Intake",
  "Triage",
  "Shaped",
  "In build",
  "In review",
  "With client",
  "Done",
];

/** Every user-facing string on this route. */
export interface RecordLabels {
  edit: string;
  more: string;
  retry: string;
  stagesLabel: string;
  tabsLabel: string;
  tabOverview: string;
  tabActivity: string;
  tabFiles: string;
  factsLabel: string;
  activityLabel: string;
  filesLabel: string;
  filesEmptyTitle: string;
  filesEmptyDescription: string;
  activityEmptyTitle: string;
  activityEmptyDescription: string;
  /** The eyebrow over the ink footer's right column. */
  recordHeading: string;
  /** The eyebrow over its left column. */
  latestHeading: string;
  /** Accessible name for that feed. */
  latestLabel: string;
  /** ch27.8's add-a-note placeholder, which is also its accessible name. */
  noteLabel: string;
}

const DEFAULT_LABELS: RecordLabels = {
  edit: "Edit",
  more: "More",
  retry: "Retry",
  stagesLabel: "Stage progression",
  tabsLabel: "Record sections",
  tabOverview: "Overview",
  tabActivity: "Activity",
  tabFiles: "Files",
  factsLabel: "Facts",
  activityLabel: "Activity",
  filesLabel: "Files",
  filesEmptyTitle: "No files on this record",
  filesEmptyDescription: "A file arrives here when someone attaches one to a message.",
  activityEmptyTitle: "Nothing has happened yet",
  activityEmptyDescription: "Every change to this record is written here as it happens.",
  recordHeading: "Record",
  latestHeading: "Latest activity",
  latestLabel: "Latest activity",
  noteLabel: "Add a note",
};

const DEFAULT_COPY: Partial<ShapeStateCopy> = {
  emptyTitle: "This section has nothing in it yet",
  emptyDescription: "It fills as work happens on this record.",
  noResultsTitle: "Nothing matches here",
};

/* A ticket, because a ticket is the record fourteen screens are modelled on.
   Obviously fictional; no real client name appears anywhere in this repo. */
const DEFAULT_FACTS: DescriptionListItem[] = [
  { id: "account", label: "Account", value: "Nordlicht Sport" },
  { id: "raised", label: "Raised by", value: "Desk lead, from the portal" },
  { id: "owner", label: "Owner", value: "M. Renz" },
  { id: "sprint", label: "Sprint", value: "S-34 · 18 Aug – 29 Aug" },
  { id: "purpose", label: "Purpose", value: "Fewer phone calls at the desk" },
  { id: "logged", label: "Time logged", value: "5 h 05" },
];

const DEFAULT_BODY =
  "The confirmation mail is arriving in the spam folder for anyone on a Microsoft address. The desk is reading bookings back over the phone to confirm them, which is the exact call this work was supposed to remove. Reproduced on two accounts; the sending domain is unsigned.";

const DEFAULT_ACTIVITY: ListRow[] = [
  { id: "a-4", title: "Moved to In build", meta: "Today, 09:12", description: "M. Renz" },
  { id: "a-3", title: "Sprint set to S-34", meta: "Fri 22 Aug", description: "T. Brill" },
  { id: "a-2", title: "Shaped into ST-117", meta: "Thu 21 Aug", description: "M. Renz" },
  { id: "a-1", title: "Raised from the portal", meta: "Wed 20 Aug", description: "Desk lead" },
];

const DEFAULT_FILES: ListRow[] = [
  { id: "f-2", title: "spam-header-trace.txt", meta: "12 KB", description: "Added by M. Renz" },
  { id: "f-1", title: "confirmation-mail.png", meta: "240 KB", description: "Added by the desk lead" },
];

/* The ink footer's RIGHT column, as 27.8's key/value pairs. Three rows,
   inside its stated "two to four". */
const DEFAULT_AUDIT: RecordDetailAuditEntry[] = [
  { id: "created", label: "Raised", children: "20 Aug 2026" },
  { id: "changed", label: "Last changed", children: "Today, 09:12" },
  { id: "record", label: "Record", children: "3521" },
];

/* The ink footer's LEFT column — 27.8's "SHORT reverse-chronological feed".
   The newest two of the same history the Activity tab holds in full: the
   footer summarises, the tab is the history. Newest first, and nothing here
   sorts — `ActivityFeed` says why. */
const DEFAULT_LATEST: readonly ActivityFeedItem[] = [
  {
    id: "l-2",
    time: "Today",
    initials: "MR",
    actor: "M. Renz",
    description: "M. Renz moved the status to In build.",
  },
  {
    id: "l-1",
    time: "Fri",
    initials: "TB",
    actor: "T. Brill",
    description: "T. Brill set the sprint to S-34.",
  },
];

export interface RecordRouteProps {
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

  /** The number in the charcoal pill (ch27.8), always the identity row's FIRST chip. */
  recordNumber?: React.ReactNode;
  /**
   * The chip naming the record's collection or context — override 73's own
   * example, "add a chip for Padelbase". Sits right after `recordNumber`, in
   * the row directly under the title; there is no breadcrumb above it any
   * more (override 73, reversing ch27.8's "breadcrumb, then the identity row").
   */
  collectionLabel?: React.ReactNode;
  /** Status and relation — the rest of the identity row, after the collection chip. */
  chips?: React.ReactNode;
  /** The record's name, on its own line. Carries Edit in its own row (override 73). */
  title?: React.ReactNode;
  /** Tags, beneath the title. */
  tags?: readonly string[];
  /** "In build since 21 Mar · M. Renz owns it". */
  meta?: React.ReactNode;

  /** The seven, in workflow order. Replaceable per record kind. */
  stages?: readonly string[];
  /** Which one the record is at, zero-based. */
  currentStage?: number;
  /** The reader may see the progression. `false` renders NOTHING. */
  stagesVisible?: boolean;
  /** Press a stage to move the record to that stage's panel (ch23). */
  onStageSelect?: (index: number) => void;

  /**
   * The record's values. Rendered in the BODY, inside the reading tab —
   * never as a strip above the tabs (26.04, override 49). The prop name is
   * kept for the two applications that import it.
   */
  facts?: DescriptionListItem[];
  /** The record's own text. */
  body?: React.ReactNode;
  /** What has happened to it. */
  activity?: ListRow[];
  /**
   * The ink footer's left column — ch27.8's SHORT feed. Distinct from
   * `activity`, which is the Activity TAB's full history: the footer carries
   * the newest few and the tab carries all of them, which is the chapter's
   * own division and the reason the two props are not one.
   */
  latest?: readonly ActivityFeedItem[];
  /**
   * ch27.8's add-a-note field, under that feed. Omit the handler and no field
   * is drawn. This is the system door, so the field belongs here.
   */
  onAddNote?: (value: string) => void;
  /** What is attached to it. */
  files?: ListRow[];
  /** The ink footer — once per record, never per tab (ch27.8). */
  audit?: readonly RecordDetailAuditEntry[];
  /** The reader may see the footer. */
  auditVisible?: boolean;

  /** Which section is open. The tab belongs in the URL (ch27.13). */
  tab?: string;
  /** Tab changed. */
  onTabChange?: (value: string) => void;

  /** Open the edit slide-in (27.3). Never a form on this page. */
  onEdit?: () => void;
  /** The overflow beside it, holding archive, duplicate and delete. */
  moreActions?: React.ReactNode;
  /** The reader may act. `false` draws no actions at all (ch24.6). */
  actionsVisible?: boolean;

  /** Loading, empty or error. Swaps the PANEL; the frame stays (law 4). */
  state?: ShapeState;
  /** Per-locale words for the registers. */
  copy?: Partial<ShapeStateCopy>;
  /** Per-locale words for the screen. */
  labels?: Partial<RecordLabels>;
  /** Try the panel again. */
  onRetry?: () => void;
}

/**
 * A record, through the system door.
 *
 * TEN STATES — `RecordChrome`'s and `StepperHero`'s. The one this route
 * decides is which control holds the mango: never Edit while a stage is
 * highlighted (ch23), which on this screen means never at all in a ready
 * render. A reader with no rights is passed `actionsVisible={false}` and sees
 * nothing rather than something grey (ch24.6).
 *
 * THREE BREAKPOINTS — the shape's. ch27.8: "No side rail of metadata … the
 * reading column stays single", so there is nothing to restack; the tab strip
 * scrolls and the stepper folds its tail into "+n" over five (ch23).
 *
 * RTL — LTR only by client ruling.
 */
function RecordRoute({
  rail,
  railLabel,
  recordNumber = "KW-3521",
  collectionLabel = "Tickets",
  chips,
  title = "Booking confirmation lands in the spam folder",
  tags = ["Mail", "Deliverability"],
  meta = "In build since 21 Aug · M. Renz owns it",
  stages = SYSTEM_STAGES,
  currentStage = 3,
  stagesVisible = true,
  onStageSelect,
  facts = DEFAULT_FACTS,
  body = DEFAULT_BODY,
  activity = DEFAULT_ACTIVITY,
  latest = DEFAULT_LATEST,
  onAddNote,
  files = DEFAULT_FILES,
  audit = DEFAULT_AUDIT,
  auditVisible = true,
  tab,
  onTabChange,
  onEdit,
  moreActions,
  actionsVisible = true,
  state = "ready",
  copy,
  labels,
  onRetry,
}: RecordRouteProps) {
  const words: RecordLabels = { ...DEFAULT_LABELS, ...labels };

  /* ch23 — the hero carries the only mango whenever it is drawn with a
     current stage, so Edit drops to the paper secondary. Computed here so it
     can never be forgotten by a call site. */
  const stagesShown = stagesVisible && stages.length > 0;

  const stageObjects: readonly StatusStage[] = stages.map((label, index) => ({
    id: `stage-${index}`,
    label,
  }));

  const tabs: readonly RecordDetailTab[] = [
    {
      value: "overview",
      label: words.tabOverview,
      /* THE VALUES ARE IN THE BODY, AND THERE IS NO STRIP — 26.04 over 27.8,
         override 49 (2026-08-23). 26.04: "There is no facts strip — a
         record's values belong in its body, not stacked above the tabs."
         This tab's content IS the body, so the `DescriptionList` below is
         already where the ruling puts it and nothing moved; what changed is
         that it may never be lifted out of here into a region above the
         strip, which is what 27.8's "across the top" invites. The `facts`
         prop keeps its name — two applications import this route — and it is
         a body list, not a strip. No attachments here: they are the Files
         section (ch27.13). */
      content: (
        <div className="flex min-w-0 flex-col gap-6">
          <DescriptionList items={facts} aria-label={words.factsLabel} />
          {body === undefined ? null : (
            <Text as="p" measure>
              {body}
            </Text>
          )}
        </div>
      ),
    },
    {
      value: "activity",
      label: words.tabActivity,
      /* A quiet count, never the folder shape (ch27.13). */
      count: activity.length,
      content: (
        <List
          rows={activity}
          label={words.activityLabel}
          emptyTitle={words.activityEmptyTitle}
          emptyDescription={words.activityEmptyDescription}
          state={activity.length === 0 ? "empty" : "ready"}
        />
      ),
    },
    {
      value: "files",
      label: words.tabFiles,
      count: files.length,
      content: (
        <List
          rows={files}
          label={words.filesLabel}
          emptyTitle={words.filesEmptyTitle}
          emptyDescription={words.filesEmptyDescription}
          state={files.length === 0 ? "empty" : "ready"}
        />
      ),
    },
  ];

  /* THE TITLE'S OWN ROW. `SHELL.md`: a detail screen's one mango is `Edit`.
     Override 73 puts it on the title's row (via `RecordChrome`'s `actions`,
     which `RecordDetail` threads into the same `Title` row as `title`) —
     there is no separate header band any more for it to sit in. ch23's
     step-down survives unchanged: while the hero's progression is holding
     the screen's mango, Edit is the paper secondary instead, and the mango
     slot is left empty rather than filled twice. */
  const actions =
    onEdit === undefined ? moreActions : (
      <>
        {moreActions}
        <Button variant={stagesShown ? "secondary" : "default"} onClick={onEdit}>
          <Pencil aria-hidden="true" />
          {words.edit}
        </Button>
      </>
    );

  return (
    /* A DETAIL SCREEN — the client's own test: "a main screen is in the
       navbar; a detail screen has breadcrumbs" — but override 73 removes the
       breadcrumb itself (see this file's header). `ScreenShell` gives the
       page, the screen card and the rail; its `header` slot is left empty,
       because `RecordChrome` now carries `title` and draws the identity row
       directly under it, in the body pane, with no separate band above. This
       route composes `RecordChrome` directly rather than through
       `DetailScreen`, which independently draws a breadcrumb + eyebrow +
       title in `ScreenShell`'s header band — a region apart from
       `RecordChrome`'s own identity row that is exactly what produced the
       client's screenshot. See override 73 in `record-chrome.tsx` and in
       KWAPSO-SPEC.md's register. */
    <ScreenShell rail={rail} railLabel={railLabel}>
      <RecordChrome
        door="system"
        recordNumber={recordNumber}
        collectionLabel={collectionLabel}
        chips={chips ?? <Badge>{stages[currentStage] ?? stages[0]}</Badge>}
        title={title}
        tags={tags.map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
        meta={
          meta === undefined ? undefined : (
            <Text as="p" size="sm" tone="secondary">
              {meta}
            </Text>
          )
        }
        actions={actions}
        actionsVisible={actionsVisible}
        /* The progression is `StepperHero`, in the hero slot. `RecordChrome`'s
           own `stages` slot is deliberately left empty: passing both would
           draw two steppers on one screen. */
        hero={
          <StepperHero
            stages={stageObjects}
            current={currentStage}
            door="system"
            visible={stagesVisible}
            label={words.stagesLabel}
            onStageSelect={
              onStageSelect === undefined ? undefined : (index) => { onStageSelect(index); }
            }
            /* VERBATIM, NO TERNARY. This read
               `state === "loading" ? "loading" : "ready"`, so `empty` and
               `error` both drew a fully populated seven-stage hero — the same
               suppression time.tsx carried on its strip. T3B-6/8. */
            state={state}
          />
        }
        tabs={tabs}
        tab={tab}
        defaultTab="overview"
        onTabChange={onTabChange}
        tabsLabel={words.tabsLabel}
        /* ---- 27.8's ink footer, both columns ------------------------- */
        audit={audit}
        auditVisible={auditVisible}
        auditLabel={words.recordHeading}
        activity={latest}
        activityLabel={words.latestHeading}
        activityFeedLabel={words.latestLabel}
        /* The system door, so 27.8's add-a-note field is drawn. It appends to
           the log; it edits nothing, and this page still holds no form. */
        onAddNote={onAddNote}
        notePlaceholder={words.noteLabel}
        /* CONTROLS DROP NARROW, COUNTS DO NOT — 27.39's own narrow rule,
           carried over unchanged from `DetailScreen`'s default
           (`narrowFooter={false}`): the charcoal footer is a control-dense
           card, not a count, so it hides under `sm` and returns above it. */
        className="[&_[data-record-region=footer]]:hidden sm:[&_[data-record-region=footer]]:flex"
        state={state}
        copy={{ ...DEFAULT_COPY, ...copy }}
        errorAction={
          onRetry === undefined ? undefined : (
            <Button variant="secondary" onClick={onRetry}>
              {words.retry}
            </Button>
          )
        }
      />
    </ScreenShell>
  );
}

RecordRoute.displayName = "RecordRoute";

export { RecordRoute };
