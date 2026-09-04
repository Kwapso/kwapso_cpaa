/* ============================================================================
   CollectionFrame — the shell every list sits in: eyebrow, heading, count,
   figure strip, tabs, and ONE PANEL holding toolbar, rows and pager
   (1 direct call site).

   CLIENT RULING J2 · 2026-08-22 · override register #11 — HALF SPENT ON
   2026-09-02, AND THE OTHER HALF MOVED. Read both paragraphs before restoring
   anything.

   J2 said "a folder tab attaches to a panel", because ruling E had put the
   brand folder shape on every main screen and a folder tab is drawn to be
   pulled DOWN under a panel by `--folder-tab-overlap` and filled with the
   panel's own colour — without a panel it is a shape joined to nothing. THIS
   FRAME NO LONGER DRAWS A FOLDER TAB. The client retired the variant on
   2026-09-02 ("the only tabs that we will have are the line tabs because
   folders will only be used for the breadcrumbs"), so the strip here is a
   `line` strip, attached to nothing by design, and J2's attachment rule has
   nothing to govern in this file. It governs
   `components/breadcrumbs/breadcrumb-folders.tsx` instead, which is the one
   folder strip left and the only place the overlap is still drawn.

   WHAT SURVIVES J2 HERE IS THE ONE PANEL. CH27.1 states the region order and
   the container in one sentence, verbatim:

       "Figures, folder tabs, then the collection panel — toolbar, rows, pager
        inside it. A collection may drop the figure strip; it may not reorder
        what remains, and filters never sit above the tabs."

   The chapter's word for the strip is stale by one client ruling; its ORDER
   and its ONE CONTAINER are not. The toolbar, the body and whatever pager the
   body carries are still not three sibling bands: they are ONE panel,
   `--surface-panel` at `--radius`. What changed is the seam above it — the
   strip and the panel take the frame's ordinary band gap now, because a line
   strip has no feet to hide.

   OVERRIDE 15 WAS REVERSED ON 2026-08-23. READ THIS BEFORE CHANGING A FILL.

   Ruling K1 pinned this panel to `--card`, the off-beige paper. The client's
   own reference pages reverse it, in three independent places:

     · 26.04, verbatim: "The page itself is off-beige and every panel on it is
       soft paper: never the other way round."
     · the active folder tab's fill was `#F7F2EB`, and CH14's rule is that the
       active tab takes the panel's own fill — so the panel is soft paper.
       (The folder tab is retired; the reading it produced still stands, and
       the breadcrumb strip's live tab makes the same argument today.)
     · the client's own screenshots of both doors.

   A design-lead flip was made on their instruction to match the kit exactly.
   The nesting the whole system now alternates on is `SHELL.md`'s four levels:

       off-beige PAGE  →  soft-paper SCREEN CARD  →  off-beige BODY PANE
         →  soft-paper PANEL (this file)  →  off-beige CARDS

   Two things keep the panel readable, and both are load-bearing. (There were
   three; the first was the rebinding that made the folder tab's fill and this
   panel's fill one colour, and it went with the folder tab on 2026-09-02.)
     · The panel's ground is the BODY PANE, off-beige — the frame's own fill
       at `tone="page"`, which is now the default. In light the panel is
       #F7F2EB and the ground is #FFFEF9; without that ground the panel would
       be invisible and there would be nothing for an inactive tab to be
       clipped against. (Before the reversal these two were the other way
       round, which is what `ScreenShell`'s missing body pane was hiding.)
     · Nothing is separated by a stroke. There is no `border` here, and no
       hairline either: the panel is told apart from its ground by colour, as
       CH13's subtitle demands ("Colour separates, strokes don't").

   The panel keeps chapter 24.3's middle z-index, 2. The 1 and the 3 around it
   were the inactive and active folder tabs' and are gone from this file; the
   breadcrumb strip keeps all three.

   DESIGN SOURCE
   Kit "Assembled screens → List / collection page", read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. Its own paragraph is
   the whole brief, verbatim:

       "Every collection screen shares this anatomy: eyebrow + title, optional
        figure strip, tabs, then one shared toolbar (search, filters, view
        switch, actions) above a swappable body. Only the body changes between
        a list, a board, a calendar, and so on."

   and the dev note under it, also verbatim, is the law this file enforces:

       "Toolbar order never changes: search, then filters, then view switcher,
        then actions pinned right. … The 4th+ action collapses under a '···'
        icon button rather than adding more pills."

   OVERRIDE 28 (2026-08-23) — THE CONTRACT CAN GROW A SLOT, AND THIS IS THE
   PRECEDENT. SAY IT OUT LOUD, BECAUSE IT IS THE CONSEQUENCE OF THE RULING.

   CH27.26 draws a period stepper — `‹ 6 weeks ›` — INSIDE this toolbar,
   between the search field and the view switch. The contract above fixes the
   slots and adds "only the body below the toolbar changes", and GAPS-TRACK2A
   calls this "the one place the seven views touch the toolbar contract at
   all". The client ruled for CH27.26's placement, so the stepper is in the
   toolbar and THE CONTRACT GREW A FIFTH SLOT to hold it. What that settles,
   and what a future reader must not un-settle by "correcting" this file back:

       The toolbar's ORDER is still absolute and still the component's, not
       the call site's. What is no longer closed is the LIST. A slot may be
       ADDED when a chapter draws a control in this toolbar that none of the
       existing slots describes — and it is added HERE, as its own named prop
       in a fixed position, never by letting a call site smuggle a control
       into `filters` and hope. Before this ruling, the artifact's own
       placement was only reachable by exactly that smuggling.

       A slot is still a PLACEMENT AND NOT A DRAWING. `period` renders the
       node it is handed and styles nothing, the way `band` does. The stepper
       itself is drawn by `gantt.tsx`, which is where CH27.26 is transcribed.

   The order is now: search → filters → PERIOD → view switch → actions.

   THE PRECEDENT WAS USED A SECOND TIME ON 2026-09-02, and this is the note
   that says so rather than leaving a reader to wonder whether `toolbarPanel`
   was smuggled in. The slot that grew is not inside the toolbar row — it is
   BETWEEN the toolbar and the rows. CH27.1's sentence fixes the REGIONS
   ("toolbar, rows, pager inside it"), and the client's ruling of the same day
   ("the expanded toolbar shoudl not be an overlay, but literaly expand the
   space") requires a place in flow for what a toolbar control opens. There
   was none, so hosts were portalling into the panel's body. One named slot,
   in one fixed position, drawn only when passed — the same three conditions
   override 28 set. The region order inside the panel is now:

       band → toolbar → TOOLBAR PANEL → rows → pager

   and, as before, the ORDER is the component's and the DRAWING is not.

   The same toolbar is drawn again in kit chapter 19 ("Collection views · 24
   view types · one toolbar contract"), where the hairline rule between the
   toolbar groups is a 1-wide, 22-tall bar at 14% ink — this file uses
   `Separator orientation="vertical"`, which is the same rule at `--border`.

   The two registers are the kit's own:
     · `kwapso-ui.css` → `.kw-empty` — the in-place register: centred column,
       gap 8, inset 48/24, tertiary ink, body-s, centred text.
     · `kwapso-patterns.css` → `.kw-register` — the block register: panel
       fill, box radius, inset 32, eyebrow / title / body / action row.
   Chapter 21's subtitle is the rule they both obey: "Say what happened, then
   the one next step."

   THE LAW THIS FILE OBEYS
   · The frame's ground is `--background`, not `--surface-panel` — the K1
     reversal, and the opposite of what this line said until 2026-08-23. The
     frame does not hold cards directly: it holds ONE PANEL, and that panel is
     soft paper, so the ground under it has to be the other tone or the panel
     is invisible. PATTERN §11's rule — a card's ground is the panel tone — is
     unchanged and now applies one level further in, INSIDE the panel, which
     is where the cards actually are.
   · A band states which paper tone it is, and the secondary-button and pill
     fills re-resolve inside it — kwapso-ui.css's `.kw-on-panel` /
     `.kw-on-page`, the provisional GAP-10 mechanism. Carried here as two
     custom properties set on the root, so a `Button variant="secondary"`
     inside the frame is never the same tone as the frame. THE PANEL SETS THEM
     AGAIN, because a control in the toolbar stands on the panel and not on
     the frame: ruling 01 is relational — "a filled paper button in the other
     tone, so a band and its buttons are never the same tone" — and CH27.1
     draws that same opposition on this very toolbar ("both keeping their
     round off-beige well, which is what makes them read as buttons on a
     soft-paper toolbar").
   · The toolbar order is fixed by the component, not by the call site. That
     is the entire reason the search, filter and view-switch slots are three
     separate props instead of one `toolbar` node.
   · An unqualified `<Badge>` is quiet. The record count is a quiet chip;
     mango is opt-in and one per view.
   · Blocks are separated by colour, not by strokes. The one hairline here is
     `Title`'s own section rule, which is same-tone separation.
   · Focus is one global rule (tokens.css §8). Nothing here draws a ring.
   · Every user-facing string is a prop with a default, including the two the
     screen reader hears and the eye never does.

   RENDERING CONTEXT
   No `"use client"`. This module holds no state, calls no hook and creates no
   handler during its own render — it forwards nodes and props. `Tabs` and
   `DropdownMenu` are themselves client components and carry their own
   directive; a server component may render them unchanged.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Badge } from "../badge/badge";
import { Button } from "../button/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../dropdown-menu/dropdown-menu";
import { Separator } from "../separator/separator";
import { Spinner } from "../spinner/spinner";
import { Tabs, TabsCount, TabsList, TabsTrigger, TABS_STRIP_GAP } from "../tabs/tabs";
import { Title } from "../title/title";
import { DotsThree } from "../../foundations/icons";

/* ============================================================================
   CollectionRegister — the empty / error / busy notice a collection shows
   instead of its body.

   Exported because all nine collections in this batch need the identical
   picture and nine private copies of it is nine chances to drift. It is an
   ADDITION to the commission's export list, not a rename or a drop of one;
   logged as GAPS-COL1 CF-1.
   ========================================================================= */

const registerVariants = cva(["flex min-w-0 flex-col"], {
  variants: {
    /**
     * `inline` — `.kw-empty`: the register drawn IN PLACE of a body, inside a
     * frame that already carries the panel tone. Centred, tertiary, no fill
     * of its own, because a panel-toned card on a panel-toned band is
     * invisible in light (PATTERN §11).
     *
     * `block` — `.kw-register`: the standalone block, panel fill at the box
     * radius, inset 32, left-aligned. For a register that is the whole
     * region rather than a hole inside one.
     */
    variant: {
      /* Left-aligned, not centred. 27.21: "Type and one button carry it,
         left-aligned like everything else." The artifact writes `text-align`
         it 110 times, but never on one of CH21's four registers, and
         27.21 says left in words -- the centring was ours, copied into
         eleven registers, and two screens had already worked around it
         locally before it was traced here. GAPS-TRACK3C DEF-2. */
      /* NO `gap` on the column. The three lines carry their own block-start
         measures (12 over the title, 8 over the body, 20 over the action
         row) exactly as chapter 21 draws them; a container gap on top of
         those margins was adding a second 8 to every one of them. */
      inline: "items-start px-6 py-[var(--space-8)] text-start",
      block: "items-start rounded-[var(--radius)] bg-surface-panel p-[var(--space-7)]",
    },
  },
  defaultVariants: { variant: "inline" },
});

/** The 7 status dot — `--dot-status`, the kit's one dot size.
    ONLY THE ERROR REGISTER CARRIES ONE. Chapter 21 draws four registers —
    "First run", "No results", "Load failed", "Permission" — and exactly one
    of them, the failure, puts a 7px poppy dot in front of its eyebrow. The
    other three are the bare micro line. A quiet dot in `--ink-disabled` was
    ours; CH01 also reserves that ink for "disabled only". An empty string
    renders no dot at all, the way `busy` already does. */
const DOT_TONE = {
  /** No dot. The wording carries the meaning; ruling 26, and CH21's drawing. */
  quiet: "",
  /** Poppy. Ruling 26 again: the dot names it, the label says it in words. */
  error: "bg-destructive",
  /** A wait is a spinner, not a dot; this value renders no dot at all. */
  busy: "",
} as const;

export type CollectionRegisterTone = keyof typeof DOT_TONE;

export interface CollectionRegisterProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title">,
    VariantProps<typeof registerVariants> {
  /**
   * The micro uppercase line above the title — `.kw-register__eyebrow`. A
   * node, so a `Badge` can ride along. Undefined draws nothing, which is why
   * this component hardcodes no eyebrow of its own.
   */
  eyebrow?: React.ReactNode;
  /** The one sentence that says what happened. `.kw-register__title`. */
  title?: React.ReactNode;
  /** The paragraph under it, capped at the kit's 40ch. `.kw-register__body`. */
  body?: React.ReactNode;
  /** The one next step. Usually a single `Button`. `.kw-register__row`. */
  actions?: React.ReactNode;
  /** Which dot the eyebrow carries, or `busy` for a spinner instead. */
  tone?: CollectionRegisterTone;
  /**
   * What a screen reader says while `tone="busy"`. Defaulted so no call site
   * can ship a silent wait, and a prop because the applications run in more
   * than one language.
   */
  busyLabel?: string;
}

/**
 * The notice a collection shows in place of its body.
 *
 * TEN STATES
 *  1. default        — eyebrow, title, body, actions; any of the four may be
 *                      absent and none is invented.
 *  2. hover          — does not apply. The register is prose; the `Button`
 *                      inside `actions` carries the hover.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply. A notice cannot be unavailable.
 *  6. loading        — `tone="busy"`: the dot is replaced by a `Spinner`.
 *                      This IS the loading register.
 *  7. empty          — every slot undefined renders `null`. The system's rule
 *                      throughout is to render nothing rather than fill a
 *                      hole with a dash.
 *  8. error          — `tone="error"`: poppy dot, and the wording says it.
 *                      The dot never carries the meaning alone (ruling 26).
 *  9. selected       — does not apply.
 * 10. read-only      — always. A register holds no value.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. Both drawings are a single column
 *  at every width and the copy is already capped at 40ch, which is narrower
 *  than a 320 viewport can show; there is nothing left to restack. The action
 *  row wraps rather than stacking, exactly as `CardFooter` does.
 *
 * RTL — safe. Every inset is logical and nothing is positioned by side.
 */
const CollectionRegister = React.forwardRef<HTMLDivElement, CollectionRegisterProps>(
  (
    {
      className,
      variant = "inline",
      eyebrow,
      title,
      body,
      actions,
      tone = "quiet",
      busyLabel = "Loading…",
      children,
      ...props
    },
    ref,
  ) => {
    const hasEyebrow = eyebrow !== undefined && eyebrow !== null;
    const showMark = hasEyebrow || tone === "busy";

    // Prefer nothing (PATTERN §4). An empty register is a hole with an inset.
    if (
      !hasEyebrow &&
      title === undefined &&
      body === undefined &&
      !actions &&
      !children &&
      tone !== "busy"
    ) {
      return null;
    }

    return (
      <div
        ref={ref}
        data-slot="collection-register"
        data-tone={tone}
        className={cn(registerVariants({ variant }), className)}
        {...props}
      >
        {showMark ? (
          <span
            data-slot="collection-register-eyebrow"
            className={cn(
              /* The dot-to-word measure is the drawn 10. */
              "inline-flex items-center gap-[var(--space-2h)]",
              "text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary",
            )}
          >
            {tone === "busy" ? (
              <Spinner size="sm" label={busyLabel} />
            ) : DOT_TONE[tone] ? (
              <span
                aria-hidden="true"
                className={cn(
                  "size-[var(--dot-status)] shrink-0 rounded-pill",
                  DOT_TONE[tone],
                )}
              />
            ) : null}
            {eyebrow}
          </span>
        ) : null}

        {title !== undefined && title !== null ? (
          <div
            data-slot="collection-register-title"
            className={cn(
              // `.kw-register__title` — the h3 step, medium.
              "text-2xl font-[var(--font-weight-medium)]",
              variant === "block" ? "mt-3" : "mt-2",
            )}
          >
            {title}
          </div>
        ) : null}

        {body !== undefined && body !== null ? (
          <p
            data-slot="collection-register-body"
            className="mt-2 max-w-[40ch] text-caption leading-[var(--leading-normal)] text-ink-secondary"
          >
            {body}
          </p>
        ) : null}

        {children}

        {actions ? (
          <div
            data-slot="collection-register-actions"
            /* `gap: 10px`, which chapter 21 draws on every register that
               has more than one control. */
            className="mt-5 flex flex-wrap items-center gap-[var(--space-2h)]"
          >
            {actions}
          </div>
        ) : null}
      </div>
    );
  },
);

CollectionRegister.displayName = "CollectionRegister";

/* ============================================================================
   CollectionFrame
   ========================================================================= */

const collectionFrameVariants = cva(
  [
    // The frame is a column: header, figures, then the tab strip and the one
    // panel that holds the toolbar, the rows and the pager (ruling J2).
    "flex min-w-0 flex-col",
    // The box radius. There is no fifth radius.
    "rounded-[var(--radius)]",
  ],
  {
    variants: {
      /**
       * WHICH PAPER TONE THE FRAME'S GROUND IS — not the panel's. Since
       * ruling J2 the frame is a ground with a `--card` panel on it, so this
       * prop no longer decides what the toolbar and the rows sit on; it
       * decides what the PANEL sits on, and therefore whether the panel and
       * the tabs attached to it can be seen at all.
       *
       * It still re-resolves the secondary-button and pill fills for anything
       * OUTSIDE the panel (the heading band, the figure strip) —
       * kwapso-ui.css's `.kw-on-panel` / `.kw-on-page`, carried as custom
       * properties on the root instead of as a global class, because this
       * repository ships components rather than a stylesheet. GAP-10's
       * provisional mechanism, unchanged; logged as GAPS-COL1 CF-2.
       */
      tone: {
        /**
         * THE DEFAULT SINCE THE K1 REVERSAL. Off-beige — the body pane's own
         * tone, and the ground CH27.1 draws the soft-paper collection panel
         * against. 26.04: "The page itself is off-beige
         * and every panel on it is soft paper: never the other way round."
         *
         * Measured against the panel at #F7F2EB: 1.103 light, 1.111 dark.
         */
        page: [
          "bg-background",
          "[--btn-secondary-fill:var(--surface-panel)]",
          "[--pill-fill:var(--surface-panel)]",
        ],
        /**
         * Soft paper. WAS the default, under ruling K1, and it is now the
         * broken combination rather than the settled one: a soft-paper panel
         * on a soft-paper ground measures 1.000 in both palettes and the panel
         * has nothing to be seen against.
         *
         * Kept as a value, because removing it would change a public prop's
         * accepted set. Do not reach for it: a frame that needs a soft-paper
         * ground is a frame drawn on a screen card, and what it wants is the
         * body pane between them — `ScreenShell`.
         */
        panel: [
          "bg-surface-panel",
          "[--btn-secondary-fill:var(--surface-page)]",
          "[--pill-fill:var(--surface-page)]",
        ],
        /**
         * No fill at all, for a frame nested inside a band that already has
         * one — which since the K1 reversal is the ordinary case: `MainScreen`
         * drops this frame straight into `ScreenShell`'s off-beige body pane,
         * and a second off-beige fill on top of it would be a level of the
         * nesting that is not there.
         *
         * The ground is then the parent's, and the parent is responsible for
         * it being off-beige. That is the one thing `bare` has always meant.
         * GAPS-J2 J2-3.
         */
        bare: "bg-transparent",
      },
      /**
       * How much air the frame spends on itself. The kit draws the collection
       * page at the 24/32 card inset (chapter 5's stated range) and the same
       * anatomy inside a panel at 20.
       */
      density: {
        default: "gap-5 p-6 lg:p-[var(--space-7)]",
        compact: "gap-4 p-5",
      },
      /**
       * Whether the frame spends an inset of its own. `false` is for a frame
       * dropped into a container that has already paid for the air —
       * `ScreenShell`'s body pane — where the frame's own 24/32 would be a
       * second inset the kit never draws. The PANEL's inset is untouched:
       * that one is the card's and it is always spent.
       */
      inset: {
        true: "",
        false: "p-0 lg:p-0",
      },
    },
    defaultVariants: { tone: "page", density: "default", inset: true },
  },
);

/* ----------------------------------------------------------------------------
   THE COLLECTION PANEL — ruling J2.

   CH27.1: "toolbar, rows, pager inside it". One surface, not three bands.

   · `bg-surface-panel` — soft paper, the K1 reversal. CH27.1 and CH14 both
     argue it from the active folder tab's own fill, which this frame no longer
     draws; the fill they argued FOR is unchanged, and the breadcrumb strip's
     live tab now makes the same argument against the screen card.
   · `rounded-[var(--radius)]` — ruling 03: 24, the one box radius.
   · `relative z-[2]` — chapter 24.3's middle number. It used to sit between an
     inactive folder tab (1) and an active one (3); with the folder tab retired
     there is nothing above or below it here, and it is kept because the panel
     is still the frame's own painted layer and a caller may drop positioned
     content on either side of it.
   · The secondary and pill fills re-resolve AGAIN here, because a control in
     the toolbar stands on `--card` and not on the frame's ground. Ruling 01
     is relational, and CH27.1 draws the opposition on this exact toolbar.
   · No `border`, no hairline, no shadow. Colour is the separation (CH13), and
     neither CH27.1 nor CH14 draws a rule or a lift on this panel — CH14's own
     folder PANEL (`FolderPanel`, which is not retired) is a plain fill at 24.
     GAPS-J2 J2-4.
   · No `overflow: hidden`. A clipped panel would shave the global focus ring
     off the first control in the toolbar and off the first and last row.
   -------------------------------------------------------------------------- */
const collectionPanelVariants = cva(
  [
    "relative z-[2] flex min-w-0 flex-col",
    "rounded-[var(--radius)] bg-surface-panel text-foreground",
    /* A control in the toolbar stands on soft paper, so its fill is the other
       tone — off-beige. CH27.1 draws exactly that opposition on this toolbar:
       "both keeping their round off-beige well, which is what makes them read
       as buttons on a soft-paper toolbar". Before the K1 reversal these two
       lines said the opposite, and the toolbar's buttons were soft paper on
       off-beige, which is the sentence backwards. */
    "[--btn-secondary-fill:var(--surface-page)]",
    "[--pill-fill:var(--surface-page)]",
  ],
  {
    variants: {
      /** The card inset, matching the frame's own density step for step. */
      density: {
        default: "gap-5 p-6 lg:p-[var(--space-7)]",
        compact: "gap-4 p-5",
      },
    },
    defaultVariants: { density: "default" },
  },
);

export interface CollectionFrameTab {
  /** The value the strip switches on. Unique within the frame. */
  value: string;
  /** What the tab says. A node, so a count or an icon can ride along. */
  label: React.ReactNode;
  /**
   * A count after the label, drawn by `TabsCount` — R-4a's asymmetric line
   * count: quiet tertiary text at rest, the same round `Badge`-counter fill
   * this frame's own heading count wears on the ACTIVE tab (mango,
   * primary-ink text; `size-*` circle clause reversed 2026-09-03 — see
   * `tabs.tsx`). CH14's alternative quiet number was the FOLDER tab's, and it
   * left with the folder variant on 2026-09-02. Zero renders nothing.
   */
  count?: number;
  /** Dead tab: an ink and a cursor, never an opacity. */
  disabled?: boolean;
}

export interface CollectionFrameProps
  extends Omit<React.ComponentPropsWithoutRef<"section">, "onChange">,
    VariantProps<typeof collectionFrameVariants> {
  /** The micro uppercase line over the heading. The kit's own example is a count and a state. */
  eyebrow?: React.ReactNode;
  /** The heading. A node, not a string, so it hardcodes nothing. */
  heading?: React.ReactNode;
  /** The heading step. `Title`'s ladder: 32 / 24 / 20. */
  headingSize?: "h2" | "h3" | "h4";
  /** The heading element, so a page keeps a real outline. */
  headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div";
  /**
   * How many records the collection holds. Rendered as a quiet `Badge` beside
   * the heading. Zero, negative or `undefined` renders nothing — the kit never
   * shows a "0" chip.
   */
  count?: number;
  /** Screen-reader wording for the count chip, so "8" is not read bare. */
  countLabel?: string;
  /** Replace the count formatter entirely, for a locale the two suffixes cannot express. */
  formatCount?: (value: number) => string;
  /** The heavy hairline under the heading row. On, as chapter 13 draws it. */
  rule?: boolean;

  /** The optional figure strip between the heading and the tabs. Usually a `StatGrid`. */
  figures?: React.ReactNode;

  /** The tab strip. An empty array renders no strip at all. */
  tabs?: CollectionFrameTab[];
  /** Controlled tab value. */
  value?: string;
  /** Uncontrolled starting tab. Defaults to the first item. */
  defaultValue?: string;
  /** Fires when the reader picks a tab. */
  onValueChange?: (value: string) => void;
  /* `tabsVariant` IS GONE — CLIENT RULING, 2026-09-02. "the only tabs that we
     will have are the line tabs because folders will only be used for the
     breadcrumbs." It defaulted to `folder` under ruling E of 2026-08-22
     ("folder tabs are for main screens, line tabs for detail screens"), which
     that ruling replaces: there is one tab shape now, so a frame has nothing
     to choose and a prop offering the choice would be a lever with nothing on
     the other end. `Tabs` draws the strip; this frame states no variant. */
  /** Accessible name for the strip. Undefined leaves it named by the heading. */
  tabsLabel?: string;

  /**
   * ONE LINE OF STANDING, INSIDE THE PANEL AND ABOVE THE TOOLBAR — CH27.5.
   *
   * The archive tab is the only composition in the kit that draws one:
   * "one extra band saying where you are". The artifact renders it as the
   * FIRST CHILD OF THE PANEL, before the toolbar row — not as a band between
   * the tab strip and the panel. That placement was impossible under ruling
   * J2, when the folder tab's foot rode on the panel's top edge and anything
   * in the gap broke the join; it is merely wrong now, because CH27.5 draws
   * the band inside the panel and the artifact is the reference.
   *
   * A placement slot, not a drawing: the frame decides only WHERE it sits.
   * The words, their steps and their inks belong to the composition, which
   * is why nothing here styles the node.
   *
   * CH27.1's bulk bar is NOT this. That one is the toolbar's own
   * replacement — the artifact wraps the two in `sc-if cpAnySel` /
   * `sc-if cpNoneSel`, so they are alternatives at one position, never two
   * rows at once. `BulkEditScreen`'s own note says the same: "row and no
   * second band appears."
   */
  band?: React.ReactNode;

  /** Toolbar slot 1. Usually a `SearchInput`. */
  search?: React.ReactNode;
  /** Toolbar slot 2. Usually a `FilterBar`. */
  filters?: React.ReactNode;
  /**
   * TOOLBAR SLOT 3 — THE PERIOD STEPPER. CH27.26's `‹ 6 weeks ›`, between the
   * search field and the view switch, exactly where the chapter draws it.
   *
   * This is the slot the contract grew (override 28, 2026-08-23) and the
   * precedent that the contract CAN grow: the order stays the component's,
   * the list is no longer closed. A placement, not a drawing — pass
   * `GanttPeriodStepper`, or a control of your own; nothing here styles it.
   */
  period?: React.ReactNode;
  /**
   * TOOLBAR SLOT 4 — THE VIEW SWITCH. `ViewSwitch`, in this same folder.
   *
   * It was a named hole for as long as this file has existed: the slot was
   * here, CH19's contract was quoted above, and no control was ever drawn to
   * stand in it. Client feedback round 1 item 4 said so — "you missed a full
   * section of the toolbar which is the view selector" — and `view-switch.tsx`
   * is the answer, drawn off CH19's own specimen toolbar and CH27.24's board.
   *
   * Still a placement and not a drawing: the frame decides only WHERE this
   * stands. `SortControl` shares the slot by CH27.13's "the view switcher and
   * the sub-tab picker are controls" — see `collection-screen.tsx`.
   */
  viewSwitch?: React.ReactNode;
  /**
   * Toolbar slot 5, pinned to the inline end. Children past `maxActions`
   * collapse into an overflow menu rather than adding more pills, which is
   * the kit's own dev note.
   */
  actions?: React.ReactNode;
  /** How many actions stay visible before the rest collapse. The kit's figure is 3. */
  maxActions?: number;
  /** Accessible name for the overflow trigger. */
  moreActionsLabel?: string;

  /**
   * WHAT A TOOLBAR CONTROL OPENS — BETWEEN THE TOOLBAR AND THE ROWS, IN FLOW.
   * Added 2026-09-02 on override 28's precedent, which is the second time
   * that precedent has been used and the reason it was written down.
   *
   * CLIENT, 2026-09-02, VERBATIM: "the expanded toolbar shoudl not be an
   * overlay, but literaly expand the space". A filter panel opened off the
   * toolbar's own pill has to PUSH THE ROWS DOWN — not float over them, and
   * not grow the pill it came out of. This frame owns every line of markup
   * between its toolbar and its body, so until this slot existed there was
   * nowhere in flow for such a panel to land: the consuming app wrapped the
   * whole frame in a context provider, published a DOM node as the first
   * child of the body, and `createPortal`'d the panel into it — roughly 90
   * lines of app code, all of it to reach a position this component could
   * simply offer. It offers it.
   *
   * A PLACEMENT, NOT A DRAWING, exactly as `band` and `period` are: the frame
   * decides only WHERE the node sits and gives it the panel's own column gap.
   * Nothing here styles it, sizes it, or animates it — the control that owns
   * the panel owns its skin, and a panel that wants to be an overlay should
   * not be passed here at all.
   *
   * NOT `band`, and the two are not interchangeable. `band` is CH27.5's one
   * line of standing — where you are — and it sits ABOVE the toolbar,
   * permanently. This is what a toolbar control opened, below the toolbar,
   * transiently. A composition may have both.
   *
   * Drawn only when a node is passed, so no existing call site changes.
   */
  toolbarPanel?: React.ReactNode;

  /** The body has not arrived. Shows the busy register in place of `children`. */
  loading?: boolean;
  /** The body arrived and is empty. Shows the empty register in place of `children`. */
  empty?: boolean;
  /** The body failed. Shows the error register in place of `children`. */
  error?: boolean;
  /** Override the busy register. */
  loadingState?: React.ReactNode;
  /** Override the empty register. */
  emptyState?: React.ReactNode;
  /** Override the error register. */
  errorState?: React.ReactNode;
  /** Default wording for the three registers. Every one is overridable. */
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
}

/**
 * The shell every collection sits in.
 *
 * TEN STATES
 *  1. default        — heading band, optional figures, optional tabs, then
 *                      ONE panel holding the optional standing band, the
 *                      toolbar, whatever a toolbar control has opened, the
 *                      rows and the pager (CH27.1, ruling J2, and the second
 *                      use of override 28's precedent). The active tab is
 *                      attached to that panel's top edge; nothing else is a
 *                      band.
 *  2. hover          — does not apply to the frame. It is a band; the rows,
 *                      cards and controls inside it carry their own, and a
 *                      whole reacting panel would be noise.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. NEITHER the frame NOR the
 *                      panel sets `overflow: hidden`, so a ring on the first
 *                      tab, on the search field or on the first row is never
 *                      shaved off at a corner.
 *  4. active/pressed — does not apply. The press belongs to the tab or the
 *                      button, both of which already nudge.
 *  5. disabled       — does not apply to the frame; per tab via
 *                      `tabs[].disabled`, as a fill and an ink. A whole
 *                      collection that is unavailable is a screen the
 *                      composition should not have rendered.
 *  6. loading        — `loading`: the CHROME STAYS and only the body is
 *                      replaced, by the busy register. Swapping the heading
 *                      and the tabs for placeholders moves the controls the
 *                      reader is already aiming at, and the counts they read
 *                      a moment ago.
 *  7. empty          — `empty`: the `.kw-empty` register, centred and quiet.
 *                      Note the kit's own warning next to that class —
 *                      hide-when-empty is a real pattern elsewhere and must
 *                      not be "fixed" into this; a frame that should vanish
 *                      is not mounted by the composition in the first place.
 *  8. error          — `error`: the same register with a poppy dot and its
 *                      own wording. Chapter 21: say what happened, then the
 *                      one next step — which is why the register takes
 *                      `actions` and the default is a single control.
 *  9. selected       — the selected TAB, owned by Radix via `value` /
 *                      `defaultValue` and drawn by the strip's indicator. The
 *                      frame itself is never selected.
 * 10. read-only      — the frame holds no value of its own. A read-only
 *                      collection passes read-only controls into the slots.
 *
 *  Precedence, resolved in JS rather than stacked as classes: loading beats
 *  error beats empty. A request still in flight has not failed yet, and a
 *  request that failed has not come back empty — it has not come back.
 *
 * THREE BREAKPOINTS
 *  THE TOOLBAR IS ONE ROW AT ALL THREE — client, 2026-09-04, and the only
 *  part of this section that is not width-dependent. It is one flex row that
 *  never wraps, made of a scrolling lane (search, filters, period, view
 *  switch) and the action group pinned outside it. Its height is one
 *  control's height at 380, at 834 and at 1440; where the slots need more
 *  width than the panel has, the LANE scrolls and the page does not. The full
 *  reasoning, and the three shapes that were tried and rejected, are on the
 *  row itself.
 *  · mobile (base) — one column throughout. The heading row wraps, so the
 *    header actions drop under the heading rather than squeezing it. In the
 *    toolbar the search field is the elastic slot, floored at `--space-11` so
 *    it cannot be squeezed out of existence, and the rest of the lane is
 *    reached by swiping it. The vertical rules between the toolbar groups are
 *    hidden, because a rule between two groups the reader scrolls past one at
 *    a time is just a mark, and because 39px of rule and gap is a quarter of
 *    the width a 380 phone gives this toolbar. The period stepper's own words
 *    never wrap (`whitespace-nowrap` on the label), so it stays one readable
 *    control at 380 rather than breaking across two lines. Frame inset 24,
 *    panel inset 24 — CH27.1 is explicit that narrow keeps the toolbar and the
 *    panel ("the toolbar is never dropped — it condenses"), so nothing about
 *    the J2 attachment is width-dependent.
 *  · tablet (`sm:`, 40rem) — the rules between the toolbar groups reappear.
 *    This is the width the kit's own toolbar drawing fits at. Frame inset 24,
 *    panel inset 24.
 *  · desktop (`lg:`, 64rem) — unchanged in structure; the frame inset and the
 *    panel inset both step to 32, matching `Card`'s inset response so a frame
 *    and a card inside it stay in register. The tab strip never wraps at any
 *    width; it scrolls, which is `TabsList`'s own stated behaviour — and the
 *    panel it is attached to does not scroll with it, so a strip scrolled to
 *    its end still meets the same edge.
 *
 * RTL — safe, and unused: the system is LTR only. Every inset is logical
 * (`px-*` is padding-inline), the action group is pushed with `ms-auto`
 * rather than a physical margin, and nothing here names a side.
 */
const CollectionFrame = React.forwardRef<HTMLElement, CollectionFrameProps>(
  (
    {
      className,
      /* K1 REVERSED — off-beige is the ground, soft paper is the panel. */
      tone = "page",
      density = "default",
      inset = true,
      eyebrow,
      heading,
      headingSize = "h2",
      headingAs,
      count,
      countLabel = "records",
      formatCount,
      rule = true,
      figures,
      tabs,
      value,
      defaultValue,
      onValueChange,
      tabsLabel,
      band,
      search,
      filters,
      period,
      viewSwitch,
      actions,
      maxActions = 3,
      moreActionsLabel = "More actions",
      toolbarPanel,
      loading = false,
      empty = false,
      error = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing here",
      emptyBody = "Nothing matches what you are looking at right now.",
      errorLabel = "Something went wrong",
      errorBody = "We can’t show this right now. Try again in a moment.",
      children,
      ...props
    },
    ref,
  ) => {
    /* -- The heading band -------------------------------------------------
       The count rides beside the heading as a quiet chip. `Badge` already
       renders nothing at zero, negative or loading, so no guard is written
       here and no "0" can reach the screen. */
    const countChip =
      count === undefined ? null : (
        <Badge count={count} loading={loading} formatCount={formatCount} aria-label={countLabel}>
          {undefined}
        </Badge>
      );

    /* -- The action group -------------------------------------------------
       "The 4th+ action collapses under a '···' icon button rather than adding
       more pills." Counted off `React.Children`, so a call site passes its
       controls as ordinary children and never has to think about the rule. */
    const actionList = React.Children.toArray(actions);
    const visibleActions = actionList.slice(0, Math.max(0, maxActions));
    const overflowActions = actionList.slice(Math.max(0, maxActions));

    /* PINNED, AND IT DOES NOT WRAP. `flex-wrap` was here so a fourth pill
       could drop to a second line; nothing may drop to a second line any
       more (see the toolbar row's own note), and the overflow menu below is
       the answer to "too many pills" that the kit already had. `shrink-0`
       is what keeps the charcoal `+` at full size while the lane beside it
       gives up width — the client's "at least i need to have the + button"
       is a promise about a control being THERE, and a squashed pill is a
       different way of breaking it.

       THE ONE BUDGET THIS ROW CANNOT BALANCE, STATED SO NOBODY REDISCOVERS
       IT AS A BUG. `maxActions` counts pills; it does not measure them. A
       caller that passes two LABELLED pills and the `+` to a 380 phone hands
       this group 204px of a 245px toolbar, and the lane beside it is left
       with 30 — one row still, and every control still named and still in the
       tab order, but the search field is mostly scrolled out of sight. There
       is no CSS answer: something has to give, and the two things that must
       not are the `+` (the client's item 3) and the page's own horizontal
       scroll. The answer is the kit's existing one, taken earlier — pass a
       smaller `maxActions`, and the surplus folds under the `···` this group
       already draws. No route in either door passes toolbar pills at all
       today, which is why this is a note and not a mechanism. */
    const actionGroup = actionList.length ? (
      <div
        data-slot="collection-frame-actions"
        className="ms-auto flex shrink-0 flex-nowrap items-center gap-2"
      >
        {visibleActions}
        {overflowActions.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label={moreActionsLabel}>
                <DotsThree />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{overflowActions}</DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    ) : null;

    const hasToolbar = Boolean(search || filters || period || viewSwitch || actionGroup);
    const hasHeader =
      eyebrow !== undefined || heading !== undefined || countChip !== null;

    /* -- The body ---------------------------------------------------------
       Exclusive states resolved in JS (PATTERN §4), never stacked as
       same-specificity classes racing each other. */
    const bodyState = loading ? "loading" : error ? "error" : empty ? "empty" : "default";

    let body: React.ReactNode = children;
    if (bodyState === "loading") {
      body =
        loadingState ??
        (<CollectionRegister tone="busy" eyebrow={loadingLabel} busyLabel={loadingLabel} />);
    } else if (bodyState === "error") {
      body =
        errorState ??
        (<CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />);
    } else if (bodyState === "empty") {
      body = emptyState ?? <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />;
    }

    return (
      <section
        ref={ref as React.Ref<HTMLElement>}
        data-slot="collection-frame"
        data-tone={tone ?? "page"}
        data-state={bodyState}
        aria-busy={loading || undefined}
        className={cn(collectionFrameVariants({ tone, density, inset }), className)}
        {...props}
      >
        {hasHeader ? (
          <Title
            data-slot="collection-frame-heading"
            eyebrow={eyebrow}
            size={headingSize}
            as={headingAs}
            rule={rule}
            actions={undefined}
          >
            <span className="inline-flex flex-wrap items-center gap-3">
              {heading}
              {countChip}
            </span>
          </Title>
        ) : null}

        {figures ? <div data-slot="collection-frame-figures">{figures}</div> : null}

        {/* RULING J2 IS SPENT, AND ITS OTHER HALF SURVIVES ELSEWHERE.

            J2 said the strip and the panel are ONE REGION, because a `folder`
            strip carried a negative block-end margin of exactly
            `--folder-tab-overlap` and any gap at all left a stripe of ground
            under the tabs' feet and broke the join. That was true of the
            folder strip, which this frame no longer draws (client ruling,
            2026-09-02) — and it is still true of the one thing that does, the
            breadcrumb folder strip in
            `components/breadcrumbs/breadcrumb-folders.tsx`, which is where the
            overlap and the rule about not putting anything in the gap now
            live.

            THE STACK NO LONGER SPENDS A `gap` OF ITS OWN — CHANGED 2026-09-03,
            SAME DAY AS THE NUMBER ITSELF. It used to keep "the frame's
            ordinary band gap at every density" here, a flex `gap` between
            this `<Tabs>` wrapper and the panel below. The client then asked
            for that space to survive scrolling — a strip that pins at the top
            of a scrolling pane keeps its own box, including any padding, but
            a flex `gap` is a static distance between two siblings and stops
            meaning anything the moment one of them goes sticky. So the space
            moved onto the STRIP's own box: `TABS_STRIP_GAP` is
            `tabs.tsx`'s exported padding-block-end, on the `<Tabs>` wrapper
            immediately below (whose only child is `TabsList`, so this is
            "padding right after the strip" with nothing else inside that
            box to disturb). This stack is a plain column now; the density
            variants above still govern the frame's OWN inset and its OTHER
            gaps (header to figures, figures to this stack), which this join
            was never about. */}
        <div data-slot="collection-frame-stack" className="flex min-w-0 flex-col">
          {tabs && tabs.length > 0 ? (
            <Tabs
              value={value}
              defaultValue={value === undefined ? (defaultValue ?? tabs[0].value) : undefined}
              onValueChange={onValueChange}
              data-slot="collection-frame-tabs"
              className={TABS_STRIP_GAP}
              /* THE THREE PAPERS THAT USED TO BE RESOLVED HERE ARE GONE WITH
                 THE FOLDER VARIANT (client ruling, 2026-09-02), AND SO IS THE
                 WHOLE OVERRIDE 30 / 38 / 39 ARGUMENT THIS BLOCK CARRIED.

                 What stood here: `--card: var(--surface-panel)` on `Tabs` and
                 `--surface-panel: var(--muted)` on `TabsList`, two rebindings
                 that moved the folder shape's active and inactive fills
                 without editing `tabs.tsx`, plus a `rounded-t-[var(--radius)]
                 bg-surface-page` band for the strip to stand on. A `line`
                 strip is a rule under a heading, not a shape standing on a
                 ground: it has no fill to move, no band to stand on and no
                 corner to round. All four classes are removed rather than
                 left inert — an inert rebinding is exactly the kind of thing
                 the next reader "fixes".

                 The measured figures they produced are not lost. The register
                 keeps them, and the surviving folder shape — the breadcrumb
                 strip — restates its own pair and measures them again in
                 `verify/breadcrumb-folder/`. */
            >
              <TabsList aria-label={tabsLabel}>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
                    {tab.label}
                    {/* OVERRIDE 45 (2026-08-23) — A TAB'S COUNT IS QUIET,
                        NEVER A BADGE. This strip used to ship a `Badge` on
                        every tab, which is a filled chip inside a tab shape —
                        two boxes deep, and the one thing CH14 ruled out by
                        name. The quiet number this override fixed it to is now
                        `TabsCount` itself (GAPS-RULINGS.md R-4a), so this
                        frame's own hand-rolled span cannot drift from the
                        contract a second time the way it drifted the first.
                        The chapter it cited was the FOLDER chapter and the
                        folder tab is retired; the override survives it,
                        because R-4a's line count is not a badge either. */}
                    <TabsCount count={tab.count} />
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}

          {/* CH27.1: "toolbar, rows, pager inside it." The pager is the
              body's own — `DataTable` draws it after the rows, and a
              continuation button arrives as the last child — so it is inside
              this panel by being inside the body, not by a fourth slot. */}
          <div
            data-slot="collection-frame-panel"
            className={collectionPanelVariants({ density })}
          >
            {/* CH27.5's band. Inside the panel, above the toolbar, and
                drawn only when a composition passes one — the archive tab
                is the only one that does. */}
            {band ? <div data-slot="collection-frame-band">{band}</div> : null}

            {hasToolbar ? (
              <div
                data-slot="collection-frame-toolbar"
                /* ONE ROW. AT EVERY WIDTH. CLIENT, 2026-09-04, VERBATIM:
                   "i want that toolbar is a single row like in the pdf i gave
                   you long ago wiuth designs".

                   WHAT THIS USED TO BE, AND WHAT IT MEASURED. This element
                   carried `flex-wrap`, and the search slot below carried
                   `basis-full` under `sm`, which is a deliberate instruction
                   to break the row. Measured in verify/toolbar-one-row before
                   the change, on the frame's own specimens: at 1440 the full
                   slot set drew TWO rows (90px tall against a 41px control);
                   at 834 the typical set — search, filters, sort, view, `+` —
                   drew TWO (90px); at 380 the full set drew FIVE (285px) and
                   the typical set FOUR (236px). A contract that says "toolbar
                   order never changes: search, then filters, then view
                   switcher" was being read down a column on a phone.

                   THE MECHANISM, AND WHY IT IS THIS ONE. The row is now an
                   outer flex that never wraps, holding TWO children: a
                   SCROLLING LANE with the four ordered slots in it, and the
                   action group pinned outside the lane at the inline end. The
                   lane absorbs every width problem by scrolling its own
                   inline axis; the row's height is therefore its tallest
                   control's height at every width, which is the only
                   definition of "one row" that can be measured rather than
                   eyeballed.

                   THIS IS THE KIT'S OWN STATED ANSWER, NOT A NEW ONE.
                   `sort-control.tsx` has said it in writing for as long as it
                   has existed — "Where a toolbar runs out of room, the toolbar
                   scrolls — that is the composition's decision and `FilterBar`
                   states the same answer for the same reason" — and
                   `FilterBar`'s header reasons it out at length for its own
                   chip row: a scroller "keeps every chip one swipe away, keeps
                   both focus targets per chip reachable by keyboard, and costs
                   no chrome". All this change does is apply the answer the kit
                   already gave for one slot to the row that slot sits in.

                   WHAT WAS TRIED AND REJECTED, in order:

                   · FOLDING THE SECONDARY SLOTS INTO A `···` DROPDOWN below
                     `sm`. Rejected on two counts. The slots are not menu
                     items — `SortControl` and `ViewSwitch` are Radix Selects
                     and `FilterBar` is a live row of two-target chips, and a
                     Select inside a menu is a focus trap with two roving
                     tab-stop owners. And `FilterBar`'s header already refuses
                     the shape on its own merits: "the moment they are hidden,
                     people forget they are on and read a filtered list as an
                     empty one."

                   · FOLDING THEM INTO AN IN-FLOW DISCLOSURE under the row,
                     which is the shape the client's 2026-09-02 ruling would
                     want if anything had to fold ("the expanded toolbar
                     shoudl not be an overlay, but literaly expand the
                     space"). Rejected because it needs open/closed state and
                     a width the component measures, and this module's
                     RENDERING CONTEXT note is load-bearing: no `"use
                     client"`, no state, no hook. Buying one row on a phone
                     with a client boundary on every collection in both doors,
                     plus a hydration correction the reader would watch
                     happen, is the wrong trade for a problem CSS settles.

                   · RENDERING THE FOLDED SLOTS TWICE and letting media
                     queries show one copy. Rejected outright: it doubles
                     every control in the accessible tree, so the same "Sort
                     by" is announced twice and tabbed through twice.

                   WHAT THIS COSTS, STATED. On a phone the lane is wider than
                   the screen and the reader swipes it. Nothing is hidden
                   behind a control, nothing changes its accessible name,
                   nothing leaves the tab order, and a browser scrolls a
                   focused control into view on its own. The one thing the
                   reader loses is seeing all five slots at once at 380, which
                   no arrangement of a 245px-wide toolbar could have given
                   them. */
                className="flex flex-nowrap items-center gap-3"
              >
                <div
                  data-slot="collection-frame-toolbar-lane"
                  /* THE LANE. `min-w-0` is what lets it be narrower than its
                     content — without it a flex item's automatic minimum size
                     is its content, the lane never scrolls, and the PAGE
                     scrolls instead, which is the one outcome forbidden
                     outright.

                     The vertical padding and the negative margin that cancels
                     it are a pair and must stay one: `overflow-x` other than
                     `visible` forces `overflow-y` to `auto` as well, so a
                     control's 1px `:focus-visible` outline (tokens.css §8,
                     `--focus-width` 1px at `--focus-offset` 0) would be shaved
                     off at the lane's top and bottom edge. `--space-1` is four
                     times the ring and the smallest token that clears it; the
                     matching negative margin gives the space back, so the
                     row's measured height is still one control's height and
                     nothing below it moves.

                     `relative` IS LOAD-BEARING AND IS NOT THE ANCHOR THE
                     FILTERS WRAPPER BELOW REFUSES. Read both notes together
                     before removing either.

                     A scroll container clips its overflow, but it does NOT
                     clip an absolutely positioned descendant unless it is
                     that descendant's containing block — and a `static`
                     element never is. `SortControl` and `ViewSwitch` each
                     carry a `.sr-only` span, which the kit positions
                     absolutely, and inside a lane scrolled 400px past its own
                     edge those 1px spans sit 900px out. Measured with the lane
                     `static`: at 834 the document's scrollWidth was 908
                     against a clientWidth of 834, and the PAGE scrolled
                     sideways by 74px — the one outcome this whole change is
                     forbidden to produce, caused by two spans nobody can see.
                     `relative` makes the lane their containing block, so the
                     lane's own overflow clips them and the page stays still.

                     What the wrapper below refuses is publishing a POSITIONING
                     ANCHOR for a host's own floating panel, in a place a call
                     site cannot edit, for a shape the client's 2026-09-02
                     ruling rejects ("not an overlay, but literaly expand the
                     space"). Nothing about that changes here: everything in
                     this kit that legitimately floats is Radix-portalled and
                     reads its trigger, not an ancestor, and a panel that a
                     toolbar control opens still belongs in `toolbarPanel`
                     below, in flow. This `relative` exists to CONTAIN what is
                     already inside the lane, not to offer a hook to anything
                     outside it. */
                  className="relative flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-x-auto py-[var(--space-1)] my-[calc(var(--space-1)*-1)]"
                >
                {search ? (
                  /* The search is the row's ONE ELASTIC SLOT: it takes the
                     slack when there is slack and gives it back first when
                     there is not. `basis-full` — the old instruction to take a
                     line of its own below `sm` — is gone; that single class
                     was the difference between a one-row and a four-row
                     toolbar at 380.

                     The floor is `--space-11` — 8rem, which is 120px at this
                     system's 15px root and RESCALES with the text-size
                     control rather than pinning a pixel — and it is a real
                     floor, not a nicety. `flex-1` resolves to `flex: 1 1 0%`, and a
                     flex item with a zero basis has zero shrink WEIGHT, so
                     when the lane overflows every pixel of the deficit is
                     taken from the slots that do have a basis and the search
                     would sit at 0 wide — present in the tree, invisible on
                     the screen. A minimum stops that, and 128 is the narrowest
                     the field's own glyph, its placeholder and its clear
                     control still read as a search field, and it is a token
                     rather than a number picked to fit. */
                  <div className="min-w-[var(--space-11)] flex-1">{search}</div>
                ) : null}

                {search && (filters || period || viewSwitch) ? (
                  <Separator
                    orientation="vertical"
                    decorative
                    /* STILL `sm:` AND STILL ABSENT ON A PHONE, and now for a
                       second reason on top of the first. The first stands: a
                       rule earns its keep by separating two groups the eye
                       reads as one run. The second is arithmetic — three
                       separators cost 3px of rule and 36px of gap, which is a
                       quarter of the 245px a 380 phone gives this toolbar,
                       spent on marks rather than controls. */
                    className="hidden h-[1.375rem] sm:block"
                  />
                ) : null}

                {/* THIS WRAPPER CARRIES NO `position`, AND THAT IS THE
                    ANSWER RATHER THAN AN OMISSION — settled 2026-09-02.

                    The question came in as "anything a host puts in `filters`
                    has nothing to anchor against". It does not need one. The
                    client's ruling the same day is that a toolbar control's
                    panel EXPANDS THE SPACE and is not an overlay, so the
                    place for it is `toolbarPanel` below, in flow — and adding
                    `relative` here would be publishing the anchor for exactly
                    the shape the ruling refuses, in the one file a call site
                    cannot edit. Everything that legitimately floats off a
                    control in this system is Radix-portalled (`Select`,
                    `Popover`, `DropdownMenu`, `Tooltip`) and positions itself
                    against its own trigger with collision detection; a
                    positioned ancestor is not what any of them read.

                    The wrapper STAYS, though, and does not simply go: it
                    earns its utilities. `flex … gap-2` is what lets a
                    `filters` slot hold more than one control at the chip
                    measure instead of the toolbar's own `gap-3`; `min-w-0` is
                    what lets it shrink at all inside the flex lane. Dropping
                    it would change the layout of every call site to fix a
                    problem nothing has.

                    `flex-wrap` IS GONE, 2026-09-04, and its old job — "a long
                    facet row breaks rather than pushes the view switch off the
                    line" — is now done sideways instead of downwards. Breaking
                    downwards is precisely what made this toolbar four rows
                    tall at 380 and two at 834: a slot that grows downwards
                    inside a row makes the row grow downwards. A `FilterBar`
                    given `chips="line"` holds its chips on one line and
                    scrolls them, which is the shape that component reasons out
                    at length in its own header.

                    THE CHIP SLOT IS THE ROW'S SHOCK ABSORBER, AND THAT IS A
                    CHOICE BETWEEN TWO WORKING ARRANGEMENTS. With `shrink-0`
                    here the chips keep their intrinsic width and the LANE
                    carries every deficit — one scroller, simple, and measured
                    at 834 it pushed the view switch clean off the visible lane
                    while three filter chips sat in full view. The view switch
                    is a primary control and a chip is a record of something
                    the reader did a moment ago; the primary control is not the
                    one that should go off-screen first. So the chips shrink
                    instead, down to a floor of `--space-11`, and scroll inside
                    themselves — which at 834 leaves search, chips, sort and
                    view all visible on one row, and at 380 leaves the lane to
                    carry what is still left over. The floor is what stops the
                    slot being squeezed to nothing: a zero-width scroller is a
                    set of active filters the reader cannot see, and
                    `FilterBar`'s header is explicit that people who cannot see
                    their filters "read a filtered list as an empty one". */}
                {filters ? (
                  <div
                    className={cn(
                      "flex min-w-[var(--space-11)] items-center gap-2",
                      /* THE FRAME'S OWN GUARANTEE, NOT A REQUEST OF THE CALL
                         SITE. `collection-screen.tsx` passes `chips="line"`
                         and gets the one-line chip row that way, but this
                         frame is also handed a bare `FilterBar` by
                         `notifications.tsx`, by `view-preview.tsx` and by the
                         book's own collection specimens, none of which knows
                         about the prop and none of which should have to. Left
                         to itself a `FilterBar` releases its chip row to
                         `flex-wrap` from `sm` up, and a wrapping row inside
                         this slot is the toolbar growing a second line from
                         the inside — the one thing the client's ruling of
                         2026-09-04 forbids, reintroduced by a call site that
                         did nothing wrong.

                         So the row that owns the contract enforces it, on the
                         one child it is allowed to know by name. The
                         precedent for reaching a descendant's `data-slot`
                         from the component that positions it is `split.tsx`'s
                         selected-row inks and `progress-dashboard.tsx`'s fill;
                         the selector is class-plus-attribute, so it outranks
                         `FilterBar`'s own single-class `sm:flex-wrap` however
                         the two land in the sheet. A caller that genuinely
                         wants a wrapping facet row wants it OUTSIDE this
                         toolbar — `band` and `toolbarPanel` are both in flow
                         and neither is a row. */
                      "[&_[data-slot=filter-bar-chips]]:flex-nowrap",
                      "[&_[data-slot=filter-bar-chips]]:overflow-x-auto",
                    )}
                  >
                    {filters}
                  </div>
                ) : null}

                {filters && (period || viewSwitch) ? (
                  <Separator
                    orientation="vertical"
                    decorative
                    className="hidden h-[1.375rem] sm:block"
                  />
                ) : null}

                {/* `shrink-0` from here down. The period stepper's words and
                    the view switch's current-view label are TEXT, and text
                    given less room than it needs either wraps — a second row
                    by another name — or ellipses away the one thing the
                    control exists to tell you. They keep their intrinsic
                    width and the lane scrolls past them. */}
                {period ? <div className="flex shrink-0 items-center">{period}</div> : null}

                {period && viewSwitch ? (
                  <Separator
                    orientation="vertical"
                    decorative
                    className="hidden h-[1.375rem] sm:block"
                  />
                ) : null}

                {viewSwitch ? (
                  <div className="flex shrink-0 items-center">{viewSwitch}</div>
                ) : null}
                </div>

                {/* OUTSIDE THE LANE, ON PURPOSE. The action group is the one
                    thing in this row that may not scroll away: the client's
                    item 3 is "everytime i see a collection, on the toolbar, at
                    least i need to have the + button (yes, on every view
                    unless specifically specified)", and a `+` that is present
                    but two swipes off the inline edge of a 380 phone is a
                    control the reader has to go looking for. Pinning it here
                    is also what makes the lane's scroll safe to reason about:
                    the row has one scrolling child and one fixed child, in
                    that order, at every width. */}
                {actionGroup}
              </div>
            ) : null}

            {/* What a toolbar control opened. A sibling of the toolbar and of
                the body, so it takes the panel column's own gap and PUSHES
                THE ROWS DOWN — the client's ruling of 2026-09-02, and the
                whole reason the slot exists. See `toolbarPanel`. */}
            {toolbarPanel ? (
              <div data-slot="collection-frame-toolbar-panel" className="min-w-0">
                {toolbarPanel}
              </div>
            ) : null}

            <div data-slot="collection-frame-body" className="min-w-0">
              {body}
            </div>
          </div>
        </div>
      </section>
    );
  },
);

CollectionFrame.displayName = "CollectionFrame";

/* `collectionPanelVariants` is deliberately NOT exported. The panel is not a
   part a call site may assemble on its own — the whole point of ruling J2 is
   that the toolbar, the rows and the pager are inside ONE panel the frame
   owns, and an exported recipe would be an invitation to draw a second one. */
export { CollectionFrame, CollectionRegister, collectionFrameVariants, registerVariants };
