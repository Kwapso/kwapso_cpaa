"use client"

// SEARCHING A PORTAL COLLECTION — one hook, because the two growing collections
// on this door (tickets, and what the client has sent us) must not disagree
// about what searching means.
//
// R48 says search belongs on every collection view. R14 says a GROWING one pages
// by key. Put together those two rules force a shape, and it is worth stating
// because the easy version is wrong: a search must ASK THE DOOR, never filter
// the rows already in the browser. A client-side filter over the loaded page
// would search page one and report "nothing matched" for a ticket that plainly
// exists — a lie the reader has no way to detect, on the exact control they
// reached for because the list was too long to read.
//
// IT CACHES NOTHING, DELIBERATELY. The browse lists live in `cacheKeys.*` and
// those keys are registered in PORTAL_LISTENERS (R15), so a reply or a status
// move patches the rows on screen. Priming a filtered set into the same key
// would leave the live layer patching a list nobody is looking at and leave a
// narrowed list behind after the box is cleared. A search is a transient read;
// it gets no key, and so it needs no listener and can rot in no cache.
//
// SEQUENCED, NOT CANCELLED. The reply that arrives last is not necessarily the
// one typed last, so a stale answer is dropped by comparing its ticket number
// against the newest request rather than by aborting a fetch.

import * as React from "react"

import { reportError } from "@shared/web/log"

/** How long a person stops typing before we ask. Every keystroke is a request
 * without it, and the door is a real database read behind a real fence. */
const SETTLE_MS = 250

export type DoorSearch<Row> = {
  /** null = not searching (the box is empty), or the first answer has not landed. */
  rows: Row[] | null
  /** The door's exact COUNT(*) for THIS search (R16) — not `rows.length`, which
   * is only the first page and understates the moment a match falls past it. */
  total: number | null
  searching: boolean
  failed: boolean
}

export function useDoorSearch<Row>(
  term: string,
  ask: (q: string) => Promise<{ rows: Row[]; total: number }>,
  label: string
): DoorSearch<Row> {
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [total, setTotal] = React.useState<number | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const seq = React.useRef(0)
  // The caller builds `ask` inline, so it is a new function every render; keep it
  // in a ref rather than in the effect's deps, or the effect re-runs forever.
  const askRef = React.useRef(ask)
  askRef.current = ask

  React.useEffect(() => {
    const q = term.trim()
    if (!q) {
      setRows(null)
      setTotal(null)
      setFailed(false)
      setSearching(false)
      return
    }
    const mine = ++seq.current
    setSearching(true)
    setFailed(false)
    const timer = setTimeout(() => {
      void askRef
        .current(q)
        .then((page) => {
          if (mine !== seq.current) return
          setRows(page.rows)
          setTotal(page.total)
        })
        .catch((e) => {
          if (mine !== seq.current) return
          reportError(label, e)
          setFailed(true)
        })
        .finally(() => {
          if (mine === seq.current) setSearching(false)
        })
    }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [term, label])

  return { rows, total, searching, failed }
}
