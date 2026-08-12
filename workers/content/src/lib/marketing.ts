// MARKETING — what the agency publishes about ITSELF: 251 posts across six
// channels in the legacy Glide app, and the record of two years of them.
//
// The three module rules, enforced here on the server rather than by the form:
//   • deactivate-not-delete (ARCHITECTURE §4) — a post is retired, never removed,
//     so a campaign's history survives the campaign;
//   • channel and status are PICK-OR-CREATE against their dropdown groups, so
//     six channels stay a canonical six instead of six spellings;
//   • `publishedOn` is a DATE, and a value that isn't one is refused rather than
//     stored — a malformed date sorts wrongly forever and nobody notices.
//
// THE LIST IS CAPPED, NOT PAGED, and that is a decision rather than an oversight
// (R14). Posts accumulate — but so do learning articles, and this is the same
// kind of collection: an AUTHORED library that a team curates, not a feed that
// events pour into. The base draws its paging line there on purpose (tickets,
// the activity feed, accounts and process maps page; the learning library caps),
// and two years of the agency's real output is 251 rows against a 1,000 ceiling.
// If that ever stops being true the honest fix is a GROWING_COLLECTIONS line and
// a cursor, not a bigger number.

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { EXPORT_HARD_CAP, LIST_HARD_CAP } from "@shared/workers/limits"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import type { MarketingPost } from "@shared/types"
import { ensureSelectableValue } from "./vocabulary"
import { optionalDate, safeExternalLink } from "./internal-fields"

/** Raw marketing_posts row (DB column names). */
type PostRow = {
  id: string
  title: string
  channel: string | null
  status: string | null
  summary: string | null
  body: string | null
  link: string | null
  published_on: string | null
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

function toPost(r: PostRow): MarketingPost {
  return {
    id: r.id,
    title: r.title,
    channel: r.channel,
    status: r.status,
    summary: r.summary,
    body: r.body,
    link: r.link,
    publishedOn: r.published_on,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

const COLUMNS = `id, title, channel, status, summary, body, link, published_on,
                 deactivated_at, created_at, creator_name, updated_at, editor_name`

/** Every post (active + retired), newest first. R14 hard cap — see the header. */
export async function listMarketingPosts(cfg: D1Rest, guard: MemberGuard): Promise<MarketingPost[]> {
  const rows = await d1Query<PostRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: an authored library, capped like Learning's.
    `SELECT ${COLUMNS} FROM marketing_posts
      ORDER BY COALESCE(published_on, created_at) DESC, created_at DESC LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map(toPost)
}

/** R16: the exact server COUNT(*) the badge shows — never rows.length. */
export async function countMarketingPosts(cfg: D1Rest, guard: MemberGuard): Promise<number> {
  const rows = await d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM marketing_posts")
  return rows[0]?.n ?? 0
}

/** Fetch a post in this team, or throw a clean 404. */
async function postOrThrow(cfg: D1Rest, guard: MemberGuard, id: string): Promise<PostRow> {
  const rows = await d1Query<PostRow>(cfg, guard.databaseId, `SELECT ${COLUMNS} FROM marketing_posts WHERE id = ?`, [id])
  if (!rows[0]) throw new GuardError(404, "marketing_post_not_found", "That post doesn't exist.")
  return rows[0]
}

/** The editable surface — the same field set on create and edit, so the two can
 * never drift into different shapes. */
export type MarketingPostInput = {
  title?: string
  channel?: string
  status?: string
  summary?: string
  body?: string
  link?: string
  publishedOn?: string
}

/** Every field, validated once, in the one place both writes go through. Doing
 * this twice — once in create, once in update — is how the two ended up
 * accepting different things in every codebase that has ever tried it. */
async function clean(cfg: D1Rest, guard: MemberGuard, actor: Actor, input: MarketingPostInput) {
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)
  const channel = optionalText(input.channel, "Channel", TEXT_LIMITS.short) ?? null
  const status = optionalText(input.status, "Status", TEXT_LIMITS.short) ?? null
  if (channel) await ensureSelectableValue(cfg, guard, actor, SELECTABLE_GROUPS.channel, channel)
  if (status) await ensureSelectableValue(cfg, guard, actor, SELECTABLE_GROUPS.marketingStatus, status)
  return {
    title,
    channel,
    status,
    summary: optionalText(input.summary, "Summary", TEXT_LIMITS.short) ?? null,
    body: optionalText(input.body, "Body", TEXT_LIMITS.long) ?? null,
    link: safeExternalLink(optionalText(input.link, "Link", TEXT_LIMITS.link)),
    publishedOn: optionalDate(input.publishedOn, "Published on"),
  }
}

export async function createMarketingPost(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: MarketingPostInput
): Promise<string> {
  const v = await clean(cfg, guard, actor, input)
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO marketing_posts (id, title, channel, status, summary, body, link, published_on, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(v.title)}, ${sqlString(v.channel)}, ${sqlString(v.status)}, ${sqlString(v.summary)}, ${sqlString(v.body)}, ${sqlString(v.link)}, ${sqlString(v.publishedOn)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Marketing post created",
    description: `${actor.name} added the "${v.title}" post`,
    relatedTable: "marketing_posts",
    relatedRowId: id,
  })
  return id
}

export async function updateMarketingPost(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: MarketingPostInput
): Promise<void> {
  const before = await postOrThrow(cfg, guard, id)
  const v = await clean(cfg, guard, actor, input)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE marketing_posts SET title = ${sqlString(v.title)}, channel = ${sqlString(v.channel)}, status = ${sqlString(v.status)}, summary = ${sqlString(v.summary)}, body = ${sqlString(v.body)}, link = ${sqlString(v.link)}, published_on = ${sqlString(v.publishedOn)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )
  const changes = describeChanges([
    { label: "Title", from: before.title, to: v.title },
    { label: "Channel", from: before.channel, to: v.channel },
    { label: "Status", from: before.status, to: v.status },
    { label: "Summary", from: before.summary, to: v.summary },
    { label: "Link", from: before.link, to: v.link },
    { label: "Published on", from: before.published_on, to: v.publishedOn },
    { label: "Body", from: before.body, to: v.body, hideValues: true },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Marketing post edited",
    description: `${actor.name} edited the "${v.title}" post${changes ? ` — ${changes}` : ""}`,
    relatedTable: "marketing_posts",
    relatedRowId: id,
  })
}

/** Retire or restore a post. R17: the current-status predicate rides the UPDATE,
 * so a double click moves zero rows and writes no second line of history. */
export async function setMarketingPostActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const before = await postOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE marketing_posts SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE marketing_posts SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Marketing post restored" : "Marketing post archived",
    description: `${actor.name} ${active ? "restored" : "archived"} the "${before.title}" post`,
    relatedTable: "marketing_posts",
    relatedRowId: id,
  })
  return true
}

/** AN EXPORT IS ONE WHOLE DOCUMENT, OR IT IS AN ERROR — the columns lead with the
 * import format, so a short file re-imported is a library that quietly lost its
 * tail (shared/workers/csv exportTooLarge says the same thing for Learning). */
export async function listMarketingPostsForExport(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ rows: PostRow[]; complete: boolean }> {
  const rows = await d1Query<PostRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap (export tier). +1 is how "there was more" is known without a
    // second query.
    `SELECT ${COLUMNS} FROM marketing_posts
      ORDER BY COALESCE(published_on, created_at) DESC LIMIT ${EXPORT_HARD_CAP + 1}`
  )
  return { rows: rows.slice(0, EXPORT_HARD_CAP), complete: rows.length <= EXPORT_HARD_CAP }
}
