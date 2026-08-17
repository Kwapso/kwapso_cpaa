// PROCESS-MAP ROUTES — apps, processes, versions, steps, the conversation on a
// map, and the savings drilled App → Process → Step.
//
// Every handler here does the same four things, in the same order:
//   gate on the caller's ROLE (R10) → decide about CLIENT LOGINS (R21) →
//   validate at the boundary (R20) → publish (R1).
//
// THE R21 DECISION IS THE ONE WORTH READING TWICE, because a client login is an
// ordinary team member holding an ordinary role, and the agency gateway forwards
// by prefix. So each door here is in exactly one of two states, deliberately:
//
//   • AUTHORING a map — creating an app, mapping a process, editing a step,
//     cutting a version. This is the agency's own work about a client, not the
//     client's work, so it REFUSES a portal caller outright
//     (`refusePortalCaller`). A client does not author their own process map;
//     they read it and they talk about it.
//   • READING a map, or COMMENTING on one — the client's own world. These
//     resolve the account fence (`accountScope`) and the lib ANDs it into every
//     statement, so a contact reads their company's maps and nobody else's.
//
// There is no third state. "A client would never call it" is not a reason — it
// is the assumption two leaks in this codebase were built on.

import { fail, json, pagedJson } from "@shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { gated, gatedBody } from "@shared/workers/route"
import { accountScope, refusePortalCaller } from "@shared/workers/account-scope"
import { pricesVisibleFor } from "../lib/accounts"
import { listAccountRates } from "../lib/rates"
import { workEngineFacts } from "../lib/work-engine"
import { GuardError } from "@shared/workers/gating"
import {
  addProcessComment,
  addStep,
  countProcessComments,
  createApp,
  createProcess,
  cutVersion,
  getProcess,
  listApps,
  listProcessComments,
  listProcesses,
  listSavings,
  removeStep,
  setAppActive,
  setProcessActive,
  updateApp,
  updateProcess,
  updateStep,
} from "../lib/processes"
import type { Env } from "../env"

/** A route body is untrusted JSON until each field is validated below — the alias
 * keeps the gate call free of nested angle brackets, which the gating-seam scan
 * (rightly) refuses to parse: a gate it cannot SEE is a gate that does not count. */
type Body = Record<string, unknown>

/** A WHOLE, NON-NEGATIVE NUMBER — the boundary check for the two fields the
 * whole savings calculation is built from.
 *
 * The COERCION happens at each call site, as `Number(body.x)`, and that is
 * deliberate rather than tidier-here: R20 is positional, and `Number()` is one
 * of the positions it accepts, so the scan can see every duration and every
 * frequency crossing the boundary. A helper that took `unknown` would satisfy
 * the reader and hide the field from the law.
 *
 * The refusals matter as much as the parse. A duration of `"20 minutes"` is NaN,
 * `-600` would make a saving out of thin air, and `1e21` would overflow every
 * total above it into a figure nobody could defend. Each is a clean 400 (R20),
 * never a row that quietly poisons the arithmetic. */
function wholeNumber(value: number, field: string, max: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new GuardError(400, "invalid_input", `${field} must be a whole number of zero or more.`)
  if (value > max)
    throw new GuardError(400, "invalid_input", `${field} is higher than this can be — check the number.`)
  return Math.floor(value)
}

/** Seconds in a working month, near enough — the ceiling on any one step's
 * duration or frequency. A step that takes longer than a month, every time, is a
 * typo, and a typo that lands is a savings figure nobody can explain. */
const MAX_STEP_SECONDS = 31 * 24 * 3600
const MAX_RUNS_PER_MONTH = 100_000
/** €10m a month on one app's hosting is a typo, not a tool cost. */
const MAX_TOOL_COST_CENTS = 1_000_000_000

// ── apps ─────────────────────────────────────────────────────────────────────

/** GET /api/tenancy/apps[?accountId=] — the systems we have built.
 *
 * R21: fenced, not refused. An app IS the client's own system, and the portal's
 * value screen names it — so this resolves the caller's account set and the lib
 * ANDs it into the statement. */
export async function getApps(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await accountScope(cfg, guard)
  const accountId = queryText(new URL(request.url).searchParams.get("accountId"), "Account")
  const { rows, total } = await listApps(cfg, guard, scope, { accountId })
  return json({ apps: rows, total })
}

/** POST /api/tenancy/apps — record a system we have built. AGENCY ONLY: a client
 * does not author the inventory of what we built for them. */
export async function postCreateApp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await refusePortalCaller(cfg, guard)
  const id = await createApp(cfg, guard, scope, actor, {
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    accountId: optionalText(body.accountId, "Account", TEXT_LIMITS.short),
    url: optionalText(body.url, "Address", TEXT_LIMITS.link),
    stage: optionalText(body.stage, "Stage", TEXT_LIMITS.short),
    toolCostCentsPerMonth:
      body.toolCostCentsPerMonth === undefined
        ? undefined
        : wholeNumber(Number(body.toolCostCentsPerMonth), "Monthly tool cost", MAX_TOOL_COST_CENTS),
  })
  await publishChange(env, guard.teamId, "apps", id, "add")
  return json({ id })
}

export async function postUpdateApp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "edit")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "App", TEXT_LIMITS.short)
  await updateApp(cfg, guard, scope, actor, id, {
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    // Absent means "say nothing"; sent-and-empty means "clear it" — the patch
    // rule the accounts door learned the hard way (an edit that erased what it
    // was not asked about).
    url: "url" in body ? (optionalText(body.url, "Address", TEXT_LIMITS.link) ?? null) : undefined,
    stage: "stage" in body ? (optionalText(body.stage, "Stage", TEXT_LIMITS.short) ?? null) : undefined,
    toolCostCentsPerMonth:
      body.toolCostCentsPerMonth === undefined
        ? undefined
        : wholeNumber(Number(body.toolCostCentsPerMonth), "Monthly tool cost", MAX_TOOL_COST_CENTS),
  })
  await publishChange(env, guard.teamId, "apps", id)
  return json({ ok: true })
}

/** POST /api/tenancy/apps/active — archive / restore (never delete). */
export async function postAppActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "delete")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "App", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Archive or restore?")
  // R17: a repeat moves zero rows → no ping, no duplicate history.
  const changed = await setAppActive(cfg, guard, scope, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "apps", id)
  return json({ ok: true })
}

// ── processes ────────────────────────────────────────────────────────────────

/** The two filters a processes read accepts, parsed ONCE, so the list door and
 * any machine caller narrow by the same words. */
function processQuery(url: URL): { q?: string; appId?: string } {
  return {
    q: queryText(url.searchParams.get("q"), "Search"),
    appId: queryText(url.searchParams.get("appId"), "App"),
  }
}

/** GET /api/tenancy/processes — the maps, PAGED (R14: this list grows with
 * ordinary use, so it answers with a cursor rather than a ceiling). Fenced. */
export async function getProcesses(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await accountScope(cfg, guard)
  const url = new URL(request.url)
  const page = await listProcesses(cfg, guard, scope, {
    ...processQuery(url),
    // Capped like every other query parameter — an opaque cursor is ~70 chars, so
    // a megabyte of it is a bad request, not an atob + JSON.parse of a megabyte.
    cursor: queryText(url.searchParams.get("cursor"), "Cursor") ?? null,
  })
  return pagedJson("processes", page)
}

/** GET /api/tenancy/processes/detail?id=[&versionId=] — one map: its versions,
 * the steps of ONE of them, the exact totals its tabs are badged with, and the
 * subtraction between its baseline and today. Fenced.
 *
 * `versionId` is how an OLDER version is read. Absent means the latest, which is
 * what this door has always answered — so every existing caller keeps the reply
 * it had. A version belonging to another map is a 404, not an empty step list.
 */
export async function getProcessDetail(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await accountScope(cfg, guard)
  const url = new URL(request.url)
  const id = queryText(url.searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "Which process?")
  return json(
    await getProcess(cfg, guard, scope, id, {
      versionId: queryText(url.searchParams.get("versionId"), "Version"),
    })
  )
}

/** POST /api/tenancy/processes — map a way of working, and its baseline with it.
 * AGENCY ONLY. */
export async function postCreateProcess(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await refusePortalCaller(cfg, guard)
  const id = await createProcess(cfg, guard, scope, actor, {
    appId: requireText(body.appId, "App", TEXT_LIMITS.short),
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    description: optionalText(body.description, "Description", TEXT_LIMITS.long),
    baselineLabel: optionalText(body.baselineLabel, "Baseline name", TEXT_LIMITS.short),
  })
  await publishChange(env, guard.teamId, "processes", id, "add")
  return json({ id })
}

export async function postUpdateProcess(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "edit")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Process", TEXT_LIMITS.short)
  await updateProcess(cfg, guard, scope, actor, id, {
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    description:
      "description" in body
        ? (optionalText(body.description, "Description", TEXT_LIMITS.long) ?? null)
        : undefined,
  })
  await publishChange(env, guard.teamId, "processes", id)
  return json({ ok: true })
}

export async function postProcessActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "delete")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Process", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Archive or restore?")
  const changed = await setProcessActive(cfg, guard, scope, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "processes", id)
  return json({ ok: true })
}

// ── steps ────────────────────────────────────────────────────────────────────

/** POST /api/tenancy/processes/steps — add a step to the current version.
 * AGENCY ONLY: the durations are what every savings figure is computed from. */
export async function postAddStep(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await refusePortalCaller(cfg, guard)
  const processId = requireText(body.processId, "Process", TEXT_LIMITS.short)
  await addStep(cfg, guard, scope, actor, {
    processId,
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    description: optionalText(body.description, "Description", TEXT_LIMITS.long),
    secondsPerRun: wholeNumber(Number(body.secondsPerRun), "Time per run", MAX_STEP_SECONDS),
    runsPerMonth: wholeNumber(Number(body.runsPerMonth), "Times a month", MAX_RUNS_PER_MONTH),
    position: body.position === undefined ? undefined : wholeNumber(Number(body.position), "Order", 10_000),
  })
  // The PROCESS is what a listener can act on: a step is only ever read on its
  // map, and the map's savings change the moment a duration does.
  await publishChange(env, guard.teamId, "processes", processId)
  return json({ ok: true })
}

export async function postUpdateStep(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "edit")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Step", TEXT_LIMITS.short)
  const processId = await updateStep(cfg, guard, scope, actor, id, {
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    description:
      "description" in body
        ? (optionalText(body.description, "Description", TEXT_LIMITS.long) ?? null)
        : undefined,
    secondsPerRun: wholeNumber(Number(body.secondsPerRun), "Time per run", MAX_STEP_SECONDS),
    runsPerMonth: wholeNumber(Number(body.runsPerMonth), "Times a month", MAX_RUNS_PER_MONTH),
    position: body.position === undefined ? undefined : wholeNumber(Number(body.position), "Order", 10_000),
  })
  await publishChange(env, guard.teamId, "processes", processId)
  return json({ ok: true })
}

/** POST /api/tenancy/processes/steps/remove — the work stopped happening. Not a
 * delete: the step keeps its frequency and drops to zero seconds, which is what
 * makes the saving for work we took away come out right. */
export async function postRemoveStep(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "delete")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Step", TEXT_LIMITS.short)
  // R17: null = zero rows moved = already removed → no ping, no duplicate history.
  const processId = await removeStep(cfg, guard, scope, actor, id)
  if (processId) await publishChange(env, guard.teamId, "processes", processId)
  return json({ ok: true })
}

// ── the version cut ──────────────────────────────────────────────────────────

/** POST /api/tenancy/processes/versions — cut a new version.
 *
 * ONE DOOR, TWO CALLERS (the owner confirmed both): a person pressing the button
 * sends no `sprintId`; the work engine, when a sprint completes, sends the
 * sprint's id. That id is what makes the automatic cut idempotent — the partial
 * unique index refuses a second version for the same sprint, so a completion
 * that fires twice cuts once (R17), and the door answers 200 with
 * `alreadyCut: true` rather than an error, because nothing is wrong: the version
 * it asked for exists. */
export async function postCutVersion(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await refusePortalCaller(cfg, guard)
  const processId = requireText(body.processId, "Process", TEXT_LIMITS.short)
  const cut = await cutVersion(cfg, guard, scope, actor, {
    processId,
    label: optionalText(body.label, "Name", TEXT_LIMITS.short),
    sprintId: optionalText(body.sprintId, "Sprint", TEXT_LIMITS.short),
  })
  if (!cut) return json({ alreadyCut: true })
  await publishChange(env, guard.teamId, "processes", processId)
  return json({ versionId: cut.versionId, versionNo: cut.versionNo })
}

// ── the conversation ─────────────────────────────────────────────────────────

/** GET /api/tenancy/processes/comments?processId= — the conversation on a map.
 * A PORTAL door: fenced, and a staff author's name is withheld from a client. */
export async function getProcessComments(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await accountScope(cfg, guard)
  const processId = queryText(new URL(request.url).searchParams.get("processId"), "Process")
  if (!processId) return fail(400, "invalid_input", "Which process?")
  const [comments, total] = await Promise.all([
    listProcessComments(cfg, guard, scope, processId),
    countProcessComments(cfg, guard, scope, processId),
  ])
  return json({ comments, total })
}

/** POST /api/tenancy/processes/comments — say something on a map.
 *
 * A PORTAL door, and the one write a client login can reach in this whole build.
 * Fenced: the map decides whose it is before a word is appended, and answers 404
 * rather than 403 so "not yours" never confirms the map exists.
 *
 * `explainsStepKey` — the staff explanation a regression must carry before the
 * portal will show it — is refused from a client login. Why a step got slower is
 * the agency's account of its own work, and a client marking their own comment as
 * the explanation would publish a regression we had not explained. */
export async function postProcessComment(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await accountScope(cfg, guard)
  const processId = requireText(body.processId, "Process", TEXT_LIMITS.short)
  const explainsStepKey = optionalText(body.explainsStepKey, "Step", TEXT_LIMITS.short)
  if (explainsStepKey && scope.kind === "portal")
    return fail(
      403,
      "staff_only",
      "Only the team can attach an explanation to a step."
    )
  const added = await addProcessComment(cfg, guard, scope, actor, {
    processId,
    body: requireText(body.body, "Comment", TEXT_LIMITS.long),
    explainsStepKey,
  })
  // SCOPE-STAMPED: the ping carries the ACCOUNT the map belongs to, because a
  // client login's socket is fenced by account and a process id tells that fence
  // nothing. Without the stamp their screen is live in the code and dead in the
  // browser (shared/workers/account-scope.ts, mayHearChange).
  await publishChange(
    env,
    guard.teamId,
    "process_comments",
    processId,
    "add",
    added.accountId ?? undefined
  )
  return json({ id: added.id })
}

// ── the savings drill-down ───────────────────────────────────────────────────

/** GET /api/tenancy/value[?accountId=&appId=] — the savings, drilled App →
 * Process → Step, with the caption that makes the number honest. And, for the
 * accounts the owner has switched on, what they bought.
 *
 * A PORTAL door, and the owner's ruling shapes both halves:
 *
 *   • VALUE FOR EVERYONE. There is no flag on the savings — a client sees what
 *     their work gave back whether or not they may see what they paid.
 *   • PRICES ONLY WHERE HE SWITCHES THEM ON. `commercials_visible` on the
 *     account decides, and it decides HERE: when it is off, the `prices` key is
 *     ABSENT from the response, not present-and-empty and not present-and-hidden.
 *     A screen cannot render a field it never received, which is the same reason
 *     the margin lives in a file the portal cannot import (R24).
 *
 * What "prices" means is deliberately narrow: the rate card they agreed, and the
 * total of what has been sold to them. It is never a margin, never an internal
 * rate, and never what an app costs us to run — those are three different
 * questions with the same answer, which is no.
 *
 * `accountId` narrows for staff; for a client login the fence has already
 * decided, and naming somebody else's account is a 404. */
export async function getValue(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await accountScope(cfg, guard)
  const url = new URL(request.url)
  const asked = queryText(url.searchParams.get("accountId"), "Account")
  const view = await listSavings(cfg, guard, scope, {
    accountId: asked,
    appId: queryText(url.searchParams.get("appId"), "App"),
  })

  // WHOSE prices these would be: the account named, or — for a client login —
  // the one company they are standing in. Never an id from the body, never a
  // guess: with no account in view there is no price question to answer.
  const accountId = asked ?? (scope.kind === "portal" ? scope.currentAccountId : null)
  if (!accountId) return json(view)
  if (!(await pricesVisibleFor(cfg, guard, scope, accountId))) return json(view)

  const [card, sold] = await Promise.all([
    listAccountRates(cfg, guard, scope, accountId),
    workEngineFacts(cfg, guard, accountId),
  ])
  return json({
    ...view,
    prices: {
      // The card as a client reads it: the live lines, the label and the rate.
      // No audit block, no retired rows, no id — this is a projection, not the
      // rate-card door (which refuses a client login outright).
      rates: card.rows
        .filter((r) => r.active)
        .map((r) => ({ label: r.label, centsPerHour: r.centsPerHour, currency: r.currency })),
      // What has been sold to them. `null` while the work engine's tables are not
      // in this database yet — an absent number rather than a confident zero.
      soldCents: sold.ready ? sold.soldCents : null,
    },
  })
}
