// A TRANSCRIPT TRY THAT THROWS IS NOT A TRANSCRIPT THAT ISN'T THERE YET.
//
// The autopilot retries every un-captured meeting inside the horizon each tick.
// That is the right behaviour for "Google quietly has nothing yet" — the retry
// is free. It was also the behaviour for "Google refuses this meeting on every
// try", which is not free: twelve stuck meetings wrote ~550 identical
// google_refused rows into the error log in twelve hours, every fifteen
// minutes, with nothing that would ever stop them (round-one error_log review,
// 26 Aug 2026 — 199 of the 200 open error rows were this one storm).
//
// The mechanism is a per-meeting counter of THROWN tries only, and the sweep's
// own WHERE stops selecting a meeting past the cap. These assertions read the
// sweep's source because the selection predicate IS the invariant — the same
// style as the publish/gating seams.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { TRANSCRIPT_ATTEMPT_CAP } from "@shared/workers/limits"
import { TEAM_MIGRATIONS } from "../../tenancy/src/team-schema"

const SRC = readFileSync(join(__dirname, "..", "src", "lib", "google-autopilot.ts"), "utf8")

describe("a stuck transcript stops being retried", () => {
  it("the sweep's own SELECT refuses a meeting past the attempt cap", () => {
    const select = SRC.slice(SRC.indexOf("SELECT id FROM meetings"))
    expect(select).toContain("transcript_attempts < ${TRANSCRIPT_ATTEMPT_CAP}")
    // Beside, not instead of, the horizon — the two bounds answer different
    // questions ("too old to matter" vs "refused too often to keep asking").
    expect(select.slice(0, select.indexOf("LIMIT"))).toContain("starts_at >= ?")
  })

  it("only a THROWN try counts — the increment lives in the catch", () => {
    const at = SRC.indexOf("transcript_attempts = transcript_attempts + 1")
    expect(at, "the counter write is gone — the storm can come back").toBeGreaterThan(-1)
    // The increment sits inside the per-meeting catch (after the errors.push),
    // so a quiet not-captured result never spends an attempt.
    const before = SRC.slice(0, at)
    const lastCatch = before.lastIndexOf("catch (e)")
    const lastPush = before.lastIndexOf("errors.push({ userId, where: `transcript")
    expect(lastCatch, "the increment must live in the transcript catch").toBeGreaterThan(-1)
    expect(lastPush, "…after the failure is recorded (R12)").toBeGreaterThan(lastCatch)
  })

  it("the column ships as a migration and the cap is a real bound", () => {
    const m = TEAM_MIGRATIONS.find((x) => x.version === "0055_transcript_gives_up")
    expect(m, "migration 0055_transcript_gives_up is missing").toBeTruthy()
    expect(m!.sql).toContain("ALTER TABLE meetings ADD COLUMN transcript_attempts")
    // Eight is two hours of fifteen-minute refusals; zero or a huge value would
    // each quietly disable one half of the design.
    expect(TRANSCRIPT_ATTEMPT_CAP).toBeGreaterThanOrEqual(2)
    expect(TRANSCRIPT_ATTEMPT_CAP).toBeLessThanOrEqual(96)
  })
})
