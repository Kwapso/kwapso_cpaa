/* ============================================================================
   PermissionMatrix — collections down the side, roles across the top, and
   FOUR INDEPENDENT CAPABILITIES in every cell (1 direct call site).

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" → chapter 27, composition 27.12 "Permissions". Its
   subtitle is the design in one line — "A matrix, not a pile of switches" —
   and the body is quoted verbatim:

       "Who can open what. One screen, one table: collections down the side,
        roles across the top, and a single word in every cell. It lives on
        Settings · Roles in the system and does not exist in the portal at
        all."

   and its footnote, also verbatim:

       "A change applies at once and is written to the activity log."

   PERMISSION IS NOT A LADDER — THE CLIENT'S RULING, 2026-08-24
   Everything the chapter says about the SCREEN survives. The sentence about
   the CELL does not. The client, verbatim:

       "it does not work like that, there are different options and you can
        have many, so rethink the design, the actions are: see, add, edit,
        delete. f.e. someone might have all, and someone only can see — all
        variations are possible."

   So a cell is not one word off a three-rung ladder. It is FOUR INDEPENDENT
   BOOLEANS and all sixteen subsets are legal, including ones nobody would
   plan. "Full" and "Read" cannot describe *add but not see*, so no single
   word can stay in the cell, and 27.12's own defence of the ladder —
   "There is no 'edit but not delete' tier: it would double the table to save
   one case" — is the sentence the ruling overturns. OVERRIDE 24 is amended in
   place in KWAPSO-SPEC.md and carries the whole change; there is no second
   row.

   WHETHER AN ODD SUBSET IS SENSIBLE IS NOT THIS FILE'S QUESTION. "Delete but
   not see" draws without comment. Nothing here warns, blocks or corrects a
   combination: that is a rule about the product, and it belongs to the
   application.

   APPROACH A — THE RUN. Drawn, measured and chosen at `verify/permissions.html`
   §A, and built here without improvisation:

     · FOUR FIXED SLOTS PER CELL, in the client's own order — see · add ·
       edit · delete. They never move and never reorder, at any width.
     · THE SLOT WEARS `Checkbox`'S SKIN. 1.375rem, `--radius-select`, `--card`
       behind a hairline when the capability is not held, `--surface-inverse`
       and NO hairline when it is — `checkbox.tsx`'s own
       `enabled:data-[state=checked]:shadow-none`, not a new rule.
     · BECAUSE A HELD SLOT DROPS ITS HAIRLINE AND THE SLOTS ARE ADJACENT, HELD
       SLOTS FUSE. All four is one unbroken charcoal lozenge; three of four is
       a paper well bitten out of it. **Position carries the meaning and the
       letter is the text alternative** — an exception is a hole in a solid
       shape rather than something to count. That is the whole reason A was
       chosen over the other three drawings.
     · COLOURLESS BY DESIGN, and it is measured rather than asserted.
       `--dot-review` sky — the colour the ladder gave "Read" — reads 2.000:1
       on card in light against a 3:1 floor for a mark that carries meaning,
       and `--chart-2` against `--chart-3` already measures 1.004. Four hues
       per cell, 120 of them, is not a scheme this palette can carry. Ruling
       26 is satisfied by leaving colour nothing to say alone.

   WHY THE SLOT IS NOT A `Checkbox` INSTANCE, STATED RATHER THAN HIDDEN
   `Checkbox` hard-codes its own indicator, so a caller cannot put the
   capability's initial where the tick goes — and the letter is load-bearing
   twice over: it is the text alternative for a position, and it is the one
   mitigation this drawing has for the hairline failure below. So the slot
   wears the skin `checkbox.tsx` states and is not an instance of it. Three
   things differ, all three deliberate:

     1. THE LETTER REPLACES THE TICK.
     2. THE RADIUS BELONGS TO THE RUN, NOT THE SLOT. Ruling 03 gives 6 to
        "marks and selection controls"; the run IS the mark here, so it takes
        the 6 at its two ends and the interior corners are square. Rounding
        each slot would put four paper notches inside a fused lozenge and
        destroy the one reading the drawing exists for.
     3. THE STATE IS RESOLVED IN JS, NOT THROUGH `:enabled` / `:disabled`.
        `checkbox.tsx` uses the native pseudo-classes because a fieldset can
        disable it behind the component's back. Here a run may be a `<span>`
        (nothing to press at 380, and nothing to press with no `onChange`),
        and a `<span>` matches neither pseudo-class — so the same four skins
        have to be reachable on both elements. Resolving in JS is what makes
        the static run and the live one identical.

   THE LOCKED STATE WAS A REAL DEFECT. THE FIRST FIX WAS NOT ENOUGH, AND THE
   CLIENT HAS NOW RULED — 2026-08-24, D4-B
   Found while drawing A. `checkbox.tsx`'s disabled rules are unconditional —
   `--hair-faint` fill, `--ink-disabled` mark — so a locked run rendered all
   four slots IDENTICALLY and ERASED which capabilities were held. The first
   fix kept the state by SWAPPING the fill and ink pair per slot: locked held
   took `--btn-disabled-fill`, locked not-held took `--hair-faint`. That kept
   the state in the DOM but it did not carry enough distance to READ it.
   Measured in the built component, both palettes, transitions suppressed:

       ON `--card`            locked held vs locked not-held  1.191 / 1.124
       ON `--surface-panel`   the same pair                   1.082 / 1.004
       locked letter on its own fill                          1.817 / 2.946

   against 3:1 and 4.5:1. `verify/permissions.html` had measured the first
   line only (1.188 / 1.130) — its stage was `--card`. THE SECOND LINE IS THE
   ONE THAT DECIDED IT: `--btn-disabled-fill` is opaque and `--hair-faint` is
   not, so the locked NOT-HELD slot took its colour from whatever paper was
   behind the grid. On soft paper in dark the two locked fills landed on
   `#2F2D28` and `#2E2D2A` — **1.004, no separation at all**. Nothing inside
   the tokens opened that pair: an opacity is a standing rejection, and giving
   locked-held `--surface-quiet` walks into override 12, which pins
   `--btn-disabled-fill` precisely so a disabled fill can never be lighter
   than an enabled secondary.

   So it went to the client as `verify/decide.html` §D4, drawn both ways. The
   ruling, verbatim: **"d4 idk, you decide"** — answered against the page's own
   printed recommendation, which was **B**. B is built.

   B: A LOCKED RUN IS DRAWN EXACTLY AS A LIVE ONE, AND THE LOCK MOVES ONTO THE
   ROW. There is no locked skin. `slotSkin` takes one argument now, because
   the second one had nothing left to decide. A locked cell measures whatever
   a live cell measures — held against not-held, 17.386 light / 15.353 dark on
   card and on soft paper alike, because both fills are opaque — and the
   letter measures what a live letter measures. Nothing is dimmed, so nothing
   is lost, and the two numbers above stop existing rather than being excused.

   WHAT MARKS IT, AND WHERE THAT COMES FROM. The mark is not invented. The
   artifact was searched for how it draws a thing that cannot be changed, and
   it draws exactly four things, none of them a glyph and none of them a
   colour:
     · ch10, the checkbox list — the WORDS "Locked by policy", in the disabled
       label ink, with `cursor: not-allowed` on the row. This is the phrase.
     · ch10, the state table — disabled is "none · not-allowed": no ring, and
       the cursor IS the pointer's answer.
     · ch10, the field list — "Read-only … System-set values lose the border
       entirely", at FULL-STRENGTH ink. Read-only is not disabled in this kit:
       a value you may not change keeps its contrast. That sentence is B.
     · ch24 record chrome — "Read-only while editing", a micro eyebrow over a
       group of fields nobody may edit; and ch27's form footer, "Locked while
       submitting". Both are words in quiet ink.
   CH27.12 ITSELF DRAWS NO LOCKED CELL AT ALL — its grid has no locked row and
   no lock mark anywhere in it. So there is no drawing to copy, and the kit's
   own vocabulary is used instead: the phrase is the artifact's, "Locked by
   policy".

   AND IT IS CARRIED BY NOTHING — "WORD ONLY", RULED 2026-08-24, D6-B
   The phrase first shipped this morning on a `Badge variant="secondary"`.
   That chip's FILL then measured 1.339 / 1.214 light and 1.324 / 1.471 dark
   against the row's paper, short of a 3:1 non-text floor, and the question of
   what to put the words in went back to the client as `verify/decide-2.html`
   §D6. The answer, verbatim:

       "d6. i dont understand, did i not decide like permissions word only?
        if unclear do another visual"

   That is an answer, not a question, and it is a fair reading of the ruling
   they had already given: "a word on the row" never meant a pill around the
   word. THE CONTAINER IS GONE. No `Badge`, no fill, no radius — and so no
   fill left to fail a floor. The words are bare.

   THE REGISTER FOR BARE WORDS IS THE ARTIFACT'S, AND IT IS NOT THE EYEBROW.
   The kit's micro uppercase eyebrow was the other candidate, and the artifact
   was searched to settle it: the eyebrow appears 268 times and every single
   one is a HEADING ABOVE A TITLE — "System · 5 roles" over "Roles", "Group ·
   118 archived" over "Collection", "Read-only while editing" over a field
   group. It never annotates a row. What the artifact DOES draw for a state on
   a row it draws twice, and it is bare words at the ROW'S OWN SIZE in `--fg3`
   after an EM DASH:

       Shift-handover.docx — unsupported format
       Some selected — indeterminate

   which is this case exactly. So the mark is:

       Capacity — Locked by policy: Lead, Guest

   THE EM DASH IS LOAD-BEARING. Taking the pill away creates one real risk —
   that the phrase reads as a suffix to the collection's NAME rather than as a
   statement about the row — and it is answered with three separations at
   once, none of them a container: the dash, the drop to `--ink-tertiary`, and
   the drop out of the name cell's medium weight to light. That is the kit's
   own device for exactly this, not a new one.

   No glyph, no dot, no icon, no second mango, and **nothing carried by hue**:
   read in greyscale the mark is still English words. Ruling 26 has nothing to
   fail on, and there is no longer even a fill to argue about.

   THE MARK SITS AT THE SCOPE OF THE LOCK, and there is one rule for that: the
   row that holds a locked cell carries the mark, in its name cell, beside the
   collection. When every shown role is locked on that row the mark is the
   phrase alone; when only some are, IT NAMES THEM — "Locked by policy: Lead,
   Guest" — because a bare mark on a partly-locked row would be a lie, and
   naming the roles is more than the old per-cell dimming ever said. Whole-grid
   `disabled` is the case where every row is fully locked, so the same rule
   draws the same phrase on every row without a second code path.

   POINTER AND KEYBOARD STILL SAY NO, AND THAT IS THE COST OF B PAID.
     · The slots were never tab stops when locked and still are not. 120 dead
       tab stops would be worse than none.
     · A locked run takes `cursor-not-allowed` — chapter 10's own stated
       disabled cursor, the same one `checkbox.tsx`, `input.tsx`, `tabs.tsx`
       and `pagination.tsx` already use. The pointer says no BEFORE the click,
       which is what a run that looks live owes it.
     · A locked run raises the lock phrase in a `Tooltip` on hover — the same
       `tooltip.tsx` a live slot uses for its capability's word. So the reason
       is on the cell, not only on the row.
     · A click does nothing, and now nothing is the answer the reader was
       already given twice before they made it.
     · The screen reader is unchanged and still complete: a locked run is one
       `role="img"` whose `aria-label` is the whole subset in words followed by
       the lock phrase — "Lead · Capacity: See, Edit, Locked by policy". The
       run is reachable in a screen reader's table browse without being a tab
       stop, which is the point.
     · READ-ONLY IS NOT LOCKED and is still drawn differently from it: with no
       `onChange` a run is a plain mark with NO not-allowed cursor and NO lock
       phrase, because a reference table is not a frozen form. State 10.

   THE LOCKED REGISTER LEAVES THE LEGEND. A legend translates a mark that is
   not words into words; this mark IS words, sitting on the row a few
   millimetres away. And a locked run drawn in the legend would now be
   pixel-identical to the "held" and "not held" registers beside it — the same
   duplication this file already refuses for the capability-order line. So
   `lockedLabel` is no longer a legend phrase: it is the mark's own text, and
   the words appended to a locked cell's accessible name. Same prop, same
   default string, capitalised because it is now a chip's label and no longer
   a clause. `LegendRun` loses its `locked` argument for the same reason
   `slotSkin` did — there is nothing left for it to draw.

   THE UNCHECKED HAIRLINE IS THE SYSTEM'S ACCEPTED FAILURE AND IS NOT PATCHED
   A not-held slot is outlined at `--hair-strong`, override 42's resting field
   edge — measured **1.526 light / 2.185 dark** against WCAG 1.4.11's 3:1.
   Three-to-one needs roughly 47% ink, which is a border, and this system has
   none. Every field, checkbox, radio and select in the kit carries the same
   edge; nothing here makes it worse and nothing here can fix it alone. WHAT A
   MITIGATES IS THE LETTER: measured **6.506 light / 7.928 dark** against 4.5,
   it marks the slot's position whether or not the well around it is visible.

   `verify/permissions.html` drew the not-held slot at `--hairline` (8%) and
   measured 1.175 / 1.455. That page was written three minutes before
   override 42 landed in `checkbox.tsx` and is one step stale on this one
   value: 8% at rest would give a resting slot and a LOCKED slot the same
   edge, which is the exact defect override 42 exists to remove. The skin
   `checkbox.tsx` actually states is built, and the divergence is recorded
   here rather than resolved silently.

   THE API CHANGED, AND IT HAD TO
   `onChange` reported `(collectionId, roleId, levelId)`. A cell is now four
   booleans, so a callback carrying one id cannot describe a change to it. It
   is now:

       onChange(collectionId, roleId, capabilityId, next: boolean)

   Override 24's own note already recorded a signature change as unavoidable
   the last time this cell was redrawn; this is the second and last one the
   model forces. EVERY EXPORT NAME SURVIVES. `PERMISSION_LEVELS` and
   `PermissionLevel` are kept as deprecated aliases of the capability set and
   its type, so no call site's import breaks on the day the model changed;
   they are two lines and cost nothing to delete once the apps have moved.

   CAPABILITIES ARE A PROP, SO A FIFTH IS A DATA ENTRY
   `capabilities` defaults to `PERMISSION_CAPABILITIES` — the client's four
   words and nothing else is invented. The header, the cells, the run's width
   and the legend all count from the array, so a fifth capability costs one
   entry and never an edit to this file. `RIGHTS` and `WRITE_RIGHTS` are now
   the capability ids and the three of them that CHANGE a record; the older
   `view / create / edit / delete` vocabulary is gone, because keeping a
   second set of words for the same four things is how two lists drift.

   The TABLE is `table.tsx`, transcribed from f3.css `.kw-matrix`; the slot's
   skin is `checkbox.tsx`'s; the hover name on a slot is `tooltip.tsx`.
   Nothing is redrawn here. This file is the grid, its header, the run, the
   narrow cards, the legend and the three registers, and nothing else.

   THE LAW THIS FILE OBEYS
   · PERMISSIONS HIDE (ch24.6). A collection the reader may not see is absent
     from the grid, and so is a role — not greyed, not locked, not a row or a
     column of blanks. A matrix with nothing visible renders its empty
     register, and one the reader may not open at all renders nothing.
   · A SLOT THE READER MAY NOT CHANGE IS NOT A CONTROL. It is the same mark
     without a press. 120 dead tab stops would be worse than none.
   · Disabled is a fill and an ink. Never an opacity. LOCKED IS NEITHER — it
     is a word on the row, ruled D4-B, and the cell keeps its full contrast.
   · The row is 56 — `--control-height-row`, ruling 28 — because `TableRow`
     says so, at every width.
   · The header is the kit's micro uppercase eyebrow on the `--hair-strong`
     section rule, which is `TableHead`'s own drawing.
   · No `border`, no literal colour, no `px`, no font size, no opacity for a
     state.
   · Focus is ONE global rule (tokens.css §8). A slot that can be changed is a
     real `<button>` and takes the ring at its own corner.
   · NO MANGO. 120 marks and not one of them is the brand.

   RENDERING CONTEXT
   `"use client"`. Change handlers are built during render and `Tooltip` is
   Radix underneath.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Skeleton } from "../../controls/skeleton/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../controls/table/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../controls/tooltip/tooltip";
import { ScreenRegister } from "../screen-renderer/screen-renderer";

/* ============================================================================
   The capabilities — the client's four, and nothing beyond them
   ========================================================================= */

/**
 * The four actions, in the order the client named them.
 *
 * They are not a ladder and none of them contains another: a role holds any
 * subset of the four, and all sixteen subsets are legal.
 */
const RIGHTS = ["see", "add", "edit", "delete"] as const;

/**
 * The three that CHANGE a record, as against `see`, which only opens one.
 * Kept because it is the one true relation between the four — and it is a
 * FACT about them, never a tier a cell can be set to.
 */
const WRITE_RIGHTS = ["add", "edit", "delete"] as const;

export type PermissionRight = (typeof RIGHTS)[number];

/**
 * Which capabilities something grants. A missing key is `false`, and every
 * one of the sixteen shapes this type can take is legal.
 */
export type PermissionCells = Partial<Record<PermissionRight, boolean>>;

export interface PermissionCapability {
  /** Stable key. This is the value handed to `onChange`. */
  id: string;
  /**
   * The capability's word, in the reader's language. The client's four are
   * See, Add, Edit and Delete; nothing else is shipped.
   */
  label: string;
  /**
   * The single character drawn in the slot. Defaults to the first character
   * of `label`, upper-cased — which is a prop and not a substring rule,
   * because a language whose four words share an initial needs to choose its
   * own four marks.
   */
  initial?: string;
}

/** The client's own words for their own four actions. */
const CAPABILITY_LABELS: Record<PermissionRight, string> = {
  see: "See",
  add: "Add",
  edit: "Edit",
  delete: "Delete",
};

/**
 * The client's four. Derived from `RIGHTS` so the ids in the data and the
 * slots on the screen are one list.
 */
const PERMISSION_CAPABILITIES: readonly PermissionCapability[] = RIGHTS.map(
  (id) => ({ id, label: CAPABILITY_LABELS[id] }),
);

/**
 * @deprecated The ladder is gone — see the file header. Kept only so an
 * import written against the levels API still resolves; it is
 * `PERMISSION_CAPABILITIES`, and a call site should say so.
 */
const PERMISSION_LEVELS = PERMISSION_CAPABILITIES;

/**
 * @deprecated A cell is four independent capabilities, not one level. An
 * alias of `PermissionCapability`, kept for the same reason.
 */
export type PermissionLevel = PermissionCapability;

/* ============================================================================
   The axes
   ========================================================================= */

/** One column: a role a member can hold. */
export interface PermissionRole {
  /** Stable key, and the value handed to `onChange`. */
  id: string;
  /** What the role is called, in the reader's language. */
  label: React.ReactNode;
  /**
   * The reader may not see this role. `false` removes the COLUMN entirely —
   * ch24.6: permissions hide, they do not disable. Defaults to `true`.
   */
  visible?: boolean;
}

/**
 * One row. The kit's word for a row is "collection"; the prop keeps the
 * commission's noun so no call site has to be rewritten to read this file.
 */
export interface PermissionModule {
  /** Stable key, and the value handed to `onChange`. */
  id: string;
  /** What the collection is called, in the reader's language. */
  label: React.ReactNode;
  /** The quiet line under it — what the collection covers. */
  description?: React.ReactNode;
  /**
   * WHICH CAPABILITIES EACH ROLE HOLDS HERE, keyed by role id. A role with no
   * entry holds NOTHING: an unstated permission is a closed door, which is
   * the same answer the retired `fallbackLevel` gave and needs no prop to
   * say it now that the empty set is expressible.
   *
   * Any subset in any order; the run always draws the capabilities in
   * `capabilities` order, never in the order they appear here.
   */
  held?: Readonly<Record<string, readonly string[]>>;
  /**
   * Roles whose cell cannot be changed here. `true` locks the whole row.
   *
   * The CELLS are unchanged by this — D4-B: a locked run is drawn exactly as a
   * live one and keeps every distance a live one has. What it earns is
   * `cursor-not-allowed`, the lock's phrase on hover, no tab stop, and a
   * `lockedLabel` mark beside the collection's name that names these roles
   * when they are not all of them.
   */
  locked?: boolean | readonly string[];
  /**
   * The reader may not see this collection. `false` removes the ROW entirely
   * — ch24.6. Defaults to `true`.
   */
  visible?: boolean;
}

export interface PermissionMatrixProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange"> {
  /** The rows — collections down the side. */
  modules: readonly PermissionModule[];
  /** The columns — roles across the top. */
  roles: readonly PermissionRole[];
  /**
   * The slots in every cell, in the order they are drawn. Defaults to the
   * client's four. ANY NUMBER IS DRAWN: the run's width, the cells and the
   * legend all count from this array, so a fifth capability is a data entry
   * and never an edit to this file.
   */
  capabilities?: readonly PermissionCapability[];
  /** The first column's heading. The kit's own word for the side axis. */
  moduleLabel?: string;
  /**
   * Fires on every change, with the capability that moved and where it
   * landed. ch27.12: "A change applies at once."
   *
   * Absent, every run is a plain mark and nothing is pressable — which is
   * state 10, and is NOT the same as `disabled`.
   */
  onChange?: (
    moduleId: string,
    roleId: string,
    capabilityId: string,
    next: boolean,
  ) => void;
  /**
   * Nothing may be changed right now, though somebody could. Every cell is
   * locked, so every row carries the mark and no slot is a tab stop — and
   * every run still draws at full contrast, because a grid you may not edit
   * is still a grid somebody has to audit.
   */
  disabled?: boolean;
  /** Which body is drawn. Only the rows swap; the header and legend stay. */
  state?: "ready" | "loading" | "empty" | "error";
  /** The grid's accessible name. Defaulted so no call site ships a nameless table. */
  label?: string;
  /**
   * A width below which the wide grid overflows and scrolls rather than
   * crushing its columns. Defaults to a 7.5rem name column plus one run and
   * its cell inset per role, computed from the role and capability counts —
   * so it is right for three roles and for eight, and for a fifth capability.
   */
  minWidth?: string;
  /**
   * The sentence under the grid. ch27.12's own, verbatim, and the reason the
   * legend is drawn at all: a screen that changes a permission on the press
   * has to say so.
   */
  footnote?: React.ReactNode;
  /** Draw the legend under the grid. On, because the kit draws it. */
  legend?: boolean;
  /** The legend's word for a slot that is filled. */
  heldLabel?: string;
  /** The legend's word for a slot that is not. */
  notHeldLabel?: string;
  /**
   * THE MARK'S OWN WORDS — the artifact's phrase, ch10. Drawn BARE, running
   * on from the collection's name after an em dash in `--ink-tertiary`, on
   * any row holding a locked cell; raised in a `Tooltip` over any locked run;
   * and appended to a locked cell's accessible name.
   *
   * It is not a legend phrase (D4-B: a locked run is drawn exactly as a live
   * one, so there is no locked register for a legend to translate) and it is
   * not a chip (D6-B, "word only": the container is gone).
   */
  lockedLabel?: string;
  /**
   * The mark's words when only SOME roles are locked on a row. Defaulted to
   * `"<phrase>: <role>, <role>"`, and a prop for the same reason
   * `formatCellLabel` is one: word order and punctuation differ between
   * languages. It is never called when every shown role on the row is locked
   * — that row draws the bare phrase.
   */
  formatLockedLabel?: (lockedLabel: string, roleLabels: readonly string[]) => string;
  /** What an empty subset is called in an accessible name. */
  nothingLabel?: string;
  /** How many skeleton rows the loading body draws. */
  loadingRows?: number;
  /** What a screen reader hears while the grid loads. */
  loadingLabel?: string;
  /** The empty register's sentence. */
  emptyTitle?: React.ReactNode;
  /** The line under it. */
  emptyDescription?: React.ReactNode;
  /** The error register's sentence. */
  errorTitle?: React.ReactNode;
  /** The line under it. */
  errorDescription?: React.ReactNode;
  /** The retry. */
  errorAction?: React.ReactNode;
  /**
   * The accessible name of a whole cell, built from the collection, the role
   * and the capabilities it holds. Defaulted, and a prop because word order
   * differs between languages: a run announced as four letters says nothing.
   */
  formatCellLabel?: (
    moduleLabel: string,
    roleLabel: string,
    held: readonly string[],
    locked: boolean,
  ) => string;
  /**
   * The accessible name of ONE slot. Defaulted, and a prop for the same
   * reason. This is the string a screen reader reads on the checkbox itself.
   */
  formatSlotLabel?: (
    moduleLabel: string,
    roleLabel: string,
    capabilityLabel: string,
    held: boolean,
  ) => string;
}

/* ----------------------------------------------------------------------------
   Reading the data
   ------------------------------------------------------------------------- */

/** True when this role's cell on this row cannot be changed. */
function isLocked(
  module: PermissionModule,
  roleId: string,
  disabled: boolean,
): boolean {
  if (disabled) return true;
  if (module.locked === true) return true;
  if (Array.isArray(module.locked)) {
    return (module.locked as readonly string[]).includes(roleId);
  }
  return false;
}

/** True when this role holds this capability on this row. */
function holds(
  module: PermissionModule,
  roleId: string,
  capabilityId: string,
): boolean {
  return (module.held?.[roleId] ?? []).includes(capabilityId);
}

/** The word a reader can read out loud, for an accessible name. */
function plain(node: React.ReactNode, fallback: string): string {
  return typeof node === "string" ? node : fallback;
}

/** The character in the slot. */
function initialOf(capability: PermissionCapability): string {
  return capability.initial ?? capability.label.charAt(0).toLocaleUpperCase();
}

/* ----------------------------------------------------------------------------
   The slot — `Checkbox`'s skin, with the capability's initial where the tick
   would be. See the file header for the three ways it differs and why.
   ------------------------------------------------------------------------- */

/** Everything a slot wears in every state. */
const SLOT_SHAPE = [
  /* `checkbox.tsx`: 22 square, centred content, never shrinking. 22 is off
     the ruling-28 scale and has no token; it is the literal the kit already
     uses (T10-2), not a snapped value. */
  "inline-grid size-[1.375rem] shrink-0 place-content-center",
  /* Ruling 03's 6 belongs to the RUN — see the header. The interior corners
     are square so four held slots fuse into one shape. */
  "rounded-none",
  "first:rounded-s-[var(--radius-select)] last:rounded-e-[var(--radius-select)]",
  /* The letter. `text-micro` carries the eyebrow's 0.08em, which pushes a
     single centred character off its own axis, so the tracking is returned
     to normal — a token, not a magic number. */
  "text-micro font-[var(--font-weight-medium)] tracking-normal",
  "transition-[background-color,box-shadow,color]",
  "duration-[var(--duration-colour)] ease-kwapso",
].join(" ");

/**
 * THE TWO SKINS — and there are two, not four, which is the whole of D4-B.
 *
 * HELD      `--surface-inverse` + `--ink-on-inverse`, and NO hairline — the
 *           fill is the edge once it is on, which is what lets adjacent held
 *           slots fuse.
 * NOT-HELD  `--card` + `--ink-tertiary` behind `--hairline-strong`, override
 *           42's resting field edge.
 *
 * A LOCKED CELL TAKES THE SAME TWO. It used to take a swapped disabled pair
 * that measured 1.004 on soft paper in dark; the client ruled D4-B and the
 * locked skin is gone rather than excused. `locked` is not an argument here
 * because it no longer changes a single declaration — it changes the cursor,
 * the hover pill and the row's mark, which are elsewhere and are not fills.
 */
function slotSkin(held: boolean): string {
  return held
    ? "bg-surface-inverse text-ink-on-inverse"
    : "bg-card text-ink-tertiary shadow-[var(--hairline-strong)]";
}

/** The run's shell. One shape, rounded at its two ends only. */
const RUN_SHELL =
  "inline-flex shrink-0 items-center overflow-hidden rounded-[var(--radius-select)]";

/**
 * A run drawn purely as an example — in the legend, where it stands for a
 * register rather than for a cell. `held` decides each slot, so the same two
 * lines draw "held" and "not held".
 *
 * There is no third call. The locked register left the legend when the locked
 * skin left the component: a run drawn locked would now be pixel-identical to
 * one of these two, and the mark for a lock is a word on the row.
 */
function LegendRun({
  capabilities,
  held,
}: {
  capabilities: readonly PermissionCapability[];
  held: (index: number) => boolean;
}) {
  return (
    <span aria-hidden="true" className={RUN_SHELL}>
      {capabilities.map((capability, index) => (
        <span key={capability.id} className={cn(SLOT_SHAPE, slotSkin(held(index)))}>
          {initialOf(capability)}
        </span>
      ))}
    </span>
  );
}

/**
 * THE MARK — the artifact's own phrase, and now the artifact's own SHAPE for
 * it, which is no shape at all.
 *
 * RULED "WORD ONLY", 2026-08-24. It shipped this morning on a
 * `Badge variant="secondary"`. The chip's FILL measured 1.339 / 1.214 light
 * and 1.324 / 1.471 dark against the row's paper, short of a 3:1 non-text
 * floor, and went back to the client as `verify/decide-2.html` §D6. Their
 * answer, verbatim: **"d6. i dont understand, did i not decide like
 * permissions word only? if unclear do another visual"** — which is an
 * answer, and it reads on the ruling they had already given: "a word on the
 * row" never meant a pill around the word. So the pill goes. No `Badge`, no
 * fill, no radius, and therefore no fill left to fail a floor.
 *
 * THE REGISTER IS THE ARTIFACT'S, AND IT IS NOT THE EYEBROW. The kit's micro
 * uppercase eyebrow was on the table as an option, but the artifact uses it
 * in exactly one way — as a HEADING ABOVE A TITLE ("System · 5 roles" over
 * "Roles", "Group · 118 archived" over "Collection", "Read-only while
 * editing" over a field group). It never annotates a row with it. What the
 * artifact DOES draw for a state on a row, twice, is bare words at the row's
 * own size in `--fg3` after an EM DASH:
 *
 *     Shift-handover.docx — unsupported format
 *     Some selected — indeterminate
 *
 * The second is a row in a list whose state is named; the first is the same
 * shape on a file row. That is this case exactly, so that is what is built:
 *
 *     Capacity — Locked by policy: Lead, Guest
 *
 * AND THE EM DASH IS LOAD-BEARING. It is what stops the phrase reading as a
 * suffix to the collection's name — three separations at once and none of
 * them a container: the dash, the drop to `--ink-tertiary`, and the drop out
 * of the name cell's medium weight to light. Remove any one and it starts to
 * look like part of the name; that is the whole risk of taking the pill away
 * and it is answered with the kit's own device rather than a new one.
 *
 * Still no hue, so ruling 26 is still satisfied by there being nothing for
 * colour to say alone — and now there is not even a fill to argue about.
 *
 * It is `aria-hidden` because the same phrase is already inside every locked
 * cell's accessible name in that cell's own sentence. Announced here too it
 * would be read once per row and once per cell, which is six extra readings
 * of a fact the reader has already been given.
 */
function LockMark({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      data-slot="permission-matrix-locked"
      /* No size of its own: it inherits the row's, which is what both of the
         artifact's two instances do. Light, so it cannot be read as more of
         the name — the name cell is medium by `TableCell`'s own rule. */
      className="font-light text-ink-tertiary"
    >
      {" — "}
      {children}
    </span>
  );
}

/**
 * The run: every capability, always in the same place, read as one shape.
 *
 * `pressable` decides the element and nothing else about the drawing. A
 * pressable run is a group of real checkboxes; a static one is a single
 * labelled image, because 120 marks that do nothing must not be 120 tab
 * stops.
 */
function PermissionRun({
  capabilities,
  isHeld,
  locked,
  lockedLabel,
  cellLabel,
  slotLabel,
  onToggle,
}: {
  capabilities: readonly PermissionCapability[];
  isHeld: (capability: PermissionCapability) => boolean;
  locked: boolean;
  /** The lock's phrase, raised on hover over a locked run. */
  lockedLabel: string;
  cellLabel: string;
  slotLabel: (capability: PermissionCapability, held: boolean) => string;
  /** Absent — the run is a mark, not a control. */
  onToggle?: (capability: PermissionCapability, next: boolean) => void;
}) {
  const pressable = onToggle !== undefined && !locked;

  /* No explicit width: the run is `capabilities.length` × 1.375rem, which for
     the client's four is the 5.5rem the design page states, and which a fifth
     capability widens without a second number to keep in step. */
  if (!pressable) {
    /* The same drawing whether it is locked or merely read-only — D4-B: a
       locked run is a live run. What separates the two is not a fill:
         · LOCKED  takes `cursor-not-allowed`, chapter 10's own disabled
           cursor, so the pointer says no before a click can be spent on it;
           and it raises the lock's phrase on hover, so the reason is on the
           cell and not only on the row.
         · READ-ONLY (state 10, no `onChange`) takes neither. A reference
           table is not a frozen form and must not claim to be one. */
    const run = (
      <span
        className={cn(RUN_SHELL, locked && "cursor-not-allowed")}
        role="img"
        aria-label={cellLabel}
      >
        {capabilities.map((capability) => (
          <span
            key={capability.id}
            aria-hidden="true"
            className={cn(SLOT_SHAPE, slotSkin(isHeld(capability)))}
          >
            {initialOf(capability)}
          </span>
        ))}
      </span>
    );

    if (!locked) return run;

    return (
      <Tooltip>
        {/* `asChild` on a span: Radix attaches the hover and the
            `aria-describedby` and adds NO tab stop, which is the whole
            requirement — the reason reaches the pointer without turning 120
            dead marks into 120 dead stops. The same words are already in
            `cellLabel`, so nothing here is pointer-only. */}
        <TooltipTrigger asChild>{run}</TooltipTrigger>
        <TooltipContent>{lockedLabel}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className={RUN_SHELL} role="group" aria-label={cellLabel}>
      {capabilities.map((capability) => {
        const held = isHeld(capability);

        return (
          <Tooltip key={capability.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="checkbox"
                aria-checked={held}
                aria-label={slotLabel(capability, held)}
                onClick={() => {
                  onToggle(capability, !held);
                }}
                className={cn(SLOT_SHAPE, slotSkin(held), "cursor-pointer")}
              >
                <span aria-hidden="true">{initialOf(capability)}</span>
              </button>
            </TooltipTrigger>
            {/* The letter is a legend a reader learns once; the pill is where
                they learn it. It repeats the capability's word and nothing
                else — the state is already on the control's own name. */}
            <TooltipContent>{capability.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

/**
 * Who can open what.
 *
 * TEN STATES
 *  1. default        — a header of micro uppercase ROLE names on the section
 *                      rule, then one 56 row per collection carrying one
 *                      four-slot run per role, and the legend under it.
 *  2. hover          — the ROW takes `--accent`, the kit's neutral wash,
 *                      which is `TableRow`'s own treatment; a changeable SLOT
 *                      raises its capability's word in a `Tooltip`. Neither
 *                      is an opacity, and the slot's own fill does NOT move
 *                      on hover: `checkbox.tsx` draws no hover on a mark
 *                      (override 42) and a run whose slots lit under the
 *                      pointer would break the silhouette that is the whole
 *                      reading.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The scroll container sets
 *                      `overflow-x: auto` and never `overflow: hidden`, and
 *                      `Table` carries the scroll padding that keeps a ring in
 *                      an off-screen column whole.
 *  4. active/pressed — the capability flips. The change is instant, which is
 *                      what the footnote states.
 *  5. disabled       — per cell (`module.locked`) or whole grid (`disabled`),
 *                      and under the client's D4-B ruling it is NOT a skin.
 *                      The run is drawn exactly as a live one and keeps every
 *                      distance a live one has; the lock is the artifact's
 *                      phrase in BARE WORDS — no chip, D6-B "word only" —
 *                      running on from the collection's name after an em dash
 *                      in `--ink-tertiary`, naming the roles when only some
 *                      are locked. The run takes `cursor-not-allowed` and
 *                      raises the phrase on hover, and is still no tab stop.
 *                      The old swapped disabled pair measured 1.004 on soft
 *                      paper in dark and is gone rather than excused.
 *  6. loading        — `state="loading"`: skeleton rows inside the body, and
 *                      skeleton cards narrow. The HEADER stays, because it is
 *                      the part that names the roles being fetched, and
 *                      replacing the whole table would make the page jump
 *                      when the rows land.
 *  7. empty          — `state="empty"`, or every collection or every role
 *                      hidden: chapter 21's register in one full-width cell.
 *                      `Table`'s own JSDoc puts the empty register here rather
 *                      than in the primitive, "because only the composition
 *                      knows the column count a full-width empty cell would
 *                      need" — and here it is `roles.length + 1`.
 *  8. error          — `state="error"`: the register in its error tone,
 *                      `role="alert"`, in the same full-width cell. Never a
 *                      poppy row: a failed fetch is not a blocked record.
 *  9. selected       — a held capability IS the selection, and it is the
 *                      slot's own checked state. There is no selected ROW
 *                      here: a permission grid has no bulk bar, because 27.12
 *                      gives it one action and that action is the change.
 * 10. read-only      — no `onChange`: every run is a labelled mark and the
 *                      screen reads completely. Deliberately NOT the locked
 *                      skin — a reference table is not a frozen form, and 120
 *                      greyed marks would say the opposite of what is true.
 *
 * THREE BREAKPOINTS
 *  mobile   — BELOW 45rem THE MATRIX TURNS, which is CH27.12's own narrow
 *             instruction: "the matrix becomes one card per collection with
 *             its roles listed inside … It never becomes a horizontal
 *             scroller a thumb has to hunt through." One block per collection,
 *             one line per role, the run at full size — 30 lines for the
 *             kit's six collections and five roles, and the chapter's own
 *             "2 more roles" truncation is DROPPED because all five fit
 *             beside a 5.5rem run.
 *
 *             AT THIS WIDTH THE RUN READS RATHER THAN PRESSES. A 1.375rem
 *             slot is well under the 44 touch row, and the kit's answer to a
 *             mark that small is to widen the LABEL, which a four-slot run
 *             has nowhere to put. So the narrow run is a mark with its subset
 *             in its accessible name and the change is made at a width that
 *             has room for it. Nothing is truncated and nothing scrolls
 *             sideways.
 *  tablet   — the table, at 45rem and up. With five roles the grid's floor is
 *             42.5rem, so it is already inside its container when it appears
 *             and there is nothing to scroll.
 *  desktop  — the same. The row is 56 at every width, by ruling.
 *
 * RTL — safe. `Table` scrolls on a mirroring axis, every cell inset is `px-*`,
 * the run's two rounded ends are `rounded-s` / `rounded-e`, and the collection
 * column is first in DOM order and therefore at the reading start in Arabic,
 * Urdu and Persian. The four slots read in the client's order in both
 * directions, which is correct: they are a fixed sequence of named places,
 * not a quantity.
 */
const PermissionMatrix = React.forwardRef<HTMLDivElement, PermissionMatrixProps>(
  (
    {
      className,
      modules,
      roles,
      capabilities = PERMISSION_CAPABILITIES,
      moduleLabel = "Collection",
      onChange,
      disabled = false,
      state = "ready",
      label = "Permissions",
      minWidth,
      footnote = "A change applies at once and is written to the activity log.",
      legend = true,
      heldLabel = "held",
      notHeldLabel = "not held",
      /* Sentence case since D4-B: it is a chip's label on a row now, not a
         clause in a legend. Inside an accessible name it reads identically. */
      lockedLabel = "Locked by policy",
      formatLockedLabel,
      nothingLabel = "nothing",
      loadingRows = 5,
      loadingLabel = "Loading…",
      emptyTitle,
      emptyDescription,
      errorTitle,
      errorDescription,
      errorAction,
      formatCellLabel,
      formatSlotLabel,
      ...props
    },
    ref,
  ) => {
    const describeCell =
      formatCellLabel ??
      ((collection: string, role: string, held: readonly string[], locked: boolean) =>
        `${role} · ${collection}: ${held.length === 0 ? nothingLabel : held.join(", ")}${
          locked ? `, ${lockedLabel}` : ""
        }`);

    const describeLock =
      formatLockedLabel ??
      ((phrase: string, roleLabels: readonly string[]) =>
        `${phrase}: ${roleLabels.join(", ")}`);

    const describeSlot =
      formatSlotLabel ??
      ((collection: string, role: string, capability: string, held: boolean) =>
        `${role} · ${collection} · ${capability}: ${held ? heldLabel : notHeldLabel}`);

    /* Permissions HIDE. A hidden collection is not a greyed row and a hidden
       role is not a greyed column — both are absent. */
    const shownRoles = roles.filter((role) => role.visible !== false);
    const shownModules = modules.filter((module) => module.visible !== false);

    const resolved =
      state === "ready" && (shownModules.length === 0 || shownRoles.length === 0)
        ? "empty"
        : state;
    const columns = shownRoles.length + 1;

    /* A 7.5rem name column, and one run plus `TableCell`'s own `px-3` inset
       per role. Derived from both counts so nothing has to be re-typed when
       either changes. */
    const floor =
      minWidth ??
      `calc(7.5rem + ${String(shownRoles.length)} * (${String(capabilities.length)} * 1.375rem + 2 * var(--space-3)))`;

    /**
     * THE ROW'S MARK, at the scope of the lock — `null` when the row holds no
     * locked cell. One rule covers all three ways a lock can arrive: a whole
     * grid `disabled`, a whole row `locked`, and a list of role ids. The first
     * two lock every shown role and take the bare phrase; the third names the
     * roles it locked, because a bare mark on a partly-locked row is a lie.
     */
    const lockMarkFor = (module: PermissionModule): React.ReactNode => {
      const locked = shownRoles.filter((role) =>
        isLocked(module, role.id, disabled),
      );
      if (locked.length === 0) return null;
      const words =
        locked.length === shownRoles.length
          ? lockedLabel
          : describeLock(
              lockedLabel,
              locked.map((role) => plain(role.label, role.id)),
            );
      return <LockMark>{words}</LockMark>;
    };

    /** One cell, wide or narrow — the same run either way. */
    const renderRun = (module: PermissionModule, role: PermissionRole, live: boolean) => {
      const name = plain(module.label, module.id);
      const roleName = plain(role.label, role.id);
      const locked = isLocked(module, role.id, disabled);
      const heldWords = capabilities
        .filter((capability) => holds(module, role.id, capability.id))
        .map((capability) => capability.label);

      return (
        <PermissionRun
          capabilities={capabilities}
          isHeld={(capability) => holds(module, role.id, capability.id)}
          locked={locked}
          lockedLabel={lockedLabel}
          cellLabel={describeCell(name, roleName, heldWords, locked)}
          slotLabel={(capability, held) =>
            describeSlot(name, roleName, capability.label, held)
          }
          onToggle={
            live && onChange !== undefined
              ? (capability, next) => {
                  onChange(module.id, role.id, capability.id, next);
                }
              : undefined
          }
        />
      );
    };

    const register =
      resolved === "error" ? (
        <ScreenRegister
          tone="error"
          title={errorTitle}
          description={errorDescription}
          action={errorAction}
        />
      ) : (
        <ScreenRegister tone="empty" title={emptyTitle} description={emptyDescription} />
      );

    return (
      <TooltipProvider>
        <div
          ref={ref}
          data-slot="permission-matrix"
          data-state={resolved}
          className={cn("flex min-w-0 flex-col gap-1", className)}
          {...props}
        >
          {/* ---- 45rem and up: the matrix ------------------------------- */}
          <Table
            aria-label={label}
            minWidth={floor}
            containerClassName="hidden min-[45rem]:block"
          >
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{moduleLabel}</TableHead>
                {shownRoles.map((role) => (
                  <TableHead key={role.id} scope="col">
                    {role.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {resolved === "loading" ? (
                /* The header stays; only the rows wait. Each skeleton row keeps
                   the 56 so the grid does not jump when the rows land. */
                Array.from({ length: loadingRows }, (_, index) => (
                  <TableRow key={`loading-${index}`}>
                    <TableCell colSpan={columns}>
                      <Skeleton
                        announce={index === 0}
                        label={loadingLabel}
                        className="w-full"
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : resolved !== "ready" ? (
                <TableRow>
                  {/* One full-width cell — the composition knows the count. */}
                  <TableCell
                    colSpan={columns}
                    className="first:whitespace-normal first:font-light"
                  >
                    {register}
                  </TableCell>
                </TableRow>
              ) : (
                shownModules.map((module) => (
                  <TableRow key={module.id} data-module={module.id}>
                    <TableCell>
                      <span className="flex flex-col">
                        {/* The name, and running on from it the lock's own
                            words. Plain inline flow, not a flex row with a
                            gap: the em dash IS the separation, which is the
                            artifact's own shape for this, and the phrase must
                            sit on the name's baseline rather than beside it as
                            a box. It stays on the name's LINE, so a locked row
                            is still the 56 ruling 28 gives it. */}
                        <span>
                          {module.label}
                          {lockMarkFor(module)}
                        </span>
                        {module.description !== undefined && module.description !== null ? (
                          /* The quiet line under a collection name — the
                             caption step in tertiary ink, and it MAY wrap even
                             though the name column does not, because a
                             description that never wrapped would widen the
                             grid without limit. */
                          <span className="mt-1 whitespace-normal text-caption font-light text-ink-tertiary">
                            {module.description}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>

                    {shownRoles.map((role) => (
                      <TableCell
                        key={role.id}
                        data-role={role.id}
                        /* `TableCell` squares a cell that holds a checkbox at
                           the row height, which is right for one mark and
                           wrong for a run of four. Same selector, so
                           tailwind-merge replaces it rather than fighting it. */
                        className="[&:has([role=checkbox])]:w-auto"
                      >
                        {renderRun(module, role, true)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* ---- below 45rem: CH27.12's own narrow render ---------------- */}
          <div
            data-slot="permission-matrix-narrow"
            className="flex flex-col gap-3 min-[45rem]:hidden"
          >
            {resolved === "loading"
              ? Array.from({ length: loadingRows }, (_, index) => (
                  <div
                    key={`loading-${index}`}
                    className="rounded-[var(--radius)] bg-surface-panel p-4"
                  >
                    <Skeleton
                      announce={index === 0}
                      label={loadingLabel}
                      className="w-full"
                    />
                  </div>
                ))
              : resolved !== "ready"
                ? register
                : shownModules.map((module) => (
                    <div
                      key={module.id}
                      data-module={module.id}
                      className="rounded-[var(--radius)] bg-surface-panel p-4"
                    >
                      {/* The same mark in the same place and the same shape —
                          running on from the collection's name after an em
                          dash — so the narrow render and the grid say the lock
                          the same way. Inline flow here too, and this one MAY
                          wrap: a card is narrow and the phrase is prose. */}
                      <div className="text-sm font-[var(--font-weight-medium)]">
                        {module.label}
                        {lockMarkFor(module)}
                      </div>
                      {module.description !== undefined && module.description !== null ? (
                        <div className="mt-1 text-caption font-light text-ink-tertiary">
                          {module.description}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-col">
                        {shownRoles.map((role) => (
                          <div
                            key={role.id}
                            data-role={role.id}
                            className="flex h-[var(--control-height-input)] items-center justify-between gap-3 text-caption"
                          >
                            {/* Wraps rather than truncating: the narrow
                                render's promise is that nothing is dropped. */}
                            <span className="min-w-0">{role.label}</span>
                            {/* Reads, does not press — see THREE BREAKPOINTS. */}
                            {renderRun(module, role, false)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
          </div>

          {legend && resolved === "ready" ? (
            /* The kit's own legend row: the footnote, then the registers the
               grid actually uses, pushed to the inline end. It is DERIVED
               from `capabilities` — a fifth appears here without this file
               being touched — and it WRAPS at 380 rather than joining the
               grid's scroll, because it is prose.

               `padding: 14px 12px 2px` — the block-start is 14, not 12. */
            <div
              data-slot="permission-matrix-legend"
              className={cn(
                "flex flex-wrap items-center gap-y-2 px-3 pt-[var(--space-3h)]",
                "gap-x-[var(--space-3h)] text-caption text-ink-tertiary",
              )}
            >
              {footnote === undefined || footnote === null ? null : <span>{footnote}</span>}

              {/* THE ORDER, named once — and drawn as BARE LETTERS on the
                  slot's own 1.375rem pitch, never as a run. A run here would
                  be pixel-identical to the "not held" register two items
                  along and the legend would be saying one thing twice. The
                  words are the capabilities' own, so this line cannot
                  disagree with the slots above it. */}
              <span className="inline-flex items-center gap-[var(--space-2h)] sm:ms-auto">
                <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                  {capabilities.map((capability) => (
                    <span
                      key={capability.id}
                      className="inline-grid size-[1.375rem] shrink-0 place-content-center text-micro font-[var(--font-weight-medium)] tracking-normal text-ink-tertiary"
                    >
                      {initialOf(capability)}
                    </span>
                  ))}
                </span>
                <span className="text-badge">
                  {capabilities.map((capability) => capability.label).join(" · ")}
                </span>
              </span>

              <span className="inline-flex items-center gap-[var(--space-2h)]">
                <LegendRun capabilities={capabilities} held={() => true} />
                <span className="text-badge">{heldLabel}</span>
              </span>

              <span className="inline-flex items-center gap-[var(--space-2h)]">
                <LegendRun capabilities={capabilities} held={() => false} />
                <span className="text-badge">{notHeldLabel}</span>
              </span>

              {/* THERE IS NO THIRD REGISTER. The locked one left with the
                  locked skin (D4-B): a legend turns a mark that is not words
                  into words, and the lock's mark is already the words, on the
                  row it applies to. Drawing a locked run here would repeat one
                  of the two registers beside it exactly. */}
            </div>
          ) : null}
        </div>
      </TooltipProvider>
    );
  },
);

PermissionMatrix.displayName = "PermissionMatrix";

export {
  PermissionMatrix,
  PERMISSION_CAPABILITIES,
  PERMISSION_LEVELS,
  RIGHTS,
  WRITE_RIGHTS,
};
