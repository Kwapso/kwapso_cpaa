// The realtime worker's gate, its FENCE, and its publish contract, tested with
// fakes (the Durable Object itself is exercised live by the staging smoke).
//
// The fence is the interesting half. Membership answers "may you be on this
// channel?" — it does not answer "may you hear about THAT row?". A client-portal
// login IS a member of the agency's team (that is how their requests reach any
// door), so gating on membership alone put them on a channel that named, by row
// id, every account in the agency as it changed. Row ids are not decoration:
// they are what made the activity-feed leak reachable, which is why the fence
// file says in as many words that the live channel broadcasts them.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  mayHearChange,
  scopeStamp,
  type AccountScope,
} from "../../../shared/workers/account-scope"
import { publishChange } from "../../../shared/workers/realtime"

/** A client login standing in Bergman, whose fence reaches its subsidiary. */
const portal: AccountScope = {
  kind: "portal",
  personAccountId: "PERSON",
  appRestriction: null,
  roots: ["BERGMAN"],
  currentAccountId: "BERGMAN",
  accountIds: ["BERGMAN", "BERGMAN_SUB", "PERSON"],
}

describe("scopeStamp (what a socket carries)", () => {
  it("staff carry nothing — the agency side hears its whole team, unchanged", () => {
    expect(scopeStamp({ kind: "staff" })).toBeNull()
  })

  it("a client login carries the account set it is standing in", () => {
    expect(scopeStamp(portal)).toEqual({ accountIds: ["BERGMAN", "BERGMAN_SUB", "PERSON"] })
  })

  it("a revoked login carries an EMPTY fence, not a missing one", () => {
    // Fail-closed direction: no accounts means it hears nothing. If a revoked
    // grant produced `null` instead, the socket would read as STAFF and hear the
    // whole agency — the exact inversion the guard corridor is built to refuse.
    const revoked: AccountScope = { ...portal, roots: [], currentAccountId: null, accountIds: [] }
    expect(scopeStamp(revoked)).toEqual({ accountIds: [] })
  })
})

describe("mayHearChange (the fence, applied to a live ping)", () => {
  const staff = scopeStamp({ kind: "staff" })
  const client = scopeStamp(portal)

  it("staff hear every ping on their team's channel", () => {
    for (const resource of ["members", "member_roles", "invites", "help", "accounts"])
      expect(mayHearChange(staff, { resource, id: "ANY" }), resource).toBe(true)
  })

  it("a client login hears its OWN accounts change", () => {
    expect(mayHearChange(client, { resource: "accounts", id: "BERGMAN" })).toBe(true)
    // …and everything nested beneath the company they're standing in.
    expect(mayHearChange(client, { resource: "accounts", id: "BERGMAN_SUB" })).toBe(true)
    // A contact and a login are published against the ACCOUNT they hang off.
    expect(mayHearChange(client, { resource: "account_links", id: "BERGMAN" })).toBe(true)
    expect(mayHearChange(client, { resource: "portal_users", id: "BERGMAN" })).toBe(true)
  })

  it("a client login NEVER hears another client's row ids", () => {
    for (const resource of ["accounts", "account_links", "portal_users"])
      expect(mayHearChange(client, { resource, id: "DELAVAL" }), resource).toBe(false)
  })

  it("a client login hears none of the agency's own world", () => {
    // They have no screen in this app that reads any of it, so a ping is pure
    // exposure — an id to try against every door, plus who-is-busy-when.
    // `help` belongs here TOO, by row id: a ticket id says nothing about whose
    // ticket it is, so an unstamped help ping is still silence.
    for (const resource of ["members", "member_roles", "invites", "learning", "help", "team"])
      expect(mayHearChange(client, { resource, id: "ROW1" }), resource).toBe(false)
  })

  // THE ONE THING A CLIENT HEARS THAT IS NOT AN ACCOUNT ROW. Their company's
  // support questions — because the owner ruled that a contact sees their
  // company's world, and a support screen that cannot hear a colleague's
  // question appear is one that lies until you reload it. The ping cannot be
  // checked by its row id (a ticket id is not an account), so the publisher
  // NAMES the account and the fence reads that field and nothing else.
  it("a client login hears their own company's tickets — by the account, never the row id", () => {
    for (const resource of ["help", "help_threads"]) {
      // Theirs: the company they stand in, or anything nested beneath it.
      expect(mayHearChange(client, { resource, id: "H_1", scope: "BERGMAN" }), resource).toBe(true)
      expect(mayHearChange(client, { resource, id: "H_1", scope: "BERGMAN_SUB" }), resource).toBe(true)
      // Another client's company: silence, even though the resource is one they
      // are allowed to hear about in general.
      expect(mayHearChange(client, { resource, id: "H_1", scope: "DELAVAL" }), resource).toBe(false)
      // No account named = nothing to check = silence. A publisher that forgets
      // the stamp makes a screen stale; a fence that guessed would make it a leak.
      expect(mayHearChange(client, { resource, id: "H_1" }), resource).toBe(false)
      // And the row id is NEVER what decides it — an id that happens to equal an
      // account in their fence must not smuggle a ticket through.
      expect(mayHearChange(client, { resource, id: "BERGMAN" }), resource).toBe(false)
    }
  })

  it("a scope stamp does not open a resource the client has no business hearing", () => {
    // The stamp is not a skeleton key: naming an account they stand in does not
    // make the agency's members or articles theirs to hear about.
    for (const resource of ["members", "member_roles", "learning", "invites"])
      expect(mayHearChange(client, { resource, id: "ROW1", scope: "BERGMAN" }), resource).toBe(false)
  })

  it("an account ping with no id is not heard by a fenced listener", () => {
    // Nothing to check against the fence = not provably theirs = silence.
    expect(mayHearChange(client, { resource: "accounts" })).toBe(false)
    expect(mayHearChange(staff, { resource: "accounts" })).toBe(true)
  })

  it("a revoked login hears nothing at all", () => {
    const gone = scopeStamp({ ...portal, roots: [], currentAccountId: null, accountIds: [] })
    expect(mayHearChange(gone, { resource: "accounts", id: "BERGMAN" })).toBe(false)
  })
})

describe("the worker actually applies that fence", () => {
  // The DO can't be instantiated here (it extends cloudflare:workers), so the
  // wiring is read off disk — the same trick the publish/gating seam guards use.
  // Without these, the predicate above could be perfect and never called.
  const src = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")

  it("gates the team channel with the API's own membership check", () => {
    expect(src).toMatch(/requireMember\(env, user\.id, teamId\)/)
  })

  it("resolves the caller's fence through the ONE guard corridor and stamps the socket", () => {
    expect(src).toMatch(/scopeStamp\(await accountScope\(/)
    expect(src).toContain("serializeAttachment")
  })

  it("never lets a CALLER'S header become the fence", () => {
    // The stamp is resolved from the session. An inbound x-listener-scope is
    // overwritten for a client login and deleted for staff — never forwarded.
    expect(src).toMatch(/headers\.delete\(SCOPE_HEADER\)/)
  })

  it("broadcast asks mayHearChange before sending to a stamped socket", () => {
    expect(src).toMatch(/mayHearChange\(/)
    // The stamp is read per socket, not once per channel.
    expect(src).toMatch(/deserializeAttachment\(\)/)
  })

  it("fails CLOSED when the fence can't be resolved", () => {
    // No token / a failed read means we cannot tell staff from a client login.
    // Nobody joins the TEAM channel until we can.
    expect(src).toMatch(/live_unavailable/)
    expect(src).toMatch(/return fail\(503/)
  })
})

describe("publishChange (the change ping)", () => {
  it("posts a team-scoped, data-free event to /publish", async () => {
    const calls: { url: string; body: unknown; key?: string }[] = []
    const env = {
      REALTIME: {
        fetch: async (url: string, init: { body: string; headers: Record<string, string> }) => {
          calls.push({ url, body: JSON.parse(init.body), key: init.headers["x-internal-key"] })
          return new Response(null)
        },
      },
      INTERNAL_KEY: "shhh",
    } as unknown as Parameters<typeof publishChange>[0]

    await publishChange(env, "TEAM1", "members")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain("/publish")
    expect(calls[0].body).toEqual({
      channel: "team:TEAM1",
      event: { resource: "members" },
    })
    // /publish can reach ANY channel, so the caller must present the internal
    // key. Without this assertion the header could silently stop being sent and
    // every publish would 403 in production while the tests stayed green.
    expect(calls[0].key, "the publish must carry the internal key").toBe("shhh")
  })

  it("includes a row id when given (so a specific open record can refresh)", async () => {
    const calls: { body: unknown }[] = []
    const env = {
      REALTIME: {
        fetch: async (_url: string, init: { body: string }) => {
          calls.push({ body: JSON.parse(init.body) })
          return new Response(null)
        },
      },
      INTERNAL_KEY: "shhh",
    } as unknown as Parameters<typeof publishChange>[0]
    await publishChange(env, "T", "member_roles", "ROLE9")
    expect(calls[0].body).toEqual({
      channel: "team:T",
      event: { resource: "member_roles", id: "ROLE9" },
    })
  })

  it("never throws — a live-layer hiccup can't break the write it describes", async () => {
    const env = {
      REALTIME: {
        fetch: async () => {
          throw new Error("realtime down")
        },
      },
      INTERNAL_KEY: "shhh",
    } as unknown as Parameters<typeof publishChange>[0]
    await expect(publishChange(env, "T", "members")).resolves.toBeUndefined()
  })
})
