// THE PRIORITY IS DERIVED, SO IT CANNOT BE STALE — and the two ticks it is
// derived FROM can now be changed.
//
// The owner asked whether the workflow that adds or edits a task always
// recalculates the Eisenhower metric. The honest answer is that there is nothing
// to recalculate: the score is a pure function of two booleans, computed on every
// read and stored nowhere. A number that is never written cannot drift from the
// facts it describes.
//
// That answer is only worth having if it stays true, and it can stop being true
// in two quiet ways. Both are asserted here:
//
//   • SOMEBODY STORES IT. A `priority` column added for a filter or a sort would
//     make the score a value somebody has to remember to update, which is the
//     exact class of bug the derivation avoids. The row the door builds is read
//     for it.
//   • THE SQL AND THE FUNCTION DISAGREE. The list's ORDER BY computes the score
//     in SQL — `(important * 2) + urgent` — while the app computes
//     `(important * 2) + urgent + 1`. Same ordering today, because a constant
//     offset cannot reorder anything, and it would stop being the same the moment
//     either half changed shape. So the two are compared across all four
//     combinations rather than trusted to look alike.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { PRIORITY_LABEL, priorityScore } from "@shared/departments"

const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "tasks.ts")

describe("the Eisenhower score is derived on every read", () => {
  it("is the agency's own formula, over all four combinations", () => {
    expect(priorityScore(false, false)).toBe(1) // neither — whenever
    expect(priorityScore(false, true)).toBe(2) // urgent alone
    expect(priorityScore(true, false)).toBe(3) // important alone
    expect(priorityScore(true, true)).toBe(4) // both — do it now
    // Every score has a word, or a list can show a number nobody can read.
    for (const n of [1, 2, 3, 4] as const) expect(PRIORITY_LABEL[n]).toBeTruthy()
  })

  it("is COMPUTED into the row, never read out of a column", () => {
    const src = readFileSync(LIB, "utf8")
    expect(
      /priority:\s*priorityScore\(/.test(src),
      "the task row must derive its priority — a stored one is a number somebody has to remember to update"
    ).toBe(true)
    // A `priority` column would mean the score is written somewhere. The SELECT
    // is where that would first show up.
    expect(
      /\bt\.priority\b/.test(src),
      "tasks now SELECT a priority column — the score has become a stored value and can go stale"
    ).toBe(false)
  })

  it("the list's SQL ordering agrees with the function, for every combination", () => {
    const src = readFileSync(LIB, "utf8")
    // The ORDER BY as it is written, so a change to it fails here rather than
    // silently reordering somebody's day.
    expect(src, "the ORDER BY that ranks tasks has moved — check it still ranks by the two ticks").toContain(
      "((t.important * 2) + t.urgent) DESC"
    )
    const sql = (important: boolean, urgent: boolean) => (important ? 2 : 0) + (urgent ? 1 : 0)
    const combos = [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ] as const
    for (const [ai, au] of combos)
      for (const [bi, bu] of combos) {
        const bySql = Math.sign(sql(ai, au) - sql(bi, bu))
        const byFn = Math.sign(priorityScore(ai, au) - priorityScore(bi, bu))
        expect(
          bySql,
          `the SQL ordering and priorityScore disagree about (${ai},${au}) vs (${bi},${bu}) — the list would be sorted by one rule and labelled by another`
        ).toBe(byFn)
      }
  })
})

describe("the two ticks the score reads can be changed", () => {
  // The half that was missing until 19 Aug 2026. With no edit door, a task's
  // priority was fixed at the moment somebody typed it — which is what the
  // owner was really reporting when he asked why the metric was not being
  // recalculated, and separately when he asked why a task could not be edited.
  it("updateTask exists and writes both ticks", () => {
    const src = readFileSync(LIB, "utf8")
    expect(src, "there is no updateTask — a task's priority cannot be corrected").toContain(
      "export async function updateTask("
    )
    const body = src.slice(src.indexOf("export async function updateTask("))
    expect(body, "the edit must write `important`").toMatch(/important = \$\{input\.important \? 1 : 0\}/)
    expect(body, "the edit must write `urgent`").toMatch(/urgent = \$\{input\.urgent \? 1 : 0\}/)
    // A ticked task is a record of something that happened.
    expect(body, "editing a done task must be refused, with the way back named").toContain("already_done")
  })
})
