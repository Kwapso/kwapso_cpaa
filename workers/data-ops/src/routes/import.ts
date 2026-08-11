// Import routes: read the catalogue of targets, download a sample file, and run the
// agentic multi-file batch (start → add files → plan → confirm). Gating: import has NO
// permission key of its own — every action is gated by the caller's `create` right on
// the TARGET module. The confirm writes act-as-user through the gated create endpoints,
// then publishes ONE coarse list-ping per affected table.
//
// There used to be a SECOND, single-target flow beside this one (start a session for one
// table → upload → adjust the mapping → preview → confirm). The batch engine replaced it
// everywhere: no screen called it, no agent tool and no MCP tool reached it, and the five
// doors sat there gated and audited and unreachable. Two ways to import was one more than
// the app has; the surviving one is the one that can read several files at once.

import { fail, json } from "@shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { GuardError, hasRight, requireRight, teamContext } from "@shared/workers/gating"
import { getActiveCatalog } from "../lib/import"
import {
  addBatchFile,
  confirmBatch,
  createBatch,
  getBatchView,
  listBatchSummaries,
  planBatch,
  planModules,
} from "../lib/import-batch"
import { consumeAiUnit } from "../lib/credits"
import { sampleRows, TARGETS, targetFor } from "../lib/targets"
import { csvResponse, toCsv } from "@shared/workers/csv"
import type { D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import type { Env } from "../env"

/** GET /api/data-ops/import/targets — the active, supported import targets. */
export async function getImportTargets(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env) // any signed-in STAFF member
  // Import is an agency tool — the portal gateway forwards no /api/data-ops path
  // and says why. But "any signed-in member" includes a client login at the
  // AGENCY origin, and this catalogue is the app's own inner shape: every table
  // the agency can bulk-load, column by column. Nothing here is any client's.
  await refusePortalCaller(cfg, guard)
  return json({ targets: await getActiveCatalog(env) })
}

/** GET /api/data-ops/import/sample?tableKey= — a downloadable sample CSV showing a
 * good file for that target (headers = column labels + one example row). Just a
 * template (no team data), so any signed-in member may fetch it. Every import place
 * offers this — AGENTIC-IMPORT §10 (show a good file before people prepare theirs). */
export async function getImportSample(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await refusePortalCaller(cfg, guard) // the catalogue's shape, by another route
  const key = queryText(new URL(request.url).searchParams.get("tableKey"), "Table") ?? ""
  // `TARGETS[key]` alone resolves INHERITED members: ?tableKey=constructor hands
  // back a function, sails past a truthiness check and crashes downstream as a
  // 500 with an error-log row per request. Own-property only.
  const target = targetFor(key)
  if (!target) return fail(400, "invalid_target", "That isn't an importable target.")
  const { header, row } = sampleRows(target)
  return csvResponse(`${target.tableKey}-sample.csv`, toCsv(header, [row]))
}

/* -------------------- agentic multi-file batch (AGENTIC-IMPORT.md) -------------------- */

/** The caller may use the import batch only if they can `create` into at least one
 * catalog target — otherwise a Viewer could burn credits planning an import they
 * could never run. Each write is still re-gated per target at confirm + per row.
 *
 * AND THEY MUST BE STAFF. A right-shaped gate is the wrong shape for this
 * question: it says "does your role allow it", and whether a CLIENT LOGIN can
 * drive the agency's bulk importer must not depend on how carefully somebody
 * built the Client role. One mis-ticked `create` and a client is running the
 * agentic import — and spending the team's AI allowance, which the portal was
 * built never to touch. The refusal leads, so the right never gets asked. */
async function requireAnyImportRight(cfg: D1Rest, guard: MemberGuard): Promise<void> {
  await refusePortalCaller(cfg, guard)
  for (const t of Object.values(TARGETS)) if (await hasRight(cfg, guard, t.module, "create")) return
  throw new GuardError(403, "forbidden", "You don't have permission to import into any table on this team.")
}

/** POST /api/data-ops/import/batch — start a batch (draft). */
export async function postBatchStart(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireAnyImportRight(cfg, guard)
  return json({ batch: await createBatch(cfg, guard, actor) })
}

/** POST /api/data-ops/import/batch/file — parse + attach one CSV to the batch. */
export async function postBatchFile(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireAnyImportRight(cfg, guard)
  const body = (await request.json().catch(() => ({}))) as { batchId?: unknown; name?: unknown; csv?: unknown }
  const batchId = requireText(body.batchId, "Batch", TEXT_LIMITS.short)
  const name = optionalText(body.name, "File name", TEXT_LIMITS.short) ?? "file"
  if (typeof body.csv !== "string")
    return fail(400, "invalid_input", "batchId and csv are required.")
  return json({ batch: await addBatchFile(cfg, guard, batchId, name, body.csv) })
}

/** POST /api/data-ops/import/batch/plan — the AGENT builds the plan. Metered on the
 * team AI credit pool (one turn), like a chat turn. */
export async function postBatchPlan(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireAnyImportRight(cfg, guard)
  // THE PLAN STEP IS AN ASSISTANT TURN, so it is gated like one. It spends the
  // team's free daily allowance and then decrements `agent_credits.balance` —
  // money the owner bought — and it used to do that behind the import rights
  // alone. MCP.md §1 tells a developer that "a role with those rights and no
  // agent access is the safe, zero-AI-cost choice"; without this line that
  // sentence was false, and a token issued on exactly that advice could loop this
  // door and drain the balance to zero. Worse, the same role cannot read
  // `get_ai_allowance` (agent:read), so it could not see what it was spending.
  await requireRight(cfg, guard, "agent", "create")
  const body = (await request.json().catch(() => ({}))) as { batchId?: unknown }
  const batchId = requireText(body.batchId, "Batch", TEXT_LIMITS.short)
  const c = await consumeAiUnit(env, guard.teamId)
  if (!c.ok)
    return fail(429, "over_quota", "You're out of AI requests for now — the plan step uses the assistant. They reset tomorrow, or an admin can add credits.")
  return json({ batch: await planBatch(env, cfg, guard, batchId), quota: c.quota })
}

/** POST /api/data-ops/import/batch/confirm — run the plan in dependency order. Gates
 * `create` on every target in the plan up front (fail fast), then publishes one
 * coarse ping per changed module. */
export async function postBatchConfirm(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  // The one batch door that does not open with requireAnyImportRight (it gates
  // per target instead) — so it says the other half of that guard itself.
  await refusePortalCaller(cfg, guard)
  const body = (await request.json().catch(() => ({}))) as { batchId?: unknown }
  const batchId = requireText(body.batchId, "Batch", TEXT_LIMITS.short)
  const view = await getBatchView(cfg, guard, batchId)
  if (!view.plan) return fail(409, "no_plan", "Plan the import before running it.")
  for (const m of planModules(view.plan)) await requireRight(cfg, guard, m, "create")
  const { report, modules } = await confirmBatch(env, request, cfg, guard, actor, batchId)
  for (const m of modules) await publishChange(env, guard.teamId, m)
  return json({ report })
}

/** GET /api/data-ops/import/batches — the team's import history (newest first).
 * Summaries only (who, when, files → tables, totals); row contents and rejection
 * reasons stay on the creator-scoped batch.
 *
 * GATED LIKE THE WRITE DOOR, and it used to gate on nothing at all. The comment
 * here read "any signed-in member may see it — the same altitude as the activity
 * feed's 'imported N rows' line", and that comparison was wrong twice over: the
 * activity feed SUBTRACTS the modules a caller may not read (R18), and these
 * summaries carry UPLOADED FILE NAMES, which the feed's line does not. So a
 * member with no import right anywhere — and a client login signing in on the
 * agency origin, which is an ordinary team member by construction — read the
 * agency's whole data-operations history.
 *
 * The history is TEAM-visible on purpose (unlike the working batch, which stays
 * creator-scoped in loadBatch): an import is a team act, and the person cleaning
 * up after one is rarely the person who ran it. "Team" means the people who can
 * import — the same right the door that CREATES this history asks for. */
export async function getBatches(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireAnyImportRight(cfg, guard)
  // …and never a client login. The history being TEAM-visible is exactly why the
  // refusal has to be said HERE: the working batch below is creator-scoped and
  // would have turned a client away on its own, but this door hands out the
  // agency's whole operating record — who bulk-loaded what, into which tables,
  // from which file, how many rows. A role alone does not tell the two apart.
  await refusePortalCaller(cfg, guard)
  return json({ batches: await listBatchSummaries(cfg, guard) })
}

/** GET /api/data-ops/import/batch?id= — the batch (files + plan + report). */
export async function getBatch(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await refusePortalCaller(cfg, guard) // creator-scoped already; not theirs to ask
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "A batch id is required.")
  return json({ batch: await getBatchView(cfg, guard, id) })
}
