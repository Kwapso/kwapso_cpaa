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
import { d1ExecScript, d1Query, sqlString, sqlValue, type D1Rest } from "@shared/workers/d1-rest"
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
  await insertAttachment(cfg, guard, actor, storyId, { ...input, label })
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

/** ONE attachment on a story, or null — the row a rename or a replace is ABOUT.
 *
 * A write needs it for two different reasons and both are real: a rename has to
 * tell "no such attachment" (404) apart from "renamed it to what it already
 * said" (a no-op, R17), which a bare UPDATE cannot; and a replace has to carry
 * the old row's KIND and LABEL onto the new one, because "swap this file for the
 * right one" does not also mean "and rename it". */
export async function getStoryAttachment(
  cfg: D1Rest,
  guard: MemberGuard,
  storyId: string,
  attachmentId: string
): Promise<StoryAttachment | null> {
  const rows = await d1Query<AttachmentRow>(
    cfg,
    guard.databaseId,
    `SELECT ${COLS} FROM story_attachments
      WHERE id = ? AND story_id = ? AND deactivated_at IS NULL LIMIT 1`,
    [attachmentId, storyId]
  )
  return rows[0] ? toAttachment(rows[0]) : null
}

/** THE ROW, written once, for the three doors that write one. `addStoryAttachment`
 * and `replaceStoryAttachment` differ in what they do BEFORE the insert (a cap
 * check; a deactivation) and in the history they write AFTER it — never in the
 * columns, and a second copy of this statement is how one of them quietly
 * acquires a column the other does not set. */
async function insertAttachment(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  storyId: string,
  input: { kind: "file" | "link"; label: string; url: string; contentType?: string | null; sizeBytes?: number | null }
): Promise<void> {
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO story_attachments (id, story_id, kind, label, url, content_type, size_bytes, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(ulid())}, ${sqlString(storyId)}, ${sqlString(input.kind)}, ${sqlString(input.label)}, ${sqlString(input.url)}, ${sqlString(input.contentType ?? null)}, ${sqlValue(input.sizeBytes ?? null)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
}

/** RENAME — and it is the ONLY edit that happens IN PLACE. See
 * `replaceStoryAttachment` below for why the other one does not.
 *
 * A label is what we CALL the thing; the file's bytes and the link's address ARE
 * the thing. Changing what a document is called throws away nothing anybody
 * could later need — the object is the same object, the URL is the same URL, and
 * the audit block already on the row still says who put it there. So there is no
 * reference to preserve and nothing for deactivate-not-delete to protect.
 *
 * R17: the current label rides the UPDATE, so renaming a file to the name it
 * already has moves zero rows, writes no history and pings nobody. */
export async function renameStoryAttachment(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  storyId: string,
  attachmentId: string,
  label: string
): Promise<{ moved: boolean; attachments: StoryAttachment[] }> {
  const clean = requireText(label, "Name", TEXT_LIMITS.short)
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE story_attachments SET label = ?
      WHERE id = ? AND story_id = ? AND deactivated_at IS NULL AND label <> ? RETURNING id`,
    [clean, attachmentId, storyId, clean]
  )
  const attachments = await listStoryAttachments(cfg, guard, storyId)
  if (!changed[0]) return { moved: false, attachments }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Story attachment renamed",
    description: `${actor.name} renamed an attachment to ${clean}`,
    relatedTable: "stories",
    relatedRowId: storyId,
  })
  return { moved: true, attachments }
}

/** REPLACE — a NEW ROW plus a deactivation of the old one, and deliberately not
 * an UPDATE of the old one's `url`.
 *
 * THE DECISION, stated once so nobody has to re-derive it. Deactivate-never-delete
 * is not a rule about the DELETE keyword, it is a rule about references: this
 * module keeps a removed screenshot's row "so a removed screenshot leaves an
 * audit block behind rather than a hole". Overwriting `url` in place would leave
 * the audit block and destroy the very thing it is an audit OF — the row would
 * say who attached something and no longer say WHAT, while the old object sat in
 * the bucket reachable by nobody and named by nothing. Two rows keep both
 * sentences true: the old one still names the wrong file and who put it there,
 * the new one names the right file and who fixed it.
 *
 * And it is what the ask actually said: fix it "without the record showing
 * both". The old row is deactivated in the same breath, so the story shows one
 * file — the right one — while the history still shows two.
 *
 * ONE LINE OF HISTORY, not a removal followed by an addition. A replace is one
 * act a person performed; writing it as two would put a hole in the story's
 * activity feed that reads as somebody deleting the evidence and then thinking
 * better of it.
 *
 * NO CAP CHECK, on purpose: one row out, one row in, so the count `addStoryAttachment`
 * guards cannot move. Refusing a replace at the cap would tell somebody holding
 * the wrong file that they must take it off before they may put the right one on,
 * which is the cap protecting the table from a write that does not grow it.
 *
 * R17: the deactivation carries `deactivated_at IS NULL`, so a double-submit
 * moves zero rows — and then nothing is inserted either, because the second call
 * has nothing to replace. */
export async function replaceStoryAttachment(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  storyId: string,
  current: StoryAttachment,
  next: { label?: string; url: string; contentType?: string | null; sizeBytes?: number | null }
): Promise<{ moved: boolean; attachments: StoryAttachment[] }> {
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE story_attachments SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?, deactivator_name = ?
      WHERE id = ? AND story_id = ? AND deactivated_at IS NULL RETURNING id`,
    [now, actor.id, actor.email, actor.name, current.id, storyId]
  )
  if (!changed[0]) return { moved: false, attachments: await listStoryAttachments(cfg, guard, storyId) }
  // The old row's label unless a new one came with the new bytes — swapping a
  // file for the right one does not also mean renaming it.
  const label = requireText(next.label ?? current.label, "Name", TEXT_LIMITS.short)
  await insertAttachment(cfg, guard, actor, storyId, {
    kind: current.kind,
    label,
    url: next.url,
    contentType: next.contentType ?? null,
    sizeBytes: next.sizeBytes ?? null,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: current.kind === "file" ? "Story file replaced" : "Story link replaced",
    // What it WAS, because that is the half the new row cannot say and the half
    // somebody reading the feed a week later is looking for.
    description: `${actor.name} replaced ${current.label} with ${label}`,
    relatedTable: "stories",
    relatedRowId: storyId,
  })
  return { moved: true, attachments: await listStoryAttachments(cfg, guard, storyId) }
}
