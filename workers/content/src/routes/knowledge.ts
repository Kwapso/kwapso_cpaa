// Knowledge-base routes: list the sources the assistant may read, ask it a
// question, add / correct / take away a source, and bring the base back into
// step with the app's own rows. Same opening as every other content route —
// gated (`knowledge` module), validated at the boundary, published after a
// write — plus the one thing this module adds to that habit:
//
// EVERY DOOR HERE REFUSES A CLIENT LOGIN, AT THE DOOR (R21). The knowledge base
// holds the agency's internal material — its process notes, its own tickets,
// what it knows about each client — so there is no fenced slice of it to serve a
// client; there is a refusal. The refusal is written on each handler rather than
// left to the portal gateway's allow-list, because the agency gateway forwards
// by PREFIX and a client login is an ordinary team member: a door not named on
// the portal's list is still served to them at the other hostname. That mistake
// has been made twice in this codebase and caught twice.

import { fail, json, pagedJson } from "@shared/workers/http"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import {
  countSources,
  createSource,
  getSource,
  KNOWLEDGE_KINDS,
  listSources,
  retrieve,
  setSourceActive,
  updateSource,
  type SourceInput,
} from "../lib/knowledge"
import { catchUp, listIngestState, sweepAll } from "../lib/knowledge-ingest"
import type { Env } from "../env"

/** GET /api/content/knowledge — the sources, newest first (?id → just that one).
 * Filters: `kind`, `compartment`, `q`. R14: sources GROW with ordinary use (the
 * agency's own history is thousands), so the door PAGES by key — the opaque
 * cursor comes straight back from the previous response. */
export async function getKnowledge(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const id = queryText(url.searchParams.get("id"), "Id")
  if (id) {
    const one = await getSource(cfg, guard, id)
    return pagedJson(
      "sources",
      { rows: one ? [one] : [], total: await countSources(cfg, guard), hasMore: false, nextCursor: null }
    )
  }
  const kind = queryText(url.searchParams.get("kind"), "Kind")
  const [page, total] = await Promise.all([
    listSources(
      cfg,
      guard,
      {
        // An unknown kind is dropped rather than refused: a filter is a narrowing,
        // and narrowing by a word that is not a kind would answer "nothing" as if
        // the base were empty.
        kind: kind && (KNOWLEDGE_KINDS as readonly string[]).includes(kind) ? kind : undefined,
        compartment: queryText(url.searchParams.get("compartment"), "Compartment"),
        q: queryText(url.searchParams.get("q"), "Search"),
      },
      queryText(url.searchParams.get("cursor"), "Cursor") ?? null
    ),
    countSources(cfg, guard),
  ])
  // R16: the exact server total rides every list response (badges never use
  // rows.length — on a paged list that is just "50" forever).
  return pagedJson("sources", { ...page, total })
}

/** GET /api/content/knowledge/ask — answer a question from the team's own
 * material, with citations.
 *
 * A READ, deliberately: it changes nothing, and the cost model (MCP.md) puts it
 * with the other reads — it spends ONE embedding of the question, which is a
 * rounding error beside a chat turn, and no model writes a word here. The
 * assistant composes the answer with these passages in front of it, which is
 * what makes "every answer cites its sources" a property of the data.
 *
 * `accountId` is how a screen says WHOSE record the question was asked from; the
 * compartment is derived from it (or from the question), never picked by hand. */
export async function getKnowledgeAsk(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  // A question is prose, so it carries the message cap rather than the query
  // default — and it is still capped, because a query string is an input.
  const question = queryText(url.searchParams.get("q"), "Question", TEXT_LIMITS.message)
  if (!question) return fail(400, "invalid_input", "A question is required.")
  // BEFORE IT ANSWERS, IT CATCHES UP. A ticket whose status changed a minute ago
  // must not be answered from a quarter-hour-old memory of it, and the owner's
  // ruling was explicit: nothing to press, nothing to wait for. Bounded and
  // best-effort — see catchUp(); a question is still answerable when it cannot
  // run, just as current as the last sweep.
  await catchUp(env, cfg, guard)
  const limit = Number(queryText(url.searchParams.get("limit"), "Limit"))
  return json(
    await retrieve(env, cfg, guard, {
      question,
      accountId: queryText(url.searchParams.get("accountId"), "Account") ?? null,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    })
  )
}

/** GET /api/content/knowledge/sync — how far the sweep has got with each kind of
 * material, when it last ran, and what went wrong if it did (R12's record, read
 * back). This is the screen's "is the assistant up to date?" answer. */
export async function getKnowledgeSync(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "read")
  await refusePortalCaller(cfg, guard)
  return json({ ingest: await listIngestState(cfg, guard) })
}

/** POST /api/content/knowledge — add a source the assistant may read. */
export async function postCreateKnowledge(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<SourceInput>(request, env, "knowledge", "create")
  await refusePortalCaller(cfg, guard)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  const id = await createSource(env, cfg, guard, actor, body)
  // Row-level: carry the new source's id so open lists patch just that row.
  await publishChange(env, guard.teamId, "knowledge", id, "add")
  return json({ source: await getSource(cfg, guard, id), total: await countSources(cfg, guard) })
}

/** POST /api/content/knowledge/update — correct a source. */
export async function postUpdateKnowledge(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<SourceInput & { id?: unknown }>(
    request,
    env,
    "knowledge",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Source", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  await updateSource(env, cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "knowledge", id)
  return json({ source: await getSource(cfg, guard, id), total: await countSources(cfg, guard) })
}

/** POST /api/content/knowledge/active — take a source away from the assistant
 * (active:false) or give it back. Gated by knowledge:delete, because taking
 * material away IS this module's delete: the row survives, the assistant's sight
 * of it does not. R17: a repeat moves zero rows → no ping, no second history row. */
export async function postSetKnowledgeActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request,
    env,
    "knowledge",
    "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Source", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean")
    return fail(400, "invalid_input", "id and active are required.")
  const changed = await setSourceActive(env, cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "knowledge", id)
  return json({ source: await getSource(cfg, guard, id), total: await countSources(cfg, guard) })
}

/** POST /api/content/knowledge/sync — bring the knowledge base into step with
 * the app's own rows, one bounded slice at a time.
 *
 * The SAME engine the cron runs, reachable by hand: that is what makes the
 * backfill (scripts/knowledge-backfill.mjs) a loop over this door rather than a
 * second ingestion path nobody tests. `caughtUp` on every kind is how the caller
 * knows to stop asking.
 *
 * Gated on knowledge:create — it creates sources. A coarse ping, not a row-level
 * one: a slice touches many rows, so the list re-reads its first page rather than
 * carrying twenty-five ids nobody can patch individually. */
export async function postKnowledgeSync(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "create")
  await refusePortalCaller(cfg, guard)
  const results = await sweepAll(env, cfg, guard)
  if (results.some((r) => r.indexed > 0)) await publishChange(env, guard.teamId, "knowledge")
  return json({
    results,
    caughtUp: results.every((r) => r.caughtUp && !r.error),
    total: await countSources(cfg, guard),
  })
}
