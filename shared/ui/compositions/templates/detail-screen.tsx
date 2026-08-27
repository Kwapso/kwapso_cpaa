"use client";

/* ============================================================================
   DetailScreen — a screen OPENED FROM a collection: one record, read.

   THE NAME IS THE CLIENT'S
   The kit calls this "04 Detail / record page". The client calls it a DETAIL
   SCREEN. Their original test — "a main screen is in the navbar; a detail
   screen has breadcrumbs" — named the way you ARRIVE, and its second half is
   now reversed by the client's own later ruling:

   THERE IS NO BREADCRUMB ON A DETAIL SCREEN — OVERRIDE 73 (2026-08-26).
   The client, comparing the live "Tickets · Padelbase · 4182" record page
   against a reference mockup, verbatim: "notice how the chips are directly
   underneath the title. in the example that I put, there is no edit button
   like yours, but the edit button should be aligned with the title and the
   chips underneath it. also, detail pages do not need this bar that you have
   on top where we have Padelbase and the number. these are chips, so the
   black chip is always the ID. we always use black chips for IDs, and next
   to it, add a chip for Padelbase like in the example. of course, translate
   this to universal rules."

   WHAT THAT REMOVED FROM THIS FILE, CONCRETELY. This template used to draw a
   26.04 breadcrumb trail, a 27.39 `COLLECTION · 4182` eyebrow and the title
   in `ScreenShell`'s header band, with `RecordChrome`'s identity row in the
   body pane below — a region apart. That split is exactly what produced the
   client's screenshot (a breadcrumb-plus-eyebrow bar, a gap, then the ID
   chip far below), and register row 73 logged this file as the remaining
   carrier of it. `breadcrumb`, `breadcrumbLabel`, `trailing` and `eyebrow`
   are REMOVED from the API rather than kept unused — the same treatment
   override 73 gave `RecordChrome`'s own breadcrumb props — and every caller
   in the repo was moved off them in the same change. The header band is left
   EMPTY: `RecordChrome` carries `title` itself now, draws the identity row —
   the black ID chip first, then the NEW `collectionLabel` chip ("Padelbase
   like in the example"), then `chips` — directly under it, and threads
   `actions` into the title's own row, which is what puts Edit "aligned with
   the title" (the client's words) with no extra markup here.

   WHAT IT IS
   `ScreenShell` (the page, the screen card, the rail — header slot empty)
   with `RecordChrome` for the record itself. `SHELL.md`'s table is
   exhaustive: a main screen and a detail screen differ in EXACTLY THREE
   PLACES, and all three are here.

       identity   the black ID chip, the collection chip, status chips —
                  directly UNDER the title (override 73)
       tabs       plain UNDERLINE tabs, never the folder shape
       mango      the `Edit` button, in the title's row. And the footer.

   THE SHELL AND THE RAIL ARE IDENTICAL TO A MAIN SCREEN'S. Neither file draws
   either one: `ScreenShell` does, once, and both hand it the same rail.

   THE ONE MANGO IS `Edit`, AND IT SITS IN THE TITLE'S ROW
   `SHELL.md`: a main screen's mango is the header's `+`; a detail screen's is
   the `Edit` button. Override 73 aligns it with the title. A route that wants
   a second mango is drawing two mangos, which ruling 26 forbids, and there is
   no prop here that lets it.

   `Edit` IS THE ONE LABELLED EXCEPTION TO THE GLYPH RULE, AND IT IS NOT AN
   EXCEPTION TO THE CREATE RULE. 26.01, verbatim: "Create is always the glyph,
   never the word … A lone Edit follows the same rule with the pencil." So the
   button carries the pencil AND the word, which is what both 26.04 and 27.39
   draw (`✎ Edit`), and the create rule is untouched because Edit is not a
   create.

   THE FOOTER — THE THIRD DIFFERENCE, AND THE ONE A MAIN SCREEN CANNOT HAVE
   `SHELL.md`: "Charcoal, two columns, in normal flow, once per record,
   unchanged per tab. … No mango. Appears on zero main screens." It is
   `RecordChrome`'s and it is drawn from `activity` + `audit` + `onAddNote`;
   this file only names it, so a reader knows the two halves exist.

   IT IS NOT THREE STACKED CARDS. `SHELL.md`: "Header, body, and footer are
   hairline-separated inside one 24px shell — never three stacked cards." Two
   levels of depth on the body pane and no more.

   NARROW
   `ScreenShell` drops the rail. 27.39's narrow render drops the number pill,
   the overflow well and the mango `Edit`, keeps the status chips, and drops
   the charcoal footer — controls, never counts. `narrowActions` and
   `narrowFooter` are both off by default for that reason, and both are props
   rather than hard rules because 26.04 and 27.39 are one specimen each.

   RENDERING CONTEXT
   `"use client"`. `RecordChrome`'s tabs are a client component and the edit
   handler is created at a call site.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import type {
  ActivityFeedItem,
} from "../../components/activity-feed/activity-feed";
import type {
  RecordDetailAuditEntry,
  RecordDetailTab,
} from "../../components/record-detail/record-detail";
import type { StatusStage } from "../../components/status-stepper/status-stepper";
import { Pencil } from "../../foundations/icons";
import { RecordChrome, type RecordChromeProps } from "./record-chrome";
import { ScreenShell, type ScreenSpine } from "./screen-shell";
import {
  type ScreenDensity,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

export interface DetailScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "children"> {
  /** Which door. Sets the measure and the heading step (commission §9). */
  door?: "system" | "portal";
  /** Override the door's measure. */
  density?: ScreenDensity;

  /* ---- The shell. Identical on a main screen; neither file draws it. ----- */

  /** The navigation rail's contents. Placed by `ScreenShell`, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;
  /**
   * The rail's spine — ink / paper / mango (26.02, client ruling D3). A
   * per-member setting, so it arrives from the application and is threaded
   * straight through; this file neither defaults it nor reads it.
   */
  spine?: ScreenSpine;
  /** `false` when the document already paints the off-beige page. */
  page?: boolean;

  /** The record's name. Carries the actions in its own row (override 73). */
  title?: React.ReactNode;

  /**
   * The header cluster's secondary controls — paper pills only. Override 73
   * puts them in the TITLE'S OWN ROW beside Edit; the screen's one mango is
   * still `onEdit`, and there is no prop here that can add a second one.
   */
  actions?: React.ReactNode;
  /** The reader may act. `false` draws NO actions, never a disabled one. */
  actionsVisible?: boolean;
  /** Whether the title row's controls survive the narrow width. Off by default. */
  narrowActions?: boolean;

  /* ---- Difference 1 of 3 · the identity row, UNDER the title ------------ */

  /**
   * One node above everything, first thing inside the body pane — 27.43's
   * header image. Ruling 35 puts the picture above every word on the page,
   * and with override 73 the title lives in the body pane too, so the image
   * genuinely precedes every word. See `RecordChrome`'s note.
   */
  banner?: React.ReactNode;

  /** The record number. The black ID chip, always FIRST (override 73). */
  recordNumber?: React.ReactNode;
  /**
   * The chip naming the record's collection — "add a chip for Padelbase like
   * in the example" (override 73). Second, right after the ID chip.
   */
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
     Not a fourth difference: a main screen has no record and therefore no
     progression, so there is nothing here for the table in `SHELL.md` to
     compare. `RecordChrome` draws it; these forward to it so a record that
     has stages does not have to assemble the chrome itself to get them. */

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

  /** The record's sub-views. UNDERLINE tabs, never the folder shape. */
  tabs?: readonly RecordDetailTab[];
  /** Controlled tab. */
  tab?: string;
  /** Uncontrolled first tab. 27.13: "the first tab is always the reading view". */
  defaultTab?: string;
  /** The tab belongs in the URL — this is where a route writes it. */
  onTabChange?: (value: string) => void;
  /** Accessible name for the strip. */
  tabsLabel?: string;

  /* ---- Difference 3 of 3 · the mango, and the footer -------------------- */

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
  /** The reader may see the footer at all. `false` draws none. */
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
 * A detail screen: the shell with an empty header band, and the record in the
 * body pane — title first, the identity chips directly under it (override
 * 73), underline tabs, and the charcoal footer last.
 *
 * TEN STATES
 *  1. default        — as above.
 *  2. hover          — none of this file's.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by the controls.
 *  5. disabled       — does not apply. A reader who may not edit gets NO
 *                      Edit button (ch24.6 hides, never dims).
 *  6. loading        — `state="loading"`: the PANEL unfills. Law 4 — the
 *                      rail, the title, the identity row and the tabs stay
 *                      drawn and stay put.
 *  7. empty          — `state="empty"`, same mechanism.
 *  8. error          — `state="error"`, same mechanism.
 *  9. rtl            — every inset is logical; nothing here names a side.
 * 10. dark           — every fill is a token; the levels alternate exactly as
 *                      they do in light, and the footer is charcoal in both.
 *
 * THREE BREAKPOINTS
 *  mobile  — no rail, no title-row controls, no mango Edit, no charcoal
 *            footer. The status chips and every count stay.
 *  tablet  — the rail arrives; the controls and the footer come back.
 *  desktop — unchanged; only the shell's inset steps up.
 */
function DetailScreen({
  door = "system",
  density,
  rail,
  railLabel,
  spine,
  page,
  title,
  actions,
  actionsVisible = true,
  narrowActions = false,
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
  editLabel = "Edit",
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

  /* THE ONE MANGO, IN THE TITLE'S ROW (override 73). The pencil AND the word
     — 26.01's stated exception for a lone Edit. No control at all with no
     handler. */
  const edit =
    !actionsVisible || onEdit === undefined ? null : (
      <Button onClick={onEdit}>
        <Pencil aria-hidden="true" />
        {editLabel}
      </Button>
    );

  /* The title row's trailing cluster: the paper pills, the overflow well,
     then the mango — commit furthest right, retreat beside it, the order
     every bar in the kit keeps. `RecordChrome` hands it to `RecordDetail`,
     which threads it into the same `Title` row as the heading, baseline-
     aligned — Edit "aligned with the title", the client's own words.
     CONTROLS DROP NARROW, COUNTS DO NOT — the whole cluster hides under `sm`
     unless the screen asks for `narrowActions`. */
  const rowActions =
    !actionsVisible || (actions === undefined && identityActions === undefined && edit === null)
      ? undefined
      : (
          <span
            data-slot="detail-screen-actions"
            className={
              narrowActions ? "flex items-center gap-3" : "hidden items-center gap-3 sm:flex"
            }
          >
            {actions}
            {identityActions}
            {edit}
          </span>
        );

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
      className={className}
      /* THE HEADER BAND IS EMPTY — override 73. "detail pages do not need
         this bar that you have on top where we have Padelbase and the
         number." Everything the record needs to say lives in the body pane:
         `RecordChrome` carries the title, and the identity chips sit
         directly under it. */
      {...props}
    >
      <RecordChrome
        data-slot="detail-screen-record"
        door={door}
        density={measure}
        banner={banner}
        recordNumber={recordNumber}
        collectionLabel={collectionLabel}
        chips={chips}
        title={title}
        tags={tags}
        meta={meta}
        actions={rowActions}
        actionsVisible={actionsVisible}
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
