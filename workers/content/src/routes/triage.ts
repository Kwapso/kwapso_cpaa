// TRIAGE routes — whose week it is, and what has been sitting.
//
// Both refuse a client login (R21). The needs-triage list is a list of requests
// WE have not read yet, and showing a client "your question has been sitting
// untouched for four days" is exactly the SLA promise .plans/BUILD-1 §6 says this
// feature is not: "internal nudge only — nothing client-facing".

import { fail, json } from "@shared/workers/http"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { dutyFor, needsTriage, requireWeek, setDuty } from "../lib/triage"
import { teamMemberNames } from "../lib/notify"
import type { Env } from "../env"

/** GET /api/content/triage — the rota and the backlog of unread requests
 * (help:read). One door, because they are one screen and one question: is
 * anything sitting, and whose job is it? */
export async function getTriage(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  await refusePortalCaller(cfg, guard)
  const at = new Date()
  const week = requireWeek(queryText(new URL(request.url).searchParams.get("week"), "Week"))
  const [onDuty, waiting] = await Promise.all([
    dutyFor(cfg, guard, new Date(Date.parse(week))),
    needsTriage(cfg, guard, at),
  ])
  return json({ onDuty, waiting: waiting.waiting, total: waiting.total })
}

/** POST /api/content/triage — put somebody on duty for a week (help:edit).
 *
 * The person is named by user id and PROVED against the team's own membership
 * before it is written: a rota naming somebody who left is a rota nobody reads
 * twice. `week` may be any date in the week; the lib snaps it to its Monday. */
export async function postSetTriageDuty(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ userId?: unknown; week?: unknown }>(
    request,
    env,
    "help",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const userId = requireText(body.userId, "Person", TEXT_LIMITS.short)
  const week = requireWeek(
    typeof body.week === "string" ? requireText(body.week, "Week", TEXT_LIMITS.short) : undefined
  )
  const members = await teamMemberNames(env, guard.teamId)
  const person = members.find((m) => m.userId === userId)
  if (!person) return fail(400, "invalid_input", "That person isn't on this team.")

  await setDuty(cfg, guard, actor, week, { userId: person.userId, userName: person.name })
  // Whose week it is shows on every staff screen that carries the triage strip,
  // so the change has to reach them without a reload. The ping names the WEEK
  // rather than a row id: the rota is read by week, and the week is what changed.
  await publishChange(env, guard.teamId, "triage_duty", week, "edit")
  const at = new Date()
  const waiting = await needsTriage(cfg, guard, at)
  return json({
    onDuty: await dutyFor(cfg, guard, new Date(Date.parse(week))),
    waiting: waiting.waiting,
    total: waiting.total,
  })
}
