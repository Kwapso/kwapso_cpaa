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
// THE CARD, added 2026-08-31 and REMOVED the same night, was a false fix.
// Client ruling at the time read a live App detail's Overview tab against the
// kit's own reference and asked for "the content is its own card" — but the
// screenshot that followed showed exactly what that produces: a white
// `variant="raised"` box floating inside the panel's own off-beige
// `bg-surface-panel` band, a container inside a container. Her ruling on
// THAT screenshot was unambiguous: no nested card at all, the fact list's
// text sits directly on the panel. `RecordScreen` (record-chrome.tsx) still
// hands its whole `TabsView` to the kit's `RecordDetail`, which still draws
// the ONE outer `Card` around the panel — that OUTER seam stands. This file
// goes back to putting nothing of its own between the `<dl>` and that panel.
//
// Anything beyond that one override (see above) belongs at the call site, or
// in the library.

import * as React from "react"

import { DescriptionList } from "@shared/ui/components/description-list/description-list"

export type DescriptionItem = { id?: string; label: string; value?: React.ReactNode }

export function OverviewList({ items }: { items: DescriptionItem[] }) {
  return (
    <DescriptionList
      layout="rows"
      items={items.map((i, n) => ({ id: i.id ?? `${n}-${i.label}`, label: i.label, value: i.value }))}
    />
  )
}
