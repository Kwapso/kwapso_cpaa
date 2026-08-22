"use client"

// The ticket list, as the portal reads it — one place, because Home and Tickets
// both show it and must never disagree about what "your company's tickets" means.
//
// R14: tickets are a GROWING collection, so the door PAGES by key. This hook
// holds page one plus everything appended since, and `loadMore` walks the opaque
// cursor. A client with four years of requests can reach the oldest one — a
// ceiling would eventually just be a refusal to answer.
// R16: `total` is the door's exact COUNT(*), cached beside the rows, so a badge
// over twenty visible rows can honestly say 240.

import * as React from "react"

import type { HelpTicket } from "@shared/types"
import { primeCache, readCache, useCached, useCachedValue } from "@shared/web/store"
import { reportError } from "@shared/web/log"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { support } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useT } from "@shared/web/language"

/** Rows this list may hold in the browser at once — the agency app's
 * CLIENT_PAGE_ROWS_CAP, restated for the portal's own hook (the two front ends
 * share no lib). The reason is the same: `loadMore` appends, and without a
 * ceiling the array and the DOM under it grow for as long as the tab is open. The
 * comment above promises a client "can reach the oldest one" and that stays
 * true — through search and filters, not through a thousand appended rows. */
const CLIENT_PAGE_ROWS_CAP = 1000

/** Page one, primed with its exact total and the cursor page two starts at. */
async function firstPage(): Promise<HelpTicket[]> {
  const page = await support.tickets()
  primeCache(cacheKeys.ticketsTotal, page.total)
  primeCache(cacheKeys.ticketsCursor, page.nextCursor)
  return page.tickets
}

export function useTickets() {
  const t = useT()
  const { data, loading, error, refresh } = useCached<HelpTicket[]>(cacheKeys.tickets, firstPage)
  const total = useCachedValue<number>(cacheKeys.ticketsTotal)
  const cursor = useCachedValue<string | null>(cacheKeys.ticketsCursor)
  const [loadingMore, setLoadingMore] = React.useState(false)

  const loadMore = React.useCallback(async () => {
    const next = readCache<string | null>(cacheKeys.ticketsCursor)
    if (!next) return
    // Checked BEFORE the fetch — a page nobody may keep is a request nobody
    // should make. `hasMore` below stands down at the same number, so the button
    // goes away rather than becoming a no-op.
    if ((readCache<HelpTicket[]>(cacheKeys.tickets) ?? []).length >= CLIENT_PAGE_ROWS_CAP) return
    setLoadingMore(true)
    try {
      const page = await support.tickets(next)
      // APPEND to what's on screen — never a refetch of rows already read.
      primeCache(cacheKeys.tickets, [...(readCache<HelpTicket[]>(cacheKeys.tickets) ?? []), ...page.tickets])
      primeCache(cacheKeys.ticketsTotal, page.total)
      primeCache(cacheKeys.ticketsCursor, page.nextCursor)
    } catch (e) {
      // `loadMore` is called as `void loadMore()`, so without this a failed page
      // two is an unhandled rejection that lands nowhere — the button simply
      // stops working and nobody is told, here or in the error store.
      reportError("portal-tickets.loadMore", e)
      toast.error(t("We couldn't load any more. Try again in a moment."))
    } finally {
      setLoadingMore(false)
    }
  }, [t])

  return {
    tickets: data,
    total,
    loading,
    error,
    refresh,
    /** null cursor = that was the last page; the row ceiling is the other way a
     * list stops offering more (see CLIENT_PAGE_ROWS_CAP). */
    hasMore: !!cursor && (data?.length ?? 0) < CLIENT_PAGE_ROWS_CAP,
    loadingMore,
    loadMore,
  }
}
