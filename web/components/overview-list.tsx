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

import { DescriptionList, defaultDescriptionListConfig, type DescriptionItem } from "@kwapso/ui/registry/collections/description-list/description-list"

export function OverviewList({ items }: { items: DescriptionItem[] }) {
  return <DescriptionList config={{ ...defaultDescriptionListConfig, columns: 1 }} items={items} />
}
