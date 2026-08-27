"use client"

// A TICKET'S STATUS, AS A FACT (CHECKLIST 5.2: "the status becomes a label you
// cannot click").
//
// This was a control. The tester's single most repeated sentence about the whole
// app was that a status is a fact and not a button, and this stepper was the
// clearest counter-example in it: seven stages, every one of them clickable, so a
// request could be declared "in progress" by somebody who had not started, and
// "ready" by somebody who had not finished. What the stage says is now downstream
// of what happened:
//
//   awaiting_validation  raised as an extra, a request or feedback, and the
//                        client's main stakeholder has not confirmed it yet
//                        (Aurora's ap2 — a question or an issue never waits);
//   new                  raised, nobody here has read it;
//   triaged              somebody on duty read it;
//   scheduled            its work exists AND is booked into a sprint;
//   in_progress          a timer started on it or on one of its stories;
//   ready                every story on it closed;
//   resolved             a person sent the answer.
//
// WHY THE TRACK SURVIVES AT ALL, rather than collapsing to one badge. The stages
// are ordered and a person reads "how far along is this?" off the shape — that is
// what a track is FOR, and it was never the part anybody complained about. What
// goes is the pressing: no `onChange`, `disabled` always, so the library renders
// it flat and the cursor stays an arrow. UI-RULEBOOK C7 keeps status a mark
// rather than a control, and this is that rule at record scale.
//
// The two moves a PERSON still makes have doors and words of their own — "Mark it
// read" on the triage screen, and the resolve panel — and they live beside the
// record, not on this strip.

import { StatusStepper } from "@shared/ui/components/status-stepper/status-stepper"

import { HELP_STATUSES, type HelpStatus } from "@shared/types"
import { HELP_STATUS } from "@/components/deep-link/shape"

/** The ticket's status, named the way this screen talks about it. One list, in
 * shared/types — the server validates against the very same one. */
export type HelpStatusValue = HelpStatus

/** The track, in order. DERIVED from the one list rather than retyped beside it:
 * an eighth state would otherwise be a state the server records and the strip
 * cannot show, which is the shape of every drift bug this repo has had. The
 * LABELS come from the one map every other ticket screen reads (shape.ts), so a
 * row in the list and the track on its record can never call the same fact two
 * different things. */
const STAGES = HELP_STATUSES.map((value) => ({ value, label: HELP_STATUS[value] }))

// The kit's stepper knows three states — done, current, later — derived from
// the current index, and owns their colours. The old per-stage TONE map
// (amber for "waiting on somebody outside", green for "finished, telling
// left") is a design question the kit has not answered (NEEDS-A-SPEC §4a);
// until Aurora rules, the strip says WHERE the ticket is and not what kind
// of wait each stage is.

export function HelpStatusStepper({ status }: { status: HelpStatusValue }) {
  return (
    <StatusStepper
      stages={STAGES.map((s) => ({ id: s.value, label: s.label }))}
      current={STAGES.findIndex((s) => s.value === status)}
      // NOT PRESSABLE, and both halves are needed. No `onChange` means there is
      // nothing to press; `disabled` is what stops it LOOKING pressable, which is
      // the half the tester actually reported ("it should not look pressable").
      disabled
    />
  )
}
