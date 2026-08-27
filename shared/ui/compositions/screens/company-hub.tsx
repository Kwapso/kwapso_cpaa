"use client";

/* ============================================================================
   CompanyHubScreen — CH27.43, "Company hub · A record detail whose subject is
   a company".

   COMPOSED, NOT DRAWN
     · Image        — the header image, at 3 / 1 (override 27). A contained
                      card at the box radius, with nothing written on it
                      (ruling 35).
     · DetailScreen — the kit's second screen: `ScreenShell`'s four levels
                      with the three things a record puts in them, and
                      `RecordChrome` (shape 1, which IS 27.8) under it. The
                      title is in the header band; the identity row, the line
                      tabs, the one opaque panel and the footer are on the
                      body pane.
     · StatStrip    — the four figures, in the hero slot.
     · Avatar       — the logo. A company is a THING, so the square mark at 48.
     · List         — the modules and the people.
     · the ink footer — `RecordChrome`'s, through `DetailScreen`. "Latest" is its left column and the
                      key/value pairs its right; this file supplies content and
                      composes no feed of its own.
   Not one fill, radius, type step or ring is written in this file.

   DESIGN SOURCE — KWAPSO-SPEC.md CH27, composition 27.43.

     The strapline, verbatim:
       "One page per account: the image, the logo, the figures, the modules,
        the people, the history. It is the record detail anatomy from 27.8
        with a company at the top of it — because 'how is Padelbase doing' is
        a question the agency asks constantly and the kit could not answer."

     The image's own caption, verbatim:
       "Header image · a contained card, never a bleed"

     "The image is a card, and the type is below it", verbatim:
       "A contained band with 24px corners at the top of the page, and nothing
        written on it. Every word — logo, name, figures — sits on the paper
        underneath, so the page reads whatever photograph the client gave us."

     "The logo is a record mark", verbatim:
       "A company is a thing, so it takes the square mark at 48px (ruling 30).
        A supplied logo is placed inside that square, never floated free and
        never allowed to set its own shape."

     "Four figures, and one is money", verbatim:
       "Modules, open records, retainer used, people. Retainer is the figure
        the conversation is actually about, so it is never the one that gets
        cut on a narrow screen."

     "It is 27.8, with a company in it", verbatim:
       "Same identity row, same figures row, same panels, same log. Nothing
        about the subject being a company changes the composition — only what
        the panels hold."

     "Doors differ", verbatim:
       "The client sees this page as their own home: same anatomy, their logo,
        their image, and the retainer figure replaced by what is in flight.
        Internal notes and the people panel are not shown."

     Narrow, verbatim: "Narrow: image, then everything in one column".

     Ruling 35, verbatim: "Photography sits under type, never behind it. A
       header image is a contained card with 24px corners at the top of a
       page. No text is ever placed on it, and no scrim is used to make text
       survive it."

   THE TAB WORDS ARE THE APPLICATION'S TO CHOOSE. THE KIT SHIPS NONE.
   This is the whole of N4(a), and it is a correction of the design side's
   behaviour rather than a design decision. The client, verbatim and
   exasperated: "n4 none of those! we are not going so in detail here, that's
   part of the dev team! you have nothing to do here defining words, we are
   only working on the design. focus!"

   They are right, and the question should never have been put to them. What
   a company page calls its sections is a product's information architecture
   — it depends on what the two apps actually keep behind each tab, which is
   the dev team's knowledge and not the kit's. Naming them was not design
   work. FOUR candidate sets were drawn and one was picked BY THE DESIGN LEAD
   (override 35: Overview / Activity / Files); the client then said the whole
   question was out of scope, so override 35 is REVERTED and the default is
   gone rather than swapped for a fifth invention.

   WHAT THAT MEANS IN THE CODE
   `tabOverview`, `tabActivity` and `tabFiles` still exist on
   `CompanyHubLabels` — the props stay, and they stay required-in-the-shape —
   but they DEFAULT TO THE EMPTY STRING. Their key names are three SLOTS the
   kit holds open, not three words the kit proposes. An application fills the
   slots with its own vocabulary. Hand this screen none and it draws NO STRIP
   at all: `RecordDetail` says "absent or empty, no strip is drawn", and no
   strip is also what 27.43's own drawing has, so the wordless default is the
   chapter's own picture rather than a hole where a decision should be.

   IT IS NOT A BLANK SCREEN. The panels, the figures, the identity row, the
   image and the footer all draw with no caller at all. Only the words nobody
   is entitled to choose are missing.

   · (c) THE HEADER IMAGE IS 3 / 1. Override 27, ruled by the client, and it
     stands untouched. See `imageRatio`.
   · (b) THE PORTAL'S THIRD FIGURE IS "WITH US NOW". Override 36, and the
     CLIENT ANSWERED IT explicitly before calling the question out of scope.
     A ruling given is a ruling: it stands and is not reverted with (a). It
     lives on `portal/company.tsx`, not here.

   THE LAW THIS FILE OBEYS
   · THE IMAGE IS A CONTAINED CARD, NEVER A BLEED, AND CARRIES NO WORD.
     `Image` is rendered in `DetailScreen`'s `banner` — first thing inside the
     OFF-BEIGE BODY PANE, above the identity row and above every word on the
     page, which is what ruling 35 asks for. Not as a background, not
     full-bleed, and not in the hero slot (which sits under the title and would put the type on top
     of the picture's band rather than the picture above the type). It has no
     children slot in this file, no overlay, no scrim and no gradient: there
     is no prop on this screen that could put a word on the photograph.
   · THE LOGO IS A SQUARE MARK AT 48. `Avatar shape="square" size="lg"`,
     ruling 30 exactly. A supplied logo goes INSIDE it as `AvatarImage`; there
     is no way to hand this screen a free-floating logo.
   · FOUR FIGURES, AND THE RETAINER IS NEVER THE ONE CUT. `StatStrip` caps at
     four, all four survive a 380 viewport by STACKING rather than dropping,
     and a call site that hides the retainer figure warns in development.
     `retainerFigure` names which one is the money.
   · IT IS 27.8. The identity row, the tabs, the panels and the footer are
     `RecordChrome`'s. This file adds exactly one region — the image — and the
     chapter's own narrow rule is "image, then everything in one column",
     which is what that ordering produces at every width.
   · NOTHING IS CENTRED. 27.37 is the only centred composition in the kit.
   · Every user-facing string is a prop. No px, no hex, no `border`, no
     gradient, no blur.

   THE DIVERGENCE THAT WAS LOGGED HERE IS CLOSED (DEF-1, 2026-08-23)
   CH27.8's charcoal two-column footer card is what `RecordDetail` region 4
   draws now. "Latest" moved out of the panel into the footer's left column
   and the key/value pairs are its right. THE HUB DRAWS NO NOTE FIELD: 27.43
   gives a company no internal log to append to, and the hub is a page the
   client may be shown through the portal door. Said here rather than left to
   an absent prop.

   NARROW (380px) — THE CHAPTER NAMES A SPECIFIC RULE AND IT IS OBEYED
   "Image, then everything in one column."
     · The image keeps its ratio and its 24 corners and stays contained: it
       spans the column, never the viewport, and nothing is written on it. At
       380 the ruled 3 / 1 is a ~113px band, which is a header; the 16/9 it
       replaced was ~200px, more than half a phone screen of picture before
       the company's own name.
     · Everything below it is already one column — 27.8: "the reading column
       stays single" — so nothing restacks.
     · ALL FOUR FIGURES SURVIVE. `StatGrid`'s auto-fit drops to one column at
       380, which STACKS the four rather than cutting any, so the retainer —
       the figure the conversation is about — is on the screen at every width
       by construction, not by a media query someone has to remember. A caller
       that sets `visible: false` on the retainer is warned in development.
     · The modules and people rows put their trailing value beside the name
       and truncate the name, so no row wraps to three lines.

   RENDERING CONTEXT
   `"use client"`. The tab handler and the row handlers are built during this
   module's own render.
   ========================================================================= */

import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../../components/avatar/avatar";
import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Image } from "../../components/image/image";
import { Text } from "../../components/typography/typography";
import type { ActivityFeedItem } from "../../components/activity-feed/activity-feed";
import { CollectionFrame } from "../../components/collection-frame/collection-frame";
import { List, type ListRow } from "../../components/list/list";
import type { RecordDetailAuditEntry } from "../../components/record-detail/record-detail";
import { cn } from "../../lib/utils";
import { DetailScreen, StatStrip, type StatStripFigure } from "../templates";
import { type ShapeState, type ShapeStateCopy } from "../states";

/** CH27.43: "Modules, open records, retainer used, people." */
export const COMPANY_FIGURE_COUNT = 4;

/** One of the four figures over a company. */
export interface CompanyFigure {
  /** Stable key, and the value `retainerFigure` names. */
  id: string;
  /** What it counts — "Modules", "Open records", "Retainer used", "People". */
  label: React.ReactNode;
  /** The number. "87%" is a value like any other. */
  value: React.ReactNode;
  /** Pressing it opens what it counts. */
  onSelect?: () => void;
  /**
   * The reader may see it. THE RETAINER MAY NOT BE HIDDEN — a `false` here on
   * the figure `retainerFigure` names warns in development.
   */
  visible?: boolean;
}

/** Every user-facing string this screen owns. */
export interface CompanyHubLabels {
  tabsLabel: string;
  /**
   * THE FIRST OF THREE TAB SLOTS, AND THE KIT SUPPLIES NO WORD FOR IT.
   * Empty by default (N4, 2026-08-23). What a company page calls its
   * sections is the application's information architecture, not the design
   * system's — see the header. The key's name is a slot id, not a proposal.
   * Leave all three empty and no strip is drawn.
   */
  tabOverview: string;
  /** The second slot. Empty by default; the application's word. */
  tabActivity: string;
  /** The third slot. Empty by default; the application's word. */
  tabFiles: string;
  /** The one mango. */
  edit: string;
  /** Accessible name for the figure strip. */
  figuresLabel: string;
  /** The heading over the modules panel. */
  modulesHeading: string;
  modulesLabel: string;
  /** The heading over the people panel. */
  peopleHeading: string;
  peopleLabel: string;
  /** The eyebrow over the history, in the ink footer's left column. */
  latestHeading: string;
  latestLabel: string;
  /** The eyebrow over the ink footer's right column. */
  recordHeading: string;
  /** Alt text for the header image. It carries no words, so this is all it has. */
  imageAlt: string;
  imageLoadingLabel: string;
  imageErrorLabel: string;
}

const DEFAULT_LABELS: CompanyHubLabels = {
  tabsLabel: "Company sections",
  /* N4, 2026-08-23 — THREE EMPTY SLOTS, ON PURPOSE. Override 35's
     Overview / Activity / Files is REVERTED: the client ruled the whole
     question out of the design's scope, and the words belong to whichever
     application knows what it keeps behind each tab. Empty draws no strip,
     which is 27.43's own drawing. */
  tabOverview: "",
  tabActivity: "",
  tabFiles: "",
  edit: "Edit",
  figuresLabel: "How this account is doing",
  modulesHeading: "Modules",
  modulesLabel: "Modules",
  peopleHeading: "People",
  peopleLabel: "People",
  latestHeading: "Latest activity",
  latestLabel: "Latest activity",
  recordHeading: "Record",
  imageAlt: "",
  imageLoadingLabel: "Loading…",
  imageErrorLabel: "This picture could not be loaded",
};

const DEFAULT_COPY: Partial<ShapeStateCopy> = {
  emptyTitle: "Nothing on this account yet",
  emptyDescription: "It fills as modules are switched on and work is raised.",
};

/* CH27.43's own four figures, in its own order. Obviously fictional content:
   no real client name appears in this repo. */
const DEFAULT_FIGURES: readonly CompanyFigure[] = [
  { id: "modules", label: "Modules", value: "4" },
  { id: "records", label: "Open records", value: "2" },
  { id: "retainer", label: "Retainer used", value: "87%" },
  { id: "people", label: "People", value: "6" },
];

const DEFAULT_MODULES: readonly ListRow[] = [
  { id: "bookings", title: "Bookings", meta: "5 open" },
  { id: "trainings", title: "Trainings", meta: "2 open" },
  { id: "roster", title: "Roster", meta: "clear" },
];

const DEFAULT_PEOPLE: readonly ListRow[] = [
  { id: "gp", title: "Guillem P.", description: "Contact", initials: "GP" },
  { id: "mk", title: "Marta K.", description: "Bookings", initials: "MK" },
];

const DEFAULT_LATEST: readonly ActivityFeedItem[] = [
  {
    id: "l-1",
    time: "11:42",
    initials: "GP",
    actor: "Guillem",
    description: "Guillem opened #3521",
    meta: "today 11:42",
  },
];

/* The ink footer's RIGHT column, as 27.8's key/value pairs. Two rows, which
   is the bottom of its stated "two to four". */
const DEFAULT_AUDIT: readonly RecordDetailAuditEntry[] = [
  { id: "since", label: "With us since", children: "Feb 2024" },
  { id: "latest", label: "Latest activity", children: "Today, 11:42" },
];

export interface CompanyHubScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
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
  /** Which door. The portal shows the client their own hub. */
  door?: "system" | "portal";

  /**
   * The header image. A contained card at the top of the page with NOTHING
   * written on it (ruling 35). Omit it and the page starts at the logo.
   */
  imageSrc?: string;
  /**
   * The image's own shape. **3 / 1 by ruling (override 27, 2026-08-23.)**
   *
   * `Image`'s own default is the kit's media 16/9, and 16/9 was what this hub
   * passed: at 1280 that is a ~700px band before the company's name appears,
   * which is a magazine cover, not a header. 27.43 and ruling 35 both say
   * "a contained card with 24px corners" and neither names a shape, so the
   * client was asked and ruled 3 / 1. RULING 35 STILL HOLDS UNCHANGED: this
   * is a contained card at the top of the page, never a bleed, and nothing is
   * ever written on it.
   */
  imageRatio?: string | number | null;
  /** The image has not arrived. */
  imageLoading?: boolean;
  /** The image failed. The page keeps its shape and says so in the box. */
  imageError?: boolean;

  /** Two initials for the square mark. A supplied logo goes in `logoSrc`. */
  logoInitials?: React.ReactNode;
  /** A supplied logo, placed INSIDE the square mark and never floated free. */
  logoSrc?: string;
  /** The company's name. */
  name?: React.ReactNode;
  /** "Vienna · with us since Feb 2024". */
  meta?: React.ReactNode;
  /** The relationship chip — "Maintenance". */
  chips?: React.ReactNode;

  /** The four. Modules, open records, retainer used, people. */
  figures?: readonly CompanyFigure[];
  /** Which figure is the money. It is never the one cut on a narrow screen. */
  retainerFigure?: string;

  /** The modules panel. */
  modules?: readonly ListRow[];
  /** Opening a module. */
  onModuleSelect?: (row: ListRow) => void;
  /** The people panel. Not shown through the portal door. */
  people?: readonly ListRow[];
  /** The sentence under the people — "Guillem is the contact". */
  contactNote?: React.ReactNode;
  /** The history. */
  latest?: readonly ActivityFeedItem[];
  /** The audit line. */
  audit?: readonly RecordDetailAuditEntry[];

  /** Controlled tab. */
  tab?: string;
  /** Uncontrolled first tab. */
  defaultTab?: string;
  /** The tab belongs in the URL. */
  onTabChange?: (value: string) => void;

  /** The one mango. */
  onEdit?: () => void;
  /** The overflow beside it. */
  moreActions?: React.ReactNode;
  /** The reader may act. `false` draws no actions at all. */
  actionsVisible?: boolean;

  /** Loading, empty or error — swaps the panel, keeps the image and the band. */
  state?: ShapeState;
  /** Per-locale words for the states. */
  copy?: Partial<ShapeStateCopy>;
  /** Merged over the defaults. */
  labels?: Partial<CompanyHubLabels>;
}

/**
 * One page per account.
 *
 * TEN STATES
 *  1. default        — the image, the logo and name, four figures, the
 *                      modules, the people, the history, the footer.
 *  2. hover          — the rows', the tabs' and the buttons'. The IMAGE does
 *                      not hover, does not zoom and does not dim: ruling 35
 *                      puts photography under type, and a picture that moved
 *                      under the pointer would break that with motion instead
 *                      of colour.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — the controls' own.
 *  5. disabled       — does not apply. A reader who may not act is passed
 *                      `actionsVisible={false}` and sees no action rather
 *                      than a grey one (CH24.6).
 *  6. loading        — `state="loading"` unfills the panel and keeps the
 *                      image, the logo, the name and the figures drawn. The
 *                      IMAGE has its own `imageLoading`, because a photograph
 *                      arrives on its own schedule and the box must hold its
 *                      shape while it does.
 *  7. empty          — `state="empty"`: an account with nothing on it yet.
 *  8. error          — `state="error"` for the panel; `imageError` for the
 *                      picture alone, which says so in the box rather than
 *                      collapsing the page's top.
 *  9. selected       — the active tab, owned by the shape.
 * 10. read-only      — the normal case. Nothing on this page is a field.
 *
 * THREE BREAKPOINTS
 *  · 380 — image, then everything in one column. All four figures stack and
 *    none is cut, so the retainer is always on the screen.
 *  · tablet / desktop — the figures spread across the strip and the panels
 *    keep their single reading column.
 *
 * RTL — LTR only by client ruling. Nothing here names a side.
 */
function CompanyHubScreen({
  rail,
  railLabel,
  className,
  door = "system",
  imageSrc,
  imageRatio = "3 / 1",
  imageLoading = false,
  imageError = false,
  logoInitials = "PB",
  logoSrc,
  name = "Padelbase GmbH",
  meta = "Vienna · with us since Feb 2024",
  chips,
  figures = DEFAULT_FIGURES,
  retainerFigure = "retainer",
  modules = DEFAULT_MODULES,
  onModuleSelect,
  people = DEFAULT_PEOPLE,
  contactNote = "Guillem is the contact",
  latest = DEFAULT_LATEST,
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
}: CompanyHubScreenProps) {
  const words: CompanyHubLabels = { ...DEFAULT_LABELS, ...labels };

  if (process.env.NODE_ENV !== "production") {
    if (figures.length > COMPANY_FIGURE_COUNT) {
      console.warn(
        `CompanyHubScreen: CH27.43 names four figures — modules, open records, retainer used, people. Got ${String(figures.length)}.`,
      );
    }
    const money = figures.find((figure) => figure.id === retainerFigure);
    if (money !== undefined && money.visible === false) {
      console.warn(
        "CompanyHubScreen: CH27.43 — retainer is the figure the conversation is about and is never the one that gets cut.",
      );
    }
  }

  /* N4, 2026-08-23 — THE STRIP IS DRAWN ONLY IF SOMEONE SUPPLIED THE WORDS.
     The kit ships no tab vocabulary for a company page (see the header), so
     the three slots are empty by default and an unnamed slot is not a tab.
     All three empty, and `tabs` is undefined: `RecordDetail` draws no strip,
     which is what 27.43's own drawing has. This is a filter, not a guess —
     nothing invents a word to fill a gap. */
  const tabStrip = [
    { value: "overview", label: words.tabOverview },
    { value: "activity", label: words.tabActivity },
    { value: "files", label: words.tabFiles },
  ].filter((item) => item.label !== "");

  const stripFigures: readonly StatStripFigure[] = figures.map((figure) => ({
    id: figure.id,
    label: figure.label,
    value: figure.value,
    onSelect: figure.onSelect,
    /* The retainer cannot be hidden, whatever a call site passes. */
    visible: figure.id === retainerFigure ? true : figure.visible,
  }));

  /* The identity row: the square mark, then the name. Ruling 30 — a company
     is a THING, so the mark is square, at 48, and a supplied logo lives
     inside it. */
  const identity = (
    <span className="flex min-w-0 items-center gap-4">
      <Avatar shape="square" size="lg" className="flex-none">
        {logoSrc === undefined ? null : <AvatarImage src={logoSrc} alt="" />}
        <AvatarFallback>{logoInitials}</AvatarFallback>
      </Avatar>
      <span className="min-w-0">{name}</span>
    </span>
  );

  const panel = (
    <div data-slot="company-body" className="flex min-w-0 flex-col gap-[var(--space-7)]">
      <CollectionFrame
        tone="bare"
        density="compact"
        heading={words.modulesHeading}
        headingSize="h4"
        headingAs="h2"
        rule={false}
      >
        <List
          rows={[...modules]}
          variant="rows"
          density="compact"
          label={words.modulesLabel}
          onRowSelect={
            onModuleSelect === undefined
              ? undefined
              : (index) => {
                  const row = modules[index];
                  if (row !== undefined) onModuleSelect(row);
                }
          }
        />
      </CollectionFrame>

      {/* "Internal notes and the people panel are not shown" through the
          portal door — so the panel is not drawn at all rather than emptied. */}
      {door === "portal" || people.length === 0 ? null : (
        <CollectionFrame
          tone="bare"
          density="compact"
          heading={words.peopleHeading}
          headingSize="h4"
          headingAs="h2"
          rule={false}
        >
          <List rows={[...people]} variant="rows" density="compact" label={words.peopleLabel} />
          {contactNote === undefined ? null : (
            <Text as="p" size="sm" tone="secondary">
              {contactNote}
            </Text>
          )}
        </CollectionFrame>
      )}

      {/* "LATEST" IS NO LONGER A PANEL SECTION. DEF-1, 2026-08-23: the feed is
          the ink footer's LEFT column, which is where 27.8 draws it and where
          `RecordDetail` now renders it. It rides `activity` below. */}
    </div>
  );

  return (
    /* A DETAIL SCREEN — CH27.43 is "a record detail whose subject is a
       company". NO BREADCRUMB (override 73, 2026-08-26): "detail pages do
       not need this bar that you have on top". The image is genuinely the
       first thing on the page now — `DetailScreen` puts the title in the
       body pane UNDER `banner`, which is what ruling 35's "every word —
       logo, name, figures — sits on the paper underneath" always asked for
       and the old header-band title quietly violated. */
    <DetailScreen
      data-slot="screen-company-hub"
      className={className}
      door={door}
      rail={rail}
      railLabel={railLabel}
      /* THE IMAGE. A contained card at the top of the page, at the box radius,
         with nothing written on it (ruling 35). It goes in `banner` — first
         thing inside the body pane, ABOVE the identity row — because ruling
         35 puts the picture above every word on the page and `hero` sits
         under the identity row and the meta line, which is one region too
         low. Override 27 keeps it at 3/1. */
      banner={
        imageSrc === undefined && !imageLoading && !imageError ? undefined : (
          <Image
            data-slot="company-header-image"
            src={imageSrc}
            alt={words.imageAlt}
            ratio={imageRatio}
            loading={imageLoading}
            error={imageError}
            loadingLabel={words.imageLoadingLabel}
            errorLabel={words.imageErrorLabel}
          />
        )
      }
        chips={chips ?? <Badge>Maintenance</Badge>}
        title={identity}
        meta={
          meta === undefined ? undefined : (
            <Text as="p" size="sm" tone="secondary">
              {meta}
            </Text>
          )
        }
        actionsVisible={actionsVisible}
        /* THE ONE MANGO, IN THE IDENTITY ROW. `SHELL.md`: a detail screen's
           mango is `Edit`, and 27.39 draws it in the identity row rather than
           the header band — so it is `onEdit` and `DetailScreen` draws it,
           with the pencil 26.01's stated exception gives a lone Edit. There
           is no stage progression on a company, so chapter 23's step-down
           does not fire and the mango stays. The overflow well sits beside
           it; the header band's `actions` slot is left empty, and there is no
           prop on this shape that could put a second mango in it. */
        identityActions={moreActions}
        onEdit={onEdit}
        editLabel={words.edit}
        /* The figures row, in the hero slot — under the name, over the tabs,
           which is where CH27.43 draws it. */
        hero={
          <StatStrip
            figures={stripFigures}
            label={words.figuresLabel}
                        /* VERBATIM, NO TERNARY -- T3B-16. See portal/company.tsx. */
            state={state}
          />
        }
        /* Undefined when the application named nothing — no strip, and no
           invented words. N4, 2026-08-23; override 35 reverted. */
        tabs={tabStrip.length === 0 ? undefined : tabStrip}
        tab={tab}
        defaultTab={defaultTab}
        onTabChange={onTabChange}
        tabsLabel={words.tabsLabel}
        body={panel}
        /* ---- 27.8's ink footer, both columns ------------------------- */
        activity={latest}
        activityLabel={words.latestHeading}
        activityFeedLabel={words.latestLabel}
        /* No `onAddNote`. A company hub has no internal note thread, and the
           portal door may be reading this page (ch27.8). */
        audit={audit}
        auditLabel={words.recordHeading}
        state={state}
        copy={{ ...DEFAULT_COPY, ...copy }}
      {...props}
    />
  );
}

CompanyHubScreen.displayName = "CompanyHubScreen";

export { CompanyHubScreen, DEFAULT_FIGURES as COMPANY_FIGURES };
