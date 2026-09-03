"use client"

// THE CLIENT'S OWN TO-DOS, as the portal reads them — one place, because two
// sections on Home show them and must never disagree about what "open" and
// "sent" mean.
//
// TWO PAGED LISTS, NOT ONE LIST WITH A FILTER. That distinction is the whole
// reason this file exists rather than a `.filter()` in a component, and it is
// the shape "Awaiting your input" shipped with: it fetched the to-do list and kept
// the rows with no `completedAt`. That was honest while the door answered with
// every row it had; the moment the door PAGES (R14) it is a filter over page
// one, quietly answering "nothing" about everything past the cursor.
//
// So each view is its own read, its own exact total (R16) and its own opaque
// cursor. The two are ordered by different columns — open by when it is due,
// done by when it was done — so a cursor from one is REFUSED by the other rather
// than returning a page that reads as an answer and skips rows.

import * as React from "react"

import type { Todo, TodoViewName } from "@shared/types"
import { primeCache, readCache, useCached, useCachedValue } from "@shared/web/store"
import { reportError } from "@shared/web/log"
import { toast } from "@shared/ui/components/sonner/sonner"
import { delivery } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useT } from "@shared/web/language"

/** Rows one of these lists may hold in the browser at once — the ticket hook's
 * ceiling, for the same reason it gives: `loadMore` appends, and without a
 * ceiling the array and the DOM under it grow for as long as the tab is open. */
const CLIENT_PAGE_ROWS_CAP = 1000

/** The three keys one view is held in: its rows, its exact total, its cursor. */
function keysFor(view: TodoViewName): { rows: string; total: string; cursor: string } {
  return view === "done"
    ? { rows: cacheKeys.todosDone, total: cacheKeys.todosDoneTotal, cursor: cacheKeys.todosDoneCursor }
    : { rows: cacheKeys.todos, total: cacheKeys.todosTotal, cursor: cacheKeys.todosCursor }
}

/** Page one, primed with its exact total and the cursor page two starts at.
 *
 * BOTH totals are primed from every answer, whichever view asked (R16): the
 * heading on the section you are not looking at cannot be counted from the rows
 * in front of you, and both sections are on the same screen. */
async function firstPage(view: TodoViewName): Promise<Todo[]> {
  const page = await delivery.todos(view)
  primeCache(cacheKeys.todosTotal, page.openTotal)
  primeCache(cacheKeys.todosDoneTotal, page.doneTotal)
  primeCache(keysFor(view).cursor, page.nextCursor)
  return page.todos
}

export function usePortalTodos(view: TodoViewName) {
  const t = useT()
  const keys = keysFor(view)
  const { data, loading, error, refresh } = useCached<Todo[]>(keys.rows, () => firstPage(view))
  const total = useCachedValue<number>(keys.total)
  const cursor = useCachedValue<string | null>(keys.cursor)
  const [loadingMore, setLoadingMore] = React.useState(false)

  const loadMore = React.useCallback(async () => {
    const next = readCache<string | null>(keys.cursor)
    if (!next) return
    // Checked BEFORE the fetch — a page nobody may keep is a request nobody
    // should make. `hasMore` below stands down at the same number, so the button
    // goes away rather than becoming a no-op.
    if ((readCache<Todo[]>(keys.rows) ?? []).length >= CLIENT_PAGE_ROWS_CAP) return
    setLoadingMore(true)
    try {
      const page = await delivery.todos(view, next)
      // APPEND to what's on screen — never a refetch of rows already read.
      primeCache(keys.rows, [...(readCache<Todo[]>(keys.rows) ?? []), ...page.todos])
      primeCache(cacheKeys.todosTotal, page.openTotal)
      primeCache(cacheKeys.todosDoneTotal, page.doneTotal)
      primeCache(keys.cursor, page.nextCursor)
    } catch (e) {
      // Called as `void loadMore()`, so without this a failed page two is an
      // unhandled rejection that lands nowhere — the button simply stops working
      // and nobody is told, here or in the error store.
      reportError("portal-todos.loadMore", e)
      toast.error(t("We couldn't load any more. Try again in a moment."))
    } finally {
      setLoadingMore(false)
    }
  }, [keys.cursor, keys.rows, t, view])

  return {
    todos: data,
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
