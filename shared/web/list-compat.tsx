"use client"

// List — the OLD library's list contract, drawn by the kit. Same seam pattern
// as shared/web/field.tsx and the engine's TabsView: seven call sites across
// the front doors write `items` / `leading` / `subtitle` / `trailing` /
// `onItemClick` / `surface`, and the kit's List (structures/list) speaks
// `rows` / `mark` / `description` / `action` / `onRowSelect` / `variant`.
// One translation here beats seven hand-reshapes that must each be right.

import * as React from "react"

import { List as KitList, type ListProps as KitListProps } from "@shared/ui/components/list/list"

export interface ListItem {
  id: string
  leading?: React.ReactNode
  title?: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
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
        mark: i.leading,
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
