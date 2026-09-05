// THE NIGHTLY OPS DIGEST — the one thing that can make it useless is noise.
//
// A digest that names six "new failures" a night for one recurring fault is the
// mail people filter, and a filtered alert is worse than no alert: the estate
// looks watched and is not. That is not a hypothetical. Measured against the
// live staging store on 2026-09-05, the day before this shipped, the last
// twenty-four hours held SEVEN distinct signatures and six of them were the same
// D1 failure wearing six different Cloudflare reference ids — all inside the
// first eighty characters, so a prefix grouping saw six faults.
//
// So the fold is the load-bearing part, and this is what holds it: it must merge
// the ids and it must NOT merge two failures that are genuinely different. Both
// directions, because a fold that is too eager hides the second fault behind the
// first, which is the same blindness arriving from the other side.

import { describe, expect, it } from "vitest"

import { digestHasNews, foldSignature, type OpsDigest } from "../src/lib/ops-alert"

/** The real signatures, copied off `kwapso-core-staging` on 2026-09-05. */
const LIVE = {
  ref1: "content · Error: D1_ERROR: internal error; reference = vf4c1",
  ref2: "content · Error: D1_ERROR: internal error; reference = p333t",
  ref3: "content · Error: D1_ERROR: internal error; reference = oa3pj",
  google: "content · Error: Google couldn't answer that just now. Try again.",
  token: "realtime · cloud_key_rejected: the Cloudflare D1 token was refused (Aut",
  table: "content · Error: D1_ERROR: no such table: sync_leases: SQLITE_ERROR",
  column: "content · Error: D1_ERROR: no such column: spine",
  team: "tenancy · notify/role-changed (team 01KZWXFD86N0K3RZRBHKMKRWYS) failed",
}

describe("one fault is one line", () => {
  it("folds the ids out of a signature", () => {
    // The six that turned one D1 failure into six alerts.
    expect(foldSignature(LIVE.ref1)).toBe(foldSignature(LIVE.ref2))
    expect(foldSignature(LIVE.ref2)).toBe(foldSignature(LIVE.ref3))
    // A ULID in a place string is the same problem: every team's copy of one
    // outage would otherwise be its own headline.
    expect(foldSignature(LIVE.team)).toBe("tenancy · notify/role-changed (team #) failed")
  })

  it("does NOT fold two failures that are genuinely different", () => {
    // The dangerous direction. If these collapse, the second fault of the night
    // is hidden behind the first and nobody is told about it at all.
    const distinct = [LIVE.ref1, LIVE.google, LIVE.token, LIVE.table, LIVE.column, LIVE.team]
    expect(new Set(distinct.map(foldSignature)).size).toBe(distinct.length)
  })

  it("leaves the words a person needs in order to act", () => {
    // `D1_ERROR` and `SQLITE_ERROR` are the two tokens somebody greps for, and a
    // fold aggressive enough to eat them would leave a line nobody can search.
    // They survive because the rule is narrow: four or more characters mixing
    // letters and digits, or two or more digits in a row. "D1" is neither.
    expect(foldSignature(LIVE.table)).toContain("D1_ERROR")
    expect(foldSignature(LIVE.table)).toContain("sync_leases")
    expect(foldSignature(LIVE.column)).toContain("no such column: spine")
    expect(foldSignature(LIVE.google)).toBe(LIVE.google)
  })
})

describe("a quiet night sends nothing at all", () => {
  const empty: OpsDigest = {
    fresh: [],
    spiking: [],
    notShown: 0,
    nearQuota: [],
    moreTeams: 0,
    spend: { turns: 12, input: 400_000, output: 5_000, usd: 0.4, model: "@cf/moonshotai/kimi-k2.6" },
  }

  it("spend alone is not news", () => {
    // A bill that is simply continuing is not a reason to write. If it were, the
    // digest would arrive every single night and be filtered inside a week —
    // and then the night something IS wrong would be filtered with it.
    expect(digestHasNews(empty)).toBe(false)
  })

  it("but a new signature, a spike or a team near its allowance is", () => {
    expect(digestHasNews({ ...empty, fresh: [{ sig: LIVE.column, n: 5 }] })).toBe(true)
    expect(digestHasNews({ ...empty, spiking: [{ sig: LIVE.token, n: 40, was: 2 }] })).toBe(true)
    expect(
      digestHasNews({
        ...empty,
        nearQuota: [{ teamId: "t1", used: 45, allowance: 50, credits: 0 }],
      })
    ).toBe(true)
  })
})
