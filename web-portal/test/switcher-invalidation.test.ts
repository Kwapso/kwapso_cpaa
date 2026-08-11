import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { teamChannelQuery } from "@shared/web/realtime"

// SWITCHING COMPANY MUST SWITCH THE SCREEN, NOT JUST THE SERVER.
//
// `POST /api/tenancy/portal/switch-account` moves where the person stands and
// answers with the new context. The screen, though, reads that context from
// cache — so if the switch does not drop `portal:context`, the server moves and
// the screen does not. The header keeps the old company's name, the tick in
// this menu stays on the old row, and the tickets underneath quietly become the
// NEW company's. A client looking at one company's name above another
// company's work is the exact confusion the one-at-a-time rule exists to
// prevent, and it looks like a leak even though nothing leaked.
//
// Caught by switching in the deployed portal and watching the name not change.
//
// This reads the source because the bug is an omission — a missing line. A
// render test would need the whole cache layer stood up to observe a cache key
// that was never touched, and would pass just as happily on a component that
// invalidated nothing at all.

const SWITCHER = resolve(__dirname, "../components/account-switcher.tsx")

/** The body of `stand()` — everything the switch actually does on success. */
function standBody() {
  const text = readFileSync(SWITCHER, "utf8")
  const start = text.indexOf("switchAccount(accountId)")
  expect(start, "the switcher must call switchAccount").toBeGreaterThan(-1)
  const end = text.indexOf("} catch", start)
  return text.slice(start, end === -1 ? text.length : end)
}

describe("switching company drops what the old company filled", () => {
  it("invalidates the context — which company they stand in, and its name", () => {
    expect(standBody()).toContain("cacheKeys.context")
  })

  it("invalidates the ticket list, its total and its cursor", () => {
    const body = standBody()
    for (const key of ["cacheKeys.tickets", "cacheKeys.ticketsTotal", "cacheKeys.ticketsCursor"]) {
      expect(body, `a switch must drop ${key}`).toContain(key)
    }
  })

  it("drops BOTH companies' records — the one being left and the one being entered", () => {
    const body = standBody()
    // Only dropping the one being left leaves a stale record for a company they
    // switch back to later.
    expect(body).toContain("cacheKeys.company(currentAccountId)")
    expect(body).toContain("cacheKeys.company(accountId)")
  })

  it("every cache the portal keeps is either dropped here or deliberately kept", () => {
    // A new cache key added later is the way this regresses: someone adds
    // `portal:invoices`, never thinks about the switcher, and a client sees
    // another company's invoices under their own name. This test fails when a
    // key is added without a decision.
    const file = readFileSync(resolve(__dirname, "../lib/live-resources.ts"), "utf8")
    // Only the cacheKeys object. The same file also declares PORTAL_LISTENERS,
    // whose entries are RESOURCE names (help, accounts, …) at the same
    // indentation — reading those as cache keys makes this test fail for a
    // reason that has nothing to do with the switcher.
    const from = file.indexOf("export const cacheKeys")
    expect(from, "cacheKeys must be declared in live-resources").toBeGreaterThan(-1)
    const block = file.slice(from, file.indexOf("\n}", from))
    const declared = [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
    expect(declared.length, "cacheKeys must be readable from live-resources").toBeGreaterThan(4)

    const body = standBody()
    // `thread` and `threadTotal` are per-ticket and keyed by a ticket id the new
    // company's screens will never ask for; they age out rather than being
    // enumerated. Everything else must be named.
    const keptOnPurpose = new Set(["thread", "threadTotal"])
    const missed = declared.filter((k) => !keptOnPurpose.has(k) && !body.includes(`cacheKeys.${k}`))
    expect(missed, `these caches survive a company switch with nobody deciding they should: ${missed.join(", ")}`).toEqual([])
  })
})

// AND SWITCHING COMPANY MUST SWITCH THE LIVE SOCKET.
//
// Dropping the caches fixes what the screen SHOWS the moment you switch. It does
// nothing about what arrives afterwards, and that half was broken in a way you
// could not see: the realtime worker resolves the listener's account fence ONCE,
// at the handshake, and serializes it onto the socket so no ping costs a database
// read. The client re-opened only when `teamId` changed — and a company switch
// does not change the team. So the socket kept filtering the NEW company's pings
// against the OLD company's account set, and the portal went silently deaf. Not
// broken: silent. Nothing on screen says a live update never came.
//
// The fix is that the fence is part of the socket's IDENTITY, so a fence that
// moves is a different socket.
describe("the live socket is keyed on where the person is standing", () => {
  it("carries the current account, so a switch is a different URL", () => {
    const before = teamChannelQuery("T1", "A_ONE")
    const after = teamChannelQuery("T1", "A_TWO")
    // Presence first: two nulls would be "equal" in the wrong direction, and a
    // query that dropped the fence entirely would compare identical here.
    expect(before, "the fence must reach the URL").toContain("A_ONE")
    expect(after).toContain("A_TWO")
    expect(before, "same team, different company = a NEW socket").not.toBe(after)
  })

  it("still names the team, and stays quiet when there is no team", () => {
    expect(teamChannelQuery("T1", "A_ONE")).toContain("team=T1")
    expect(teamChannelQuery(null, "A_ONE"), "no team = no socket").toBeNull()
  })

  it("staff, who have no fence, get the URL they always had", () => {
    // The agency app has no account fence (the stamp is null server-side), so
    // adding this must not churn its socket or change its shape.
    expect(teamChannelQuery("T1")).toBe("team=T1")
    expect(teamChannelQuery("T1", null)).toBe("team=T1")
  })

  it("the portal shell actually passes it", () => {
    // The seam being right is worthless if the one caller that needs it doesn't
    // use it. Read the shell: the fence argument must be the account id it
    // already computes for the ping handlers, not a fresh guess.
    const shell = readFileSync(resolve(__dirname, "../components/portal-shell.tsx"), "utf8")
    const at = shell.indexOf("useRealtime(")
    expect(at, "the shell must open the team channel").toBeGreaterThan(-1)
    const call = shell.slice(at, shell.indexOf("\n  )", at))
    expect(call, "the socket must carry the current account as its fence key").toMatch(
      /\n\s*accountId\s*,?\s*$/
    )
  })
})
