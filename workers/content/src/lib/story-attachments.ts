// WHAT A STORY SHOWS FOR ITSELF — the files and links that go with "come and
// look at this".
//
// THE RULING (owner, 19 Aug 2026): "An explanation text plus one or more files
// or images are required to send a story for review." A story used to carry ONE
// typed-in link and nothing else, which meant the proof of a week's work was a
// URL somebody pasted by hand, or nothing at all.
//
// IT IS `help-attachments.ts` ONE TABLE ALONG, and deliberately so rather than
// something cleverer: one table for files AND links, because "here is the thing
// I mean" is one act and two tables would be two lists, two counts and two
// orderings; `kind` decides only how `url` is READ; the shared `MEDIA` bucket,
// because that is the one both gateways serve; deactivate, never delete, so a
// removed screenshot leaves an audit block behind rather than a hole.
//
// NO ACCOUNT FENCE, and that is the difference from the ticket version. A story
// is the agency's own work — the portal has no stories screen and its gateway
// forwards no stories door — so the fence a ticket needs (a client may see their
// own and nobody else's) has nothing to decide here. The doors refuse a portal
// caller outright instead, which is R21 at the door and the stronger statement.

import { logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { STORY_ATTACHMENT_CAP } from "@shared/workers/limits"
import { requireText, TEXT_LIMITS } from "@shared/workers/validate"
import type { StoryAttachment } from "@shared/types"

type AttachmentRow = {
  id: string
  story_id: string
  kind: string
  label: string
  url: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
  creator_name: string | null
}

function toAttachment(r: AttachmentRow): StoryAttachment {
  return {
    id: r.id,
    storyId: r.story_id,
    // A kind the code does not know reads as a LINK, which is the safe
    // direction: a link renders as text a person clicks, while a file renders as
    // a capability URL into the bucket, and guessing "file" about a row that is
    // not one points the browser at an object that is not there.
    kind: r.kind === "file" ? "file" : "link",
    label: r.label,
    url: r.url,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    addedByName: r.creator_name,
  }
}

const COLS = `id, story_id, kind, label, url, content_type, size_bytes, created_at, creator_name`

/** Everything attached to a story, oldest first — the order somebody added them.
 * R14: hard-capped at STORY_ATTACHMENT_CAP, which is also what `addStoryAttachment`
 * refuses past, so the list can always be read to its end. */
export async function listStoryAttachments(
  cfg: D1Rest,
  guard: MemberGuard,
  storyId: string
): Promise<StoryAttachment[]> {
  const rows = await d1Query<AttachmentRow>(
    cfg,
    guard.databaseId,
    `SELECT ${COLS} FROM story_attachments
      WHERE story_id = ? AND deactivated_at IS NULL
      ORDER BY created_at ASC, id ASC LIMIT ${STORY_ATTACHMENT_CAP}`, // R14 hard cap
    [storyId]
  )
  return rows.map(toAttachment)
}

/** R16: the exact server COUNT(*), over the same "still attached" question the
 * list asks. It is also what the review gate counts — see `countStoryAttachments`
 * in `refuseUnreviewable`, which is the whole reason this is a COUNT and not a
 * `rows.length` on a capped read. */
export async function countStoryAttachments(
  cfg: D1Rest,
  guard: MemberGuard,
  storyId: string
): Promise<number> {
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM story_attachments WHERE story_id = ? AND deactivated_at IS NULL`,
    [storyId]
  )
  return rows[0]?.n ?? 0
}

/** Attach a file (already in the bucket) or a link. The caller has resolved the
 * story and, for a file, put the bytes in the bucket — this writes the row.
 *
 * CAPPED AT THE WRITE, not only at the read: a list bounded at twenty over a
 * table holding two hundred is a list with an invisible end. */
export async function addStoryAttachment(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  storyId: string,
  input: { kind: "file" | "link"; label: string; url: string; contentType?: string | null; sizeBytes?: number | null }
): Promise<StoryAttachment[]> {
  const existing = await countStoryAttachments(cfg, guard, storyId)
  if (existing >= STORY_ATTACHMENT_CAP)
    throw new GuardError(
      400,
      "too_many",
      `A story holds up to ${STORY_ATTACHMENT_CAP} files and links. Take one off first.`
    )
  const label = requireText(input.label, "Name", TEXT_LIMITS.short)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO story_attachments (id, story_id, kind, label, url, content_type, size_bytes, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(ulid())}, ${sqlString(storyId)}, ${sqlString(input.kind)}, ${sqlString(label)}, ${sqlString(input.url)}, ${sqlString(input.contentType ?? null)}, ${input.sizeBytes ?? "NULL"}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: input.kind === "file" ? "Story file added" : "Story link added",
    description: `${actor.name} attached ${label}`,
    relatedTable: "stories",
    relatedRowId: storyId,
  })
  return listStoryAttachments(cfg, guard, storyId)
}

/** Take one off. R17: `deactivated_at IS NULL` rides the UPDATE, so a second
 * press moves zero rows and writes no second line of history. */
export async function removeStoryAttachment(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  storyId: string,
  attachmentId: string
): Promise<{ moved: boolean; attachments: StoryAttachment[] }> {
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE story_attachments SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?, deactivator_name = ?
      WHERE id = ? AND story_id = ? AND deactivated_at IS NULL RETURNING id`,
    [now, actor.id, actor.email, actor.name, attachmentId, storyId]
  )
  const attachments = await listStoryAttachments(cfg, guard, storyId)
  if (!changed[0]) return { moved: false, attachments }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Story attachment removed",
    description: `${actor.name} took a file or link off the story`,
    relatedTable: "stories",
    relatedRowId: storyId,
  })
  return { moved: true, attachments }
}
