"use client"

// WHERE SHE WAS — the app's memory of the place a person left, per top-level
// section, for as long as this document lives.
//
// THE COMPLAINT IT EXISTS FOR (the designer, 27 Aug 2026). She opens Apps, opens
// an app, opens its Tickets tab, goes four records deep with a search and a
// filter and a scroll position at each level — then switches to To-dos to jot
// something down, comes back to Apps, and is at the top of an empty list. She
// multitasks constantly, so she pays that price a dozen times a day.
//
// WHY IT IS FEASIBLE AT ALL. The whole post-auth app is ONE shell that mounts
// once (R37): moving between sections destroys no document, so there is somewhere
// for a memory to live. What it destroys is COMPONENT state — the shell keys its
// content region on `module:recordId`, so every collection's search box, every
// filter, every record's open tab is a fresh `useState` the moment she comes
// back. This module is the place that state can be parked and found again.
//
// ── TWO THINGS ARE REMEMBERED, AND THEY ARE DIFFERENT SHAPES ─────────────────
//
//   THE TRAIL is just the PATH. Nesting lives in the URL already
//   (`/accounts/CONFIA/apps/A1` — deep-link/route.ts `trailPath`), so "how deep
//   she had gone, and through which records" needs no structure of its own: it
//   is one string per section, and the breadcrumbs rebuild themselves from it.
//
//   THE STATE ALONG IT is per PATH, per SLOT — the open tab, what was typed in
//   a search box, which filters were set, where each scrolled area was. Keyed by
//   the path so every level of the trail keeps its own, and so a path she never
//   returns to simply ages out.
//
// ── THE OWNER'S TWO RULINGS ───────────────────────────────────────────────────
//
// 1 · SESSION-SCOPED, AND A REFRESH MAY WIPE IT. This is a module-level Map and
//     nothing else: no `sessionStorage`, no `localStorage`, no server. A reload,
//     a reopened tab or a discarded-and-restored tab starts clean, and the owner
//     said plainly that is fine. Persistence would buy the haunted cases — a
//     record deleted while the tab was closed, a filter whose option was retired
//     last week — for a benefit nobody asked for. It also makes two browser tabs
//     correct by construction: each document has its own Map, so they cannot
//     drag each other around.
//
// 2 · IT MUST BE BOUNDED. His words: he does not want a power user accumulating
//     so much remembered state that it slows the app or their device. He named
//     the precedent himself — the paging cache — so this is built to the same
//     shape as `shared/web/store.ts`: a declared ceiling, least-recently-visited
//     eviction, and a size bound on any single entry. An unbounded map keyed by
//     record id is exactly the thing that looks fine for a week.
//
// ── WHERE THE CEILINGS LIVE, AND WHY NOT IN limits.ts ─────────────────────────
//
// `shared/workers/limits.ts` opens by saying what it is: "ONE place for the
// read/write size caps every worker shares" — how many ROWS a door may return.
// Nothing here crosses a door. The two ceilings this app already places on
// BROWSER memory both sit beside the structure they bound — `MAX_CACHED_KEYS`
// in `shared/web/store.ts`, `CLIENT_PAGE_ROWS_CAP` in `web/lib/live-resources.ts`
// — because the number and the eviction that enforces it are one decision, and
// splitting them puts the ceiling one file away from the only code that can
// break it. These follow that precedent.

import { NAV, TEAM_SECTIONS } from "@/lib/pages"

/** Sections remembered at once, least-recently-VISITED evicted first (the
 * owner's own suggestion, and the right one: the section you have not opened
 * all afternoon is the one whose trail you have stopped thinking about).
 *
 * Twelve, against a rail that offers about fourteen destinations — generous
 * enough that ordinary back-and-forth between the four or five sections
 * somebody actually works in never loses anything, and a hard wall in front of
 * a person who opens all of them all day. */
export const MAX_REMEMBERED_SECTIONS = 12

/** Screens remembered INSIDE one section — a screen being one path, holding its
 * tab, its search, its filters and its scroll offsets.
 *
 * Forty, because a section's trail is four or five levels deep and a working
 * afternoon in one section touches tens of records, not hundreds. This is the
 * bound that actually matters: it is the one keyed by RECORD ID, which is the
 * shape that grows without limit if nobody stops it. */
export const MAX_REMEMBERED_SCREENS = 40

/** How big ONE remembered value may be, as JSON. A search string, a handful of
 * facet values, a scroll snapshot — all of them are tens of bytes. This is not
 * a budget, it is a REFUSAL: a value bigger than this is not the sort of thing
 * this memory is for, and it is dropped rather than truncated, because half a
 * remembered filter set is worse than none. It also puts an arithmetic ceiling
 * on the whole store: 12 × 40 × 1KB is under half a megabyte, worst case, for a
 * person who spends the day trying to fill it. */
export const MAX_REMEMBERED_VALUE_CHARS = 1024

/** One section's memory: where she was, and what each screen along the way had
 * open. `screens` is keyed by path — insertion-ordered, so it evicts oldest
 * first exactly as the section map does. */
type SectionMemory = {
  path: string
  screens: Map<string, Record<string, unknown>>
}

/** teamId + section → its memory. The team is IN the key on purpose: a path
 * under `/t/<teamId>/…` is pinned to one team, so a remembered trail must not
 * survive a team switch and send somebody to a screen they are no longer in.
 * Keeping the team in the key rather than clearing on switch means switching
 * BACK also brings that team's places back, still under the same ceiling. */
const sections = new Map<string, SectionMemory>()

/** THE SECTION A PATH BELONGS TO, derived from the page registry rather than
 * listed here — a section added to `pages.ts` is remembered without this file
 * being told, which is the property the nav bugs in `route.ts` were all about.
 *
 * Both URL forms answer the same: `/tickets/123` and `/t/<teamId>/tickets/123`
 * are one section. An unrecognised segment gets a bucket of its own under its
 * own name rather than being lumped in with the team overview — it is bounded
 * like every other bucket, and a screen the registry has not heard of is
 * exactly the case where guessing wrong strands somebody. */
export function sectionOf(path: string): string {
  const segs = path.split("?")[0].split("/").filter(Boolean)
  const rest = segs[0] === "t" ? segs.slice(2) : segs
  const segment = rest[0] ?? ""
  const team = TEAM_SECTIONS.find((s) => s.segment === segment)
  if (team) return team.key
  const nav = NAV.find((n) => n.path === `/${segment}`)
  if (nav) return nav.slug
  return segment || "overview"
}

/** The bucket one path's memory lives in. */
function keyFor(teamId: string | null, path: string): string {
  return `${teamId ?? ""}:${sectionOf(path)}`
}

/** Touch a bucket (or make one), then bring the section map back under its
 * ceiling. Map iterates in insertion order and every touch re-inserts, so the
 * walk below drops the least recently VISITED section first. */
function touch(key: string): SectionMemory {
  const found = sections.get(key)
  const memory = found ?? { path: "", screens: new Map() }
  sections.delete(key)
  sections.set(key, memory)
  for (const oldest of sections.keys()) {
    if (sections.size <= MAX_REMEMBERED_SECTIONS) break
    sections.delete(oldest)
  }
  return memory
}

/** SHE WAS HERE. Called by the shell on every path change, so the section's
 * trail is always the last place she actually stood in it. */
export function rememberPath(teamId: string | null, path: string): void {
  if (!path) return
  touch(keyFor(teamId, path)).path = path
}

/** WHERE SHE WAS IN THIS SECTION, or null if this session has never been in it —
 * in which case the caller uses the section's own top, which is what every
 * click did before this existed. */
export function recallPath(teamId: string | null, sectionPath: string): string | null {
  const memory = sections.get(keyFor(teamId, sectionPath))
  return memory?.path || null
}

/** FORGET THIS SECTION — the trail AND everything along it.
 *
 * This is the reset (a second click on the section you are already in) and it
 * is deliberately total: "throws you back to that section's top" would be a
 * half-truth if the collection at the top still had last hour's search in it.
 * It doubles as the manual escape hatch for every corner below — anything the
 * memory gets wrong is one click from being gone. */
export function forgetSection(teamId: string | null, sectionPath: string): void {
  sections.delete(keyFor(teamId, sectionPath))
}

/** WHAT THIS SCREEN HAD OPEN, for one named slot ("tab", "find:…", "scroll").
 * `undefined` means nothing is remembered, which every caller reads as "use
 * your own default" — so a miss is always the behaviour from before this
 * existed, never an error and never a blank. */
export function readSlot(teamId: string | null, path: string, slot: string): unknown {
  return sections.get(keyFor(teamId, path))?.screens.get(path)?.[slot]
}

/** Remember one slot of one screen. A value too big to be the sort of thing
 * this memory holds is DROPPED (see MAX_REMEMBERED_VALUE_CHARS), and so is one
 * that will not serialise — both mean "this is not a search box's worth of
 * state", and both degrade to the screen's own default. */
export function writeSlot(
  teamId: string | null,
  path: string,
  slot: string,
  value: unknown
): void {
  if (!path) return
  let json: string
  try {
    json = JSON.stringify(value ?? null)
  } catch {
    return
  }
  if (json.length > MAX_REMEMBERED_VALUE_CHARS) return
  const memory = touch(keyFor(teamId, path))
  const screen = memory.screens.get(path) ?? {}
  screen[slot] = value
  // Re-inserted so the screens map is least-recently-TOUCHED ordered too, and
  // then brought back under its own ceiling. This is the bound that matters:
  // `screens` is the map keyed by record id.
  memory.screens.delete(path)
  memory.screens.set(path, screen)
  for (const oldest of memory.screens.keys()) {
    if (memory.screens.size <= MAX_REMEMBERED_SCREENS) break
    memory.screens.delete(oldest)
  }
}

/** WHAT A CLICK ON A SECTION IN THE RAIL MEANS — the whole of the interaction,
 * as one function, so the shell holds the drawing and this holds the decision.
 *
 * Not in the rail, and not on any other control, because a section is the ONLY
 * thing in this app you click without naming a destination: a link, a
 * breadcrumb, a row and a pasted address all say exactly where to go, and none
 * of them comes near this. That is what keeps a deep link from outside sacred.
 *
 * AND THE SECOND CLICK IS THE RESET (Glide's behaviour, which the owner keeps):
 * pressing the section you are already in forgets it and returns its top. It is
 * a SECOND CLICK rather than a double-click, and the argument is about the
 * first one: recognising a genuine double-click means holding the first click
 * for the length of the double-click window before acting on it, so every
 * navigation in the app would gain a quarter-second stall to buy a gesture used
 * once a day. It is also the gesture the person already has — a second press on
 * the tab you are on is how every phone's tab bar goes back to the top — and on
 * a phone a double-tap belongs to the browser's zoom.
 *
 * "Already in it" is asked of the SECTION, never of the path: `/tickets/123`
 * and `/t/<teamId>/tickets/123` are one section, and comparing prefixes says
 * they are two. */
export function sectionClick(
  teamId: string | null,
  sectionPath: string,
  here: string
): string {
  if (sectionOf(sectionPath) === sectionOf(here)) {
    forgetSection(teamId, sectionPath)
    return sectionPath
  }
  return recallPath(teamId, sectionPath) ?? sectionPath
}

/** What the store is holding right now — for the ceiling test, and for anyone
 * who wants to prove the bounds hold under a punishing walk rather than take
 * the comment above on trust. */
export function navMemoryStats(): {
  sections: number
  screens: number
  slots: number
  chars: number
} {
  let screens = 0
  let slots = 0
  let chars = 0
  for (const memory of sections.values()) {
    screens += memory.screens.size
    for (const screen of memory.screens.values()) {
      slots += Object.keys(screen).length
      for (const value of Object.values(screen)) {
        try {
          chars += JSON.stringify(value ?? null).length
        } catch {
          /* an unserialisable value never got in here — see writeSlot */
        }
      }
    }
  }
  return { sections: sections.size, screens, slots, chars }
}

/** Drop everything. The team switcher does not need this (the team is in the
 * key), but a sign-out does — one person's places must not be handed to the
 * next person to use this browser. */
export function forgetEverything(): void {
  sections.clear()
}
