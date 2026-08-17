// Meeting-purpose routes — why the agency meets, and which department owns it.
// Same shape as its siblings; R21 on every door, because a description of our
// own organisation is the agency's and never a client's.

import { refusePortalCaller } from "@shared/workers/account-scope"
import { fail, json } from "@shared/workers/http"
import { csvResponse, exportTooLarge, toCsv } from "@shared/workers/csv"
import { EXPORT_HARD_CAP } from "@shared/workers/limits"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { gated, gatedBody } from "@shared/workers/route"
import {
  countMeetingPurposes,
  createMeetingPurpose,
  listMeetingPurposes,
  listMeetingPurposesForExport,
  setMeetingPurposeActive,
  updateMeetingPurpose,
  type MeetingPurposeInput,
} from "../lib/delivery"
import type { Env } from "../env"

/* ---------------------------- meeting purposes ---------------------------- */

export async function getMeetingPurposes(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "delivery", "read")
  await refusePortalCaller(cfg, guard)
  const purposes = await listMeetingPurposes(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id") // ?id= → one purpose
  // R16: the exact server total rides every list response.
  return json({
    purposes: id ? purposes.filter((p) => p.id === id) : purposes,
    total: await countMeetingPurposes(cfg, guard),
  })
}

export async function getMeetingPurposesExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "delivery", "read")
  await refusePortalCaller(cfg, guard)
  const { rows, complete } = await listMeetingPurposesForExport(cfg, guard)
  if (!complete)
    return exportTooLarge(EXPORT_HARD_CAP, "meeting purposes", "Archive the ones you no longer meet for, then export again.")
  const csv = toCsv(
    ["name", "department", "description", "active", "created_at", "created_by", "updated_at", "updated_by"],
    rows.map((p) => [
      p.name, p.department, p.description,
      p.deactivated_at == null, p.created_at, p.creator_name, p.updated_at, p.editor_name,
    ])
  )
  return csvResponse("meeting-purposes.csv", csv)
}

export async function postCreateMeetingPurpose(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<MeetingPurposeInput>(request, env, "delivery", "create")
  await refusePortalCaller(cfg, guard)
  requireText(body.name, "Name", TEXT_LIMITS.short)
  const id = await createMeetingPurpose(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "meeting_purposes", id, "add")
  return json({ purposes: await listMeetingPurposes(cfg, guard), total: await countMeetingPurposes(cfg, guard) })
}

export async function postUpdateMeetingPurpose(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<MeetingPurposeInput & { id?: string }>(
    request, env, "delivery", "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Meeting purpose", TEXT_LIMITS.short)
  requireText(body.name, "Name", TEXT_LIMITS.short)
  await updateMeetingPurpose(cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "meeting_purposes", id)
  return json({ purposes: await listMeetingPurposes(cfg, guard), total: await countMeetingPurposes(cfg, guard) })
}

/** Archive / restore a meeting purpose — never deleted. Gated delivery:delete. */
export async function postSetMeetingPurposeActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request, env, "delivery", "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Meeting purpose", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "id and active are required.")
  // R17: a no-op repeat moves zero rows → no ping, no duplicate history.
  const changed = await setMeetingPurposeActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "meeting_purposes", id)
  return json({ purposes: await listMeetingPurposes(cfg, guard), total: await countMeetingPurposes(cfg, guard) })
}
