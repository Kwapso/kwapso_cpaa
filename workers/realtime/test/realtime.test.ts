// The realtime worker's gate + publish contract, tested with fakes (the
// Durable Object itself is exercised live by the staging smoke). Covers: the
// connection gate only admits active team members, and a publish lands as a
// well-formed ping to the team's channel.
import { describe, expect, it } from "vitest"

import { isActiveMember } from "../../../shared/workers/membership"
import { publishChange } from "../../../shared/workers/realtime"

/** A one-row D1 stub: the membership query returns `row` (or null = not a member). */
function fakeDb(row: unknown) {
  return {
    prepare() {
      return {
        bind() {
          return { first: async () => row }
        },
      }
    },
  } as unknown as Parameters<typeof isActiveMember>[0]
}

describe("isActiveMember (WebSocket connection gate)", () => {
  it("admits an active member", async () => {
    expect(await isActiveMember(fakeDb({ 1: 1 }), "U", "T")).toBe(true)
  })
  it("rejects a non-member", async () => {
    expect(await isActiveMember(fakeDb(null), "U", "T")).toBe(false)
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
