"use client"

// LOAD MORE (R14) — the one affordance a keyset-PAGED collection needs, and the
// only place the opaque cursor is ever touched on the client. It reads the
// cursor sidecar its list parked (undefined = still loading, null = that was the
// last page) and simply isn't there when there's nothing more — so a screen that
// fits on one page looks exactly as it did before paging existed.
//
// It appends; it never refetches what's on screen. That is the whole difference
// between paging and a bigger cap.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { cursorKey, loadMore } from "@/lib/live-resources"
import { useCachedValue } from "@shared/web/store"

export function LoadMore<T>({
  listKey,
  fetchPage,
  label = "Load more",
}: {
  /** the list's own cache key — its cursor sidecar hangs off this. */
  listKey: string
  /** fetch ONE page starting at the opaque cursor (the door decodes it). */
  fetchPage: (cursor: string) => Promise<{ rows: T[]; nextCursor: string | null }>
  label?: string
}) {
  const cursor = useCachedValue<string | null>(cursorKey(listKey))
  const [busy, setBusy] = React.useState(false)
  if (!cursor) return null
  return (
    <div className="flex justify-center">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          loadMore(listKey, fetchPage).finally(() => setBusy(false))
        }}
      >
        {busy ? "Loading…" : label}
      </Button>
    </div>
  )
}
