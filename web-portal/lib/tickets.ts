"use client"

// The ticket list, as the portal reads it — one place, because Home and Support
// both show it and must never disagree about what "your requests" means.
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
import { support } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

/** Page one, primed with its exact total and the cursor page two starts at. */
async function firstPage(): Promise<HelpTicket[]> {
  const page = await support.tickets()
  primeCache(cacheKeys.ticketsTotal, page.total)
  primeCache(cacheKeys.ticketsCursor, page.nextCursor)
  return page.tickets
}

export function useTickets() {
  const { data, loading, error, refresh } = useCached<HelpTicket[]>(cacheKeys.tickets, firstPage)
  const total = useCachedValue<number>(cacheKeys.ticketsTotal)
  const cursor = useCachedValue<string | null>(cacheKeys.ticketsCursor)
  const [loadingMore, setLoadingMore] = React.useState(false)

  const loadMore = React.useCallback(async () => {
    const next = readCache<string | null>(cacheKeys.ticketsCursor)
    if (!next) return
    setLoadingMore(true)
    try {
      const page = await support.tickets(next)
      // APPEND to what's on screen — never a refetch of rows already read.
      primeCache(cacheKeys.tickets, [...(readCache<HelpTicket[]>(cacheKeys.tickets) ?? []), ...page.tickets])
      primeCache(cacheKeys.ticketsTotal, page.total)
      primeCache(cacheKeys.ticketsCursor, page.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }, [])

  return {
    tickets: data,
    total,
    loading,
    error,
    refresh,
    /** null cursor = that was the last page. */
    hasMore: !!cursor,
    loadingMore,
    loadMore,
  }
}
