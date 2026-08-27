// THE APP REMEMBERS WHERE SHE WAS — AND FORGETS ENOUGH OF IT.
//
// The designer's complaint (27 Aug 2026): four records deep into Apps with a
// search, a filter and a scroll position at each level, out to To-dos to jot
// something down, back to Apps, and everything is gone. She multitasks
// constantly, so she pays that a dozen times a day.
//
// The owner's second ruling is what this file is mostly about, and it is a hard
// requirement rather than a nicety: he does not want a power user accumulating
// so much remembered state that it slows the app or their device, and if there
// is any risk of that there must be a mechanism that removes it. He named the
// precedent himself — the paging cache, which keeps a bounded amount and lets
// the rest go (web/test/cache-bounds.test.ts is its test, and this is written
// to match).
//
// A MAP KEYED BY RECORD ID IS THE SHAPE THAT LOOKS FINE FOR A WEEK. So the walk
// below is deliberately punishing: far more sections than the rail offers, far
// more records than an afternoon touches, every one of them carrying state.
// What it proves is not that the numbers are right — it is that SOMETHING
// enforces them, which is the difference between a ceiling and a comment.

import { beforeEach, describe, expect, it } from "vitest"

import {
  MAX_REMEMBERED_SCREENS,
  MAX_REMEMBERED_SECTIONS,
  MAX_REMEMBERED_VALUE_CHARS,
  forgetEverything,
  navMemoryStats,
  readSlot,
  recallPath,
  rememberPath,
  sectionClick,
  sectionOf,
  writeSlot,
} from "@/lib/nav-memory"

const TEAM = "team_01"

beforeEach(() => forgetEverything())

describe("the punishing walk", () => {
  it("holds every ceiling while a person tries all afternoon to break it", () => {
    // Fourteen real sections (the rail's own), plus a dozen the registry has
    // never heard of — an unknown segment must be bounded like everything else,
    // not waved through into a bucket of its own that nothing evicts.
    const sections = [
      "accounts", "tickets", "knowledge", "processes", "apps", "sprints", "waves",
      "stories", "tasks", "time", "meetings", "brand", "home", "settings",
      ...Array.from({ length: 12 }, (_, i) => `unknown${i}`),
    ]
    for (const section of sections) {
      for (let record = 0; record < 500; record++) {
        const path = `/${section}/rec_${record}`
        rememberPath(TEAM, path)
        writeSlot(TEAM, path, "tab", "activity")
        writeSlot(TEAM, path, "find:x", { query: `search ${record}`, facetValues: { status: "Open" } })
        writeSlot(TEAM, path, "scroll", { y: 1200, inner: [[0, 340, 0]] })
      }
    }

    const held = navMemoryStats()
    expect(held.sections, "the section map is bounded").toBeLessThanOrEqual(
      MAX_REMEMBERED_SECTIONS
    )
    expect(
      held.screens,
      "and so is the map keyed by RECORD ID, which is the one that grows"
    ).toBeLessThanOrEqual(MAX_REMEMBERED_SECTIONS * MAX_REMEMBERED_SCREENS)
    // 26 sections × 500 records × 3 slots is 39,000 pieces of state offered.
    // What is actually kept is two orders of magnitude smaller, and its total
    // size is arithmetic rather than hope.
    expect(held.slots).toBeLessThanOrEqual(
      MAX_REMEMBERED_SECTIONS * MAX_REMEMBERED_SCREENS * 3
    )
    expect(
      held.chars,
      "the whole store, in bytes, stays smaller than one page of one list"
    ).toBeLessThanOrEqual(
      MAX_REMEMBERED_SECTIONS * MAX_REMEMBERED_SCREENS * 3 * MAX_REMEMBERED_VALUE_CHARS
    )
  })

  it("drops the least recently VISITED section, and keeps the one she is in", () => {
    for (let i = 0; i < MAX_REMEMBERED_SECTIONS; i++) rememberPath(TEAM, `/sec${i}/rec_1`)
    // Back into the oldest one, then fill past the ceiling. Being revisited is
    // what saves it; being written first is not what dooms it.
    rememberPath(TEAM, "/sec0/rec_9")
    for (let i = 100; i < 100 + MAX_REMEMBERED_SECTIONS - 1; i++)
      rememberPath(TEAM, `/sec${i}/rec_1`)

    expect(recallPath(TEAM, "/sec0"), "revisited, so it survived").toBe("/sec0/rec_9")
    expect(recallPath(TEAM, "/sec1"), "untouched the longest, so it went").toBeNull()
    expect(navMemoryStats().sections).toBeLessThanOrEqual(MAX_REMEMBERED_SECTIONS)
  })

  it("refuses a value too big to be a screen's worth of state, rather than truncating it", () => {
    const path = "/accounts/rec_1"
    writeSlot(TEAM, path, "find:x", { query: "x".repeat(MAX_REMEMBERED_VALUE_CHARS + 1) })
    expect(
      readSlot(TEAM, path, "find:x"),
      "half a remembered filter set is worse than none"
    ).toBeUndefined()
  })

  it("never stores a value that will not serialise", () => {
    const path = "/accounts/rec_1"
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(() => writeSlot(TEAM, path, "tab", loop)).not.toThrow()
    expect(readSlot(TEAM, path, "tab")).toBeUndefined()
  })
})

describe("the trail is the path, and the path knows its section", () => {
  it("reads both URL forms as one section", () => {
    // The whole app is reachable two ways — a clean top-level URL and the
    // team-scoped one — and a memory that treated them as two sections would
    // remember a place and then fail to offer it back.
    expect(sectionOf("/tickets/123")).toBe(sectionOf("/t/team_01/tickets/123"))
    expect(sectionOf("/accounts/CONFIA/apps/A1")).toBe("accounts")
    expect(sectionOf("/t/team_01/members")).toBe("members")
    expect(sectionOf("/home")).toBe("home")
    expect(sectionOf("/t/team_01"), "the team overview").toBe("overview")
  })

  it("remembers the WHOLE nested address, which is the whole breadcrumb", () => {
    rememberPath(TEAM, "/accounts/CONFIA/apps/A1/tickets/T7")
    expect(recallPath(TEAM, "/accounts")).toBe("/accounts/CONFIA/apps/A1/tickets/T7")
  })

  it("keeps two teams apart, so a remembered trail cannot outlive a team switch", () => {
    rememberPath("team_a", "/t/team_a/members/m1")
    rememberPath("team_b", "/t/team_b/members/m2")
    expect(recallPath("team_a", "/t/team_a/members")).toBe("/t/team_a/members/m1")
    expect(recallPath("team_b", "/t/team_b/members")).toBe("/t/team_b/members/m2")
  })
})

describe("clicking a section", () => {
  it("takes her back to where she was", () => {
    rememberPath(TEAM, "/apps/A1/stories/S4")
    expect(sectionClick(TEAM, "/apps", "/tasks")).toBe("/apps/A1/stories/S4")
  })

  it("goes to the top when this session has never been there", () => {
    expect(sectionClick(TEAM, "/apps", "/tasks")).toBe("/apps")
  })

  it("a SECOND click on the section she is already in resets it — Glide's behaviour", () => {
    rememberPath(TEAM, "/apps/A1/stories/S4")
    writeSlot(TEAM, "/apps/A1/stories/S4", "tab", "activity")
    // She is inside Apps, four levels deep, and presses Apps again.
    expect(sectionClick(TEAM, "/apps", "/apps/A1/stories/S4")).toBe("/apps")
    // …and the reset is total: the trail AND the state along it. "Back to the
    // top" would be a half-truth if the list there still held her old search.
    expect(recallPath(TEAM, "/apps")).toBeNull()
    expect(readSlot(TEAM, "/apps/A1/stories/S4", "tab")).toBeUndefined()
  })

  it("recognises 'already here' across both URL forms", () => {
    rememberPath(TEAM, "/t/team_01/tickets/T1")
    // She is at the team-scoped address; the rail's button says `/tickets`.
    expect(sectionClick(TEAM, "/tickets", "/t/team_01/tickets/T1")).toBe("/tickets")
    expect(recallPath(TEAM, "/tickets"), "so the reset actually reset").toBeNull()
  })
})

describe("what the memory must never do", () => {
  it("never rewrites an address somebody named", () => {
    // The ONLY control that consults the memory is a rail section. A deep link
    // pasted from outside arrives in a new document where this store is empty
    // anyway — but even inside one session, asking about a PATH never redirects:
    // `rememberPath` records and returns nothing, and `readSlot` answers about
    // the address it was given. There is no function here that maps a
    // destination to a different destination except `sectionClick`, and that one
    // is only ever wired to the rail (web/components/app-shell.tsx).
    rememberPath(TEAM, "/accounts/CONFIA")
    expect(rememberPath(TEAM, "/accounts/OTHER")).toBeUndefined()
    expect(readSlot(TEAM, "/accounts/OTHER", "tab")).toBeUndefined()
  })

  it("answers 'nothing remembered' rather than throwing, for anything it has not seen", () => {
    expect(recallPath(TEAM, "/never-visited")).toBeNull()
    expect(readSlot(TEAM, "/never-visited", "tab")).toBeUndefined()
    expect(readSlot(null, "", "tab")).toBeUndefined()
    // A miss is always the behaviour from before this existed — the section's
    // own top — and never an error and never a blank screen.
  })

  it("is emptied on sign-out, so one person's places are not handed to the next", () => {
    rememberPath(TEAM, "/accounts/CONFIA")
    writeSlot(TEAM, "/accounts/CONFIA", "tab", "rates")
    forgetEverything()
    expect(navMemoryStats().sections).toBe(0)
  })
})
