"use client";

/* ============================================================================
   Rail — THE NAVBAR. Shape 0c, the third region of the shell.

   WHY THIS FILE EXISTS AT ALL
   `ScreenShell` has taken a `rail` node since the day the four levels were
   built, and NOTHING IN THE DELIVERY DREW ONE. No `components/` folder, no
   `compositions/` file, and not one route supplied a value — every route
   threads `rail` straight through to the shell and every route left it
   undefined. Forty screens rendered with no navigation in them.

   That is worse than a missing component, because the client's own test for
   the two screen types is:

       "a main screen is IN THE NAVBAR; a detail screen has breadcrumbs."

   The navbar was the half of that test the delivery could not draw. A mini
   app assembled one out of `Button` and `Avatar` an hour before this file was
   written, purely so it could exist; that stopgap is superseded by this and
   `mini-app/rail.tsx` now imports from here.

   ─────────────────────────────────────────────────────────────────────────
   CLIENT FEEDBACK, ROUND 1, 2026-08-24 — TWO CHANGES, BOTH IN THIS FILE
   ─────────────────────────────────────────────────────────────────────────
   Verbatim, both about this component:

     (1) "on sidebar, where there's the person name, i want only the first
          name, not full name. Also, no role. remove the role"
     (2) "on the sidebar, 'sections' have no icons, but pages do (the
          opposite as now)"

   (1) THE FIRST NAME IS A SEPARATE PROP AND IS NEVER DERIVED. `RailMember`
   gains `givenName`, and the chip draws `givenName ?? name`. THIS FILE DOES
   NOT SPLIT THE NAME, and that is a correctness decision, not fastidiousness:
   splitting on whitespace takes "María" out of "María José", "van" out of
   "van der Berg", the FAMILY name out of any register written family-first,
   and half a mononym out of a mononym. The kit ships `Languages`, an RTL
   audit in every component header and three RTL locales named in the repo
   (Arabic, Urdu, Persian) — a component that guesses at a name would be wrong
   in production on day one. The APPLICATION holds the person record and knows
   which field is the given name; the component cannot infer it and does not
   try. A call site that passes no `givenName` gets the full name, unchanged
   and uncut, which is the only safe fallback.

   AND THE FULL NAME SURVIVES FOR ASSISTIVE TECHNOLOGY. A screen reader that
   announced "María" where the record says "María José García" would be worse
   off than a sighted reader, which is a loss and not a simplification. So
   when the two differ the visible given name is `aria-hidden` and the FULL
   name is carried in an `sr-only` span: the eye reads the first name, the
   accessible name of the chip is the whole one, and neither is said twice.
   When they are the same the chip renders one span and nothing is hidden.
   Collapsed, the tooltip has always carried `member.name` and still does.

   `role` STOPS RENDERING. The prop is kept — it is typed, it is documented as
   removed, and it draws nothing anywhere — because the kit is vendored into
   two applications this repo cannot see and a deleted field is a build break
   for a change that is purely visual. Every call site in this repo has had it
   removed. See `RailMember.role`.

   AND THE CHIP'S GEOMETRY WAS RE-LOOKED AT, NOT JUST SHORTENED. Two lines of
   14/500 over 13/300 measured ~37.8 tall, which is TALLER than the 32 avatar
   beside them — so the TEXT was setting the chip's height and the avatar was
   floating in ~5.8 of slack. One line measures ~19.6, so THE AVATAR NOW SETS
   THE HEIGHT and the `--space-1` padding around it becomes real: 4 + 32 + 4 =
   40, a 999 pill whose radius (20) is the avatar's (16) plus its own padding,
   which is the concentric chip the kit draws everywhere else. Nothing had to
   be added to hold it up; the two-line chip was the one that was loose. The
   flex COLUMN that stacked the name over the role is gone with the role —
   a one-item column is a box that only reads as a mistake later.

   (2) THE ICONS SWAP SIDES, AND THE ARTIFACT AGREES WITH THE CLIENT. Checked
   rather than taken on trust, in three places:

     · 26.02's own sidebar specimen draws an icon on EVERY destination —
       `<svg viewBox="0 0 24 24" width="14" height="14">`, five of them, one
       per row, `opacity:.65` when idle and full when lit — and NO icon on a
       group heading. What sits beside a group label there is a `0 0 12 8`
       9x6 TRIANGLE at `opacity:.5`, rotated -90° on the closed group: that
       is the COLLAPSE CHEVRON, which the same chapter names twice ("Grouped
       sections with a collapse chevron per group"; "Group collapse (chevron,
       left) is separate and persists per user"). It is a control, not a
       glyph.
     · The System template — the source of the client's own reference
       screenshot, with Today / Meetings / Tasks / Apps / Sprints / Tickets /
       Backlog / Accounts / Audits / Capacity / Settings under MY WORK, BUILD,
       COMPANY, SYSTEM — draws `<path d="{{ item.icon }}">` on every
       destination and the same 9x6 chevron on every heading.
     · Chapter 27's assembled miniatures draw neither: bare labels under bare
       uppercase headings, because they are miniatures.

   So the build had it exactly backwards, and the reason is visible on screen:
   `icon` had no default so no destination drew one, while the heading's
   chevron rendered in the repo's PLACEHOLDER artwork — a rounded square with
   dots, not a triangle — and therefore read as an icon. The client was
   pointing at the chevron.

   WHAT WAS DONE WITH THE CHEVRON, AND IT IS A JUDGEMENT. It could not simply
   be deleted: it is the group's only collapse affordance and the chapter
   states the feature twice. It could not stay where it was: it is the thing
   the client asked to remove. So IT MOVED TO THE TRAILING EDGE OF THE
   HEADING, hugging the label rather than pinned to the column's far side, so
   the heading now BEGINS with bare uppercase type — which is what the
   client's reference reads as — and the disclosure survives, with its
   `aria-expanded` and its rotation, in the position a disclosure conventionally
   takes when the label leads. The only thing lost is the chapter's word
   "left", which this file could never honour literally anyway: every inset in
   here is logical because the rail runs in RTL. Logged in the register; if
   the client wants the chevron gone outright, that is one line and it costs
   the group collapse.

   WHAT AN ENTRY WITH NO ICON DOES IS NOW A REAL QUESTION, AND THE RULE IS
   PER-RAIL, NOT PER-ENTRY. If ANY destination in the rail carries an icon,
   EVERY destination reserves a `--icon-button` slot — empty where there is no
   glyph — so one icon-less entry cannot pull its label 24px left of its
   neighbours. If NO destination carries one, no slot is drawn at all and the
   labels sit flush, which is what chapter 27's miniatures draw and what a
   rail whose application has not chosen a vocabulary should look like. The
   alternative — always reserve — indents every label in an icon-less rail
   past an empty column, which is a defect on 40 screens to protect a case
   that cannot arise there.

   NO GLYPH IS INVENTED FOR A NAMED DESTINATION. That refusal stands and this
   change does not touch it: what moved is the LAYOUT. `icon` still has NO
   DEFAULT on `RailItem`. The one register that gained glyphs is
   `PLACEHOLDER_GROUPS`, whose WORDS are already the kit's placeholders — see
   the note there.

   ─────────────────────────────────────────────────────────────────────────
   THE CLIENT RULED ON BOTH OF THIS FILE'S OPEN QUESTIONS, 2026-08-24
   ─────────────────────────────────────────────────────────────────────────
   Shown `verify/decide.html`, the client answered:

     D1 = A, WITH A CONDITION. Verbatim: "d1- a. but also variations depending
     on light/dark and the settings of the navbar. see screenshots for
     reference." So the active row STAYS MANGO, per 26.02 and register row 53
     — override 17's two-mango count is accepted and closed. The condition is
     that the row varies with the palette and with the spine, which it now
     does, through `--spine-active-*`.

     D3 = ALL THREE SPINES. Verbatim: "d3 offer teh threee! but on mango
     backgorund always baclk text!" Built, as tokens (tokens.css §7b). The
     second half is A LAW, not a preference: any mango ground carries charcoal
     type. `--ink-on-accent` was already right; the mango spine's QUIET ink is
     charcoal too, because the artifact states no second ink on a mango ground
     anywhere (155 mango grounds, 155 of them `color: #1A1918`) and the
     derived `--ink-on-accent-secondary` (#5E5030) is an olive-brown the
     client's own screenshots contradict.

     D5 = C, and it closes the question D3 left open. Verbatim: "d5 c" —
     THE QUIET TIER IS MADE BY WEIGHT AND SIZE, NOT BY COLOUR. So no second
     ink is derived for the mango ground, `--ink-on-accent-secondary` is never
     reached for in this file, and the hierarchy comes off the type scale.

     IT IS APPLIED ON ALL THREE SPINES, WITH NO BRANCH, AND THAT IS THE POINT.
     C is a ruling about HOW hierarchy is made, not about mango, and a rail
     whose quiet tier worked one way on one ground and another way on the
     other two would be two components wearing one name. So the weight and
     size distinction is unconditional — and the colour distinction is NOT
     removed from the grounds that have one, because 27.1 draws it: its idle
     rows are `color: var(--fg2)` and its group headings `var(--fg3)`, on 28
     rails. `--spine-ink-quiet` keeps doing that job on ink and paper, and on
     mango it resolves to charcoal so it contributes nothing and weight and
     size carry the whole hierarchy. One mechanism, one code path, and the
     ground decides how much of it is visible.

     THE STEPS ARE THE KIT'S AND THE ARTIFACT ALREADY DREW THEM. 27.1's own
     rail makes the lit/quiet distinction by WEIGHT: its active entry is
     `font-weight: 500` and every idle entry carries none. This file had put
     500 on EVERY row and spent the whole distinction on colour. Corrected:

         lit destination     --text-sm      14 · --font-weight-medium  500
         quiet destination   --text-sm      14 · the body weight       300
         group heading       --text-micro   11 · medium, uppercase, 0.08em
         a count             --text-caption 13 · the body weight
         member's name       --text-sm      14 · medium
         their role          --text-caption 13 · the body weight
                             ↑ REMOVED by the client, 2026-08-24. The step is
                               left on the record because the ruling that set
                               it (D5 = C) is unchanged and the row is what a
                               reader will look for when they ask where the
                               second line went.

     Nothing there is new: 11 is the eyebrow step `Title` already draws its
     own eyebrow at, so the smallest thing in the rail is at the size the
     system already ships for that role and not below it.

   THIS REVERSES THIS FILE'S OWN REASONING ABOUT THE ROW'S SHAPE, AND SAYS SO.
   Until today the row was a PILL, and the argument written here was "three
   drawings to one, plus a stated law": 26.01's "All controls: 999px radius,
   no exceptions", plus 27.1 and chapter 15 both drawing an inset pill in
   situ, against 26.02's specimen alone. THE CLIENT'S SCREENSHOTS ARE A FOURTH
   DRAWING AND THEY AGREE WITH THE CHAPTER — the active row spans the rail's
   column edge to edge, square, with no inset. 26.02's dev note said so in
   words the whole time: "Active state is always a full-bleed mango row —
   never a left border, never just bold text." A row that stops short of the
   column's edges is not full-bleed, and the pill was reading 26.01's law
   about CONTROLS onto a row that the chapter had already exempted by name.
   Built full-bleed and square. The in-situ pill is gone, not kept beside it.

   ─────────────────────────────────────────────────────────────────────────
   THE MANGO SPINE IS PALETTE-INDEPENDENT BY DESIGN, AND THAT IS A DECISION
   ─────────────────────────────────────────────────────────────────────────
   Written down because an audit on 2026-08-24 read the mango spine's raw
   `--kw-charcoal` / `--kw-off-beige` values as an accident — somebody having
   reached for a brand constant where a palette token belonged. They are not
   an accident, and the alternative is worse in a way that is easy to check.

   26.02: "mango is unchanged in both palettes." The ground is #FED069 in
   light AND in dark, and #FED069 has a relative luminance of about 0.66 — it
   is a LIGHT ground. **A mango spine in dark mode is a light ground wearing a
   dark palette.** What reads against a surface is decided by the surface, not
   by the theme, so everything standing on the mango spine has to be chosen
   for a light ground in BOTH palettes. It follows that the mango spine's
   contents cannot follow the palette; if the ground does not move, nothing on
   it may move.

   Swapping the constants for their palette-mapped equivalents — the obvious
   move — breaks it immediately: `--surface-inverse` flips to off-beige in
   dark, so the "charcoal fill, off-beige label" active row 26.02 states would
   become an OFF-BEIGE row on mango, measuring 1.44 against its own ground
   with a charcoal label on it. The chip would go the same way through
   `--card`. So the raw constants are the correct reading of the chapter and
   the palette tokens are the trap.

   THE SAME LOGIC IS WHY `markField` PICKS THE CUT FROM THE SPINE AND NOT FROM
   THE MEDIA QUERY, below. One rule, applied twice.

   ONE VALUE GENUINELY BROKE THIS AND IT IS NOT ONE OF THE TWO THAT WERE
   FLAGGED. `--spine-active-hover` on the mango spine points at
   `--btn-inverse-hover`, which DOES flip — #333230 light, #ECE8DF dark —
   because it is the hover for a ground that inverts, and the mango spine's is
   a ground that does not. MEASURED on the default spine in dark: the lit row
   hovers to #ECE8DF and its #FFFEF9 label falls to **1.211**, with the row
   itself at 1.189 against the mango. Light is correct at 12.683. The fix is
   one line in `tokens.css` §7b — pin `--spine-active-hover: #333230` on
   `[data-spine="mango"]`, which is that file's own existing light value and
   introduces no new hex — and `tokens.css` is another agent's file today, so
   it is ROUTED rather than edited here. Until it lands, the default spine's
   lit row has a broken hover in dark and nothing else does.

   ─────────────────────────────────────────────────────────────────────────
   THE RAIL IS A CONTAINER AFTER ALL, AND THE ARTIFACT ALWAYS SAID SO
   ─────────────────────────────────────────────────────────────────────────
   `SHELL.md` used to say the rail LIES ON the screen card and paints nothing.
   That was true of the pixels and false about the ladder: every rail in
   chapter 27 — 28 of them, 22 expanded and 6 collapsed — is drawn
   `background: var(--sheet)`, and the frame behind it is `var(--page)`. The
   rail painted nothing and still looked right only because the build had the
   card soft paper too. With the card corrected to off-beige, an unpainted
   rail is a rail that disappears.

   THE FILL IS THE SHELL'S, NOT THIS FILE'S, and that is the one thing worth
   arguing about here. The spine has to run the column's FULL HEIGHT and reach
   its edges; the column's padding belongs to `ScreenShell`. So the shell
   paints the column and publishes its padding as `--rail-inset`, and the rows
   below bleed back out through it. This file names no colour and no inset: it
   reads `--spine-*` and `--rail-inset` and nothing else.

   ─────────────────────────────────────────────────────────────────────────
   GEOMETRY, AND WHERE THE CHAPTER'S NUMBERS WENT
   ─────────────────────────────────────────────────────────────────────────
   · WIDTH — "Fixed 208px" (26.02). The shell owns it (`RAIL_WIDTH`, 13rem);
     this file writes no width in its expanded form and fills the column.
   · RADIUS — NONE, expanded. See the reversal above. The COLLAPSED row keeps
     999: 27.8 and 27.1's tablet render both draw the icon rail as a column of
     circles, "at the same circular size as the avatar", and a full-bleed
     square inside a 32-wide column is not a thing the kit draws anywhere.
   · "FULL-BLEED" — edge to edge of the rail's COLUMN, out through the shell's
     own padding via `--rail-inset`. The label does not move when a row
     lights: the row's inline padding is `--rail-inset + --space-3`, which is
     exactly where an unlit row's label already sat.
   · COLLAPSED ICON — 26.02 says "the same 36px circular size as the avatar".
     THE AVATAR LADDER HAS NO 36. Ruling 30 states three sizes absolutely and
     they are 24 / 32 / 48. The caption's operative words are "the same size
     as the avatar", so the icon is `--avatar-md` (32) and matches the member
     chip's mark exactly, which is the thing the sentence is actually about.
     The 36 is logged as a value off the ladder.
   · COUNTS — 26.02 says "no item counts", in the caption, flatly. 27.1 draws
     `Collection 24` and chapter 15 draws `Tasks 6`. `count` therefore exists
     as a prop WITH NO DEFAULT and no entry in the placeholder register below
     carries one: a route that wants the kit's in-situ spelling can ask, and
     nothing draws a count by accident.
   · DISABLED — 27.7, verbatim: "The rail shows the door it won't open …
     Blocked items stay visible in disabled ink rather than disappearing."
     So a blocked row keeps its place and takes `--spine-ink-disabled`, and
     it takes NO FILL — `Button`'s one disabled treatment is a fill and an
     ink, and a fill here would make an unreachable row the loudest object in
     a column where nothing else is filled. Logged as this file's one
     departure from the shared disabled skin. On the PAPER spine that token
     is `--btn-disabled-label`, unchanged from before; on ink and mango it is
     the spine's own quiet ink, because the artifact draws no blocked row on
     either ground and a third ink tier there would be invented. Owed.

   ─────────────────────────────────────────────────────────────────────────
   WHY THE ROW WRITES ITS OWN SKIN INSTEAD OF RENDERING A `Button`
   ─────────────────────────────────────────────────────────────────────────
   Because a rail entry may be a LINK. GAPS-D PAG-2 records this as a
   system-wide trap: `button.tsx` guards every interactive rule with
   `enabled:`, `:enabled` matches form elements only, and an `<a>` wearing
   `buttonVariants` silently loses its hover with nothing to see in review.
   `pagination` already answered this by copying the geometry and branching on
   the resolved state in JS, and PAG-2's own recommendation is a state branch
   rather than the `enabled:` guard. This file does the same: ONE skin, both
   elements, the three states resolved in JS so no two rules ever race.

   Everything that is not the row is a shipped primitive: `Logotype` /
   `Isotype` for the mark, `Avatar` for the member's face, `Tooltip` for the
   collapsed label, the kit's icons for the chevrons.

   ─────────────────────────────────────────────────────────────────────────
   THE RAIL'S HEAD IS ONE IMAGE AND NO TYPE AT ALL
   ─────────────────────────────────────────────────────────────────────────
   Two client instructions, 2026-08-24, verbatim:

       "side by side the word! love it!"      → the full horizontal LOCKUP
       "no tagline on the sidebar, only this" → and nothing else

   So the head is `Logotype` — the glyph and the word as ONE piece of
   artwork — and `wordmark` and `tagline` both default to `null`. The build
   drew a letter in an `Avatar` square, then an `Isotype` beside the name set
   in the interface face, then 26.02's tagline under it. All three are gone.

   ITS SIZE IS ONE RUNG OF THE ICON LADDER, AND THE CLIENT SET IT.
   Verbatim, with a reference screenshot: "the logo on top of sidebar smaller,
   check screenshot for reference". Measured off that reference, the lockup is
   about 48% of the rail's width — ~100px in a 208 column, ~20 tall at the
   4.9986:1 ratio, against the ~41.6 tall it was drawing at the column's full
   width. Roughly half the height. That is a change, not a nudge.

   `MARK_STEP` below is `--icon-20`, the ladder's rung under the 24 the brand
   file's own `sm` uses. 100 IS NOT HARD-CODED ANYWHERE: `brand.tsx` derives
   the width from `--brand-step * --brand-ratio`, so the step is a HEIGHT on
   the kit's own scale and the width falls out of the artwork's measured
   aspect. At the 16px reference root that is 99.97 x 20 — 48.06% of a 208
   rail, which is the reference to two decimal places, arrived at from the
   ladder rather than from the screenshot.

   THE MARK IS SIZED BY HEIGHT, NOT BY `w-full`, AND THAT IS THE FIX'S SHAPE.
   The head used to take the padded column's whole width. A 5:1 lockup pinned
   by its HEIGHT has a width nobody controls, which is why `brand.tsx` is
   width-driven — but pinning `--brand-step` drives the width THROUGH that
   same formula rather than around it, so the component's own mechanism still
   owns the geometry, `max-w-full` still catches any overflow, and the
   rectangle is still final on the first frame so nothing under the head moves
   when the SVG lands.

   THE CLEAR SPACE UNDER IT IS THE POINT, NOT A SIDE EFFECT. The reference
   reads the lockup as a quiet header rather than a banner, and that is the
   PROPORTION of mark to the space below it, not the mark's size alone. The
   rail's own block gap is `--space-6`; against the old 32 mark that was 0.75
   of its height, and against the new 20 it is 1.2. The gap did not move —
   shrinking the mark is what bought the air, which is why the gap is left on
   the rail's rhythm instead of growing a bespoke one.

   COLLAPSED, IT IS THE `Isotype`, AT THE SAME STEP. At the icon rail's width
   the lockup cannot fit — five to one would be a few pixels tall — and the
   isotype is the same artwork's mark half at 0.9999:1, effectively square.
   IT TAKES `MARK_STEP` TOO, so the expanded lockup and the collapsed mark
   stand exactly the same height and read as one mark in two states. It was
   `md` (32) while the lockup was 32-ish; leaving it there would have made the
   collapsed mark TALLER than the expanded one, which is the whole rail
   disagreeing with itself. Note this is deliberately NOT 26.02's "same
   circular size as the avatar" — that sentence is about the destination
   ICONS, which are still `--avatar-md`; the brand mark is not a destination.

   NEITHER IS `decorative`. That prop exists for a mark standing next to the
   product's name in real type, and there is no such type here any more: the
   artwork is the only thing naming the product in this rail, so it keeps its
   accessible name and `label` carries it.

   ─────────────────────────────────────────────────────────────────────────
   THE APPLICATION OWNS THE ROUTE
   ─────────────────────────────────────────────────────────────────────────
   The repo ships components, not routing. An entry takes an `href`, a
   handler, or both, and `current` is a plain id the application resolves from
   whatever router it has. Nothing in here reads a location, and the parent
   collection STAYS LIT on a detail screen (`SHELL.md`: "the rail never
   changes between them") because `current` is the collection's id on both
   screens and this component cannot tell which of the two it is inside.

   THE WORDS ARE THE KIT'S. 27.1's in-situ register — Group / Overview /
   Collection / Settings / Member name — is the default because it is what the
   kit draws on the forty screens this default will appear on. 26.02's
   specimen register (Group label / Active item / Sibling item / Another group
   / Item / Collapsed group / Person name / Their role) says the same thing in
   the chapter's own placeholder voice. No product vocabulary is invented for
   a navigation entry anywhere in this file.

   RENDERING CONTEXT
   `"use client"`. The rail owns two pieces of interaction state — which
   groups are closed, and whether the whole rail is collapsed — and both are
   uncontrolled-with-an-escape-hatch, because 26.02 says both "persist per
   user" and persistence is the application's.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Avatar,
  AvatarFallback,
} from "../../controls/avatar/avatar";
import { Isotype, Logotype } from "../../controls/brand/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../controls/tooltip/tooltip";
import { Hint, Text } from "../../controls/typography/typography";
import {
  ChartNoAxesColumn,
  ChevronDown,
  ChevronRight,
  LibraryBig,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "../../icons";

/* ----------------------------------------------------------------------------
   THE ACTIVE ROW — mango, ruled, and now spine-aware.

   Client ruling D1 = A: the row is the chapter's mango. Register row 53 is
   answered and the in-situ off-beige pill it recorded as the alternative is
   deleted rather than parked, because a rejected alternative left in the file
   is the next reader's "three drawings to one".

   Every value is a token so the row re-paints with the spine and with the
   palette, which is the client's own condition ("but also variations
   depending on light/dark and the settings of the navbar"). On ink and paper
   that resolves to mango with a charcoal label; on mango it INVERTS, to
   charcoal with an off-beige label, which is 26.02's third spine card
   verbatim. The hover follows the fill: the mango spines take
   `--btn-primary-hover`, the mango SPINE's charcoal row takes
   `--btn-inverse-hover`, and both are values already in the file.

   AND THE PRESSED FILL IS GONE, WHICH IS A FIDELITY FIX AND NOT A LOSS.
   26.01, verbatim: "Press state is a 1px downward translate, NO COLOR FLASH,
   no shadow underneath." The row was drawing `--btn-primary-pressed` on
   `:active` on top of the translate `ROW_PRESSABLE` already applies. One of
   the two had to go and the chapter says which.
   -------------------------------------------------------------------------- */
const ACTIVE_TREATMENT = [
  "bg-[var(--spine-active-fill)] text-[var(--spine-active-ink)]",
  /* D5 = C. The lit row is MEDIUM against a quiet row's body weight, which is
     27.1's own drawing: its active entry is `font-weight: 500` and every idle
     entry carries no weight at all. */
  "font-[var(--font-weight-medium)]",
  "hover:bg-[var(--spine-active-hover)]",
].join(" ");

/* ----------------------------------------------------------------------------
   THE ROW — one shape, three skins, two elements.
   -------------------------------------------------------------------------- */

/** Geometry shared by every entry, lit or not, link or button. */
const ROW_SHAPE = cn(
  "flex min-w-0 items-center gap-[var(--space-2)]",
  "border-0 bg-transparent no-underline select-none",
  /* NO WEIGHT HERE — see `ACTIVE_TREATMENT`. Every row used to be 500 and the
     lit/quiet distinction was carried entirely by colour; client ruling D5=C
     moves it to weight and size, and 27.1's own rail drew it that way all
     along. A row's resting weight is the body's. */
  "text-sm leading-none text-start",
  "transition-[background-color,color,transform]",
  "duration-[var(--duration-colour)] ease-kwapso",
  "[&_svg]:pointer-events-none [&_svg]:size-[var(--icon-button)] [&_svg]:shrink-0",
);

/**
 * Expanded: FULL-BLEED AND SQUARE, per 26.02's dev note and the client's
 * screenshots. The negative inline margin is the shell's own `--rail-inset`,
 * published on the column for exactly this; the row then pays it back in
 * padding, so the label sits where an unlit row's label already sat and
 * nothing shifts when a row lights. No `w-full`: the row is a flex item in a
 * stretching column, so dropping the width lets the negative margins take it
 * to both edges instead of pushing a 100% box sideways.
 *
 * `--rail-inset` carries a `0px` fallback so a rail rendered outside the
 * shell degrades to a plain flush row rather than to `NaN`.
 */
const ROW_EXPANDED = cn(
  "h-[var(--control-height-button)] w-auto rounded-none",
  "-mx-[var(--rail-inset,0px)]",
  "px-[calc(var(--rail-inset,0px)+var(--space-3))]",
);

/**
 * Collapsed: "only its icon remains, centered in the rail, at the same …
 * circular size as the avatar" (26.02). `--avatar-md` is that size, and the
 * circle is the shape 27.8 and 27.1's tablet render both draw — full-bleed
 * belongs to the expanded rail and there is no square in a 32-wide column.
 */
const ROW_COLLAPSED = cn(
  "size-[var(--avatar-md)] justify-center rounded-pill p-0",
);

/**
 * THE BRAND MARK'S HEIGHT — one rung of the icon ladder, both rail states.
 *
 * Client, 2026-08-24, with a reference screenshot: "the logo on top of sidebar
 * smaller, check screenshot for reference." The reference puts the lockup at
 * ~48% of the rail's width. `--icon-20` is the ladder rung that lands there:
 * `brand.tsx` computes the width as `--brand-step * --brand-ratio`, so 20 x
 * 4.9986 = 99.97 in a 208 column — 48.06%. Nothing here is a literal, and the
 * artwork's aspect still owns the width.
 *
 * The COLLAPSED isotype takes the same step, so the two states of the same
 * mark stand at the same height. See the file header.
 */
const MARK_STEP = "[--brand-step:var(--icon-20)]";

/** A quiet entry. 26.01's ghost: quiet ink, darkening to full on hover. */
const ROW_IDLE =
  "text-[var(--spine-ink-quiet)] hover:text-[var(--spine-ink)]";

/** 27.7's blocked entry: still there, in disabled ink, and NOT filled. */
const ROW_BLOCKED = "cursor-not-allowed text-[var(--spine-ink-disabled)]";

/** The press nudge, 26.01's "1px downward translate". Never on a blocked row. */
const ROW_PRESSABLE = "cursor-pointer active:translate-y-[0.0625rem]";

/* ----------------------------------------------------------------------------
   Public shapes.
   -------------------------------------------------------------------------- */

/**
 * One destination. Every entry in a rail is a MAIN SCREEN — that is the
 * client's test, and it is why a detail screen has no entry of its own.
 */
export interface RailItem {
  /** The application's id for the screen. Compared against `current`. */
  id: string;
  /** What the entry is called. The application's word, never this file's. */
  label: string;
  /**
   * Where it goes. Present and the entry renders as a real `<a>`, so the
   * browser's own affordances work; absent and it is a `<button>`. The kit
   * ships no router and this is the whole of its involvement in routing.
   */
  href?: string;
  /** Called on activation, with the entry's id. May be given alongside `href`. */
  onSelect?: (id: string) => void;
  /**
   * The entry's glyph, and **the client asked for one on every destination**
   * (2026-08-24: "'sections' have no icons, but pages do"). 26.02's specimen
   * and the System template both draw one on every row, so the EXPANDED rail
   * now reserves a slot for it as well as the collapsed one.
   *
   * STILL NO DEFAULT, DELIBERATELY. Which glyph a named destination carries
   * is product vocabulary and belongs to the application, not to the kit; an
   * earlier agent refused to invent one and that refusal is unchanged by the
   * layout moving. What changed is what an entry WITHOUT one does:
   *
   *  · EXPANDED — if any entry in the rail has an icon, this entry reserves
   *    an empty `--icon-button` slot so its label stays in line with its
   *    neighbours'. If NO entry in the rail has one, no slot is drawn at all
   *    and every label sits flush. The rule is the RAIL's, not the entry's.
   *  · COLLAPSED — the label is gone, so `glyphOf` falls back to the label's
   *    first character and a column of blank circles is impossible.
   */
  icon?: React.ReactNode;
  /**
   * A count beside the label. NO DEFAULT ANYWHERE — 26.02 says "no item
   * counts" and 27.1 and chapter 15 draw them. An application that wants the
   * in-situ spelling asks for it.
   */
  count?: number;
  /**
   * 27.7: "Blocked items stay visible in disabled ink rather than
   * disappearing, so the workspace doesn't look different to different
   * people." An entry a reader may not open is DISABLED, not absent.
   */
  disabled?: boolean;
}

/** A titled run of entries. 26.02: "Grouped sections with a collapse chevron per group". */
export interface RailGroup {
  /** Stable key, and what `onGroupToggle` reports. */
  id: string;
  /** The small-caps line above the run. The application's word. */
  heading: string;
  items: readonly RailItem[];
  /**
   * Whether the run starts open. 26.02 draws one closed group and says group
   * collapse "is separate and persists per user" — so the initial value is
   * the application's to restore and the toggling is this component's.
   */
  defaultOpen?: boolean;
}

/** The member at the foot. 26.02: no member LIST — one chip, the reader's own. */
export interface RailMember {
  /**
   * THE FULL NAME. Since 2026-08-24 it is not what the chip DRAWS — see
   * `givenName` — but it is still what the chip is CALLED: when a `givenName`
   * is supplied and differs, this is carried in an `sr-only` span so the
   * accessible name of the chip stays the whole name. Collapsed, it is the
   * tooltip. Always required, because the accessible name is not optional.
   */
  name: string;
  /**
   * THE FIRST NAME, AND THE APPLICATION SUPPLIES IT — the component never
   * derives it. Client, 2026-08-24: *"where there's the person name, i want
   * only the first name, not full name."*
   *
   * IT IS A SEPARATE FIELD RATHER THAN A SPLIT OF `name` BECAUSE A SPLIT IS
   * WRONG. Whitespace is not a name boundary: "María José" is one given name,
   * "van der Berg" is one family name, a family-name-first register puts the
   * family name in slot 0, and a mononym has no slot 1. These applications
   * run in Arabic, Urdu and Persian. The person record already holds this
   * field; the component would be guessing at it.
   *
   * Absent, the chip draws `name` in full — uncut, never truncated to a word.
   */
  givenName?: string;
  /**
   * **REMOVED BY THE CLIENT, 2026-08-24: "Also, no role. remove the role".**
   * 26.02 drew a quiet second line under the name and 27.1 did not; the
   * client has settled it against the chapter and THIS PROP DRAWS NOTHING,
   * anywhere, in any state. It is kept typed rather than deleted because the
   * kit is vendored into two applications this repo cannot see, and a removed
   * field is a compile error for a change that is purely visual. No call site
   * in this repo passes it. If it is still unused at the next kit version,
   * delete it.
   *
   * @deprecated Not rendered. The client removed the role line on 2026-08-24.
   */
  role?: string;
  /** Two characters. Falls back to the first character of the name. */
  initials?: string;
  href?: string;
  onSelect?: () => void;
}

export interface RailProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /** The groups, in order. Defaults to 27.1's placeholder register. */
  groups?: readonly RailGroup[];
  /**
   * Which entry is lit. The application resolves this from its own router.
   * ON A DETAIL SCREEN IT IS STILL THE PARENT COLLECTION'S ID — `SHELL.md`,
   * "the rail never changes between them: the parent collection stays lit."
   */
  current?: string;
  /** Activation, for entries that carry no handler of their own. */
  onSelect?: (id: string) => void;

  /**
   * THE SPINE, AND IT MOVES EXACTLY ONE THING IN THIS FILE: which cut of the
   * mark is loaded. Every other spine value reaches this component as a CSS
   * custom property from the column the shell paints, which is why there is
   * no `data-spine` written here and no colour named anywhere below.
   *
   * `Isotype` picks its cut from a prop rather than from CSS, so the one
   * decision that cannot be made in the stylesheet is made here. A call site
   * that supplies its own rail node and its own spine passes both.
   */
  spine?: "ink" | "paper" | "mango";

  /**
   * The head of the rail. `null` draws none. Defaults to the real artwork —
   * the full horizontal `Logotype` expanded, the `Isotype` collapsed — so a
   * call site that passes nothing gets the client's own answer.
   */
  mark?: React.ReactNode;
  /**
   * A name in TYPE beside the mark. **DEFAULTS TO `null`, and that is the
   * client's instruction**: "side by side the word! love it!" — the word is
   * IN the artwork now, so type here would set the product's name twice.
   * Kept as a prop for a call site with a reason, not as a thing to reach for.
   */
  wordmark?: React.ReactNode;
  /**
   * 26.02 draws a tagline under the wordmark. **DEFAULTS TO `null` on a
   * client ruling**, verbatim: "no tagline on the sidebar, only this."
   */
  tagline?: React.ReactNode;

  /** The chip at the foot. `null` draws none. */
  member?: RailMember | null;

  /** Accessible name for the navigation landmark. */
  label?: string;

  /**
   * The icon rail. 26.02: "Collapse is a single toggle for the whole rail …
   * not per-group." Controlled when given.
   */
  collapsed?: boolean;
  /** The uncontrolled starting value, for the application to restore. */
  defaultCollapsed?: boolean;
  /** Reported on every change, controlled or not, so it can be persisted. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /**
   * Whether the rail draws its own collapse control. OFF, because NO
   * ASSEMBLED SCREEN IN THE KIT DRAWS ONE — 27.8 and 27.1's tablet render are
   * both already collapsed with no visible toggle, and chapter 15's icon rail
   * carries the only "collapse" word in the document. So the state is always
   * reachable through `collapsed` and the control is opt-in.
   */
  collapsible?: boolean;
  /** The collapse control's names. Verbs, not product words. */
  collapseLabel?: string;
  expandLabel?: string;

  /** Reported when a group is opened or closed, so it can be persisted. */
  onGroupToggle?: (id: string, open: boolean) => void;
}

/* ----------------------------------------------------------------------------
   THE PLACEHOLDER REGISTER — 27.1's, verbatim.

   This is the default the shell falls back to, so it is what forty screens
   will draw, so it is the register the kit itself draws on those screens:
   two groups called Group, four then three entries, Overview first, Settings
   last, the second entry lit. Not one word here is invented and not one is a
   product's.

   IT NOW CARRIES GLYPHS, AND THAT IS NOT THE INVENTION THE FILE REFUSES.
   The client asked for an icon on every destination and this register is what
   the shell falls back to, so without glyphs here the change would be
   invisible on the forty screens the client actually looks at. The refusal
   that stands is about NAMED destinations — deciding that "Tickets" or
   "Capacity" means a particular mark is the application's vocabulary and the
   kit does not get to set it. THESE WORDS ARE NOT NAMED DESTINATIONS: they
   are the kit's own placeholders, "Collection" five times over, and a
   placeholder word takes a placeholder glyph. Each of the three distinct
   words takes the icon whose NAME in the kit's own set is the same concept —
   a summary for Overview, a library for Collection, Settings for Settings —
   so nothing is coined and nothing is asserted about a real screen. All icon
   ARTWORK in this repo is still placeholder (ICON-LANGUAGE.md: "No glyph has
   been drawn"), so all three render the same rounded square today and what
   the register demonstrates is the ARRANGEMENT, which is what was asked for.
   -------------------------------------------------------------------------- */

const PLACEHOLDER_GROUPS: readonly RailGroup[] = [
  {
    id: "group-1",
    heading: "Group",
    items: [
      { id: "overview", label: "Overview", icon: <ChartNoAxesColumn aria-hidden="true" /> },
      { id: "collection-1", label: "Collection", icon: <LibraryBig aria-hidden="true" /> },
      { id: "collection-2", label: "Collection", icon: <LibraryBig aria-hidden="true" /> },
      { id: "collection-3", label: "Collection", icon: <LibraryBig aria-hidden="true" /> },
    ],
  },
  {
    id: "group-2",
    heading: "Group",
    items: [
      { id: "collection-4", label: "Collection", icon: <LibraryBig aria-hidden="true" /> },
      { id: "collection-5", label: "Collection", icon: <LibraryBig aria-hidden="true" /> },
      { id: "settings", label: "Settings", icon: <Settings aria-hidden="true" /> },
    ],
  },
];

/** The entry 27.1 draws lit. */
const PLACEHOLDER_CURRENT = "collection-1";

/**
 * The chip at the foot, in 27.1's placeholder voice with 27.1's initials.
 *
 * THE ROLE IS GONE AND THE NAME IS NOW A PAIR. It carried "Their role" until
 * 2026-08-24 on the reading that 26.02 is the rail's chapter and draws two
 * lines; the client removed the line outright, so 27.1's one-line chip is
 * what ships and the two authorities agree again.
 *
 * `givenName` is the register's own word cut at the kit's own placeholder
 * seam — "Member name" is two placeholder tokens, and "Member" is the first
 * of them. It is written out here rather than computed, exactly as an
 * application would supply it, so the DEFAULT rail demonstrates the prop the
 * client's instruction is actually served by. A screen reader still hears
 * "Member name".
 */
const PLACEHOLDER_MEMBER: RailMember = {
  name: "Member name",
  givenName: "Member",
  initials: "AC",
};


/* ----------------------------------------------------------------------------
   Helpers.
   -------------------------------------------------------------------------- */

/**
 * Two characters, upper-cased by `Avatar` itself. Never more (ruling 30).
 *
 * The second argument is `RailMember.initials` — what the application SUPPLIED
 * — and is deliberately not called `given` any more, because `RailMember` now
 * carries a `givenName` that means something else entirely and one letter of
 * ambiguity here would be read as "initials of the first name".
 *
 * NOTE THAT IT STILL FALLS BACK OFF THE FULL NAME, NOT THE GIVEN ONE. The
 * chip draws a first name; the face should still stand for the whole person,
 * and 27.1's own placeholder mark is a two-letter pair.
 */
function initialsOf(name: string, supplied?: string): string {
  if (supplied !== undefined && supplied !== "") return supplied;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] ?? "") + (words[words.length - 1][0] ?? "");
}

/**
 * The glyph a collapsed entry shows when the application gave no icon. The
 * label's own first character — derived from the word the application already
 * chose, so nothing is coined, and a collapsed rail is never a column of
 * blank circles.
 */
function glyphOf(item: RailItem): React.ReactNode {
  if (item.icon !== undefined) return item.icon;
  return (
    <span aria-hidden="true" className="text-badge leading-none uppercase">
      {item.label.trim().slice(0, 1)}
    </span>
  );
}

/* ----------------------------------------------------------------------------
   One entry.
   -------------------------------------------------------------------------- */

interface RowProps {
  item: RailItem;
  active: boolean;
  collapsed: boolean;
  /**
   * Whether the EXPANDED row draws its leading icon slot. Decided once, by
   * the rail, off whether any entry in it has an icon — never per entry, or a
   * single glyph-less destination would sit 24px left of its neighbours. See
   * `RailItem.icon`.
   */
  reserveIcon: boolean;
  onSelect?: (id: string) => void;
}

function RailRow({ item, active, collapsed, reserveIcon, onSelect }: RowProps) {
  const blocked = item.disabled === true;

  /* THE THREE SKINS ARE EXCLUSIVE AND RESOLVED HERE, IN JS — PAG-2's own
     recommendation. Two of them carry a `hover:` rule and the third carries
     none, so no two rules with equal specificity are ever in the class list
     together and the outcome never depends on Tailwind's emission order. */
  const skin = cn(
    ROW_SHAPE,
    collapsed ? ROW_COLLAPSED : ROW_EXPANDED,
    blocked ? ROW_BLOCKED : ROW_PRESSABLE,
    blocked ? undefined : active ? ACTIVE_TREATMENT : ROW_IDLE,
  );

  const body = collapsed ? (
    glyphOf(item)
  ) : (
    <>
      {/* THE ICON SLOT. A fixed box rather than the bare node, so an entry
          with no glyph still holds the column open and every label in the
          rail starts at the same place. `aria-hidden` because the label is
          right beside it — the glyph names nothing the row does not already
          say, and a rail that announced "chart, Overview" would be worse.
          Drawn only when the rail has icons at all: see `reserveIcon`. */}
      {reserveIcon ? (
        <span
          aria-hidden="true"
          data-slot="rail-item-icon"
          className="flex size-[var(--icon-button)] shrink-0 items-center justify-center"
        >
          {item.icon ?? null}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined ? (
        <span
          className={cn(
            "shrink-0 text-caption tabular-nums",
            active ? "text-inherit" : "text-[var(--spine-ink-quiet)]",
          )}
        >
          {item.count}
        </span>
      ) : null}
    </>
  );

  /* The collapsed rail's label has to survive somewhere. 26.02: "A tooltip
     with the label appears on hover." The word is also on the control, as its
     accessible name, so the label survives for a reader who never hovers. */
  const shared = {
    "data-slot": "rail-item",
    "data-active": active ? "" : undefined,
    "aria-current": active ? ("page" as const) : undefined,
    "aria-label": collapsed ? item.label : undefined,
    className: skin,
  };

  const control =
    item.href !== undefined && !blocked ? (
      <a
        {...shared}
        href={item.href}
        onClick={
          item.onSelect ?? onSelect
            ? () => {
                (item.onSelect ?? onSelect)?.(item.id);
              }
            : undefined
        }
      >
        {body}
      </a>
    ) : (
      <button
        {...shared}
        type="button"
        disabled={blocked}
        onClick={
          blocked
            ? undefined
            : () => {
                (item.onSelect ?? onSelect)?.(item.id);
              }
        }
      >
        {body}
      </button>
    );

  if (!collapsed) return control;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

/* ----------------------------------------------------------------------------
   The rail.
   -------------------------------------------------------------------------- */

/**
 * The navigation rail — the navbar a main screen is in.
 *
 * TEN STATES
 *  1. default        — mark and wordmark, grouped entries with one lit, the
 *                      member chip at the foot. No fill of its own: it lies
 *                      on the screen card's soft paper.
 *  2. hover          — a quiet entry's ink darkens to full (26.01's ghost);
 *                      a lit entry's fill moves to `--spine-active-hover`.
 *                      Collapsed, a tooltip carries the label as well.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and every entry in here is a real `<a>` or `<button>`.
 *                      An expanded row is square now, so its ring is square:
 *                      the global rule follows the control's own radius.
 *  4. active/pressed — the 1px downward nudge AND NOTHING ELSE. 26.01: "Press
 *                      state is a 1px downward translate, no color flash."
 *                      Never on a blocked row.
 *  5. disabled       — per ENTRY, not per rail. 27.7: a blocked entry stays
 *                      visible in disabled ink and takes no fill, "so the
 *                      workspace doesn't look different to different people".
 *  6. loading        — does not apply. Law 4: "either way the rail, header and
 *                      tabs stay drawn and stay put." The rail is what stays
 *                      put, so it has no loading form and takes no `state`.
 *  7. empty          — `groups={[]}` draws the mark and the chip and no
 *                      entries. A rail with nothing in it is a real condition
 *                      (a role that can open one screen) and it is not an
 *                      error, so no register is drawn over it.
 *  8. error          — does not apply, same reason as 6. A dead session
 *                      replaces the window (law 4's one exception) and that
 *                      screen renders no shell at all.
 *  9. selected       — this is state 1's lit entry, and it is the whole point
 *                      of the component: `current` lights exactly one, and it
 *                      stays lit while a record from that collection is open.
 * 10. read-only      — does not apply. Navigation edits nothing.
 *
 * THREE BREAKPOINTS
 *  mobile  — ABSENT. `ScreenShell` drops the rail entirely below `md` and no
 *            hamburger is drawn, because the kit draws none anywhere. This
 *            component has no narrow form on purpose: a narrow form would be
 *            something for a route to reach for.
 *  tablet  — present, and the width the kit shows collapsed (27.1's tablet
 *            render is the icon rail). The state is the application's;
 *            nothing here changes with the viewport.
 *  desktop — the expanded 208 column.
 *
 * RTL — safe. Every inset and gap is logical, the tooltip's `side="right"` is
 * Radix's physical side and is the only physical name in the file; the mark,
 * the chevron and the count all take their position from flex order.
 */
const Rail = React.forwardRef<HTMLDivElement, RailProps>(
  (
    {
      groups = PLACEHOLDER_GROUPS,
      current = PLACEHOLDER_CURRENT,
      onSelect,
      spine = "paper",
      mark,
      wordmark = null,
      tagline = null,
      member = PLACEHOLDER_MEMBER,
      label = "Sections",
      collapsed,
      defaultCollapsed = false,
      onCollapsedChange,
      collapsible = false,
      collapseLabel = "Collapse",
      expandLabel = "Expand",
      onGroupToggle,
      className,
      ...props
    },
    ref,
  ) => {
    /* Uncontrolled with an escape hatch, both times. 26.02 says the collapse
       and the group state each "persist per user"; persistence is the
       application's, the toggling is not worth making every call site own. */
    const [selfCollapsed, setSelfCollapsed] = React.useState(defaultCollapsed);
    const isCollapsed = collapsed ?? selfCollapsed;

    const [closed, setClosed] = React.useState<readonly string[]>(() =>
      groups.filter((g) => g.defaultOpen === false).map((g) => g.id),
    );

    const toggleCollapsed = () => {
      const next = !isCollapsed;
      if (collapsed === undefined) setSelfCollapsed(next);
      onCollapsedChange?.(next);
    };

    /* WHICH CUT OF THE ARTWORK. The spine tells the mark what ground it is
       standing on, which is the whole reason this component takes a `spine`
       at all — and it is the answer to the mango-in-dark trap. A mango spine
       in DARK is a LIGHT ground wearing a dark palette, so a cut chosen by
       the media query would load the reversed artwork onto #FED069. `brand`
       is the field that always draws the black cut, in both palettes, which
       is also the accent law ("charcoal on every accent, no exceptions").
       `unlit` is the always-reversed field the charcoal spine needs in both
       palettes; only `paper` swaps with the theme, and only the paper spine
       is a ground that actually swaps. */
    const markField = spine === "ink" ? "unlit" : spine === "mango" ? "brand" : "paper";

    /* WHETHER THE EXPANDED ROWS DRAW AN ICON COLUMN — one decision for the
       whole rail, taken here, so a single glyph-less destination cannot pull
       its label out of line with its neighbours' and an entirely glyph-less
       rail is not indented past an empty column. See `RailItem.icon`. */
    const reserveIcon = React.useMemo(
      () => groups.some((g) => g.items.some((i) => i.icon !== undefined)),
      [groups],
    );

    const toggleGroup = (id: string) => {
      const open = closed.includes(id);
      setClosed((prev) => (open ? prev.filter((k) => k !== id) : [...prev, id]));
      onGroupToggle?.(id, open);
    };

    return (
      <div
        ref={ref}
        data-slot="rail"
        /* THE HOOK THE SHELL READS. The shell's rail column is a fixed 208
           and has no way to know the rail inside it has become an icon rail,
           so the collapsed state is published as an attribute and the shell
           lets the column take its content's width with a `has-[]` rule. No
           prop, no callback, no second source of truth. */
        data-rail-collapsed={isCollapsed ? "" : undefined}
        className={cn(
          /* NO FILL HERE, AND THAT IS NOT "NOT A CONTAINER" ANY MORE. The
             rail IS a container — 28 of 28 in the artifact carry one — and
             the SHELL paints it, on the column, because the spine has to run
             the column's full height and reach edges this component sits
             inside the padding of. */
          "flex min-h-full min-w-0 flex-1 flex-col gap-[var(--space-6)]",
          isCollapsed && "w-[var(--avatar-md)] flex-none items-center",
          className,
        )}
        {...props}
      >
        {/* THE MARK AND THE WORDMARK. Bare on the spine. The mark is the real
            artwork now — `assets/logos/`, through `Isotype` — and the cut
            follows the spine: `paper` swaps with the palette, `unlit` is the
            reversed cut the charcoal spine needs in both palettes, `brand` is
            the black cut the mango spine takes because charcoal goes on every
            accent. `decorative`, because the wordmark beside it already names
            the product and announcing it twice is the worse failure. */}
        {mark !== null || wordmark !== null ? (
          <div
            data-slot="rail-brand"
            className={cn(
              "flex min-w-0 items-center gap-[var(--space-3)]",
              /* ONE LEADING EDGE DOWN THE WHOLE COLUMN. The client's
                 reference aligns the lockup with the leading edge of the
                 destinations below it, not with the column's padding — and
                 every other thing in this rail already sits at
                 `--rail-inset + --space-3`: a row pays its inset back in
                 padding after bleeding out through it, and a group heading
                 writes the same `--space-3` directly. The head was the one
                 block starting 12 to the left of everything else. Collapsed,
                 the column centres instead and the inset would fight it. */
              isCollapsed ? "justify-center" : "px-[var(--space-3)]",
            )}
          >
            {mark !== null ? (
              mark !== undefined ? (
                mark
              ) : isCollapsed ? (
                <Isotype className={MARK_STEP} on={markField} />
              ) : (
                /* The step is a HEIGHT on the icon ladder; `brand.tsx` turns
                   it into a width through the measured 4.9986:1 ink ratio, so
                   the lockup cannot be distorted by this override and
                   `max-w-full` still catches a column narrower than it. */
                <Logotype className={MARK_STEP} on={markField} />
              )
            ) : null}
            {/* THE WORDMARK IS TYPE, NOT ARTWORK — 26.02 and 27.1 both set
                the name beside the mark in the interface face — and both
                lines take the SPINE's ink rather than the page's, because
                `Text` and `Hint` write `text-foreground` / `text-ink-tertiary`
                explicitly and an explicit colour does not inherit the
                column's. Every rail label below does the same, for the same
                reason. */}
            {!isCollapsed && (wordmark !== null || tagline !== null) ? (
              <div className="flex min-w-0 flex-col">
                {wordmark !== null && wordmark !== undefined ? (
                  <Text as="span" size="sm" className="truncate text-[var(--spine-ink)]">
                    {wordmark}
                  </Text>
                ) : null}
                {tagline !== null && tagline !== undefined ? (
                  <Hint as="span" className="truncate text-[var(--spine-ink-quiet)]">
                    {tagline}
                  </Hint>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* THE ENTRIES. `flex-1` so the member chip is pinned to the foot at
            every height, which is what every in-situ screen draws. */}
        <nav
          data-slot="rail-nav"
          aria-label={label}
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-[var(--space-5)]",
            isCollapsed && "items-center gap-[var(--space-3)]",
          )}
        >
          {groups.map((group) => {
            const open = !closed.includes(group.id);
            return (
              <div
                key={group.id}
                data-slot="rail-group"
                className={cn(
                  "flex min-w-0 flex-col gap-[var(--space-2)]",
                  isCollapsed && "items-center",
                )}
              >
                {/* 26.02: "the group headers and chevrons disappear entirely
                    (there's nothing to collapse further)" once collapsed. */}
                {!isCollapsed ? (
                  <button
                    type="button"
                    data-slot="rail-group-heading"
                    aria-expanded={open}
                    onClick={() => {
                      toggleGroup(group.id);
                    }}
                    className={cn(
                      /* THE HEADING BEGINS WITH TYPE. Client, 2026-08-24:
                         "'sections' have no icons, but pages do (the opposite
                         as now)". The chevron that used to lead is a CONTROL
                         — 26.02 names the group chevron twice and it is the
                         group's only collapse affordance — so it moved to the
                         trailing edge rather than being deleted, and the
                         label now starts flush with the destinations' icon
                         column below it. The heading's gap is 26.02's own 8,
                         not the 4 it carried while the glyph led. */
                      "flex min-w-0 cursor-pointer items-center gap-[var(--space-2)]",
                      "border-0 bg-transparent px-[var(--space-3)] text-start",
                      /* 11 / 500 / uppercase / 0.08em — the eyebrow step, the
                         same one `Title` draws its own eyebrow at. */
                      "text-micro font-[var(--font-weight-medium)] uppercase",
                      "text-[var(--spine-ink-quiet)] transition-colors",
                      "duration-[var(--duration-colour)] ease-kwapso",
                      "hover:text-[var(--spine-ink)]",
                      "[&_svg]:size-[var(--icon-16)] [&_svg]:shrink-0",
                    )}
                  >
                    {/* NOT `flex-1`: the label takes its own width so the
                        chevron follows the word it discloses instead of being
                        thrown to the far side of a 208 column, where it would
                        read as a second, unrelated control. */}
                    <span className="min-w-0 truncate">{group.heading}</span>
                    {open ? (
                      <ChevronDown aria-hidden="true" />
                    ) : (
                      <ChevronRight aria-hidden="true" />
                    )}
                  </button>
                ) : null}

                {open || isCollapsed
                  ? group.items.map((item) => (
                      <RailRow
                        key={item.id}
                        item={item}
                        active={item.id === current}
                        collapsed={isCollapsed}
                        reserveIcon={reserveIcon}
                        onSelect={onSelect}
                      />
                    ))
                  : null}
              </div>
            );
          })}
        </nav>

        {/* THE COLLAPSE TOGGLE — opt-in, and never mango. Chapter 15 draws the
            only one in the document, on the icon rail. */}
        {collapsible ? (
          <button
            type="button"
            data-slot="rail-collapse"
            aria-label={isCollapsed ? expandLabel : collapseLabel}
            aria-expanded={!isCollapsed}
            onClick={toggleCollapsed}
            className={cn(
              ROW_SHAPE,
              isCollapsed ? ROW_COLLAPSED : ROW_EXPANDED,
              ROW_PRESSABLE,
              ROW_IDLE,
            )}
          >
            {isCollapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
            {!isCollapsed ? (
              <span className="min-w-0 flex-1 truncate">{collapseLabel}</span>
            ) : null}
          </button>
        ) : null}

        {/* THE MEMBER CHIP — a container, in `--spine-chip-fill`: the paper
            one rung off whichever spine it is standing on. On paper that is
            the off-beige chip 27.1 and 27.26 draw at the foot; on ink and
            mango it is the same relationship, one rung, and nothing here
            picks a colour.

            26.02: "no member list (that lives in Settings)". One chip. */}
        {member !== null && member !== undefined ? (
          <MemberChip member={member} collapsed={isCollapsed} />
        ) : null}
      </div>
    );
  },
);

Rail.displayName = "Rail";

/* ----------------------------------------------------------------------------
   The chip at the foot.
   -------------------------------------------------------------------------- */

function MemberChip({
  member,
  collapsed,
}: {
  member: RailMember;
  collapsed: boolean;
}) {
  /* THE FACE TAKES THE ACTIVE ROW'S PAIR, AND 26.02 DRAWS IT THAT WAY IN ALL
     THREE SPECIMENS: the foot circle is the same fill and the same ink as the
     lit row above it — mango with charcoal on the ink and paper spines,
     charcoal with off-beige on the mango one. So it is not a second decision
     and there is no second token; `variant="brand"` supplies the shape and
     the size and the two spine values overrule its fill. */
  const face = (
    <Avatar
      size="md"
      variant="brand"
      className="bg-[var(--spine-active-fill)] text-[var(--spine-active-ink)]"
    >
      <AvatarFallback>{initialsOf(member.name, member.initials)}</AvatarFallback>
    </Avatar>
  );

  if (collapsed) {
    /* Collapsed, the chip is the face alone — "at the same circular size as
       the avatar" is the size every collapsed entry took, so the column reads
       as one ladder. No pill: a container around a circle is two boxes. */
    if (member.href === undefined && member.onSelect === undefined) {
      return (
        <div data-slot="rail-member" className="flex justify-center">
          {face}
        </div>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <MemberControl member={member} className="rounded-pill">
            {face}
          </MemberControl>
        </TooltipTrigger>
        <TooltipContent side="right">{member.name}</TooltipContent>
      </Tooltip>
    );
  }

  /* WHAT THE EYE READS AND WHAT THE EAR HEARS ARE NOW TWO DIFFERENT STRINGS,
     AND BOTH ARE DELIBERATE.

     Client, 2026-08-24: "i want only the first name, not full name". The
     first name is `givenName`, supplied by the APPLICATION — never split off
     `name` here, because whitespace is not a name boundary in any of the
     three RTL locales this ships into (see `RailMember.givenName`).

     A screen reader announcing "María" where the record says "María José
     García" would know LESS than the person looking at the screen, which is a
     regression dressed as a simplification. So when the two strings differ,
     the visible one is `aria-hidden` and the full name rides in an `sr-only`
     span: the accessible name of the chip is the whole name, said once. When
     they are the same — no `givenName`, or a mononym — one span is rendered,
     nothing is hidden and nothing is duplicated. */
  const shown = member.givenName ?? member.name;
  const abbreviated = shown.trim() !== member.name.trim();

  const inner = (
    <>
      {face}
      {/* ONE LINE, SO NO COLUMN. D5 = C still sets the step — 14 at medium —
          but the role that used to sit under it at 13/300 is gone on a client
          ruling and the `flex-col` that stacked them went with it. See
          `RailMember.role`. The chip's height is now the avatar's, which is
          what the `--space-1` padding was always drawn against. */}
      <Text
        as="span"
        size="sm"
        aria-hidden={abbreviated ? true : undefined}
        className="min-w-0 flex-1 truncate font-[var(--font-weight-medium)] text-[var(--spine-ink)]"
      >
        {shown}
      </Text>
      {abbreviated ? <span className="sr-only">{member.name}</span> : null}
    </>
  );

  const shell = cn(
    "flex min-w-0 items-center gap-[var(--space-3)] text-start",
    "rounded-pill border-0 bg-[var(--spine-chip-fill)]",
    /* 4 around a 32 avatar in a 999 pill: the pill's radius (20) is the
       avatar's (16) plus its own padding, so the two circles are concentric.
       This was already the intent; with two lines of type the TEXT was taller
       than the avatar and set the height instead, leaving the face floating
       in ~5.8 of slack. Removing the role did not loosen the chip — it let
       the padding that was written here actually apply. */
    "p-[var(--space-1)] pe-[var(--space-3)]",
  );

  if (member.href === undefined && member.onSelect === undefined) {
    return (
      <div data-slot="rail-member" className={shell}>
        {inner}
      </div>
    );
  }

  return (
    <MemberControl
      member={member}
      className={cn(
        shell,
        ROW_PRESSABLE,
        "transition-[background-color,transform]",
        "duration-[var(--duration-colour)] ease-kwapso",
      )}
    >
      {inner}
    </MemberControl>
  );
}

/** Link or button, the same branch the entries take, for the same PAG-2 reason. */
function MemberControl({
  member,
  className,
  children,
}: {
  member: RailMember;
  className?: string;
  children: React.ReactNode;
}) {
  if (member.href !== undefined) {
    return (
      <a
        data-slot="rail-member"
        href={member.href}
        onClick={member.onSelect}
        className={cn("no-underline", className)}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      data-slot="rail-member"
      type="button"
      onClick={member.onSelect}
      className={className}
    >
      {children}
    </button>
  );
}

export { Rail, PLACEHOLDER_GROUPS as RAIL_PLACEHOLDER_GROUPS };
