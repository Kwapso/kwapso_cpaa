"use client";

/* ============================================================================
   DetailScreen — a screen that HAS BREADCRUMBS.

   THE NAME IS THE CLIENT'S AND IT IS NOT NEGOTIABLE
   The kit calls this "04 Detail / record page". The client calls it a DETAIL
   SCREEN, and their own test is the one written into this file's name:

       "a main screen is in the navbar; a detail screen has breadcrumbs."

   So the word in the export, in the props, in the comments and in the data
   attributes is `detail`. "Detail page" appears in this file exactly once — in
   the sentence above.

   WHAT IT IS
   `ScreenShell` (the four levels) with the three things a detail screen puts
   in them, and `RecordChrome` for the record itself. `SHELL.md`'s table is
   exhaustive: a main screen and a detail screen differ in EXACTLY THREE
   PLACES, and all three are here.

       eyebrow    `COLLECTION · 4182` — the parent, then the number
       tabs       plain UNDERLINE tabs, plus the identity chip row
       mango      the `Edit` button, in the identity row. And the footer.

   THE SHELL AND THE RAIL ARE IDENTICAL TO A MAIN SCREEN'S. Neither file draws
   either one: `ScreenShell` does, once, and both hand it the same rail.

   TWO SPELLINGS OF THE BREADCRUMB, AND BOTH ARE THE KIT'S
   `SHELL.md`: "The kit compresses the breadcrumb into the eyebrow on the
   later compositions; 26.04 draws a full breadcrumb row. Both spellings
   exist." So both are offered and neither is invented:

     · `eyebrow` — 27.39's spelling, `COLLECTION · 4182`, one line.
     · `breadcrumb` — 26.04's spelling, a real `Breadcrumbs` trail with
       `Collection name · Record title`, plus `trailing` for the right-hand
       `Record 03 of 12` p16 draws opposite it.

   Pass whichever the screen wants. Passing both draws both, in 26.04's order
   (trail first, eyebrow under it), because that is the only order either
   chapter draws them in.

   THE REGION ORDER, AND WHO OWNS EACH REGION

       ScreenShell            page → screen card → rail + header band → body pane
       ├ header band          breadcrumb · eyebrow · title · actions. NO mango.
       └ body pane
         └ RecordChrome       identity chip row → underline tabs → panel
                              → the charcoal footer, last, in normal flow

   The title is in the HEADER BAND, on the screen card's soft paper, and the
   identity row is in the BODY PANE — that split is the kit's, read off 27.39,
   and it is why this file does not simply hand `RecordChrome` a title. 26.04
   draws everything in one column because 26.04 is an anatomy diagram with no
   shell around it.

   THE ONE MANGO IS `Edit`, AND IT IS NOT IN THE HEADER
   `SHELL.md`: a main screen's mango is the header's `+`; a detail screen's is
   the `Edit` button. 27.39 draws it in the identity row — "this is where the
   mango sits on a record page: on Edit, not on a create button" — so that is
   where `onEdit` puts it, and the header band's `actions` slot takes paper
   pills only. A route that wants a mango in both places is drawing two
   mangos, which ruling 26 forbids, and there is no prop here that lets it.

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

import {
  Breadcrumbs,
  type BreadcrumbsItem,
} from "../../controls/breadcrumbs/breadcrumbs";
import { Button } from "../../controls/button/button";
import { Title } from "../../controls/title/title";
import type {
  ActivityFeedItem,
} from "../../structures/activity-feed/activity-feed";
import type {
  RecordDetailAuditEntry,
  RecordDetailTab,
} from "../../structures/record-detail/record-detail";
import type { StatusStage } from "../../controls/status-stepper/status-stepper";
import { Pencil } from "../../icons";
import { RecordChrome, type RecordChromeProps } from "./record-chrome";
import { ScreenShell, type ScreenSpine } from "./screen-shell";
import {
  SHAPE_HEADING_SIZE,
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

  /* ---- Difference 1 of 3 · the eyebrow, in both of the kit's spellings -- */

  /** 27.39's spelling: `COLLECTION · 4182`, the parent then the number. */
  eyebrow?: React.ReactNode;
  /** 26.04's spelling: the real trail, `Collection name · Record title`. */
  breadcrumb?: readonly BreadcrumbsItem[];
  /** Accessible name for the trail. */
  breadcrumbLabel?: string;
  /** 26.04's right-hand line, opposite the trail: `Record 03 of 12`. */
  trailing?: React.ReactNode;

  /** The record's name. Sits in the header band, on soft paper. */
  title?: React.ReactNode;

  /**
   * The header band's secondary controls. PAPER PILLS ONLY — the screen's one
   * mango is `onEdit`, in the identity row, and there is no prop here that
   * can put a second one in the band.
   */
  actions?: React.ReactNode;
  /** The reader may act. `false` draws NO actions, never a disabled one. */
  actionsVisible?: boolean;
  /** Whether the header's controls survive the narrow width. Off by default. */
  narrowActions?: boolean;

  /* ---- Difference 2 of 3 · the identity row and the underline tabs ------ */

  /**
   * One node above the identity row, first thing inside the body pane —
   * 27.43's header image. Ruling 35 puts the picture above every word on the
   * page, which is one region higher than `hero` reaches. See
   * `RecordChrome`'s note; not a fourth difference between the two screens.
   */
  banner?: React.ReactNode;

  /** The record number. Drawn as the charcoal pill 27.8 names. */
  recordNumber?: React.ReactNode;
  /** Status, type, since — the rest of the identity row, after the number. */
  chips?: React.ReactNode;
  /** Tags. 27.8 puts them beneath the record's name, leading the meta line. */
  tags?: React.ReactNode;
  /** "In build since 21 Mar · Aurora owns it" — the line under the name. */
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
 * A detail screen: the shell, a breadcrumb and a title in the header band,
 * the identity row and underline tabs on the body pane, and the charcoal
 * footer last.
 *
 * TEN STATES
 *  1. default        — as above.
 *  2. hover          — none of this file's.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by the controls.
 *  5. disabled       — does not apply. A reader who may not edit gets NO
 *                      Edit button (ch24.6 hides, never dims).
 *  6. loading        — `state="loading"`: the PANEL unfills. Law 4 — the
 *                      rail, the header band, the identity row and the tabs
 *                      stay drawn and stay put.
 *  7. empty          — `state="empty"`, same mechanism.
 *  8. error          — `state="error"`, same mechanism.
 *  9. rtl            — every inset is logical; nothing here names a side.
 * 10. dark           — every fill is a token; the levels alternate exactly as
 *                      they do in light, and the footer is charcoal in both.
 *
 * THREE BREAKPOINTS
 *  mobile  — no rail, no header controls, no mango Edit, no charcoal footer.
 *            The status chips and every count stay.
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
  eyebrow,
  breadcrumb,
  breadcrumbLabel,
  trailing,
  title,
  actions,
  actionsVisible = true,
  narrowActions = false,
  banner,
  recordNumber,
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

  /* 26.04's spelling of the eyebrow: the trail, and the count opposite it.
     Rendered above 27.39's one-line spelling when a screen passes both. */
  const trail =
    breadcrumb === undefined && trailing === undefined ? null : (
      <span
        data-slot="detail-screen-trail"
        className="flex min-w-0 flex-wrap items-baseline justify-between gap-3"
      >
        {breadcrumb === undefined ? (
          <span />
        ) : (
          <Breadcrumbs items={[...breadcrumb]} label={breadcrumbLabel} />
        )}
        {trailing === undefined ? null : (
          <span className="text-caption text-ink-tertiary">{trailing}</span>
        )}
      </span>
    );


  const headerActions =
    !actionsVisible || actions === undefined ? undefined : (
      <span
        data-slot="detail-screen-actions"
        className={narrowActions ? "flex items-center gap-3" : "hidden items-center gap-3 sm:flex"}
      >
        {actions}
      </span>
    );

  /* THE ONE MANGO, IN THE IDENTITY ROW. The pencil AND the word — 26.01's
     stated exception for a lone Edit. No control at all with no handler. */
  const edit =
    !actionsVisible || onEdit === undefined ? null : (
      <Button onClick={onEdit} className={narrowActions ? undefined : "hidden sm:inline-flex"}>
        <Pencil aria-hidden="true" />
        {editLabel}
      </Button>
    );

  /* The identity row's trailing cluster: the overflow well, then the mango.
     `RecordChrome` pins it to the inline end of the row it already draws. */
  const rowActions =
    identityActions === undefined && edit === null ? undefined : (
      <span className="flex items-center gap-3">
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
      header={
        /* NOT A CONTAINER — `rule={false}` keeps the hairline off the band.

           THE TRAIL IS ABOVE `Title`, NOT INSIDE ITS EYEBROW SLOT, and that
           is a fidelity fix rather than a layout preference. `Title`'s eyebrow
           is 11/500/UPPERCASE with 0.08em tracking — the right treatment for
           27.39's `COLLECTION · 4182`, and the wrong one for 26.04's trail,
           which p16 draws in sentence case at the caption step with `Record 03
           of 12` pushed to the opposite edge of its own row. Rendering the
           trail inside the eyebrow shouted the record's name in small caps and
           parked the count next to it instead of opposite it. Both spellings
           now get their own treatment, in 26.04's order. */
        <div className="flex min-w-0 flex-col gap-3">
          {trail}
          <Title
            data-slot="detail-screen-heading"
            eyebrow={eyebrow}
            size={SHAPE_HEADING_SIZE[measure]}
            rule={false}
            actions={headerActions}
          >
            {title}
          </Title>
        </div>
      }
      {...props}
    >
      {/* THE BODY PANE'S CONTENTS. No `title` and no `breadcrumb` go down:
          both are in the header band, one level up, which is the split 27.39
          draws. `RecordChrome` therefore opens on the identity row. */}
      <RecordChrome
        data-slot="detail-screen-record"
        door={door}
        density={measure}
        banner={banner}
        recordNumber={recordNumber}
        chips={chips}
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

/* Re-exported so a route can type its own identity row without importing from
   two tiers. Not a new type — the same one `RecordChrome` already takes. */
export type { BreadcrumbsItem };
