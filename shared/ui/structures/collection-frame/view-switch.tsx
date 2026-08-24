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
       BUTTONS. One pill, showing the CURRENT view's name, with a caret. The
       repo's transcriptions read it the same way — INVENTORY-1 calls it the
       "view-switch dropdown"; INVENTORY-3's region table calls it "a paper
       `Board ▾` view-switch pill". A `ToggleGroup` was proposed on
       `verify/decide-2.html` §D7-5; it is not what the chapter draws, and the
       drawing wins.
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
} from "../../controls/select/select";

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
 *  1. default        — a paper pill, the current view's name at weight 500,
 *                      and the caret. CH19 and CH27.24 draw the same pill.
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
 *  9. selected       — the current view. It is the pill's own label, and
 *                      `SelectItem` draws the tick on the open row.
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

    return (
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          ref={ref}
          data-slot="view-switch"
          aria-label={label}
          className={cn(
            /* What this control changes about `SelectTrigger`, and nothing
               else. Everything unlisted — the pill radius, the caret, the
               open ink, the disabled fill — is `select.tsx`'s and is not
               restated here.

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
            "w-auto min-w-0 h-[var(--control-height-button)]",
            "shadow-none bg-[var(--btn-secondary-fill)] text-[var(--btn-secondary-label)]",
            "enabled:hover:bg-[var(--btn-secondary-hover)]",
            "font-[var(--font-weight-medium)]",
            className,
          )}
          {...props}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {views.map((view) => (
            <SelectItem key={view.value} value={view.value} disabled={view.disabled}>
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
