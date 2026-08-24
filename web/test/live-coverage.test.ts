// WHAT THE SOCKET IS ALLOWED TO VOUCH FOR.
//
// `useCached` may now paint from cache without re-asking the server, but only
// for a key the live layer demonstrably moves, and only while the team socket
// has been connected continuously since that value was written
// (shared/web/store.ts `liveHasWatchedSince`). That removes the redundant
// refetch on every navigation — the reason a screen the app already had in
// memory still waited on the network.
//
// The failure mode is asymmetric and that is the whole point of this file.
// Under-claiming costs a request nobody notices. OVER-claiming paints a value
// that nothing will ever correct: not a broken screen, a quietly wrong one,
// which is the worst thing the live layer can do. So these tests push on the
// over-claiming side — a key nothing pings must not be covered, and the set must
// be DERIVED from the registry rather than typed, so a resource added tomorrow
// is covered without anybody remembering this exists.

import { describe, expect, it } from "vitest"

import {
  SIMPLE_INVALIDATIONS,
  TEAM_RESOURCES,
  liveCoveredKeys,
  helpKey,
  accountsKey,
} from "@/lib/live-resources"

const TEAM = "team_01JABCDEF"

describe("liveCoveredKeys — derived from the registry, never listed", () => {
  it("covers every TEAM_RESOURCES collection key", () => {
    const covered = liveCoveredKeys(TEAM)
    const resources = Object.entries(TEAM_RESOURCES)
    expect(resources.length, "the resource registry is empty — this has gone blind").toBeGreaterThan(10)
    for (const [name, r] of resources)
      expect(covered.has(r.key(TEAM)), `${name}'s list key must be covered`).toBe(true)
  })

  it("covers every SIMPLE_INVALIDATIONS target", () => {
    const covered = liveCoveredKeys(TEAM)
    for (const [name, simple] of Object.entries(SIMPLE_INVALIDATIONS))
      for (const k of simple(TEAM))
        expect(covered.has(k), `${name} invalidates ${k}, so ${k} must be covered`).toBe(true)
  })

  it("covers the team feed that any change refreshes", () => {
    // app-shell invalidates this on EVERY ping, so it is as live as anything is.
    expect(liveCoveredKeys(TEAM).has(`activity:team:${TEAM}`)).toBe(true)
  })

  it("does NOT cover a key nothing pings", () => {
    const covered = liveCoveredKeys(TEAM)
    // A made-up key, and two real shapes that are deliberately left out: a
    // record-scoped slice and a paging sidecar are parameterised by a row id
    // this function never sees, so they keep revalidating as they always did.
    expect(covered.has(`nothing:listens:${TEAM}`)).toBe(false)
    expect(covered.has("activity:record:help:H1")).toBe(false)
    expect(covered.has("total:help:H1")).toBe(false)
  })

  it("is scoped to ONE team — another team's keys are not covered", () => {
    // A team switch closes the socket and re-registers; a set that leaked across
    // teams would paint the previous team's rows and never correct them.
    const covered = liveCoveredKeys(TEAM)
    expect(covered.has(helpKey("team_OTHER", "all"))).toBe(false)
    expect(covered.has(accountsKey("team_OTHER"))).toBe(false)
  })

  it("names real keys, not a wildcard", () => {
    const covered = liveCoveredKeys(TEAM)
    // Every entry must mention the team it was built for. A key that does not is
    // either global (and cannot be team-scoped-safe) or a bug in the derivation.
    for (const k of covered)
      expect(k.includes(TEAM), `covered key "${k}" is not scoped to the team`).toBe(true)
  })
})
