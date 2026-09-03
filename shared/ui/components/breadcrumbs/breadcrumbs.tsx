/* ============================================================================
   Breadcrumbs — the whole trail from one array (1 direct call site).

   WHY THIS EXISTS ALONGSIDE `breadcrumb/`
   Commission §6 lists both, as two separate folders with two separate exports,
   so both are built. They are not duplicates and neither wraps the other's
   job:
     · `breadcrumb/` is the COMPOSABLE form — seven parts a call site
       assembles, which is what a route that needs a dropdown inside one crumb
       or a Next `<Link>` on another has to have.
     · `Breadcrumbs` (this file) is the ONE-PROP form: an array in, the finished
       trail out, including the separators, the current-page crumb and the
       elision of a deep trail. It is what the single existing call site wants
       and what a screen recipe can be handed by `ScreenRenderer`.
   Everything visual is `breadcrumb/`'s. This file decides no colour, no size
   and no spacing — it only decides STRUCTURE, so the two can never drift.

   DESIGN SOURCE
   Structure only, and it is a derivation rather than a drawing: the kit draws
   no trail. Logged as GAPS-D BCR-1. The appearance is entirely
   `breadcrumb/breadcrumb.tsx`, which names its own kit sources.

   THE LAW THIS FILE OBEYS
   · Every user-facing string is a prop with a default — the landmark's name
     and the ellipsis's announced label. Arabic, Urdu, Persian.
   · The last item is never a link. It is the page.
   · Empty renders nothing. A trail of zero steps is not a trail, and the kit's
     rule throughout is to render nothing rather than fill a hole.
   · No colour, size, radius or spacing is decided here; see above.

   RENDERING CONTEXT
   No `"use client"`. A pure mapping over props, rendering parts that are
   themselves server-safe.
   ========================================================================= */

import * as React from "react";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../breadcrumb/breadcrumb";
import { cn } from "../../lib/utils";

export interface BreadcrumbsItem {
  /** What the crumb says. A node, so an icon may ride along with the text. */
  label: React.ReactNode;
  /**
   * Where it goes. Omitted renders the crumb as plain text rather than a dead
   * link — an ancestor with no route is a step you can see and not visit, and
   * that is `BreadcrumbPage`'s drawing, which already says so to a reader.
   */
  href?: string;
  /** A stable key, when two crumbs share a label. Falls back to the index. */
  key?: string;
}

export interface BreadcrumbsProps
  extends Omit<React.ComponentPropsWithoutRef<"nav">, "children"> {
  /** The trail, root first. An empty array renders `null`. */
  items: BreadcrumbsItem[];
  /**
   * The landmark's accessible name. A prop with a default because it is
   * announced.
   */
  label?: string;
  /**
   * Replace the separator mark for every gap. Undefined draws the middle dot
   * that `BreadcrumbSeparator` owns (CH15, NAV-B1).
   */
  separator?: React.ReactNode;
  /**
   * Collapse the middle of a deep trail to an ellipsis once there are more
   * than this many crumbs. The FIRST and the LAST are always kept — the root
   * and the page you are on are the two a reader is actually looking for.
   * Undefined shows every crumb, because a primitive must not decide that a
   * trail is too long for a layout it cannot see.
   */
  maxItems?: number;
  /** What the elision announces. Defaults to `BreadcrumbEllipsis`'s own English. */
  ellipsisLabel?: string;
  /** Classes for the `<ol>`, for a call site that needs to change the wrap. */
  listClassName?: string;
}

/** A crumb, or the gap where several were removed. */
export type Rendered =
  | { kind: "item"; item: BreadcrumbsItem; index: number }
  | { kind: "gap" };

/**
 * Keep the first crumb, the gap, and the tail — never fewer than the first and
 * the last. `maxItems` counts the crumbs the reader ends up seeing, gap
 * excluded, so `maxItems={3}` on a six-step trail shows root … x y.
 *
 * EXPORTED 2026-09-02, for `breadcrumb-folders.tsx` in this same folder. It is
 * the fold rule of the trail, not of this one drawing of it, and the folder
 * strip is the second drawing — so it is reached rather than re-derived. It
 * stays un-exported from the folder's public surface in the sense that
 * matters: nothing outside `components/breadcrumbs/` imports it, and the two
 * files that do are the two forms of the same trail.
 */
export function collapse(items: BreadcrumbsItem[], maxItems?: number): Rendered[] {
  const all: Rendered[] = items.map((item, index) => ({ kind: "item", item, index }));
  if (maxItems === undefined || maxItems < 2 || items.length <= maxItems) return all;

  const head = all.slice(0, 1);
  const tail = all.slice(items.length - (maxItems - 1));
  return [...head, { kind: "gap" }, ...tail];
}

/**
 * The finished trail.
 *
 * TEN STATES
 *  1. default        — root … page, separators between.
 *  2. hover          — per crumb; `BreadcrumbLink` owns it.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — does not apply; a trail link occupies no box.
 *  5. disabled       — an item with no `href` renders as the non-link crumb,
 *                      which is the trail's disabled form and announces itself
 *                      as one. There is no greyed-out link.
 *  6. loading        — does not apply. A trail is known before the page it
 *                      describes; a skeleton crumb would be a placeholder for
 *                      something already in hand.
 *  7. empty          — `items: []` renders `null`. Not an empty `<nav>`, not a
 *                      lone chevron, not a dash.
 *  8. error          — does not apply. A trail reports nothing.
 *  9. selected       — the last crumb, always: `BreadcrumbPage`, primary ink
 *                      plus `aria-current="page"`.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and deliberately so: the trail wraps
 *  at every width (`BreadcrumbList`) and the shortening lever is `maxItems`, a
 *  CONTENT decision the call site makes, not a width the component guesses at.
 *  A composition that wants a two-crumb trail on a phone passes
 *  `maxItems={2}` from its own media query, so the decision stays somewhere a
 *  translator and a designer can both see it.
 *
 * RTL — safe. Every part is, and the order of the array is the reading order
 * in both directions.
 */
const Breadcrumbs = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  (
    {
      items,
      label = "Breadcrumb",
      separator,
      maxItems,
      ellipsisLabel,
      className,
      listClassName,
      ...props
    },
    ref,
  ) => {
    if (items.length === 0) return null;

    const rendered = collapse(items, maxItems);
    const lastIndex = items.length - 1;

    return (
      <Breadcrumb
        ref={ref}
        label={label}
        data-slot="breadcrumbs"
        className={cn(className)}
        {...props}
      >
        <BreadcrumbList className={listClassName}>
          {rendered.map((entry, position) => {
            const key =
              entry.kind === "gap"
                ? "breadcrumbs-gap"
                : (entry.item.key ?? `breadcrumbs-${entry.index}`);

            return (
              <React.Fragment key={key}>
                {position > 0 ? (
                  <BreadcrumbSeparator>{separator}</BreadcrumbSeparator>
                ) : null}
                <BreadcrumbItem>
                  {entry.kind === "gap" ? (
                    <BreadcrumbEllipsis label={ellipsisLabel} />
                  ) : entry.index === lastIndex || entry.item.href === undefined ? (
                    <BreadcrumbPage>{entry.item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={entry.item.href}>{entry.item.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  },
);

Breadcrumbs.displayName = "Breadcrumbs";

export { Breadcrumbs };
