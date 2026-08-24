"use client"

// THE PICTURE — a process map, drawn.
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
//     them." A step that sends work back draws a return arrow to the step it
//     names.
//
// WHY SVG AND NOT A LIBRARY. The whole drawing is boxes and lines whose
// positions are arithmetic over an array we already have. A flowchart library
// would be a dependency, a bundle, and a second opinion about layout — and
// "too much code is a defect" (CLAUDE.md). Every colour is a token (R32) and
// every corner is the one radius (R31), so it inherits the theme like anything
// else.

import * as React from "react"

import type { ProcessStep } from "@shared/types"
import { hoursText, minutesText } from "@shared/workers/savings"
import { frequencyText } from "@shared/web/frequency"
import { useT } from "@shared/web/language"

/** One row of the drawing: the steps that share a position. One step is an
 * ordinary row; two or more are branches of the decision above them. */
type Rank = { position: number; steps: ProcessStep[] }

/** GROUP BY POSITION, IN ORDER. The only layout decision in the file, and it is
 * the owner's model rather than an inference: a shared position IS a fork. */
export function ranksOf(steps: ProcessStep[]): Rank[] {
  const by = new Map<number, ProcessStep[]>()
  for (const s of steps) {
    const list = by.get(s.position)
    if (list) list.push(s)
    else by.set(s.position, [s])
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, group]) => ({ position, steps: group }))
}

const BOX_H = 78
const GAP_Y = 34
const PAD = 16

export function ProcessFlowchart({
  steps,
  emptyMessage,
}: {
  steps: ProcessStep[]
  emptyMessage?: string
}) {
  const t = useT()
  const ranks = React.useMemo(() => ranksOf(steps), [steps])
  const keyToRank = React.useMemo(() => {
    const m = new Map<string, number>()
    ranks.forEach((r, i) => r.steps.forEach((s) => m.set(s.stepKey, i)))
    return m
  }, [ranks])

  if (steps.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        {emptyMessage ?? t("Nothing mapped yet.")}
      </p>
    )

  const widest = Math.max(...ranks.map((r) => r.steps.length))
  // THE DRAWING IS A FIXED COORDINATE SPACE SCALED TO THE CARD, so it is legible
  // on a phone and on a desk without two layouts. A wide fork gets a wider space
  // rather than smaller boxes.
  const colW = 220
  const width = Math.max(colW, widest * colW + (widest - 1) * 24) + PAD * 2
  const height = ranks.length * BOX_H + (ranks.length - 1) * GAP_Y + PAD * 2
  // LOOPS TRAVEL DOWN THE RIGHT-HAND MARGIN, so a return arrow never crosses a
  // box. The margin only exists when something actually loops.
  const hasLoop = steps.some((s) => s.loopsBackTo && keyToRank.has(s.loopsBackTo))
  const laneW = hasLoop ? 40 : 0

  const xOf = (rank: Rank, i: number): number => {
    const total = rank.steps.length * colW + (rank.steps.length - 1) * 24
    return PAD + (width - PAD * 2 - total) / 2 + i * (colW + 24)
  }
  const yOf = (index: number): number => PAD + index * (BOX_H + GAP_Y)

  return (
    <div className="overflow-x-auto">
      <svg
        width="100%"
        viewBox={`0 0 ${width + laneW} ${height}`}
        role="img"
        aria-label={t("The steps of this process, in order")}
        className="min-w-[320px]"
      >
        <defs>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M2 1L8 5L2 9"
              fill="none"
              stroke="context-stroke"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>

        {/* THE CONNECTORS FIRST, so a box is never drawn under a line. */}
        {ranks.slice(0, -1).map((rank, i) => {
          const next = ranks[i + 1]
          const y1 = yOf(i) + BOX_H
          const y2 = yOf(i + 1)
          return rank.steps.flatMap((_, a) =>
            next.steps.map((_, b) => (
              <path
                key={`c-${i}-${a}-${b}`}
                d={`M ${xOf(rank, a) + colW / 2} ${y1} C ${xOf(rank, a) + colW / 2} ${y1 + GAP_Y / 2}, ${xOf(next, b) + colW / 2} ${y2 - GAP_Y / 2}, ${xOf(next, b) + colW / 2} ${y2}`}
                fill="none"
                className="stroke-border"
                strokeWidth="1.5"
                markerEnd="url(#flow-arrow)"
              />
            ))
          )
        })}

        {/* THE WAY BACK. Out of the right edge, down the margin, in again — the
            one path that must never cross a box, which is why it has a lane. */}
        {hasLoop &&
          steps.map((s) => {
            const from = keyToRank.get(s.stepKey)
            const to = s.loopsBackTo ? keyToRank.get(s.loopsBackTo) : undefined
            if (from === undefined || to === undefined) return null
            const yFrom = yOf(from) + BOX_H / 2
            const yTo = yOf(to) + BOX_H / 2
            const lane = width + laneW / 2
            return (
              <path
                key={`loop-${s.stepKey}`}
                d={`M ${width - PAD} ${yFrom} L ${lane} ${yFrom} L ${lane} ${yTo} L ${width - PAD} ${yTo}`}
                fill="none"
                className="stroke-muted-foreground"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                markerEnd="url(#flow-arrow)"
              />
            )
          })}

        {/* THE STEPS. A removed step is drawn dashed and muted rather than left
            out: work we took away is the largest saving there is, and a picture
            that simply stopped showing it would be describing a process that
            never existed. */}
        {ranks.map((rank, i) =>
          rank.steps.map((s, a) => (
            <g key={s.stepKey}>
              <rect
                x={xOf(rank, a)}
                y={yOf(i)}
                width={colW}
                height={BOX_H}
                rx="12"
                className={
                  s.removed ? "fill-muted stroke-border" : "fill-card stroke-border"
                }
                strokeWidth="1"
                strokeDasharray={s.removed ? "5 4" : undefined}
              />
              <text
                x={xOf(rank, a) + 14}
                y={yOf(i) + 26}
                className="fill-foreground text-[13px] font-medium"
              >
                {truncate(`${i + 1}. ${s.name}`, 26)}
              </text>
              <text
                x={xOf(rank, a) + 14}
                y={yOf(i) + 46}
                className="fill-muted-foreground text-[11px]"
              >
                {minutesText(s.secondsPerRun)} ·{" "}
                {frequencyText(s.runsPerPeriod, s.frequencyPeriod, t)}
              </text>
              <text
                x={xOf(rank, a) + 14}
                y={yOf(i) + 64}
                className="fill-muted-foreground text-[11px]"
              >
                {truncate(
                  [s.roleName, s.toolName].filter(Boolean).join(" · ") ||
                    (s.removed ? t("no longer done") : ""),
                  30
                )}
              </text>
              {/* THE WORD ON A FORK sits on the connector above the box, which is
                  the only place it means "you get here when…" rather than
                  describing the step itself. */}
              {s.branchLabel && (
                <text
                  x={xOf(rank, a) + colW / 2}
                  y={yOf(i) - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {truncate(s.branchLabel, 24)}
                </text>
              )}
            </g>
          ))
        )}
      </svg>
      <p className="text-muted-foreground mt-3 text-xs">
        {t("Steps side by side are branches of one decision.")}{" "}
        {hasLoop ? t("A dashed line sends the work back.") : ""}{" "}
        {t("Total")}: {hoursText(steps.reduce((n, s) => n + s.secondsPerRun * s.runsPerMonth, 0))}{" "}
        {t("a month")}
      </p>
    </div>
  )
}

/** SVG text does not wrap and does not ellipsise, so a long name would run out
 * of its own box and across the next one. Cut with a real ellipsis rather than
 * three dots, because it is one character and it is what a reader expects. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
