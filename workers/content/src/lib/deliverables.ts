// WHAT WE HAND OVER (CHECKLIST 8.7) — the handover shelf on one app.
//
// The owner's own definition, listing the kinds: "handover materials / handover
// docs / API documentation / loom or teller reviews / SOPs of how to use the
// app, etc." So a deliverable is a piece of MATERIAL with a kind, a title, a
// date, and something it points at.
//
// IT HANGS OFF AN APP, ALWAYS. `app_id` is NOT NULL and every write resolves the
// app first, which is what makes `account_id` a copy rather than a question: the
// app already knows whose system it is (the ruling is that an app belongs to ONE
// account and cannot be moved), so the fence rides one clause here with no join,
// exactly as it does on `processes` and its three children.
//
// THE MATERIAL IS ONE COLUMN FOR TWO SHAPES — an object we host (a
// /media/internal/… URL the upload door minted) or a link we do not (a Loom
// recording, a Google Doc, an API reference). `help_attachments` gives the
// reason at length and it is the same one here: "here is the thing I mean" is
// ONE act, and two columns would be two lists, two counts, and two ways to be
// wrong about which one is set. A link goes through `safeExternalLink` on the
// way in, so a `javascript:` URL is dropped at the boundary rather than stored
// and clicked.
//
// BOUNDED, NOT PAGED (R14). A handover shelf is CURATED — a few pieces of
// material per system, the way the brand library is a few dozen for the agency —
// not a feed that accumulates. The legacy app carried eight rows across
// twenty-eight apps. So the door answers with the whole shelf under a hard cap
// and its exact total beside it, and there is no cursor to spend.

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import type { Deliverable } from "@shared/types"
import { ensureSelectableValue } from "./vocabulary"
import { optionalDate, safeExternalLink } from "./internal-fields"

type DeliverableRow = {
  id: string
  app_id: string
  account_id: string | null
  title: string
  kind: string | null
  dated_on: string | null
  url: string | null
  image_url: string | null
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

function toDeliverable(r: DeliverableRow): Deliverable {
  return {
    id: r.id,
    appId: r.app_id,
    accountId: r.account_id,
    title: r.title,
    kind: r.kind,
    datedOn: r.dated_on,
    url: r.url,
    imageUrl: r.image_url,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

const COLUMNS = `id, app_id, account_id, title, kind, dated_on, url, image_url,
                 deactivated_at, created_at, creator_name, updated_at, editor_name`

/** The one narrowing this table answers to: which app's shelf, and (for the
 * live layer's row-level patch) which single row.
 *
 * Written once so the list and the count ask the same question — a badge over a
 * different WHERE than the rows it describes is R16's whole failure mode. */
export type DeliverableFilter = { appId?: string; id?: string }

function deliverableWhere(filter: DeliverableFilter): { sql: string; params: string[] } {
  const where: string[] = []
  const params: string[] = []
  if (filter.appId) {
    where.push("app_id = ?")
    params.push(filter.appId)
  }
  if (filter.id) {
    where.push("id = ?")
    params.push(filter.id)
  }
  return { sql: where.length ? ` WHERE ${where.join(" AND ")}` : "", params }
}

/** One app's shelf, newest first — archived rows included, because a deliverable
 * that was superseded is still a thing we handed over and "didn't we send them
 * the API doc in March?" has to stay answerable. */
export async function listDeliverables(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: DeliverableFilter
): Promise<Deliverable[]> {
  const w = deliverableWhere(filter)
  const rows = await d1Query<DeliverableRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: a CURATED shelf, capped like the brand library's. It does not
    // grow with ordinary use — a system is handed over a handful of times.
    `SELECT ${COLUMNS} FROM deliverables${w.sql}
      ORDER BY dated_on DESC, created_at DESC LIMIT ${LIST_HARD_CAP}`,
    w.params
  )
  return rows.map(toDeliverable)
}

/** R16: the exact server COUNT(*) the tab badge shows, over the SAME filter the
 * rows came from — never rows.length. */
export async function countDeliverables(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: DeliverableFilter
): Promise<number> {
  const w = deliverableWhere(filter)
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM deliverables${w.sql}`,
    w.params
  )
  return rows[0]?.n ?? 0
}

/** THE APP THIS BELONGS TO, or a clean refusal — and the account it carries.
 *
 * Every write goes through it, which is what makes `account_id` a fact copied
 * off the app rather than a field a caller may assert. A caller who could send
 * their own `accountId` could file our handover material under somebody else's
 * company, which is exactly the row a fence would then hand to the wrong client
 * the day this module has a portal door. */
async function appOrThrow(cfg: D1Rest, guard: MemberGuard, appId: string): Promise<string | null> {
  const rows = await d1Query<{ account_id: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT account_id FROM apps WHERE id = ? AND deactivated_at IS NULL LIMIT 1`,
    [appId]
  )
  if (!rows[0]) throw new GuardError(400, "invalid_input", "That app doesn't exist.")
  return rows[0].account_id
}

/** The row, or a clean refusal — AND the app it is really on.
 *
 * Both writes are told which app they are about, because the ping and the
 * response are about that app's shelf. Taking the caller's word for it would let
 * one misdirect both: a deliverable on app A, edited with app B's id, would ping
 * B's screen and answer with B's shelf while changing a row on A's. So the app
 * is CHECKED here rather than trusted — the same instinct that keeps
 * `account_id` off the request entirely. */
async function deliverableOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string,
  appId: string
): Promise<DeliverableRow> {
  const rows = await d1Query<DeliverableRow>(
    cfg,
    guard.databaseId,
    `SELECT ${COLUMNS} FROM deliverables WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows[0]) throw new GuardError(404, "deliverable_not_found", "That deliverable doesn't exist.")
  if (rows[0].app_id !== appId)
    throw new GuardError(400, "invalid_input", "That deliverable isn't on that app.")
  return rows[0]
}

export type DeliverableInput = {
  appId?: string
  title?: string
  kind?: string
  datedOn?: string
  url?: string
  imageUrl?: string
}

/** ONE validation path for both writes, so create and edit can never grow two
 * different ideas of what a deliverable is (the brand library's `clean`, in this
 * module's fields).
 *
 * `kind` is PICK-OR-CREATE against the team's own vocabulary: a word nobody has
 * used yet becomes a dropdown value instead of being refused, which is the whole
 * reason the owner's list ends in "etc." */
async function clean(cfg: D1Rest, guard: MemberGuard, actor: Actor, input: DeliverableInput) {
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)
  const kind = optionalText(input.kind, "Kind", TEXT_LIMITS.short) ?? null
  if (kind) await ensureSelectableValue(cfg, guard, actor, SELECTABLE_GROUPS.deliverableKind, kind)
  return {
    title,
    kind,
    // A real calendar day or a clean 400 — a value that is NEARLY a date sorts,
    // renders, and is wrong.
    datedOn: optionalDate(input.datedOn, "Date"),
    // A LINK IS NOT A FILE. Both arrive here as a string, and only http/https/
    // mailto survives: an unrecognised scheme is dropped rather than refused,
    // because a link is optional and losing a bad one costs nothing.
    url: safeExternalLink(optionalText(input.url, "Link", TEXT_LIMITS.link)),
    imageUrl: safeExternalLink(optionalText(input.imageUrl, "Picture", TEXT_LIMITS.link)),
  }
}

export async function createDeliverable(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  appId: string,
  input: DeliverableInput
): Promise<string> {
  const accountId = await appOrThrow(cfg, guard, appId)
  const v = await clean(cfg, guard, actor, input)
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO deliverables (id, app_id, account_id, title, kind, dated_on, url, image_url, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(appId)}, ${sqlString(accountId)}, ${sqlString(v.title)}, ${sqlString(v.kind)}, ${sqlString(v.datedOn)}, ${sqlString(v.url)}, ${sqlString(v.imageUrl)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Deliverable added",
    description: `${actor.name} handed over "${v.title}"`,
    relatedTable: "deliverables",
    relatedRowId: id,
  })
  return id
}

/** Edit one. The APP it hangs off is deliberately not editable, for the reason
 * an app cannot be moved between accounts: moving a deliverable would carry it,
 * and the account stamped on it, into somebody else's world in one write. File
 * it again on the right app and archive this one — two acts, both visible. */
export async function updateDeliverable(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  appId: string,
  input: DeliverableInput
): Promise<void> {
  const before = await deliverableOrThrow(cfg, guard, id, appId)
  const v = await clean(cfg, guard, actor, input)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE deliverables SET title = ${sqlString(v.title)}, kind = ${sqlString(v.kind)}, dated_on = ${sqlString(v.datedOn)}, url = ${sqlString(v.url)}, image_url = ${sqlString(v.imageUrl)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )
  const changes = describeChanges([
    { label: "Title", from: before.title, to: v.title },
    { label: "Kind", from: before.kind, to: v.kind },
    { label: "Date", from: before.dated_on, to: v.datedOn },
    { label: "Link", from: before.url, to: v.url },
    { label: "Picture", from: before.image_url, to: v.imageUrl },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Deliverable edited",
    description: `${actor.name} edited "${v.title}"${changes ? `, ${changes}` : ""}`,
    relatedTable: "deliverables",
    relatedRowId: id,
  })
}

/** Archive or restore. R17: the current-status predicate rides the UPDATE, so a
 * double press moves zero rows and writes no second line of history.
 *
 * The BYTES are never reclaimed, the brand library's reason word for word: an
 * archived row is a reversible decision about a row that survives on purpose,
 * and deleting the object would hand back a deliverable whose file 404s the
 * moment somebody restores it. */
export async function setDeliverableActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  appId: string,
  active: boolean
): Promise<boolean> {
  const before = await deliverableOrThrow(cfg, guard, id, appId)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE deliverables SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE deliverables SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Deliverable restored" : "Deliverable archived",
    description: `${actor.name} ${active ? "restored" : "archived"} "${before.title}"`,
    relatedTable: "deliverables",
    relatedRowId: id,
  })
  return true
}
