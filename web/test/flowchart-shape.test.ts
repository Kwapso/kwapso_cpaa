// THE SHAPE A PROCESS MAP DRAWS, from three columns and no graph table.
//
// The owner's own proposal for how a fork is stored: "Isn't there a way that we
// can give two forking nodes that are at the same position and the same number?
// Let's say that there is one node at position number two and two nodes at
// position number three. We know the split happens after position two."
//
// So POSITION IS THE WHOLE LAYOUT. One step at a position is an ordinary row;
// two or more are branches of the decision above them; and they REJOIN where a
// single step appears again — which needs no marker at all, because the column
// count returning to one IS the join. A graph table would hold the same fact and
// cost a join on every read.
//
// This tests the grouping rather than the drawing, because the grouping is the
// only decision in the file: everything after it is arithmetic over the ranks.

import { describe, expect, it } from "vitest"

import { armsOf, ranksOf } from "@/components/process-flowchart"
import type { ProcessStep } from "@shared/types"

const step = (name: string, position: number, extra: Partial<ProcessStep> = {}): ProcessStep => ({
  id: name,
  processId: "P",
  versionId: "V",
  stepKey: name,
  name,
  description: null,
  position,
  secondsPerRun: 600,
  runsPerMonth: 30,
  runsPerPeriod: 30,
  frequencyPeriod: "month",
  removed: false,
  roleId: null,
  roleName: null,
  roleCentsPerHour: null,
  toolId: null,
  toolName: null,
  toolMark: null,
  branchLabel: null,
  branchOf: null,
  loopsBackTo: null,
  ...extra,
})

describe("the shape of a process, read off its positions", () => {
  it("a straight run is one step per rank, in order", () => {
    const ranks = ranksOf([step("c", 2), step("a", 0), step("b", 1)])
    expect(ranks.map((r) => r.steps.map((s) => s.name))).toEqual([["a"], ["b"], ["c"]])
  })

  it("TWO STEPS AT ONE POSITION ARE A FORK", () => {
    const ranks = ranksOf([
      step("take the call", 0),
      step("approve it", 1, { branchLabel: "if under EUR 500" }),
      step("send it up", 1, { branchLabel: "if over EUR 500" }),
      step("pay it", 2),
    ])
    expect(ranks).toHaveLength(3)
    expect(ranks[1].steps.map((s) => s.name)).toEqual(["approve it", "send it up"])
  })

  it("…and they REJOIN where a single step appears again, with nothing marking it", () => {
    // The join needs no field. The column count going back to one IS the join,
    // which is why there is no `joins_at` anywhere in the schema.
    const ranks = ranksOf([
      step("a", 0),
      step("left", 1),
      step("right", 1),
      step("both carry on here", 2),
    ])
    expect(ranks[2].steps).toHaveLength(1)
    expect(ranks[2].steps[0].name).toBe("both carry on here")
  })

  it("a removed step keeps its place in the sequence", () => {
    // Work we took away is the LARGEST saving there is. A picture that stopped
    // drawing it would be describing a process nobody ever ran, and the reader
    // would have no way to see what changed.
    const ranks = ranksOf([step("a", 0), step("gone", 1, { removed: true }), step("c", 2)])
    expect(ranks.map((r) => r.steps[0].name)).toEqual(["a", "gone", "c"])
  })

  it("an empty map has no ranks rather than one empty one", () => {
    expect(ranksOf([])).toEqual([])
  })

  it("steps sharing a position keep the order they arrived in", () => {
    // The read orders by position then step key, so branches are stable between
    // renders — a fork whose two arms swapped on every refresh would be unreadable.
    const ranks = ranksOf([step("z", 1), step("a", 1)])
    expect(ranks[0].steps.map((s) => s.name)).toEqual(["z", "a"])
  })
})

// ── AN ARM THAT CARRIES ON ALONE ────────────────────────────────────────────
//
// THE OWNER, 26 Aug 2026: "What if I want to add more steps under a branched
// step? … under the split step, which says 'Schedule stories', I then want to
// add step number four underneath it in the same split. I don't want it to be a
// join step."
//
// Position alone can say exactly two things — a shared position is a fork, and a
// single step below is the rejoin — so a fourth step meant to continue ONE arm
// got a row of its own, and a row with one step in it IS the rejoin by this
// model. It drew itself centred under both arms and read as a join, which is the
// one thing it was not.
//
// `branchOf` is the third thing the shape can say: the step key of the branch
// HEAD this step continues. The picture library has drawn branch chains since it
// landed (`FlowBranch.chain`); nothing here had a fact to feed it.
describe("a branch can carry on without rejoining", () => {
  const tree = [
    step("raise", 1),
    step("triage", 2),
    step("resolve", 3, { branchLabel: "if resolved" }),
    step("schedule", 3, { branchLabel: "if not" }),
    // …the fourth step, ON the schedule arm.
    step("review", 4, { branchOf: "schedule" }),
  ]

  it("a step naming an arm is not a rank of its own", () => {
    // THE WHOLE FAULT IN ONE ASSERTION. Four ranks, not five: `review` belongs to
    // an arm, so it never reaches the trunk to be mistaken for a rejoin.
    expect(ranksOf(tree).map((r) => r.position)).toEqual([1, 2, 3])
  })

  it("it hangs under the head it names, and under no other", () => {
    const arms = armsOf(tree)
    expect(arms.get("schedule")?.map((s) => s.name)).toEqual(["review"])
    expect(arms.get("resolve"), "the other arm must be untouched").toBeUndefined()
  })

  it("a chain keeps its own order however the rows arrive", () => {
    const shuffled = [
      step("schedule", 3, { branchLabel: "if not" }),
      step("sign-off", 6, { branchOf: "schedule" }),
      step("review", 4, { branchOf: "schedule" }),
      step("triage", 2),
    ]
    expect(armsOf(shuffled).get("schedule")?.map((s) => s.name)).toEqual(["review", "sign-off"])
  })

  it("an ordinary map is unchanged — no arm, no behaviour", () => {
    // The old shape has to be exactly the old shape. A fork with a real rejoin
    // below it still groups as three ranks with two steps in the middle one.
    const plain = [step("a", 1), step("b", 2), step("c", 2), step("d", 3)]
    expect(ranksOf(plain).map((r) => r.steps.length)).toEqual([1, 2, 1])
    expect(armsOf(plain).size).toBe(0)
  })

  it("naming an arm that is not on the map leaves the step where it was", () => {
    // A dangling `branchOf` — a head that was deleted, an id typed by a tool —
    // must not swallow the step. It is pulled OUT of the ranks by the same rule
    // whatever it names, so this is the honest failure: the step is on an arm
    // nothing draws, which is visible, rather than silently back on the trunk
    // pretending to be a rejoin.
    const dangling = [step("a", 1), step("ghost", 2, { branchOf: "deleted" })]
    expect(ranksOf(dangling).map((r) => r.position)).toEqual([1])
    expect(armsOf(dangling).get("deleted")?.map((s) => s.name)).toEqual(["ghost"])
  })
})
