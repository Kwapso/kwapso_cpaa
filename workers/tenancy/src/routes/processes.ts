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
import { imageFieldLimit, optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { gated, gatedBody } from "@shared/workers/route"
import { accountScope, refusePortalCaller, type AccountScope } from "@shared/workers/account-scope"
import type { Actor } from "@shared/workers/activity"
import type { D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import { getAccountRow, pricesVisibleFor } from "../lib/accounts"
import { listAccountRates } from "../lib/rates"
import { workEngineFacts } from "../lib/work-engine"
import { GuardError } from "@shared/workers/gating"
import { mediaKey, storeImageDataUrl } from "@shared/workers/image"
import { resolveOrdering } from "@shared/workers/sorting"
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
  PROCESS_SORTS,
  removeStep,
  setAppActive,
  setAppStaff,
  setAppStakeholders,
  setProcessActive,
  updateApp,
  updateProcess,
  updateStep,
  createAppModule,
  listAppModules,
  setAppModuleActive,
  updateAppModule,
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
    throw new GuardError(400, "invalid_input", `${field} is higher than this can be. Check the number.`)
  return Math.floor(value)
}

/** Seconds in a working month, near enough — the ceiling on any one step's
 * duration or frequency. A step that takes longer than a month, every time, is a
 * typo, and a typo that lands is a savings figure nobody can explain. */
const MAX_STEP_SECONDS = 31 * 24 * 3600
const MAX_RUNS_PER_MONTH = 100_000
/** €10m a month on one app's hosting is a typo, not a tool cost. */
const MAX_TOOL_COST_CENTS = 1_000_000_000

/** How many people one app can carry on either side. R14 in its smallest form:
 * an app with fifty people named on it is a paste, not a project.
 *
 * The number is not arbitrary — it is what keeps the write BELOW D1's ceiling.
 * The staff and stakeholder writes bind one placeholder per named person plus
 * nine audit values, and D1 refuses a statement past `D1_MAX_BOUND_PARAMS`
 * (100). Fifty leaves headroom that a future audit column cannot eat.
 * workers/content/test/d1-parameter-cap.test.ts holds this pairing. */
const APP_PEOPLE_CAP = 50

/** AN APP'S LOGO IS BYTES IN R2 AND A PATH ON THE ROW, through the one store
 * seam every door that takes a picture shares (shared/workers/image.ts
 * storeImageDataUrl). The picker downsizes in the browser and hands back a data
 * URL; anything that is not one — an empty string meaning "clear it", or the
 * `/media/...` path the form was given — passes straight through.
 *
 * The refusals are stated here because the WORDING is this door's: the seam is
 * shared with the web build and may not reach for a GuardError. Same pair the
 * accounts door names, because it is the same cap and the same parse. */
const REFUSE_IMAGE = {
  badImage: () => new GuardError(400, "bad_image", "That image format isn't supported."),
  tooLarge: () => new GuardError(400, "image_too_large", "That image is too large."),
}

// ── apps ─────────────────────────────────────────────────────────────────────

/** GET /api/tenancy/apps[?accountId=][&q=] — the systems we have built.
 *
 * `q` searches an app's NAME. It is a server filter rather than a box the screen
 * narrows a loaded list with, for the reason R16 gives: `total` comes back over
 * the same WHERE, so the count beside the rows is the count OF the rows.
 *
 * R21: fenced, not refused. An app IS the client's own system, and the portal's
 * value screen names it — so this resolves the caller's account set and the lib
 * ANDs it into the statement. */
export async function getApps(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await accountScope(cfg, guard)
  const params = new URL(request.url).searchParams
  const accountId = queryText(params.get("accountId"), "Account")
  const q = queryText(params.get("q"), "Search")
  const { rows, total } = await listApps(cfg, guard, scope, { accountId, q })
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
    // The picked file is a data URL here and an object in R2 by the time the row
    // is written. The cap is `imageFieldLimit`'s, not the prose one: a downsized
    // 512px JPEG is ~60 KB of base64 and `TEXT_LIMITS.long` is 20,000
    // CHARACTERS, so the line that was here refused every real logo three lines
    // above the seam that would have stored it. The byte cap that actually
    // matters is still the store seam's (MAX_IMAGE_BYTES), measured off the
    // encoded text before anything decodes — it just has to be reachable.
    logoUrl: await storeImageDataUrl(
      env.MEDIA,
      mediaKey(guard.teamId, "apps"),
      optionalText(body.logoUrl, "Logo", imageFieldLimit(body.logoUrl)),
      REFUSE_IMAGE
    ),
    toolCostCentsPerMonth:
      body.toolCostCentsPerMonth === undefined
        ? undefined
        : wholeNumber(Number(body.toolCostCentsPerMonth), "Monthly tool cost", MAX_TOOL_COST_CENTS),
    // THE FOUR CONTEXT FIELDS — prose, so `TEXT_LIMITS.long`, and each one sits
    // in a validator's first argument like every other body field on this door
    // (R20 is positional: the scan has to SEE the check).
    about: optionalText(body.about, "About", TEXT_LIMITS.long),
    clientContext: optionalText(body.clientContext, "Client context", TEXT_LIMITS.long),
    solution: optionalText(body.solution, "Solution", TEXT_LIMITS.long),
    keyActors: optionalText(body.keyActors, "Key actors", TEXT_LIMITS.long),
  })
  await savePeople(cfg, guard, scope, actor, id, body)
  await publishChange(env, guard.teamId, "apps", id, "add")
  return json({ id })
}

/** WHO IS ON AN APP, on the SAME door that records the app (8.10 + 8.5).
 *
 * A second door would have been the obvious shape and it is the wrong one: the
 * form asks all of this in one dialog, so a second door means a second request
 * that can fail on its own and leave an app recorded with nobody on it. Riding
 * the create and the edit means one submit, one refusal, one line of history.
 *
 * Each list is only touched when the caller SENT it — a machine editing an app's
 * stage must not silently empty its staff (the same patch rule the prose fields
 * keep, said about a collection). */
async function savePeople(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  appId: string,
  body: Body
): Promise<void> {
  // R20 is positional and it asks about each FIELD, not each mention: the
  // `Array.isArray` here is the check, and the same field read inside it is the
  // value that check licensed.
  if (Array.isArray(body.staffUserIds))
    await setAppStaff(
      cfg,
      guard,
      actor,
      appId,
      idList(body.staffUserIds, "Staff"),
      optionalText(body.leadUserId, "Team lead", TEXT_LIMITS.short) ?? null
    )
  if (Array.isArray(body.stakeholderContactIds)) {
    const contactIds = idList(body.stakeholderContactIds, "Stakeholders")
    // EVERY STAKEHOLDER IS PROVED THROUGH THE SPINE'S OWN FENCED READER, one at
    // a time, before a single row is written. `getAccountRow` is the only door
    // in this worker onto `accounts`, and it refuses an id outside the caller's
    // account scope — so naming somebody off another client's books is a 404
    // rather than a stakeholder row pointing at a stranger.
    for (const id of contactIds) await getAccountRow(cfg, guard, scope, id)
    await setAppStakeholders(
      cfg,
      guard,
      scope,
      actor,
      appId,
      contactIds,
      optionalText(body.mainStakeholderContactId, "Main stakeholder", TEXT_LIMITS.short) ?? null
    )
  }
}

/** An untrusted array of ids into a clean, de-duped, bounded list. EMPTY IS
 * LEGAL here, unlike the batch endpoints' `requireIdList`: "nobody is on this
 * app yet" is a real answer and the form has to be able to send it. Each id
 * still goes through the text seam, so a number, an object or a megabyte is a
 * clean 400 rather than a row. */
function idList(value: unknown[], label: string): string[] {
  if (value.length > APP_PEOPLE_CAP)
    throw new GuardError(400, "invalid_input", `${label}: that is more people than an app can carry.`)
  return [...new Set(value.map((v) => requireText(v, label, TEXT_LIMITS.short)))]
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
    // Sent-and-empty clears the picture; absent leaves it exactly where it was.
    // A machine editing an app's stage must not silently take its logo away —
    // the same patch rule the prose fields keep, said about an image.
    logoUrl:
      "logoUrl" in body
        ? ((await storeImageDataUrl(
            env.MEDIA,
            mediaKey(guard.teamId, "apps"),
            optionalText(body.logoUrl, "Logo", imageFieldLimit(body.logoUrl)),
            REFUSE_IMAGE
          )) ?? null)
        : undefined,
    toolCostCentsPerMonth:
      body.toolCostCentsPerMonth === undefined
        ? undefined
        : wholeNumber(Number(body.toolCostCentsPerMonth), "Monthly tool cost", MAX_TOOL_COST_CENTS),
    about: "about" in body ? (optionalText(body.about, "About", TEXT_LIMITS.long) ?? null) : undefined,
    clientContext:
      "clientContext" in body
        ? (optionalText(body.clientContext, "Client context", TEXT_LIMITS.long) ?? null)
        : undefined,
    solution: "solution" in body ? (optionalText(body.solution, "Solution", TEXT_LIMITS.long) ?? null) : undefined,
    keyActors:
      "keyActors" in body ? (optionalText(body.keyActors, "Key actors", TEXT_LIMITS.long) ?? null) : undefined,
  })
  await savePeople(cfg, guard, scope, actor, id, body)
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

// ── modules ──────────────────────────────────────────────────────────────────

/** GET /api/tenancy/app-modules[?id=][?appId=][&archived=all] — the sections of
 * an app, or of every app when nothing narrows it.
 *
 * R21: FENCED, NOT REFUSED, and this one has to be. A client files a ticket from
 * the portal and the form asks which section it is about — so the portal opens
 * this door too, and the account fence is what keeps one client from reading
 * another's app structure. The narrowing to one app is a filter on top of that
 * fence, never a substitute for it: an `appId` belonging to somebody else
 * returns nothing rather than something.
 *
 * R14: bounded at APP_MODULE_CAP, said in the lib beside the statement. */
export async function getAppModules(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await accountScope(cfg, guard)
  const params = new URL(request.url).searchParams
  const modules = await listAppModules(cfg, guard, scope, {
    id: queryText(params.get("id"), "Module"),
    appId: queryText(params.get("appId"), "App"),
    archived: queryText(params.get("archived"), "Archived"),
  })
  return json({ modules, total: modules.length })
}

/** POST /api/tenancy/app-modules — add a section to an app. AGENCY ONLY: a
 * client files tickets AGAINST the sections, they do not author the structure of
 * the software we built, exactly as they do not author the app itself. */
export async function postCreateAppModule(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await refusePortalCaller(cfg, guard)
  const id = await createAppModule(cfg, guard, scope, actor, {
    appId: requireText(body.appId, "App", TEXT_LIMITS.short),
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    mark: optionalText(body.mark, "Emoji", TEXT_LIMITS.short),
    nameDe: optionalText(body.nameDe, "German name", TEXT_LIMITS.short),
    description: optionalText(body.description, "Description", TEXT_LIMITS.long),
    benefit: optionalText(body.benefit, "Benefit", TEXT_LIMITS.long),
  })
  await publishChange(env, guard.teamId, "app_modules", id, "add")
  return json({ id })
}

/** POST /api/tenancy/app-modules/update — rename or re-describe a section.
 * Every ticket holding it follows, because a ticket stores the id. */
export async function postUpdateAppModule(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "edit")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Module", TEXT_LIMITS.short)
  await updateAppModule(cfg, guard, scope, actor, id, {
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    mark: optionalText(body.mark, "Emoji", TEXT_LIMITS.short),
    nameDe: optionalText(body.nameDe, "German name", TEXT_LIMITS.short),
    description: optionalText(body.description, "Description", TEXT_LIMITS.long),
    benefit: optionalText(body.benefit, "Benefit", TEXT_LIMITS.long),
  })
  await publishChange(env, guard.teamId, "app_modules", id, "edit")
  return json({ ok: true })
}

/** POST /api/tenancy/app-modules/active — switch a section off, or back on.
 * R17: zero rows moved is silence — no activity row, and no ping. */
export async function postAppModuleActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "delete")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Module", TEXT_LIMITS.short)
  const active = body.active === true
  const moved = await setAppModuleActive(cfg, guard, scope, actor, id, active)
  if (moved) await publishChange(env, guard.teamId, "app_modules", id, "edit")
  return json({ ok: true, changed: moved })
}

// ── processes ────────────────────────────────────────────────────────────────

/** The three filters a processes read accepts, parsed ONCE, so the list door and
 * any machine caller narrow by the same words.
 *
 * `archived` is an allow-list of two words, checked HERE so nothing but our own
 * literal ever reaches a statement (R20); anything else means "don't narrow",
 * which is what this list has always answered. */
function processQuery(url: URL): { q?: string; appId?: string; archived?: string } {
  const archived = queryText(url.searchParams.get("archived"), "Archived")
  return {
    q: queryText(url.searchParams.get("q"), "Search"),
    appId: queryText(url.searchParams.get("appId"), "App"),
    archived: archived === "yes" || archived === "no" ? archived : undefined,
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
    // WHAT ORDER — asked of the door, because the list PAGES (R14). Sorting the
    // loaded page would order the newest fifty maps and say nothing about the
    // rest, under a badge counting all of them.
    ordering: resolveOrdering(
      PROCESS_SORTS,
      "created",
      queryText(url.searchParams.get("sort"), "Sort"),
      queryText(url.searchParams.get("dir"), "Direction")
    ),
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
    // WHO DOES THIS WORK (8.13), on the way IN. The edit door has taken it
    // since the role rate card shipped and this one did not, so the answer a
    // person typed into "Who does it" on the New process form was thrown away
    // and every map started unpriced.
    roleName: optionalText(body.roleName, "Who does it", TEXT_LIMITS.short),
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
    // WHO DOES THIS WORK (8.13) — the role whose hours the saving is measured
    // in. Absent means "say nothing", like every other field on this door.
    roleName:
      "roleName" in body ? (optionalText(body.roleName, "Who does it", TEXT_LIMITS.short) ?? null) : undefined,
  })
  await publishChange(env, guard.teamId, "processes", id)
  // The app's money figure is computed from this process's role, so it moves
  // when the role does — and it is keyed per app, which the process knows.
  await publishChange(env, guard.teamId, "apps", id)
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
 * ONE DOOR, ONE CALLER: a person pressing the button (owner, 24 Aug 2026). It
 * used to take a `sprintId` as well, for an automatic cut on sprint completion
 * that nothing was ever wired to perform — that decision is purged, not switched
 * off (migration 0051).
 *
 * R17 rides the unique index on (process_id, version_no): two quick presses both
 * read version N and both try to insert N+1, the loser is refused by the
 * database, and the door answers 200 with `alreadyCut: true` rather than an
 * error — because nothing is wrong, the version it asked for exists. */
export async function postCutVersion(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "processes", "create")
  const scope = await refusePortalCaller(cfg, guard)
  const processId = requireText(body.processId, "Process", TEXT_LIMITS.short)
  const cut = await cutVersion(cfg, guard, scope, actor, {
    processId,
    label: optionalText(body.label, "Name", TEXT_LIMITS.short),
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

/** GET /api/tenancy/impact[?accountId=&appId=] — the savings, drilled App →
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
export async function getImpact(request: Request, env: Env): Promise<Response> {
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
