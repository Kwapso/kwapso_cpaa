// A BOUNDED CRON MUST STILL REACH EVERY TENANT.
//
// Both of this worker's crons read the teams they work on as
// `ORDER BY id LIMIT CRON_TEAM_CAP`, and both said, in a comment, that the rest
// "wait for the next tick". They did not. The order never changed and neither did
// the window, so the same 200 teams were swept and mailed on every fire and every
// team past the 200th got nothing — not late, NEVER. Team ids are ULIDs, so "the
// first 200 by id" is "the 200 oldest": the newest tenants were the starved ones,
// silently, which is the worst direction for it to fail in.
//
// The bound was right and the window was wrong. These lock both halves: the work
// per tick is still capped, AND consecutive ticks cover the whole estate.

import { describe, expect, it } from "vitest"

import { CRON_TEAM_CAP } from "@shared/workers/limits"
import { teamSlice } from "../src/index"
import type { Env } from "../src/env"

const EVERY_MS = 15 * 60 * 1000

/** A core database holding `total` ready teams, ids ordered like ULIDs are. */
function coreWith(total: number): Env {
  const ids = Array.from({ length: total }, (_, i) => `T${String(i).padStart(6, "0")}`)
  return {
    DB: {
      prepare(sql: string) {
        return {
          async first() {
            return { n: total }
          },
          async all() {
            // The real statement carries its window as literals, so the stub reads
            // them back out rather than being told — a slice that stopped putting
            // an OFFSET in the SQL would return page one here and fail below.
            const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? total)
            const offset = Number(/OFFSET (\d+)/.exec(sql)?.[1] ?? 0)
            return {
              results: ids
                .slice(offset, offset + limit)
                .map((id) => ({ id, database_id: `db-${id}` })),
            }
          },
        }
      },
    },
  } as unknown as Env
}

describe("the tick's team window is bounded AND it moves", () => {
  it("does at most CRON_TEAM_CAP teams in one tick", async () => {
    const slice = await teamSlice(coreWith(CRON_TEAM_CAP * 3), 0, EVERY_MS, "test")
    expect(slice.length, "a cron that would run for an hour gets killed halfway").toBe(CRON_TEAM_CAP)
  })

  it("an estate that fits in one window is answered whole, every time", async () => {
    const core = coreWith(CRON_TEAM_CAP - 1)
    // The overwhelmingly common case: no rotation, no arithmetic, same answer on
    // every tick. Two different tick times must agree.
    const first = await teamSlice(core, 0, EVERY_MS, "test")
    const later = await teamSlice(core, 99 * EVERY_MS, EVERY_MS, "test")
    expect(first.map((t) => t.id)).toEqual(later.map((t) => t.id))
    expect(first.length).toBe(CRON_TEAM_CAP - 1)
  })

  it("consecutive ticks cover EVERY team — the whole finding, in one assertion", async () => {
    const total = CRON_TEAM_CAP * 3 + 7 // four windows, the last one short
    const core = coreWith(total)
    const seen = new Set<string>()
    // One lap: ceil(total / cap) ticks. Nothing outside a lap is needed, which is
    // the property "it can only be late" rests on.
    const windows = Math.ceil(total / CRON_TEAM_CAP)
    for (let tick = 0; tick < windows; tick++)
      for (const team of await teamSlice(core, tick * EVERY_MS, EVERY_MS, "test")) seen.add(team.id)
    expect(seen.size, `${total} teams must all be visited within ${windows} ticks`).toBe(total)
  })

  it("the window is a function of the TICK, so a re-run does the same teams", async () => {
    // Determinism matters for two reasons: a re-fired tick must not skip a window,
    // and nothing here may depend on Date.now() — a slice that read the clock
    // instead of `scheduledTime` would drift against the cron that fires it.
    const core = coreWith(CRON_TEAM_CAP * 2)
    const a = await teamSlice(core, 7 * EVERY_MS, EVERY_MS, "test")
    const b = await teamSlice(core, 7 * EVERY_MS, EVERY_MS, "test")
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id))
    const next = await teamSlice(core, 8 * EVERY_MS, EVERY_MS, "test")
    expect(next.map((t) => t.id), "and the next tick is a DIFFERENT window").not.toEqual(
      a.map((t) => t.id)
    )
  })

  it("an empty estate asks for nothing", async () => {
    expect(await teamSlice(coreWith(0), 0, EVERY_MS, "test")).toEqual([])
  })
})
