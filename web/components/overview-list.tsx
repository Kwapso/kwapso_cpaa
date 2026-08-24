"use client"

// THE OVERVIEW PANEL (R2) — the one-column DescriptionList every record detail
// shows under its Overview tab.
//
// It is a wrapper, not a fork: the library owns the rendering, and this file owns
// the ONE decision the host had been repeating — a record's Overview is a single
// stacked column, never the library's two-column default, because these panels
// sit beside a tab strip on a phone. That decision was written out identically in
// eleven detail components, which is eleven chances for the twelfth to be built
// two-column and for nobody to notice until a client screenshot arrives.
//
// Anything beyond that one override belongs at the call site, or in the library.

import * as React from "react"

import { DescriptionList } from "@shared/ui/structures/description-list/description-list"

export type DescriptionItem = { id?: string; label: string; value?: React.ReactNode }

export function OverviewList({ items }: { items: DescriptionItem[] }) {
  return (
    <DescriptionList
      layout="rows"
      items={items.map((i, n) => ({ id: i.id ?? `${n}-${i.label}`, label: i.label, value: i.value }))}
    />
  )
}
