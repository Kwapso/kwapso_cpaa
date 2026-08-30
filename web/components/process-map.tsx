"use client"

// A PROCESS, DRAWN — the same steps the list shows, as a route you can follow,
// and two versions side by side when you want to see what changed.
//
// VIEW ONLY, and that is the whole design brief rather than a limitation. It
// reads what is already on screen and writes nothing: no drag, no reordering, no
// editing. A map that edits is a second way to change a process, and the app
// already has one that works (the Steps list, with its own door and its own
// audit trail). Two ways to change one thing is two things to keep in step.
//
// BOXES DOWN THE PAGE, NOT A CANVAS, and the reason is in `agent-blocks.tsx`
// which reached the same conclusion for the same product: a laid-out graph is
// either a pile of overlapping labels at phone width or a thing you drag
// sideways, and a process map here is a SEQUENCE — first this, then that — which
// a column says more honestly than a canvas does. The owner asked for the
// simpler one first, and this is it.
//
// HOW TWO VERSIONS ALIGN. Every step carries a `stepKey` that is minted once and
// COPIED FORWARD when a version is cut, so version 1's "check it against the
// order" and version 4's are the same key and can be put on the same line. That
// is what makes a real comparison possible rather than two lists side by side
// hoping the order matches. A step present in one version and not the other gets
// its own line with a gap opposite, which is the honest way to show a step that
// was added or dropped.
//
// COLOUR CARRIES ONE THING ONLY: whether the step got faster, slower, or went
// away — and it is painted on the NEWER side alone. Both boxes of a pair used
// to take the tone, and on a phone (where the pair stacks) the owner read the
// result as soup: "with this whole mix of colours, it's a bit difficult to
// understand the difference between version 1 and version 2". The old box is
// the quiet past (muted fill, always); the new box says what changed; a short
// version chip on each box says WHICH version it is without re-reading a full
// label nine times. The tokens are the closed palette's own (R32) — no ramps,
// no hex.

import * as React from "react"

import { Badge } from "@shared/ui/components/badge/badge"
import { ArrowDown } from "@shared/ui/foundations/icons"

import { useT } from "@shared/web/language"
import { hoursText, minutesText } from "@shared/workers/savings"
import type { ProcessStep } from "@shared/types"

/** One line of the comparison: the same step as it stands in each version. Either
 * side may be missing, which is the point — that is an added or a dropped step. */
export type MapLine = {
  stepKey: string
  left: ProcessStep | null
  right: ProcessStep | null
}

/** Put two versions' steps on the same lines, by the key they share.
 *
 * Order follows the RIGHT-hand version where it can — the newer one is the one a
 * person is usually reading — and steps that exist only on the left are appended
 * in their own order rather than dropped, because a step that was removed is
 * exactly what somebody comparing versions came to see. */
export function alignVersions(left: ProcessStep[], right: ProcessStep[]): MapLine[] {
  const byKeyLeft = new Map(left.map((s) => [s.stepKey, s]))
  const lines: MapLine[] = right.map((s) => ({
    stepKey: s.stepKey,
    left: byKeyLeft.get(s.stepKey) ?? null,
    right: s,
  }))
  const seen = new Set(right.map((s) => s.stepKey))
  for (const s of left) if (!seen.has(s.stepKey)) lines.push({ stepKey: s.stepKey, left: s, right: null })
  return lines
}

/** What one step costs a month, in seconds. The same arithmetic the list footer
 * and the savings figure use — duplicated nowhere, derived here from the row. */
function perMonth(s: ProcessStep): number {
  return s.secondsPerRun * s.runsPerMonth
}

type Tone = "same" | "faster" | "slower" | "gone" | "new"

/** WHAT CHANGED, in one word. Read from the pair rather than from a stored flag,
 * so it cannot disagree with the numbers printed beside it. */
function toneOf(line: MapLine): Tone {
  if (!line.right || line.right.removed) return "gone"
  if (!line.left) return "new"
  const before = perMonth(line.left)
  const after = perMonth(line.right)
  if (after < before) return "faster"
  if (after > before) return "slower"
  return "same"
}

const TONE_CLASS: Record<Tone, string> = {
  // The neutral surface for a step that did not move — most of them, most of the
  // time, and a diagram where most boxes are coloured is a diagram nobody reads.
  same: "border-border",
  faster: "border-success/50 bg-success/5",
  slower: "border-destructive/50 bg-destructive/5",
  gone: "border-border opacity-60",
  new: "border-chart-1/50 bg-chart-1/5",
}

/** The OLDER side's one look: the quiet past. Never a change tone — the change
 * is a fact about where the step ENDED UP, and saying it twice per line is the
 * colour soup the owner reported. */
const OLD_CLASS = "border-border bg-muted/40"

function StepBox({
  step,
  tone,
  side,
  chip,
  t,
}: {
  step: ProcessStep | null
  tone: Tone
  side: "old" | "new"
  /** the short version name on the box's shoulder — "Version 1" — so a stacked
   * pair on a phone stays legible without a full label over every box */
  chip?: string
  t: (s: string) => string
}) {
  // AN ABSENT STEP IS DRAWN, not skipped. A gap opposite its pair is what says
  // "this did not exist in that version"; leaving the line short would just look
  // like the two columns had drifted.
  if (!step)
    return (
      <div className="border-border/50 text-muted-foreground rounded-[var(--radius)] border border-dashed p-3 text-xs">
        {chip ? <span className="mr-2 font-medium">{chip}</span> : null}
        {t("Not in this version")}
      </div>
    )
  const chipVariant = side === "old" ? "secondary" : "inverse"
  return (
    <div className={`relative rounded-[var(--radius)] border p-3 ${side === "old" ? OLD_CLASS : TONE_CLASS[tone]}`}>
      {chip ? (
        <Badge variant={chipVariant} className="float-right ms-2 h-auto py-0.5 text-[0.625rem]">
          {chip}
        </Badge>
      ) : null}
      <p className="text-sm font-medium">{step.name}</p>
      <p className="text-muted-foreground mt-1 text-xs">
        {[
          minutesText(step.secondsPerRun),
          `${step.runsPerMonth}× ${t("a month")}`,
          hoursText(perMonth(step)),
        ].join(" · ")}
      </p>
      {step.removed && (
        <Badge variant="secondary" className="mt-2">
          {t("no longer done")}
        </Badge>
      )}
    </div>
  )
}

export function ProcessMap({
  left,
  right,
  leftLabel,
  rightLabel,
  leftShort,
  rightShort,
}: {
  /** the OLDER version's steps, or null to draw one version on its own */
  left: ProcessStep[] | null
  right: ProcessStep[]
  leftLabel?: string
  rightLabel?: string
  /** the two-word version names for the box chips — "Version 1", "Version 2".
   * Full labels are said ONCE in the legend; nine repetitions of "Version 1,
   * How it worked before (baseline)" is what made the stacked view unreadable. */
  leftShort?: string
  rightShort?: string
}) {
  const t = useT()
  const lines = left ? alignVersions(left, right) : right.map((s) => ({ stepKey: s.stepKey, left: null, right: s }))
  const comparing = left !== null

  return (
    <div className="flex flex-col gap-3">
      {comparing && (
        // The legend: the full names, said once, at every width — on a phone it
        // is the ONLY place they appear in full; each box carries its short
        // chip instead.
        <div className="text-muted-foreground flex flex-col gap-1 text-xs font-medium lg:grid lg:grid-cols-2 lg:gap-3">
          <span>
            <Badge variant="secondary" className="me-1.5 h-auto py-0.5 text-[0.625rem]">
              {leftShort}
            </Badge>
            {leftLabel}
          </span>
          <span>
            <Badge variant="inverse" className="me-1.5 h-auto py-0.5 text-[0.625rem]">
              {rightShort}
            </Badge>
            {rightLabel}
          </span>
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {lines.map((line, i) => {
          const tone = toneOf(line)
          return (
            <li key={line.stepKey} className="flex flex-col gap-3">
              {comparing ? (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
                  <StepBox step={line.left} tone={tone} side="old" chip={leftShort} t={t} />
                  <StepBox step={line.right} tone={tone} side="new" chip={rightShort} t={t} />
                </div>
              ) : (
                <StepBox step={line.right} tone={tone} side="new" t={t} />
              )}
              {/* THE CONNECTOR, and only between steps — never after the last
                  one, which would be an arrow pointing at nothing. */}
              {i < lines.length - 1 && (
                <ArrowDown className="text-muted-foreground mx-auto size-4 shrink-0" aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
