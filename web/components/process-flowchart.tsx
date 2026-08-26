"use client"

// THE PICTURE — a process map, drawn by the kit's own flowchart.
//
// READ-ONLY, BUILT FROM THE FORM. Aurora's ruling, and the right one: a canvas
// you can drag is a different feature with a different failure mode, and a
// picture you cannot edit can still be WRONG in only one way — by disagreeing
// with the steps underneath it. This draws the same rows the list draws, in the
// same order, from the same read. There is nothing for it to disagree with.
//
// THE SHAPE COMES FROM THREE FACTS ON A STEP, and no graph table:
//
//   • POSITION. Steps run in order, top to bottom.
//   • TWO STEPS AT THE SAME POSITION ARE A FORK — the owner's own proposal:
//     "one node at position two and two nodes at position three. We know the
//     split happens after position two." They rejoin where a single step appears
//     again, which needs no marker: the column count going back to one IS the
//     join.
//   • LOOPS BACK TO. "Feedback loops are real. We need to find a way to include
//     them." A step that sends work back says so on its own face.
//
// WHY THE KIT DRAWS IT AND THIS FILE DOES NOT.
// This was a hand-rolled SVG, and it was wrong in a way only a screen shows.
// An <svg width="100%"> with a viewBox scales its whole coordinate space to the
// container: on a 1600-wide page a 500-wide drawing is magnified 3.2x, so 13px
// type rendered at 42px and the boxes filled the screen. Nothing in the source
// says "huge"; the huge is the scaling.
//
// The kit ships `Flowchart` — collection view 23, "nodes and arrows, branches
// where a decision splits it", whose own fit line reads "Processes, approval
// paths, audit logic". It draws in the DOM, so type is type and a long name
// wraps instead of running out of its box; it has the four fills, the fork
// rail, the elbow that re-centres a branch onto the trunk, and the legend.
// Composing it is less code than the drawing it replaces AND it is the shape
// Aurora drew for this screen. "Too much code is a defect" (CLAUDE.md) cuts
// both ways: re-drawing a component the design system already ships is too
// much code.

import * as React from "react"

import { Flowchart, type FlowStep as KitFlowStep } from "@shared/ui/structures/flowchart/flowchart"
import type { ProcessStep } from "@shared/types"
import { hoursText, minutesText } from "@shared/workers/savings"
import { frequencyText } from "@shared/web/frequency"
import { useT } from "@shared/web/language"

/** One row of the drawing: the steps that share a position. One step is an
 * ordinary row; two or more are branches of the decision above them. */
type Rank = { position: number; steps: ProcessStep[] }

/** WHICH STEPS HANG UNDER EACH BRANCH HEAD, deepest chain first in position
 * order. A step names the HEAD of the arm it is on (`branchOf`), never its own
 * neighbour, so deleting the middle of a three-step arm leaves the third still
 * on that arm rather than pointing at nothing. */
export function armsOf(steps: ProcessStep[]): Map<string, ProcessStep[]> {
  const arms = new Map<string, ProcessStep[]>()
  for (const s of steps) {
    if (!s.branchOf) continue
    const chain = arms.get(s.branchOf)
    if (chain) chain.push(s)
    else arms.set(s.branchOf, [s])
  }
  for (const chain of arms.values()) chain.sort((a, b) => a.position - b.position)
  return arms
}

/** GROUP BY POSITION, IN ORDER. The only layout decision in the file, and it is
 * the owner's model rather than an inference: a shared position IS a fork.
 *
 * …AND A STEP ON AN ARM IS NOT A RANK OF ITS OWN. Before 26 Aug 2026 it was, and
 * that is the whole of the fault the owner reported: a fourth step meant to
 * continue one arm of a fork got a row to itself, and a row with one step in it
 * is by this model the REJOIN, so it drew itself centred under both arms. Steps
 * naming an arm are pulled out here and handed to that arm's chain instead. */
export function ranksOf(steps: ProcessStep[]): Rank[] {
  const arms = armsOf(steps)
  const onAnArm = new Set([...arms.values()].flat().map((s) => s.id))
  const by = new Map<number, ProcessStep[]>()
  for (const s of steps) {
    if (onAnArm.has(s.id)) continue
    const list = by.get(s.position)
    if (list) list.push(s)
    else by.set(s.position, [s])
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, group]) => ({ position, steps: group }))
}

export function ProcessFlowchart({
  steps,
  emptyMessage,
}: {
  steps: ProcessStep[]
  emptyMessage?: string
}) {
  const t = useT()
  const ranks = React.useMemo(() => ranksOf(steps), [steps])
  const arms = React.useMemo(() => armsOf(steps), [steps])

  /** stepKey -> the number a reader sees, so "sends it back to step 2" names
   * the same 2 the box above is labelled with. */
  const numberOf = React.useMemo(() => {
    const m = new Map<string, number>()
    ranks.forEach((r, i) => r.steps.forEach((s) => m.set(s.stepKey, i + 1)))
    return m
  }, [ranks])

  const flow = React.useMemo<KitFlowStep[]>(() => {
    /** A rank whose NEXT rank forks is where the decision is taken. It gets the
     * one accent, which is the kit's rule for mango: one accent, one meaning. */
    const isDecision = (i: number) => (ranks[i + 1]?.steps.length ?? 0) > 1

    const node = (s: ProcessStep, i: number, inBranch: boolean, siblingsLabelled = false) => ({
      id: s.stepKey,
      label: `${numberOf.get(s.stepKey)}. ${s.name}`,
      // WHO AND HOW OFTEN on the quiet line. A removed step says what happened
      // to it instead — the largest saving there is, and a picture that simply
      // dropped it would be describing a process that never existed.
      //
      // THREE LINES, NOT ONE STRING WITH NEWLINES IN IT. HTML collapses "\n" to
      // a space, so the joined version read "5 min · 2 times a day Verification
      // clerk (probe)" as one run and the reader had to find the seam. Separate
      // blocks are the only thing that actually breaks a line here.
      role: s.removed ? (
        t("no longer done")
      ) : (
        <>
          {[minutesText(s.secondsPerRun), frequencyText(s.runsPerPeriod, s.frequencyPeriod, t)].join(" · ")}
          {[s.roleName, s.toolName].filter(Boolean).length > 0 && (
            <span className="block">{[s.roleName, s.toolName].filter(Boolean).join(" · ")}</span>
          )}
          {s.loopsBackTo && numberOf.has(s.loopsBackTo) && (
            <span className="block">
              {t("sends it back to step {n}").replace("{n}", String(numberOf.get(s.loopsBackTo)))}
            </span>
          )}
        </>
      ),
      tone: s.removed ? ("removed" as const) : isDecision(i) ? ("decision" as const) : ("pending" as const),
      // The word on a fork — "if the client is new". Only a branch draws it,
      // which is the only place it means "you get here when…" rather than
      // describing the step itself. A branch with NO condition beside branches
      // that have one says "otherwise": a bare box in a row of "if…"s reads as
      // a mistake, and "otherwise" is the word the room would use — it is also
      // what makes a step that fell into a fork by accident LOOK like what it
      // is, instead of hiding.
      condition: inBranch
        ? (s.branchLabel ?? (siblingsLabelled ? t("otherwise") : undefined))
        : undefined,
      // The way back, as a line a finger can follow (kit v1.0.3). The sentence
      // on the node stays; the line is the cue.
      loopTo: !s.removed && s.loopsBackTo && numberOf.has(s.loopsBackTo) ? s.loopsBackTo : undefined,
    })

    return ranks.map((rank, i) =>
      rank.steps.length === 1
        ? ({ type: "node", node: node(rank.steps[0], i, false) } as const)
        : ({
            type: "branch",
            branches: rank.steps.map((s, b) => ({
              node: node(s, i, true, rank.steps.some((x) => x.branchLabel)),
              // THE STEPS THAT HANG UNDER THIS ARM, if any. The kit has drawn a
              // branch chain since it landed; nothing here had a fact to feed it
              // until `branchOf` (26 Aug 2026).
              chain: (arms.get(s.stepKey) ?? []).map((c) => node(c, i, false)),
              // …AND WHETHER THE FORK MEETS AGAIN, which is now an ANSWER rather
              // than a constant. Marking any branch makes the whole fork rejoin
              // (the merge rail is the mirror of the fork — the owner's own
              // reading of a join, kit v1.0.3), so it is marked only when there
              // is genuinely a rank BELOW this one for the ways to meet at. A
              // fork whose arms simply run out marks none, and the drawing stops
              // claiming a join that never happens.
              continues: b === 0 && i < ranks.length - 1,
            })),
          } as const)
    )
  }, [ranks, arms, numberOf, t])

  const total = steps.reduce((n, s) => n + s.secondsPerRun * s.runsPerMonth, 0)

  return (
    <div>
      <Flowchart
        steps={flow}
        label={t("The steps of this process, in order")}
        legend={false}
        empty={steps.length === 0}
        emptyLabel={emptyMessage ?? t("Nothing mapped yet.")}
      />
      {steps.length > 0 && (
        <p className="text-muted-foreground mt-3 text-xs">
          {t("Steps side by side are branches of one decision.")} {t("Total")}:{" "}
          {hoursText(total)} {t("a month")}
        </p>
      )}
    </div>
  )
}
