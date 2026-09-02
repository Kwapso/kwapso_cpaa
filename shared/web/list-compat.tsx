"use client"

// List — the OLD library's list contract, drawn by the kit. Same seam pattern
// as shared/web/field.tsx and the engine's TabsView: seven call sites across
// the front doors write `items` / `leading` / `subtitle` / `trailing` /
// `onItemClick` / `surface`, and the kit's List (structures/list) speaks
// `rows` / `mark` / `description` / `action` / `onRowSelect` / `variant`.
// One translation here beats seven hand-reshapes that must each be right.

import * as React from "react"

import { List as KitList, type ListProps as KitListProps } from "@shared/ui/components/list/list"
import { RecordMark, RecordMarkGlyph } from "./record-mark"

export interface ListItem {
  id: string
  leading?: React.ReactNode
  /** A photograph for the row's mark, handed straight to the kit's own
   * `Avatar`/`AvatarImage` — which owns its own load state — rather than a
   * hand-built `<Avatar>` passed through `leading`, which would nest a second
   * circular box inside the kit's. Ignored when `leading` is set. */
  image?: string | null
  imageAlt?: string
  /** The fallback shown until `image` loads, or when there is none. */
  initials?: React.ReactNode
  title?: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
}

// The kit's own `List` ALWAYS wraps whatever sits in a row's mark slot in its
// own circular `Avatar` (list.tsx: `<Avatar size="md" variant="quiet">`) — its
// own doc comment invites "an icon or any node in the well instead of
// initials", i.e. bare content, not a second styled box. A `<RecordMark>` IS
// a second styled box (its own background, shape and `overflow-hidden`,
// shared/web/record-mark.tsx), so passing one straight through nested two
// avatars per row — the kit's own circular one, holding a full `RecordMark`
// box a second time inside it. Unwrapped here to `RecordMarkGlyph`, the same
// component with no box of its own, so the kit's Avatar is the only one.
//
// GAP, not silently papered over: the kit's `List` has no per-row shape, so
// this can only ever draw a circle — never `RecordMark`'s own square (R31: a
// client, an app, an asset). In practice today that loses nothing new: at
// every size `List` rows use (`row`, `tile`, `choice`), `RecordMark`'s own
// `rounded-[var(--radius)]` already renders as a full circle before this file
// ever sees it — this app's `--radius` token is more than half of each box's
// side, so the browser's own corner-radius-overlap rule (CSS Backgrounds §
// on radii that would overlap) rounds all four corners down to a circle
// standalone, with no kit involved (measured live, `web/app/zz-verify-list-mark`,
// since deleted: a bare `shape="square"` mark at `choice`/`row`/`tile`/`band`
// all failed a 1px corner hit-test — the square never had corners to begin
// with at these sizes). Whether `record-mark.tsx` should draw a genuinely
// square box at these sizes is a separate, bigger question — flagged, not
// decided here.
function leadingMarkFor(leading: React.ReactNode): React.ReactNode {
  if (React.isValidElement(leading) && leading.type === RecordMark) {
    const p = leading.props as {
      picture?: string | null
      mark?: string | null
      name?: string | null
      shape?: "square" | "round"
      fit?: "cover" | "contain"
    }
    const round = p.shape === "round"
    const cover = (p.fit ?? (round ? "cover" : "contain")) === "cover"
    return <RecordMarkGlyph picture={p.picture} mark={p.mark} name={p.name} cover={cover} />
  }
  return leading
}

export function List({
  items,
  onItemClick,
  empty,
  surface = "card",
  className,
  ...rest
}: {
  items: ListItem[]
  onItemClick?: (item: ListItem) => void
  /** Shown when `items` is empty. */
  empty?: React.ReactNode
  /** Old contract: "card" (bordered panel) or "none" (flat rows; call sites
   *  add their own frame). Maps to the kit's variant. */
  surface?: "card" | "none"
  className?: string
} & Omit<KitListProps, "rows" | "onRowSelect" | "variant" | "state">) {
  return (
    <KitList
      {...rest}
      className={className}
      variant={surface === "none" ? "rows" : "panel"}
      rows={items.map((i) => ({
        id: i.id,
        mark: leadingMarkFor(i.leading),
        image: i.image ?? undefined,
        imageAlt: i.imageAlt,
        initials: i.initials,
        title: i.title,
        description: i.subtitle,
        action: i.trailing,
      }))}
      onRowSelect={onItemClick ? (index) => onItemClick(items[index]) : undefined}
      state={items.length === 0 ? "empty" : "ready"}
      emptyTitle={empty}
    />
  )
}
