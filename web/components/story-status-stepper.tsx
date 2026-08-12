"use client"

// Story status as a left-to-right STEPPER, the same control a ticket gets and for
// the same reason: four fixed states, and a dropdown makes them look like a
// label somebody chose rather than a track work moves along.
//
// THE REVIEW STEP IS DELIBERATE (SCOPE ch.07): work is checked before it is
// called done. Done is a decision and not a tidy-up — closing a story appends its
// closing note to the ticket's draft resolution and flips that ticket to Ready if
// it was the last piece of work outstanding — so it is the far end of a track,
// where a person can see how far they have come to reach it.
//
// The stages are DERIVED from STORY_STATUSES, the one list the server validates
// against, so a fifth state could never be a state the door accepts and this
// control cannot show.

import { StatusStepper, type StepperTone } from "@kwapso/ui/registry/primitives/status-stepper/status-stepper"

import { STORY_STATUSES, type StoryStatus } from "@shared/types"

const LABELS: Record<StoryStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
}
const STAGES = STORY_STATUSES.map((value) => ({ value, label: LABELS[value] }))

// Waiting / in-motion / done, in the same semantic tones the ticket stepper uses
// so a status looks the same colour wherever it appears. `in_review` is a success
// tone before `done`: the work IS finished, and only the checking is left.
const TONES: Record<string, StepperTone> = {
  open: "neutral",
  in_progress: "warning",
  in_review: "success",
  done: "success",
}

export function StoryStatusStepper({
  status,
  canEdit,
  onChange,
  busy,
}: {
  status: StoryStatus
  canEdit: boolean
  onChange: (next: StoryStatus) => void
  busy?: boolean
}) {
  function change(stage: string) {
    if (stage !== status) onChange(stage as StoryStatus)
  }

  return (
    <StatusStepper
      stages={STAGES}
      value={status}
      tones={TONES}
      disabled={!canEdit || busy}
      onChange={canEdit ? change : undefined}
    />
  )
}
