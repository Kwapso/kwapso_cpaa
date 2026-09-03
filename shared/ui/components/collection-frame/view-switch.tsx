"use client";

/* ============================================================================
   ViewSwitch — ZONE 3 OF THE TOOLBAR. The control that swaps the body.

   WHY THIS FILE EXISTS AT ALL
   Client feedback, round 1, item 4, verbatim: *"you missed a full section of
   the toolbar which is the view selector! review the screenshot from the
   claude design! its explained there! 1 search 2 filters 3 views 4 buttons"*.

   The client is right and the miss was total. `CollectionFrame` has carried a
   `viewSwitch` SLOT since it was written, and CH19's contract has been quoted
   in three files — but no control was ever drawn to stand in it, and no route
   in either door passed one. The slot was a hole with a name.

   ─────────────────────────────────────────────────────────────────────────
   WHAT THE ARTIFACT DRAWS. FOUND, NOT CHOSEN.
   ─────────────────────────────────────────────────────────────────────────
   "Kwapso UI Kit.dc.html" draws this control three times and the three
   drawings agree on every measurement.

     1. CH19, the 24-view catalogue, in the toolbar every specimen opens with:

          <div style="display: inline-flex; align-items: center; gap: 8px;
                      padding: 9px 8px 9px 16px; border-radius: 999px;
                      background: var(--card); flex: 0 0 auto;">
            <span style="font-size: 13px; font-weight: 500;">{{ v.short }} view</span>
            <svg viewBox="0 0 12 8" width="9" height="6" style="opacity: .5;">…</svg>
          </div>

     2. CH27.24, the assembled board screen: the same pill, reading
        `Board` with the same 9x6 caret at 50%.

     3. CH27's second board specimen: `Board` and the caret again.

   So, settled by the drawing and not by taste:

     · IT IS A DROPDOWN, NOT A SEGMENTED CONTROL AND NOT A ROW OF ICON
       BUTTONS. One pill, showing the CURRENT view's name. (The chapter draws
       a caret after the name; the client removed it on 2026-09-02 — see THE
       PILL'S CONTENTS below. What the drawing settles is the CONTROL, and a
       dropdown is still what this is.) The repo's transcriptions read it the
       same way — INVENTORY-1 calls it the "view-switch dropdown";
       INVENTORY-3's region table calls it "a paper `Board ▾` view-switch
       pill". A `ToggleGroup` was proposed on `verify/decide-2.html` §D7-5; it
       is not what the chapter draws, and the drawing wins.
     · IT IS A PAPER PILL, NOT A FIELD. In CH19's own toolbar row the SEARCH
       pill carries `box-shadow: inset 0 0 0 1px var(--hair)` and this one
       carries none — the chapter draws the distinction twice in one row. So
       the resting skin here is the `Export` pill's, which is
       `--btn-secondary-fill`, re-resolved by the panel to off-beige. CH27.1:
       "both keeping their round off-beige well, which is what makes them read
       as buttons on a soft-paper toolbar".
     · ITS LABEL IS 500. The artifact writes the weight on this pill and on
       no other in the row — `Export` and `Group` inherit 300 there. MEASURED
       IN THE BUILD, the difference does not survive: `button.tsx` already
       sets `--font-weight-medium` on every variant, so every pill in this
       toolbar is 500 and this one matches rather than stands out. The weight
       is written here because the chapter writes it; whether the build's
       action pills should step back down to 300 to restore the artifact's
       contrast is `button.tsx`'s question, not this file's, and is reported
       rather than taken.
     · WHERE IT SITS: after the filters, before the actions. That is
       `CollectionFrame`'s slot 4 and the frame already places it. CH27.13:
       "Toolbar order never changes: search, then filters, then view switcher,
       then actions pinned right."

   ─────────────────────────────────────────────────────────────────────────
   THE PILL'S CONTENTS — CLIENT, 2026-09-02, OVERRIDING THE CHAPTER'S CARET
   ─────────────────────────────────────────────────────────────────────────
   Two rulings, one breath, both verbatim:

     "same on views - rmeove the chevron"

     "on the view, on the left of teh word, add an icon inside tha pill that
      represents the view (we will map this later, so far put a random icon)
      same positio as the arrow on the left of srot, but without the splitted
      pill"

   So the pill is now [icon, label] where the chapter drew [label, caret].

     · THE CARET GOES. `hideChevron` on `SelectTrigger` — the opt-out lives
       there because the glyph is `SelectPrimitive.Icon`'s and no class at
       this call site could take its RESERVED ROOM with it. `SortControl`'s
       field took the same ruling in the same breath, so the toolbar's three
       pills — filter chip, sort chip, view pill — stay one family, and that
       family is now caret-free throughout. The filter chip never had one.
     · THE ICON ARRIVES, LEADING, INSIDE THE ONE PILL. "Same position as the
       arrow on the left of sort" is about WHERE, and the client closes the
       door on the rest herself: "but without the splitted pill". So this
       control does NOT grow a segment, a divider or a second rounding — no
       `rounded-s-*`, no fused edge, nothing of `SortControl`'s two-half
       geometry. One pill, `justify-start`, the trigger's own `gap-2` between
       glyph and word.
     · THE SIZE IS THE KIT'S, NOT A LITERAL. `size={16}` resolves through
       `icon-base.tsx`'s SIZE_TOKEN to `var(--icon-16)`, which is what
       `--icon-button` also is — the same 16 the caret it replaces was drawn
       at, so the pill's width does not move: 16 of glyph and 8 of gap out,
       16 of glyph and 8 of gap in. Measured: verify/toolbar-trio.
     · THE GLYPH IS A PLACEHOLDER AND THE API IS THE POINT. See
       `CollectionViewOption.icon` — the mapping is the client's and it is
       not made here.

   ─────────────────────────────────────────────────────────────────────────
   WHICH VIEWS IT OFFERS IS DATA, AND IT IS THE CALL SITE'S
   ─────────────────────────────────────────────────────────────────────────
   The kit ships many collection bodies and the artifact is explicit that they
   are NOT all offered everywhere. CH27.28, verbatim:

       "Gallery appears in the view switcher for deliverables, assets and
        screens. It is never offered for tickets, accounts or sprints — an
        image-led view of text records is a grid of empty boxes pretending to
        be content."

   So the offered set is per-collection data, never a constant in a component.
   `views` is a required prop and this file ships NO default list, NO default
   labels and NO opinion about which collection gets which body. That is
   product vocabulary; inventing it is a thing this project has already been
   corrected for. The mechanism is here; the sets belong to the routes.

   ─────────────────────────────────────────────────────────────────────────
   A SWITCHER OFFERING ONE VIEW IS CHROME — SO IT IS NOT DRAWN
   ─────────────────────────────────────────────────────────────────────────
   Fewer than two options renders `null`. Not a disabled pill, not a pill with
   nowhere to go.

   This is not a new decision, it is the existing one made general. `/meetings`
   already ships its table body and "draws no view switch at all, because a
   switcher offering one view is chrome and a calendar option landing nowhere
   is worse" (OPEN.md §C21). That reasoning was a route's; putting it in the
   component means no route has to remember it, and the rule cannot be applied
   on one screen and forgotten on the next.

   ─────────────────────────────────────────────────────────────────────────
   D7-5 IS RULED: REMEMBERED, PER PERSON. THIS FILE STILL STORES NOTHING.
   ─────────────────────────────────────────────────────────────────────────
   CH27's closing paragraph names "the saved switch between calendar and
   table" as one of five rules the artifact itself says it still owes. It was
   OPEN.md §C21 item 5 and decision D7-5. It is answered.

   Client, 2026-08-24, verbatim: **"no. this is individual"**, to *"when you
   switch your view, should a colleague's screen change too?"*. That is
   option B — the choice is REMEMBERED and it is PER PERSON. It follows the
   person who made it; no other screen moves. A reader who has never chosen
   gets the page's recommendation, which is **table-first**. Register row 69.

   THE CONTROL IS STILL CONTROLLED ONLY, AND THAT IS NOW A DECISION RATHER
   THAN A GAP. "Remembered, per person" names a PERSON and a PLACE TO PUT
   THINGS, and a design system vendored into two Next.js apps owns neither.
   Reaching for `localStorage` here would give an app that already keeps user
   preferences on its own server two stores answering one question, with the
   kit's winning every first paint. So `value` is required, there is no
   `defaultValue` and there is no storage in this file.

   WHAT THE KIT SHIPS INSTEAD, and it is the whole of the ruling:

     · THE CONTRACT. `value` in, `onValueChange` out — see both props below.
       The application owns the store and it must be keyed by the PERSON,
       never by the workspace or the team. That is the word "individual".
     · THE FIRST-RUN DEFAULT. `views[0]`, and the rule given to routes is
       that the TABLE GOES FIRST. The kit cannot check this — which of a
       route's views is the table is that route's vocabulary — so it is
       written down in three places rather than enforced in one.
     · AN OPTIONAL HOOK, `useRememberedView` in `use-remembered-view.ts`,
       for an app that has nothing better. It keeps the choice in one browser
       profile, which is one person. An app with a real per-user preference
       store should not import it.

   THE LAW THIS FILE OBEYS
   · The order is the frame's, not this file's. This control knows nothing
     about where it stands.
   · Mango appears nowhere. Choosing a view is not the screen's one action.
   · Focus is one global rule (tokens.css §8). Nothing here draws a ring.
   · Disabled is a fill and an ink, never an opacity — `SelectTrigger`'s own.
   · Every user-facing string is a prop with a default.
   · No token is added. Every value here already exists.

   RENDERING CONTEXT
   `"use client"`. `Select` is a client component and this file passes it a
   handler.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select/select";
import { SquaresFour } from "../../foundations/icons";

/* THE PLACEHOLDER GLYPH, AND IT IS ONLY THAT.

   Client, 2026-09-02: *"we will map this later, so far put a random icon"*.
   `SquaresFour` is the kit's most view-shaped neutral and it is drawn for EVERY
   view until a mapping arrives, on purpose: one glyph repeated down the
   toolbar reads as "not yet assigned", where four different glyphs invented
   here would read as a decided mapping and would have to be un-decided later.
   The mapping is product vocabulary — which body is the table, which is the
   board, which is the calendar — and inventing that is a thing this project
   has already been corrected for. See `CollectionViewOption.icon`. */
const PLACEHOLDER_VIEW_ICON = <SquaresFour size={16} />;

export interface CollectionViewOption {
  /** Stable key, passed back to `onValueChange`. */
  value: string;
  /**
   * What the pill and the row say. The artifact writes `Board` on an
   * assembled screen and `Board view` in the catalogue — both are just this
   * string, and neither is a name this file invents. Translatable at the call
   * site, where the data is.
   */
  label: string;
  /**
   * The glyph that stands for THIS view, drawn leading the label inside the
   * pill when this is the current view.
   *
   * **THE MAPPING IS NOT MADE YET AND IT IS NOT THIS FILE'S.** Client,
   * 2026-09-02, verbatim: *"add an icon inside tha pill that represents the
   * view (we will map this later, so far put a random icon)"*. Until she maps
   * them, every view that leaves this undefined falls back to the SAME
   * placeholder (`SquaresFour`) — deliberately, so an unmapped toolbar reads as
   * unmapped rather than as a mapping someone here chose.
   *
   * It is per-VIEW rather than one icon on the control because that is what
   * "represents the view" means: the glyph has to change when the body does.
   * So the mapping, when it comes, is data at the call site and no component
   * changes —
   *
   * ```tsx
   * const VIEWS = [
   *   { value: "table",    label: "Table",    icon: <Table2Columns size={16} /> },
   *   { value: "board",    label: "Board",    icon: <ViewColumns3 size={16} /> },
   *   { value: "calendar", label: "Calendar", icon: <Calendar size={16} /> },
   * ];
   * ```
   *
   * — any of the kit's glyphs, at the 16 delivery size, which resolves to
   * `--icon-16` through `icon-base.tsx` rather than to a literal. The names
   * above are an EXAMPLE of the shape, not a proposal for the mapping.
   */
  icon?: React.ReactNode;
  /** Offered but not available right now. A fill and an ink, never an opacity. */
  disabled?: boolean;
}

export interface ViewSwitchProps
  extends Omit<
    React.ComponentPropsWithoutRef<"button">,
    "onChange" | "value" | "defaultValue" | "children"
  > {
  /**
   * The bodies THIS collection offers. Required, and never defaulted:
   * CH27.28 makes the set per-collection data ("Gallery … is never offered
   * for tickets, accounts or sprints"). Fewer than two and nothing is drawn.
   *
   * **PUT THE TABLE FIRST.** `views[0]` is the first-run view for a reader
   * who has never chosen — ruling D7-5's table-first recommendation — and
   * nothing in the kit can check which entry is the table.
   */
  views: CollectionViewOption[];
  /**
   * The body on screen. CONTROLLED ONLY, and it stays that way now D7-5 is
   * ruled — see the header. The choice is remembered PER PERSON, and the
   * store that remembers it is the application's: read it into this prop,
   * write it back from `onValueChange`. A store keyed by anything shared —
   * the workspace, the team, the account — would move a colleague's screen,
   * which is the thing the client said no to. `useRememberedView` is there
   * for an app with nothing better.
   */
  value: string;
  /**
   * The reader picked a different body. This is where the choice is written
   * back to whatever remembers it for this one person.
   */
  onValueChange?: (value: string) => void;
  /**
   * What a screen reader hears. The artifact draws no visible label on this
   * pill — the pill's own text is the current view — so the control's name is
   * given here rather than rendered.
   */
  label?: string;
  /** The whole control is unavailable. */
  disabled?: boolean;
}

/**
 * The toolbar's view switcher: one paper pill naming the current body.
 *
 * TEN STATES
 *  1. default        — a paper pill: the current view's glyph, then its name
 *                      at weight 500. NO caret, and the glyph is a
 *                      PLACEHOLDER — both client, 2026-09-02, see the header.
 *                      CH19 and CH27.24 draw the same pill otherwise.
 *  2. hover          — the secondary button's own wash,
 *                      `--btn-secondary-hover`. Same as the `Export` pill
 *                      standing beside it, because it is the same skin.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius.
 *  4. active/pressed — not drawn. Opening a picker IS the acknowledgement,
 *                      and the pill would nudge out from under the list.
 *  5. disabled       — a fill and an ink, `SelectTrigger`'s own, never an
 *                      opacity. Also per option, via `views[].disabled`.
 *  6. loading        — does not apply. The set of views a collection offers
 *                      is a fact about the collection, known before its rows
 *                      arrive; a busy switcher would be a spinner over a
 *                      list that was never in flight.
 *  7. empty          — fewer than two views renders NOTHING. A switcher
 *                      offering one view is chrome; `/meetings` already made
 *                      that call and this generalises it.
 *  8. error          — does not apply. Nothing here fetches.
 *  9. selected       — the current view. It is the pill's own label AND the
 *                      pill's own glyph, and `SelectItem` draws the tick on
 *                      the open row.
 * 10. read-only      — a collection whose body may not be swapped is passed
 *                      one view, so state 7 already covers it. Nothing is
 *                      dimmed to say so.
 *
 * THREE BREAKPOINTS
 *  The pill is the same control at every width — it is one of the two things
 *  the artifact's narrow toolbar keeps ("the toolbar collapses to one field
 *  or one select", INVENTORY-3; 27.24's narrow board is "a single white
 *  select field"). It shrinks rather than wraps: `min-w-0` on the trigger and
 *  `SelectTrigger`'s own truncation keep a long view name inside the pill
 *  instead of pushing the toolbar past the panel.
 *
 * RTL — LTR only by client ruling. Logical properties throughout.
 */
const ViewSwitch = React.forwardRef<HTMLButtonElement, ViewSwitchProps>(
  ({ className, views, value, onValueChange, label = "View", disabled, ...props }, ref) => {
    /* STATE 7. A switcher offering one view is chrome — OPEN.md §C21, and
       `/meetings`'s standing decision made general. Zero is the same case. */
    if (views.length < 2) return null;

    /* The glyph belongs to the view ON SCREEN, so it is looked up from
       `value` rather than held in state — the pill has no memory of its own
       and `value` is the only truth about which body is showing (see the
       prop). An unmapped view falls back to the placeholder, which is the
       whole toolbar today. */
    const currentIcon = views.find((v) => v.value === value)?.icon ?? PLACEHOLDER_VIEW_ICON;

    return (
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          ref={ref}
          data-slot="view-switch"
          aria-label={label}
          /* NO CARET — client, 2026-09-02: "same on views - rmeove the
             chevron". See the header for why the opt-out is a prop on
             `SelectTrigger` and not a class here. */
          hideChevron
          className={cn(
            /* What this control changes about `SelectTrigger`, and nothing
               else. Everything unlisted — the pill radius, the open ink, the
               disabled fill — is `select.tsx`'s and is not restated here.

               · ALIGNMENT. `justify-start`. The base is `justify-between`,
                 which is right for a field holding [value, caret] and wrong
                 for a pill holding [glyph, label]: between would push the two
                 to opposite ends of the pill instead of setting the glyph
                 beside the word. `SortControl`'s field needs no such override
                 — it has one child left, and one child starts at the start.

               · WIDTH. `w-auto`: the pill is as wide as the view's name, not
                 a form field filling a column. `SortControl` makes the same
                 change for the same reason.
               · HEIGHT. 40, `--control-height-button` — the standing control
                 height, and what the toolbar's other pills are. The 44 is a
                 FORM field's and this is not one.
               · FILL AND NO HAIRLINE. CH19 draws the search pill with
                 `inset 0 0 0 1px var(--hair)` and this pill with none, in the
                 same row. `--btn-secondary-fill` is the `Export` pill's fill
                 and the panel re-resolves it to off-beige, which is the
                 chapter's `var(--card)` exactly. The hover comes with it.
                 `shadow-none` drops only the RESTING edge; `select.tsx`'s
                 focus and open rules are variant-prefixed and survive, so
                 CH09's "the hairline goes to ink" still happens while the
                 list is open — which is the whole of the affordance on a
                 control with no resting edge.
               · WEIGHT. 500, which is what both drawings write on this pill.
                 `SelectTrigger`'s own base is 300, so it has to be said here;
                 `button.tsx` already ships 500, so the neighbouring pills
                 match rather than contrast. See the header. */
            "w-auto min-w-0 h-[var(--control-height-button)] justify-start",
            "shadow-none bg-[var(--btn-secondary-fill)] text-[var(--btn-secondary-label)]",
            "enabled:hover:bg-[var(--btn-secondary-hover)]",
            "font-[var(--font-weight-medium)]",
            className,
          )}
          {...props}
        >
          {/* THE VIEW'S GLYPH, LEADING, INSIDE THE ONE PILL — client,
              2026-09-02. Sized from `--icon-16` on the box AND on whatever
              the call site passed, so a mapped icon that forgot its `size`
              still lands at the kit's 16 rather than at an SVG's own 24. Ink
              is the cva's `[&_svg]:text-ink-secondary`, which is where the
              caret's colour came from and is why the disabled skin still
              reaches it. `aria-hidden`: `aria-label` names the control and
              `SelectValue` says which view, so the glyph is decoration and
              must not be read as a third thing. */}
          <span
            aria-hidden="true"
            data-slot="view-switch-icon"
            className={cn(
              "inline-flex size-[var(--icon-16)] shrink-0 items-center justify-center",
              "[&_svg]:size-[var(--icon-16)]",
            )}
          >
            {currentIcon}
          </span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* THE OPEN ROWS CARRY THE SAME GLYPH THE TRIGGER DOES — CLIENT,
              2026-09-03: "when I open the dropdown, apart from the text, I
              also see the icon." The trigger has shown a leading icon since
              2026-09-02; the list this pill opens did not, which was the gap
              — `SelectItem` has carried an `icon` prop since ch10 for exactly
              this ("a module is identified by its icon, in the rail, on the
              record AND in a picker"), and it was simply never passed here.

              ONE SOURCE OF TRUTH, NOT A SECOND MAPPING. `view.icon` is the
              same field `currentIcon` reads above, with the same placeholder
              fallback, so the row a reader opens always shows the glyph the
              pill will collapse back to once they pick it — no icon is
              invented per row and none is looked up twice.

              `SelectItem` already draws this `aria-hidden`, at `--icon-16`,
              beside — not instead of — the `ItemIndicator` tick, so the
              row's accessible name stays `view.label` and the selection mark
              this list already drew is untouched. */}
          {views.map((view) => (
            <SelectItem
              key={view.value}
              value={view.value}
              disabled={view.disabled}
              icon={view.icon ?? PLACEHOLDER_VIEW_ICON}
            >
              {view.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  },
);

ViewSwitch.displayName = "ViewSwitch";

export { ViewSwitch };
