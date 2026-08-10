import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

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
