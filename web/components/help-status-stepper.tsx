"use client"

// Ticket status as a left-to-right STEPPER (not a dropdown): New → Triaged →
// In progress → Ready → Resolved, conveying start / in-motion / done by colour +
// fill (left-to-right fill = progress). Clicking a stage moves the ticket there
// (gated by help:edit). The server (lib/help setStatus) validates the fixed
// lifecycle, so the stepper can't invent an illegal state.
//
// FIVE STAGES, ALL REAL, and that is the change the work engine made here. The
// old three folded `reopened` onto "Open" with a pill, because `reopened` was a
// state that meant "Open, again". The five states SCOPE ch.07 names have no such
// passenger: every one of them is a place a ticket genuinely sits, so the track
// draws them all and the host has no special case left to keep.
//
// REOPENING still exists — it is just not a state any more. A staff member moves
// a resolved ticket back to Triaged, which is what reopening always meant. There
// is deliberately no client-side reopen button: the client comments, and we
// decide (SCOPE ch.07).
//
// Built on the library StatusStepper primitive; the library's own TicketStatus
// vocabulary has four values and is not ours to extend (UI-CONVENTIONS, "the
// library is lego"), so the mapping onto it lives in help-detail.

import { StatusStepper, type StepperTone } from "@kwapso/ui/registry/primitives/status-stepper/status-stepper"

import { HELP_STATUSES, type HelpStatus } from "@shared/types"

/** The ticket's status, named the way this screen talks about it. One list, in
 * shared/types — the server validates against the very same one. */
export type HelpStatusValue = HelpStatus

/** The track, in order. DERIVED from the one list rather than retyped beside it:
 * a sixth state would otherwise be a state the server accepts and the stepper
 * cannot show, which is the shape of every drift bug this repo has had. */
const LABELS: Record<HelpStatus, string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  ready: "Ready",
  resolved: "Resolved",
}
const STAGES = HELP_STATUSES.map((value) => ({ value, label: LABELS[value] }))

// Per-stage tone (waiting / in-motion / done) — the same semantic tokens the
// library Badge variants use, so the stepper matches the rest of the app's
// status colours. `ready` is a success tone before `resolved`: the work IS
// finished, and only the telling is left.
const TONES: Record<string, StepperTone> = {
  new: "neutral",
  triaged: "neutral",
  in_progress: "warning",
  ready: "success",
  resolved: "success",
}

export function HelpStatusStepper({
  status,
  canEdit,
  onChange,
  busy,
}: {
  status: HelpStatusValue
  canEdit: boolean
  onChange: (next: HelpStatusValue) => void
  busy?: boolean
}) {
  function change(stage: string) {
    if (stage !== status) onChange(stage as HelpStatusValue)
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
