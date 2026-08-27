/* ============================================================================
   CollectionFrame — the shell every list sits in: eyebrow, heading, count,
   figure strip, tabs, and ONE PANEL holding toolbar, rows and pager
   (1 direct call site).

   CLIENT RULING J2 · 2026-08-22 · override register #11
   "A folder tab attaches to a panel." Ruling E put the brand folder shape on
   every main screen, but a folder tab is drawn to be pulled DOWN under a
   panel by `--folder-tab-overlap` and filled with the panel's own colour —
   without a panel it is a shape joined to nothing, floating over the frame's
   ground with a sliver of that ground showing under its foot.

   CH27.1 states the region order and the container in one sentence, verbatim:

       "Figures, folder tabs, then the collection panel — toolbar, rows, pager
        inside it. A collection may drop the figure strip; it may not reorder
        what remains, and filters never sit above the tabs."

   and CH14 says what the tab is doing against it, verbatim:

       "The active one fills the card colour and sits above it; the rest take
        the quiet #FAF9F7 fill with a secondary label and are clipped by the
        card edge."

   So the toolbar, the body and whatever pager the body carries are no longer
   three sibling bands with a gap between them: they are ONE panel,
   `--surface-panel` at `--radius`, and the tab strip sits on its top edge with
   NO gap — the strip's own negative block-end margin (`TabsList`, `folder`)
   rides the panel up over the tabs' feet by exactly `--folder-tab-overlap`.

   OVERRIDE 15 WAS REVERSED ON 2026-08-23. READ THIS BEFORE CHANGING A FILL.

   Ruling K1 pinned this panel to `--card`, the off-beige paper. The client's
   own reference pages reverse it, in three independent places:

     · 26.04, verbatim: "The page itself is off-beige and every panel on it is
       soft paper: never the other way round."
     · the active folder tab's fill is `#F7F2EB`, and CH14's rule is that the
       active tab takes the panel's own fill — so the panel is soft paper.
     · the client's own screenshots of both doors.

   A design-lead flip was made on their instruction to match the kit exactly.
   The nesting the whole system now alternates on is `SHELL.md`'s four levels:

       off-beige PAGE  →  soft-paper SCREEN CARD  →  off-beige BODY PANE
         →  soft-paper PANEL (this file)  →  off-beige CARDS

   Three things make the tab's join true rather than approximately true, and
   all three are load-bearing:
     · The panel is `--surface-panel` because the ACTIVE TAB IS the panel's
       own fill (CH14, CH27.1). `tabs.tsx` writes that fill as `--card`, so
       this file rebinds `--card` to `var(--surface-panel)` ON THE STRIP and
       nowhere else — see the `className` on `Tabs` in the render. Same
       colour or the join is a lie.
     · The panel's ground is the BODY PANE, off-beige — the frame's own fill
       at `tone="page"`, which is now the default. In light the panel is
       #F7F2EB and the ground is #FFFEF9; without that ground the panel would
       be invisible and there would be nothing for an inactive tab to be
       clipped against. (Before the reversal these two were the other way
       round, which is what `ScreenShell`'s missing body pane was hiding.)
     · THE STRIP'S ground is the same off-beige as the pane, so the three
       papers of CH27.1 are all distinct and all the kit's own hexes: band
       #FFFEF9, inactive tab #FAF9F7 (`--muted`, whose own comment in
       tokens.css reads "inactive tabs, idle wells"), active tab and panel
       #F7F2EB. Override 30 had transposed the last two because there was no
       off-beige pane for them to stand on; with the pane drawn, the
       transposition is unnecessary and it is undone here.
     · Nothing is separated by a stroke. There is no `border` here, and no
       hairline either: the panel is told apart from its ground by colour, as
       CH13's subtitle demands ("Colour separates, strokes don't").

   The z-order is chapter 24.3's own three numbers and is shared with
   `TabsContent`: inactive tab 1, panel 2, active tab 3.

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
import { Tabs, TabsList, TabsTrigger } from "../tabs/tabs";
import { Title } from "../title/title";
import { MoreHorizontal } from "../../foundations/icons";

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
         * and its folder tabs against. 26.04: "The page itself is off-beige
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
         * on a soft-paper ground measures 1.000 in both palettes and the
         * active folder tab has nothing to be seen against.
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

   · `bg-surface-panel` — soft paper, the K1 reversal. CH27.1 gives the active
     tab "the panel's soft paper (#F7F2EB)" and CH14 gives it "the card
     colour"; `tabs.tsx` spells that fill `--card`, so the STRIP rebinds
     `--card` to `var(--surface-panel)` and the two are the same colour again.
     If they ever stop being the same colour the tab stops being attached and
     starts being a differently coloured lid.
   · `rounded-[var(--radius)]` — ruling 03: 24, the one box radius. The tab's
     own corners are the nine-slice's and are not touched.
   · `relative z-[2]` — chapter 24.3's middle number, the same one
     `TabsContent` uses on the folder variant: above an inactive tab (1) so
     the panel edge clips it, below the active tab (3) so the active one sits
     on top and its foot disappears under the panel.
   · The secondary and pill fills re-resolve AGAIN here, because a control in
     the toolbar stands on `--card` and not on the frame's ground. Ruling 01
     is relational, and CH27.1 draws the opposition on this exact toolbar.
   · No `border`, no hairline, no shadow. Colour is the separation (CH13), and
     neither CH27.1 nor CH14 draws a rule or a lift on this panel — CH14's own
     folder panel is a plain fill at 24. GAPS-J2 J2-4.
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
   * A count after the label. Drawn as CH14's quiet number — micro, tabular,
   * tertiary ink — and NEVER as a `Badge` (override 45). Zero renders nothing.
   */
  count?: number;
  /** Dead tab: a fill and an ink, never an opacity. */
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
  /**
   * `folder` (the brand shape) or `line` (the strip under a heading). There
   * is no third: `pill` was deleted from `Tabs` in review round 1 — it was a
   * segmented CONTROL wearing a tab's name, and the control is
   * `toggle-group`.
   *
   * DEFAULTS TO `folder` BY CLIENT RULING E (2026-08-22): "folder tabs are for
   * main screens, line tabs for detail screens." A collection IS a main
   * screen, so the frame that draws collections takes the brand shape. A
   * strip inside a record is `RecordDetail`'s, and that one stays `line`.
   */
  tabsVariant?: "line" | "folder";
  /** Accessible name for the strip. Undefined leaves it named by the heading. */
  tabsLabel?: string;

  /**
   * ONE LINE OF STANDING, INSIDE THE PANEL AND ABOVE THE TOOLBAR — CH27.5.
   *
   * The archive tab is the only composition in the kit that draws one:
   * "one extra band saying where you are". The artifact renders it as the
   * FIRST CHILD OF THE PANEL, before the toolbar row — not as a band between
   * the tab strip and the panel, which ruling J2 makes impossible anyway
   * (the folder tab's foot rides on the panel's top edge, and anything in
   * that gap breaks the join).
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
 *                      toolbar, the rows and the pager (CH27.1, ruling J2).
 *                      The active tab is attached to that panel's top edge;
 *                      nothing else is a band.
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
 *  · mobile (base) — one column throughout. The heading row wraps, so the
 *    header actions drop under the heading rather than squeezing it. The
 *    toolbar becomes a wrapping row: search takes the full width on its own
 *    line (`basis-full`), the filter, period and view-switch groups sit under
 *    it, and the action group stays pinned to the inline end of whatever line
 *    it lands on. The vertical rules between the toolbar groups are hidden,
 *    because a rule between two things that are no longer side by side is
 *    just a mark. The period stepper's own words never wrap
 *    (`whitespace-nowrap` on the label), so it stays one readable control at
 *    380 rather than breaking across two lines. Frame inset 24, panel inset 24 — CH27.1 is explicit that
 *    narrow keeps the toolbar and the panel ("the toolbar is never dropped —
 *    it condenses"), so nothing about the J2 attachment is width-dependent.
 *  · tablet (`sm:`, 40rem) — the toolbar becomes one line: search shrinks to
 *    its own natural width and the rules reappear. This is the width the
 *    kit's own toolbar drawing fits at. Frame inset 24, panel inset 24.
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
      /* Ruling E: a collection is a main screen, so the brand folder shape. */
      tabsVariant = "folder",
      tabsLabel,
      band,
      search,
      filters,
      period,
      viewSwitch,
      actions,
      maxActions = 3,
      moreActionsLabel = "More actions",
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

    const actionGroup = actionList.length ? (
      <div
        data-slot="collection-frame-actions"
        className="ms-auto flex flex-wrap items-center gap-2"
      >
        {visibleActions}
        {overflowActions.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label={moreActionsLabel}>
                <MoreHorizontal />
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

        {/* RULING J2 — the strip and the panel are one region.

            A `folder` strip carries a negative block-end margin of exactly
            `--folder-tab-overlap`, so with NO gap here the panel's top edge
            rides up over the tabs' feet: the active tab's `--card` foot
            disappears into the panel's own `--card`, and the inactive tabs,
            a z-index below, are cut off by the panel edge. Any gap at all —
            the frame's own `gap-5` was 20px of it — leaves a stripe of the
            frame's ground under the tab and the join is broken.

            A `line` strip is attached to nothing by design (it is a rule
            under a heading), so it keeps the frame's ordinary band gap. */}
        <div
          data-slot="collection-frame-stack"
          className={cn(
            "flex min-w-0 flex-col",
            tabsVariant === "folder"
              ? "gap-0"
              : density === "compact"
                ? "gap-4"
                : "gap-5",
          )}
        >
          {tabs && tabs.length > 0 ? (
            <Tabs
              variant={tabsVariant}
              value={value}
              defaultValue={value === undefined ? (defaultValue ?? tabs[0].value) : undefined}
              onValueChange={onValueChange}
              data-slot="collection-frame-tabs"
              /* OVERRIDE 30 IS UNDONE HERE — THE THREE PAPERS ARE THE KIT'S
                 OWN AGAIN, BECAUSE THE BODY PANE NOW EXISTS TO STAND THEM ON.

                 CH27.1 and CH14 both draw the same three papers and both name
                 two of the hexes:

                     band / ground   off-beige   #FFFEF9
                     inactive tab    "the quiet #FAF9F7 fill"
                     active tab      "the panel's soft paper (#F7F2EB)"

                 Override 30 transposed the last two, and it had to: the frame
                 had no off-beige ground of its own, so the strip was the only
                 band that could be moved, and moving it left the inactive tab
                 with nothing to be quieter THAN. With `ScreenShell`'s body
                 pane drawn, the ground IS off-beige and the transposition is
                 unnecessary. Overrides 38 and 39 were both consequences of it
                 and both go with it: no tab reads 1.000 against anything now,
                 in either palette.

                 THE FILLS ARE MOVED BY REBINDING, NOT BY EDITING `tabs.tsx`.
                 `FOLDER_SHAPE_FILL` paints the inactive shape `--surface-panel`
                 and the active shape `--card`, so the two names are re-pointed
                 on the two elements this file owns, and nothing outside the
                 strip is touched:

                   · ON `Tabs` — `--card: var(--surface-panel)`. Substitution
                     happens at computed-value time, so `--card` computes to
                     #F7F2EB HERE and every descendant inherits that literal.
                     The active tab is therefore the panel's own fill, which is
                     CH27.1's sentence exactly.
                   · ON `TabsList` — `--surface-panel: var(--muted)`. `--muted`
                     is #FAF9F7 in light and its own comment in tokens.css
                     reads "inactive tabs, idle wells": it is the kit's stated
                     inactive-tab paper, named. It is set one element LOWER so
                     it cannot reach the `--card` line above it — that one is
                     already resolved.

                 Nothing else inside this `Tabs` reads either name: the strip
                 holds the triggers and nothing else, and the panel is a
                 sibling, not a child.

                 MEASURED, both palettes, after the change:
                   light  band #FFFEF9 · inactive #FAF9F7 (1.021)
                          · active/panel #F7F2EB (1.103 vs band, 1.081 vs inactive)
                   dark   band #141310 · inactive #2F2D28 (1.611)
                          · active/panel #1C1B18 (1.111 vs band, 1.450 vs inactive)

                 The dark pair is ordered the other way round from light — the
                 inactive tab is LIGHTER than the active one there, because no
                 dark paper exists between #141310 and #1C1B18 and override 30
                 already measured that a fourth one is arithmetically doomed.
                 Three distinct, legible papers in dark was preferred to a
                 faithful ordering with one of them invisible. Recorded on the
                 register with the K1 reversal.

                 FOLDER ONLY. A `line` strip is a rule under a heading, not a
                 shape standing on a ground, and it has no fill to move.

                 THE BAND TAKES THE BOX RADIUS AT ITS TOP, and that is not
                 decoration: the band and the pane behind it are the same
                 off-beige paper, so a square-cornered band would have given
                 the collection a square-topped slab where ruling 03 allows one
                 box radius and no other. Only the two block-start corners; the
                 block-end pair is the panel's. */
              className={
                tabsVariant === "folder"
                  ? cn(
                      "rounded-t-[var(--radius)] bg-surface-page",
                      "[--card:var(--surface-panel)]",
                    )
                  : undefined
              }
            >
              <TabsList
                aria-label={tabsLabel}
                /* The inactive shape's paper, one element below the line that
                   resolves the active one. See the block above. */
                className={
                  tabsVariant === "folder" ? "[--surface-panel:var(--muted)]" : undefined
                }
              >
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
                    {tab.label}
                    {/* OVERRIDE 45 (2026-08-23) — A TAB'S COUNT IS QUIET,
                        NEVER A BADGE. CH14, the folder chapter's own closing
                        law, verbatim: "counts are quiet, never badges." This
                        strip shipped a `Badge` on every folder tab, which is
                        a filled chip inside a tab shape — two boxes deep, and
                        the one thing the chapter rules out by name.
                        `tabs.tsx` already stated the replacement in
                        `TabsTrigger`'s own doc — "a call site writes the
                        number in `text-micro tabular-nums text-ink-tertiary`
                        next to the label rather than reaching for `Badge`" —
                        so nothing here is invented; the contract was written
                        and this file was the one place not keeping it.
                        `Badge`'s zero law survives the move: a count of zero
                        or less renders nothing, never "0" (SHELL.md). */}
                    {tab.count === undefined || tab.count <= 0 ? null : (
                      <span
                        data-slot="collection-frame-tab-count"
                        className="text-micro tabular-nums text-ink-tertiary"
                      >
                        {tab.count}
                      </span>
                    )}
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
                /* The order is the component's, not the call site's: search,
                   filters, period, view switch, actions pinned to the inline
                   end. The period sits between the search and the view switch
                   because that is where CH27.26 draws it (override 28). */
                className="flex flex-wrap items-center gap-3"
              >
                {search ? (
                  <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">{search}</div>
                ) : null}

                {search && (filters || period || viewSwitch) ? (
                  <Separator
                    orientation="vertical"
                    decorative
                    className="hidden h-[1.375rem] sm:block"
                  />
                ) : null}

                {filters ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
                ) : null}

                {filters && (period || viewSwitch) ? (
                  <Separator
                    orientation="vertical"
                    decorative
                    className="hidden h-[1.375rem] sm:block"
                  />
                ) : null}

                {period ? <div className="flex items-center">{period}</div> : null}

                {period && viewSwitch ? (
                  <Separator
                    orientation="vertical"
                    decorative
                    className="hidden h-[1.375rem] sm:block"
                  />
                ) : null}

                {viewSwitch ? <div className="flex items-center">{viewSwitch}</div> : null}

                {actionGroup}
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
