// Marketing routes — the agency's own outbound posts. The shape every content
// module here uses: the shared gated opening (teamContext + requireRight on the
// `marketing` module + a defensive body read) → refuse a client login → validate
// at the boundary → the lib → publishChange (row id + op) so open lists patch
// just that row.
//
// R21 ON BOTH HALVES, EVERY DOOR. This module is the agency's own material —
// what WE publish about ourselves — so there is no fenced slice of it to serve a
// client, only a refusal. Every handler below says so itself rather than relying
// on the Client role not carrying `marketing:read`: a defence that survives only
// because of a permission matrix somebody may change tomorrow is a defence with
// a date on it (web/test/module-refusal-symmetry.test.ts).

import { refusePortalCaller } from "@shared/workers/account-scope"
import { fail, json } from "@shared/workers/http"
import { csvResponse, exportTooLarge, toCsv } from "@shared/workers/csv"
import { EXPORT_HARD_CAP } from "@shared/workers/limits"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { gated, gatedBody } from "@shared/workers/route"
import {
  countMarketingPosts,
  createMarketingPost,
  listMarketingPosts,
  listMarketingPostsForExport,
  setMarketingPostActive,
  updateMarketingPost,
  type MarketingPostInput,
} from "../lib/marketing"
import type { Env } from "../env"

export async function getMarketing(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "marketing", "read")
  await refusePortalCaller(cfg, guard)
  const posts = await listMarketingPosts(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id") // ?id= → one post
  // R16: the exact server total rides every list response (badges never use rows.length).
  return json({
    posts: id ? posts.filter((p) => p.id === id) : posts,
    total: await countMarketingPosts(cfg, guard),
  })
}

/** GET /api/content/marketing/export — every post as a CSV download. The
 * cross-cutting rule: EXPORT NEEDS READ (import needs create). Columns lead with
 * the import format so an exported file round-trips straight back in. */
export async function getMarketingExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "marketing", "read")
  await refusePortalCaller(cfg, guard)
  const { rows, complete } = await listMarketingPostsForExport(cfg, guard)
  // Whole, or an error — never a short file that looks like the whole library.
  if (!complete)
    return exportTooLarge(EXPORT_HARD_CAP, "posts", "Archive the campaigns you no longer publish, then export again.")
  const csv = toCsv(
    ["title", "channel", "status", "summary", "body", "link", "publishedOn", "active", "created_at", "created_by", "updated_at", "updated_by"],
    rows.map((p) => [
      p.title, p.channel, p.status, p.summary, p.body, p.link, p.published_on,
      p.deactivated_at == null, p.created_at, p.creator_name, p.updated_at, p.editor_name,
    ])
  )
  return csvResponse("marketing.csv", csv)
}

export async function postCreateMarketing(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<MarketingPostInput>(request, env, "marketing", "create")
  await refusePortalCaller(cfg, guard)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  const id = await createMarketingPost(cfg, guard, actor, body)
  // Row-level: carry the new post's id so open lists patch just that row.
  await publishChange(env, guard.teamId, "marketing_posts", id, "add")
  return json({ posts: await listMarketingPosts(cfg, guard), total: await countMarketingPosts(cfg, guard) })
}

export async function postUpdateMarketing(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<MarketingPostInput & { id?: string }>(
    request, env, "marketing", "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Post", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  await updateMarketingPost(cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "marketing_posts", id)
  return json({ posts: await listMarketingPosts(cfg, guard), total: await countMarketingPosts(cfg, guard) })
}

/** Archive / restore a post — never deleted (a campaign's history survives it).
 * Gated by marketing:delete (archiving is our "delete" in the deactivate model). */
export async function postSetMarketingActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request, env, "marketing", "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Post", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "id and active are required.")
  // R17: a no-op repeat moves zero rows → no ping, no duplicate history.
  const changed = await setMarketingPostActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "marketing_posts", id)
  return json({ posts: await listMarketingPosts(cfg, guard), total: await countMarketingPosts(cfg, guard) })
}
