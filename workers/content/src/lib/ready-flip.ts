// THE TICKET↔STORY TRANSACTION — "closing a story is a transaction with the
// ticket's Ready flip" (.plans/BUILD-1 §2), and the sentence it implements is
// SCOPE ch.07's: a ticket flips to READY when the last of its stories closes.
//
// WHY IT IS ONE CALL AND NOT TWO. The client is watching this. If the last piece
// of work goes done and the request they raised still says "in progress" because
// a second request had not been made yet — or was made and failed — then the
// portal is lying about the thing the portal is FOR. So the flip rides the same
// door as the close, and the route only reaches it when a row actually moved.
//
// WHY "READY" IS NOT "RESOLVED". They are different facts and the difference is
// the whole point of having both: ready means every piece of work is done, and
// resolved means we have TOLD them. Nothing here ever resolves a ticket — a
// person does that, when they send the resolution, which is one of only two
// things in the product that emails a client.
//
// IDEMPOTENT IN TWO PLACES, because there are two ways to arrive twice:
//   • the same close, retried — the story move carries `status <> ?`, so a
//     re-run moves zero rows and the route never calls in here at all;
//   • a ticket already at ready (or resolved) — the predicate below carries
//     `status NOT IN (…)`, so zero rows move, no activity row is written and the
//     route publishes nothing.
// A genuine reopen — somebody pulls the ticket back, adds a story, closes it —
// DOES flip again, and that is correct rather than a leak in "exactly once": the
// promise is that one closing event produces one flip, not that a request may
// only ever be finished once.

import { logActivity, type Actor } from "@shared/workers/activity"
import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import { OPEN_HELP_STATUSES } from "@shared/types"

/** What the flip did, for the route to publish (or not). */
export type ReadyFlip = {
  /** true only when a row genuinely moved — the route's publish condition (R1+R17) */
  moved: boolean
  accountId: string | null
  /** how much work is still outstanding on the ticket, after this close */
  outstanding: number
}

/** THE STATES A FLIP MAY MOVE A TICKET OUT OF.
 *
 * Derived from the ticket's own open-state list rather than retyped, minus
 * `ready` itself: a ticket that is already ready has nothing to move, and one
 * that is RESOLVED has been answered — dragging it backwards to "ready" because
 * somebody closed a straggler story would un-answer a request in front of the
 * client who read the answer. */
const FLIPPABLE = OPEN_HELP_STATUSES.filter((s) => s !== "ready")

/** Append one story's closing note to the ticket's DRAFT resolution.
 *
 * A draft, never a message (migration 0011: "it becomes a reply only when a
 * person sends it"). The notes accumulate in the order the work finished, which
 * is the order somebody would say them out loud, and the person sending the
 * resolution edits the result — they are not composing from a blank page at the
 * end of a fortnight, which is the whole reason the column exists.
 *
 * Appended in the UPDATE itself (`COALESCE(draft_resolution, '') || ?`) rather
 * than read-then-written, so two stories closing in the same instant cannot each
 * append to the version of the draft that existed before the other. */
async function appendDraft(
  cfg: D1Rest,
  guard: MemberGuard,
  ticketId: string,
  note: string
): Promise<void> {
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE help SET draft_resolution =
       CASE WHEN draft_resolution IS NULL OR draft_resolution = '' THEN ?
            ELSE draft_resolution || char(10) || char(10) || ? END
     WHERE id = ?`,
    [note, note, ticketId]
  )
}

/** Close the ticket half of a story close.
 *
 * `closingNote` is what the story said we would tell the client; it lands in the
 * ticket's draft whether or not this was the last piece of work.
 *
 * NO ACCOUNT FENCE, and that is not an omission. Every door that reaches this
 * refuses a client login outright (routes/stories.ts), so the only caller is
 * staff, for whom the fence is no clause at all. The ticket is resolved by the
 * id the STORY carries — a value written through the story door, never a value
 * a request supplied here. */
export async function readyFlipForTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  ticketId: string,
  closingNote: string | null
): Promise<ReadyFlip> {
  if (closingNote) await appendDraft(cfg, guard, ticketId, closingNote)

  // How much work is still open on this request, and how much there is at all.
  // Both in one read: "nothing outstanding" is only a flip when there was
  // something in the first place — a ticket with no stories has not finished its
  // work, it has never had any.
  const counts = await d1Query<{ total: number; outstanding: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status <> 'done' THEN 1 ELSE 0 END) AS outstanding
       FROM stories WHERE ticket_id = ?`, // R14: one aggregate row
    [ticketId]
  )
  const total = counts[0]?.total ?? 0
  const outstanding = counts[0]?.outstanding ?? 0

  const before = await d1Query<{ account_id: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT account_id FROM help WHERE id = ? LIMIT 1`,
    [ticketId]
  )
  const accountId = before[0]?.account_id ?? null
  if (total === 0 || outstanding > 0) return { moved: false, accountId, outstanding }

  const now = new Date().toISOString()
  // R17 — the current-status predicate rides the UPDATE. `status IN (…)` rather
  // than `status <> 'ready'`, so the statement itself says which states a flip is
  // allowed to move a ticket out of, and a resolved ticket is not one of them.
  //
  // The lock closes here too, for the same reason every other staff touch closes
  // it: work finishing on a request is about as read as a request gets.
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET status = 'ready', resolved = 0, resolved_at = NULL,
       resolver_id = NULL, resolver_email = NULL, resolver_name = NULL,
       locked_at = COALESCE(locked_at, ?), updated_at = ?,
       editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ? AND status IN (${FLIPPABLE.map(() => "?").join(", ")}) RETURNING id`,
    [now, now, actor.id, actor.email, actor.name, ticketId, ...FLIPPABLE]
  )
  if (!changed[0]) return { moved: false, accountId, outstanding }

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Ticket ready",
    description: `Every piece of work on this ticket is done — ${total} ${total === 1 ? "story" : "stories"}`,
    relatedTable: "help",
    relatedRowId: ticketId,
  })
  return { moved: true, accountId, outstanding: 0 }
}
