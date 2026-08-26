// EXTRACTION — the doors. Read a call, propose a process map, review it, apply
// what survived.
//
// Every handler here does the same four things, in the same order, exactly as
// the process-map doors beside it:
//   gate on the caller's ROLE (R10) → decide about CLIENT LOGINS (R21) →
//   validate at the boundary, positionally (R20) → publish (R1).
//
// ── THE R21 DECISION, AND IT IS THE SAME ON EVERY DOOR HERE ──────────────────
//
// Every one of them refuses a portal caller. There is no read here a client may
// make, and that is a stronger statement than the process-map doors make about
// themselves, so it is worth the sentence:
//
//   • EXTRACTING is the agency's own work. A client does not have their own
//     conversation read and turned into a map by pressing a button; that is what
//     they are paying us to do, and the review in the middle of it is the whole
//     value of the service.
//   • A DRAFT HOLDS THE RAW CALL. `source_text` is a transcript — half of it is
//     us talking about them, and none of it has been reviewed by anybody.
//     Serving that back to the client is the disclosure this app is most
//     exposed to, and it would not even be a permissions bug: a client login is
//     an ordinary team member holding an ordinary role, and the agency gateway
//     forwards by PREFIX. "A client would never call it" is precisely the
//     assumption two leaks in this codebase were built on.
//
// So `refusePortalCaller` opens the fence on all five, including the two GETs.
//
// ── WHAT A DOOR HERE MAY NOT DO ──────────────────────────────────────────────
//
// Write a step. Not one of these handlers touches `process_steps`: applying goes
// through `applyDraft`, which goes through `addStep` / `updateStep`. The draft is
// not the record, and a door that could shortcut that is a door that eventually
// does.

import { json } from "@shared/workers/http"
import { optionalDocument, optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { gated, gatedBody } from "@shared/workers/route"
import { refusePortalCaller, type AccountScope } from "@shared/workers/account-scope"
import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import { GuardError, requireRight, type MemberGuard } from "@shared/workers/gating"
import { consumeAiUnit } from "@shared/workers/credits"
import { listRoles, listTools } from "../lib/client-org"
import {
  applyDraft,
  createDraft,
  discardDraft,
  draftContext,
  getDraft,
  listDrafts,
} from "../lib/process-drafts"
import { extractDraft } from "../lib/process-extract"
import { DRAFT_STATUSES } from "@shared/process-drafts"
import type { Env } from "../env"

/** A route body is untrusted JSON until each field is validated below — the alias
 * keeps the gate call free of nested angle brackets, which the gating-seam scan
 * (rightly) refuses to parse: a gate it cannot SEE is a gate that does not count. */
type Body = Record<string, unknown>

/** EVERY ELEMENT of an ALREADY-CHECKED array through the text validator, so a
 * number or an object inside the list is a clean 400 rather than something that
 * reaches a `Set`. Takes `unknown[]` — the caller has already proved it is an
 * array with `Array.isArray`, at the read, where R20 can see it. */
function keys(list: unknown[], field: string): string[] {
  // A REVIEW OF SIXTY STEPS IS SIXTY KEYS. The cap is the payload's own ceiling
  // (MAX_DRAFT_STEPS in lib/process-extract.ts) with room to spare; past it the
  // body is not a review, it is somebody probing the door.
  if (list.length > 500)
    throw new GuardError(400, "invalid_input", `${field} names more rows than a draft can hold.`)
  return list.map((v) => requireText(v, field, TEXT_LIMITS.short))
}

/** ONE STATUS, or nothing. Off the query string and checked against the three the
 * column's own CHECK allows — an unknown word is a clean 400 rather than a filter
 * that silently matches nothing, which is a list somebody trusts for the wrong
 * reason. */
function statusFilter(request: Request): string | null {
  const said = queryText(new URL(request.url).searchParams.get("status"), "Status")
  if (!said) return null
  if (!(DRAFT_STATUSES as readonly string[]).includes(said))
    throw new GuardError(400, "invalid_input", "That isn't a status a draft can be in.")
  return said
}

/** The agency-only fence every door here opens with. A `function` declaration on
 * purpose: the portal-fence walk follows route-local helpers by reading function
 * declarations off disk, and a helper it cannot see through is a fence it cannot
 * prove. */
async function agencyOnly(cfg: D1Rest, guard: MemberGuard): Promise<AccountScope> {
  return refusePortalCaller(cfg, guard)
}

/* ---------------------------------- reads ---------------------------------- */

/** GET /api/tenancy/processes/drafts[?processId=][&appId=][&status=] — the calls
 * we have had read, and what each one proposed.
 *
 * R16: `total` is the exact server count over the SAME WHERE as the rows. */
export async function getProcessDrafts(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await agencyOnly(cfg, guard)
  const params = new URL(request.url).searchParams
  const processId = queryText(params.get("processId"), "Process")
  const appId = queryText(params.get("appId"), "App")
  const { rows, total } = await listDrafts(cfg, guard, scope, {
    processId,
    appId,
    status: statusFilter(request),
  })
  return json({ drafts: rows, total })
}

/** GET /api/tenancy/processes/drafts/detail?id= — one proposal, in full, with the
 * sentence its durations must be quoted with (R25) riding along. */
export async function getProcessDraftDetail(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await agencyOnly(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Draft")
  if (!id) throw new GuardError(400, "invalid_input", "Which draft?")
  return json(await getDraft(cfg, guard, scope, id))
}

/* --------------------------------- writes ---------------------------------- */

/** POST /api/tenancy/processes/drafts — READ A CALL AND PROPOSE A MAP.
 *
 * The words come from one of two places, and the body says which: a MEETING we
 * already hold, or TEXT somebody pasted when there is not one. Both are stored on
 * the draft, so "where did this come from?" is answerable a year later.
 *
 * ── TWO GATES, AND THE SECOND ONE IS THE APP'S EXISTING RULE ────────────────
 *
 * `processes:create`, because a draft is a proposal about a process map. AND
 * `agent:create`, because reading a call SPENDS THE TEAM'S AI ALLOWANCE — the
 * same free-daily-then-purchased-credits balance a chat turn spends, and money
 * the owner bought. MCP.md tells a developer that a role with module rights and
 * no agent access is the safe, zero-AI-cost choice; every other metered door in
 * the app already gates that way (`postBatchPlan` says why at length), and a
 * door that did not would make that sentence false. Worse, such a role cannot
 * read the allowance either (`agent:read`), so it could not see what it spent.
 *
 * The unit is spent HERE rather than inside the extraction, so the gate is
 * visibly before the spend in this function's own source — the same reason R20
 * insists a field is checked where it is read. `extractDraft` is handed the
 * spend and refunds it if the model call itself fails.
 *
 * NOTHING IS WRITTEN TO THE MAP HERE. That is the point of the whole feature. */
export async function postCreateProcessDraft(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await agencyOnly(cfg, guard)
  await requireRight(cfg, guard, "agent", "create")
  const processId = requireText(body.processId, "Process", TEXT_LIMITS.short)
  // A MEETING WE HOLD, OR WORDS SOMEBODY PASTED — "a meeting if there is one,
  // pasted text if there is not". The transcript goes through the seam's
  // WHOLE-DOCUMENT half, because a call is a document and a prose cap measured in
  // characters is the wrong refusal for one (see optionalDocument's own note).
  const meetingId = optionalText(body.meetingId, "Meeting", TEXT_LIMITS.short)
  const sourceText = optionalDocument(body.sourceText, "Call notes")
  const words = sourceText ?? (meetingId ? await meetingWords(cfg, guard, meetingId) : "")
  if (!words)
    throw new GuardError(
      400,
      "nothing_to_read",
      "There are no words to read. Pick a meeting with a transcript, or paste what was said."
    )

  // THE ALLOWANCE, claimed atomically so two people pressing at once cannot both
  // spend the last unit — and claimed AFTER the two gates above, never before.
  const spend = await consumeAiUnit(env, guard.teamId)
  if (!spend.ok)
    throw new GuardError(
      429,
      "over_quota",
      "You're out of assistant credits for now, and reading a call uses the assistant. The free ones come back tomorrow, or an admin can add more."
    )

  const context = await draftContext(cfg, guard, scope, processId)
  const payload = await extractDraft(env, guard, actor, {
    words,
    from: meetingId ? "meeting" : "pasted",
    processName: context.processName,
    // The client's OWN vocabulary, read under the caller's own fence — so the
    // model is matching against words this caller was already allowed to see.
    roles: (await listRoles(cfg, guard, scope, context.accountId))
      .filter((r) => r.active)
      .map((r) => ({ id: r.id, name: r.name })),
    tools: (await listTools(cfg, guard, scope, { accountId: context.accountId }))
      .filter((t) => t.active)
      .map((t) => ({ id: t.id, name: t.name })),
    existingSteps: context.existingSteps,
  }, spend)

  const id = await createDraft(cfg, guard, scope, actor, {
    processId,
    payload,
    sourceMeetingId: meetingId ?? null,
    sourceText: sourceText ?? null,
  })
  await publishChange(env, guard.teamId, "process_drafts", id, "add")
  // …and what is left of the allowance, so the screen that just spent one can say
  // so without a second round trip — the same shape `postBatchPlan` answers with.
  return json({ id, payload, quota: spend.quota })
}

/** POST /api/tenancy/processes/drafts/apply — WRITE ONLY WHAT SURVIVED.
 *
 * The body names the KEPT keys, one list per kind, because the two decisions a
 * reviewer makes are the same decision at two altitudes: rejecting the tools is
 * dropping every tool. A kind nobody mentioned is a kind nobody accepted —
 * absent is empty, never "all of them".
 *
 * TWO GATES, and the second one is not decoration. Applying ADDS steps, which is
 * `create`; a draft carrying REVISIONS also EDITS steps a person already agreed,
 * which is `edit`. A role holding one and not the other must not get the other
 * through this door — the two step doors beside this one are gated exactly that
 * way, and a batch is not a loophole. The second gate is only asked for when the
 * draft actually revises something, so a role that may only add steps can still
 * apply an ordinary first-call draft. */
export async function postApplyProcessDraft(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await agencyOnly(cfg, guard)
  const id = requireText(body.id, "Draft", TEXT_LIMITS.short)
  // R20 is POSITIONAL: each list is type-checked AT THE READ, and the helper is
  // handed a value whose type is already known. A helper of ours is invisible to
  // that census, rightly — it can be rewritten without a call site changing.
  const keepSteps = Array.isArray(body.keepSteps) ? keys(body.keepSteps, "Step") : []
  const keepRoles = Array.isArray(body.keepRoles) ? keys(body.keepRoles, "Role") : []
  const keepTools = Array.isArray(body.keepTools) ? keys(body.keepTools, "Tool") : []

  const detail = await getDraft(cfg, guard, scope, id)
  const revises = detail.payload.steps.some((s) => s.revisesStepId && keepSteps.includes(s.key))
  if (revises) await requireRight(cfg, guard, "processes", "edit")

  const result = await applyDraft(cfg, guard, scope, actor, id, { keepSteps, keepRoles, keepTools })
  // R17: a second press moved zero rows and wrote nothing, so it pings nobody.
  if (result.applied) {
    await publishChange(env, guard.teamId, "process_drafts", id)
    // …and the MAP, whose steps and whose saving have just changed under
    // somebody else's open screen.
    if (detail.draft.processId)
      await publishChange(env, guard.teamId, "processes", detail.draft.processId, undefined, detail.draft.accountId ?? undefined)
  }
  return json(result)
}

/** POST /api/tenancy/processes/drafts/discard — throw the proposal away.
 *
 * `delete` for `processes`, the right this app's deactivate-only model uses for
 * "take it away". Nothing is deleted here either: the row keeps its words and its
 * status becomes `discarded`, so a call that was read and rejected is still a
 * fact about what we did.
 *
 * R17: the predicate rides the UPDATE — a second press moves zero rows, writes no
 * activity and pings nobody. */
export async function postDiscardProcessDraft(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "delete")
  const scope = await agencyOnly(cfg, guard)
  const id = requireText(body.id, "Draft", TEXT_LIMITS.short)
  const changed = await discardDraft(cfg, guard, scope, actor, id)
  if (changed) await publishChange(env, guard.teamId, "process_drafts", id)
  return json({ ok: true, changed })
}

/* ------------------------------- the meeting ------------------------------- */

/** THE WORDS OF A MEETING WE ALREADY HOLD — "a meeting if there is one, pasted
 * text if there is not", and this is the first half of that sentence.
 *
 * `meetings.transcript_text` is the transcript the sweep captured, cut to what
 * one row may hold (migration 0038); `notes` is what somebody typed when there
 * is no recording. Either is words about how the client works, and the second is
 * often the better material — a person writing notes has already done half the
 * extraction.
 *
 * ONE ROW, ONE COLUMN, in the database this worker is already talking to. It is
 * fenced by the meeting id alone because a meeting carries no account of its own
 * that a client could stand outside of — and the caller has already been refused
 * if they are a client login, on every door in this file. The draft these words
 * land on is fenced by its PROCESS, which is fenced by its account.
 *
 * An empty answer is ordinary: a call whose recording has not been transcribed
 * yet has nothing to read, and the door above says so in words rather than
 * proposing a map out of silence. */
async function meetingWords(cfg: D1Rest, guard: MemberGuard, meetingId: string): Promise<string> {
  // A TRANSCRIPT IS THE `meetings` MODULE'S TO GIVE, and this door gates on
  // `processes` and `agent`. R18's sentence — a cross-module read carries the
  // caller's rights — applied to a read path rather than to the activity feed.
  //
  // Without it, a staff role with `processes:create` and `agent:create` but
  // `meetings` deliberately unticked could name any meeting id and get a
  // proposal built out of what was said in that room, in the speakers' own
  // vocabulary, returned inline. The words never come back verbatim, which is
  // why this is a gate rather than a leak — but "what was said in the room is a
  // different question to ask a role about" is why `meetings` is a module at
  // all, and the content worker's own transcript door gates on exactly this.
  await requireRight(cfg, guard, "meetings", "read")
  const rows = await d1Query<{ transcript_text: string | null; notes: string | null }>(
    cfg,
    guard.databaseId,
    "SELECT transcript_text, notes FROM meetings WHERE id = ? LIMIT 1",
    [meetingId]
  )
  const row = rows[0]
  if (!row) return ""
  // Both, when there are both: the transcript is what was said and the notes are
  // what somebody thought was worth writing down. Dropping either would throw
  // away the half that happens to be better on any given call.
  return [row.transcript_text ?? "", row.notes ?? ""].filter((s) => s.trim()).join("\n\n")
}
