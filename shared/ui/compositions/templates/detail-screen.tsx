"use client";

/* ============================================================================
   DetailScreen — A DEPRECATED ADAPTER OVER `ScreenShell`. IT HOLDS NO DESIGN.

   ─────────────────────────────────────────────────────────────────────────
   COLLAPSED 2026-09-02, ON A CLIENT RULING. READ `screen-shell.tsx` INSTEAD.
   ─────────────────────────────────────────────────────────────────────────
   The client, verbatim: "Let's completely get rid of these three variations.
   Let's just do one shell, and then let's just explain that there are
   variations for the title if it's main screen with no parents or not. Also,
   just define which pages have a footer."

   THIS FILE'S OWN HEADER WAS THE EVIDENCE FOR IT, AND IT IS QUOTED HERE
   RATHER THAN PARAPHRASED BECAUSE IT IS WHAT SETTLED THE QUESTION:

       "`SHELL.md`'s table is exhaustive: a main screen and a detail screen
        differ in EXACTLY THREE PLACES … THE SHELL AND THE RAIL ARE IDENTICAL
        TO A MAIN SCREEN'S. Neither file draws either one: `ScreenShell` does,
        once, and both hand it the same rail."

   Three named differences on one shared shape is a shape with three slots,
   not two templates. There are four now — the fourth is the figure strip,
   which is a region a record does not have and which `SHELL.md`'s table
   therefore had no cell for.

   EVERY RULING THIS HEADER CARRIED HAS MOVED, NOT BEEN DELETED. Each one is
   in `screen-shell.tsx`, in the section named here, unabridged:

     · OVERRIDE 73 (2026-08-26) IN FULL — the client's verbatim ruling, what
       it removed from the API (`breadcrumb`, `breadcrumbLabel`, `trailing`,
       `eyebrow`), and the identity ORDER it fixed: the black ID chip first,
       then the collection chip, then the rest, on the line directly UNDER
       the title                                → THE FOUR SLOTS, slot 2, and
                                                   the `recordNumber` prop
     · the one mango is `Edit` and it rides the title's row
                                                → THE ONE MANGO
     · `Edit` is 26.01's one labelled exception, pencil AND word, and it is
       not an exception to the create rule      → THE ONE MANGO
     · a route that wants a second mango is drawing two, which ruling 26
       forbids, and no prop here allows it      → THE ONE MANGO
     · the footer: charcoal, two columns, in normal flow, once per record,
       unchanged per tab, no mango, zero main screens
                                                → the `footer` prop
     · "Header, body, and footer are hairline-separated inside one 24px shell
       — never three stacked cards"             → the `footer` prop
     · 27.39's narrow render: drop the controls and the footer, keep the
       chips and the counts                     → NARROW

   ONE OF THIS FILE'S CLAIMS IS NOW STALE AND IS CORRECTED RATHER THAN
   CARRIED. It said "the header band is left EMPTY" and that `RecordChrome`
   carries the title. That was override 73 read through the shell that existed
   in August, whose band sat under a breadcrumb-and-eyebrow bar — the bar the
   client told us to remove. There is no such bar now: the trail left the band
   entirely on 2026-09-02 and lives on the GROUND as a strip of folder tabs,
   so the band's first line is the title and nothing stands above it. The
   title and the identity chips are therefore in the BAND on a record, and
   override 73 is satisfied more literally than it was before — "the chips are
   directly underneath the title" and "the edit button should be aligned with
   the title", with no second bar anywhere on the screen.

   WHAT THAT MEANS FOR `RecordChrome`. It is no longer handed `title`,
   `recordNumber`, `collectionLabel`, `chips`, `tags`, `meta` or `actions`:
   the shell draws all seven. `RecordChrome` keeps what is genuinely the
   record's — the banner, the stage progression, the sub-view tabs, the panel
   and the charcoal audit footer — and `RecordDetail`'s own `Title` renders
   nothing, which is that component's documented empty state ("no children and
   no eyebrow renders `null`") rather than a hole this file punched.

   WHY THE FILE STILL EXISTS. It holds no design; it maps old prop names onto
   the shell's slots. Nineteen call sites in this repo import `MainScreen` or
   `DetailScreen`, and the kit is vendored into two applications this
   repository cannot see — the same argument `screen-shell.tsx` already makes
   for `Rail.collapsible`. Deleting the two exports is a one-line change to
   `index.ts` plus nineteen mechanical rewrites, and it is logged as owed.

   RENDERING CONTEXT
   `"use client"`. `RecordChrome`'s tabs are a client component and the edit
   handler is created at a call site.
   ========================================================================= */

import * as React from "react";

import type { ActivityFeedItem } from "../../components/activity-feed/activity-feed";
import type {
  RecordDetailAuditEntry,
  RecordDetailTab,
} from "../../components/record-detail/record-detail";
import type { StatusStage } from "../../components/status-stepper/status-stepper";
import { RecordChrome, type RecordChromeProps } from "./record-chrome";
import { ScreenShell, type ScreenSpine } from "./screen-shell";
import type { ScreenDensity, ShapeState, ShapeStateCopy } from "../states/states";

export interface DetailScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "children"> {
  /** Which door. Sets the measure and the heading step (commission §9). */
  door?: "system" | "portal";
  /** Override the door's measure. */
  density?: ScreenDensity;

  /* ---- The shell. Every one of these is threaded straight through. ------ */

  /** The navigation rail's contents. Placed by `ScreenShell`, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;
  /** MANGO or QUIET. The type is `screen-shell.tsx`'s and is owned there. */
  spine?: ScreenSpine;
  /** `false` when the document already paints the ground. */
  page?: boolean;
  /**
   * The trail, on the GROUND above the card — a strip of folder tabs since
   * 2026-09-02, and NOT the bar override 73 removed from above the title.
   * A plain node; the shell places it and nothing more.
   */
  breadcrumb?: React.ReactNode;
  /**
   * How many levels it has. A record has a parent, so a record passes 2 or
   * more and takes the smaller title. Defaults to 1 in the shell, which is
   * the top-level step — a record that says nothing gets a collection's
   * heading, which is why this is worth passing.
   */
  breadcrumbDepth?: number;

  /** The record's name. Carries the actions in its own row (override 73). */
  title?: React.ReactNode;
  /** The heading's ELEMENT. Its STEP is derived; see `breadcrumbDepth`. */
  headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div";

  /**
   * The title row's secondary controls — paper pills only. The screen's one
   * mango is still `onEdit`, and there is no prop here that can add a second.
   */
  actions?: React.ReactNode;
  /** The reader may act. `false` draws NO actions, never a disabled one. */
  actionsVisible?: boolean;
  /** Whether the title row's controls survive the narrow width. Off by default. */
  narrowActions?: boolean;

  /* ---- The identity row, UNDER the title. Override 73. ------------------ */

  /**
   * One node above everything, first thing inside the body pane — 27.43's
   * header image. Ruling 35 puts the picture above every word on the page.
   * It is `RecordChrome`'s, and it is the FIRST thing in the card's body,
   * under the band.
   */
  banner?: React.ReactNode;

  /** The record number. The black ID chip, always FIRST (override 73). */
  recordNumber?: React.ReactNode;
  /** The chip naming the record's collection. Second (override 73). */
  collectionLabel?: React.ReactNode;
  /** Status, type, since — the rest of the identity row, after those two. */
  chips?: React.ReactNode;
  /** Tags. 27.8 puts them beneath the identity row; override 73 keeps them. */
  tags?: React.ReactNode;
  /** "In build since 21 Mar · Aurora owns it" — the line under the chips. */
  meta?: React.ReactNode;
  /** The overflow well and anything else that is not the mango. */
  identityActions?: React.ReactNode;

  /* ---- The stage progression (chapter 23), above the tab strip ----------
     Not a difference: a collection has no record and therefore no
     progression, so there is nothing for `SHELL.md`'s table to compare.
     `RecordChrome` draws it; these forward to it. */

  /** The stages, in order. */
  stages?: RecordChromeProps["stages"];
  /** Which one the record is at. */
  currentStage?: number;
  /** A stage is pressable and moves the record to that stage's panel. */
  onStageSelect?: (index: number, stage: StatusStage) => void;
  /** The reader may see the progression. `false` draws nothing. */
  stagesVisible?: boolean;
  /** Accessible name for the progression. */
  stagesLabel?: string;

  /** The record's sub-views. */
  tabs?: readonly RecordDetailTab[];
  /** Controlled tab. */
  tab?: string;
  /** Uncontrolled first tab. 27.13: "the first tab is always the reading view". */
  defaultTab?: string;
  /** The tab belongs in the URL — this is where a route writes it. */
  onTabChange?: (value: string) => void;
  /** Accessible name for the strip. */
  tabsLabel?: string;

  /* ---- The mango, and the footer ---------------------------------------- */

  /** The one mango on the screen. Omit it and no Edit is drawn. */
  onEdit?: () => void;
  /** The word beside the pencil. 26.04 and 27.39 both draw "Edit". */
  editLabel?: string;

  /** The Latest activity column — a SHORT reverse-chronological feed. */
  activity?: readonly ActivityFeedItem[];
  /** The reader may see the internal log. The portal's is a narrower set. */
  activityVisible?: boolean;
  /** The eyebrow over it. */
  activityLabel?: React.ReactNode;
  /** Accessible name for the feed. */
  activityFeedLabel?: string;
  /** The Record column — two to four key/value rows, values right-aligned. */
  audit?: readonly RecordDetailAuditEntry[];
  /** The reader may see the Record column. Absent, never greyed. */
  auditVisible?: boolean;
  /** The eyebrow over it. */
  auditLabel?: React.ReactNode;
  /** The dark raised pill input. No handler, no field — the portal never gets one. */
  onAddNote?: (value: string) => void;
  /** Its placeholder. 27.39 draws "Add a note to the file". */
  notePlaceholder?: string;
  /**
   * The reader may see the footer at all. `false` draws none.
   *
   * THE RECORD'S FOOTER IS `RecordDetail`'s AND REACHES THE CARD'S BODY
   * THROUGH `RecordChrome`, not through the shell's own `footer` slot. Both
   * land in the same region and in the same normal flow; a screen that used
   * both would draw two, which is why this adapter passes neither the slot
   * nor a way to reach it.
   */
  footerVisible?: boolean;
  /** Whether the charcoal footer survives the narrow width. Off by default. */
  narrowFooter?: boolean;

  /* ---- The body ---------------------------------------------------------- */

  /** The record's own body — the facts, the prose, the panels. */
  body?: React.ReactNode;
  /** The reader may see the record's body at all. */
  bodyVisible?: boolean;
  /** Anything above the tab strip: the stage progression, a hero. */
  hero?: React.ReactNode;
  /** The strip pins under the identity row while the panel scrolls. */
  sticky?: boolean;

  /** Loading, empty or error. A state swaps the PANEL; nothing else moves. */
  state?: ShapeState;
  /** Per-locale words for the three states. */
  copy?: Partial<ShapeStateCopy>;
  /** The one next step offered by the empty panel. */
  emptyAction?: React.ReactNode;
  /** The retry offered by the error panel. */
  errorAction?: React.ReactNode;
}

/**
 * A record screen: `ScreenShell` with the record's name, chips and mango in
 * the band, and `RecordChrome` in the body.
 *
 * TEN STATES
 *  1. default        — as above, and the charcoal footer last.
 *  2. hover          — none of this file's. It draws no control at all.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by the controls.
 *  5. disabled       — does not apply. A reader who may not edit gets NO
 *                      Edit button (ch24.6 hides, never dims).
 *  6. loading        — `state="loading"`: the PANEL unfills. Law 4 — the
 *                      rail, the title, the identity row and the tabs stay
 *                      drawn and stay put.
 *  7. empty          — `state="empty"`, same mechanism.
 *  8. error          — `state="error"`, same mechanism.
 *  9. rtl            — nothing here names a side; the shell's insets are all
 *                      logical.
 * 10. dark           — every fill is a token; the levels alternate exactly as
 *                      they do in light, and the footer is charcoal in both.
 *
 * THREE BREAKPOINTS
 *  mobile  — no rail, no title-row controls, no mango Edit, no charcoal
 *            footer. The status chips and every count stay.
 *  tablet  — the rail arrives; the controls and the footer come back.
 *  desktop — unchanged; only the shell's inset steps up.
 *
 * @deprecated Compose `ScreenShell` directly. This file maps old prop names
 * onto its slots and decides nothing; see its header for where each ruling
 * now lives.
 */
function DetailScreen({
  door = "system",
  density,
  rail,
  railLabel,
  spine,
  page,
  breadcrumb,
  breadcrumbDepth,
  title,
  headingAs,
  actions,
  actionsVisible,
  narrowActions,
  banner,
  recordNumber,
  collectionLabel,
  chips,
  tags,
  meta,
  identityActions,
  stages,
  currentStage,
  onStageSelect,
  stagesVisible,
  stagesLabel,
  tabs,
  tab,
  defaultTab,
  onTabChange,
  tabsLabel,
  onEdit,
  editLabel,
  activity,
  activityVisible,
  activityLabel,
  activityFeedLabel,
  audit,
  auditVisible,
  auditLabel,
  onAddNote,
  notePlaceholder,
  footerVisible,
  narrowFooter = false,
  body,
  bodyVisible,
  hero,
  sticky,
  state = "ready",
  copy,
  emptyAction,
  errorAction,
  className,
  ...props
}: DetailScreenProps) {
  const measure: ScreenDensity = density ?? (door === "portal" ? "calm" : "comfortable");

  return (
    <ScreenShell
      data-slot="detail-screen"
      data-screen="detail"
      data-door={door}
      density={measure}
      rail={rail}
      railLabel={railLabel}
      spine={spine}
      page={page}
      breadcrumb={breadcrumb}
      breadcrumbDepth={breadcrumbDepth}
      className={className}
      /* THE BAND, AND NOTHING ABOVE THE TITLE IN IT — override 73. The
         overflow well rides with the paper pills, ahead of the mango:
         commit furthest out, retreat beside it. */
      title={title}
      headingAs={headingAs}
      actions={
        actions === undefined && identityActions === undefined ? undefined : (
          <>
            {actions}
            {identityActions}
          </>
        )
      }
      actionsVisible={actionsVisible}
      narrowActions={narrowActions}
      onEdit={onEdit}
      editLabel={editLabel}
      recordNumber={recordNumber}
      collectionLabel={collectionLabel}
      chips={chips}
      tags={tags}
      meta={meta}
      {...props}
    >
      {/* THE RECORD'S OWN REGIONS, AND ONLY THOSE. No `title`, no chips, no
          `actions` — the shell drew them, and passing them here as well would
          be override 73's two bars back again under new names. */}
      <RecordChrome
        data-slot="detail-screen-record"
        door={door}
        density={measure}
        banner={banner}
        stages={stages}
        currentStage={currentStage}
        onStageSelect={onStageSelect}
        stagesVisible={stagesVisible}
        stagesLabel={stagesLabel}
        hero={hero}
        sticky={sticky}
        tabs={tabs}
        tab={tab}
        defaultTab={defaultTab}
        onTabChange={onTabChange}
        tabsLabel={tabsLabel}
        panel={body}
        panelVisible={bodyVisible}
        activity={activity}
        activityVisible={activityVisible}
        activityLabel={activityLabel}
        activityFeedLabel={activityFeedLabel}
        audit={audit}
        auditVisible={auditVisible}
        auditLabel={auditLabel}
        onAddNote={onAddNote}
        notePlaceholder={notePlaceholder}
        footerVisible={footerVisible}
        /* CONTROLS DROP NARROW, COUNTS DO NOT — and 27.39's narrow render
           drops the charcoal footer with them. A screen that wants it at
           every width passes `narrowFooter`. */
        className={
          narrowFooter
            ? undefined
            : "[&_[data-record-region=footer]]:hidden sm:[&_[data-record-region=footer]]:flex"
        }
        state={state}
        copy={copy}
        emptyAction={emptyAction}
        errorAction={errorAction}
      />
    </ScreenShell>
  );
}

DetailScreen.displayName = "DetailScreen";

export { DetailScreen };
