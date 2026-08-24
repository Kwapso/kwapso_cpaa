// A DRAFT PROCESS MAP — what an extraction proposed, before anybody agreed to it.
//
// ── THE ONE SENTENCE THIS FILE EXISTS TO KEEP TRUE ───────────────────────────
//
// THE DRAFT IS NOT THE RECORD. With eleven proposed steps sitting here and Alex
// having touched nothing, what is on the client's record is NOTHING — not a
// greyed-out step, not a step with a flag on it, nothing. That is why a proposal
// is JSON in `process_drafts.payload` rather than rows in `process_steps`: a
// draft normalised into the real table is one forgotten `WHERE` away from being
// the map, and the reader who forgets it is a savings roll-up quoting a client a
// figure derived from words a model put in their mouth.
//
// So there are exactly two writes in this file, and neither of them is an INSERT
// into a process table:
//   • `createDraft` writes ONE row to `process_drafts`;
//   • `applyDraft` calls `addStep` / `updateStep` from lib/processes.ts.
//
// APPLYING GOES THROUGH THE MAP'S OWN DOORS, deliberately and without exception.
// Those two functions freeze the role's hourly cost at write time, refuse a role
// or a tool belonging to another client, write the dated revision the history
// slider reads, refuse an edit to anything but the current version, and log the
// activity. An INSERT of my own would have to remember all six, and would be
// wrong about at least one of them the first time any of those rules changed.
// Every law those functions carry, a draft carries by construction.
//
// ── THE FENCE ────────────────────────────────────────────────────────────────
//
// Every statement here ANDs `accountScopeClause` in, the same as lib/processes.ts
// and lib/accounts.ts: "did this query carry the caller's stamp?" has one place
// to look. `account_id` and `app_id` on a draft row are copied from the PROCESS
// row, read under that same fence — never from the request — so a draft cannot be
// filed against a client the caller cannot see.

import { logActivity, type Actor } from "@shared/workers/activity"
import { accountScopeClause, type AccountScope } from "@shared/workers/account-scope"
import { countCollection } from "@shared/workers/count"
import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import { SAVINGS_CAPTION } from "@shared/workers/savings"
import {
  EMPTY_DRAFT,
  type DraftApplyResult,
  type DraftDecisions,
  type DraftStatus,
  type ProcessDraftDetail,
  type ProcessDraftPayload,
  type ProcessDraftSummary,
} from "@shared/process-drafts"
import { addStep, listProcessSteps, updateStep } from "./processes"
import { GuardError, type MemberGuard } from "./permissions"

/** Glue optional clauses into a WHERE, dropping the empty ones — the same four
 * lines lib/processes.ts and lib/accounts.ts each keep beside their own
 * statements, for the reason stated there: two copies beat one import that makes
 * two security boundaries share a file. */
function where(parts: (string | undefined)[]): string {
  const live = parts.filter((p): p is string => !!p && p.length > 0)
  return live.length ? ` WHERE ${live.join(" AND ")}` : ""
}

/** THE ROW, AS THE DATABASE HOLDS IT. */
type DraftRow = {
  id: string
  account_id: string | null
  app_id: string | null
  process_id: string | null
  source_meeting_id: string | null
  source_text: string | null
  payload: string
  status: string
  applied_at: string | null
  created_at: string
  creator_name: string | null
}

/** The columns every read here selects. `payload` is deliberately NOT among them
 * — it is a whole conversation's worth of JSON and a list of twenty drafts would
 * be a megabyte of it. `listDrafts` counts the payload's contents in SQL instead;
 * `getDraft` asks for the column by name. */
const ROW_COLUMNS =
  "id, account_id, app_id, process_id, source_meeting_id, source_text, status, applied_at, created_at, creator_name"

/** The same columns, qualified for the list's join. Derived from the line above
 * rather than typed twice, so the two can't drift by a column. */
const PREFIXED_COLUMNS = ROW_COLUMNS.split(", ")
  .map((c) => `d.${c}`)
  .join(", ")

/** HOW MANY OF ONE KIND A PAYLOAD HOLDS, counted by the database. A cell that is
 * not valid JSON counts as none rather than raising — see the call site. */
function jsonCount(kind: "steps" | "roles" | "tools"): string {
  return `CASE WHEN json_valid(d.payload) THEN COALESCE(json_array_length(d.payload, '$.${kind}'), 0) ELSE 0 END`
}

/** A STORED PAYLOAD, PARSED DEFENSIVELY. This app wrote the cell, which is
 * exactly why it is read like this: a half-written row, a hand-edit in the
 * console or a migration would otherwise throw inside a read and turn a screen
 * into a 500. Anything that is not the shape is an EMPTY proposal — never a
 * partial one, which is the same rule `parseStringArray` follows. */
function readPayload(json: string | null): ProcessDraftPayload {
  if (!json) return EMPTY_DRAFT
  try {
    const value: unknown = JSON.parse(json)
    if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_DRAFT
    const v = value as Partial<ProcessDraftPayload>
    return {
      processName: typeof v.processName === "string" ? v.processName : null,
      summary: typeof v.summary === "string" ? v.summary : null,
      steps: Array.isArray(v.steps) ? v.steps : [],
      roles: Array.isArray(v.roles) ? v.roles : [],
      tools: Array.isArray(v.tools) ? v.tools : [],
    }
  } catch {
    return EMPTY_DRAFT
  }
}

/** The three statuses the column's own CHECK allows. Anything else in the cell is
 * a database somebody edited by hand, and it reads as the safest of the three. */
function readStatus(said: string): DraftStatus {
  return said === "applied" || said === "discarded" ? said : "proposed"
}

function toSummary(
  row: DraftRow & { step_count?: number; role_count?: number; tool_count?: number },
  payload: ProcessDraftPayload | null,
  processName: string | null
): ProcessDraftSummary {
  return {
    id: row.id,
    accountId: row.account_id,
    appId: row.app_id,
    processId: row.process_id,
    processName,
    sourceMeetingId: row.source_meeting_id,
    hasSourceText: !!row.source_text,
    status: readStatus(row.status),
    stepCount: payload ? payload.steps.length : (row.step_count ?? 0),
    roleCount: payload ? payload.roles.length : (row.role_count ?? 0),
    toolCount: payload ? payload.tools.length : (row.tool_count ?? 0),
    appliedAt: row.applied_at,
    createdAt: row.created_at,
    createdByName: row.creator_name,
  }
}

/* --------------------------------- reading --------------------------------- */

/** What a caller may narrow the list by. Both are optional and both are the
 * caller's own words off the query string, already through `queryText`. */
export type DraftFilters = { processId?: string | null; appId?: string | null; status?: string | null }

/** The list's OWN question, built once so the count and the page ask it
 * identically (R16: a badge counting more than its list can show is the leak). */
function draftsWhere(scope: AccountScope, opts: DraftFilters): { sql: string; params: string[] } {
  const fence = accountScopeClause(scope, "d.account_id")
  const parts: string[] = []
  const params: string[] = [...fence.params]
  if (fence.sql) parts.push(fence.sql)
  if (opts.processId) {
    parts.push("d.process_id = ?")
    params.push(opts.processId)
  }
  if (opts.appId) {
    parts.push("d.app_id = ?")
    params.push(opts.appId)
  }
  // Only the three the column's CHECK allows — anything else narrows to nothing
  // rather than being ignored, because a filter that silently does not apply is
  // a list somebody trusts for the wrong reason.
  if (opts.status) {
    parts.push("d.status = ?")
    params.push(opts.status)
  }
  return { sql: where(parts), params }
}

/** THE EXACT SERVER COUNT of the drafts this caller may see (R16), through the
 * one bounded seam, over the SAME WHERE the page below uses. */
export async function countDrafts(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: DraftFilters = {}
): Promise<number> {
  const q = draftsWhere(scope, opts)
  // One row per member and no parentheses of its own — `boundedInner` wraps and
  // caps this, and a subquery that brackets itself becomes `((…) LIMIT n)`.
  return countCollection(cfg, guard.databaseId, `SELECT 1 FROM process_drafts d${q.sql}`, q.params)
}

/** EVERY DRAFT THIS CALLER MAY SEE, newest first, with its total.
 *
 * BOUNDED rather than paged (R14), and the reasoning is the collection's own
 * shape: a draft is one CALL. A client has a handful of processes and a process
 * is discussed once or twice — this is not `help` or the activity feed, it does
 * not grow with ordinary use, and a hard cap here is an honest ceiling rather
 * than a refusal anybody will meet. If it ever does grow that way, the answer is
 * `GROWING_COLLECTIONS` and real keyset paging, not a bigger number. */
export async function listDrafts(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: DraftFilters = {}
): Promise<{ rows: ProcessDraftSummary[]; total: number }> {
  const q = draftsWhere(scope, opts)
  const rows = await d1Query<DraftRow & { process_name: string | null }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a draft is one conversation about one process, not a feed.
    //
    // The three counts are computed IN SQL rather than by parsing the payload of
    // every row, which is the whole reason `payload` is left out of the select: a
    // list of twenty drafts should not ship a megabyte of JSON to draw three
    // badges. `json_valid` guards each one because a malformed cell makes
    // `json_array_length` raise rather than return — and one hand-edited row
    // must not turn a whole list into a 500.
    `SELECT ${PREFIXED_COLUMNS},
            p.name AS process_name,
            ${jsonCount("steps")} AS step_count,
            ${jsonCount("roles")} AS role_count,
            ${jsonCount("tools")} AS tool_count
       FROM process_drafts d
       LEFT JOIN processes p ON p.id = d.process_id
      ${q.sql}
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT ${LIST_HARD_CAP}`,
    q.params
  )
  return {
    rows: rows.map((r) => toSummary(r, null, r.process_name)),
    total: await countDrafts(cfg, guard, scope, opts),
  }
}

/** ONE DRAFT, OPENED — the row, the proposal itself, and the sentence the
 * durations in it must be quoted with (R25), carried WITH the numbers so no
 * screen has to remember to attach it. */
export async function getDraft(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<ProcessDraftDetail> {
  const row = await draftOrThrow(cfg, guard, scope, id)
  const process = row.process_id ? await processNameOf(cfg, guard, scope, row.process_id) : null
  const payload = readPayload(row.payload)
  // WHAT EACH REVISION REPLACES, resolved here so the review can show
  // `25 min → 1 min` rather than `1 min`.
  //
  // A revision is the one row on that screen a person cannot check: everything
  // starts kept, and lowering a duration RAISES the saving the client is shown —
  // so a proposal that flatters us is exactly the one a reviewer needs something
  // to compare against. A transcript is untrusted text, and this is where the
  // person, not the model, gets the last word.
  const revising = payload.steps.filter((x) => x.revisesStepId)
  if (revising.length && row.process_id) {
    const current = await listProcessSteps(cfg, guard, scope, row.process_id)
    const byId = new Map(current.map((x) => [x.id, x]))
    for (const step of revising) {
      const before = byId.get(step.revisesStepId as string)
      step.revisesName = before?.name ?? null
      step.revisesSecondsPerRun = before?.secondsPerRun ?? null
    }
  }
  return {
    draft: toSummary(row, payload, process),
    payload,
    savingsCaption: SAVINGS_CAPTION,
  }
}

/* --------------------------------- writing --------------------------------- */

/** WHAT THE EXTRACTION NEEDS TO READ THE CALL WELL — the client's own words for
 * who does the work and what they do it in, and the steps the map already holds.
 *
 * It is a read on this side of the fence so that `lib/process-extract.ts` never
 * touches a row: the model gets a list of names that the caller was already
 * allowed to see, and nothing it says can widen that. */
export async function draftContext(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<{
  accountId: string | null
  appId: string
  processName: string
  existingSteps: { id: string; name: string }[]
}> {
  const process = await processForDraftOrThrow(cfg, guard, scope, processId)
  const steps = await listProcessSteps(cfg, guard, scope, processId)
  return {
    accountId: process.accountId,
    appId: process.appId,
    processName: process.name,
    existingSteps: steps.filter((s) => !s.removed).map((s) => ({ id: s.id, name: s.name })),
  }
}

/** FILE A PROPOSAL. Writes ONE row, to ONE table, and nothing else — see the
 * header. Returns the id.
 *
 * `sourceMeetingId` and `sourceText` are the two ways the words arrive: a meeting
 * we already hold, or text somebody pasted when there is not one. Both columns
 * exist on the table because both are real; a draft carries whichever it was
 * made from, so "where did this come from?" is answerable a year later. */
export async function createDraft(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: {
    processId: string
    payload: ProcessDraftPayload
    sourceMeetingId?: string | null
    sourceText?: string | null
  }
): Promise<string> {
  const process = await processForDraftOrThrow(cfg, guard, scope, input.processId)
  const id = ulid()
  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO process_drafts
       (id, account_id, app_id, process_id, source_meeting_id, source_text, payload, status,
        created_at, creator_id, creator_email, creator_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?)`,
    [
      id,
      // THE CLIENT AND THE APP COME OFF THE PROCESS ROW, never off the request.
      // A draft filed against an account the caller cannot see would be a row
      // outside its own fence — invisible to them and visible to somebody else.
      process.accountId,
      process.appId,
      input.processId,
      input.sourceMeetingId ?? null,
      input.sourceText ?? null,
      JSON.stringify(input.payload),
      now,
      actor.id,
      actor.email,
      actor.name,
    ]
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Draft proposed",
    description: `${actor.name} had a call read for ${process.name}: ${input.payload.steps.length} step${
      input.payload.steps.length === 1 ? "" : "s"
    } proposed, none applied`,
    relatedTable: "process_drafts",
    relatedRowId: id,
  })
  return id
}

/** APPLY WHAT SURVIVED THE REVIEW — and only that.
 *
 * ── THE ORDER IS THE IDEMPOTENCE (R17) ───────────────────────────────────────
 *
 * The status move happens FIRST, as one UPDATE carrying `status = 'proposed'` in
 * its own WHERE, and only a draft that actually moved is then written from. Two
 * people pressing Apply at the same moment both read a proposed draft; exactly
 * one of them moves a row, and the loser writes not one step. Checking first and
 * updating after is two statements a concurrent write slips between, which is
 * how a client's map ends up with every step on it twice.
 *
 * The cost of claiming first is the opposite failure: a draft marked applied
 * whose steps did not all get written. That is the direction to fail in — the
 * map is short and a person can see it, where the other direction is a duplicate
 * map nobody notices until the savings figure is wrong.
 *
 * ── WHAT "ACCEPT THE STEPS AND REJECT THE TOOLS" MEANS HERE ──────────────────
 *
 * A kind that was rejected is simply a kept-list with nothing in it, so a step
 * whose role was rejected is applied with `roleId: undefined` — which `addStep`
 * reads as "take the map's own default", the fact that was already true before
 * the call. It does NOT clear the role: rejecting a proposal is declining to
 * take the model's word for something, never an instruction to erase what a
 * person recorded. */
export async function applyDraft(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  decisions: DraftDecisions
): Promise<DraftApplyResult> {
  const row = await draftOrThrow(cfg, guard, scope, id)
  if (!row.process_id)
    throw new GuardError(409, "no_process", "That draft isn't attached to a process map yet.")
  const process = await processForDraftOrThrow(cfg, guard, scope, row.process_id)
  const payload = readPayload(row.payload)

  // THE CLAIM. Zero rows moved = somebody already applied or discarded it, and
  // the honest answer is "nothing happened" rather than a second application.
  const fence = accountScopeClause(scope, "account_id")
  const claimed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE process_drafts SET status = 'applied', applied_at = ?
     ${where([fence.sql, "id = ?", "status = 'proposed'"])} RETURNING id`,
    [new Date().toISOString(), ...fence.params, id]
  )
  if (!claimed[0]) return { applied: false, stepsAdded: 0, stepsRevised: 0, skipped: 0 }

  const keptSteps = new Set(decisions.keepSteps)
  const keptRoles = new Set(decisions.keepRoles)
  const keptTools = new Set(decisions.keepTools)
  const roleOf = new Map(payload.roles.map((r) => [r.key, r]))
  const toolOf = new Map(payload.tools.map((t) => [t.key, t]))
  // The map as it stands RIGHT NOW — which is what a revision has to be checked
  // against, because a version cut between the extraction and the review moves
  // every step to a row `updateStep` will refuse.
  const current = await listProcessSteps(cfg, guard, scope, row.process_id)
  const currentById = new Map(current.map((s) => [s.id, s]))

  let stepsAdded = 0
  let stepsRevised = 0
  let skipped = 0

  for (const step of payload.steps) {
    if (!keptSteps.has(step.key)) continue
    // A KEPT ROLE THAT MATCHED ONE OF THE CLIENT'S OWN ROWS becomes an id;
    // anything else is `undefined`, which both doors read as "leave this to the
    // rule that was already in force". An unmatched name can never become an id
    // here — `addStep` would refuse it anyway, and inventing a role is not this
    // module's business (see the header).
    const role = step.roleKey ? roleOf.get(step.roleKey) : undefined
    const roleId =
      role && keptRoles.has(role.key) && role.matchedId ? role.matchedId : undefined
    const tool = step.toolKey ? toolOf.get(step.toolKey) : undefined
    const toolId =
      tool && keptTools.has(tool.key) && tool.matchedId ? tool.matchedId : undefined

    if (step.revisesStepId) {
      // ── A REVISION (ruling 5): a second call about the same process proposes
      // CHANGES to the steps we hold, applied as an edit — which writes the
      // dated revision the history slider reads — never a duplicate step and
      // never a second map.
      const before = currentById.get(step.revisesStepId)
      // The step has moved to an older version since the call was read (somebody
      // cut one), so it can no longer be edited. Counted, never forced.
      if (!before) {
        skipped++
        continue
      }
      await updateStep(cfg, guard, scope, actor, step.revisesStepId, {
        name: step.name,
        description: step.description ?? before.description,
        // A ZERO IS A QUESTION, NOT A CHANGE. The extraction writes 0 when the
        // call did not say how long something takes; applying that as an edit
        // would overwrite a duration a client agreed with a blank the
        // conversation never contained.
        secondsPerRun: step.secondsPerRun || before.secondsPerRun,
        runsPerPeriod: step.runsPerPeriod || before.runsPerPeriod,
        frequencyPeriod: step.runsPerPeriod ? step.frequencyPeriod : before.frequencyPeriod,
        roleId,
        toolId,
      })
      stepsRevised++
      continue
    }

    await addStep(cfg, guard, scope, actor, {
      processId: row.process_id,
      name: step.name,
      description: step.description ?? undefined,
      secondsPerRun: step.secondsPerRun,
      runsPerPeriod: step.runsPerPeriod,
      frequencyPeriod: step.frequencyPeriod,
      roleId,
      toolId,
    })
    stepsAdded++
  }

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Draft applied",
    // "7 of 11" is the sentence a reader needs; "applied" is not. What was left
    // behind is as much a decision as what was taken.
    description: `${actor.name} applied a read call to ${process.name}: ${stepsAdded} step${
      stepsAdded === 1 ? "" : "s"
    } added, ${stepsRevised} changed, ${payload.steps.length - stepsAdded - stepsRevised - skipped} left out`,
    relatedTable: "process_drafts",
    relatedRowId: id,
  })
  return { applied: true, stepsAdded, stepsRevised, skipped }
}

/** THROW THE PROPOSAL AWAY. Writes nothing to the map, by construction — there is
 * no path from here to `process_steps` at all.
 *
 * R17: the current-status predicate rides the UPDATE, so discarding twice moves
 * zero rows the second time, writes no activity row and (at the door) pings
 * nobody. Returns whether anything actually moved. */
export async function discardDraft(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string
): Promise<boolean> {
  const fence = accountScopeClause(scope, "account_id")
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE process_drafts SET status = 'discarded'
     ${where([fence.sql, "id = ?", "status = 'proposed'"])} RETURNING id`,
    [...fence.params, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Draft discarded",
    description: `${actor.name} threw away a proposed process map`,
    relatedTable: "process_drafts",
    relatedRowId: id,
  })
  return true
}

/* ----------------------------- shared internals ---------------------------- */

/** One draft inside the fence, or a clean 404 — identical to a made-up id, so a
 * refusal is never an oracle for which drafts exist. */
async function draftOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<DraftRow> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<DraftRow>(
    cfg,
    guard.databaseId,
    `SELECT ${ROW_COLUMNS}, payload FROM process_drafts${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That draft doesn't exist.")
  return rows[0]
}

/** THE PROCESS A DRAFT IS ABOUT, inside the fence.
 *
 * A second, smaller reader beside lib/processes.ts's own `processOrThrow` rather
 * than an export of it, and that is a deliberate trade: this needs three columns
 * and that one computes two subquery counts on every call. Both carry the same
 * clause, which is the property that matters — and the account-leak suite walks
 * this door with a burglar exactly as it walks that one. */
async function processForDraftOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<{ id: string; appId: string; accountId: string | null; name: string }> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ id: string; app_id: string; account_id: string | null; name: string }>(
    cfg,
    guard.databaseId,
    `SELECT id, app_id, account_id, name FROM processes${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That process doesn't exist.")
  return { id: rows[0].id, appId: rows[0].app_id, accountId: rows[0].account_id, name: rows[0].name }
}

/** The map's name for a detail read, under the same fence. Null rather than a
 * throw: a draft whose process was archived is still a draft somebody may read. */
async function processNameOf(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<string | null> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ name: string }>(
    cfg,
    guard.databaseId,
    `SELECT name FROM processes${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  return rows[0]?.name ?? null
}
