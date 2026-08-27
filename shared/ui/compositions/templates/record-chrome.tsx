"use client";

/* ============================================================================
   RecordChrome — the four regions every record screen is made of: a
   transparent header band, a sticky tab strip, one opaque panel, and the
   audit footer. Applies to 14 screens across the two apps.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.8 (record detail), 27.13 (tabs),
   chapter 23 (the record hero with the stages in it) and 24.6 (the band).

     ch27.8, the region order, verbatim:
       "Breadcrumb, then the identity row — record number in the charcoal
        pill, status, relation, since — then the title on its own line, then
        tags beneath it. Keys sit above because they tell you which record
        this is before you read what it's called; tags sit below because they
        describe it afterwards. Facts strip, the record's own text,
        attachments, then the ink footer. That order never changes."

     THE IDENTITY ROW MOVES BELOW THE TITLE, AND THE BREADCRUMB ABOVE A RECORD
     IS GONE — OVERRIDE 73 (2026-08-26), REVERSING THE QUOTE JUST ABOVE.
     The client, comparing the live "Tickets · Padelbase · 4182" record page
     against a reference mockup, verbatim: "notice how the chips are directly
     underneath the title. in the example that I put, there is no edit button
     like yours, but the edit button should be aligned with the title and the
     chips underneath it. also, detail pages do not need this bar that you
     have on top where we have Padelbase and the number. these are chips, so
     the black chip is always the ID. we always use black chips for IDs, and
     next to it, add a chip for Padelbase like in the example. of course,
     translate this to universal rules."
     This reverses the ch27.8 sentence quoted above on two points at once:
     (1) "Breadcrumb, then the identity row" — there is no breadcrumb on a
     record screen any more, in any spelling; (2) "the identity row … then
     the title … then tags beneath it" and its own stated reason, "Keys sit
     above because they tell you which record this is before you read what
     it's called" — the client's ruling puts the identity row BELOW the
     title instead, so this file no longer agrees with either the order or
     the reasoning. WHAT CHANGED, CONCRETELY: `breadcrumb`/`breadcrumbLabel`
     are removed from this component's API rather than kept unused — a grep
     of every real caller (`DetailScreen`, the sole production consumer of
     this shape) showed it never forwards a breadcrumb into `RecordChrome`
     at all, so the prop was already dead outside one demo catalogue
     specimen (`demo/shapes/screens-1-4.tsx`), which is not a caller this
     ruling needs to keep serving. The identity row — the black ID badge,
     ch27.8's own pill, now leading a NEW `collectionLabel` chip ("Padelbase
     like in the example") and then the pre-existing `chips` — moves from
     `eyebrow` (above the title) to the line directly under it. `actions`
     moves into the title's own row: `RecordDetail` already threads `title`
     and `actions` into the same `Title` row (baseline-aligned, actions
     pushed `ms-auto`), so handing this file's `title` and `actions` straight
     to it, with no `eyebrow` content above them any more, is what puts Edit
     "aligned with the title" with no extra markup here — this file still
     draws nothing of its own. `tags` is UNCHANGED and keeps its own line
     below the new chip row: the client ruled on the chip row and the
     breadcrumb, not on tags, and a tag ("Mail", "Retainer") is a topic label
     while a chip here is identity/status — different meanings, so they stay
     two rows rather than merging into one.
     A DEEPER FINDING THIS RULING SURFACED, NOT FIXED IN THIS FILE: the live
     Tickets/Padelbase page does not reach this component's identity row and
     title in the same place at all. It renders through `RecordRoute` →
     `DetailScreen` → `RecordChrome`, and `DetailScreen` draws its OWN
     breadcrumb + eyebrow + title in `ScreenShell`'s header band, entirely
     apart from this file's identity row in the body pane below — that split
     is what actually produced the client's screenshot, not this file's own
     internal ordering, which was already breadcrumb-then-identity-then-
     title-then-tags, adjacent, before this override. `RecordRoute` is fixed
     by composing `ScreenShell` and this shape directly instead of
     `DetailScreen`, so the live specimen now gets this ruling. `DetailScreen`
     itself — and its other callers, `mini-app/record.tsx`,
     `compositions/states/new-empty-record.tsx`,
     `compositions/screens/company-hub.tsx` and the `demo/shapes/
     templates-0.tsx` catalogue — still draw the pre-ruling split and are
     OUT OF SCOPE here: `detail-screen.tsx` was not one of the two files this
     pass owned, and one of its four callers was under concurrent edit.
     Logged in KWAPSO-SPEC.md's override register (row 73) rather than
     guessed at.

     THERE IS NO FACTS STRIP — 26.04 BEATS 27.8, OVERRIDE 49 (2026-08-23).
     26.04, verbatim: "There is no facts strip — a record's values belong in
     its body, not stacked above the tabs." 27.8 says the opposite twice: the
     order above names a strip as a region, and its own next paragraph says
     "No side rail of metadata. The facts strip does that job ACROSS THE TOP."
     26.04 wins because 26.04 IS THE DETAIL-PAGE TYPE — it is the entry that
     defines what this screen is, and the same sentence carries the papers law
     ("the page itself is off-beige and every panel on it is soft paper") that
     the K1 reversal already took as binding. A chapter cannot be the
     authority on the page's grounds and the stale side on the page's regions
     in the same breath.
     WHAT THAT MEANS FOR THIS FILE, AND IT IS A PROHIBITION, NOT A DELETION:
     there is no `facts` slot here and there must not be one. `hero` is the
     only node above the strip and it is chapter 23's stage progression; a
     route that puts a record's VALUES there is drawing the region 26.04
     forbids. Values go in `panel` — the body — where `system/t.tsx` and
     `screens/new-empty-record.tsx` already put them.
     Logged as an ARTIFACT CORRECTION OWED against 27.8.

     ch27.13, which tab shape a record takes, verbatim:
       "A record's sections — Overview, Activity, Files — use the underline
        strip with a quiet count, never the folder shape. Folder tabs belong
        to collections and main screens only; inside a record they would claim
        the page is a different collection."

     ch27.8 on what a record page is FOR, verbatim: "The detail screen is for
       reading … Everything that changes the record happens in the slide-in
       from 27.3, so this page never contains a form."

     ch27.8 on the last region, verbatim, and it is the whole of region 4:
       "Every detail page ends with the charcoal #1A1918 card from the kit's
        record pattern: Latest activity on the left — a short reverse-
        chronological feed with an add-a-note field — and Record on the right,
        two to four key/value rows."

     ch27.8 on what the PORTAL door does with that card, verbatim:
       "the portal never shows internal notes, only what was said to the
        client."

   THE LAW THIS FILE OBEYS
   · IT DRAWS NOTHING. `RecordDetail` already renders the four regions, the
     transparent band, the sticky strip, the opaque panel and the ink footer
     card. This file arranges product content into them and writes not one
     class that is not layout for its own two wrappers.
   · NO FORM ON THIS SCREEN. There is no field slot and no save state, by
     ch27.8. Editing is `FormScreen surface="panel"`, a layer over this one.
     The footer's add-a-note field is not an exception to that: it appends to
     a log and edits no value on the page, and ch27.8 draws it itself.
   · THE PORTAL SHOWS NO INTERNAL NOTE. `onAddNote` on `door="portal"` warns
     in development, beside the stage-count check and for the same reason —
     both are leaks of the operations side into a client's page.
   · THE TAB STRIP IS THE UNDERLINE STRIP, AND IT IS NOW STATED. Client ruling
     E, 2026-08-22, verbatim: "folder tabs are for main screens, line tabs for
     detail screens." A record is the detail screen, so `RecordDetail` passes
     `variant="line"` explicitly instead of leaning on a default — the default
     is no longer safe to lean on, because `CollectionFrame` now defaults to
     `folder` for main screens. The ruling agrees with ch27.13 and overrides
     ch24.3, which draws folder tabs on a record. SHP-3 in GAPS-SHAPES.md and
     REC-1 in GAPS-COL3.md are both settled by it; see GAPS-RULINGS.md.
   · THE PORTAL SHOWS THREE STAGES, NOT SEVEN (ruling 04). `door="portal"`
     says so in development rather than silently drawing seven to a client.
   · A REGION THE READER MAY NOT SEE RENDERS NOTHING. `actionsVisible`,
     `stagesVisible`, `panelVisible` and `auditVisible` are `RecordDetail`'s
     own props and they render `null`, not a lock and not a dimmed panel
     (ch24.6). This file does not reinvent them.
   · Focus is one global rule. No radius, no colour, no size decided here.

   RENDERING CONTEXT
   `"use client"`. This module builds the identity-row node during its own
   render and forwards a tab-change handler into Radix Tabs.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../components/badge/badge";
import type { StatusStage } from "../../components/status-stepper/status-stepper";
import type { ActivityFeedItem } from "../../components/activity-feed/activity-feed";
import {
  RecordDetail,
  type RecordDetailAuditEntry,
  type RecordDetailTab,
} from "../../components/record-detail/record-detail";
import { cn } from "../../lib/utils";
import {
  SHAPE_HEADING_SIZE,
  SHAPE_SHELL,
  shapeCopy,
  type ScreenDensity,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/** Which of the two doors this record is being read through. */
export type RecordDoor = "system" | "portal";

/** Ruling 04 — seven stages in the system app, three in the client portal. */
const STAGE_COUNT: Record<RecordDoor, number> = { system: 7, portal: 3 };

export interface RecordChromeProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "children"> {
  /** Which door. Sets the measure, the heading step and the stage-count check. */
  door?: RecordDoor;
  /**
   * The two-door measure. Defaults from `door`: the system app is the wide
   * one, the portal the narrow calm one (commission §9).
   */
  density?: ScreenDensity;

  /**
   * ONE NODE ABOVE EVERYTHING, INSIDE THE BODY PANE — 27.43's header image
   * and nothing else so far. It is a sibling above `RecordDetail` rather than
   * a slot inside it, because ruling 35 requires the picture to be above
   * every word on the page ("Every word — logo, name, figures — sits on the
   * paper underneath") and `hero` sits UNDER the identity row and the meta
   * line, which is one region too low.
   *
   * It is not a fourth difference between the two screens: a main screen has
   * no record to put a picture over, so there is nothing for `SHELL.md`'s
   * table to compare.
   */
  banner?: React.ReactNode;

  /**
   * The record number. Drawn as the charcoal pill ch27.8 names — always
   * `Badge variant="inverse"`, always the FIRST chip. Override 73: this and
   * everything below it now sit directly UNDER `title`, never above it, and
   * there is no breadcrumb above them any more (see the header comment).
   */
  recordNumber?: React.ReactNode;
  /**
   * The chip naming the record's collection or context — the kit's own
   * example is "Padelbase" beside a ticket's number. Override 73: it sits
   * immediately after `recordNumber`, before `chips`, in the row directly
   * under the title. Matches this file's naming for a single labelled node
   * (`auditLabel`, `activityLabel`) rather than inventing a new shape.
   */
  collectionLabel?: React.ReactNode;
  /** Status, relation, since — the rest of the identity row, after the collection chip. */
  chips?: React.ReactNode;
  /** The record's name, on its own line. Carries `actions` in its own row (override 73). */
  title?: React.ReactNode;
  /**
   * The identity mark before the title — `RecordDetail`'s own slot, forwarded.
   * 27.15 is why it exists at this level: a member profile is "the 27.8
   * detail composition with a person in it", and its avatar sits before the
   * name so "the identity block reads as one object" — sized to the name
   * plus its chips (76 desktop / 64 narrow, the kit's ONE avatar-size
   * exception), which is the caller's `Avatar` to size.
   */
  mark?: React.ReactNode;
  /**
   * Tags. Still ch27.8's own line beneath the title — override 73 does not
   * touch this row, only the identity row above it in this file's own order.
   * A tag is a topic label ("Mail", "Retainer"); a chip is identity/status —
   * different meanings, so they stay two rows.
   */
  tags?: React.ReactNode;
  /** "In build since 21 Mar · Aurora owns it" — the line under the title. */
  meta?: React.ReactNode;
  /**
   * Page actions. ch27.8: mango Edit furthest right, an overflow beside it
   * holding archive, duplicate and delete. Destructive never gets a button.
   */
  actions?: React.ReactNode;
  /** The reader may act. `false` renders no actions at all, never a disabled one. */
  actionsVisible?: boolean;

  /** The stage progression, above the tab strip (chapter 23). */
  stages?: readonly StatusStage[];
  /** Which stage the record is at. */
  currentStage?: number;
  /** A stage is pressable and moves the record to that stage's panel. */
  onStageSelect?: (index: number, stage: StatusStage) => void;
  /** The reader may see the progression. */
  stagesVisible?: boolean;
  /** Accessible name for the progression. */
  stagesLabel?: string;
  /** Anything else in the hero, under the stages. */
  hero?: React.ReactNode;

  /** The record's sections. Underline strip, quiet counts (ch27.13). */
  tabs?: readonly RecordDetailTab[];
  /** Controlled tab. */
  tab?: string;
  /** Uncontrolled first tab. ch27.13: "the first tab is always the reading view". */
  defaultTab?: string;
  /** The tab belongs in the URL (ch27.13) — this is where a route writes it. */
  onTabChange?: (value: string) => void;
  /** The strip pins under the band while the panel scrolls. */
  sticky?: boolean;
  /** Accessible name for the strip. */
  tabsLabel?: string;

  /** The one opaque panel, when the record has no tabs or every tab shares it. */
  panel?: React.ReactNode;
  /** The reader may see the panel body. */
  panelVisible?: boolean;

  /* ---- The ink footer, ch27.8 — once per record, never per tab ----------
     "Latest activity on the left … and Record on the right." Both columns are
     `RecordDetail`'s and neither is drawn here: this file only names them, so
     a route knows the two halves exist without reading the component. ---- */

  /** The Record column — two to four key/value rows. */
  audit?: readonly RecordDetailAuditEntry[];
  /** The reader may see the Record column. Not a greyed one — it is absent. */
  auditVisible?: boolean;
  /** The eyebrow over it. */
  auditLabel?: React.ReactNode;

  /**
   * The Latest activity column — a SHORT reverse-chronological feed. Not the
   * Activity tab: the footer summarises, the tab holds the history.
   */
  activity?: readonly ActivityFeedItem[];
  /**
   * The reader may see the internal log. The portal's is a narrower set, not
   * a greyed one.
   */
  activityVisible?: boolean;
  /** The eyebrow over it. */
  activityLabel?: React.ReactNode;
  /** Accessible name for the feed. */
  activityFeedLabel?: string;

  /**
   * ch27.8's add-a-note field. Omit the handler and no field is drawn, which
   * is how `door="portal"` obeys the chapter's "the portal never shows
   * internal notes, only what was said to the client" — a portal route passes
   * no handler, and one that does is warned in development.
   */
  onAddNote?: (value: string) => void;
  /** The field's placeholder, and its accessible name. */
  notePlaceholder?: string;

  /** The reader may see the footer at all. */
  footerVisible?: boolean;

  /** Loading, empty or error. A state swaps the PANEL; the band, hero and strip stay. */
  state?: ShapeState;
  /** Per-locale words for the three states. */
  copy?: Partial<ShapeStateCopy>;
  /** The one next step offered by the empty panel. */
  emptyAction?: React.ReactNode;
  /** The retry offered by the error panel. */
  errorAction?: React.ReactNode;
}

/**
 * The four regions of a record screen, arranged.
 *
 * TEN STATES
 *  1. default        — band, hero, strip, panel, footer.
 *  2. hover          — not this component's. Rows, tabs and buttons own theirs.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — not this component's; a stage and a tab own theirs.
 *  5. disabled       — does not apply. A screen is not a control. A reader who
 *                      may not act sees no action (`actionsVisible={false}`),
 *                      which is ch24.6's rule and not a disabled skin.
 *  6. loading        — `state="loading"`: the panel is unfilled and everything
 *                      the route already knows stays drawn (ch27.6).
 *  7. empty          — `state="empty"`: the panel carries the register.
 *  8. error          — `state="error"`: ruling 06's block failure in the panel.
 *                      A whole-page failure is a different screen (ch27.19).
 *  9. selected       — the active tab and the current stage; both owned below.
 * 10. read-only      — the normal case. ch27.8: every value here is text, not a
 *                      field, so there is no editable state to leave.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — the measure changes with `density` and nothing
 *  else. ch27.8: "No side rail of metadata … the reading column stays single",
 *  so there is nothing to restack. The strip scrolls rather than wraps, which
 *  is `Tabs`' own behaviour.
 *
 * RTL — LTR only by client ruling. Logical properties throughout.
 */
function RecordChrome({
  className,
  door = "system",
  density,
  banner,
  recordNumber,
  collectionLabel,
  chips,
  title,
  mark,
  tags,
  meta,
  actions,
  actionsVisible,
  stages,
  currentStage,
  onStageSelect,
  stagesVisible,
  stagesLabel,
  hero,
  tabs,
  tab,
  defaultTab,
  onTabChange,
  sticky = true,
  tabsLabel,
  panel,
  panelVisible,
  audit,
  auditVisible,
  auditLabel,
  activity,
  activityVisible,
  activityLabel,
  activityFeedLabel,
  onAddNote,
  notePlaceholder,
  footerVisible,
  state = "ready",
  copy,
  emptyAction,
  errorAction,
  ...props
}: RecordChromeProps) {
  const measure: ScreenDensity = density ?? (door === "portal" ? "calm" : "comfortable");
  const words = shapeCopy("recordChrome", copy);

  if (process.env.NODE_ENV !== "production" && stages && stages.length > 0) {
    const expected = STAGE_COUNT[door];
    if (stages.length !== expected) {
      // Ruling 04 — two vocabularies, one colour scale. A client never reads
      // operations language, so a portal record showing seven stages is a
      // leak, not a layout choice.
      console.warn(
        `RecordChrome: door="${door}" expects ${expected} stages, got ${stages.length}.`,
      );
    }
  }

  /* THE PORTAL DOOR NEVER OFFERS AN INTERNAL NOTE. ch27.8, verbatim: the
     portal "never shows internal notes, only what was said to the client."
     The field is opt-in, so a portal route gets no field by simply not
     passing a handler; a route that passes one is doing something the chapter
     forbids and is told so, the same way a seven-stage portal record is.
     Warned rather than dropped: swallowing the handler would leave a route
     believing it had a field. */
  if (process.env.NODE_ENV !== "production" && door === "portal" && onAddNote !== undefined) {
    console.warn(
      'RecordChrome: door="portal" draws no add-a-note field — ch27.8, the portal ' +
        "never shows internal notes, only what was said to the client.",
    );
  }

  /* OVERRIDE 73 (2026-08-26) — THE IDENTITY ROW IS NOW UNDER THE TITLE, NOT
     ABOVE IT, AND THERE IS NO BREADCRUMB. See the header comment for the
     client's verbatim ruling and exactly what it reverses in ch27.8.
     `RecordDetail`'s `eyebrow` slot — the one region above the title — is
     never fed by this file any more; nothing here draws above `title`. */
  const hasIdentity =
    recordNumber !== undefined || collectionLabel !== undefined || chips !== undefined;
  const identityRow = !hasIdentity
    ? undefined
    : (
        <span className="flex flex-wrap items-center gap-2">
          {recordNumber !== undefined ? (
            /* "the record number in the charcoal pill" — ch27.8, unchanged.
               `inverse` is Badge's own charcoal; no fill is written here.
               THE CLIENT'S OWN RULE: "the black chip is always the ID". */
            <Badge variant="inverse">{recordNumber}</Badge>
          ) : null}
          {collectionLabel !== undefined ? (
            /* "next to it, add a chip for Padelbase like in the example" —
               the client's own example, generalised to any collection. */
            <Badge>{collectionLabel}</Badge>
          ) : null}
          {chips}
        </span>
      );

  /* `RecordDetail`'s `meta` slot is the one region under the title, so the
     identity row, then tags, then the since-line all sit there in that
     order. Tags are UNCHANGED by override 73 — the client ruled on the chip
     row and the breadcrumb, not on tags, and a tag ("Mail", "Retainer") is a
     topic label while a chip here is identity/status, so the two stay
     separate rows rather than merging. SHP-4 in GAPS-SHAPES.md. */
  const metaLine =
    identityRow === undefined && tags === undefined && meta === undefined
      ? undefined
      : (
          <span className="flex min-w-0 flex-col gap-2">
            {identityRow}
            {tags !== undefined ? (
              <span className="flex flex-wrap items-center gap-2">{tags}</span>
            ) : null}
            {meta}
          </span>
        );

  return (
    <div
      data-slot="record-chrome"
      data-door={door}
      data-density={measure}
      className={cn("flex w-full min-w-0 flex-col", SHAPE_SHELL[measure], className)}
      {...props}
    >
      {banner}

      <RecordDetail
        /* No `eyebrow` — override 73 leaves nothing above the title. `title`
           and `actions` land in `Title`'s own row together, which is what
           puts Edit "aligned with the title" (the client's own words) with
           no extra markup written here. */
        title={title}
        mark={mark}
        titleSize={SHAPE_HEADING_SIZE[measure]}
        meta={metaLine}
        actions={actions}
        actionsVisible={actionsVisible}
        stages={stages}
        currentStage={currentStage}
        onStageSelect={onStageSelect}
        stagesVisible={stagesVisible}
        stagesLabel={stagesLabel}
        hero={hero}
        tabs={tabs}
        tab={tab}
        defaultTab={defaultTab}
        onTabChange={onTabChange}
        sticky={sticky}
        tabsLabel={tabsLabel}
        panel={panel}
        panelVisible={panelVisible}
        audit={audit}
        auditVisible={auditVisible}
        auditLabel={auditLabel}
        activity={activity}
        activityVisible={activityVisible}
        activityLabel={activityLabel}
        activityFeedLabel={activityFeedLabel}
        onAddNote={onAddNote}
        notePlaceholder={notePlaceholder}
        footerVisible={footerVisible}
        state={state}
        loadingLabel={words.loadingLabel}
        emptyTitle={words.emptyTitle}
        emptyDescription={words.emptyDescription}
        emptyAction={emptyAction}
        errorTitle={words.errorTitle}
        errorDescription={words.errorDescription}
        errorAction={errorAction}
      />
    </div>
  );
}

RecordChrome.displayName = "RecordChrome";

export { RecordChrome, STAGE_COUNT as RECORD_STAGE_COUNT };
