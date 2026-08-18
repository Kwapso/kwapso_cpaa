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
import { requireRight } from "@shared/workers/gating"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { resolveOrdering } from "@shared/workers/sorting"
import {
  countMeetings,
  createMeeting,
  getMeeting,
  listMeetings,
  MEETING_SORTS,
  captureTranscript,
  linkGuests,
  readTranscript,
  setMeetingActive,
  syncCalendar,
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
    appId: queryText(url.searchParams.get("appId"), "App") ?? undefined,
    purposeId: queryText(url.searchParams.get("purposeId"), "Purpose") ?? undefined,
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
  const [page, total, weekTotal] = await Promise.all([
    listMeetings(
      cfg,
      guard,
      filter,
      queryText(url.searchParams.get("cursor"), "Cursor") ?? null,
      // WHAT ORDER — asked of the door, because the diary PAGES (R14). The "All"
      // view draws a TABLE with nine columns, and a column header that sorted
      // the loaded page would order the newest fifty meetings under a badge
      // counting every one the agency has ever held.
      resolveOrdering(
        MEETING_SORTS,
        "when",
        queryText(url.searchParams.get("sort"), "Sort"),
        queryText(url.searchParams.get("dir"), "Direction")
      )
    ),
    // R16: the exact server total rides every list response, over the SAME
    // question the rows answered.
    countMeetings(cfg, guard, filter),
    // …and the OTHER view's total beside it, so the three-tab strip (9.1) badges
    // two exact server counts from one response rather than asking twice. The
    // week is worked out on the server, so the badge and the rows under it can
    // never mean two different weeks.
    countMeetings(cfg, guard, { ...filter, view: "week" }),
  ])
  return pagedJson("meetings", { ...page, total }, { weekTotal })
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

/* THERE WAS A `…/meetings/held` DOOR HERE, and the idea behind it has been
 * retired rather than moved (the owner, 18 August 2026: "this held mark is held
 * release. I don't care. It's too complicated.").
 *
 * The insight that made it simple: a meeting's own START TIME already says
 * whether it has happened. A status column was a second source of truth for a
 * question the clock answers, and the two could disagree — a meeting marked held
 * next Tuesday, a meeting from March still "scheduled" because nobody pressed
 * anything. So the views key off the date (lib/meetings.ts's `whereFor`), the
 * notes are always editable, and the column stays in the database saying nothing
 * to anybody, because deactivate-never-delete applies to history too.
 */

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

/** POST /api/content/meetings/transcript — read the transcript, and do what its
 * arrival MEANS (CHECKLIST 9.4 and 9.2).
 *
 * Three gates, because it reaches three things: this module's own `edit` right
 * (it writes the transcript onto the meeting), `google:read` (it reads the
 * caller's own Drive and calendar, with the caller's own token) and the portal
 * refusal every door here keeps. The timesheet right is deliberately NOT one of
 * them: the logs it
 * writes are a consequence of a meeting having happened, not somebody filling in
 * a timesheet, and asking for that right would mean the person who runs the
 * client call cannot record that they ran it.
 *
 * Idempotent (R17), and the predicate is the one it always had: the capture
 * CLAIMS the row with `transcript_captured_at IS NULL` riding the UPDATE, so a
 * second press reads no transcript and writes no time. Retiring the held status
 * did not touch that — the claim was never on the status, which is why the
 * hours cannot be doubled by a second import. */
export async function postMeetingTranscript(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown }>(request, env, "meetings", "edit")
  await refusePortalCaller(cfg, guard)
  await requireRight(cfg, guard, "google", "read")
  const id = requireText(body.id, "Meeting", TEXT_LIMITS.short)
  const result = await captureTranscript(env, cfg, guard, actor, id)
  // R1 — the meeting moved and so did somebody's week. Both pings, and only when
  // something actually changed.
  if (result.captured) {
    await publishChange(env, guard.teamId, "meetings", id, "edit")
    await publishChange(env, guard.teamId, "work_logs", id, "add")
  }
  return json({
    captured: result.captured,
    fileId: result.fileId,
    fileName: result.fileName,
    logsWritten: result.logsWritten,
    note: result.note,
    meeting: await getMeeting(cfg, guard, id),
  })
}

/** POST /api/content/meetings/sync-calendar — read Google's diary into ours.
 * ONE WAY, and the only direction there is: nothing in this product writes to a
 * calendar (the owner, 18 August 2026, "just make it one-way so we only grab and
 * update the information").
 *
 * THREE THINGS, over a LIVE WINDOW that straddles today. Every entry in it that
 * is not a record becomes one; every meeting whose entry is in it has its Google
 * facts brought up to date — the guest list and what each person answered, the
 * organiser, the join link, the attachments, the location, the description; and
 * an entry cancelled in Google is called off here. The instances beyond the
 * horizon come back read-only in `ahead` — shown so nobody is surprised by them,
 * not stored, because an instance six months out can still be moved.
 *
 * AND A FOURTH: THE BACKFILL. The live window is a few weeks either side of
 * today, which is not "everything in my calendar". So one SLICE of the wider
 * window is walked on every call from a cursor kept on the caller's own calendar
 * connection, and `swept` says how far that walk has reached. It resumes where
 * it stopped, which is what makes a years-wide read bounded (R14) rather than
 * unbounded. lib/meetings.ts holds the whole argument and the numbers.
 *
 * THE BACKWARD HALF IS WHY THE TRANSCRIPTS LAND. Everything interesting about a
 * meeting arrives after it, and a sweep that only ever looked forward saw each
 * one exactly once, at the moment when the least was known about it.
 *
 * It creates meetings, so it opens on this module's `create` right; it reads the
 * caller's own calendar with the caller's own token, so it demands `google:read`
 * besides. Idempotent by the unique index on the event id for the creates, and
 * by Google's own `updated` stamp for the refreshes: an entry that has not moved
 * since we last mirrored it is skipped entirely. */
export async function postSyncCalendar(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await gatedBody<Record<string, unknown>>(request, env, "meetings", "create")
  await refusePortalCaller(cfg, guard)
  await requireRight(cfg, guard, "google", "read")
  const result = await syncCalendar(env, cfg, guard, actor)
  // R1 — only when something actually moved in the diary. All three verbs count:
  // a refreshed guest list and a cancelled entry are changes a screen is looking
  // at exactly as a new record is.
  if (result.created + result.updated + result.cancelled > 0)
    await publishChange(env, guard.teamId, "meetings", "series", "add")
  // Spelled out rather than spread: R27 derives what a tool may PROMISE from the
  // literal a door returns, so a shorthand response is a door whose contract
  // nothing can read.
  return json({
    created: result.created,
    updated: result.updated,
    cancelled: result.cancelled,
    ahead: result.ahead,
    swept: result.swept,
    caughtUp: result.caughtUp,
  })
}

/**
 * GET /api/content/meetings/transcript?id= — what was SAID, in full.
 *
 * ITS OWN DOOR because of its size. A page of the diary is fifty meetings and a
 * transcript is up to a megabyte; carrying one on the other would make the list
 * read the heaviest response in the app in order to show a column nobody
 * scrolls. So the meeting row says a transcript EXISTS, where it came from and
 * where it lives, and this reads the words — once, for the one screen that
 * shows them.
 *
 * IT READS THE COLUMN, NOT GOOGLE. The words were copied onto the row when the
 * transcript was captured, which is what makes them readable by every colleague
 * whose role can read meetings rather than only by whoever holds the connection.
 * `note` is present when the transcript was longer than one row may hold and
 * says so in words — the same rule a knowledge file follows.
 */
export async function getMeetingTranscript(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "meetings", "read")
  await refusePortalCaller(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Meeting", TEXT_LIMITS.short)
  if (!id) return fail(400, "invalid_input", "Say which meeting.")
  const found = await readTranscript(cfg, guard, id)
  if (!found) return fail(404, "meeting_not_found", "That meeting doesn't exist.")
  return json({
    text: found.text,
    note: found.note,
    url: found.url,
    foundBy: found.foundBy,
    capturedAt: found.capturedAt,
  })
}

/**
 * GET /api/content/meetings/people?id= — which of the people on the invitation
 * we already know.
 *
 * THE SECOND HALF OF THE OWNER'S "STAKEHOLDERS". The first half is the guest
 * list itself, mirrored onto the meeting row: who was asked, and what they
 * answered. This is the half that turns an address into a RECORD — one of our
 * own team members, or a contact on one of our accounts.
 *
 * A READ RATHER THAN A COLUMN, and that is the whole reason it is a door. Who a
 * given address belongs to is a fact with a different lifetime from the
 * invitation: a contact added to an account next week should light up on a
 * meeting held last week, and a link frozen into the row at sync time never
 * would. The invitation is history; the address book is not.
 *
 * IT NAMES ONLY WHAT THIS TEAM ALREADY HOLDS. Nothing is looked up anywhere, no
 * directory is consulted, and an address matching neither a member nor a contact
 * comes back with both halves null — which is the honest answer for most people
 * on most invitations.
 */
export async function getMeetingPeople(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "meetings", "read")
  await refusePortalCaller(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Meeting", TEXT_LIMITS.short)
  if (!id) return fail(400, "invalid_input", "Say which meeting.")
  const meeting = await getMeeting(cfg, guard, id)
  if (!meeting) return fail(404, "meeting_not_found", "That meeting doesn't exist.")
  return json({ links: await linkGuests(env, cfg, guard, meeting.googleGuests.map((g) => g.email)) })
}
