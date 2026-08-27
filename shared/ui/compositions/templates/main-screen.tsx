"use client";

/* ============================================================================
   MainScreen — a screen that is IN THE NAVBAR.

   THE NAME IS THE CLIENT'S AND IT IS NOT NEGOTIABLE
   The kit calls this "03 List / collection page". The client calls it a MAIN
   SCREEN, and their own test is the one written into this file's name:

       "a main screen is in the navbar; a detail screen has breadcrumbs."

   So the word in the export, in the props, in the comments and in the data
   attributes is `main`. "List page" appears in this file exactly once — in
   the sentence above — so a reader coming from the kit can find their way in,
   and never again.

   WHAT IT IS
   `ScreenShell` (the four levels) with the three things a main screen puts in
   them. `SHELL.md`'s table is exhaustive: a main screen and a detail screen
   differ in EXACTLY THREE PLACES, and all three are here.

       eyebrow   `GROUP · 24 RECORDS` — scope, then count
       tabs      notched FOLDER tabs, then a toolbar inside the panel
       mango     an unlabelled `+` in the header band. No footer, ever.

   THE SHELL AND THE RAIL ARE IDENTICAL TO A DETAIL SCREEN'S. Neither file
   draws either one: `ScreenShell` does, once, and both hand it the same rail.

   THE REGION ORDER, AND WHO OWNS EACH REGION

       ScreenShell            page → screen card → rail + header band → body pane
       ├ header band          eyebrow · title · actions · the mango `+`
       └ body pane
         └ CollectionFrame    figures → folder tabs → ONE PANEL
                              (toolbar · rows · pager inside the panel)

   The eyebrow and the title are in the HEADER BAND, on the screen card's soft
   paper, and the figures are in the BODY PANE — that split is the kit's, read
   off every assembled screen from 27.22 on, and it is why this file does not
   simply hand `CollectionFrame` a heading. 26.03 draws all five regions in one
   column because 26.03 is an anatomy diagram with no shell around it.

   THREE THINGS THAT LIE BARE, AND THE BUILD USED TO WRAP ALL THREE

   1. THE FIGURE STRIP. `SHELL.md`: "the figure strip on a main screen — bare
      on the body pane, NOT in cards … the one exception is the dashboard
      (27.11), where the figures ARE in cards." p15 draws three figures with
      no card edge among them. This file passes `surface="bare"` and the
      dashboard is the one screen that does not.
   2. THE HEADER BAND. Not a container: no fill, no radius, no rule. It takes
      the screen card's tone. `Title` is rendered with `rule={false}` for that
      reason — a heavy hairline under the band would be a stroke doing a
      container's job, which CH13 forbids ("Colour separates, strokes don't").
   3. THE RAIL. `ScreenShell`'s, and also not a container.

   TWO PLUS BUTTONS, TWO COLOURS, AND THIS FILE OWNS ONE OF THEM
   `SHELL.md`: the page header's `+` is MANGO; the collection panel's own `+`
   is CHARCOAL; only one mango in the pair. The header's is drawn here, from
   `onCreate`. The panel's belongs to the toolbar and arrives through
   `actions`, which is `CollectionFrame`'s slot and not this file's business.

   ─────────────────────────────────────────────────────────────────────────
   THE HEADER'S `+` STAYS MANGO ON THE MANGO SPINE. EXAMINED, NOT ASSUMED.
   ─────────────────────────────────────────────────────────────────────────
   On 2026-08-24 the client made MANGO the default spine, and 26.02's mango
   card says "One per workspace, never combined with a mango header." Read as
   covering this control, that sentence would take the mango `+` off every
   main screen in the system. It does not, for four reasons, and the fourth
   is the one that settles it:

     1. IT SAYS "HEADER", NOT "ACTION". The header band is off-beige (client
        ruling; see `screen-shell.tsx`). A mango control standing in an
        off-beige band is not a mango header. The kit draws NO mango header
        band anywhere — the only three mango REGIONS in the whole artifact
        are 26.02's own spine specimen, an unsaved-changes save bar and the
        rail's active row.
     2. OVERRIDE 17 COUNTS MANGO **ACTIONS**, and the mango spine improves
        that count rather than breaking it. The spine is a ground, not a
        control, and on it the lit row inverts to charcoal — so the rail
        spends ZERO mango actions and this `+` is the screen's one. Under
        paper the same screen carried two. Stepping the `+` down as well
        would leave the screen with NO primary action at all.
     3. 27.22's RULE CARD, verbatim: "No mango on this screen at all …
        **The page-level mango + stays in the header where it always is.**"
        Another agent restored exactly that on 27.21, 27.23 and 27.33 earlier
        the same day. Nothing here undoes that work.
     4. 26.02's OWN CLOSING PROSE, verbatim, and it is an exhaustive list:
        "**The rest of the app does not change with the spine**: the page
        stays off-beige, cards stay soft paper, and the active row is mango
        on the ink and paper spines, charcoal on the mango one." The active
        row is the ONLY thing the chapter says varies. A header control that
        changed colour with the spine would make that sentence false.

   SO WHAT DOES "NEVER COMBINED WITH A MANGO HEADER" BIND? A second mango
   CHROME REGION, which is the same kind of thing the spine is. It has one
   live case in this repo and `screen-shell.tsx` now enforces it: the mango
   ambient FIELD is dropped on the mango spine.

   THE ONE THING THIS DOES NOT SETTLE is whether a 40px mango circle still
   READS as the screen's one action when a 208px mango slab is standing next
   to it. That is a judgement about the whole screen, not a rule the artifact
   states, so it is measured, screenshotted and put to the client rather than
   taken here. `SHELL.md`'s *Owed* carries it.

   "Create is always the glyph, never the word" — so the header control is
   `size="icon"` with a `+` in it and an `aria-label`, never a labelled
   button. The kit names exactly one exception (27.21's `+ Add the first`) and
   it is not on this screen.

   NO MANGO AT ALL ON SOME MAIN SCREENS. `SHELL.md`: "on Archive, Activity log
   and Link sent there is no mango at all." Those routes pass no `onCreate`
   and no control is drawn — not a disabled one, which ch24.6 forbids.

   NO FOOTER, EVER. There is no footer slot on this shape and that is the
   enforcement: `SHELL.md` records the charcoal footer on "zero main screens",
   so a route cannot put one here by mistake. A footer belongs to a record and
   lives on `DetailScreen`.

   NARROW
   `ScreenShell` drops the rail. This file drops CONTROLS, never COUNTS:
   `narrowActions={false}` (the default) takes the header's secondary actions
   and the mango `+` out below the breakpoint, and the figure strip, the tab
   counts and the record count all stay. No hamburger is drawn, because the
   kit draws none anywhere.

   RENDERING CONTEXT
   `"use client"`. `CollectionFrame`'s tabs are a client component and the
   create handler is created at a call site, but this module holds no state of
   its own.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { Title } from "../../components/title/title";
import { Text } from "../../components/typography/typography";
import {
  CollectionFrame,
  type CollectionFrameTab,
} from "../../components/collection-frame/collection-frame";
import { Plus } from "../../foundations/icons";
import { ScreenShell, type ScreenSpine } from "./screen-shell";
import { StatStrip, type StatStripFigure } from "./stat-strip";
import { SHAPE_HEADING_SIZE, type ScreenDensity, type ShapeState } from "../states/states";

export interface MainScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "children"> {
  /** Which door. Sets the measure and the heading step (commission §9). */
  door?: "system" | "portal";
  /** Override the door's measure. */
  density?: ScreenDensity;

  /* ---- The shell. Identical on a detail screen; neither file draws it. ---- */

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
  /** The decorative field on the screen card. Ruling 05/06 scopes it to three
      screens; every other screen passes none and none is drawn. */
  ambient?: React.ReactNode;

  /* ---- Difference 1 of 3 · the eyebrow ---------------------------------- */

  /**
   * `GROUP · 24 RECORDS` — the scope, then the count. A node, so a route can
   * put a `Badge` in it; a plain string is the ordinary case.
   *
   * A detail screen's eyebrow is the parent and the record number instead.
   * That is the whole of difference 1.
   */
  eyebrow?: React.ReactNode;

  /** What the collection is called. Sits in the header band, on soft paper. */
  title?: React.ReactNode;
  /**
   * The heading's ELEMENT, so a page keeps a real outline. `Title` defaults to
   * `h2`; a screen that is the whole document passes `h1`. Separate from the
   * heading's STEP, which is the door's and is not a call site's to set —
   * `CollectionFrame` already splits the two the same way and for the same
   * reason.
   */
  headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div";

  /**
   * The quiet line under the heading — "Everything on this page is yours to
   * read". It lies BARE in the header band, with no container of its own:
   * `SHELL.md`'s list of what lies bare names "the collection-views name and
   * description lines", and `Title` has no slot for one, so it is placed here
   * rather than smuggled into the heading node.
   */
  meta?: React.ReactNode;

  /**
   * The header band's secondary controls — `⤓ Export` and its neighbours.
   * Paper pills; the mango is `onCreate`'s and is drawn after these.
   */
  actions?: React.ReactNode;
  /** The reader may act. `false` draws NO actions, never a disabled one. */
  actionsVisible?: boolean;
  /**
   * Whether the header's controls survive the narrow width. Off, because the
   * kit drops Export and the mango `+` there and keeps every figure.
   */
  narrowActions?: boolean;

  /* ---- Difference 3 of 3 · the mango, and the absence of a footer ------- */

  /**
   * The one mango on the screen, as an unlabelled `+`. Omit it and no control
   * is drawn — which is Archive, Activity log and Link sent.
   */
  onCreate?: () => void;
  /** What a screen reader hears on the `+`. Required by the glyph-only rule. */
  createLabel?: string;

  /* ---- The body pane ---------------------------------------------------- */

  /**
   * The figures. Data, not a node, because the LAW about them is this shape's
   * and not a route's: `SHELL.md` says a main screen's figure strip lies BARE
   * on the body pane, and a route handed a slot would have to remember to
   * pass `surface="bare"` forty times. It is passed here, once.
   */
  figures?: readonly StatStripFigure[];
  /** Accessible name for the strip. */
  figuresLabel?: string;
  /** The reader may see the figures at all. `false` draws NOTHING. */
  figuresVisible?: boolean;
  /**
   * THE ONE EXCEPTION THE KIT NAMES, AND THE ONLY REASON THIS PROP EXISTS.
   * `SHELL.md`: the figure strip is bare on a main screen — "the one
   * exception is the dashboard (27.11), where the figures ARE in cards."
   * The dashboard passes `"card"`. Nothing else may.
   */
  figuresSurface?: "bare" | "card";
  /**
   * A figure strip a route has drawn itself, for the rare screen whose
   * numbers are not `StatStrip`'s shape. Rendered INSTEAD of `figures`, in
   * the same slot, and it is the route's job to keep it bare.
   */
  figureStrip?: React.ReactNode;

  /* ---- Difference 2 of 3 · folder tabs, then the toolbar ---------------- */

  /** The subsets. Drawn as the brand's notched folder shape, never underline. */
  tabs?: CollectionFrameTab[];
  /** Controlled tab. */
  tab?: string;
  /** Uncontrolled first tab. */
  defaultTab?: string;
  /** The tab belongs in the URL — this is where a route writes it. */
  onTabChange?: (value: string) => void;
  /** Accessible name for the strip. */
  tabsLabel?: string;
  /**
   * NO TAB-SHAPE PROP, AND THAT IS THE ENFORCEMENT.
   *
   * `SHELL.md`: "TWO TAB SHAPES, NEVER MIXED, NEVER A THIRD ROW — folder tabs
   * … they cut a collection into subsets. Underline — plain 2px charcoal.
   * Record sub-views and Settings." A main screen's `tabs` cut a collection,
   * so they are always the folder shape and there is no way to ask for the
   * other one here.
   *
   * The kit's two underline users are both served without one: a record's
   * sub-views are `DetailScreen`'s, and a Settings screen's strip switches
   * which panel is on screen rather than which subset of a collection is —
   * so it is `Tabs` in that screen's own BODY, drawn on the body pane exactly
   * where a record's strip is drawn. `password-security.tsx` says so at its
   * return. A prop here would have been an escape hatch with no caller and
   * the "never mixed" rule one keystroke away.
   */

  /** The toolbar's search field. First slot, always. */
  search?: React.ReactNode;
  /** The facets. Second slot. */
  filters?: React.ReactNode;
  /** The period stepper (override 28). Third slot. */
  period?: React.ReactNode;
  /** The view switch. Fourth slot. */
  viewSwitch?: React.ReactNode;
  /**
   * The toolbar's own actions, pinned to the inline end — including the
   * collection's CHARCOAL `+`. The header's mango and this one are the two
   * plus buttons, and only one of them is mango.
   */
  toolbarActions?: React.ReactNode;
  /**
   * How many toolbar actions stay standing before the rest fold into the
   * `···` well. `CollectionFrame`'s rule and its figure of 3; forwarded so a
   * panel with four controls does not grow a fourth pill.
   */
  maxActions?: number;

  /** The rows, the board, the calendar — whatever the collection's view is. */
  body?: React.ReactNode;
  /** A band above the toolbar, inside the panel. Only Archive draws one. */
  band?: React.ReactNode;

  /**
   * WHETHER THE BODY STANDS IN THE SOFT-PAPER PANEL, AND WHY IT IS A CHOICE.
   *
   * Level 4 of the nesting is "the collection / the record body" — a screen
   * that HAS a collection puts it in a panel, and the toolbar and the folder
   * tabs are that panel's own first rows. A main screen whose body is not a
   * collection has no panel: its cards stand directly on the off-beige body
   * pane, which is exactly what the dashboard (27.11) draws and what the
   * portal's landing screen draws.
   *
   * `false` therefore places `body` on the body pane and renders NO
   * `CollectionFrame` at all — no panel, and with it no toolbar and no folder
   * tabs, because all three belong to the level that is not there. Passing
   * `tabs` or a toolbar slot alongside `panel={false}` is a call-site error
   * and those nodes are dropped rather than re-homed somewhere they are not
   * drawn.
   *
   * The figure strip is unaffected: it lies bare on the body pane either way.
   */
  panel?: boolean;

  /** Loading, empty or error. A state swaps the BODY; nothing else moves. */
  state?: ShapeState;

  /* ---- The three state bodies -------------------------------------------
     A state is a BODY SWAP (ch27 law 4) and the register that fills the body
     is `ShapeStateBody`'s, never a second one invented here. These three
     slots exist so the shape that owns a screen's words — `CollectionScreen`,
     and only it so far — can hand its own register down without reaching
     around this file into `CollectionFrame`. Omitted, `CollectionFrame`'s own
     default register is drawn, which is right for a route with nothing to
     say. Nothing about the shell, the header band, the figures or the tabs
     moves in any of the three: that is the whole of law 4. */

  /** The body while it is unfilled. ch27.6 wants the SAME body, not a spinner. */
  loadingBody?: React.ReactNode;
  /** Announced while it is unfilled. Never drawn. */
  loadingLabel?: string;
  /** The register for "nothing here yet" — or for "your filter excluded it". */
  emptyBody?: React.ReactNode;
  /** The register for a block failure (ruling 06). */
  errorBody?: React.ReactNode;
}

/**
 * A main screen: the shell, an eyebrow and a title in the header band, the
 * figures bare on the body pane, folder tabs, and one panel under them.
 *
 * TEN STATES
 *  1. default        — as above.
 *  2. hover          — none of this file's. The rail's items, the tabs and
 *                      the toolbar's buttons own theirs.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by the controls.
 *  5. disabled       — does not apply, anywhere. A reader who may not create
 *                      gets NO `+` (ch24.6 hides, never dims), and a reader
 *                      who may not act gets `actionsVisible={false}`.
 *  6. loading        — `state="loading"`: the BODY unfills. Law 4 — the rail,
 *                      the header band, the figures and the tabs stay drawn
 *                      and stay put, so this shape passes the state down and
 *                      never replaces itself.
 *  7. empty          — `state="empty"`, same mechanism. A count of zero still
 *                      renders as nothing rather than "0" (`Badge`'s rule).
 *  8. error          — `state="error"`, same mechanism, ruling 06's sentence.
 *  9. rtl            — every inset is logical; nothing here names a side.
 * 10. dark           — every fill is a token, and the four levels alternate
 *                      exactly as they do in light.
 *
 * THREE BREAKPOINTS
 *  mobile  — no rail, no header controls, no mango `+`. Every figure and
 *            every count stays.
 *  tablet  — the rail arrives; the header's controls come back at `sm`.
 *  desktop — unchanged; only the shell's inset steps up.
 */
function MainScreen({
  door = "system",
  density,
  rail,
  railLabel,
  spine,
  page,
  ambient,
  eyebrow,
  title,
  headingAs,
  meta,
  actions,
  actionsVisible = true,
  narrowActions = false,
  onCreate,
  createLabel = "Add a record",
  figures,
  figuresLabel,
  figuresVisible = true,
  figuresSurface = "bare",
  figureStrip,
  tabs,
  tab,
  defaultTab,
  onTabChange,
  tabsLabel,
  search,
  filters,
  period,
  viewSwitch,
  toolbarActions,
  maxActions,
  body,
  band,
  panel = true,
  state = "ready",
  loadingBody,
  loadingLabel,
  emptyBody,
  errorBody,
  className,
  ...props
}: MainScreenProps) {
  const measure: ScreenDensity = density ?? (door === "portal" ? "calm" : "comfortable");

  /* THE ONE MANGO. Glyph, never the word; icon-sized, so it is the circle the
     kit draws rather than a pill with a plus in it. No control at all when no
     handler arrives — Archive, Activity log and Link sent. */
  const create =
    onCreate === undefined ? null : (
      <Button size="icon" onClick={onCreate} aria-label={createLabel}>
        <Plus aria-hidden="true" />
      </Button>
    );

  /* THE FIGURE STRIP LIES BARE. Not a decision a call site gets to make. */
  const strip =
    figureStrip ??
    (figures === undefined || figures.length === 0 ? undefined : (
      <StatStrip
        figures={figures}
        visible={figuresVisible}
        surface={figuresSurface}
        label={figuresLabel}
        state={state}
      />
    ));

  const headerActions =
    !actionsVisible || (actions === undefined && create === null) ? undefined : (
      <span
        data-slot="main-screen-actions"
        /* Dropped narrow, kept from `sm` — "drops controls, never counts". */
        className={narrowActions ? "flex items-center gap-3" : "hidden items-center gap-3 sm:flex"}
      >
        {actions}
        {create}
      </span>
    );

  return (
    <ScreenShell
      data-slot="main-screen"
      data-screen="main"
      data-door={door}
      density={measure}
      rail={rail}
      railLabel={railLabel}
      spine={spine}
      page={page}
      ambient={ambient}
      className={className}
      header={
        /* THE HEADER BAND IS NOT A CONTAINER — `rule={false}` keeps the
           hairline off it. Colour separates; strokes don't. */
        <div className="flex min-w-0 flex-col gap-3">
          <Title
            data-slot="main-screen-heading"
            eyebrow={eyebrow}
            size={SHAPE_HEADING_SIZE[measure]}
            as={headingAs}
            rule={false}
            actions={headerActions}
          >
            {title}
          </Title>
          {/* BARE. No fill, no radius, no rule — the header band is not a
              container and neither is the line under its heading. */}
          {meta === undefined ? null : (
            <Text as="p" size="sm" tone="secondary">
              {meta}
            </Text>
          )}
        </div>
      }
      {...props}
    >
      {/* THE BODY PANE'S CONTENTS.

          WITH A PANEL (the ordinary case): `CollectionFrame` draws the strip,
          the folder tabs and the one soft-paper panel with the toolbar as its
          first row. `tone="bare"` and `inset={false}` because the pane is
          already the off-beige ground and has already paid for the air — a
          second fill and a second inset would be a level of the nesting that
          is not there.

          WITHOUT ONE: the figures and the body stand straight on the pane,
          which is level 4 being ABSENT rather than transparent. There is no
          collection on a screen like that, so there is no panel, no toolbar
          and no folder tab either. */}
      {!panel ? (
        <div data-slot="main-screen-bare" className="flex min-w-0 flex-col gap-6">
          {strip}
          {body}
        </div>
      ) : (
      <CollectionFrame
        data-slot="main-screen-collection"
        tone="bare"
        inset={false}
        density={measure === "calm" ? "compact" : "default"}
        tabsVariant="folder"
        figures={strip}
        tabs={tabs}
        value={tab}
        defaultValue={defaultTab}
        onValueChange={onTabChange}
        tabsLabel={tabsLabel}
        band={band}
        search={search}
        filters={filters}
        period={period}
        viewSwitch={viewSwitch}
        actions={toolbarActions}
        maxActions={maxActions}
        loading={state === "loading"}
        loadingState={loadingBody}
        loadingLabel={loadingLabel}
        empty={state === "empty"}
        emptyState={emptyBody}
        error={state === "error"}
        errorState={errorBody}
      >
        {body}
      </CollectionFrame>
      )}
    </ScreenShell>
  );
}

MainScreen.displayName = "MainScreen";

export { MainScreen };
