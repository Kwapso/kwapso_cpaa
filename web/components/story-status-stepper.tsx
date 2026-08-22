"use client"

// A STORY'S STATUS, AS A FACT (CHECKLIST 6.7: "the status becomes a label; a
// timer moves it, not the other way round. Today it is backwards.").
//
// It really was backwards. Marking a story "in progress" started a timer, so the
// declaration was the cause and the work was the effect. Now:
//
//   open         written down, nobody has started;
//   in_progress  a timer started on it (routes/work-logs.ts, storyProgressFlip);
//   in_review    somebody pressed "Ready for review" — refused while any timer on
//                it is still running and until an explanation is written;
//   done         the reviewer pressed the one Done button.
//
// So two of the four happen by themselves and the other two are named acts with
// their own panels. Nothing on this strip is pressable, which is the whole of the
// change here — see help-status-stepper.tsx, which made the same move for the
// same reason on the same day.

import { StatusStepper, type StepperTone } from "@shared/ui/registry/primitives/status-stepper/status-stepper"

import { STORY_STATUSES, type StoryStatus } from "@shared/types"
import { STORY_STATUS_LABEL } from "@/components/work-panels"

/** The track, in order — DERIVED from the one list the server validates against,
 * and labelled from the one map every other story screen reads. */
const STAGES = STORY_STATUSES.map((value) => ({ value, label: STORY_STATUS_LABEL[value] }))

const TONES: Record<string, StepperTone> = {
  open: "neutral",
  in_progress: "warning",
  in_review: "warning",
  done: "success",
}

export function StoryStatusStepper({ status }: { status: StoryStatus }) {
  return <StatusStepper stages={STAGES} value={status} tones={TONES} disabled />
}
