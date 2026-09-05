// The BATCH engine (AGENTIC-IMPORT.md): a batch groups several uploaded files, the
// agent-built plan, and the per-row report. Create → add files → plan (agent) →
// confirm (ordered execution). Reuses the single-target primitives: parseCsv for
// files, writeRow for the gated act-as-user write (audit parity), the same
// creator-scoping as data_import_sessions. The batch table is JSON columns; the
// smarts are in import-plan (pure) + import-agent (model).

import { logActivity } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type Actor, type MemberGuard } from "@shared/workers/gating"
import type { Env } from "../env"
import type { ImportBatchReport, ImportBatchSummary, ImportBatchView, ImportPlan } from "@shared/types"
import { parseCsv } from "./csv"
import { norm, TARGETS, type TargetDef } from "./targets"
import { resolveRow, scanRows } from "./import-plan"
import { analyzeBatch, type AnalyzeFile } from "./import-agent"
import { writeRow } from "./import"
import { forwardToDoor } from "@shared/workers/http"
import { requestId } from "@shared/workers/trace"
import { BULK_CONCURRENCY } from "@shared/workers/limits"

const MAX_FILES = 8
const MAX_ROWS_PER_FILE = 1000
const MAX_CSV_BYTES = 5_000_000

/** One uploaded file inside a batch (parsed once, kept for the run). */
type BatchFile = { fileId: string; name: string; headers: string[]; rows: string[][]; rowCount: number }
type BatchRow = {
  id: string
  overall_status: string
  files_json: string | null
  plan_json: string | null
  report_json: string | null
  created_at: string
}

const COLS = "id, overall_status, files_json, plan_json, report_json, created_at"

async function loadBatch(cfg: D1Rest, guard: MemberGuard, id: string): Promise<BatchRow> {
  // Creator-scoped, like import sessions + agent threads.
  const rows = await d1Query<BatchRow>(
    cfg,
    guard.databaseId,
    `SELECT ${COLS} FROM data_import_batches WHERE id = ? AND creator_id = ?`,
    [id, guard.userId]
  )
  if (!rows[0]) throw new GuardError(404, "batch_not_found", "That import doesn't exist.")
  return rows[0]
}

function filesOf(b: BatchRow): BatchFile[] {
  return b.files_json ? (JSON.parse(b.files_json) as BatchFile[]) : []
}
function planOf(b: BatchRow): ImportPlan | null {
  return b.plan_json ? (JSON.parse(b.plan_json) as ImportPlan) : null
}

function toView(b: BatchRow): ImportBatchView {
  const files = filesOf(b).map((f) => ({ fileId: f.fileId, name: f.name, headers: f.headers, rowCount: f.rowCount }))
  return {
    id: b.id,
    status: b.overall_status,
    files,
    plan: planOf(b),
    report: b.report_json ? (JSON.parse(b.report_json) as ImportBatchReport) : null,
    createdAt: b.created_at,
  }
}

/* --------------------------------- create / add --------------------------------- */

export async function createBatch(cfg: D1Rest, guard: MemberGuard, actor: Actor): Promise<ImportBatchView> {
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO data_import_batches (id, overall_status, files_json, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(id)}, 'draft', '[]', ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  return toView(await loadBatch(cfg, guard, id))
}

/** Parse + attach one file to the batch (headers + all rows kept for the run). */
export async function addBatchFile(
  cfg: D1Rest,
  guard: MemberGuard,
  batchId: string,
  name: string,
  csvText: string
): Promise<ImportBatchView> {
  if (csvText.length > MAX_CSV_BYTES)
    throw new GuardError(413, "file_too_large", "That file is too large. Export a smaller CSV (up to about 5 MB).")
  const b = await loadBatch(cfg, guard, batchId)
  const files = filesOf(b)
  if (files.length >= MAX_FILES)
    throw new GuardError(400, "too_many_files", `An import is limited to ${MAX_FILES} files at a time.`)
  const parsed = parseCsv(csvText)
  if (!parsed.headers.length)
    throw new GuardError(400, "empty_file", `"${name}" has no readable columns. Export it as CSV and try again.`)
  if (parsed.rows.length > MAX_ROWS_PER_FILE)
    throw new GuardError(400, "too_many_rows", `Each file is limited to ${MAX_ROWS_PER_FILE} rows.`)
  files.push({ fileId: ulid(), name: name || "file", headers: parsed.headers, rows: parsed.rows, rowCount: parsed.rows.length })
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE data_import_batches SET files_json = ${sqlString(JSON.stringify(files))}, plan_json = NULL, overall_status = 'draft', updated_at = ${sqlString(now)} WHERE id = ${sqlString(batchId)};`
  )
  return toView(await loadBatch(cfg, guard, batchId))
}

/* ----------------------------------- plan ----------------------------------- */

/** Ask the agent to plan the batch (or the deterministic fallback), store + return
 * it. The caller has metered a credit. */
export async function planBatch(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  batchId: string
): Promise<ImportBatchView> {
  const b = await loadBatch(cfg, guard, batchId)
  const files = filesOf(b)
  if (!files.length) throw new GuardError(400, "no_files", "Add at least one file before planning.")
  const analyzeFiles: AnalyzeFile[] = files.map((f) => ({
    fileId: f.fileId,
    name: f.name,
    headers: f.headers,
    rowCount: f.rowCount,
    rows: f.rows, // full rows → planStep predicts per-row rejections (never sent to the model)
    sampleRows: f.rows.slice(0, 3),
  }))
  const plan = await analyzeBatch(env, analyzeFiles)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE data_import_batches SET plan_json = ${sqlString(JSON.stringify(plan))}, overall_status = 'planned', updated_at = ${sqlString(now)} WHERE id = ${sqlString(batchId)};`
  )
  return toView(await loadBatch(cfg, guard, batchId))
}

/** The distinct target modules in a plan — the routes gate `create` on each up
 * front so a missing right fails fast, not row-by-row. */
export function planModules(plan: ImportPlan): string[] {
  const mods = new Set<string>()
  for (const key of plan.order) if (TARGETS[key]) mods.add(TARGETS[key].module)
  return [...mods]
}

/* --------------------------------- confirm ---------------------------------- */

/** Read a parent target's rows back into naturalKey→newId, so a mode:"id" child can
 * resolve to them. Only called for a parent that IS referenced by id AND declares
 * `list` (base targets don't — the base's one dependency is value-mode). */
async function buildResolvedMap(
  env: Env,
  request: Request,
  def: TargetDef
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!def.list) return map
  const fetcher = def.endpoint.binding === "CONTENT" ? env.CONTENT : env.TENANCY
  // Same seam as writeRow (import.ts) — trace + deadline, for the same reasons.
  const res = await forwardToDoor(fetcher, {
    path: def.list.path,
    method: "GET",
    cookie: request.headers.get("Cookie") ?? "",
    traceId: requestId(request),
    timeoutMs: 30_000,
  })
  if (!res.ok) return map
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const rows = (data?.[def.list.key] as Record<string, unknown>[] | undefined) ?? []
  for (const r of rows) {
    const key = norm(String(r[def.list.nameField] ?? ""))
    const id = String(r[def.list.idField] ?? "")
    if (key && id) map.set(key, id)
  }
  return map
}

/** Execute the plan in dependency order (AGENTIC-IMPORT §2.4). Each row: normalize →
 * resolve references → write through the gated create endpoint (audit parity) or
 * reject with a reason. Returns the per-target report. The route publishes one coarse
 * ping per changed module. */
export async function confirmBatch(
  env: Env,
  request: Request,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  batchId: string
): Promise<{ view: ImportBatchView; report: ImportBatchReport; modules: string[] }> {
  const b = await loadBatch(cfg, guard, batchId)
  if (b.overall_status === "complete") throw new GuardError(409, "already_run", "This import has already been run.")
  const plan = planOf(b)
  if (!plan) throw new GuardError(409, "no_plan", "Plan the import before running it.")

  // IDEMPOTENCY (convention · CONCURRENCY.md): atomically CLAIM the batch before writing,
  // so a retried or concurrent confirm can't run the import twice (duplicate rows). Only
  // the request that flips planned→running proceeds; a second finds it already claimed and
  // is refused. A crashed run stays 'running' (safe — no duplicates); re-create to retry.
  const claimed = await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE data_import_batches SET overall_status = 'running', updated_at = ${sqlString(
      new Date().toISOString()
    )} WHERE id = ${sqlString(batchId)} AND overall_status = 'planned' RETURNING id;`,
    []
  )
  if (!claimed.length)
    throw new GuardError(409, "already_run", "This import is already running or has been run.")

  const files = new Map(filesOf(b).map((f) => [f.fileId, f]))

  // Which parents must be read back for id-resolution (any mode:"id" ref in the batch).
  const idParents = new Set<string>()
  for (const key of plan.order)
    for (const ref of TARGETS[key]?.references ?? []) if (ref.mode === "id") idParents.add(ref.target)

  const resolved = new Map<string, Map<string, string>>()
  const report: ImportBatchReport = { perTarget: [], created: 0, skipped: 0, failed: 0, rejections: [] }

  for (const targetKey of plan.order) {
    const def = TARGETS[targetKey]
    const step = plan.steps.find((s) => s.target === targetKey)
    const file = step ? files.get(step.fileId) : undefined
    if (!def || !step || !file) continue
    const tally = { target: targetKey, targetName: def.displayName, created: 0, skipped: 0, failed: 0 }

    // The SAME scan the plan predicted with (missing required / duplicate rows) —
    // so the review screen and the run can never disagree.
    const scans = scanRows(def, step.mapping, step.transforms, file.headers, file.rows)

    // IN WAVES, NOT ONE ROW AT A TIME — the same shape and the same reasoning as
    // `bulkSetStatus` in workers/content/src/lib/help.ts, which is where
    // BULK_CONCURRENCY was written and, until now, its ONLY call site. This is
    // the biggest bulk path in the product and it was still the serial loop that
    // constant exists to replace.
    //
    // THE ARITHMETIC, MEASURED — 5 Sep 2026, scripts/speed-bench.mjs, against
    // staging's own team database. A gated create costs 1,799ms one at a time
    // and 190ms twelve at a time, so a 1,000-row file is THIRTY MINUTES serial
    // and 3.2 minutes in waves. `MAX_ROWS_PER_FILE` is 1,000 and `MAX_FILES` is
    // 8, so one confirmed batch can ask for 8,000 of them.
    //
    // WHAT ACTUALLY BREAKS FIRST, checked against Cloudflare's own limits page
    // rather than assumed: it is NOT the subrequest ceiling (10,000 per request
    // on the paid plan, so 8,000 door hops is inside it, if barely) and it is
    // not wall clock (unlimited while the client stays connected). It is the
    // client: a person on a form, a browser, and the gateway in between, none of
    // which wait half an hour. A thirty-minute import is one nobody ever sees
    // finish, and there is no resume — the claim below is one-way.
    //
    // THE HONEST CEILING ON THIS WAVE. A Worker may hold only SIX outgoing
    // connections open at once waiting for response headers (the same limit
    // `SEND_CONCURRENCY` in content/lib/notify.ts was written for). Whether a
    // service-binding hop counts against that is not something Cloudflare's page
    // settles, and the bench measured direct database calls rather than door
    // hops — so twelve may in practice be six. Six is still six times the loop
    // this replaces, and the number stays `BULK_CONCURRENCY` because one wave
    // size for the product beats two that can drift apart.
    //
    // WHY THE ROWS OF ONE FILE MAY GO TOGETHER. Nothing in the row loop reads
    // anything another row of the same file wrote: `resolveRow` is pure and
    // consults only `resolved`, which is filled between TARGETS (below) and
    // never inside this loop; duplicate detection is decided by `scanRows` in
    // one synchronous pass before the first write. Ordering BETWEEN targets is
    // still strictly sequential — `plan.order` is a topological sort and the
    // outer loop still awaits each target fully before starting the next.
    //
    // …EXCEPT WHERE A ROW CAN CREATE A VOCABULARY VALUE. A reference declared
    // `onMissing: "create"` lands on `ensureSelectableValue`, which is a SELECT
    // followed by an INSERT with no unique constraint underneath it. Serially
    // that is safe; twelve rows naming the same NEW dropdown value at once would
    // each miss the SELECT and insert their own copy. Those targets keep the
    // serial loop they have always had — derived from the target's own
    // references, so a target that gains such a reference tomorrow is covered
    // without anybody remembering this paragraph.
    const createsVocabulary = (def.references ?? []).some((r) => r.onMissing === "create")
    const wavefront = createsVocabulary ? 1 : BULK_CONCURRENCY
    for (let i = 0; i < scans.length; i += wavefront) {
      const wave = scans.slice(i, i + wavefront)
      const results = await Promise.all(
        wave.map(async (scan, n) => {
          const row = i + n + 1
          const { mapped, reject } = scan
          if (reject) return { row, skipped: true as const, reason: reject }
          const { refs, error } = resolveRow(mapped, def.references ?? [], resolved)
          if (error) return { row, skipped: true as const, reason: error }
          const out = await writeRow(env, request, def, def.buildBody(mapped, refs))
          if (out.ok) return { row, skipped: false as const, reason: null }
          return { row, skipped: false as const, reason: out.error ?? "Write failed." }
        })
      )
      // FOLDED AFTER THE WAVE, never inside the callback. The rejection list is
      // what a person downloads to fix their file, so it has to stay in ROW
      // order — and a counter incremented from twelve concurrent callbacks is a
      // counter nobody can reason about. `bulkSetStatus` folds for the same two
      // reasons.
      for (const r of results) {
        if (r.skipped) {
          tally.skipped++
          report.rejections.push({ file: file.name, row: r.row, reason: r.reason })
        } else if (r.reason === null) {
          tally.created++
        } else {
          tally.failed++
          report.rejections.push({ file: file.name, row: r.row, reason: r.reason })
        }
      }
    }

    // If a later child resolves to THIS target by id, read its rows back now.
    if (idParents.has(targetKey)) resolved.set(targetKey, await buildResolvedMap(env, request, def))

    report.perTarget.push(tally)
    report.created += tally.created
    report.skipped += tally.skipped
    report.failed += tally.failed
  }

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE data_import_batches SET report_json = ${sqlString(JSON.stringify(report))}, overall_status = 'complete', completed_at = ${sqlString(now)}, updated_at = ${sqlString(now)} WHERE id = ${sqlString(batchId)};`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Data imported",
    description: `${actor.name} imported ${report.created} row(s) across ${report.perTarget.length} table(s)`,
    relatedTable: "import",
    relatedRowId: batchId,
  })
  return { view: toView(await loadBatch(cfg, guard, batchId)), report, modules: planModules(plan) }
}

export async function getBatchView(cfg: D1Rest, guard: MemberGuard, id: string): Promise<ImportBatchView> {
  return toView(await loadBatch(cfg, guard, id))
}

/** The team's import history, newest first — who ran what, into which tables,
 * with the totals. TEAM-visible (unlike the working batch, which stays creator-
 * scoped): summaries carry file names + counts, never row contents or rejection
 * reasons — the same altitude as the activity feed's "imported N rows" line. */
export async function listBatchSummaries(
  cfg: D1Rest,
  guard: MemberGuard,
  limit = 20
): Promise<ImportBatchSummary[]> {
  const rows = await d1Query<BatchRow & { creator_name: string | null; completed_at: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT ${COLS}, creator_name, completed_at FROM data_import_batches ORDER BY created_at DESC LIMIT ?`,
    [Math.max(1, Math.min(100, limit))]
  )
  return rows.map((b) => {
    const files = filesOf(b)
    const plan = planOf(b)
    const report = b.report_json ? (JSON.parse(b.report_json) as ImportBatchReport) : null
    return {
      id: b.id,
      status: b.overall_status,
      by: b.creator_name ?? "Someone",
      at: b.created_at,
      completedAt: b.completed_at,
      files: files.map((f) => ({ name: f.name, rowCount: f.rowCount })),
      targets: [...new Set((plan?.steps ?? []).map((s) => s.targetName))],
      created: report?.created ?? 0,
      skipped: report?.skipped ?? 0,
      failed: report?.failed ?? 0,
    }
  })
}
