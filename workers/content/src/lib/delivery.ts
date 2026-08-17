// WHY WE MEET — one thin legacy table (27 rows) under the `delivery` module.
//
// It had a neighbour until 17 Aug 2026: `programs`, the ten ways the agency runs
// an engagement. The owner ruled that the Delivery method PAGE goes and that its
// enrichment — the mark, the German name, the description and the standard
// length — belongs on the SPRINT TYPE a person actually picks, so the programme
// half of this module moved into the dropdown vocabulary and left the module
// with one table. Nothing was lost; migration 0025 carries every field across.
//
// THE ONE THING WORTH READING TWICE is why a meeting purpose is a record at all,
// when `departments` and `channels` — its neighbours in the same legacy export —
// became dropdown values. A purpose carries a DEPARTMENT. A dropdown row is a
// single label with nowhere to put a second fact, so making the table fit the
// vocabulary seam would have meant dropping the only structure it has. So the
// purpose is a record and its department is the dropdown value: each fact stored
// the way its own shape asks, rather than both bent to fit one seam.
//
// The list is capped (R14): why an agency meets is a settled taxonomy it revises
// a few times a year, not a collection that grows with use.

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { EXPORT_HARD_CAP, LIST_HARD_CAP } from "@shared/workers/limits"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import type { MeetingPurpose } from "@shared/types"
import { ensureSelectableValue } from "./vocabulary"

/* ---------------------------- meeting purposes ---------------------------- */

type PurposeRow = {
  id: string
  name: string
  department: string | null
  description: string | null
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

const PURPOSE_COLUMNS = `id, name, department, description,
                         deactivated_at, created_at, creator_name, updated_at, editor_name`

function toPurpose(r: PurposeRow): MeetingPurpose {
  return {
    id: r.id,
    name: r.name,
    department: r.department,
    description: r.description,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

/** Every meeting purpose (active + retired), by department then name. */
export async function listMeetingPurposes(cfg: D1Rest, guard: MemberGuard): Promise<MeetingPurpose[]> {
  const rows = await d1Query<PurposeRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: a settled taxonomy, not a growing collection.
    `SELECT ${PURPOSE_COLUMNS} FROM meeting_purposes ORDER BY department ASC, name ASC LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map(toPurpose)
}

/** R16: the exact server COUNT(*) the badge shows — never rows.length. */
export async function countMeetingPurposes(cfg: D1Rest, guard: MemberGuard): Promise<number> {
  const rows = await d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM meeting_purposes")
  return rows[0]?.n ?? 0
}

async function purposeOrThrow(cfg: D1Rest, guard: MemberGuard, id: string): Promise<PurposeRow> {
  const rows = await d1Query<PurposeRow>(
    cfg,
    guard.databaseId,
    `SELECT ${PURPOSE_COLUMNS} FROM meeting_purposes WHERE id = ?`,
    [id]
  )
  if (!rows[0]) throw new GuardError(404, "meeting_purpose_not_found", "That meeting purpose doesn't exist.")
  return rows[0]
}

export type MeetingPurposeInput = { name?: string; department?: string; description?: string }

/** One validation path for both writes — the department is pick-or-created, which
 * is the whole reason this table kept its own shape. */
async function cleanPurpose(cfg: D1Rest, guard: MemberGuard, actor: Actor, input: MeetingPurposeInput) {
  const name = requireText(input.name, "Name", TEXT_LIMITS.short)
  const department = optionalText(input.department, "Department", TEXT_LIMITS.short) ?? null
  if (department) await ensureSelectableValue(cfg, guard, actor, SELECTABLE_GROUPS.department, department)
  return {
    name,
    department,
    description: optionalText(input.description, "Description", TEXT_LIMITS.long) ?? null,
  }
}

export async function createMeetingPurpose(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: MeetingPurposeInput
): Promise<string> {
  const v = await cleanPurpose(cfg, guard, actor, input)
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO meeting_purposes (id, name, department, description, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(v.name)}, ${sqlString(v.department)}, ${sqlString(v.description)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Meeting purpose created",
    description: `${actor.name} added the "${v.name}" meeting purpose`,
    relatedTable: "meeting_purposes",
    relatedRowId: id,
  })
  return id
}

export async function updateMeetingPurpose(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: MeetingPurposeInput
): Promise<void> {
  const before = await purposeOrThrow(cfg, guard, id)
  const v = await cleanPurpose(cfg, guard, actor, input)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE meeting_purposes SET name = ${sqlString(v.name)}, department = ${sqlString(v.department)}, description = ${sqlString(v.description)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )
  const changes = describeChanges([
    { label: "Name", from: before.name, to: v.name },
    { label: "Department", from: before.department, to: v.department },
    { label: "Description", from: before.description, to: v.description },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Meeting purpose edited",
    description: `${actor.name} edited the "${v.name}" meeting purpose${changes ? ` — ${changes}` : ""}`,
    relatedTable: "meeting_purposes",
    relatedRowId: id,
  })
}

/** Retire or restore a meeting purpose. R17: the predicate rides the UPDATE. */
export async function setMeetingPurposeActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const before = await purposeOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE meeting_purposes SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE meeting_purposes SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Meeting purpose restored" : "Meeting purpose archived",
    description: `${actor.name} ${active ? "restored" : "archived"} the "${before.name}" meeting purpose`,
    relatedTable: "meeting_purposes",
    relatedRowId: id,
  })
  return true
}

/** Whole, or an error. */
export async function listMeetingPurposesForExport(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ rows: PurposeRow[]; complete: boolean }> {
  const rows = await d1Query<PurposeRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap (export tier); the +1 answers "was there more?".
    `SELECT ${PURPOSE_COLUMNS} FROM meeting_purposes ORDER BY department, name LIMIT ${EXPORT_HARD_CAP + 1}`
  )
  return { rows: rows.slice(0, EXPORT_HARD_CAP), complete: rows.length <= EXPORT_HARD_CAP }
}
