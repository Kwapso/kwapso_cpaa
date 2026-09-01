/* ============================================================================
   RecordDetail — the four-region record anatomy (0 direct call sites, and
   "applies to 14 screens" per commission §9.1).

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" → chapter 24, specimen 24.6 "Record chrome". Its
   caption is the whole brief and is quoted verbatim:

       "Four regions, in this order, on all sixteen record types: header
        band, sticky tab strip, opaque panel, audit footer."

   and the note under the specimen, also verbatim, settles the tones:

       "The header band is transparent — it takes the page tone, which is why
        its buttons are the other neutral. The panel below is opaque and
        carries the content. Permissions hide actions rather than disabling
        them, so a client never sees a button they can't press."

   The drawing, figure by figure, as read off the specimen's inline styles:
     · header band  — `display:flex; align-items:flex-start; gap:14px;
                       padding:0 4px 16px`, a 32 pill mark, an 18/500 title
                       over a 12.5 tertiary tabular meta, actions pushed to
                       the end with gap 8.
     · tab strip    — `align-items:flex-end; gap:4px; margin-bottom:-17px;
                       overflow-x:auto; scrollbar-width:none`, the ACTIVE tab
                       filled `--card` (the panel's own fill) and the rest
                       `--idle`, each with a 13 label and an 11 tabular count.
     · panel        — `background:var(--card); border-radius:24px;
                       padding:20px`, holding a 12/500/uppercase/0.08em
                       eyebrow over 14/1.5 secondary copy.
     · ink footer    — NOT chapter 24's wrapping audit line. See below: CH27.8
                       replaces it with the two-column charcoal card, and this
                       file drew 24.6's strip for weeks while quoting 27.8's
                       rule in this very header. Fixed 2026-08-23, DEF-1.

   REGION 4 IS CH27.8'S INK CARD. Verbatim, under its own heading "The footer
   is the ink card, two columns":

       "Every detail page ends with the charcoal #1A1918 card from the kit's
        record pattern: Latest activity on the left — a short reverse-
        chronological feed with an add-a-note field — and Record on the right,
        two to four key/value rows. It is a normal card in the flow, not
        sticky and not full-bleed, it appears once per record, and it does not
        change per tab. On dark, ink would sit almost on top of the page, so
        the card moves up to raised #26241F with a hairline — same two
        columns, same content."

   and CH27.8 fixes its place in the anatomy, also verbatim:

       "Facts strip, the record's own text, attachments, then the ink footer.
        That order never changes."

   THERE IS NO FACTS STRIP — 26.04 BEATS 27.8, OVERRIDE 49 (2026-08-23).
   26.04, verbatim: "There is no facts strip — a record's values belong in its
   body, not stacked above the tabs." It is the entry that DEFINES the detail
   page, and the same sentence carries the papers law the K1 reversal already
   took as binding, so it wins over 27.8's region list and over 27.8's "the
   facts strip does that job across the top". This component never drew one
   and must not grow one: there is no `facts` slot, and a record's values
   belong in `panel`. An ARTIFACT CORRECTION IS OWED against 27.8.

   THE FOOTER'S DRAWN VALUES, read off 27.8's own markup rather than its prose
   (the wide specimen first, the 380 specimen in brackets where it differs):

     · the card     — `background:var(--inv); color:var(--invfg);
                       border-radius:24px; padding:26px 30px;
                       display:grid;
                       grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
                       gap:32px`                       [`padding:18px 20px`,
                       `flex-direction:column; gap:14px`]
     · each eyebrow — `font-size:11px; font-weight:500; text-transform:
                       uppercase; letter-spacing:0.08em; color:var(--invfg2)`
                       — "Latest activity" and "Record"
     · each column  — `margin-top:12px`                          [`10px`]
     · a feed row   — `grid-template-columns:96px 1fr; gap:16px; padding:11px 0;
                       box-shadow:inset 0 -1px 0 var(--invhair)`, the when at
                       12/`--invfg2` and the line at 14
     · the note     — `height:38px; padding:0 16px; border:none;
                       border-radius:999px; background:#26241F;
                       box-shadow:inset 0 0 0 1px var(--invhair);
                       font-weight:300; font-size:13.5px; color:#FFFEF9`,
                       `placeholder="Add a note"`     [absent at 380]
     · a Record row — `display:flex; justify-content:space-between; gap:16px;
                       padding:9px 0;
                       box-shadow:inset 0 -1px 0 var(--invhair)` and the LAST
                       row drops the rule; label 13/`--invfg2`, value 13
                       tabular                        [`gap:12px; padding:8px 0`,
                       both at 12.5]

   Chapter 26 states what the footer is NOT, verbatim, and it is load-bearing:

       "It's an ink-filled card like any other card on the page — not fixed,
        not sticky, not full-bleed; it sits at the bottom of the tab body's
        normal document flow and scrolls away with the rest of the content.
        It appears once per detail page."

   FOUR PLACES THE DRAWING IS NOT COPIED, AND WHY
   1 · THE FEED ROW'S GEOMETRY IS `ActivityFeed`'S, NOT 27.8'S `96px 1fr`.
       OVERRIDE 18 (verify/decisions.html R2) already ruled on where a log's
       time sits — trailing, not leading — and built one row for CH18, 27.9,
       27.34 and this footer. `activity-feed.tsx` says so in its own header:
       "One answer applied here fixes 27.9, 27.34 and the record footer at
       once, which is why it is one component." So the feed is COMPOSED and
       27.8's leading time column is the side override 18 retired. Redrawing
       it here would reintroduce the second inbox that override exists to
       prevent.
   2 · `padding:26px 30px` AND `padding:9px 0` ARE OFF RULING 28'S LADDER.
       Neither 26, 30 nor 9 is a step or a half-step. The 380 specimen's own
       figures ARE on it — 18 (`--space-4h`), 20 (`--space-5`), 8
       (`--space-2`) — so those are taken at the base width and the wide inset
       steps to the ladder's neighbours, 24 (`--space-6`) and 32
       (`--space-7`), which is `CardContent`'s own ladder. Logged, not
       silently rounded: GAPS-DEF1 Q1.
   3 · `260px` IS WRITTEN `16.25rem`. Every measure in this system is rem so
       it answers the text-size control (tokens.css §1); `folder.tsx` states
       the conversion base as 16. `kanban.tsx` and `gallery.tsx` set the same
       precedent for an auto-fit minimum.
   4 · THE WIDE SPECIMEN KEEPS A RULE UNDER ITS LAST FEED ROW AND THE NARROW
       ONE DROPS IT. Its own Record column drops it at both widths, and
       `ActivityFeed` drops it. The narrow specimen is followed at both
       widths; a trailing rule under the last row of a column is a hanging
       edge, not a separation. GAPS-DEF1 Q2.

   HOW THE CARD ANSWERS THE PALETTE — READ THIS BEFORE CHANGING A COLOUR
   CH27.8 asks for two DIFFERENT surfaces, and no single token holds both:
   `--surface-inverse` is charcoal in light but flips to off-beige in dark,
   which is the whole reason the chapter writes a dark clause at all. So the
   footer states the pair with `light-dark()`, which keys off `color-scheme` —
   the property tokens.css §1 and §6/§7 already set in BOTH dark blocks
   (`@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`). A
   Tailwind `dark:` variant would have been WRONG here: it compiles to the
   media query alone, so an explicit `[data-theme="dark"]` on a light OS would
   have kept the light branch while every token around it flipped — exactly
   the drift tokens.css §6's header warns about.

   Everything else is then rebound ONCE on the card's inner grid, which is the
   mechanism tokens.css §8 already blesses in its own words: "Inverse surfaces
   flip the ring by rebinding the TOKEN, not by adding a second rule." That is
   what makes `ActivityFeed`, `Input` and `Avatar` COMPOSABLE onto a charcoal
   ground without one of them learning about this footer.

   `--hair` is not rebound for the card's OUTER edge, and that is deliberate:
   inherited, it is 8% charcoal in light — imperceptible inset over #1A1918,
   so the light card has no edge, as drawn — and 12% off-beige in dark, which
   is exactly the hairline the chapter asks for. One `Card hairline` covers
   both clauses with no branch at all.

   THE HAIRLINE ON A CHARCOAL GROUND — AND THE HALF OF IT tokens.css CANNOT
   REACH. `--hair-inverse` landed in tokens.css the same day as this fix (the
   Part A audit), which retires the derivation this file first carried: the
   inner rules take the artifact's own `--invhair` by name in both palettes.

   That commit also rebinds `--hair` on `.bg-surface-inverse` and states that
   doing so "keeps every existing consumer of --hairline, --hairline-under,
   --hairline-over, --hairline-start and --hairline-strong correct with no
   component change." MEASURED HERE, IT DOES NOT, and this file is the proof:
   `--hairline: inset 0 0 0 1px var(--hair)` is declared on `:root`, so its
   `var()` is substituted against `:root`'s `--hair` and the RESULT inherits.
   Moving `--hair` further down the tree cannot re-run that substitution, so a
   descendant sees a flipped `--hair` and an UNflipped `--hairline*`. Almost
   every component reaches for the shapes, not the colour. That is why the
   three shapes this card needs are restated on its inner grid below, and it
   is logged for the file's owner as GAPS-DEF1 Q3 — the fix there is to
   redeclare the `--hairline*` shapes inside the same `.bg-surface-inverse`
   block that already rebinds `--hair`, at which point the three lines here
   can go.

   The stage hero above the strip is chapter 23's, already transcribed into
   `status-stepper.tsx`; this file composes that component and redraws none of
   it.

   THE LAW THIS FILE OBEYS
   · FOUR REGIONS, IN THAT ORDER. Nothing may be reordered by a prop, because
     the order is the anatomy.
   · The header band paints NO FILL. It takes the page tone, which is why the
     panel below it reads as opaque at all.
   · The panel is `--card` at radius 24 — the one opaque region.
   · PERMISSIONS HIDE. A region the reader may not see renders nothing: no
     placeholder, no lock, no dimmed panel. `actions`, `hero`, `panel` and
     `footer` each take a `visible` flag and absence is the whole treatment.
   · The tab strip is STICKY, and a sticky strip must be opaque or the panel
     reads straight through it. It takes `--background`, the page tone the
     band already sits on, so the strip and the band are the same paper.
   · Tabs are `Tabs`. This file writes not one tab class — see the folder-tab
     contradiction logged as GAPS-COL3 REC-1.
   · Only four radii, no px, no hex, no font size. Focus is one global rule
     (tokens.css §8), and nothing here sets `overflow: hidden`, so a ring in
     the panel is never shaved. The ONE scrolling box is `TabsList`'s own,
     which already carries scroll padding for exactly that reason.

   RENDERING CONTEXT
   `"use client"`. Radix Tabs underneath, plus `StatusStepper`.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card, CardContent } from "../card/card";
import { Input } from "../input/input";
import { Title } from "../title/title";
import {
  ActivityFeed,
  type ActivityFeedItem,
} from "../activity-feed/activity-feed";
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "../tabs/tabs";
import {
  StatusStepper,
  type StatusStage,
} from "../status-stepper/status-stepper";
import { ScreenRegister } from "../screen-renderer/screen-renderer";

/** Which body is drawn. Law 4: only the PANEL swaps. */
export type RecordDetailState = "ready" | "loading" | "empty" | "error";

export interface RecordDetailTab {
  /** Unique within the strip; also what `onTabChange` reports. */
  value: string;
  /** What the tab says. */
  label: React.ReactNode;
  /** A live count beside the label, drawn by `TabsCount`. Zero renders
   *  nothing — `Badge`'s zero law, without reaching for `Badge` itself. */
  count?: number;
  /** This tab's panel. Absent, `children` is shown for every tab. */
  content?: React.ReactNode;
  /** Dead tab: a fill and an ink; `Tabs` draws it. */
  disabled?: boolean;
  /**
   * The reader may not open this tab. `false` removes it from the strip
   * entirely — ch24.6: permissions hide, they do not disable.
   */
  visible?: boolean;
}

/** One row of the ink footer's Record column. */
export interface RecordDetailAuditEntry {
  /** Stable key. Falls back to the index. */
  id?: string;
  /**
   * The key, in the quieter ink — CH27.8's "Created", "Latest activity",
   * "Record". OPTIONAL, and the reason this prop's shape did not have to
   * change when DEF-1 was fixed: an entry with a `label` draws the chapter's
   * key/value row, `label` at the inline start and `children` at the inline
   * end; an entry WITHOUT one keeps the older single-phrase reading and
   * spans the row. Every call site that predates the ink footer therefore
   * still renders, and renders correctly — just inside the card it always
   * should have been in.
   */
  label?: React.ReactNode;
  /**
   * The value. Before DEF-1 this carried the whole phrase, as chapter 24
   * writes it — "Created 13 Jun 2026, 14:05 · A. Weber" — and it still may.
   * With a `label` beside it, it is the value half and takes tabular figures,
   * which is what 27.8 draws.
   */
  children: React.ReactNode;
}

export interface RecordDetailProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "children"> {
  /* ---- Region 1 · the transparent header band ------------------------- */
  /** The micro line over the title. `Title` draws it uppercase at micro. */
  eyebrow?: React.ReactNode;
  /** The record's name. */
  title?: React.ReactNode;
  /**
   * The quiet line under it — the kit's "TCK-1042 · Padelbase". Tabular,
   * tertiary, at the badge step.
   */
  meta?: React.ReactNode;
  /** The 32 mark before the title — an `Avatar`, an icon well. */
  mark?: React.ReactNode;
  /**
   * The band's controls. ch24.6 draws the retreat on the panel tone and the
   * primary in mango; both are `Button`'s job, not this file's.
   */
  actions?: React.ReactNode;
  /** The reader may not act on this record: the whole action group is absent. */
  actionsVisible?: boolean;
  /**
   * Which heading step the title takes. `Title`'s own ladder — 32 / 24 / 20.
   * The kit's 24.6 draws 18, which is not a rung on that ladder, so the
   * nearest page-level rung is the default (GAPS-COL3 REC-3).
   */
  titleSize?: "h2" | "h3" | "h4";

  /* ---- The stage hero, chapter 23, above the strip -------------------- */
  /**
   * The record's progression. Seven stages in the system, three or four in
   * the portal — `StatusStepper` already folds a long tail into "+n" and
   * needs no help here.
   */
  stages?: readonly StatusStage[];
  /** Zero-based index of the stage the record is at now. */
  currentStage?: number;
  /** Pressing a stage scrolls the record to that stage's panel. */
  onStageSelect?: (index: number, stage: StatusStage) => void;
  /** The reader may not see the progression: it renders nothing. */
  stagesVisible?: boolean;
  /** The progression's accessible name, handed to `StatusStepper`. */
  stagesLabel?: string;
  /**
   * Anything else above the strip — an identity band, chapter 23's stage
   * progression. NOT the record's values: 26.04 forbids a facts strip above
   * the tabs (override 49), so a route that puts key/value pairs here is
   * drawing the one region the page type rules out. Values go in `panel`.
   */
  hero?: React.ReactNode;

  /* ---- Region 2 · the sticky tab strip -------------------------------- */
  /** The tabs, in order. Absent or empty, no strip is drawn. */
  tabs?: readonly RecordDetailTab[];
  /** Controlled tab value. */
  tab?: string;
  /** Uncontrolled starting tab. Defaults to the first visible item. */
  defaultTab?: string;
  /** Fires when the reader switches tabs. */
  onTabChange?: (value: string) => void;
  /**
   * Pin the strip while the panel scrolls. On by default — the kit calls the
   * region "sticky tab strip" in its own caption. Turn it off inside a
   * scrolling drawer, where a second sticky layer fights the drawer's own.
   */
  sticky?: boolean;
  /**
   * The strip's accessible name. Undefined leaves it unnamed, which is right
   * when the band's heading already names the record and the call site wires
   * `aria-labelledby` — so nothing is hardcoded here.
   */
  tabsLabel?: string;

  /* ---- Region 3 · the opaque panel ------------------------------------ */
  /** The panel's contents, when a tab carries no `content` of its own. */
  panel?: React.ReactNode;
  /** The reader may not see the panel: it renders nothing. */
  panelVisible?: boolean;
  /** Which body is drawn. Only the panel swaps; the other three regions stay. */
  state?: RecordDetailState;
  /** How many skeleton lines the loading panel draws. ch24.4's range is 2–5. */
  loadingLines?: number;
  /** What a screen reader hears while the panel loads. */
  loadingLabel?: string;
  /** The empty register's sentence — ch27.39, "every panel says what it is waiting for". */
  emptyTitle?: React.ReactNode;
  /** The line under it. */
  emptyDescription?: React.ReactNode;
  /** The one next step, where the panel is waiting on the reader. */
  emptyAction?: React.ReactNode;
  /** The error register's sentence. */
  errorTitle?: React.ReactNode;
  /** The line under it. */
  errorDescription?: React.ReactNode;
  /** The retry. */
  errorAction?: React.ReactNode;

  /* ---- Region 4 · the ink footer, CH27.8's two-column card -------------
     Chapter 26: it appears once per detail page and does not change per tab,
     so the whole card sits OUTSIDE the tab panels — below them, in the normal
     flow, never sticky. The two columns are independent: a call site may
     supply either, both, or neither, and neither draws no card at all rather
     than an empty one. ------------------------------------------------- */

  /**
   * THE RIGHT COLUMN — "Record", two to four key/value rows. Unchanged in
   * name and in type from before the footer was a card, so no call site had
   * to move; what changed is where it is drawn and that a row may now carry a
   * `label`.
   *
   * CH27.8 says two to four rows. That is not enforced — a component that
   * silently dropped a fifth row would hide data — but a call site passing
   * more is warned in development.
   */
  audit?: readonly RecordDetailAuditEntry[];
  /** The reader may not see the Record column: it renders nothing. */
  auditVisible?: boolean;
  /** The eyebrow over it. CH27.8's own word. */
  auditLabel?: React.ReactNode;

  /**
   * THE LEFT COLUMN — CH27.8's "short reverse-chronological feed". Composed
   * as `ActivityFeed`, never redrawn: override 18 already settled that row's
   * geometry for CH18, 27.9, 27.34 and this footer at once.
   *
   * THIS COMPONENT DOES NOT SORT. "Reverse-chronological" is a property of
   * what the caller hands over, and `ActivityFeed` says the same thing for
   * the same reason.
   *
   * SHORT is the caller's job too. The chapter draws two rows and the footer
   * is a summary, not the Activity tab; a route with fifty entries passes the
   * newest few and puts the rest in the tab.
   */
  activity?: readonly ActivityFeedItem[];
  /** The reader may not see the activity column: it renders nothing. */
  activityVisible?: boolean;
  /** The eyebrow over it. CH27.8's own words. */
  activityLabel?: React.ReactNode;
  /** The feed's accessible name, handed to `ActivityFeed`. */
  activityFeedLabel?: string;

  /**
   * CH27.8's add-a-note field, under the feed. Given, the field is drawn;
   * omitted, it is not — which is how the PORTAL door obeys the chapter's
   * "the portal never shows internal notes, only what was said to the
   * client": a portal route passes no handler and there is no field to press.
   *
   * Fires on Enter with the trimmed text, then clears. A blank field does
   * nothing.
   *
   * THIS IS NOT A FORM, and CH27.8's "this page never contains a form" still
   * holds. A form here would edit the record, which happens in 27.3's
   * slide-in. This appends a line to a log and changes no value on the page —
   * and the chapter draws the input itself, in this exact card.
   */
  onAddNote?: (value: string) => void;
  /** The field's placeholder AND its accessible name — CH27.8 draws no label. */
  notePlaceholder?: string;

  /**
   * The reader may not see the footer AT ALL. Distinct from `auditVisible`,
   * which hides only the Record column: a route that shows a client their own
   * record hides the internal log with `activityVisible`, and a route that
   * may show neither hides the card.
   */
  footerVisible?: boolean;
}

/**
 * The word over each of the ink footer's two columns — CH27.8 draws both at
 * 11 / 500 / uppercase / 0.08em in the quieter ink. `text-micro` carries the
 * size, the leading AND the 0.08em together (tokens.css §5), which is why no
 * tracking is written here; the ink is `--ink-tertiary`, which the card's own
 * rebinding has already pointed at `--ink-on-inverse-secondary`.
 *
 * Local, and deliberately not exported: the footer's parts are never
 * addressable from outside, because the card is one object per record.
 */
function RecordFooterEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
      {children}
    </span>
  );
}

/**
 * A record, in its four regions.
 *
 * TEN STATES
 *  1. default        — band, hero, strip, panel, ink footer, in that order.
 *                      27.8: "That order never changes", so no prop reorders
 *                      it and the footer is always the last child.
 *  2. hover          — does not apply to any region. Every hover here belongs
 *                      to a control inside one: the band's Buttons, the
 *                      strip's TabsTriggers, the panel's rows. A region that
 *                      responded to the pointer would light up on every
 *                      mouse move across a page-sized target.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Nothing in this file sets `overflow: hidden`; the one
 *                      scrolling box is `TabsList`, which carries its own
 *                      scroll padding so a tab's ring survives being scrolled
 *                      into view.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — per TAB only (`tab.disabled`), and even that is the
 *                      rarer case: ch24.6 rules that permissions HIDE, so the
 *                      normal answer for "the reader may not" is
 *                      `visible: false` and the region is absent. There is no
 *                      whole-record disable, because a record whose every
 *                      control is dead is a record that should have been
 *                      rendered read-only, not greyed.
 *  6. loading        — `state="loading"`: the PANEL is replaced with skeleton
 *                      lines. The band, the hero, the strip and the footer
 *                      stay drawn and stay put (ch27 law 4), so the page is
 *                      never seen to be built twice.
 *  7. empty          — `state="empty"`: the panel is replaced with chapter
 *                      21's register. ch27.39 — a record with nothing in it
 *                      yet is this composition with empty panels, "and each
 *                      one names what will fill it and who fills it", which
 *                      is why the register's strings are props rather than
 *                      defaults: only the call site knows who fills it.
 *  8. error          — `state="error"`: the register in its error tone,
 *                      `role="alert"`. The frame stays; a record that failed
 *                      to load its Activity tab has not stopped being a
 *                      record.
 *  9. selected       — the selected TAB, owned by `Tabs`, plus the current
 *                      STAGE, owned by `StatusStepper` (`aria-current="step"`).
 * 10. read-only      — the page, yes, and deliberately. ch27.8: "this page
 *                      never contains a form" — everything that CHANGES the
 *                      record happens in the slide-in panel of ch27.3.
 *                      THE ONE EXCEPTION IS THE CHAPTER'S OWN: the footer's
 *                      add-a-note field, which 27.8 draws in this exact card.
 *                      It edits no value on the page; it appends a line to a
 *                      log. It is opt-in per call site (`onAddNote`), which
 *                      is also how the portal door obeys "the portal never
 *                      shows internal notes, only what was said to the
 *                      client" — no handler, no field.
 *
 * THREE BREAKPOINTS
 *  mobile   — the band's actions WRAP under the title (`Title` does this
 *             itself, and the wrapped group sits at the inline start in line
 *             with the heading above it). The tab strip SCROLLS on the inline
 *             axis rather than wrapping — `TabsList`'s own answer, and the
 *             right one here: a two-line strip stops reading as one row of
 *             peers, and the strip is the thing that tells a reader what a
 *             record contains. THE INK FOOTER GOES TO ONE COLUMN, activity
 *             then Record, which is 27.8's own 380 specimen. That is a
 *             property of the box, not a breakpoint: `repeat(auto-fit,
 *             minmax(16.25rem, 1fr))` cannot land a second track in a ~340
 *             content box, so the card restacks at whatever width it is
 *             actually given — in a drawer, in a split pane, anywhere. The
 *             panel keeps its radius and takes the narrower inset
 *             `CardContent` already gives it at that width.
 *  tablet   — unchanged. The kit changes nothing at `sm`.
 *  desktop  — the panel's inset opens from 24 to 32 at `lg:`, which is
 *             `CardContent`'s own response and not something this file adds;
 *             the footer's inset opens with it, from 27.8's 18 / 20 to the
 *             ladder's 24 / 32. The four regions never become two columns:
 *             ch27 law 1 forbids a second spine outright — "no page-level
 *             split panes". THE FOOTER IS NOT A SECOND SPINE: it is two
 *             columns INSIDE one card at the bottom of the single reading
 *             column, which is what 27.8 draws and what law 1 is not about.
 *
 * RTL — safe. Every inset is logical, the band's actions are pushed by
 * `Title`'s `ms-auto`, the strip's indicator is measured against the computed
 * direction inside `Tabs`, `StatusStepper` orders its pills in DOM order, and
 * no rule in this file names a physical side.
 */
const RecordDetail = React.forwardRef<HTMLDivElement, RecordDetailProps>(
  (
    {
      className,
      eyebrow,
      title,
      meta,
      mark,
      actions,
      actionsVisible = true,
      titleSize = "h3",
      stages,
      currentStage = 0,
      onStageSelect,
      stagesVisible = true,
      stagesLabel,
      hero,
      tabs,
      tab,
      defaultTab,
      onTabChange,
      sticky = true,
      tabsLabel,
      panel,
      panelVisible = true,
      state = "ready",
      loadingLines = 4,
      loadingLabel = "Loading…",
      emptyTitle,
      emptyDescription,
      emptyAction,
      errorTitle,
      errorDescription,
      errorAction,
      audit,
      auditVisible = true,
      auditLabel = "Record",
      activity,
      activityVisible = true,
      activityLabel = "Latest activity",
      activityFeedLabel,
      onAddNote,
      notePlaceholder = "Add a note",
      footerVisible = true,
      ...props
    },
    ref,
  ) => {
    /* Permissions HIDE. A hidden tab is not in the strip at all, so it also
       cannot be the default value or be reached by keyboard. */
    const visibleTabs = React.useMemo(
      () => (tabs ?? []).filter((item) => item.visible !== false),
      [tabs],
    );

    /* The note field's own text. Uncontrolled on purpose: the value is in
       flight for the seconds between typing and Enter and belongs to nobody
       else, and a route that had to hold it would be holding a form — which
       CH27.8 says this page is not. The COMMITTED note leaves through
       `onAddNote` and becomes the caller's. */
    const [note, setNote] = React.useState("");

    /* ---- Region 4's two columns, decided once ------------------------- */
    const auditRows = auditVisible ? (audit ?? []) : [];
    const activityRows = activityVisible ? (activity ?? []) : [];
    const showRecordColumn = auditRows.length > 0;
    const showActivityColumn = activityRows.length > 0 || (activityVisible && onAddNote !== undefined);
    const showFooter = footerVisible && (showRecordColumn || showActivityColumn);

    if (process.env.NODE_ENV !== "production" && auditRows.length > 4) {
      // CH27.8: "two to four key/value rows". Warned, never truncated — a
      // component that silently dropped a row would hide a fact about the
      // record, which is worse than a footer that is one row too tall.
      console.warn(
        `RecordDetail: CH27.8 draws two to four rows in the footer's Record column, got ${auditRows.length}.`,
      );
    }

    const hasBand =
      eyebrow !== undefined ||
      title !== undefined ||
      meta !== undefined ||
      mark !== undefined ||
      (actionsVisible && actions !== undefined);

    const showStages = stagesVisible && stages !== undefined && stages.length > 0;
    const hasHero = showStages || hero !== undefined;

    /* ---- Region 3, built once and reused by every tab that has no body of
       its own. Chapter 26: the panel is the one OPAQUE region. ---------- */
    const panelBody = (content: React.ReactNode) => {
      if (!panelVisible) return null;

      let inner: React.ReactNode;
      if (state === "loading") {
        inner = (
          <ScreenRegister tone="loading" lines={loadingLines} loadingLabel={loadingLabel} />
        );
      } else if (state === "error") {
        inner = (
          <ScreenRegister
            tone="error"
            title={errorTitle}
            description={errorDescription}
            action={errorAction}
          />
        );
      } else if (state === "empty" || content === undefined || content === null) {
        inner = (
          <ScreenRegister
            tone="empty"
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        );
        // A panel with nothing to show and nothing to say draws nothing.
        if (inner === null) return null;
      } else {
        inner = content;
      }

      return (
        /* K1 REVERSED, 2026-08-23 — THE RECORD'S BODY IS SOFT PAPER.

           This was `variant="raised"` (`--card`, off-beige) on the belief
           that the page under it was `--surface-panel`. It is not: 26.04 is
           explicit — "The page itself is off-beige and every panel on it is
           soft paper: never the other way round" — and `ScreenShell`'s body
           pane is off-beige, so an off-beige panel on it measured 1.000 and
           the record's body did not exist as a shape. p16 draws it as the
           soft-paper slab under the underline tabs.

           `variant="default"` is `--surface-panel` with no lift, which is
           also what the specimen draws: a flat fill, no shadow, no stroke.
           The cards INSIDE it stay `raised` and are off-beige, which is the
           next alternation and the one that now reads at 1.103. */
        <Card
          variant="default"
          data-record-region="panel"
          className="min-w-0"
        >
          <CardContent>{inner}</CardContent>
        </Card>
      );
    };

    const strip =
      visibleTabs.length > 0 ? (
        <TabsList
          aria-label={tabsLabel}
          className={cn(
            // A sticky strip must be OPAQUE or the panel reads through it. It
            // takes the page tone, which is the tone the band already sits on,
            // so the two regions are the same paper. `-mx-*` + `px-*` widens
            // the opaque band past the strip's own content so a scrolled row
            // does not show through at the edges.
            sticky && "sticky top-0 z-10 bg-background",
          )}
        >
          {visibleTabs.map((item) => (
            <TabsTrigger key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
              {/* `line`'s asymmetric count — quiet text at rest, a small
                  mango circle with primary-ink text on the active tab only —
                  is `TabsCount`'s own shape (GAPS-RULINGS.md R-4a). Not a
                  `Badge`: a record's sections stay CH27's underline strip,
                  and this was the exact place a bare `Badge` had drifted from
                  that strip's own "quiet count" law before tonight's
                  ruling gave the active state somewhere to go instead. */}
              <TabsCount count={item.count} />
            </TabsTrigger>
          ))}
        </TabsList>
      ) : null;

    return (
      <div
        ref={ref}
        data-slot="record-detail"
        data-state={state}
        /* NO FILL. ch24.6: "The header band is transparent — it takes the page
           tone". The whole component is transparent; the panel is the only
           region that paints, which is what makes it read as opaque. */
        className={cn("flex w-full min-w-0 flex-col gap-[var(--space-3h)]", className)}
        {...props}
      >
        {/* ---- Region 1 · the transparent header band -------------------- */}
        {hasBand ? (
          <div
            data-record-region="header"
            /* 14 between the mark and the text, 4 of inline breathing so the
               band's type lines up with the panel's inset below it. */
            className="flex items-start gap-[var(--space-3h)] px-1"
          >
            {mark ? <span className="flex-none">{mark}</span> : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Title
                as="h1"
                size={titleSize}
                rule={false}
                eyebrow={eyebrow}
                actions={actionsVisible ? actions : undefined}
              >
                {title}
              </Title>
              {meta !== undefined && meta !== null ? (
                <span
                  data-slot="record-detail-meta"
                  className="text-badge tabular-nums text-ink-tertiary"
                >
                  {meta}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ---- The stage hero, chapter 23, above the strip --------------- */}
        {hasHero ? (
          <div data-record-region="hero" className="flex flex-col gap-3 px-1">
            {showStages ? (
              <StatusStepper
                stages={stages!}
                current={currentStage}
                onStageSelect={onStageSelect}
                label={stagesLabel}
              />
            ) : null}
            {hero}
          </div>
        ) : null}

        {/* ---- Regions 2 and 3 ------------------------------------------ */}
        {visibleTabs.length > 0 ? (
          <Tabs
            /* Client ruling E, 2026-08-22: "folder tabs are for main screens,
               line tabs for detail screens." A record IS the detail screen,
               so `line` is stated rather than inherited — the frame that
               draws collections now defaults to `folder`, and a default is
               not where a ruling should live. Settles REC-1. */
            variant="line"
            value={tab}
            defaultValue={defaultTab ?? visibleTabs[0].value}
            onValueChange={onTabChange}
            className="min-w-0 gap-[var(--space-3h)]"
          >
            {strip}
            {visibleTabs.map((item) => (
              <TabsContent key={item.value} value={item.value} className="min-w-0">
                {panelBody(item.content ?? panel)}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          panelBody(panel)
        )}

        {/* ---- Region 4 · CH27.8's ink card -----------------------------
            Chapter 26: "once per detail page … it does not change per tab",
            which is why it sits OUTSIDE the panels, and "not fixed, not
            sticky, not full-bleed", which is why nothing here pins it. It is
            the LAST child of the flow, which is 27.8's "then the ink footer.
            That order never changes." */}
        {showFooter ? (
          <Card
            variant="inverse"
            /* The dark clause's hairline. It costs no branch: `--hair` is
               inherited, so this inset is 8% charcoal over #1A1918 in light
               (no edge, as drawn) and 12% off-beige over #26241F in dark
               (the edge the chapter asks for). */
            hairline
            data-record-region="footer"
            className={cn(
              "min-w-0",
              // The two surfaces CH27.8 names. See the palette note at the
              // top of this file for why this is `light-dark()` and not a
              // Tailwind `dark:` variant.
              "bg-[var(--rd-footer-surface)] text-[var(--rd-footer-ink)]",
            )}
            style={
              {
                "--rd-footer-surface":
                  "light-dark(var(--surface-inverse), var(--surface-raised))",
                "--rd-footer-ink": "light-dark(var(--ink-on-inverse), var(--foreground))",
                /* RULED M2 / override 13. The quieter lines take the inverse
                   ground's own second ink in light; in dark the card is an
                   ordinary raised card, so they take the ordinary second ink.
                   Never an opacity — that is a standing rejection. */
                "--rd-footer-ink-2":
                  "light-dark(var(--ink-on-inverse-secondary), var(--ink-secondary))",
                /* The rules INSIDE the card, and both branches are now a plain
                   token. `--hair-inverse` landed in tokens.css on 2026-08-23
                   (the Part A audit, same day as this fix): it is the
                   artifact's own `--invhair`, and in light it is exactly the
                   rgba(255,254,249,.12) 27.8 draws these rules with. In dark
                   the card is an ordinary raised card, so its rules are the
                   ordinary `--hair` — which in dark holds that same value, so
                   the two branches agree by arithmetic as well as by rule. */
                "--rd-footer-hair": "light-dark(var(--hair-inverse), var(--hair))",
                /* The well a field or a mark sits in ON this card. 27.8 draws
                   the note field #26241F on the charcoal card, which is
                   `--kw-unlit-raised` — the paper is already in the file, so
                   no hex is written. In dark the card IS that paper, so the
                   well steps down to the page tone instead and the field
                   reads as a recess rather than vanishing. */
                "--rd-footer-well": "light-dark(var(--kw-unlit-raised), var(--background))",
              } as React.CSSProperties
            }
          >
            <CardContent
              /* 27.8's own insets where ruling 28's ladder has them (18 / 20
                 at the base width) and its neighbours where it does not (the
                 wide 26 / 30 → 24 / 32, which is `CardContent`'s own step).
                 GAPS-DEF1 Q1. */
              className={cn(
                "px-[var(--space-5)] py-[var(--space-4h)] lg:px-[var(--space-7)] lg:py-6",
                /* 27.8's grid, verbatim except for the unit: `repeat(auto-fit,
                   minmax(260px, 1fr))`. auto-fit is what makes "one column at
                   380" a property of the box rather than a breakpoint someone
                   has to remember — at 380 the card's content box is ~340 and
                   a second 16.25rem track cannot land. */
                "grid grid-cols-[repeat(auto-fit,minmax(16.25rem,1fr))] items-start",
                /* 32 BETWEEN the columns, 14 between them once they stack.
                   The chapter's two specimens, in one declaration. */
                "gap-x-[var(--space-7)] gap-y-[var(--space-3h)]",
              )}
              /* THE ONE REBINDING, and the reason `ActivityFeed`, `Input` and
                 `Avatar` can be composed onto a charcoal ground without any
                 of them learning this footer exists. tokens.css §8: "Inverse
                 surfaces flip the ring by rebinding the TOKEN, not by adding
                 a second rule."

                 EVERY ALIAS IS LISTED SEPARATELY, AND THAT IS NOT REDUNDANCY.
                 Measured on the built page, 2026-08-23: rebinding only the
                 SOURCES left the eyebrows at #5F5D59 on charcoal — 2.67:1 —
                 and every rule inside the card at 8% charcoal, invisible. A
                 custom property that references another is substituted on the
                 element where IT is declared, so `--ink-tertiary:
                 var(--muted-foreground)` and `--hairline: … var(--hair)` were
                 computed once on `:root` and inherited as fixed values; a
                 descendant moving `--muted-foreground` or `--hair` cannot
                 reach them. Both halves of each pair are therefore set here.
                 tokens.css §8's own `--focus: var(--focus-inverse)` works for
                 the same reason in reverse: it is declared on the element
                 that needs it.

                 THE THREE `--hairline*` SHAPES ARE RESTATED, NOT INVENTED.
                 They are tokens.css §4's own strings with this card's hair
                 substituted, and `0.0625rem` is how `date-picker.tsx` and
                 `tabs.tsx` already spell the grid line rather than writing a
                 px. tokens.css should grow a `--hair` that rebinds by ground —
                 exactly as `--focus` and `--btn-secondary-fill` already do —
                 and these three lines would go with it. GAPS-DEF1 Q3.

                   --foreground / --ink-primary   the primary ink
                   --muted-foreground / --ink-tertiary   the quiet ink
                   --ink-secondary                the second tier
                   --border / --hair              the hair itself
                   --hairline / -under / -strong  the shapes that carry it
                   --card / --surface-raised / --background / --pill-fill
                                                  the well under a mark, a
                                                  pill or a field
                   --focus                        ruling 24's one ring, on the
                                                  ink that reads on this card

                 Declared HERE and not on the card above, because the values
                 are computed from tokens this element overrides and a custom
                 property may not depend on its own element. */
              style={
                {
                  "--foreground": "var(--rd-footer-ink)",
                  "--ink-primary": "var(--rd-footer-ink)",
                  "--muted-foreground": "var(--rd-footer-ink-2)",
                  "--ink-tertiary": "var(--rd-footer-ink-2)",
                  "--ink-secondary": "var(--rd-footer-ink-2)",
                  "--border": "var(--rd-footer-hair)",
                  "--hair": "var(--rd-footer-hair)",
                  "--hairline": "inset 0 0 0 0.0625rem var(--rd-footer-hair)",
                  "--hairline-under": "inset 0 -0.0625rem 0 var(--rd-footer-hair)",
                  "--hairline-strong": "inset 0 0 0 0.0625rem var(--rd-footer-hair)",
                  "--card": "var(--rd-footer-well)",
                  "--surface-raised": "var(--rd-footer-well)",
                  "--background": "var(--rd-footer-well)",
                  "--pill-fill": "var(--rd-footer-well)",
                  "--focus": "var(--rd-footer-ink)",
                } as React.CSSProperties
              }
            >
              {/* ---- Left · Latest activity ---------------------------- */}
              {showActivityColumn ? (
                <div data-record-region="footer-activity" className="min-w-0">
                  <RecordFooterEyebrow>{activityLabel}</RecordFooterEyebrow>
                  {activityRows.length > 0 ? (
                    /* COMPOSED, never redrawn — override 18 owns this row. */
                    <ActivityFeed
                      items={[...activityRows]}
                      label={activityFeedLabel}
                      className="mt-3"
                    />
                  ) : null}
                  {onAddNote === undefined ? null : (
                    <Input
                      type="text"
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        const written = note.trim();
                        if (written === "") return;
                        event.preventDefault();
                        onAddNote(written);
                        setNote("");
                      }}
                      /* 27.8 draws no label beside this field, so the
                         placeholder is the accessible name as well — the one
                         case where that is not a shortcut, because the field
                         is one word long and sits under its own eyebrow. */
                      placeholder={notePlaceholder}
                      aria-label={notePlaceholder}
                      /* 38 — ruling 28's "field inside a row", which is what
                         27.8 draws here rather than `Input`'s standing 44. */
                      className="mt-[var(--space-3h)] h-[var(--control-height-field)] text-caption"
                    />
                  )}
                </div>
              ) : null}

              {/* ---- Right · Record ------------------------------------ */}
              {showRecordColumn ? (
                <div data-record-region="footer-record" className="min-w-0">
                  <RecordFooterEyebrow>{auditLabel}</RecordFooterEyebrow>
                  <div className="mt-3 flex min-w-0 flex-col">
                    {auditRows.map((entry, index) => (
                      <div
                        key={entry.id ?? String(index)}
                        className={cn(
                          "flex min-w-0 items-baseline justify-between gap-4 py-2",
                          /* Inset shadow, never a border — the artifact draws
                             every rule this way. The last row drops it. */
                          "shadow-[var(--hairline-under)] last:shadow-none",
                        )}
                      >
                        {entry.label === undefined || entry.label === null ? (
                          /* No key: the older single-phrase reading, kept so
                             a call site that predates the card still draws. */
                          <span className="min-w-0 text-caption tabular-nums">
                            {entry.children}
                          </span>
                        ) : (
                          <React.Fragment>
                            <span className="min-w-0 text-caption text-ink-tertiary">
                              {entry.label}
                            </span>
                            <span className="min-w-0 text-caption tabular-nums">
                              {entry.children}
                            </span>
                          </React.Fragment>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  },
);

RecordDetail.displayName = "RecordDetail";

export { RecordDetail };
