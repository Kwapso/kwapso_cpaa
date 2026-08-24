/* ============================================================================
   Breadcrumb — where you are, and the way back up (0 direct call sites; the
   composable form. `breadcrumbs/` is the one-prop wrapper over it).

   IT IS NOT A DUPLICATE OF `breadcrumbs/`, AND THE DEMO NOW SAYS SO
   Review round 1 reported "components 9 and 10 are both a breadcrumb
   collapse". The components were never the same; the DEMO was showing the
   same specimen twice, because both sections led with a "Home … Leaf"
   elision, and an elision is the one thing that looks identical whichever
   form produced it. The two are different in kind:
     · THIS file is seven PARTS. A call site assembles them, which is the only
       way a crumb can be a Next `<Link>` (`asChild`), carry a mark, or be a
       step with no route. It elides nothing — it renders exactly the crumbs
       it was written with.
     · `Breadcrumbs` is one PROP. An array in, the finished trail out, and it
       owns the rule about when a deep trail collapses (`maxItems`).
   Both are required by commission §6 and both keep every export. Neither
   wraps the other's job; `Breadcrumbs` renders THESE parts, so the drawing
   can never drift between them.

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `.kw-list__meta`, the kit's
   metadata line: `--text-caption` (13) in `--ink-tertiary`. A trail is
   metadata about the page, not content of it, so it is drawn as the kit draws
   metadata rather than as a second thing.
   design-mothership/specimens/kwapso-ui.css → `.kw-link`: inherits its ink and
   underlines on hover, occupying no box. That is the trail's link.
   design-mothership/specimens/_fragments/t9.css → `.kw-selectwrap__chevron`,
   the kit's use of a chevron as a small tertiary-ink direction mark.

   THE LAW THIS FILE OBEYS
   · A trail draws no box, no fill and no border. Nothing here has a radius,
     because nothing here is a shape.
   · Hover is a named ink move (tertiary -> `--foreground`) plus the kit's link
     underline. Never an opacity, and never `--primary`: mango is a brand fill,
     not a link colour.
   · The current page is NOT a link. It is `aria-current="page"` and primary
     ink at the kit's one "bold" — a state a reader can hear as well as see,
     because colour alone must never carry a meaning.
   · Focus is ONE global rule (tokens.css §8). No ring here, no `outline: none`.
   · Every user-facing string is a prop with a default — the landmark's name
     and the ellipsis's announced label especially. Arabic, Urdu, Persian.
   · Logical properties only, and the separator NEEDS NO MIRROR. CH15 draws a
     middle dot between the crumbs (NAV-B1), and a dot points nowhere; its
     place in the trail is decided by DOM order, which flexbox already
     mirrors. The `rtl:-scale-x-100` the old chevron needed is gone with it.

   RENDERING CONTEXT
   No `"use client"`. Every part forwards props and refs. `Slot` (the `asChild`
   escape hatch that lets a Next `<Link>` be the anchor) holds no state and no
   hook, so it renders in a Server Component unchanged.
   ========================================================================= */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { MoreHorizontal } from "../../icons";
import { cn } from "../../lib/utils";

/* ============================================================================
   Breadcrumb
   ========================================================================= */

export interface BreadcrumbProps extends React.ComponentPropsWithoutRef<"nav"> {
  /**
   * The landmark's accessible name. A prop with a default because it is
   * announced, and anything announced must be translatable.
   */
  label?: string;
}

/**
 * The navigation landmark the trail lives in.
 *
 * TEN STATES
 *  1. default        — a named `<nav>` and nothing drawn.
 *  2-6, 8-10         — do not apply to the landmark; the links own every one.
 *  7. empty          — a trail with no items renders an empty landmark. The
 *                      wrapper that DOES know its items — `breadcrumbs/` —
 *                      returns `null` instead. A primitive that cannot see its
 *                      own contents must not guess at them.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED; see `BreadcrumbList` for the one
 *  thing that responds to width.
 *
 * RTL — safe.
 */
const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  ({ className, label = "Breadcrumb", ...props }, ref) => (
    <nav
      ref={ref}
      aria-label={label}
      data-slot="breadcrumb"
      className={cn(className)}
      {...props}
    />
  ),
);

Breadcrumb.displayName = "Breadcrumb";

/* ============================================================================
   BreadcrumbList
   ========================================================================= */

export interface BreadcrumbListProps extends React.ComponentPropsWithoutRef<"ol"> {}

/**
 * The ordered trail.
 *
 * `.kw-list__meta`: 13 in tertiary ink. `text-caption` is a real utility
 * (tokens.css §10 bridges it) and sets size, leading and tracking together, so
 * no arbitrary value is written.
 *
 * TEN STATES — the landmark's block covers all ten; the list adds none.
 *
 * THREE BREAKPOINTS
 *  mobile — the trail WRAPS (`flex-wrap`) rather than scrolling or truncating.
 *  Deliberate, and the opposite of the tab strip's answer in `tabs/`, for a
 *  reason: a tab strip is one row of peers that must be readable across, while
 *  a trail is a chain of independent targets whose LAST link is the one that
 *  matters and is the one that must never be pushed off-screen. Wrapping keeps
 *  every crumb reachable; scrolling would hide the ancestors, which is the
 *  half of the trail a reader is looking for. Where a deep trail wraps to
 *  three lines the answer is `BreadcrumbEllipsis`, which `breadcrumbs/`
 *  applies from a `maxItems` count — a content decision, not a width one.
 *  tablet / desktop — the same, unwrapped.
 *
 * RTL — safe. A flex row mirrors; `gap` has no side.
 */
const BreadcrumbList = React.forwardRef<HTMLOListElement, BreadcrumbListProps>(
  ({ className, ...props }, ref) => (
    <ol
      ref={ref}
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        "text-caption text-ink-tertiary",
        className,
      )}
      {...props}
    />
  ),
);

BreadcrumbList.displayName = "BreadcrumbList";

/* ============================================================================
   BreadcrumbItem
   ========================================================================= */

export interface BreadcrumbItemProps extends React.ComponentPropsWithoutRef<"li"> {}

/**
 * One crumb's slot. Structural; it paints nothing.
 *
 * TEN STATES — none apply; the link or page inside owns every one.
 * THREE BREAKPOINTS — UNCHANGED.
 * RTL — safe.
 */
const BreadcrumbItem = React.forwardRef<HTMLLIElement, BreadcrumbItemProps>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  ),
);

BreadcrumbItem.displayName = "BreadcrumbItem";

/* ============================================================================
   BreadcrumbLink
   ========================================================================= */

export interface BreadcrumbLinkProps extends React.ComponentPropsWithoutRef<"a"> {
  /**
   * Render the caller's own element instead of an `<a>` — a Next `<Link>`,
   * almost always. Without this, every call site in a Next app would have to
   * nest a `<Link>` inside an `<a>`, which is invalid markup and breaks
   * client-side routing.
   */
  asChild?: boolean;
}

/**
 * An ancestor, which is a link.
 *
 * TEN STATES
 *  1. default        — tertiary ink, no underline, no box.
 *  2. hover          — ink to `--foreground` and the kit's link underline at
 *                      the 3px offset `.kw-link` uses. A named ink and a
 *                      decoration; never an opacity, never mango.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — does not apply. `.kw-link` "occupies no box", so there
 *                      is nothing to nudge; `button.tsx` suppresses the nudge
 *                      on `variant="link"` for the same reason.
 *  5. disabled       — does not apply. An ancestor you may not visit is not a
 *                      link at all; render `BreadcrumbPage` for it, which is
 *                      already the non-link form and already says so to a
 *                      screen reader.
 *  6. loading        — does not apply. A trail is known before the page it
 *                      describes is; that is what it is for.
 *  7. empty          — an unlabelled crumb renders an empty link. Nothing is
 *                      invented — a nameless step in a trail is a call-site
 *                      bug and hiding it would hide the bug.
 *  8. error          — does not apply.
 *  9. selected       — the current page is `BreadcrumbPage`, not a selected
 *                      link. Two elements, because the difference is semantic
 *                      and not only visual.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. A crumb never truncates: a trail you
 *  cannot read is a trail you cannot use, and the shortening mechanism is the
 *  ellipsis, which removes whole steps rather than halves of words.
 *
 * RTL — safe. Nothing is positioned by side.
 */
const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "a";
    return (
      <Comp
        ref={ref}
        data-slot="breadcrumb-link"
        className={cn(
          "cursor-pointer no-underline underline-offset-[0.1875rem]",
          "transition-colors duration-[var(--duration-colour)] ease-kwapso",
          "hover:text-foreground hover:underline",
          className,
        )}
        {...props}
      />
    );
  },
);

BreadcrumbLink.displayName = "BreadcrumbLink";

/* ============================================================================
   BreadcrumbPage
   ========================================================================= */

export interface BreadcrumbPageProps extends React.ComponentPropsWithoutRef<"span"> {}

/**
 * The page you are on: the last crumb, and not a link.
 *
 * `aria-current="page"` and `aria-disabled` alongside `role="link"`, so a
 * screen reader announces it as the trail's endpoint rather than reading it as
 * plain text that happens to be next to some links.
 *
 * TEN STATES
 *  1. default        — primary ink at the kit's one "bold" (500). The only
 *                      crumb that is not tertiary, which is the whole signal.
 *  2. hover          — does not apply, deliberately. It is not a target; a
 *                      hover response would invite a click that does nothing.
 *  3. focus-visible  — does not apply; it is not focusable. Were a call site
 *                      to make it so, tokens.css §8 rings it.
 *  4. active/pressed — does not apply.
 *  5. disabled       — this element IS the disabled form of a crumb, which is
 *                      why `BreadcrumbLink` has no disabled state of its own.
 *  6. loading        — does not apply.
 *  7. empty          — renders an empty element; nothing is invented.
 *  8. error          — does not apply.
 *  9. selected       — always. It is the selected crumb by definition, marked
 *                      in ink AND in `aria-current` so the meaning survives
 *                      without colour.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. It wraps with the list rather than
 *  truncating: this is the one crumb that must always be readable.
 *
 * RTL — safe.
 */
const BreadcrumbPage = React.forwardRef<HTMLSpanElement, BreadcrumbPageProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      role="link"
      aria-disabled="true"
      aria-current="page"
      data-slot="breadcrumb-page"
      className={cn("font-[var(--font-weight-medium)] text-foreground", className)}
      {...props}
    />
  ),
);

BreadcrumbPage.displayName = "BreadcrumbPage";

/* ============================================================================
   BreadcrumbSeparator
   ========================================================================= */

export interface BreadcrumbSeparatorProps extends React.ComponentPropsWithoutRef<"li"> {}

/**
 * The mark between two crumbs.
 *
 * NAV-B1 — THE MARK IS A MIDDLE DOT, NOT A CHEVRON. CH15 draws the trail as
 * `Apps · Padelbase · Sprint W34`, with `<span style="color: var(--fg4);">·
 * </span>` between the crumbs: a text mark at the crumb's own size, in the
 * quiet ink. The chevron came from shadcn and the file's own header offered a
 * third answer (kwapso-ui.css's slash); the artifact draws neither.
 *
 * `aria-hidden` and `role="presentation"`: the trail's structure is already in
 * the `<ol>`, and a screen reader reading the mark between every step is
 * noise. `children` still replaces it, so a call site that wants the slash or
 * the chevron back passes one.
 *
 * TEN STATES — none apply. It is a mark, not a control, and it is hidden from
 * assistive technology entirely.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. It wraps with the list.
 *
 * RTL — SAFE, and simpler than it was. The old chevron had to be mirrored
 * (`rtl:-scale-x-100`), because a right-pointing arrow is wrong in a
 * right-to-left trail; a middle dot points nowhere and needs no mirror at all.
 * The mark's POSITION between two crumbs is DOM order, which the flex row
 * already mirrors. The `[&_svg]` sizing rule stays for a call site that passes
 * a glyph of its own through `children`.
 */
const BreadcrumbSeparator = React.forwardRef<HTMLLIElement, BreadcrumbSeparatorProps>(
  ({ className, children, ...props }, ref) => (
    <li
      ref={ref}
      role="presentation"
      aria-hidden="true"
      data-slot="breadcrumb-separator"
      className={cn(
        "inline-flex items-center [&_svg]:size-[var(--icon-16)] [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children ?? "·"}
    </li>
  ),
);

BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

/* ============================================================================
   BreadcrumbEllipsis
   ========================================================================= */

export interface BreadcrumbEllipsisProps extends React.ComponentPropsWithoutRef<"span"> {
  /**
   * What a screen reader hears where the middle of the trail is elided. A prop
   * with a default — the kit's English is "More" — because a string nobody
   * sees is still a string somebody hears.
   */
  label?: string;
  /** Replace the glyph. Undefined draws `MoreHorizontal`. */
  icon?: React.ReactNode;
}

/**
 * The elided middle of a deep trail.
 *
 * The glyph is `aria-hidden` and the label sits OUTSIDE that wrapper, not
 * inside it: an `sr-only` span nested in an `aria-hidden` element is hidden
 * too, which is the standard way this component is got wrong.
 *
 * TEN STATES
 *  1. default        — the glyph at 16, in the list's tertiary ink.
 *  2-6, 8-10         — do not apply; it is a mark, not a control. Where a call
 *                      site makes the elision expandable it wraps this in a
 *                      `DropdownMenuTrigger`, and that control owns every
 *                      state including its ring.
 *  7. empty          — does not apply. This element IS the empty state of the
 *                      crumbs it replaces.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and it matters most at mobile: a
 *  four-level trail on a phone becomes one line instead of three.
 *
 * RTL — safe. `MoreHorizontal` is symmetrical.
 */
const BreadcrumbEllipsis = React.forwardRef<HTMLSpanElement, BreadcrumbEllipsisProps>(
  ({ className, label = "More", icon, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="breadcrumb-ellipsis"
      className={cn(
        "inline-flex items-center [&_svg]:size-[var(--icon-16)] [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon === undefined ? <MoreHorizontal /> : icon}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  ),
);

BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis";

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
