// Dropdown-values routes ("Selectable data"): list the team's values, add one,
// rename one, deactivate/reactivate one. Gated by the `selectable_data` module
// (read to view, create/edit/delete to manage). Each mutation broadcasts a live
// change ping (the publish-seam test enforces this).

import { refusePortalCaller } from "@shared/workers/account-scope"
import { fail, json } from "@shared/workers/http"
import { csvResponse, exportTooLarge, toCsv } from "@shared/workers/csv"
import { EXPORT_HARD_CAP } from "@shared/workers/limits"
import { optionalMark, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { gated, gatedBody } from "@shared/workers/route"
import {
  createSelectable,
  listSelectable,
  selectableOne,
  setSelectableActive,
  setSelectableDefault,
  updateSelectable,
  listSelectableForExport,
  countSelectable,
} from "../lib/selectable"
import type { Env } from "../env"

export async function getSelectable(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "selectable_data", "read")
  await refusePortalCaller(cfg, guard)
  // ?id= → ONE value, for the row-level live re-pull. It used to load the whole
  // vocabulary and an exact COUNT(*) and then filter to one row in JavaScript —
  // two round trips and a thousand-row cap to answer a question about one row,
  // on every connected browser on every edit, INCLUDING the browser that made
  // the edit (there is no echo suppression, so the saver re-reads the list it
  // was just handed in the response). That is why saving felt slow.
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (id) {
    const one = await selectableOne(cfg, guard, id)
    return json({ values: one ? [one] : [], total: await countSelectable(cfg, guard) })
  }
  // Two reads that do not depend on each other, so they do not queue.
  const [values, total] = await Promise.all([listSelectable(cfg, guard), countSelectable(cfg, guard)])
  return json({ values, total })
}

/** GET /api/tenancy/selectable/export — the team's dropdown values as a full-field
 * CSV (EXPORT NEEDS READ; team-bound). Columns lead with the import format
 * (type, value) so the file round-trips through the CSV importer. */
export async function getSelectableExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "selectable_data", "read")
  await refusePortalCaller(cfg, guard)
  const { rows, complete } = await listSelectableForExport(cfg, guard)
  // Whole, or an error — never a short file that looks like the vocabulary.
  if (!complete)
    return exportTooLarge(EXPORT_HARD_CAP, "dropdown values", "Read the Dropdown values screen instead, or retire the options you no longer offer.")
  const csv = toCsv(
    ["type", "value", "active", "created_at", "created_by"],
    rows.map((r) => [r.type, r.value, r.deactivated_at == null, r.created_at, r.creator_name])
  )
  return csvResponse("dropdown-values.csv", csv)
}

export async function postCreateSelectable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ type?: string; value?: string; mark?: string }>(request, env, "selectable_data", "create")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO. Every READ door on this module already
  // refuses a client login; not one WRITE door did, so the refusal existed on the
  // module and was missing on exactly the half that changes things. It held only
  // because the shipped Client role happens not to carry the right — and R21's own
  // sentence is that the decision belongs at the door, precisely so it does not
  // depend on how carefully a role was built.
  await refusePortalCaller(cfg, guard)
  const type = requireText(body.type, "Group", TEXT_LIMITS.short)
  const value = requireText(body.value, "Option", TEXT_LIMITS.short)
  // R20: the glyph goes through the same seam as the words. `TEXT_LIMITS.tiny`
  // because a type mark is a short word, initial or two-letter code, not a
  // sentence, and `optionalMark` (not `optionalText`) because the client's
  // ruling on 2026-08-31 means this is exactly the field a pictograph reached
  // staging through — see optionalMark's own comment.
  const mark = optionalMark(body.mark, "Mark", TEXT_LIMITS.tiny)
  const id = await createSelectable(cfg, guard, actor, type, value, mark)
  // Row-level: carry the new value's id so open lists can patch just that row.
  await publishChange(env, guard.teamId, "selectable_data", id, "add")
  return json(await listAndCount(cfg, guard))
}

export async function postUpdateSelectable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; value?: string; mark?: string }>(request, env, "selectable_data", "edit")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO. Every READ door on this module already
  // refuses a client login; not one WRITE door did, so the refusal existed on the
  // module and was missing on exactly the half that changes things. It held only
  // because the shipped Client role happens not to carry the right — and R21's own
  // sentence is that the decision belongs at the door, precisely so it does not
  // depend on how carefully a role was built.
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Option", TEXT_LIMITS.short)
  const value = requireText(body.value, "Option", TEXT_LIMITS.short)
  const mark = optionalMark(body.mark, "Mark", TEXT_LIMITS.tiny)
  await updateSelectable(cfg, guard, actor, id, value, mark)
  await publishChange(env, guard.teamId, "selectable_data", id)
  return json(await listAndCount(cfg, guard))
}

export async function postSetSelectableActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; active?: boolean }>(request, env, "selectable_data", "delete")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO. Every READ door on this module already
  // refuses a client login; not one WRITE door did, so the refusal existed on the
  // module and was missing on exactly the half that changes things. It held only
  // because the shipped Client role happens not to carry the right — and R21's own
  // sentence is that the decision belongs at the door, precisely so it does not
  // depend on how carefully a role was built.
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Option", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "id and active are required.")
  // R17: no-op repeat → no ping, no duplicate history (see setSelectableActive).
  const changed = await setSelectableActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "selectable_data", id)
  return json(await listAndCount(cfg, guard))
}

/** THE TAIL EVERY MUTATION SHARES. Two reads that do not depend on each other,
 * so they run together rather than queuing: written as two awaits in one object
 * literal they were sequential, because JavaScript evaluates properties in order
 * — one of those "reads like it is concurrent and is not" shapes. */
async function listAndCount(cfg: Parameters<typeof listSelectable>[0], guard: Parameters<typeof listSelectable>[1]) {
  const [values, total] = await Promise.all([listSelectable(cfg, guard), countSelectable(cfg, guard)])
  return { values, total }
}

/** POST /api/tenancy/selectable/default — mark a value as one of the team's
 * defaults, or take that mark off.
 *
 * The switch beside the refusal in `setSelectableActive`: a default value cannot
 * be switched off while it is still marked as one, so this is how a team takes
 * the protection off something it really does want gone. Gated on `edit` rather
 * than `delete` — marking a word as furniture is an edit to the vocabulary, and
 * `delete` is the right to REMOVE, which is exactly the thing this defends. */
export async function postSetSelectableDefault(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; isDefault?: boolean }>(request, env, "selectable_data", "edit")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO — the same refusal the other three
  // write doors on this module carry, for the same reason: the decision belongs
  // at the door, not to how carefully a role happened to be built.
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Option", TEXT_LIMITS.short)
  // R20 positional: a truthiness guard is not a type check.
  if (typeof body.isDefault !== "boolean")
    return fail(400, "invalid_input", "id and isDefault are required.")
  // R17: a no-op repeat moves zero rows → no ping, no duplicate history.
  const changed = await setSelectableDefault(cfg, guard, actor, id, body.isDefault)
  if (changed) await publishChange(env, guard.teamId, "selectable_data", id)
  return json(await listAndCount(cfg, guard))
}
