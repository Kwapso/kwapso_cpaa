// STORY + SPRINT routes — the work engine's own doors. Same opening as every
// other content route (the shared gated opening → validate at the boundary →
// write → publishChange), with ONE addition that is the whole security posture
// of this module:
//
//   EVERY DOOR HERE REFUSES A CLIENT LOGIN (R21).
//
// Not because of what they change, but because of what they ANSWER WITH. A story
// carries a title, an assignee, a reviewer and a date, and "which staff member is
// doing the work" is the one thing SCOPE ch.06 says the portal never shows. The
// agency gateway forwards /api/content/* by PREFIX and a client login is an
// ordinary team member, so leaving these doors off the portal's allow-list would
// defend them at the wrong hostname — the exact mistake R21 was earned by, twice.
// A client's view of a story is a COUNT on their own ticket, served by the ticket
// door, and nothing else.
//
// There is therefore NO account fence in lib/stories.ts, and there must not be
// one: a fence implies a client can reach these rows through it.

import { fail, json, pagedJson } from "@shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { STORY_STATUSES, type StoryStatus } from "@shared/types"
import {
  countSprints,
  countStories,
  createSprint,
  createStory,
  getStory,
  listSprints,
  listStories,
  setSprintComplete,
  setStoryStatus,
  updateSprint,
  updateStory,
  type StoryFilter,
  type StoryInput,
  type SprintFilter,
  type SprintInput,
} from "../lib/stories"
import { readyFlipForTicket, scheduledFlip } from "../lib/ready-flip"
import type { Env } from "../env"

/** THE FILTERS THIS DOOR PARSES — read once, in one place, so the list and its
 * count can never be asked different questions (R16) and so the machine surface
 * has ONE thing to mirror (R19). Every value goes through the query half of the
 * validation seam at the boundary, where the boundary actually is. */
function storyFilterFrom(url: URL): StoryFilter {
  const status = queryText(url.searchParams.get("status"), "Status")
  return {
    status: (STORY_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as StoryStatus)
      : undefined,
    ticketId: queryText(url.searchParams.get("ticketId"), "Ticket"),
    sprintId: queryText(url.searchParams.get("sprintId"), "Sprint"),
    appId: queryText(url.searchParams.get("appId"), "App"),
    assigneeId: queryText(url.searchParams.get("assigneeId"), "Assignee"),
    // The screen's search box. It rides the same filter object as everything
    // else here, so the page and its count are asked the one question.
    q: queryText(url.searchParams.get("q"), "Search"),
    // Anything but the exact word "all" means the everyday backlog — a fail-safe
    // default, because the everyday list is where a mistyped parameter should land.
    view: queryText(url.searchParams.get("view"), "View") === "all" ? "all" : "open",
  }
}

/** EVERY story response is a PAGE (R14) — including the one a mutation returns,
 * so a screen re-priming from a write still learns where page two starts. One
 * seam: rows + the exact totals + hasMore + the opaque cursor. */
async function storyPage(
  cfg: Parameters<typeof listStories>[0],
  guard: Parameters<typeof listStories>[1],
  filter: StoryFilter,
  cursor: string | null
): Promise<Response> {
  const [page, counts] = await Promise.all([
    listStories(cfg, guard, filter, cursor),
    countStories(cfg, guard, filter),
  ])
  return pagedJson("stories", { ...page, total: counts.total }, { mineTotal: counts.mineTotal })
}

/** GET /api/content/stories — the backlog (?id=<storyId> → just that one). */
export async function getStories(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "work", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const id = queryText(url.searchParams.get("id"), "Id")
  const filter = storyFilterFrom(url)
  // One story by id is a LOOKUP, not a page — answer it directly rather than
  // filtering a page (which could legitimately not contain it once paged), and
  // ignore the view: opening a DONE story by id has to work.
  if (id) {
    const one = await getStory(cfg, guard, id)
    const counts = await countStories(cfg, guard, filter)
    return pagedJson(
      "stories",
      { rows: one ? [one] : [], total: counts.total, hasMore: false, nextCursor: null },
      { mineTotal: counts.mineTotal }
    )
  }
  return storyPage(cfg, guard, filter, queryText(url.searchParams.get("cursor"), "Cursor") ?? null)
}

/** POST /api/content/stories — write one piece of work down (work:create). */
export async function postCreateStory(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<StoryInput>(request, env, "work", "create")
  await refusePortalCaller(cfg, guard)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  requireText(body.storyType, "Story type", TEXT_LIMITS.short)
  const ticketId = optionalText(body.ticketId, "Ticket", TEXT_LIMITS.short)
  const { id, accountId } = await createStory(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "stories", id, "add", accountId ?? undefined)
  // CHECKLIST 5.3: work existing in a sprint is what SCHEDULES the request behind
  // it. R17 rides the flip, so a second story on an already-scheduled ticket
  // moves zero rows and publishes nothing.
  await announceScheduled(env, cfg, guard, actor, ticketId ?? null)
  return storyPage(cfg, guard, storyFilterFrom(new URL(request.url)), null)
}

/** POST /api/content/stories/update — edit a story (work:edit). */
export async function postUpdateStory(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<StoryInput & { id?: unknown }>(
    request,
    env,
    "work",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Story", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  requireText(body.storyType, "Story type", TEXT_LIMITS.short)
  const ticketId = optionalText(body.ticketId, "Ticket", TEXT_LIMITS.short)
  const { accountId } = await updateStory(cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "stories", id, "edit", accountId ?? undefined)
  // The edit form is where a sprint gets attached, so this is the ordinary way a
  // ticket becomes `scheduled`.
  await announceScheduled(env, cfg, guard, actor, ticketId ?? null)
  return storyPage(cfg, guard, storyFilterFrom(new URL(request.url)), null)
}

/** THE SCHEDULED FLIP AND ITS PING, in one place because three doors do it and
 * every one of them has to publish on exactly the same condition (R1 + R17): the
 * flip reports whether a row genuinely moved, and only then is there anything to
 * announce. The ping carries the TICKET's own account, so the people who raised
 * the request watch it move and nobody else hears a thing. */
async function announceScheduled(
  env: Env,
  cfg: Parameters<typeof scheduledFlip>[0],
  guard: Parameters<typeof scheduledFlip>[1],
  actor: Parameters<typeof scheduledFlip>[2],
  ticketId: string | null
): Promise<void> {
  if (!ticketId) return
  const flip = await scheduledFlip(cfg, guard, actor, ticketId)
  if (flip.moved)
    await publishChange(env, guard.teamId, "help", ticketId, "edit", flip.accountId ?? undefined)
}

/** POST /api/content/stories/status — move a story along its fixed lifecycle
 * (work:edit), and — when the move CLOSES it — settle the ticket half in the
 * same call: the closing note lands in the ticket's draft resolution, and the
 * ticket flips to READY if that was the last piece of work outstanding.
 *
 * ONE CALL on purpose (BUILD-1 §2: "closing a story is a transaction with the
 * ticket's Ready flip"). A client is watching their request; if the last story
 * goes done and the request still says "in progress" because a second call had
 * not been made yet, the portal is lying about the thing the portal is for.
 *
 * Closing also requires that the story names the process step it changed, or
 * says it changed none (lib/stories refuseUnstepped) — the hook every savings
 * figure hangs off, refused rather than defaulted.
 *
 * R17 twice over: the story move carries `status <> ?` and the ticket flip
 * carries its own `status IN (…)`, so a double-clicked Done moves zero rows,
 * writes no second history line and pings nothing — on either row. */
export async function postStoryStatus(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    id?: unknown
    status?: unknown
    closingNote?: unknown
    reviewNote?: unknown
    reviewFileUrl?: unknown
    reviewFileName?: unknown
  }>(request, env, "work", "edit")
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Story", TEXT_LIMITS.short)
  if (typeof body.status !== "string" || !(STORY_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "id and a valid status are required.")
  const closingNote = optionalText(body.closingNote, "Closing note", TEXT_LIMITS.long) ?? null
  // CHECKLIST 6.9: the words that let a story go for review, and the optional
  // something-to-show beside them. Validated here at the boundary; whether they
  // are ENOUGH is lib/stories' decision, because there is more than one way to
  // move a story and the rule has to ride the model rather than the door.
  const review = {
    note: optionalText(body.reviewNote, "What you did", TEXT_LIMITS.long) ?? null,
    fileUrl: optionalText(body.reviewFileUrl, "File", TEXT_LIMITS.link) ?? null,
    fileName: optionalText(body.reviewFileName, "File name", TEXT_LIMITS.short) ?? null,
  }

  const { moved, story, ticketId, accountId } = await setStoryStatus(
    cfg,
    guard,
    actor,
    id,
    body.status as StoryStatus,
    closingNote,
    review
  )
  if (moved) await publishChange(env, guard.teamId, "stories", id, "edit", accountId ?? undefined)
  // THE TICKET HALF. Reached only when a row actually moved, and only when the
  // move was a CLOSE: a story going to in-review has changed nothing about
  // whether the request is finished, and re-running a close that already
  // happened moves zero rows above and never arrives here at all.
  if (moved && story.status === "done" && ticketId) {
    // The story's OWN settled note, not the one on this request: a note typed
    // days ago on the story's edit form is still what we said we would tell the
    // client, and closing without re-typing it must not lose it. (Close, reopen,
    // close again and the paragraph appends twice — which is a draft somebody
    // then edits, not a message anybody received.)
    const flip = await readyFlipForTicket(cfg, guard, actor, ticketId, story.closingNote)
    // The ping carries the ticket's OWN account, so the people who raised the
    // request — and nobody else — watch it turn ready on their own screen.
    if (flip.moved)
      await publishChange(env, guard.teamId, "help", ticketId, "edit", flip.accountId ?? undefined)
  }
  return storyPage(cfg, guard, storyFilterFrom(new URL(request.url)), null)
}

/* ---------------------------------- sprints --------------------------------- */

/** THE FILTERS THE SPRINT DOOR PARSES — read once, so the list and its count are
 * asked the same question (R16) and the machine surface has one thing to mirror
 * (R19). Same shape as storyFilterFrom above, for the same reasons. */
function sprintFilterFrom(url: URL): SprintFilter {
  return {
    accountId: queryText(url.searchParams.get("accountId"), "Client") ?? null,
    appId: queryText(url.searchParams.get("appId"), "App") ?? null,
    // CHECKLIST 6.3: the story form asks for current-or-future blocks only.
    // Anything but the exact word "open" means all of them — the fail-safe
    // default, because the whole list is where a mistyped parameter should land.
    when: queryText(url.searchParams.get("when"), "When") === "open" ? "open" : "all",
  }
}

/** GET /api/content/sprints — the blocks of work sold, newest first
 * (?accountId=<id> narrows to one client, ?appId=<id> to one system). R16: the
 * exact server count rides it, computed over the same filter. */
export async function getSprints(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "work", "read")
  await refusePortalCaller(cfg, guard)
  const filter = sprintFilterFrom(new URL(request.url))
  const [sprints, total] = await Promise.all([
    listSprints(cfg, guard, filter),
    countSprints(cfg, guard, filter),
  ])
  return json({ sprints, total })
}

/** POST /api/content/sprints — start a sprint (work:create). */
export async function postCreateSprint(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<SprintInput>(request, env, "work", "create")
  await refusePortalCaller(cfg, guard)
  requireText(body.name, "Name", TEXT_LIMITS.short)
  const { id, accountId } = await createSprint(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "sprints", id, "add", accountId ?? undefined)
  const listFilter = { accountId: optionalText(body.accountId, "Client", TEXT_LIMITS.short) ?? null }
  return json({
    sprints: await listSprints(cfg, guard, listFilter),
    total: await countSprints(cfg, guard, listFilter),
  })
}

/** POST /api/content/sprints/update — edit a sprint (work:edit).
 *
 * The door a sprint's PRICE was missing: `sold_price_cents` could be set only at
 * the moment the sprint was started, so a block of work agreed before its price
 * was could never be given one — and the margin reading that column had nothing
 * to read. The client and the app are not on this door (lib/stories updateSprint
 * says why); everything descriptive and everything commercial is. */
export async function postUpdateSprint(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<SprintInput & { id?: unknown }>(
    request,
    env,
    "work",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Sprint", TEXT_LIMITS.short)
  requireText(body.name, "Name", TEXT_LIMITS.short)
  const { accountId } = await updateSprint(cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "sprints", id, "edit", accountId ?? undefined)
  const filter = sprintFilterFrom(new URL(request.url))
  return json({
    sprints: await listSprints(cfg, guard, filter),
    total: await countSprints(cfg, guard, filter),
  })
}

/** POST /api/content/sprints/complete — mark a sprint finished, or reopen it
 * (work:edit). R17: the current-state predicate rides the UPDATE, which matters
 * more here than anywhere else — a completing sprint is what cuts a version of
 * every process map beneath it, and a version cut twice is a baseline nobody can
 * subtract from. */
export async function postSprintComplete(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; complete?: unknown }>(
    request,
    env,
    "work",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Sprint", TEXT_LIMITS.short)
  if (typeof body.complete !== "boolean")
    return fail(400, "invalid_input", "complete must be true or false.")
  const { moved, accountId } = await setSprintComplete(cfg, guard, actor, id, body.complete)
  if (moved) await publishChange(env, guard.teamId, "sprints", id, "edit", accountId ?? undefined)
  return json({
    sprints: await listSprints(cfg, guard, {}),
    total: await countSprints(cfg, guard, {}),
  })
}
