/* ============================================================================
   Pagination — page N of M (0 direct call sites; `data-table` lists it as one
   of its own parts, so it is built to be assembled, not to guess).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-seg` / `.kw-seg__btn`:
   a run of dense-height (32) pills, `--space-1` apart, secondary ink, hover an
   INK move only, and the chosen one drawn `--surface-inverse` with
   `--ink-on-inverse` at 500. A page strip is a segmented run — that is what it
   is — so it is drawn as one rather than as a second thing.
   design-mothership/specimens/kwapso-ui.css → `.kw-btn` for the geometry of a
   control, and `.kw-btn--text`/`--ghost` for what a control with no fill does.
   Numbers are `.kw-tabular` throughout, as every number in the kit is.

   THE LAW THIS FILE OBEYS
   · A control carries NO border in any state. The current page is a FILLED
     pill in the inverse tone, never an outlined one.
   · Only four radii exist. Every part here is `--radius-pill`.
   · Hover is a named token, never an opacity: `--accent` on an idle page (the
     kit's neutral item wash) and `--btn-inverse-hover` on the current one.
     NEVER `--primary` — mango is a brand fill, and a page strip that went
     mango on hover would out-shout the page you are actually on.
   · Disabled is a fill and an ink, never an opacity. On a bare control that is
     an ink alone, exactly as `button.tsx` treats `ghost` and `link`: there is
     no box to fill, and filling one would invent a shape.
   · Focus is ONE global rule (tokens.css §8). Nothing here defines a ring, and
     a disabled arrow is taken out of the tab order rather than being ringed
     for a press that will not happen.
   · Every user-facing string is a prop with a default — "Previous", "Next",
     "More pages" and the landmark's own name. The apps run in Arabic, Urdu and
     Persian.
   · Logical properties only, and the arrows MIRROR. See the note below.

   WHY THIS FILE DOES NOT IMPORT `buttonVariants`
   It would be the obvious reuse, and it is wrong here. `button.tsx` guards
   every interactive rule with `enabled:` so a disabled control cannot match a
   hover rule. `:enabled` matches form elements only, so on the `<a>` these
   parts render as, `enabled:hover:*` never matches AT ALL and the hover
   silently disappears. The geometry below is therefore copied from
   `button.tsx` deliberately, with the guard re-expressed as a JS branch, and
   the two files read the same tokens so they cannot drift in colour.

   PREVIOUS AND NEXT ARE WORDS, NOT ARROWS (NAV-B3, client re-audit
   2026-08-26). CH15 draws both ends of the strip as bare text pills and no
   chevron appears anywhere in its declarations. The glyphs survive only for
   the icon-only form (`label={null}`), where they mirror the usual way: the
   glyph is never swapped for the other component in RTL — `rtl:-scale-x-100`
   turns the mark itself.

   RENDERING CONTEXT
   No `"use client"`. Every part forwards props and refs and resolves its state
   with a plain expression. A call site that passes `onClick` is the client
   boundary, exactly as it already was.
   ========================================================================= */

import * as React from "react";

import { ChevronLeft, ChevronRight } from "../../foundations/icons";
import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   The three exclusive skins of a page control, resolved in JS.

   `aria-disabled:bg-x`, `aria-current:bg-y` and `hover:bg-z` carry identical
   specificity; which one paints would otherwise be decided by the order
   Tailwind emits them in, which a component may not depend on (PATTERN §4).

       disabled  >  current  >  idle
   ------------------------------------------------------------------------- */
const LINK_BASE = [
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 border-0",
  "rounded-pill whitespace-nowrap select-none no-underline",
  /* NAV-B2 — 13, not 14. CH15 draws every part of the strip at
     `font-size: 13px`: the Previous / Next pills, the page numbers and the
     ellipsis. `text-caption` is the 13 step. */
  "text-caption leading-none font-[var(--font-weight-medium)]",
  // Every number in a badge, a column, a KPI or a page strip is tabular.
  "tabular-nums",
  "transition-[background-color,color] duration-[var(--duration-colour)] ease-kwapso",
  "[&_svg]:pointer-events-none [&_svg]:size-[var(--icon-button)] [&_svg]:shrink-0",
  // The kit drops a pressed control by one hairline. 1px is an optical nudge,
  // one of the two values tokens.css allows off the scale; written in rem.
  "active:translate-y-[0.0625rem]",
];

/* NAV-B2 — A RESTING PAGE CONTROL HAS A FILL. CH15 draws Previous and Next on
   `background: var(--card)` and moves an inactive control to
   `background: var(--hair3)` on hover; the build gave them nothing until
   hover, so the two ends of the strip were invisible until the pointer found
   them. `--hair-faint` is the build's standing reading of the artifact's
   `--hair3` (it is already the ⌘K chip's fill in `search-input`). */
const LINK_IDLE = "bg-card text-ink-secondary hover:bg-hair-faint hover:text-foreground";

/** `.kw-seg__btn--active`: the inverse pill. Charcoal fill, off-beige label. */
const LINK_CURRENT =
  "bg-[var(--btn-inverse-fill)] text-[var(--btn-inverse-label)] hover:bg-[var(--btn-inverse-hover)]";

/** An ink and a cursor, and no nudge — nothing happens, so nothing moves. */
const LINK_DISABLED =
  "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)] active:translate-y-0";

/* NAV-B2 — THE STRIP IS 32 TALL, NOT 40. `GAPS.md` PAG-1 recorded that "the
   kit draws no pagination" and the sizes were copied from `button.tsx` to fill
   the hole. That is stale: CH15 draws a full page strip, and it draws
   `height: 32px; padding: 0 14px` on Previous and Next and `width: 32px;
   height: 32px` on a page number. The union and the prop are untouched — only
   what each member resolves to moves — so no call site changes; `sm` and
   `default` now differ only in their inline inset, which is what the artifact
   draws. */
const LINK_SIZE = {
  /** 32 — CH15's page control: `height: 32px; padding: 0 14px`. */
  default: "h-[var(--control-height-dense)] px-[var(--space-3h)]",
  /** 32 at the tighter inset, for a strip in a dense toolbar. */
  sm: "h-[var(--control-height-dense)] px-4",
  /** Square at 32 — CH15's bare page number, `width: 32px; height: 32px`. */
  icon: "size-[var(--control-height-dense)] p-0",
} as const;

export type PaginationSize = keyof typeof LINK_SIZE;

/* ============================================================================
   Pagination
   ========================================================================= */

export interface PaginationProps extends React.ComponentPropsWithoutRef<"nav"> {
  /**
   * The landmark's accessible name, announced when a reader jumps to it. A
   * prop with a default because it is announced, and anything announced must
   * be translatable — the apps run in Arabic, Urdu and Persian.
   */
  label?: string;
}

/**
 * The navigation landmark the page strip lives in.
 *
 * TEN STATES
 *  1. default        — a centred row.
 *  2-6, 8-10         — do not apply to the landmark; every one belongs to the
 *                      links inside it. A `<nav>` has no pointer response, is
 *                      not focusable, cannot be pressed, disabled, busy,
 *                      wrong, selected or edited.
 *  7. empty          — a strip with no items renders an empty landmark. A
 *                      single-page result should not render pagination at all,
 *                      and that is the caller's decision: a primitive cannot
 *                      see the page count. `data-table` makes it.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED here, and see `PaginationContent` for
 *  the one thing that does change.
 *
 * RTL — safe. `mx-auto` is margin-inline and `justify-center` has no side.
 */
const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  ({ className, label = "Pagination", ...props }, ref) => (
    <nav
      ref={ref}
      role="navigation"
      aria-label={label}
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  ),
);

Pagination.displayName = "Pagination";

/* ============================================================================
   PaginationContent
   ========================================================================= */

export interface PaginationContentProps extends React.ComponentPropsWithoutRef<"ul"> {}

/**
 * The list of controls.
 *
 * TEN STATES — the landmark's block covers all ten; the list adds none.
 *
 * THREE BREAKPOINTS
 *  mobile — the list WRAPS. This is the one place in this batch where wrapping
 *  is right rather than scrolling: page controls are independent targets, not
 *  a single row to be read across, so a second line loses nothing. It is also
 *  why `data-table` at mobile should render fewer numbers rather than smaller
 *  ones — `--control-height-button` is 40 at every width and a page control is
 *  a touch target.
 *  tablet / desktop — the same row, unwrapped.
 *
 * RTL — safe. A flex row mirrors; `gap` has no side.
 */
const PaginationContent = React.forwardRef<HTMLUListElement, PaginationContentProps>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-slot="pagination-content"
      /* NAV-B2 — CH15 draws the strip `gap: 6px`. */
      className={cn(
        "flex flex-row flex-wrap items-center gap-[var(--space-1h)]",
        className,
      )}
      {...props}
    />
  ),
);

PaginationContent.displayName = "PaginationContent";

/* ============================================================================
   PaginationItem
   ========================================================================= */

export interface PaginationItemProps extends React.ComponentPropsWithoutRef<"li"> {}

/**
 * One slot in the list. Structural: it paints nothing, so it works in both
 * themes and at every width by having no appearance to get wrong.
 *
 * TEN STATES — none apply; the control inside owns every one.
 * THREE BREAKPOINTS — UNCHANGED.
 * RTL — safe.
 */
const PaginationItem = React.forwardRef<HTMLLIElement, PaginationItemProps>(
  ({ className, ...props }, ref) => (
    <li ref={ref} data-slot="pagination-item" className={cn(className)} {...props} />
  ),
);

PaginationItem.displayName = "PaginationItem";

/* ============================================================================
   PaginationLink
   ========================================================================= */

export interface PaginationLinkProps extends React.ComponentPropsWithoutRef<"a"> {
  /** This is the page being shown: the inverse pill, plus `aria-current="page"`. */
  isActive?: boolean;
  /**
   * Not available — the Previous control on page one, the Next control on the
   * last page. An `<a>` has no `disabled` attribute, so this sets
   * `aria-disabled`, removes the element from the tab order and swallows the
   * activation, rather than leaving a link that looks dead and still works.
   */
  disabled?: boolean;
  /** `icon` (a bare number), `default` (40 tall) or `sm` (the dense 32). */
  size?: PaginationSize;
}

/**
 * One page control.
 *
 * TEN STATES
 *  1. default        — no fill, secondary ink, pill.
 *  2. hover          — `bg-accent` and ink to primary on an idle control;
 *                      `--btn-inverse-hover` on the current one. Named tokens,
 *                      never an opacity, and never mango.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once, at
 *                      the control's own radius, which for a pill is a pill.
 *  4. active/pressed — the kit's 1px nudge, suppressed when disabled.
 *  5. disabled       — `--btn-disabled-label` ink, `cursor-not-allowed`,
 *                      `aria-disabled`, `tabIndex={-1}`, click swallowed. An
 *                      ink only: a bare control has no box to fill.
 *  6. loading        — does not apply. A page control is instantaneous from
 *                      the strip's point of view; the TABLE is what goes busy,
 *                      and it says so with its own skeleton rows.
 *  7. empty          — a control with no children renders an empty pill.
 *                      Nothing is invented — an unlabelled page number is a
 *                      call-site bug and papering over it would hide it.
 *  8. error          — does not apply. Navigation reports nothing.
 *  9. selected       — `isActive`: the inverse pill and `aria-current="page"`.
 *                      Both, always: colour alone must never carry a meaning.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. 40 tall at every width, because it
 *  is a touch target on a phone and there is no second control height to move
 *  to. How MANY numbers to show is the caller's decision, not a size change.
 *
 * RTL — safe. `px-*` is padding-inline; there is no side anywhere.
 */
const PaginationLink = React.forwardRef<HTMLAnchorElement, PaginationLinkProps>(
  (
    { className, isActive = false, disabled = false, size = "icon", onClick, ...props },
    ref,
  ) => {
    const state = disabled ? "disabled" : isActive ? "current" : "idle";

    return (
      <a
        ref={ref}
        {...props}
        data-slot="pagination-link"
        data-active={isActive ? "" : undefined}
        aria-current={isActive ? "page" : undefined}
        aria-disabled={disabled || undefined}
        /* Written after the spread on purpose: a disabled control must leave
           the tab order even if the call site set a tabIndex. */
        tabIndex={disabled ? -1 : props.tabIndex}
        onClick={
          disabled
            ? (event) => {
                event.preventDefault();
              }
            : onClick
        }
        className={cn(
          LINK_BASE,
          LINK_SIZE[size],
          state === "idle" && LINK_IDLE,
          state === "current" && LINK_CURRENT,
          state === "disabled" && LINK_DISABLED,
          className,
        )}
      />
    );
  },
);

PaginationLink.displayName = "PaginationLink";

/* ============================================================================
   PaginationPrevious / PaginationNext
   ========================================================================= */

export interface PaginationArrowProps extends Omit<PaginationLinkProps, "isActive"> {
  /**
   * The visible label. A prop with a default; the kit's English is
   * "Previous" / "Next". Pass `null` for the icon-only strip a narrow toolbar
   * wants — `srLabel` still announces it, so it never becomes an unnamed
   * control.
   */
  label?: React.ReactNode;
  /**
   * The announced name, when it should differ from the visible label — or when
   * `label` is `null` and there is no visible one. Defaults to the label's own
   * English so an icon-only arrow is still named.
   */
  srLabel?: string;
}

/**
 * Back one page.
 *
 * TEN STATES — as `PaginationLink`, minus `selected`: an arrow is never the
 * current page, which is why `isActive` is omitted from its props rather than
 * merely ignored.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in size. A call site that wants the
 *  icon-only arrow at mobile passes `label={null}` from its own media query;
 *  this file does not hide a label at a width, because a component that
 *  silently drops its own text is a component whose translation nobody checks.
 *
 * RTL — mirrors. The chevron sits at the inline START of the row, so flexbox
 * moves it to the other side; `rtl:-scale-x-100` turns the mark itself. The
 * glyph is never swapped for `ChevronRight`.
 */
const PaginationPrevious = React.forwardRef<HTMLAnchorElement, PaginationArrowProps>(
  ({ className, label = "Previous", srLabel = "Previous", size = "default", ...props }, ref) => (
    <PaginationLink
      ref={ref}
      aria-label={srLabel}
      size={size}
      className={cn("gap-1", className)}
      {...props}
    >
      {/* NAV-B3 (client re-audit 2026-08-26) — THE WORD ALONE. CH15 draws
          Previous and Next as bare text pills: no chevron exists anywhere in
          the strip's declarations, and p06 renders none. The glyph only
          survives for the icon-only form (`label={null}`), where a pill with
          nothing in it would otherwise render. */}
      {label === null ? (
        <ChevronLeft aria-hidden="true" className="rtl:-scale-x-100" />
      ) : (
        label
      )}
    </PaginationLink>
  ),
);

PaginationPrevious.displayName = "PaginationPrevious";

/**
 * Forward one page.
 *
 * TEN STATES / THREE BREAKPOINTS / RTL — as `PaginationPrevious`, with the
 * chevron at the inline END.
 */
const PaginationNext = React.forwardRef<HTMLAnchorElement, PaginationArrowProps>(
  ({ className, label = "Next", srLabel = "Next", size = "default", ...props }, ref) => (
    <PaginationLink
      ref={ref}
      aria-label={srLabel}
      size={size}
      className={cn("gap-1", className)}
      {...props}
    >
      {/* NAV-B3 — the word alone; the glyph only in the icon-only form. */}
      {label === null ? (
        <ChevronRight aria-hidden="true" className="rtl:-scale-x-100" />
      ) : (
        label
      )}
    </PaginationLink>
  ),
);

PaginationNext.displayName = "PaginationNext";

/* ============================================================================
   PaginationEllipsis
   ========================================================================= */

export interface PaginationEllipsisProps extends React.ComponentPropsWithoutRef<"span"> {
  /**
   * What a screen reader hears where the numbers are elided. A prop with a
   * default — the kit's English is "More pages" — because a string nobody sees
   * is still a string somebody hears, and it has to reach Arabic, Urdu and
   * Persian like every other one.
   */
  label?: string;
  /** Replace the mark. Undefined draws CH15's own "…" character; a glyph
   *  passed here is sized at `--icon-button` by the class list below. */
  icon?: React.ReactNode;
}

/**
 * The gap in a long strip.
 *
 * Not interactive, so it is a `<span>` and not a link: an ellipsis that could
 * be focused would put a stop in the tab order that leads nowhere.
 *
 * TEN STATES
 *  1. default        — the ellipsis character in tertiary ink at the strip's
 *                      own 13, inset 4 each side. Not a box (NAV-B2).
 *  2-6, 8-10         — do not apply. It is a mark, not a control: nothing to
 *                      hover, focus, press, disable, load, get wrong, select
 *                      or edit.
 *  7. empty          — does not apply either. The ellipsis IS the empty state
 *                      of a run of page numbers, which is why it exists.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and it matters at mobile: a strip
 *  that shows 1 … 7 … 20 stays one line where 1-20 would wrap to three.
 *
 * RTL — safe. The ellipsis character is symmetrical and needs no mirroring.
 */
const PaginationEllipsis = React.forwardRef<HTMLSpanElement, PaginationEllipsisProps>(
  ({ className, label = "More pages", icon, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="pagination-ellipsis"
      /* NAV-B2 — NOT A BOX. CH15 draws the elision as plain text at 13 in the
         quiet ink with `padding: 0 4px`, not as a square the size of a page
         number. The 40 box it used to occupy also made the gap in a strip
         wider than any number in it. `icon` still replaces the mark, and a
         call site that passes a glyph gets the icon sizing rule below. */
      className={cn(
        "inline-flex shrink-0 items-center justify-center px-1",
        "text-caption text-ink-tertiary",
        "[&_svg]:size-[var(--icon-button)] [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {/* The glyph is decoration; the label beside it is what is announced, and
          it sits OUTSIDE the aria-hidden wrapper so it is not hidden with it. */}
      <span aria-hidden="true" className="inline-flex">
        {/* CH15's own mark is the character, not the glyph: the strip reads
            `1 2 3 4 5 6 … 24`. `MoreHorizontal` drew three dots inside a
            40 square, which is the same idea at four times the size. */}
        {icon === undefined ? "…" : icon}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  ),
);

PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
