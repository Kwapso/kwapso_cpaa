// MEETING routes — the diary, its agenda and its notes.
//
// EVERY DOOR HERE REFUSES A CLIENT LOGIN, AT THE DOOR (R21). A meeting's notes
// are OUR record of a conversation — written for us, often about the client
// rather than for them — so there is no fenced slice of this module to serve a
// contact; there is a refusal. The refusal is written on each handler rather
// than left to the portal gateway's allow-list, because the agency gateway
// forwards by PREFIX and a client login is an ordinary team member holding an
// ordinary role: a door not named on the portal's list is still served to that
// same person at the other hostname. That mistake has been made twice in this
// codebase and caught twice.
//
// The one thing a client WILL eventually see about a meeting is the sprint it
// belongs to — which they already see, through the delivery door, with nothing
// of this module in it.

import { fail, json, pagedJson } from "@shared/workers/http"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import {
  countMeetings,
  createMeeting,
  getMeeting,
  listMeetings,
  setMeetingActive,
  setMeetingHeld,
  updateMeeting,
  type MeetingFilter,
  type MeetingInput,
} from "../lib/meetings"
import type { Env } from "../env"

/** The filters this door parses, read off the query string in one place so the
 * list and its count ask the same question — and so the machine surface's parity
 * check (R19) has one shape to derive from. */
function filterFrom(url: URL): MeetingFilter {
  return {
    accountId: queryText(url.searchParams.get("accountId"), "Client") ?? undefined,
    purposeId: queryText(url.searchParams.get("purposeId"), "Purpose") ?? undefined,
    status: queryText(url.searchParams.get("status"), "Status") ?? undefined,
    view: queryText(url.searchParams.get("view"), "View") ?? undefined,
    q: queryText(url.searchParams.get("q"), "Search") ?? undefined,
  }
}

/** GET /api/content/meetings — the diary, newest first (?id → just that one).
 * R14: meetings GROW with ordinary use (an event is never curated away), so the
 * door PAGES by key — the opaque cursor comes straight back from the previous
 * response. */
export async function getMeetings(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "meetings", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const id = queryText(url.searchParams.get("id"), "Id")
  if (id) {
    const one = await getMeeting(cfg, guard, id)
    return pagedJson("meetings", {
      rows: one ? [one] : [],
      total: await countMeetings(cfg, guard, {}),
      hasMore: false,
      nextCursor: null,
    })
  }
  const filter = filterFrom(url)
  const [page, total] = await Promise.all([
    listMeetings(cfg, guard, filter, queryText(url.searchParams.get("cursor"), "Cursor") ?? null),
    // R16: the exact server total rides every list response, over the SAME
    // question the rows answered.
    countMeetings(cfg, guard, filter),
  ])
  return pagedJson("meetings", { ...page, total })
}

/** POST /api/content/meetings — put one in the diary. Gated on the meetings
 * module's `create` right. */
export async function postCreateMeeting(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<MeetingInput>(request, env, "meetings", "create")
  await refusePortalCaller(cfg, guard)
  const { id, accountId } = await createMeeting(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "meetings", id, "add", accountId ?? undefined)
  return json({ meeting: await getMeeting(cfg, guard, id), total: await countMeetings(cfg, guard, {}) })
}

/** POST /api/content/meetings/update — correct it, or write the notes up
 * afterwards. Gated on the meetings module's `edit` right. */
export async function postUpdateMeeting(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<MeetingInput & { id?: unknown }>(
    request,
    env,
    "meetings",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Meeting", TEXT_LIMITS.short)
  const { accountId } = await updateMeeting(cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "meetings", id, "edit", accountId ?? undefined)
  return json({ meeting: await getMeeting(cfg, guard, id), total: await countMeetings(cfg, guard, {}) })
}

/** POST /api/content/meetings/held — it happened, or it hasn't yet. Gated on
 * the meetings module's `edit` right. R17: a repeat moves zero rows → no ping,
 * no second history line. */
export async function postMeetingHeld(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; held?: unknown }>(
    request,
    env,
    "meetings",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Meeting", TEXT_LIMITS.short)
  if (typeof body.held !== "boolean") return fail(400, "invalid_input", "held must be true or false.")
  const { moved, accountId } = await setMeetingHeld(cfg, guard, actor, id, body.held)
  if (moved) await publishChange(env, guard.teamId, "meetings", id, "edit", accountId ?? undefined)
  return json({ meeting: await getMeeting(cfg, guard, id), total: await countMeetings(cfg, guard, {}) })
}

/** POST /api/content/meetings/active — cancel it, or put it back. Gated on the
 * `delete` right, because cancelling IS this module's delete: the row survives,
 * the diary entry does not. R17: a repeat moves zero rows. */
export async function postSetMeetingActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request,
    env,
    "meetings",
    "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Meeting", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "active must be true or false.")
  const { moved, accountId } = await setMeetingActive(cfg, guard, actor, id, body.active)
  if (moved) await publishChange(env, guard.teamId, "meetings", id, "edit", accountId ?? undefined)
  return json({ meeting: await getMeeting(cfg, guard, id), total: await countMeetings(cfg, guard, {}) })
}
