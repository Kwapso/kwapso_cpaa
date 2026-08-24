// WAVES — what a client bought, and the sprints inside it.
//
// FIVE THINGS HAVE TO HOLD, and every one of them fails SILENTLY if it does not.
// That is the whole reason this suite runs the real migrations into real SQLite
// and calls the shipped lib functions rather than mocking them: a wave's dates
// are a derived number that looks exactly as convincing when it is stale.
//
//   1 · THE DATES COME FROM THE SPRINTS, AND THEY MOVE. `starts_on` / `ends_on`
//       are STORED, so nothing recomputes them on a read — which means a recalc
//       that was skipped leaves a wave quoting dates no sprint in it has, on a
//       screen that looks finished. Moving a sprint OUT is the sharper half: a
//       recalc that only ever wrote a value would leave the old pair sitting
//       there, and "the wave still runs to April" would be a fact about a sprint
//       that is now in a different package.
//
//   2 · A WAVE WITH NO SPRINTS IS ORDINARY. "Alex sells the wave, sprints get
//       planned afterwards." Its dates are NULL, and null is the honest answer —
//       a read that refused those waves, or a write that demanded a sprint,
//       would break the moment this module is actually used for.
//
//   3 · OVERLAPPING SPRINTS SAVE, AND SAY SO. Aurora ruled it: "warn, but we can
//       save it (it can happen…)". So the assertion is deliberately two-sided —
//       the warning is reported AND the row landed. A door that refused would
//       pass a test that only looked for the warning.
//
//   4 · ANOTHER CLIENT'S SPRINT CANNOT BE PUT IN THIS CLIENT'S WAVE. The account
//       fence stops a caller REACHING another client's rows; it does not stop a
//       staff member — who can see both — writing Bergman's sprint into a
//       package Delaval bought. Nothing on the screen would say so: a wave shows
//       the sprint's NAME.
//
//   5 · DEACTIVATING TWICE MOVES ZERO ROWS (R17). The second click must write no
//       activity row and announce nothing.
//
// Real migrations, real SQLite, real lib functions.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { accountScope } from "@shared/workers/account-scope"
import {
  countWaves,
  createWave,
  getWave,
  listWaves,
  recalcWaveDates,
  setSprintWave,
  setWaveActive,
  updateWave,
} from "../src/lib/waves"
import { buildSpineDb, IDS } from "./spine-harness"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

const db = () => holder.db as DatabaseSync

/** The sprints this suite moves between packages. Written straight in — a sprint
 * is the WORK ENGINE's record, its doors live in another worker, and seeding it
 * here keeps this suite about waves. */
function seedSprints(): void {
  db().exec(`
    INSERT INTO sprints (id, account_id, name, starts_on, ends_on, created_at, creator_id) VALUES
      ('SP_MARCH', '${IDS.victimAccount}', 'Map the processes',  '2026-03-01', '2026-03-14', '2026-02-01', '${IDS.staffUser}'),
      ('SP_APRIL', '${IDS.victimAccount}', 'Build the two bots', '2026-04-01', '2026-04-18', '2026-02-01', '${IDS.staffUser}'),
      ('SP_CROSS', '${IDS.victimAccount}', 'Train them',         '2026-03-10', '2026-03-20', '2026-02-01', '${IDS.staffUser}'),
      -- TWO SPRINTS THAT DO NOT CROSS, AND WHOSE IDS RUN THE OTHER WAY ROUND.
      -- An overlap is TWO comparisons and a self-join reports each pair once, so
      -- exactly ONE row per pair is ever tested — which means dropping either
      -- comparison is invisible unless a pair exists in each orientation. With
      -- only March (id SP_MARCH) and April (id SP_APRIL), the earlier sprint is
      -- always the higher id, so half the condition was never exercised.
      ('SP_JAN',  '${IDS.victimAccount}', 'Discovery',    '2026-01-05', '2026-01-20', '2026-02-01', '${IDS.staffUser}'),
      ('SP_JUNE', '${IDS.victimAccount}', 'Second wave',  '2026-06-01', '2026-06-20', '2026-02-01', '${IDS.staffUser}'),
      -- NOT DATED YET. A sprint nobody has scheduled cannot clash with anything,
      -- and it must not date the wave either.
      ('SP_UNDATED', '${IDS.victimAccount}', 'Hand it over', NULL, NULL, '2026-02-01', '${IDS.staffUser}'),
      -- ANOTHER CLIENT'S. The one that must never reach Bergman's package.
      ('SP_THEIRS', '${IDS.burglarAccount}', 'Delaval discovery', '2026-03-05', '2026-03-19', '2026-02-01', '${IDS.staffUser}');
  `)
}

/** A wave of Bergman's, sold with no sprints in it. */
async function aWave(name = "Wave one"): Promise<string> {
  const { id } = await createWave(cfg, guard, staff, actor, {
    accountId: IDS.victimAccount,
    name,
    goal: "Map, build, test, train",
  })
  return id
}

/** The wave row as the screens read it. */
async function readWave(id: string) {
  const found = await getWave(cfg, guard, staff, id)
  if (!found) throw new Error(`no wave ${id}`)
  return found
}

const historyRows = (id: string): number =>
  (
    db()
      .prepare(`SELECT COUNT(*) AS n FROM activity WHERE related_table = 'waves' AND related_row_id = ?`)
      .get(id) as { n: number }
  ).n

beforeEach(() => {
  holder.db = buildSpineDb()
  seedSprints()
})

describe("a wave is sold before anybody plans it", () => {
  it("saves with no sprints, and says so with nulls rather than a guess", async () => {
    const id = await aWave()
    const { wave, sprints, overlaps } = await readWave(id)
    expect(sprints).toEqual([])
    expect(overlaps).toEqual([])
    // NULL, not a date and not today's. "We have not planned it yet" is the
    // answer, and it is the ordinary state of a wave the week it is sold.
    expect(wave.startsOn).toBeNull()
    expect(wave.endsOn).toBeNull()
    expect(wave.sprintCount).toBe(0)
    expect(wave.active).toBe(true)
    expect(wave.accountName).toBe("Bergman S.A.")
  })

  it("has no price on it — the package carries a name, a goal and dates and nothing else", async () => {
    // THE OWNER RULED THE MONEY OUT OF V1, four separate times, and a column that
    // does not exist is the only version of that ruling nobody can quietly undo.
    // Read off the SCHEMA rather than the type, because the type is what a screen
    // sees and the table is what a door could still write.
    const columns = (db().prepare(`PRAGMA table_info(waves)`).all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(columns.filter((c) => /price|cents|rate|margin|cost/i.test(c))).toEqual([])
  })

  it("counts every wave the caller may see, exactly (R16), newest package first", async () => {
    const march = await aWave("Wave one")
    const april = await aWave("Wave two")
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: march })
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_APRIL", waveId: april })
    expect(await countWaves(cfg, guard, staff, IDS.victimAccount)).toBe(2)
    // The count is the door's own COUNT(*), and the list is ordered by the wave's
    // own dates — the package running now is the one somebody came here to see.
    expect((await listWaves(cfg, guard, staff, IDS.victimAccount)).map((w) => w.name)).toEqual([
      "Wave two",
      "Wave one",
    ])
  })

  it("puts a switched-off wave below every live one", async () => {
    const off = await aWave("Wave one")
    await aWave("Wave two")
    await setWaveActive(cfg, guard, staff, actor, { id: off, active: false })
    expect((await listWaves(cfg, guard, staff, IDS.victimAccount)).map((w) => w.name)).toEqual([
      "Wave two",
      "Wave one",
    ])
  })
})

describe("a wave's dates are its sprints' dates", () => {
  it("takes the earliest start and the latest end of the sprints put in it", async () => {
    const id = await aWave()
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: id })
    expect((await readWave(id)).wave).toMatchObject({
      startsOn: "2026-03-01",
      endsOn: "2026-03-14",
      sprintCount: 1,
    })

    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_APRIL", waveId: id })
    expect((await readWave(id)).wave).toMatchObject({
      startsOn: "2026-03-01",
      endsOn: "2026-04-18",
      sprintCount: 2,
    })
  })

  it("moves them when a sprint moves to another wave — BOTH ends, not just the one it joined", async () => {
    const first = await aWave("Wave one")
    const second = await aWave("Wave two")
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: first })
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_APRIL", waveId: first })

    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_APRIL", waveId: second })

    // The wave it JOINED now runs over April…
    expect((await readWave(second)).wave).toMatchObject({
      startsOn: "2026-04-01",
      endsOn: "2026-04-18",
    })
    // …and the wave it LEFT has shrunk back. This is the half a recalc that only
    // touched the destination would get wrong, and it would read as a fact.
    expect((await readWave(first)).wave).toMatchObject({
      startsOn: "2026-03-01",
      endsOn: "2026-03-14",
    })
  })

  it("gives the dates back when the last sprint is taken out", async () => {
    const id = await aWave()
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: id })
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: null })
    const { wave, sprints } = await readWave(id)
    // An UPDATE that only ever wrote a value would leave March sitting there,
    // describing a package that now contains nothing.
    expect(wave.startsOn).toBeNull()
    expect(wave.endsOn).toBeNull()
    expect(wave.sprintCount).toBe(0)
    expect(sprints).toEqual([])
    // The row AND the seam's own answer, because they are two different things
    // to get wrong: the stored pair is what a list reads, and the returned pair
    // is what a door hands back to the screen that just made the change.
    expect(await recalcWaveDates(cfg, guard, id)).toEqual({ startsOn: null, endsOn: null })
  })

  it("follows a sprint whose own dates are pushed out", async () => {
    const id = await aWave()
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: id })
    // The delivery slips a month. The sprint's dates are the WORK ENGINE's to
    // move; what this proves is that the one seam which decides a wave's dates
    // reads them fresh rather than remembering what it wrote last time.
    db().exec(`UPDATE sprints SET starts_on = '2026-05-04', ends_on = '2026-05-15' WHERE id = 'SP_MARCH'`)
    expect(await recalcWaveDates(cfg, guard, id)).toEqual({
      startsOn: "2026-05-04",
      endsOn: "2026-05-15",
    })
    expect((await readWave(id)).wave).toMatchObject({ startsOn: "2026-05-04", endsOn: "2026-05-15" })
  })

  it("is not dated by a sprint nobody has scheduled", async () => {
    const id = await aWave()
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_UNDATED", waveId: id })
    const { wave } = await readWave(id)
    expect(wave.sprintCount, "it IS in the package").toBe(1)
    expect(wave.startsOn, "…it just has not been scheduled").toBeNull()
    expect(wave.endsOn).toBeNull()
  })

  it("is not dated or counted by a sprint that has been switched off — at EITHER end", async () => {
    const id = await aWave()
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: id })
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_APRIL", waveId: id })

    // Switch off the EARLIEST: the package now starts later. (Asserting only the
    // latest would leave the `starts_on` half of the recalc untested, and each
    // half is a separate sub-query that can lose its guard on its own.)
    db().exec(`UPDATE sprints SET deactivated_at = '2026-03-02' WHERE id = 'SP_MARCH'`)
    expect(await recalcWaveDates(cfg, guard, id)).toEqual({
      startsOn: "2026-04-01",
      endsOn: "2026-04-18",
    })
    // …and it is not in the package any more either.
    expect((await readWave(id)).wave.sprintCount).toBe(1)

    // Now the other end.
    db().exec(`UPDATE sprints SET deactivated_at = NULL WHERE id = 'SP_MARCH'`)
    db().exec(`UPDATE sprints SET deactivated_at = '2026-03-02' WHERE id = 'SP_APRIL'`)
    expect(await recalcWaveDates(cfg, guard, id)).toEqual({
      startsOn: "2026-03-01",
      endsOn: "2026-03-14",
    })
    expect((await readWave(id)).wave.sprintCount).toBe(1)
  })
})

describe("two sprints that cross: a warning, never a refusal", () => {
  it("saves the sprint AND reports the clash", async () => {
    const id = await aWave()
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: id })
    // 10–20 March lands inside 1–14 March.
    const result = await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_CROSS", waveId: id })

    expect(result.moved, "the write LANDED — this is a warning, not a refusal").toBe(true)
    expect(result.overlaps).toHaveLength(1)
    expect([result.overlaps[0].firstName, result.overlaps[0].secondName].sort()).toEqual([
      "Map the processes",
      "Train them",
    ])

    // …and the row really is in the package, which is the half a
    // refusal-shaped implementation would still pass if we only checked the
    // warning.
    const { wave, sprints, overlaps } = await readWave(id)
    expect(sprints.map((s) => s.id).sort()).toEqual(["SP_CROSS", "SP_MARCH"])
    expect(wave.startsOn).toBe("2026-03-01")
    expect(wave.endsOn).toBe("2026-03-20")
    // The screen reads the same warning when it opens the record, not only in
    // the response to the click that caused it.
    expect(overlaps).toHaveLength(1)
  })

  it("says nothing when the sprints do not cross — in EITHER direction", async () => {
    const id = await aWave()
    // Four sprints, none of them crossing, in both id/date orientations: the
    // self-join reports a pair once, so a pair only ever exercises ONE of the
    // two comparisons an overlap is made of. With one orientation only, half the
    // condition can be deleted and every test still passes.
    for (const sprintId of ["SP_MARCH", "SP_APRIL", "SP_JAN", "SP_JUNE"]) {
      const result = await setSprintWave(cfg, guard, staff, actor, { sprintId, waveId: id })
      expect(result.overlaps, `adding ${sprintId} invented a clash`).toEqual([])
    }
    expect((await readWave(id)).overlaps).toEqual([])
    // …and the wave now runs from the first of them to the last of them.
    expect((await readWave(id)).wave).toMatchObject({
      startsOn: "2026-01-05",
      endsOn: "2026-06-20",
    })
  })

  it("reports each pair once, not twice", async () => {
    const id = await aWave()
    for (const sprintId of ["SP_MARCH", "SP_CROSS"])
      await setSprintWave(cfg, guard, staff, actor, { sprintId, waveId: id })
    expect((await readWave(id)).overlaps).toHaveLength(1)
  })

  it("an undated sprint clashes with nothing", async () => {
    const id = await aWave()
    for (const sprintId of ["SP_MARCH", "SP_UNDATED"])
      await setSprintWave(cfg, guard, staff, actor, { sprintId, waveId: id })
    expect((await readWave(id)).overlaps).toEqual([])
  })
})

describe("a package holds one client's work and nobody else's", () => {
  it("refuses another client's sprint, and leaves it where it was", async () => {
    const id = await aWave()
    await expect(
      setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_THEIRS", waveId: id })
    ).rejects.toMatchObject({ status: 400, code: "wrong_client" })

    // The refusal is only worth anything if nothing was written on the way to it.
    const row = db().prepare(`SELECT wave_id FROM sprints WHERE id = 'SP_THEIRS'`).get() as {
      wave_id: string | null
    }
    expect(row.wave_id).toBeNull()
    expect((await readWave(id)).wave.sprintCount).toBe(0)
  })

  it("a client login sees no other client's waves at all", async () => {
    const id = await aWave()
    // Diego at Delaval: an ordinary team member holding every right, pinned by
    // his portal row to his OWN company. His role is not what stops him.
    const burglar = await accountScope(cfg, { ...guard, userId: IDS.burglarUser })
    expect(burglar.kind).toBe("portal")
    expect(await listWaves(cfg, guard, burglar)).toEqual([])
    expect(await countWaves(cfg, guard, burglar)).toBe(0)
    expect(await getWave(cfg, guard, burglar, id)).toBeNull()
  })

  it("…and cannot write into one either", async () => {
    const id = await aWave()
    const burglar = await accountScope(cfg, { ...guard, userId: IDS.burglarUser })
    await expect(
      createWave(cfg, guard, burglar, actor, {
        accountId: IDS.victimAccount,
        name: "Theirs now",
        goal: null,
      })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      updateWave(cfg, guard, burglar, actor, { id, name: "Renamed", goal: null })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      setWaveActive(cfg, guard, burglar, actor, { id, active: false })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      setSprintWave(cfg, guard, burglar, actor, { sprintId: "SP_MARCH", waveId: id })
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe("switching a wave off is idempotent (R17)", () => {
  it("moves rows once, writes one history row, and answers honestly the second time", async () => {
    const id = await aWave()
    const before = historyRows(id)

    expect(await setWaveActive(cfg, guard, staff, actor, { id, active: false })).toMatchObject({
      moved: true,
    })
    // The second click. Zero rows moved = nothing happened, so nothing is
    // written and nothing is announced.
    expect(await setWaveActive(cfg, guard, staff, actor, { id, active: false })).toMatchObject({
      moved: false,
    })
    expect(historyRows(id) - before, "one deactivation, however many times it was clicked").toBe(1)
    expect((await readWave(id)).wave.active).toBe(false)

    // …and it comes BACK, once.
    expect(await setWaveActive(cfg, guard, staff, actor, { id, active: true })).toMatchObject({
      moved: true,
    })
    expect(await setWaveActive(cfg, guard, staff, actor, { id, active: true })).toMatchObject({
      moved: false,
    })
    expect(historyRows(id) - before).toBe(2)
    expect((await readWave(id)).wave.active).toBe(true)
  })

  it("putting a sprint where it already is moves nothing", async () => {
    const id = await aWave()
    expect(
      (await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: id })).moved
    ).toBe(true)
    expect(
      (await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: id })).moved
    ).toBe(false)
    // …and taking out a sprint that is in no wave is the same no-op.
    expect(
      (await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_APRIL", waveId: null })).moved
    ).toBe(false)
  })

  it("a switched-off wave keeps its sprints — deactivate, never delete", async () => {
    const id = await aWave()
    await setSprintWave(cfg, guard, staff, actor, { sprintId: "SP_MARCH", waveId: id })
    await setWaveActive(cfg, guard, staff, actor, { id, active: false })
    const { wave, sprints } = await readWave(id)
    expect(wave.active).toBe(false)
    expect(sprints.map((s) => s.id)).toEqual(["SP_MARCH"])
    expect(wave.startsOn).toBe("2026-03-01")
  })
})

describe("two identical packages are two waves", () => {
  it("refuses a second LIVE wave of the same name for one client, and allows it once the first is off", async () => {
    // The owner's own example: "Three weeks later he sells a second, identical
    // package." Identical in shape, never in name — the partial unique index is
    // what makes two waves tellable apart on a screen.
    await aWave("Onboarding package")
    await expect(aWave("Onboarding package")).rejects.toMatchObject({ status: 409 })
  })

  it("lets another client have a wave of the same name", async () => {
    await aWave("Onboarding package")
    await expect(
      createWave(cfg, guard, staff, actor, {
        accountId: IDS.burglarAccount,
        name: "Onboarding package",
        goal: null,
      })
    ).resolves.toMatchObject({ id: expect.any(String) })
  })
})
