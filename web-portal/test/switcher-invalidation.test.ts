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
  // IT USED TO BE A LIST, AND THE LIST WAS THE BUG WAITING TO HAPPEN.
  //
  // `stand()` named nine cache keys one at a time, and every one of them had been
  // added the same way: somebody noticed a screen still showing the previous
  // company's rows under the new company's name. This suite existed to catch the
  // tenth — by re-deriving `cacheKeys` from live-resources.ts and failing on any
  // entry the switcher did not mention.
  //
  // That is the shape R21 has now been bitten by twice: a hand-kept list of what a
  // client can reach, correct until the next screen is added. A switch is a change
  // of WHO IS ASKING, and the honest answer is that NOTHING cached survives it — so
  // the switcher clears the whole cache and there is no list to keep in step. The
  // few keys that were "kept on purpose" (a ticket's thread, a process's comments)
  // were only ever kept because their ids meant the new company would not ask for
  // them; dropping them costs one refetch if somebody switches back.
  //
  // Still read off the source, for the reason the header gives: the bug is an
  // omission, and a render test would pass just as happily on a switcher that
  // dropped nothing at all.
  it("clears the whole cache — not a list of keys somebody has to remember", () => {
    const body = standBody()
    expect(body, "a switch must forget what the old company filled").toContain("clearCache()")
    expect(
      body,
      "and it must not go back to naming keys one by one — the next screen added is the one that gets forgotten"
    ).not.toMatch(/cacheKeys\./)
  })

  it("clears BEFORE it re-reads, or the header names one company over another's rows", () => {
    // `onSwitched()` is the context re-read that repaints the header, this menu's
    // tick and every screen below. Clearing after it would leave the repaint
    // reading the cache it was about to drop.
    const body = standBody()
    const cleared = body.indexOf("clearCache()")
    const reread = body.indexOf("onSwitched()")
    expect(cleared, "the clear must be there at all").toBeGreaterThan(-1)
    expect(reread, "the re-read must be there at all").toBeGreaterThan(-1)
    expect(cleared, "clear, then re-read").toBeLessThan(reread)
  })

  it("nothing else in the portal hand-lists caches across an identity change", () => {
    // The same sentence, at the other two identity boundaries: signing out, and
    // the no-access dead end. Both used to drop only the session key, so a
    // signed-out tab still held every list the previous person had opened.
    for (const file of ["../components/portal-shell.tsx", "../components/no-access.tsx"]) {
      const text = readFileSync(resolve(__dirname, file), "utf8")
      expect(text, `${file} must forget the rows, not just the session`).toContain("clearCache()")
    }
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
