// FILES AND LINKS ON A TICKET (CHECKLIST 5.10) — "several files and several
// links on one ticket, from BOTH front doors".
//
// ONE TABLE FOR BOTH KINDS, deliberately. "Here is the thing I mean" is one act:
// a screenshot and a Loom link are the same sentence in a conversation, and two
// tables would have meant two lists, two counts, two orderings and two ways to be
// wrong about which came first. `kind` decides only how `url` is READ — a key
// inside the shared media bucket, or an address a browser follows.
//
// WHY THE SHARED `MEDIA` BUCKET AND NOT `HELP_MEDIA`. Both gateways already serve
// `/media/*` from `MEDIA` (workers/gateway/src/index.ts, workers/portal-gateway/
// src/index.ts); `HELP_MEDIA` is bound on this worker and served by neither. "From
// both front doors" is the requirement, and a bucket a client's browser cannot
// read the file back out of does not meet it. The alternative was a new route and
// a new binding on two public workers to reach a bucket that would then hold
// exactly what the shared one holds. See EDGE-CASES on capability URLs: the key
// carries a ULID, so it is unguessable, and the fence below is what decides who
// is TOLD the key.
//
// THE FENCE IS THE TICKET'S FENCE, one table along — the same shape
// `threadFence` has: an attachment belongs to a ticket, so "may I see this file?"
// is exactly "may I see this ticket?". Expressed as a subquery so it rides the
// same WHERE as the rows AND the count.
//
// DEACTIVATE, NEVER DELETE. Removing an attachment hides the row; the object
// stays in the bucket and the audit block says who took it off. A client who
// attached the wrong screenshot can take it off their own ticket while the
// wording is still theirs — the same lock that governs the wording, for the same
// reason.

import { logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, sqlValue, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import type { AccountScope } from "@shared/workers/account-scope"
import { TICKET_ATTACHMENT_CAP } from "@shared/workers/limits"
import { requireText, TEXT_LIMITS } from "@shared/workers/validate"
import type { HelpAttachment } from "@shared/types"
import { ticketFence } from "./help"

type AttachmentRow = {
  id: string
  help_id: string
  kind: string
  label: string
  url: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
  creator_name: string | null
  from_client: number
}

/** WHOSE NAME TRAVELS ON AN ATTACHMENT — `listReplies`'s rule, one table along.
 * A client login is told the names of the people on THEIR side of the fence and
 * nothing about ours (SCOPE ch.06). A file our developer attached arrives with no
 * name for the portal to render as a person. */
function toAttachment(r: AttachmentRow, scope: AccountScope): HelpAttachment {
  const hide = scope.kind === "portal" && r.from_client !== 1
  return {
    id: r.id,
    ticketId: r.help_id,
    // A kind the code does not know reads as a LINK, which is the safe direction:
    // a link is rendered as text a person clicks, while a file is rendered as a
    // capability URL into the bucket. Guessing "file" about a row that is not one
    // would point the browser at an object that is not there.
    kind: r.kind === "file" ? "file" : "link",
    label: r.label,
    url: r.url,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    addedByName: hide ? null : r.creator_name,
  }
}

const ATTACHMENT_COLS = `id, help_id, kind, label, url, content_type, size_bytes, created_at, creator_name,
  EXISTS (SELECT 1 FROM portal_users pu WHERE pu.user_id = help_attachments.creator_id) AS from_client`

/** The ticket fence, expressed over `help_attachments.help_id`. */
function attachmentFence(guard: MemberGuard, scope: AccountScope): { sql: string; params: string[] } {
  const fence = ticketFence(guard, scope, "all", "h")
  if (!fence.sql) return { sql: "", params: [] }
  return {
    sql: ` AND EXISTS (SELECT 1 FROM help h WHERE h.id = help_id AND ${fence.sql})`,
    params: fence.params,
  }
}

/** Everything attached to a ticket, oldest first (the order somebody added them).
 * R14: hard-capped at TICKET_ATTACHMENT_CAP, which is also what `addAttachment`
 * refuses past — so the list can always be read to its end. */
export async function listAttachments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  ticketId: string
): Promise<HelpAttachment[]> {
  const fence = attachmentFence(guard, scope)
  const rows = await d1Query<AttachmentRow>(
    cfg,
    guard.databaseId,
    `SELECT ${ATTACHMENT_COLS} FROM help_attachments
      WHERE help_id = ? AND deactivated_at IS NULL${fence.sql}
      ORDER BY created_at ASC, id ASC LIMIT ${TICKET_ATTACHMENT_CAP}`, // R14 hard cap
    [ticketId, ...fence.params]
  )
  return rows.map((r) => toAttachment(r, scope))
}

/** R16: the exact server COUNT(*) the tab badge shows, over the same fence and
 * the same "still attached" question the list asks. */
export async function countAttachments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  ticketId: string
): Promise<number> {
  const fence = attachmentFence(guard, scope)
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM help_attachments
      WHERE help_id = ? AND deactivated_at IS NULL${fence.sql}`,
    [ticketId, ...fence.params]
  )
  return rows[0]?.n ?? 0
}

/** Attach a file (already in the bucket) or a link. The caller has resolved the
 * ticket through the fence and, for a file, put the bytes in the bucket — this
 * writes the row.
 *
 * CAPPED AT THE WRITE, not only at the read: a list bounded at fifty over a table
 * holding five hundred is a list with an invisible end. Refused in words rather
 * than truncated. */
export async function addAttachment(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  ticketId: string,
  input: { kind: "file" | "link"; label: string; url: string; contentType?: string | null; sizeBytes?: number | null }
): Promise<HelpAttachment[]> {
  const existing = await countAttachments(cfg, guard, scope, ticketId)
  if (existing >= TICKET_ATTACHMENT_CAP)
    throw new GuardError(
      400,
      "too_many",
      `A ticket holds up to ${TICKET_ATTACHMENT_CAP} files and links. Take one off first.`
    )
  const label = requireText(input.label, "Name", TEXT_LIMITS.short)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO help_attachments (id, help_id, kind, label, url, content_type, size_bytes, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(ulid())}, ${sqlString(ticketId)}, ${sqlString(input.kind)}, ${sqlString(label)}, ${sqlString(input.url)}, ${sqlString(input.contentType ?? null)}, ${sqlValue(input.sizeBytes ?? null)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: input.kind === "file" ? "Ticket file added" : "Ticket link added",
    description: `${actor.name} attached ${label}`,
    relatedTable: "help",
    relatedRowId: ticketId,
  })
  return listAttachments(cfg, guard, scope, ticketId)
}

/** Take one off. R17: `deactivated_at IS NULL` rides the UPDATE, so a second
 * press moves zero rows and writes no second line of history. */
export async function removeAttachment(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  ticketId: string,
  attachmentId: string
): Promise<{ moved: boolean; attachments: HelpAttachment[] }> {
  const fence = attachmentFence(guard, scope)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help_attachments SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?, deactivator_name = ?
      WHERE id = ? AND help_id = ? AND deactivated_at IS NULL${fence.sql} RETURNING id`,
    [now, actor.id, actor.email, actor.name, attachmentId, ticketId, ...fence.params]
  )
  const attachments = await listAttachments(cfg, guard, scope, ticketId)
  if (!changed[0]) return { moved: false, attachments }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Ticket attachment removed",
    description: `${actor.name} took a file or link off the ticket`,
    relatedTable: "help",
    relatedRowId: ticketId,
  })
  return { moved: true, attachments }
}
