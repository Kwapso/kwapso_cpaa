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

import { Button } from "@shared/ui/components/button/button"
import { CLIENT_PAGE_ROWS_CAP, cursorKey, loadMore } from "@/lib/live-resources"
import { useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"

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
  const t = useT()
  const cursor = useCachedValue<string | null>(cursorKey(listKey))
  // The list itself, only to know HOW MUCH of it is loaded. `useCachedValue`
  // rather than a fetcher: the list has one owner and this is not it.
  const loaded = useCachedValue<T[]>(listKey)
  const [busy, setBusy] = React.useState(false)
  if (!cursor) return null
  // AT THE CEILING, SAY SO — don't offer a button that no longer does anything.
  // `loadMore` refuses past CLIENT_PAGE_ROWS_CAP (a browser holding a thousand
  // rows of one list is already past useful), and a disabled "Load more" would
  // read as a bug. There IS more; this is the wrong tool for reaching it.
  if ((loaded?.length ?? 0) >= CLIENT_PAGE_ROWS_CAP)
    return (
      <p className="text-muted-foreground text-center text-sm">
        {/* ONE WHOLE SENTENCE WITH A NAMED HOLE (R28/R33) — this used to be a
            translated fragment (`t("That's the first")`), a raw spliced
            number, then a bare, untranslated English sentence glued on after
            it: three pieces welded together at render time rather than one
            unit R28's extractor could ever see, so every non-English reader
            who reached the row cap on any paged collection (tickets,
            accounts, contacts, knowledge, meetings, processes, stories, and
            every nested paged panel) read half the sentence in their own
            language and half in English. `{n}` is the only shape a
            translator can reorder the number inside — the same rule this
            file's own sibling seams (`paged-find.tsx`'s `matches`) already
            follow. */}
        {t("That's the first {n}. Search or filter to find what you're after.", {
          n: CLIENT_PAGE_ROWS_CAP.toLocaleString(),
        })}
      </p>
    )
  return (
    <div className="flex justify-center">
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          loadMore(listKey, fetchPage).finally(() => setBusy(false))
        }}
      >
        {busy ? t("Loading…") : label}
      </Button>
    </div>
  )
}
