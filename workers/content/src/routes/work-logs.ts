// WORK LOG routes — start a timer, stop it, write time down by hand, correct a
// row, and answer for a timer left running over a weekend.
//
// EVERY DOOR REFUSES A CLIENT LOGIN (R21), for the same reason the story doors
// do and one more besides: a work log names the staff member who did the work and
// how long they took, which is both halves of what SCOPE ch.06 keeps off the
// portal — and it is the input to the agency's own margin. A client sees the
// VALUE their work produced (the savings drill-down on the process map) and never
// the hours behind it.

import { fail, json, pagedJson } from "@shared/workers/http"
import {
  optionalMoment,
  optionalText,
  queryText,
  requireMoment,
  requireText,
  TEXT_LIMITS,
} from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { resolveOrdering } from "@shared/workers/sorting"
import {
  countWorkLogs,
  editWorkLog,
  listWorkLogs,
  logTime,
  requireTarget,
  resolveRunaway,
  runningTimers,
  setAutoStop,
  startTimer,
  stopTimer,
  summariseWorkLogs,
  WORK_LOG_SORTS,
  type LogFilter,
} from "../lib/work-logs"
import { progressFlip, ticketBehind } from "../lib/ready-flip"
import { storyProgressFlip } from "../lib/stories"
import type { Env } from "../env"

/** The filters this door parses — one place, so the list and its totals can never
 * be asked different questions (R16) and the machine surface has one thing to
 * mirror (R19). */
function logFilterFrom(url: URL): LogFilter {
  const period = queryText(url.searchParams.get("period"), "When")
  return {
    scope: queryText(url.searchParams.get("scope"), "Scope") === "mine" ? "mine" : "all",
    targetTable: queryText(url.searchParams.get("targetTable"), "Target"),
    targetId: queryText(url.searchParams.get("targetId"), "Target"),
    userId: queryText(url.searchParams.get("userId"), "Person"),
    // WITH OR WITHOUT MEETING TIME (9.3). Anything but the two words means all
    // of it — a fail-safe default, because "everything" is the answer a mistyped
    // parameter should land you in.
    meetingTime:
      queryText(url.searchParams.get("meetingTime"), "Meeting time") === "exclude"
        ? "exclude"
        : queryText(url.searchParams.get("meetingTime"), "Meeting time") === "only"
          ? "only"
          : undefined,
    // THE SEARCH BOX — who logged it, or what it was against (R14: the door
    // answers, never the loaded page).
    q: queryText(url.searchParams.get("q"), "Search"),
    // A CLOSED WINDOW ON WHEN — three words the door knows, anything else means
    // all time. Never a free-form pair of dates: see lib/work-logs's own note.
    period: period === "7d" || period === "30d" || period === "90d" ? period : undefined,
  }
}

/** Every work-log response is a PAGE (R14) carrying both exact totals (R16): how
 * many rows, and — the number anybody actually reads — how many seconds. */
async function logPage(
  cfg: Parameters<typeof listWorkLogs>[0],
  guard: Parameters<typeof listWorkLogs>[1],
  filter: LogFilter,
  cursor: string | null,
  ordering?: Parameters<typeof listWorkLogs>[4]
): Promise<Response> {
  const [page, counts] = await Promise.all([
    listWorkLogs(cfg, guard, filter, cursor, ordering),
    countWorkLogs(cfg, guard, filter),
  ])
  return pagedJson("logs", { ...page, total: counts.total }, { totalSeconds: counts.totalSeconds })
}

/** GET /api/content/work-logs — time, newest first (or by whatever `sort` asks). */
export async function getWorkLogs(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "work", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const ordering = resolveOrdering(
    WORK_LOG_SORTS,
    "started",
    queryText(url.searchParams.get("sort"), "Sort"),
    queryText(url.searchParams.get("dir"), "Direction")
  )
  return logPage(
    cfg,
    guard,
    logFilterFrom(url),
    queryText(url.searchParams.get("cursor"), "Cursor") ?? null,
    ordering
  )
}

/** GET /api/content/work-logs/summary — THE NUMBERS ON TOP OF A LIST OF TIME.
 *
 * Same gate and same refusal as the list beside it (`work:read`, and never a
 * client login — a work log names the staff member who did the work and how long
 * they took, which is both halves of what SCOPE ch.06 keeps off the portal), and
 * the SAME filter, read through the same `logFilterFrom`. That is the point of it
 * being here rather than a second parser: the hours above a list are the hours OF
 * that list (R16), and the only way to guarantee that is for both to be the same
 * sentence.
 *
 * It answers one object and no rows, so it is `json` rather than `pagedJson` —
 * there is no collection to page. The bounded reads behind it are in
 * `summariseWorkLogs`, which says its ceilings at the query (R14).
 */
export async function getWorkLogSummary(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "work", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  return json(await summariseWorkLogs(cfg, guard, logFilterFrom(url), new Date()))
}

/** GET /api/content/work-logs/running — what the caller has running RIGHT NOW.
 * The header of every screen asks this; it is deliberately its own small door
 * rather than a flag on the list, because the header is on every page and a page
 * of somebody's timesheet is not. */
export async function getRunningTimers(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "work", "read")
  await refusePortalCaller(cfg, guard)
  return json({ timers: await runningTimers(cfg, guard) })
}

/** POST /api/content/work-logs/start — THE ONE CLICK (work:create).
 *
 * The body is two fields and neither is a duration: what you are working on, and
 * that is all. Everything else — when it started, whose it is, which client it
 * belongs to — the server already knows and fills in. */
export async function postStartTimer(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    targetTable?: unknown
    targetId?: unknown
    note?: unknown
    kind?: unknown
  }>(request, env, "work", "create")
  await refusePortalCaller(cfg, guard)
  // Type-checked and capped HERE, at the boundary, then handed to the allow-list
  // check that only lib/work-logs can answer.
  const target = requireTarget(
    requireText(body.targetTable, "What the time is against", TEXT_LIMITS.short),
    requireText(body.targetId, "What the time is against", TEXT_LIMITS.short)
  )
  const { id, accountId, stopped } = await startTimer(cfg, guard, actor, {
    ...target,
    note: optionalText(body.note, "Note", TEXT_LIMITS.long),
    kind: optionalText(body.kind, "Kind of work", TEXT_LIMITS.short),
  })
  // R1: THE TIMERS AUTO-STOP CLOSED ARE MUTATIONS TOO. Starting one under the
  // caller's own auto-stop-previous setting ENDS the others — a row of time
  // acquires a finish and a duration — and only the new row was being announced.
  // So every other screen (and every colleague's) went on showing those timers
  // as running until something else happened to drop the cache. One publish per
  // row moved, before the one for the row created.
  for (const was of stopped)
    await publishChange(env, guard.teamId, "work_logs", was.id, "edit", was.accountId ?? undefined)
  await publishChange(env, guard.teamId, "work_logs", id, "add", accountId ?? undefined)

  // A STATUS IS A FACT, NOT A BUTTON (CHECKLIST 5.4 + 6.7) — and this is the door
  // where the inversion actually happens. Marking a story "in progress" used to
  // start a timer; starting a timer is now what marks it, on the story AND on the
  // request behind it.
  //
  // R17 is what makes it safe to do on EVERY start: the predicate rides both
  // UPDATEs, so the second timer of the morning moves zero rows, writes no
  // activity and publishes nothing. Nothing is ever dragged backwards — a story
  // in review, or a ticket already `ready`, is not a state a clock can undo.
  if (target.targetTable === "stories") {
    const flip = await storyProgressFlip(cfg, guard, actor, target.targetId)
    if (flip.moved)
      await publishChange(env, guard.teamId, "stories", target.targetId, "edit", accountId ?? undefined)
  }
  const ticketId = await ticketBehind(cfg, guard, target.targetTable, target.targetId)
  if (ticketId) {
    const flip = await progressFlip(cfg, guard, actor, ticketId)
    if (flip.moved)
      await publishChange(env, guard.teamId, "help", ticketId, "edit", flip.accountId ?? undefined)
  }
  return json({ timers: await runningTimers(cfg, guard) })
}

/** POST /api/content/work-logs/stop — stop a running timer (work:create; stopping
 * your own timer is part of logging it, not an administrative edit).
 *
 * `endedAt` is optional and is how "stop it at five o'clock on Friday" is said.
 * R17: an already-stopped timer moves zero rows and publishes nothing. */
export async function postStopTimer(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; endedAt?: unknown }>(
    request,
    env,
    "work",
    "create"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Timer", TEXT_LIMITS.short)
  const endedAt = optionalMoment(body.endedAt, "Finished at") ?? null
  const { moved, accountId } = await stopTimer(cfg, guard, actor, id, endedAt)
  if (moved) await publishChange(env, guard.teamId, "work_logs", id, "edit", accountId ?? undefined)
  return json({ timers: await runningTimers(cfg, guard) })
}

/** POST /api/content/work-logs — write time down by hand (work:create). Always
 * available: half of real time is remembered rather than clocked. */
export async function postLogTime(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    targetTable?: unknown
    targetId?: unknown
    startedAt?: unknown
    endedAt?: unknown
    note?: unknown
    kind?: unknown
    billable?: unknown
  }>(request, env, "work", "create")
  await refusePortalCaller(cfg, guard)
  const target = requireTarget(
    requireText(body.targetTable, "What the time is against", TEXT_LIMITS.short),
    requireText(body.targetId, "What the time is against", TEXT_LIMITS.short)
  )
  const { id, accountId } = await logTime(cfg, guard, actor, {
    ...target,
    startedAt: requireMoment(body.startedAt, "Started at"),
    endedAt: requireMoment(body.endedAt, "Finished at"),
    note: optionalText(body.note, "Note", TEXT_LIMITS.long),
    kind: optionalText(body.kind, "Kind of work", TEXT_LIMITS.short),
    // BILLABLE IS ON BY DEFAULT (BUILD-1 §5) — a plain switch, and the absence of
    // the field means the ordinary case rather than the cautious one.
    billable: body.billable !== false,
  })
  await publishChange(env, guard.teamId, "work_logs", id, "add", accountId ?? undefined)
  return logPage(cfg, guard, logFilterFrom(new URL(request.url)), null)
}

/** POST /api/content/work-logs/update — correct a row (work:EDIT, a step above
 * logging your own). Every edit leaves a trail; see lib/work-logs editWorkLog. */
export async function postUpdateWorkLog(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    id?: unknown
    startedAt?: unknown
    endedAt?: unknown
    note?: unknown
    kind?: unknown
    billable?: unknown
  }>(request, env, "work", "edit")
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Work log", TEXT_LIMITS.short)
  const { accountId } = await editWorkLog(cfg, guard, actor, id, {
    startedAt: optionalMoment(body.startedAt, "Started at"),
    endedAt: optionalMoment(body.endedAt, "Finished at"),
    note: optionalText(body.note, "Note", TEXT_LIMITS.long),
    kind: optionalText(body.kind, "Kind of work", TEXT_LIMITS.short),
    billable: typeof body.billable === "boolean" ? body.billable : undefined,
  })
  await publishChange(env, guard.teamId, "work_logs", id, "edit", accountId ?? undefined)
  return logPage(cfg, guard, logFilterFrom(new URL(request.url)), null)
}

/** POST /api/content/work-logs/runaway — the Monday morning answer (work:create).
 *
 * Three answers and no fourth: keep the whole thing, stop it at a moment you
 * name, or bin it. Nothing here is automatic — a timer that stopped itself at
 * some clever hour is a number a person did not choose, and every figure in this
 * app is trusted because a person chose it. */
export async function postResolveRunaway(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    id?: unknown
    answer?: unknown
    at?: unknown
  }>(request, env, "work", "create")
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Timer", TEXT_LIMITS.short)
  if (body.answer !== "keep" && body.answer !== "discard" && body.answer !== "stopAt")
    return fail(400, "invalid_input", "answer must be keep, stopAt or discard.")
  const answer =
    body.answer === "stopAt"
      ? ({ kind: "stopAt", at: requireMoment(body.at, "Finished at") } as const)
      : body.answer === "discard"
        ? ({ kind: "discard" } as const)
        : ({ kind: "keep" } as const)
  const { moved, accountId } = await resolveRunaway(cfg, guard, actor, id, answer)
  if (moved) await publishChange(env, guard.teamId, "work_logs", id, "edit", accountId ?? undefined)
  return json({ timers: await runningTimers(cfg, guard) })
}

/** POST /api/content/work-logs/auto-stop — the caller's OWN preference
 * (work:create: it is a setting about how you log your own time, not an
 * administrative right over anybody else's). */
export async function postAutoStop(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, body } = await gatedBody<{ on?: unknown }>(request, env, "work", "create")
  await refusePortalCaller(cfg, guard)
  if (typeof body.on !== "boolean") return fail(400, "invalid_input", "on must be true or false.")
  await setAutoStop(cfg, guard, body.on)
  // A private preference — it changes no record anybody else can see, so there is
  // nothing to broadcast (the reviewed housekeeping set in the publish seam).
  return json({ ok: true, autoStop: body.on })
}
