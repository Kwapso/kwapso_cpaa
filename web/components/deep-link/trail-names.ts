"use client"

// THE NAMES OF THE RECORDS YOU CAME IN THROUGH, when no loaded list holds them.
//
// THE OWNER, 24 Aug 2026, on `/accounts/…/apps/…/processes/…`:
//
//   "does it not make sense that all of the breadcrumbs should hold the name of
//    the record of the detail screen which was open, rather than the name of the
//    module? Instead of accounts, it should have shown me Confia and then the app
//    name and then the sprint name or number, whatever."
//
// He is describing the intent the crumbs already had. What they did not have was
// a way to KEEP it. A crumb's name was looked up inside whichever list happened
// to be in cache, so the name was there when the collection was small and gone
// when it was not — silently, with the generic word in its place. On staging that
// day: 131 accounts, a page of fifty, and Confia sitting at row 118. Nothing
// errored. The crumb just said less than it knew, and only on the clients with
// enough history to matter.
//
// So a name is READ when the page did not reach it. Not through a new door — every
// record type already has a by-id read, because a detail screen opened from a
// pasted link has always needed one. This asks the SAME doors, through the live
// registry that already names them, and parks the answers under one key per
// trail so walking back out costs nothing.
//
// WHY IT IS BOUNDED WITHOUT SAYING SO IN A LIMIT: the fan-out is the depth of the
// address, and only the levels no list could name. Two or three reads on a cold
// paste, none at all on a walk in — because walking in means every ancestor's
// list was on screen a moment ago.

import * as React from "react"

import { RECORD_FACE } from "@/components/deep-link/crumbs"
import { TEAM_RESOURCES } from "@/lib/live-resources"
import { useCached } from "@shared/web/store"

/** `module:id` — the key a resolved name is filed under, and the same string
 * `recordLabel` looks it up by. One spelling, written once. */
export const faceKey = (module: string, id: string): string => `${module}:${id}`

/**
 * Reads the name of every level in `levels` that `alreadyNamed` could not name.
 *
 * `alreadyNamed` is the loaded-list lookup — pass the same records the crumbs
 * use — so a level whose list holds it is never fetched. Returns a map that is
 * empty until the reads land; every caller keeps its fallback behind it.
 */
export function useTrailNames(
  levels: { module: string; id: string }[],
  alreadyNamed: (module: string, id: string) => boolean,
  enabled: boolean
): ReadonlyMap<string, string> {
  // WHAT IS ACTUALLY MISSING. A level is asked for only when it has an id, has a
  // face (so there is a name to say), and no loaded list holds it. The deepest
  // level is included: on a nested address it is a crumb like any other, and on
  // a pasted link it is the one whose name matters most.
  const missing = levels.filter(
    (l) => l.id && RECORD_FACE[l.module] && !alreadyNamed(l.module, l.id)
  )
  // ONE KEY PER SET OF MISSING LEVELS, so the answer is cached against the
  // address rather than re-read on every render. When a list lands and supplies
  // one of them, the set shrinks, the key changes, and the next read asks for
  // less — it converges downwards, never upwards.
  const key =
    enabled && missing.length ? `trail-names:${missing.map((l) => faceKey(l.module, l.id)).join("|")}` : null

  const q = useCached<Record<string, string>>(key, async () => {
    const out: Record<string, string> = {}
    await Promise.all(
      missing.map(async (l) => {
        const face = RECORD_FACE[l.module]
        const fetchOne = TEAM_RESOURCES[face.resource]?.fetchOne
        if (!fetchOne) return
        // A NAME IS NOT WORTH AN ERROR SCREEN. A record the caller may not read,
        // or one that has been taken away, leaves the crumb on its fallback word
        // — which is exactly what it showed before any of this existed.
        const row = await fetchOne(l.id).catch(() => null)
        const name = row ? face.name(row) : ""
        if (name) out[faceKey(l.module, l.id)] = name
      })
    )
    return out
  })

  const data = q.data
  return React.useMemo(() => new Map(Object.entries(data ?? {})), [data])
}
