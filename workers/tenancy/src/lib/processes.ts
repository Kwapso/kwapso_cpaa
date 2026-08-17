// PROCESS MAPS — apps, the processes inside them, the versions cut over those,
// the steps each version is made of, and the conversation a client has on a map.
//
// This is the ONLY file in the worker that writes SQL against `apps`,
// `processes`, `process_versions`, `process_steps` or `process_comments` — the
// same boundary lib/accounts.ts draws around the customer spine, and for the same
// reason: every exported function here takes an `AccountScope` and ANDs its
// clause into the statement, so "did this query carry the caller's stamp?" is a
// question with exactly one place to look, and a machine-checkable one
// (test/account-leak.test.ts derives the account-scoped doors off disk and sends
// a burglar at every one of them).
//
// The fence rides the WHERE, never a pre-check. `SELECT … then UPDATE` is two
// steps a concurrent write slips between; `UPDATE … WHERE id = ? AND <scope>` is
// one statement D1 runs atomically, and zero rows changed is the refusal.
//
// WHY EVERY TABLE CARRIES `account_id`. It could be resolved by joining up to the
// app, and that is exactly what makes it wrong: a fence that needs a join is a
// fence the next reader forgets to join. Denormalised, every read here fences with
// the same one clause the accounts list uses, and an app's account is written once
// at creation and never edited (there is no move-app door — see the migration).

import { logActivity, describeChanges, type Actor } from "@shared/workers/activity"
import { accountScopeClause, requireAccountInScope, type AccountScope } from "@shared/workers/account-scope"
import { countCollection } from "@shared/workers/count"
import { d1Query, likeLiteral, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP, THREAD_HARD_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { savingsView, type SavingsView, type StepFigures } from "@shared/workers/savings"
import type { AppRow, ProcessComment, ProcessDetail, ProcessStep, ProcessSummary, ProcessVersion } from "@shared/types"
import { GuardError, type MemberGuard } from "./permissions"

/** Glue optional clauses into a WHERE, dropping the empty ones, so a scope clause
 * that is empty for staff can't leave a dangling `AND`. (The same helper
 * lib/accounts.ts keeps beside its own statements — two copies of four lines
 * beats one import that makes two security boundaries share a file.) */
function where(parts: (string | undefined)[]): string {
  const live = parts.filter((p): p is string => !!p && p.length > 0)
  return live.length ? ` WHERE ${live.join(" AND ")}` : ""
}

/** The audit set-clause every edit here shares. */
function editedBy(actor: Actor, now: string): { sql: string; params: string[] } {
  return {
    sql: "updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?",
    params: [now, actor.id, actor.email, actor.name],
  }
}

/** A parameterised INSERT — the table name is a code literal, every value bound.
 * A process name is the customer's own text (apostrophes, newlines, whatever the
 * workshop produced), and bound parameters are the door that can't be talked past. */
async function insertRow(
  cfg: D1Rest,
  guard: MemberGuard,
  table: "apps" | "processes" | "process_versions" | "process_steps" | "process_comments",
  row: Record<string, string | number | null>
): Promise<void> {
  const cols = Object.keys(row)
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map((c) => row[c])
  )
}

// ── apps ─────────────────────────────────────────────────────────────────────

/** The team's apps. BOUNDED, not paged: an app is a whole built system, and an
 * agency has tens of them, not thousands — the collection that grows underneath
 * is `processes`, which pages. */
export async function listApps(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { accountId?: string } = {}
): Promise<{ rows: AppRow[]; total: number }> {
  const fence = accountScopeClause(scope, "account_id")
  const sql = where([fence.sql, opts.accountId ? "account_id = ?" : undefined])
  const params = opts.accountId ? [...fence.params, opts.accountId] : [...fence.params]
  const [rows, counted] = await Promise.all([
    d1Query<{
      id: string
      account_id: string | null
      name: string
      url: string | null
      stage: string | null
      tool_cost_cents_per_month: number
      deactivated_at: string | null
      created_at: string
      creator_name: string | null
      updated_at: string | null
      editor_name: string | null
    }>(
      cfg,
      guard.databaseId,
      // R14 hard cap — an app list is bounded by how many systems exist.
      `SELECT id, account_id, name, url, stage, tool_cost_cents_per_month, deactivated_at,
              created_at, creator_name, updated_at, editor_name
         FROM apps${sql} ORDER BY (deactivated_at IS NULL) DESC, name ASC LIMIT ${LIST_HARD_CAP}`,
      params
    ),
    // R16: the exact total of what THIS caller may see — the same WHERE, so a
    // badge can never count rows the list withholds.
    d1Query<{ n: number }>(cfg, guard.databaseId, `SELECT COUNT(*) AS n FROM apps${sql}`, params),
  ])
  return {
    rows: rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      name: r.name,
      url: r.url,
      stage: r.stage,
      // WHAT AN APP COSTS US is an internal number and never crosses to a client.
      // It is withheld HERE, on the row, rather than at the three call sites — a
      // redaction you have to remember is one somebody forgets (the same argument
      // toAccount makes one table over, and the reason R24 exists).
      toolCostCentsPerMonth: scope.kind === "portal" ? null : r.tool_cost_cents_per_month,
      active: r.deactivated_at == null,
      createdAt: r.created_at,
      createdByName: scope.kind === "portal" ? null : r.creator_name,
      updatedAt: r.updated_at,
      editedByName: scope.kind === "portal" ? null : r.editor_name,
    })),
    total: counted[0]?.n ?? 0,
  }
}

export async function createApp(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { name: string; accountId?: string; url?: string; stage?: string; toolCostCentsPerMonth?: number }
): Promise<string> {
  if (input.accountId) requireAccountInScope(scope, input.accountId)
  const id = ulid()
  await insertRow(cfg, guard, "apps", {
    id,
    account_id: input.accountId ?? null,
    name: input.name,
    url: input.url ?? null,
    stage: input.stage ?? null,
    tool_cost_cents_per_month: input.toolCostCentsPerMonth ?? 0,
    created_at: new Date().toISOString(),
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "App created",
    description: `${actor.name} added the app "${input.name}"`,
    relatedTable: "apps",
    relatedRowId: id,
  })
  return id
}

/** Edit an app's own fields. NOT its account — see the migration for why there is
 * no move-app door. */
export async function updateApp(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: { name: string; url?: string | null; stage?: string | null; toolCostCentsPerMonth?: number }
): Promise<void> {
  const before = await appOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const audit = editedBy(actor, new Date().toISOString())
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE apps SET name = ?, url = ?, stage = ?, tool_cost_cents_per_month = ?, ${audit.sql}
     ${where([fence.sql, "id = ?"])} RETURNING id`,
    [
      input.name,
      input.url === undefined ? before.url : input.url,
      input.stage === undefined ? before.stage : input.stage,
      input.toolCostCentsPerMonth === undefined ? before.toolCost : input.toolCostCentsPerMonth,
      ...audit.params,
      ...fence.params,
      id,
    ]
  )
  if (!changed[0]) throw new GuardError(404, "not_found", "That app doesn't exist.")
  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Address", from: before.url, to: input.url === undefined ? before.url : input.url },
    { label: "Stage", from: before.stage, to: input.stage === undefined ? before.stage : input.stage },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "App edited",
    description: `${actor.name} edited ${input.name}${changes ? ` — ${changes}` : ""}`,
    relatedTable: "apps",
    relatedRowId: id,
  })
}

/** Archive / restore an app (never delete — its processes, versions and the
 * savings computed from them all survive). R17: the current-status predicate
 * rides the UPDATE, so a double-clicked Archive moves zero rows the second time. */
export async function setAppActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const app = await appOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE apps SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING id`
      : `UPDATE apps SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING id`,
    active ? [now, ...fence.params, id] : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "App restored" : "App archived",
    description: `${actor.name} ${active ? "restored" : "archived"} ${app.name}`,
    relatedTable: "apps",
    relatedRowId: id,
  })
  return true
}

// ── processes ────────────────────────────────────────────────────────────────

/** WHAT A CALLER MAY NARROW a processes read to — the fence plus the two filters,
 * built ONCE so the paged list and any other reader can never disagree about what
 * a filter means. */
export type ProcessFilters = { q?: string; appId?: string }

function processesWhere(scope: AccountScope, opts: ProcessFilters): { sql: string; params: string[] } {
  const fence = accountScopeClause(scope, "p.account_id")
  const filters: string[] = []
  const params: string[] = [...fence.params]
  if (opts.q) {
    // ESCAPED — `%` and `_` are LIKE's own wildcards, so an unescaped needle
    // answers a different question than the one typed, and a pattern of nothing
    // but `%` costs the worker exponential time over the whole table. The
    // backslash goes first or it would escape the escapes.
    filters.push("(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')")
    const like = `%${likeLiteral(opts.q)}%`
    params.push(like, like)
  }
  if (opts.appId) {
    filters.push("p.app_id = ?")
    params.push(opts.appId)
  }
  return { sql: where([fence.sql, ...filters]), params }
}

/** The team's processes, newest first, PAGED by key.
 *
 * R14: processes GROW with ordinary use — every app of every client grows a map,
 * and a map grows a process each time somebody describes another way of working
 * — so this door answers with a cursor rather than a ceiling. `processes` is a
 * GROWING_COLLECTIONS row in shared/rules/registry.ts, which also holds the check
 * to a client that can actually reach page two. */
export async function listProcesses(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: ProcessFilters & { cursor?: string | null } = {}
): Promise<Page<ProcessSummary> & { total: number }> {
  const { sql: base, params } = processesWhere(scope, opts)
  const after = keysetAfter(decodeCursor(opts.cursor), "p.created_at")
  const pageWhere = after.sql ? `${base ? `${base} AND` : " WHERE"} ${after.sql}` : base

  const [rows, counted] = await Promise.all([
    // PAGE_SIZE + 1 is how hasMore is known without a second query.
    d1Query<{
      id: string
      app_id: string
      app_name: string
      account_id: string | null
      name: string
      description: string | null
      deactivated_at: string | null
      created_at: string
      version_count: number
      step_count: number
    }>(
      cfg,
      guard.databaseId,
      `SELECT p.id, p.app_id, a.name AS app_name, p.account_id, p.name, p.description,
              p.deactivated_at, p.created_at,
              (SELECT COUNT(*) FROM process_versions v WHERE v.process_id = p.id) AS version_count,
              (SELECT COUNT(*) FROM process_steps s WHERE s.process_id = p.id
                 AND s.version_id = (SELECT id FROM process_versions v2 WHERE v2.process_id = p.id
                                      ORDER BY v2.version_no DESC LIMIT 1)) AS step_count
         FROM processes p JOIN apps a ON a.id = p.app_id${pageWhere}
        ORDER BY p.created_at DESC, p.id DESC LIMIT ${PAGE_SIZE + 1}`,
      [...params, ...after.params]
    ),
    // R16 (amended): the total behind the page — the SAME WHERE and the SAME
    // join, so a badge can never count rows the list withholds — counted exactly
    // to TOTAL_COUNT_CAP and "at least" beyond it.
    countCollection(
      cfg,
      guard.databaseId,
      `SELECT 1 FROM processes p JOIN apps a ON a.id = p.app_id${base}`,
      params
    ),
  ])

  const page = toPage(rows, PAGE_SIZE, (r) => [r.created_at, r.id])
  return {
    ...page,
    rows: page.rows.map((r) => ({
      id: r.id,
      appId: r.app_id,
      appName: r.app_name,
      accountId: r.account_id,
      name: r.name,
      description: r.description,
      versionCount: r.version_count,
      stepCount: r.step_count,
      active: r.deactivated_at == null,
      createdAt: r.created_at,
    })),
    total: counted,
  }
}

/** One process opened: its versions, the steps of ONE of them, the exact counts
 * its tabs are badged with (R16 — never `rows.length`, which is a capped read's
 * ceiling wearing a total's clothes), and the subtraction the whole map exists
 * to produce. Outside the fence it is a 404, identical to a made-up id.
 *
 * `versionId` IS THE ANSWER TO "I CAN'T SEE THE OLD VERSION" (tester L4, 17 Aug
 * 2026). It defaults to the latest — the answer this door has always given — and
 * naming an older one returns THAT version's steps, with their times as they
 * were agreed. A version id belonging to another map is a 404 rather than an
 * empty list: an empty list reads as "this version had no steps", which is a
 * different and much worse sentence than "no such version".
 *
 * `saving` comes back through `listSavings` rather than being computed here, and
 * that is the point of the round trip. It is the SAME statement and the SAME
 * pure function the value screen and the client's portal read, so the figure on
 * this screen cannot disagree with the one a client is looking at. A second
 * implementation of the subtraction — even a correct-looking one — is exactly
 * how "the numbers stop being believable" starts. `null` when the map is
 * archived: an archived map is out of the value picture by construction (the
 * savings read excludes it), and reporting a figure for it would contradict the
 * value screen on the same page. */
export async function getProcess(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string,
  opts: { versionId?: string } = {}
): Promise<ProcessDetail> {
  const summary = await processOrThrow(cfg, guard, scope, id)
  const shown = await versionOrThrow(cfg, guard, scope, id, opts.versionId)
  const [versions, steps, shownStepCount, commentsTotal, savings] = await Promise.all([
    listProcessVersions(cfg, guard, scope, id),
    listProcessSteps(cfg, guard, scope, id, shown.id),
    countVersionSteps(cfg, guard, scope, shown.id),
    countProcessComments(cfg, guard, scope, id),
    listSavings(cfg, guard, scope, { processId: id }),
  ])
  return {
    process: summary,
    versions,
    steps,
    shownVersionId: shown.id,
    shownStepCount,
    commentsTotal,
    saving: savings.apps[0]?.processes[0] ?? null,
    savingsCaption: savings.caption,
  }
}

/** Every version of one process, newest first. BOUNDED: a version is cut once per
 * completed sprint, so this is a handful of rows for years of work. */
export async function listProcessVersions(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<ProcessVersion[]> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    version_no: number
    label: string | null
    cut_from_sprint_id: string | null
    created_at: string
    creator_name: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a version list is bounded by how many sprints have completed.
    `SELECT id, version_no, label, cut_from_sprint_id, created_at, creator_name
       FROM process_versions${where([fence.sql, "process_id = ?"])}
      ORDER BY version_no DESC LIMIT ${LIST_HARD_CAP}`,
    [...fence.params, processId]
  )
  return rows.map((r) => ({
    id: r.id,
    processId,
    versionNo: r.version_no,
    label: r.label,
    // v1 IS the baseline, always — it is written with the process itself and the
    // unique index on (process_id, version_no) means there can never be a second.
    isBaseline: r.version_no === 1,
    cutFromSprintId: scope.kind === "portal" ? null : r.cut_from_sprint_id,
    createdAt: r.created_at,
    createdByName: scope.kind === "portal" ? null : r.creator_name,
  }))
}

/** The steps of ONE version of a process — the latest by default (what the work
 * looks like today), or a named older one (what it looked like when that version
 * was cut).
 *
 * THE ORDER IS THE FEATURE, not a detail of the read. A reader who cannot tell
 * what follows what cannot check the arithmetic underneath it, and the times on
 * these steps are what a client's savings figure is a subtraction between.
 *
 * `position` decides; `created_at` then `id` settle a tie. Name was the old
 * settler, and it sorted "Chase the paperwork" above "Collect the documents"
 * whenever two positions matched — an alphabetical list wearing a sequence's
 * clothes, which is worse than an arbitrary one because it looks deliberate.
 * The id is there to make the order TOTAL rather than to say anything about
 * time: it is unique, so two reads of the same rows always come back the same
 * way round. (Within one millisecond the data holds no order to recover — a
 * ULID's second half is random — and that is honest: nothing wrote one down.) */
export async function listProcessSteps(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string,
  versionId?: string
): Promise<ProcessStep[]> {
  const fence = accountScopeClause(scope, "s.account_id")
  const rows = await d1Query<{
    id: string
    version_id: string
    step_key: string
    name: string
    description: string | null
    position: number
    seconds_per_run: number
    runs_per_month: number
    removed_at: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — the steps of ONE version of ONE process. A map a person can
    // read is tens of steps; the cap is the honest refusal past that.
    `SELECT s.id, s.version_id, s.step_key, s.name, s.description, s.position,
            s.seconds_per_run, s.runs_per_month, s.removed_at
       FROM process_steps s
      ${where([
        fence.sql,
        "s.process_id = ?",
        versionId
          ? "s.version_id = ?"
          : "s.version_id = (SELECT id FROM process_versions v WHERE v.process_id = ? ORDER BY v.version_no DESC LIMIT 1)",
      ])}
      ORDER BY s.position ASC, s.created_at ASC, s.id ASC LIMIT ${LIST_HARD_CAP}`,
    [...fence.params, processId, versionId ?? processId]
  )
  return rows.map((r) => ({
    id: r.id,
    processId,
    versionId: r.version_id,
    stepKey: r.step_key,
    name: r.name,
    description: r.description,
    position: r.position,
    secondsPerRun: r.seconds_per_run,
    runsPerMonth: r.runs_per_month,
    removed: r.removed_at != null,
  }))
}

/** R16 — the exact server total behind the Steps tab, for the version being
 * SHOWN. It has to move with the version selector: a badge counting today's
 * steps over a list showing version 1's is the quietly-wrong number R16 exists
 * to prevent, and on this screen it would be quietly wrong about the arithmetic
 * a client is reading.
 *
 * A PLAIN `COUNT(*)`, not the bounded seam in shared/workers/count.ts, and that
 * is the seam's own instruction rather than a shortcut past it: it is scoped to
 * GROWING_COLLECTIONS on purpose, because a bounded collection already has a
 * ceiling and wrapping one "would be ceremony". The steps of ONE version of ONE
 * map are bounded by what a person can read — the same reason `listProcessSteps`
 * above takes a hard cap rather than a cursor. */
export async function countVersionSteps(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  versionId: string
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM process_steps${where([fence.sql, "version_id = ?"])}`,
    [...fence.params, versionId]
  )
  return rows[0]?.n ?? 0
}

/** Create a process AND its baseline. The two are one act, deliberately: a
 * process with no version 1 can never produce a saving and would report zero for
 * ever while looking perfectly healthy. `baselineLabel` is what the client calls
 * the way they worked before us. */
export async function createProcess(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { appId: string; name: string; description?: string; baselineLabel?: string }
): Promise<string> {
  const app = await appOrThrow(cfg, guard, scope, input.appId)
  const id = ulid()
  const now = new Date().toISOString()
  await insertRow(cfg, guard, "processes", {
    id,
    app_id: input.appId,
    account_id: app.accountId,
    name: input.name,
    description: input.description ?? null,
    created_at: now,
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await insertRow(cfg, guard, "process_versions", {
    id: ulid(),
    process_id: id,
    account_id: app.accountId,
    version_no: 1,
    label: input.baselineLabel ?? "How it worked before",
    cut_from_sprint_id: null,
    created_at: now,
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Process created",
    description: `${actor.name} mapped the process "${input.name}" on ${app.name}`,
    relatedTable: "processes",
    relatedRowId: id,
  })
  return id
}

export async function updateProcess(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: { name: string; description?: string | null }
): Promise<void> {
  const before = await processOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const audit = editedBy(actor, new Date().toISOString())
  const description = input.description === undefined ? before.description : input.description
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE processes SET name = ?, description = ?, ${audit.sql}
     ${where([fence.sql, "id = ?"])} RETURNING id`,
    [input.name, description, ...audit.params, ...fence.params, id]
  )
  if (!changed[0]) throw new GuardError(404, "not_found", "That process doesn't exist.")
  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Description", from: before.description, to: description, hideValues: true },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Process edited",
    description: `${actor.name} edited ${input.name}${changes ? ` — ${changes}` : ""}`,
    relatedTable: "processes",
    relatedRowId: id,
  })
}

/** Archive / restore a process. R17 predicate; zero rows moved = silence. */
export async function setProcessActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const process = await processOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE processes SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING id`
      : `UPDATE processes SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING id`,
    active ? [now, ...fence.params, id] : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Process restored" : "Process archived",
    description: `${actor.name} ${active ? "restored" : "archived"} the process ${process.name}`,
    relatedTable: "processes",
    relatedRowId: id,
  })
  return true
}

// ── steps ────────────────────────────────────────────────────────────────────

/** Add a step to a process's LATEST version. A new step gets a fresh `step_key`,
 * which is the identity every later version will carry it forward under.
 *
 * WITH NO POSITION GIVEN IT GOES ON THE END, and that is a fix rather than a
 * preference. The default was `0`, and `0` sorts FIRST — so every step added
 * from the app landed above the whole map, and a reader watching a sequence
 * build up saw it grow backwards. (The seeded maps set an explicit position and
 * looked fine, which is why it survived: the only steps that misbehaved were the
 * ones a person typed.) A tie is harmless — two concurrent adds may land on the
 * same number and the read's `created_at` tie-break settles them — so this needs
 * no lock; it is a display order, not an invariant. */
export async function addStep(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: {
    processId: string
    name: string
    description?: string
    secondsPerRun: number
    runsPerMonth: number
    position?: number
  }
): Promise<string> {
  const process = await processOrThrow(cfg, guard, scope, input.processId)
  const version = await latestVersionOrThrow(cfg, guard, scope, input.processId)
  const id = ulid()
  await insertRow(cfg, guard, "process_steps", {
    id,
    process_id: input.processId,
    version_id: version.id,
    account_id: process.accountId,
    step_key: ulid(),
    name: input.name,
    description: input.description ?? null,
    position: input.position ?? (await nextPosition(cfg, guard, version.id)),
    seconds_per_run: input.secondsPerRun,
    runs_per_month: input.runsPerMonth,
    created_at: new Date().toISOString(),
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Step added",
    description: `${actor.name} added the step "${input.name}" to ${process.name}`,
    relatedTable: "process_steps",
    relatedRowId: id,
  })
  return id
}

/** Edit ONE step, in the version it belongs to. Editing a step of an OLD version
 * is refused: a baseline that can be edited after the fact is a saving anybody
 * can dial up, which is the whole of "the numbers stop being believable". The
 * predicate rides the UPDATE, so it cannot be raced past. */
export async function updateStep(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: { name: string; description?: string | null; secondsPerRun: number; runsPerMonth: number; position?: number }
): Promise<string> {
  const before = await stepOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const audit = editedBy(actor, new Date().toISOString())
  const changed = await d1Query<{ process_id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE process_steps SET name = ?, description = ?, seconds_per_run = ?, runs_per_month = ?,
       position = ?, ${audit.sql}
     ${where([
       fence.sql,
       "id = ?",
       // …and only in the newest version. See the note above.
       "version_id = (SELECT id FROM process_versions v WHERE v.process_id = process_steps.process_id ORDER BY v.version_no DESC LIMIT 1)",
     ])} RETURNING process_id`,
    [
      input.name,
      input.description === undefined ? before.description : input.description,
      input.secondsPerRun,
      input.runsPerMonth,
      input.position ?? before.position,
      ...audit.params,
      ...fence.params,
      id,
    ]
  )
  if (!changed[0])
    throw new GuardError(
      409,
      "not_latest",
      "That step belongs to an older version of the process. Only the current version can be edited."
    )
  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Minutes per run", from: String(Math.round(before.secondsPerRun / 60)), to: String(Math.round(input.secondsPerRun / 60)) },
    { label: "Times a month", from: String(before.runsPerMonth), to: String(input.runsPerMonth) },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Step edited",
    description: `${actor.name} edited the step "${input.name}"${changes ? ` — ${changes}` : ""}`,
    relatedTable: "process_steps",
    relatedRowId: id,
  })
  return changed[0].process_id
}

/** THE WORK STOPPED HAPPENING. Not a delete: the row stays, its frequency stays,
 * and its duration goes to zero — which is what makes the plain savings sentence
 * true for the largest saving there is (work we removed entirely). Deleting the
 * row instead would drop the step out of the baseline join and report NO saving
 * for it, silently.
 *
 * R17: `removed_at IS NULL` rides the UPDATE, so removing twice moves zero rows,
 * writes no second history line and publishes nothing.
 *
 * AND ONLY IN THE NEWEST VERSION — the same predicate `updateStep` carries, added
 * here on 17 Aug 2026 when the detail screen learned to show older versions. The
 * hole was real and had simply been out of reach: this write sets a duration to
 * ZERO, so against a baseline it would have manufactured the largest saving the
 * app can report, on the exact figure a client is shown. Nothing but the absence
 * of a button was stopping it, and a button is not a permission. */
export async function removeStep(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string
): Promise<string | null> {
  const before = await stepOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await d1Query<{ process_id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE process_steps SET removed_at = ?, seconds_per_run = 0, ${editedBy(actor, now).sql}
     ${where([
       fence.sql,
       "id = ?",
       "removed_at IS NULL",
       // …and only in the newest version. It rides the UPDATE rather than sitting
       // in front of it because a version cut between a check and a write would
       // leave the check true and the write wrong.
       "version_id = (SELECT id FROM process_versions v WHERE v.process_id = process_steps.process_id ORDER BY v.version_no DESC LIMIT 1)",
     ])} RETURNING process_id`,
    [now, ...editedBy(actor, now).params, ...fence.params, id]
  )
  // ZERO ROWS MOVED HAS TWO CAUSES NOW, and they are not the same answer. Already
  // removed is nothing wrong (R17: silence, no second history line, no ping).
  // Belonging to a frozen version is a refusal, and it has to SAY so — a silent
  // 200 would tell somebody the baseline had been edited when it had not. The
  // read happens only on this path, so the ordinary write still costs one
  // statement and the predicate above is still the thing that decided.
  if (!changed[0] && !(await isInLatestVersion(cfg, guard, scope, id)))
    throw new GuardError(
      409,
      "not_latest",
      "That step belongs to an older version of the process. Only the current version can be changed."
    )
  if (!changed[0]) return null
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Step removed",
    description: `${actor.name} recorded that the step "${before.name}" no longer happens`,
    relatedTable: "process_steps",
    relatedRowId: id,
  })
  return changed[0].process_id
}

// ── the version cut ──────────────────────────────────────────────────────────

/** CUT A NEW VERSION: copy the current version's steps forward, keeping every
 * `step_key`, so the next edit describes the new way of working and the old one
 * stays exactly as it was agreed.
 *
 * TWO CALLERS, ONE FUNCTION (SCOPE, confirmed by the owner): a sprint completing
 * cuts one automatically, and a person can cut one from the button. The only
 * difference is `sprintId`.
 *
 * IDEMPOTENT (R17), and this is the one transition in the build where "the same
 * thing happened twice" is an INSERT rather than an UPDATE — so the predicate
 * cannot ride a WHERE. It rides the partial unique index on
 * (process_id, cut_from_sprint_id) instead: a sprint that completes twice — a
 * double click, a retried job, a replayed hook — is refused by the database, not
 * by a check a second request could slip past. `null` back means "already cut",
 * which is a 200 with no activity row and no ping, exactly like a zero-row move. */
export async function cutVersion(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { processId: string; label?: string; sprintId?: string }
): Promise<{ versionId: string; versionNo: number } | null> {
  const process = await processOrThrow(cfg, guard, scope, input.processId)
  const current = await latestVersionOrThrow(cfg, guard, scope, input.processId)

  const versionId = ulid()
  const now = new Date().toISOString()
  try {
    await insertRow(cfg, guard, "process_versions", {
      id: versionId,
      process_id: input.processId,
      account_id: process.accountId,
      version_no: current.versionNo + 1,
      label: input.label ?? null,
      cut_from_sprint_id: input.sprintId ?? null,
      created_at: now,
      creator_id: actor.id,
      creator_email: actor.email,
      creator_name: actor.name,
    })
  } catch (e) {
    // ONLY a duplicate is swallowed; anything else is rethrown untouched, because
    // a swallowed database error is exactly what this must not become. Both data
    // doors phrase it the same way ("UNIQUE constraint failed: …").
    if (!/UNIQUE constraint/i.test(String((e as Error)?.message ?? ""))) throw e
    return null
  }

  // The steps travel forward WITH their keys — that is what makes "the same step,
  // one version later" a subtraction rather than a name match. A removed step
  // travels too, with its frequency intact and zero seconds, so the work we took
  // away goes on being counted as a saving.
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO process_steps
       (id, process_id, version_id, account_id, step_key, name, description, position,
        seconds_per_run, runs_per_month, removed_at, created_at, creator_id, creator_email, creator_name)
     SELECT lower(hex(randomblob(16))), s.process_id, ?, s.account_id, s.step_key, s.name, s.description,
            s.position, s.seconds_per_run, s.runs_per_month, s.removed_at, ?, ?, ?, ?
       FROM process_steps s
      WHERE s.process_id = ? AND s.version_id = ?`,
    [versionId, now, actor.id, actor.email, actor.name, input.processId, current.id]
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Version cut",
    description: `${actor.name} cut version ${current.versionNo + 1} of ${process.name}${
      input.sprintId ? " when a sprint completed" : ""
    }`,
    relatedTable: "process_versions",
    relatedRowId: versionId,
  })
  return { versionId, versionNo: current.versionNo + 1 }
}

// ── the conversation on a map ────────────────────────────────────────────────

/** A process map's comments, oldest first — it reads as a conversation. */
export async function listProcessComments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<ProcessComment[]> {
  // The process decides visibility FIRST: a comment set is a property of a map,
  // so an invisible map yields an empty set rather than a readable conversation.
  await processOrThrow(cfg, guard, scope, processId)
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    body: string
    explains_step_key: string | null
    is_staff: number
    created_at: string
    creator_id: string | null
    creator_name: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a conversation, like a ticket's replies.
    `SELECT id, body, explains_step_key, is_staff, created_at, creator_id, creator_name
       FROM process_comments${where([fence.sql, "process_id = ?"])}
      ORDER BY created_at ASC LIMIT ${THREAD_HARD_CAP}`,
    [...fence.params, processId]
  )
  return rows.map((r) => ({
    id: r.id,
    processId,
    body: r.body,
    explainsStepKey: r.explains_step_key,
    fromStaff: r.is_staff === 1,
    createdAt: r.created_at,
    // WHICH STAFF MEMBER WROTE IT is not the client's to read (SCOPE ch.06 — the
    // portal shows work status, never who inside the agency is doing it). Their
    // OWN colleagues' names stay, because those are their own people.
    createdByName: scope.kind === "portal" && r.is_staff === 1 ? null : r.creator_name,
  }))
}

/** R16 — the exact server total behind the conversation, through the SAME fence. */
export async function countProcessComments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM process_comments${where([fence.sql, "process_id = ?"])}`,
    [...fence.params, processId]
  )
  return rows[0]?.n ?? 0
}

/** Say something on a map. THE ONE WRITE A CLIENT LOGIN CAN REACH here, and it
 * is a conversation, never an edit: it changes no duration, cuts no version and
 * moves no number.
 *
 * `explainsStepKey` is the staff half — the explanation a regression must carry
 * before the portal will show it. A client login cannot set it (the route
 * refuses), because "why this got slower" is the agency's account of its own
 * work. */
export async function addProcessComment(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { processId: string; body: string; explainsStepKey?: string }
): Promise<{ id: string; accountId: string | null }> {
  // The fence decides WHOSE map this is BEFORE a word is appended, and answers
  // 404 rather than 403 so "not yours" never confirms the map exists.
  const process = await processOrThrow(cfg, guard, scope, input.processId)
  const id = ulid()
  await insertRow(cfg, guard, "process_comments", {
    id,
    process_id: input.processId,
    account_id: process.accountId,
    body: input.body,
    explains_step_key: input.explainsStepKey ?? null,
    is_staff: scope.kind === "staff" ? 1 : 0,
    created_at: new Date().toISOString(),
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Process comment added",
    description: `${actor.name} commented on the process ${process.name}`,
    relatedTable: "process_comments",
    relatedRowId: id,
  })
  // The ACCOUNT travels back with the id: the route's live ping has to name it
  // (a client login's socket is fenced by account and cannot check a process id),
  // and re-reading the process to find it would be a second four-query round trip
  // for a value this function already holds.
  return { id, accountId: process.accountId }
}

// ── the savings drill-down ───────────────────────────────────────────────────

/** THE FIGURE, AND EVERYTHING IT IS MADE OF — App → Process → Step, so a client
 * asking "where does 208 hours come from?" gets an answer three clicks deep
 * rather than an assurance.
 *
 * The read is ONE statement, joining each step of the BASELINE version to the
 * step of the LATEST version that carries the same `step_key`. Both sides are
 * LEFT-joined, because the two honest edge cases are a step that only exists in
 * one of them: a step we REMOVED (baseline only → the whole of its time is
 * saved) and a step we ADDED (latest only → new work, which is a regression, and
 * internal screens always show it).
 *
 * The arithmetic itself is NOT here. It lives in shared/workers/savings.ts as a
 * pure function so it can be read and tested without a database, which is what
 * makes it checkable by anyone who doubts a number. */
export async function listSavings(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { accountId?: string; appId?: string; processId?: string } = {}
): Promise<SavingsView> {
  if (opts.accountId) requireAccountInScope(scope, opts.accountId)
  const fence = accountScopeClause(scope, "p.account_id")
  const sql = where([
    fence.sql,
    opts.accountId ? "p.account_id = ?" : undefined,
    opts.appId ? "p.app_id = ?" : undefined,
    // ONE MAP'S OWN SUBTRACTION, for the map's own screen. It narrows the same
    // statement rather than adding a second one, which is what makes the figure
    // on a process's detail the same figure as on the value screen by
    // construction instead of by inspection. Not a query parameter on the value
    // door: nothing asks a machine for one map's saving, and a filter with no
    // caller is a contract to keep for nothing (R19 measures the door's own
    // parameters, so this stays honest by staying a lib option).
    opts.processId ? "p.id = ?" : undefined,
    // An archived app or process is not part of today's picture.
    "p.deactivated_at IS NULL",
    "a.deactivated_at IS NULL",
  ])
  const params = [...fence.params]
  if (opts.accountId) params.push(opts.accountId)
  if (opts.appId) params.push(opts.appId)
  if (opts.processId) params.push(opts.processId)

  // WHICH STEPS WE HAVE EXPLAINED — one bounded read, not one per step. A staff
  // comment naming a step IS the explanation (BUILD-3 §3), so this is the set of
  // step keys that have one, and a regression next to its explanation is the
  // shape both front doors render. A CLIENT's comment naming a step would not
  // count even if the door let them write one, which it does not.
  const commentFence = accountScopeClause(scope, "account_id")
  const explained = new Set(
    (
      await d1Query<{ explains_step_key: string }>(
        cfg,
        guard.databaseId,
        // R14 hard cap — one row per explained step.
        `SELECT DISTINCT explains_step_key FROM process_comments
          ${where([commentFence.sql, "explains_step_key IS NOT NULL", "is_staff = 1"])}
          LIMIT ${LIST_HARD_CAP}`,
        [...commentFence.params]
      )
    ).map((r) => r.explains_step_key)
  )

  const rows = await d1Query<{
    app_id: string
    app_name: string
    process_id: string
    process_name: string
    step_key: string
    step_name: string | null
    baseline_seconds: number | null
    latest_seconds: number | null
    runs_per_month: number | null
    removed_at: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — every step of every process of every app the caller may see.
    // A map a person can read is tens of steps; past the cap the caller narrows
    // by account or by app (both filters are on this door).
    `WITH baseline AS (
       SELECT s.process_id, s.step_key, s.name, s.seconds_per_run, s.runs_per_month
         FROM process_steps s
         JOIN process_versions v ON v.id = s.version_id AND v.version_no = 1
     ),
     newest AS (
       SELECT s.process_id, s.step_key, s.name, s.seconds_per_run, s.runs_per_month, s.removed_at
         FROM process_steps s
        WHERE s.version_id = (SELECT id FROM process_versions v2
                               WHERE v2.process_id = s.process_id
                               ORDER BY v2.version_no DESC LIMIT 1)
     )
     SELECT a.id AS app_id, a.name AS app_name, p.id AS process_id, p.name AS process_name,
            COALESCE(b.step_key, n.step_key) AS step_key,
            COALESCE(n.name, b.name) AS step_name,
            b.seconds_per_run AS baseline_seconds,
            n.seconds_per_run AS latest_seconds,
            COALESCE(n.runs_per_month, b.runs_per_month) AS runs_per_month,
            n.removed_at
       FROM processes p
       JOIN apps a ON a.id = p.app_id
       LEFT JOIN baseline b ON b.process_id = p.id
       LEFT JOIN newest n ON n.process_id = p.id AND n.step_key = b.step_key
      ${sql}
      UNION
     SELECT a.id, a.name, p.id, p.name, n.step_key, n.name, NULL, n.seconds_per_run,
            n.runs_per_month, n.removed_at
       FROM processes p
       JOIN apps a ON a.id = p.app_id
       JOIN newest n ON n.process_id = p.id
       LEFT JOIN baseline b ON b.process_id = p.id AND b.step_key = n.step_key
      ${sql ? `${sql} AND b.step_key IS NULL` : " WHERE b.step_key IS NULL"}
      ORDER BY app_name, process_name, step_name
      LIMIT ${LIST_HARD_CAP}`,
    [...params, ...params]
  )

  // Shape the flat rows into the App → Process → Step tree the pure function
  // rolls up. A step that exists in neither version is not a row at all.
  const apps = new Map<string, { appId: string; name: string; processes: Map<string, { processId: string; name: string; steps: StepFigures[] }> }>()
  for (const r of rows) {
    if (!r.step_key) continue
    const app = apps.get(r.app_id) ?? { appId: r.app_id, name: r.app_name, processes: new Map() }
    apps.set(r.app_id, app)
    const process = app.processes.get(r.process_id) ?? { processId: r.process_id, name: r.process_name, steps: [] }
    app.processes.set(r.process_id, process)
    process.steps.push({
      stepKey: r.step_key,
      name: r.step_name ?? "Step",
      baselineSecondsPerRun: r.baseline_seconds ?? 0,
      latestSecondsPerRun: r.latest_seconds ?? 0,
      runsPerMonth: r.runs_per_month ?? 0,
      removed: r.removed_at != null,
      explained: explained.has(r.step_key),
    })
  }
  return savingsView(
    [...apps.values()].map((a) => ({ appId: a.appId, name: a.name, processes: [...a.processes.values()] }))
  )
}

// ── shared internals ─────────────────────────────────────────────────────────

/** One app inside the fence, or a clean 404 (identical to a made-up id). */
async function appOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<{ id: string; accountId: string | null; name: string; url: string | null; stage: string | null; toolCost: number }> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    account_id: string | null
    name: string
    url: string | null
    stage: string | null
    tool_cost_cents_per_month: number
  }>(
    cfg,
    guard.databaseId,
    `SELECT id, account_id, name, url, stage, tool_cost_cents_per_month
       FROM apps${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That app doesn't exist.")
  return {
    id: rows[0].id,
    accountId: rows[0].account_id,
    name: rows[0].name,
    url: rows[0].url,
    stage: rows[0].stage,
    toolCost: rows[0].tool_cost_cents_per_month,
  }
}

/** One process inside the fence, or a clean 404. */
async function processOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<ProcessSummary> {
  const fence = accountScopeClause(scope, "p.account_id")
  const rows = await d1Query<{
    id: string
    app_id: string
    app_name: string
    account_id: string | null
    name: string
    description: string | null
    deactivated_at: string | null
    created_at: string
    version_count: number
    step_count: number
  }>(
    cfg,
    guard.databaseId,
    `SELECT p.id, p.app_id, a.name AS app_name, p.account_id, p.name, p.description,
            p.deactivated_at, p.created_at,
            (SELECT COUNT(*) FROM process_versions v WHERE v.process_id = p.id) AS version_count,
            (SELECT COUNT(*) FROM process_steps s WHERE s.process_id = p.id
               AND s.version_id = (SELECT id FROM process_versions v2 WHERE v2.process_id = p.id
                                    ORDER BY v2.version_no DESC LIMIT 1)) AS step_count
       FROM processes p JOIN apps a ON a.id = p.app_id${where([fence.sql, "p.id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That process doesn't exist.")
  const r = rows[0]
  return {
    id: r.id,
    appId: r.app_id,
    appName: r.app_name,
    accountId: r.account_id,
    name: r.name,
    description: r.description,
    versionCount: r.version_count,
    stepCount: r.step_count,
    active: r.deactivated_at == null,
    createdAt: r.created_at,
  }
}

/** The newest version of a process, inside the fence. Every process has one — it
 * is written with the process itself — so an absence here is a database somebody
 * has been editing by hand, and it says so rather than computing from nothing. */
async function latestVersionOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<{ id: string; versionNo: number }> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ id: string; version_no: number }>(
    cfg,
    guard.databaseId,
    `SELECT id, version_no FROM process_versions${where([fence.sql, "process_id = ?"])}
      ORDER BY version_no DESC LIMIT 1`,
    [...fence.params, processId]
  )
  if (!rows[0])
    throw new GuardError(409, "no_baseline", "That process has no version 1 yet — it can't be measured from.")
  return { id: rows[0].id, versionNo: rows[0].version_no }
}

/** Is this step part of the version that can still be edited? Asked ONLY to tell
 * two zero-row outcomes apart after a refused write — never to decide one, which
 * is why it is not called before the UPDATE that carries the same predicate. */
async function isInLatestVersion(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  stepId: string
): Promise<boolean> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM process_steps${where([
      fence.sql,
      "id = ?",
      "version_id = (SELECT id FROM process_versions v WHERE v.process_id = process_steps.process_id ORDER BY v.version_no DESC LIMIT 1)",
    ])}`,
    [...fence.params, stepId]
  )
  return (rows[0]?.n ?? 0) > 0
}

/** The next place on the end of a version's list of steps. No fence clause: the
 * version id reaching here has already been resolved through one
 * (`latestVersionOrThrow`), and this reads no row's contents — it asks for a
 * number to sort by. */
async function nextPosition(cfg: D1Rest, guard: MemberGuard, versionId: string): Promise<number> {
  const rows = await d1Query<{ n: number | null }>(
    cfg,
    guard.databaseId,
    "SELECT MAX(position) AS n FROM process_steps WHERE version_id = ?",
    [versionId]
  )
  return (rows[0]?.n ?? 0) + 1
}

/** THE VERSION A READER ASKED FOR — the named one, or the latest when they named
 * none.
 *
 * `process_id = ?` rides the WHERE beside the id, so a version id belonging to
 * ANOTHER map is a 404 and not that map's steps. The account fence would already
 * refuse another CLIENT's version; this is the clause that refuses another map
 * of the same client's, which the fence cannot see the difference of. */
async function versionOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string,
  versionId?: string
): Promise<{ id: string; versionNo: number }> {
  if (!versionId) return latestVersionOrThrow(cfg, guard, scope, processId)
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ id: string; version_no: number }>(
    cfg,
    guard.databaseId,
    `SELECT id, version_no FROM process_versions${where([fence.sql, "id = ?", "process_id = ?"])} LIMIT 1`,
    [...fence.params, versionId, processId]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That version doesn't exist.")
  return { id: rows[0].id, versionNo: rows[0].version_no }
}

/** One step inside the fence, or a clean 404. */
async function stepOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<{ id: string; name: string; description: string | null; position: number; secondsPerRun: number; runsPerMonth: number }> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    name: string
    description: string | null
    position: number
    seconds_per_run: number
    runs_per_month: number
  }>(
    cfg,
    guard.databaseId,
    `SELECT id, name, description, position, seconds_per_run, runs_per_month
       FROM process_steps${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That step doesn't exist.")
  return {
    id: rows[0].id,
    name: rows[0].name,
    description: rows[0].description,
    position: rows[0].position,
    secondsPerRun: rows[0].seconds_per_run,
    runsPerMonth: rows[0].runs_per_month,
  }
}
