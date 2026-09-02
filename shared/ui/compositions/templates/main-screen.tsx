"use client";

/* ============================================================================
   MainScreen — A DEPRECATED ADAPTER OVER `ScreenShell`. IT HOLDS NO DESIGN.

   ─────────────────────────────────────────────────────────────────────────
   COLLAPSED 2026-09-02, ON A CLIENT RULING. READ `screen-shell.tsx` INSTEAD.
   ─────────────────────────────────────────────────────────────────────────
   The client, verbatim: "Let's completely get rid of these three variations.
   Let's just do one shell, and then let's just explain that there are
   variations for the title if it's main screen with no parents or not. Also,
   just define which pages have a footer."

   She asked for the proposal to be validated rather than agreed with, and
   this file's own header was the strongest evidence FOR it. It used to open
   by saying a main screen and a detail screen "differ in EXACTLY THREE
   PLACES", and then, four lines later: "THE SHELL AND THE RAIL ARE IDENTICAL
   TO A DETAIL SCREEN'S. Neither file draws either one: `ScreenShell` does,
   once, and both hand it the same rail." A file that says it differs from
   another file in three named places, and is otherwise the same call to the
   same shape, is one of two spellings of one screen.

   SO EVERY RULING THIS HEADER CARRIED HAS MOVED, NOT BEEN DELETED. Each one
   is now in `screen-shell.tsx`, in the section named here, unabridged:

     · the client's own naming test — "a main screen is in the navbar; a
       detail screen has breadcrumbs" — and why the word in the code is
       `main`                                    → THE COLLAPSE block
     · the eyebrow, and what override 73 did to a record's half of it
                                                 → the `eyebrow` prop
     · the two plus buttons, two colours, and which one this level owns
                                                 → THE ONE MANGO
     · the four-reason argument that the header's `+` stays mango on the
       mango spine, and the one question it leaves open
                                                 → THE ONE MANGO
     · "create is always the glyph, never the word", and the one screen the
       kit exempts                               → THE ONE MANGO
     · no mango at all on Archive, Activity log and Link sent
                                                 → THE ONE MANGO
     · the figure strip lies BARE on the body pane, the dashboard is the one
       exception, and why it is DATA and not a slot
                                                 → THE FOURTH VARIABLE
     · the header band is not a container; `Title rule={false}`
                                                 → the band, in the render
     · NO FOOTER, EVER, on a main screen         → the `footer` prop
     · "drops controls, never counts" at the narrow width
                                                 → NARROW

   TWO OF THIS FILE'S OWN RULES ARE GONE RATHER THAN MOVED, AND BOTH DIED THE
   SAME DAY FOR THE SAME REASON.

     · THE TABS RULE. This file used to argue at length that there is no
       tab-SHAPE prop here, because a main screen's tabs "cut a collection"
       and are therefore always the folder shape. The client retired the
       folder tab VARIANT on 2026-09-02 — there is one tab shape now and the
       folder silhouette belongs to the breadcrumb — so the argument has no
       subject. `tabsVariant` is gone from `CollectionFrame` with it and this
       file no longer passes it.
     · "NO FOOTER SLOT ON THIS SHAPE, AND THAT IS THE ENFORCEMENT." It was a
       real enforcement and it is now a real loss: the one shell has a
       `footer` slot and a collection can reach it. `SHELL.md` still records
       the charcoal footer on "zero main screens", and it is now a rule a
       review reads rather than a rule the type system holds. That is the
       price of one shell and the client named it: "just define which pages
       have a footer" is a declaration, and a declaration you can make is a
       declaration you can make wrongly.

   WHY THE FILE STILL EXISTS. It holds no design; it maps old prop names onto
   the shell's slots. Nineteen call sites in this repo import `MainScreen` or
   `DetailScreen`, and the kit is vendored into two applications this
   repository cannot see — the same argument `screen-shell.tsx` already makes
   for `Rail.collapsible`. Deleting the two exports is a one-line change to
   `index.ts` plus nineteen mechanical rewrites, and it is logged as owed.

   WHAT A CALLER GETS THAT IS DIFFERENT, AND IT IS SHORT
   Nothing about this file's PROPS changed. Two things about the RENDER did:
   the figure strip is now placed by the shell rather than by
   `CollectionFrame` (same place on the screen, one level up in the markup,
   and the gap between it and the panel is the shell's `--space-6`/`--space-5`
   rather than the frame's), and the heading's step is now derived from
   `breadcrumbDepth` rather than fixed at the door's — which changes nothing
   for a screen that passes no breadcrumb, because the default depth is 1.

   RENDERING CONTEXT
   `"use client"`. `CollectionFrame`'s tabs are a client component; this
   module holds no state of its own.
   ========================================================================= */

import * as React from "react";

import {
  CollectionFrame,
  type CollectionFrameTab,
} from "../../components/collection-frame/collection-frame";
import { ScreenShell, type ScreenSpine } from "./screen-shell";
import type { StatStripFigure } from "./stat-strip";
import type { ScreenDensity, ShapeState } from "../states/states";

export interface MainScreenProps
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
  /** The decorative field. Ruling 05/06 scopes it to three screens. */
  ambient?: React.ReactNode;
  /** The trail, on the ground above the card. A plain node. */
  breadcrumb?: React.ReactNode;
  /** How many levels it has. Decides the title's step. See the shell. */
  breadcrumbDepth?: number;

  /* ---- The header band. All of these are `ScreenShell` slots now. ------- */

  /** `GROUP · 24 RECORDS` — the scope, then the count. */
  eyebrow?: React.ReactNode;
  /** What the collection is called. */
  title?: React.ReactNode;
  /** The heading's ELEMENT. Its STEP is derived; see `breadcrumbDepth`. */
  headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div";
  /** The quiet line under the heading. Lies bare. */
  meta?: React.ReactNode;
  /** The band's secondary controls — paper pills. The mango is `onCreate`'s. */
  actions?: React.ReactNode;
  /** The reader may act. `false` draws NO actions, never a disabled one. */
  actionsVisible?: boolean;
  /** Whether the band's controls survive the narrow width. Off by default. */
  narrowActions?: boolean;
  /** The screen's one mango, as an unlabelled `+`. Omit it and none is drawn. */
  onCreate?: () => void;
  /** What a screen reader hears on the `+`. */
  createLabel?: string;

  /* ---- The body pane ---------------------------------------------------- */

  /** The figures. DATA, and the shell keeps them bare. */
  figures?: readonly StatStripFigure[];
  /** Accessible name for the strip. */
  figuresLabel?: string;
  /** The reader may see the figures at all. */
  figuresVisible?: boolean;
  /** The dashboard's one legal exception (27.11). Nothing else may pass it. */
  figuresSurface?: "bare" | "card";
  /** A strip a route drew itself. Rendered instead of `figures`. */
  figureStrip?: React.ReactNode;

  /** The subsets, as `CollectionFrame`'s tabs. */
  tabs?: CollectionFrameTab[];
  /** Controlled tab. */
  tab?: string;
  /** Uncontrolled first tab. */
  defaultTab?: string;
  /** The tab belongs in the URL — this is where a route writes it. */
  onTabChange?: (value: string) => void;
  /** Accessible name for the strip. */
  tabsLabel?: string;

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
   * collection's CHARCOAL `+`. The band's mango and this one are the two plus
   * buttons, and only one of them is mango.
   */
  toolbarActions?: React.ReactNode;
  /** How many toolbar actions stay standing before the rest fold. */
  maxActions?: number;

  /** The rows, the board, the calendar — whatever the collection's view is. */
  body?: React.ReactNode;
  /** A band above the toolbar, inside the panel. Only Archive draws one. */
  band?: React.ReactNode;

  /**
   * WHETHER THE BODY STANDS IN THE SOFT-PAPER PANEL.
   *
   * A screen that HAS a collection puts it in a panel, and the toolbar and
   * the tabs are that panel's own first rows. A screen whose body is not a
   * collection has no panel: its cards stand directly on the card's body
   * pane, which is what the dashboard (27.11) and the portal's landing screen
   * draw. `false` therefore renders NO `CollectionFrame` at all — no panel,
   * no toolbar, no tabs, because all three belong to the level that is not
   * there — and passing `tabs` or a toolbar slot alongside it is a call-site
   * error whose nodes are dropped rather than re-homed.
   *
   * The figure strip is unaffected: it is the shell's, and lies bare either
   * way.
   */
  panel?: boolean;

  /** Loading, empty or error. A state swaps the BODY; nothing else moves. */
  state?: ShapeState;

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
 * A collection screen: `ScreenShell` with a `CollectionFrame` in its body.
 *
 * TEN STATES
 *  1. default        — the shell's band and figures, then one panel with the
 *                      toolbar as its first row.
 *  2. hover          — none of this file's. It draws no control at all.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by the controls.
 *  5. disabled       — does not apply, anywhere. A reader who may not create
 *                      gets NO `+` (ch24.6 hides, never dims), and a reader
 *                      who may not act gets `actionsVisible={false}`.
 *  6. loading        — `state="loading"`: the BODY unfills. Law 4 — the rail,
 *                      the band, the figures and the tabs stay drawn and stay
 *                      put, so this file passes the state down and never
 *                      replaces itself.
 *  7. empty          — `state="empty"`, same mechanism. A count of zero still
 *                      renders as nothing rather than "0" (`Badge`'s rule).
 *  8. error          — `state="error"`, same mechanism, ruling 06's sentence.
 *  9. rtl            — nothing here names a side; the shell's insets are all
 *                      logical.
 * 10. dark           — every fill is a token, and the levels alternate exactly
 *                      as they do in light.
 *
 * THREE BREAKPOINTS
 *  mobile  — no rail, no band controls, no mango. Every figure and every
 *            count stays. All of it is the shell's.
 *  tablet  — the rail arrives; the band's controls come back at `sm`.
 *  desktop — unchanged; only the shell's inset steps up.
 *
 * @deprecated Compose `ScreenShell` directly. This file maps old prop names
 * onto its slots and decides nothing; see its header for where each ruling
 * now lives.
 */
function MainScreen({
  door = "system",
  density,
  rail,
  railLabel,
  spine,
  page,
  ambient,
  breadcrumb,
  breadcrumbDepth,
  eyebrow,
  title,
  headingAs,
  meta,
  actions,
  actionsVisible,
  narrowActions,
  onCreate,
  createLabel,
  figures,
  figuresLabel,
  figuresVisible,
  figuresSurface,
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
      breadcrumb={breadcrumb}
      breadcrumbDepth={breadcrumbDepth}
      className={className}
      eyebrow={eyebrow}
      title={title}
      headingAs={headingAs}
      meta={meta}
      actions={actions}
      actionsVisible={actionsVisible}
      narrowActions={narrowActions}
      onCreate={onCreate}
      createLabel={createLabel}
      figures={figures}
      figuresLabel={figuresLabel}
      figuresVisible={figuresVisible}
      figuresSurface={figuresSurface}
      figureStrip={figureStrip}
      state={state}
      {...props}
    >
      {/* WITH A PANEL (the ordinary case): `CollectionFrame` draws the tabs
          and the one soft-paper panel with the toolbar as its first row.
          `tone="bare"` and `inset={false}` because the body pane is already
          the card's tone and has already paid for the air — a second fill and
          a second inset would be a level of the nesting that is not there.

          NO `figures` REACH IT ANY MORE. The strip is the shell's slot since
          the collapse, so it stands above this frame rather than inside it,
          which is the same place on the screen and one level up in the
          markup.

          NO `tabsVariant` EITHER: the client retired the folder tab variant
          on 2026-09-02 and `CollectionFrame` has no such prop. */}
      {!panel ? (
        body
      ) : (
        <CollectionFrame
          data-slot="main-screen-collection"
          tone="bare"
          inset={false}
          density={measure === "calm" ? "compact" : "default"}
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
