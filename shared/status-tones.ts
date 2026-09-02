// STATUS → COLOUR, for the two record types whose lifecycle is more than a
// single open/closed switch: the ticket (seven stages) and the story (four).
//
// CLIENT RULING, 2026-08-31, verbatim: "the status scheme is not only for
// tickets, identify everywhere where there are status and we need to map
// colors." `shared/app-stages.ts` already answered this for an app's eight
// stages; this file is the same answer for the other two multi-stage
// lifecycles, kept beside neither `types.ts` (which knows nothing of `Badge`)
// nor the stepper components (which draw the TRACK, not the header chip).
//
// THE SIX TONES ARE `Badge`'s OWN (shared/ui/components/badge/badge.tsx) —
// `shipped`, `building`, `review`, `blocked`, `archived`, `done` — never an
// invented seventh (R32, the closed palette). Two of the six render the exact
// same colour (`--dot-shipped` / `--dot-done` both resolve to the forest
// green — badge.tsx's own DOT_FILL), so the split between them here is a
// NAMING one: `shipped` means the record's lifecycle has reached its final,
// closed-out state; `done` means the work itself is finished but the record
// is not yet closed (a ticket with every story done, waiting to be told to
// the client — the reviewer has not pressed the last button yet). That is the
// same reading `shared/app-stages.ts` gives its own two greens: "Completed"
// (closed) is `shipped`; "Maintenance" (still live, still healthy) is `done`.
//
// THE TIERING IS THE SAME SHAPE AS APP-STAGES.TS, READ ACROSS BOTH TRACKS:
//   archived  — nothing has happened yet (App's "Not started"; a ticket just
//               raised and unread; a story nobody has picked up).
//   review    — a person needs to look at it, or has just started to (App's
//               "Blueprint", still being scoped; a ticket somebody has read
//               but not yet scheduled; a story somebody has asked to be
//               reviewed — the literal name match is not a coincidence).
//   building  — work is actively under way (App's Development/Documentation/
//               Iteration; a ticket that is booked in or has a timer running;
//               a story with a timer on it).
//   done      — the work is finished but the record itself is not closed yet
//               (App's "Maintenance" — live and stable; a ticket whose every
//               story closed but nobody has told the client).
//   shipped   — closed out, successfully (App's "Completed"; a ticket that
//               has been answered; a story the reviewer signed off).
//   blocked   — stuck on somebody OUTSIDE the team, and the one tone this
//               file uses that app-stages.ts never needed, because an app
//               has nobody to wait on but the team itself.
//
// `awaiting_validation` IS `blocked`, NOT INVENTED — it is the client portal's
// OWN existing ruling for this exact status, reused rather than duplicated
// with a different answer: `web-portal/components/ticket-row.tsx`'s
// `STATUS_WORDS` already singles this one stage out with its own distinct
// colour ("warning", which resolves to the same poppy `blocked` draws — the
// kit's palette holds no amber, badge.tsx's own note), with the reason
// written beside it: "the one state where nothing moves until the person
// reading the screen does something." That is what `blocked` means
// everywhere else in this file's tiering, so the two front doors agree about
// this stage without a shared import between them (the portal's copy is
// client-facing words over the same seven-value enum; this file is the
// agency's own words over it, so they stay two files on purpose — R21's
// account-fence reason: no code path may cross the portal/agency line).
import type { DotTone } from "./app-stages"
import type { HelpStatus, StoryStatus } from "./types"

/** A TICKET'S SEVEN STAGES → THE CHIP'S DOT. `Record<HelpStatus, …>` rather
 * than a function with a fallback, on purpose — the same reason the portal's
 * own `STATUS_WORDS` is typed this way (ticket-row.tsx): an eighth stage
 * added to `HELP_STATUSES` fails this file's own type check instead of
 * rendering a chip with no dot. */
export const HELP_STATUS_DOT_TONE: Record<HelpStatus, DotTone> = {
  // Waiting on the CLIENT to say yes — nothing here moves until they do. The
  // portal draws this exact stage in its one attention-getting colour; this
  // is the agency side reusing that same call rather than re-deciding it.
  awaiting_validation: "blocked",
  // Raised, nobody has read it yet — the "Not started" tier.
  new: "archived",
  // Read and sorted, not yet scheduled — the "somebody is looking at this"
  // tier, same as an app still being scoped.
  triaged: "review",
  // Work exists and is booked into a sprint — real, committed motion.
  scheduled: "building",
  // A timer is literally running against it.
  in_progress: "building",
  // Every story closed; nobody has told the client yet.
  ready: "done",
  // The answer was sent. Closed.
  resolved: "shipped",
}

/** The dot tone for a ticket's status. */
export function helpStatusDotTone(status: HelpStatus): DotTone {
  return HELP_STATUS_DOT_TONE[status]
}

/** A STORY'S FOUR STAGES → THE CHIP'S DOT. Same `Record` shape, same reason:
 * a fifth `StoryStatus` fails here rather than rendering silently. */
export const STORY_STATUS_DOT_TONE: Record<StoryStatus, DotTone> = {
  // Written down, nobody has started — the "Not started" tier.
  open: "archived",
  // A timer started on it.
  in_progress: "building",
  // "Ready for review" was pressed — literally the tone's own name.
  in_review: "review",
  // The reviewer pressed Done. Closed.
  done: "shipped",
}

/** The dot tone for a story's status. */
export function storyStatusDotTone(status: StoryStatus): DotTone {
  return STORY_STATUS_DOT_TONE[status]
}
