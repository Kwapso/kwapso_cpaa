// WAVES — what a client bought, and the sprints inside it.
//
// A WAVE IS A PACKAGE OF SPRINTS. The owner's example is the definition: "Alex
// sells Hogo a package — he maps their processes, builds two automations, they
// test it, he trains them. Three weeks later he sells a second, identical
// package." Two waves. They are told apart by their name and their dates, and by
// nothing else — a wave has NO KIND, ruled out in the same round: "a wave
// consists of multiple sprints. Sprints consist of multiple stories… It makes no
// sense to label a wave as a particular kind. A wave is a wave."
//
// FOUR THINGS THIS FILE IS CAREFUL ABOUT, and each of them is a decision that
// was already made rather than a preference of the code:
//
//   1 · NO MONEY. Nothing here reads `internal_rates` or `account_rates`, and
//       there is no price column on `waves` for it to read. The owner ruled the
//       money out of the first version — "leave the whole internal_rates and
//       account_rates out of V1. It's something new, too complex. We will
//       revisit this later. This is a fix decision." R24 is the standing law
//       underneath it: an internal number cannot reach the client's side, and
//       the defence that survives is the import nobody wrote.
//
//   2 · THE DATES ARE DERIVED AND STORED. `recalcWaveDates` is the ONE place a
//       wave's dates are decided — the earliest start and the latest end of the
//       live sprints in it — and every write that could move them calls it. They
//       are STORED rather than computed on read because a list of waves would
//       otherwise carry two sub-queries per row for a pair of numbers that
//       change a handful of times a year.
//
//   3 · A WAVE WITH NO SPRINTS IS ORDINARY. "Alex sells the wave, sprints get
//       planned afterwards." So both dates are nullable, a create takes no
//       sprint, and the recalc over an empty wave writes NULL rather than
//       refusing or leaving a stale pair of dates behind.
//
//   4 · OVERLAPPING SPRINTS WARN, THEY DO NOT REFUSE. Aurora's ruling — "warn,
//       but we can save it (it can happen…)". Two sprints of one package
//       genuinely can run over each other, so `setSprintWave` SAVES and hands
//       the overlap back for the screen to say out loud. A refusal here would
//       leave a team unable to record something that had already happened.
//
// EVERYTHING IS PER CLIENT. Every read takes the caller's account scope and
// every write checks the record belongs to an account the caller may touch —
// asserted here, closest to the rows, as well as at the door.
//
// DEACTIVATE, NEVER DELETE (ARCHITECTURE §4). A switched-off wave is still the
// package a two-year-old sprint was sold inside.

import { logActivity, type Actor } from "@shared/workers/activity"
import { accountScopeClause, type AccountScope } from "@shared/workers/account-scope"
import { d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import type { Wave, WaveOverlap, WaveSprint } from "@shared/waves"
import { GuardError, type MemberGuard } from "./permissions"

/* ------------------------------- the shapes -------------------------------
 *
 * The row shapes live in shared/, beside every other record the two front doors
 * read — re-exported here so this file still reads as the one place the module
 * is defined, and so a screen importing from either place gets the same type
 * rather than a copy that can drift. */

export type { Wave, WaveOverlap, WaveSprint } from "@shared/waves"

/* ------------------------------ the audit block ---------------------------- */

const AUDIT_CREATE = "created_at, creator_id, creator_email, creator_name"

function auditCreateValues(actor: Actor, now: string): string {
  return `${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)}`
}

function auditEditSet(actor: Actor, now: string): string {
  return `updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)}`
}

/* --------------------------------- the fence -------------------------------- */

/** THE ACCOUNT THIS RECORD BELONGS TO MUST BE ONE THE CALLER MAY TOUCH.
 *
 * Every write here names an account — directly on a create, through the record
 * on everything else — and this is the one place it is checked. Staff pass
 * everything; a portal caller passes only the accounts their scope names, and a
 * scope naming nothing passes nothing. */
function assertAccountInScope(scope: AccountScope, accountId: string): void {
  if (scope.kind === "staff") return
  if (!scope.accountIds.includes(accountId))
    throw new GuardError(404, "not_found", "No such client.")
}

/** The account a row belongs to, read back before it is written to — because the
 * id on the body says which RECORD, and only the row says whose it is. */
async function ownerOf(
  cfg: D1Rest,
  guard: MemberGuard,
  table: string,
  id: string
): Promise<string | null> {
  const rows = await d1Query<{ account_id: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT account_id FROM ${table} WHERE id = ${sqlString(id)}`
  )
  if (!rows.length) throw new GuardError(404, "not_found", "That's not there anymore.")
  return rows[0].account_id
}

function duplicateOr(e: unknown, name: string): unknown {
  const message = e instanceof Error ? e.message : ""
  if (/UNIQUE constraint failed/i.test(message))
    return new GuardError(409, "duplicate", `There's already a wave called ${name} for this client.`)
  return e
}

/* ------------------------------- reading them ------------------------------ */

type WaveRow = {
  id: string
  account_id: string
  account_name: string | null
  name: string
  goal: string | null
  starts_on: string | null
  ends_on: string | null
  sprint_count: number
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

const WAVE_COLUMNS = `w.id, w.account_id, a.name AS account_name, w.name, w.goal,
            w.starts_on, w.ends_on, w.deactivated_at,
            w.created_at, w.creator_name, w.updated_at, w.editor_name,
            (SELECT COUNT(*) FROM sprints s
              WHERE s.wave_id = w.id AND s.deactivated_at IS NULL) AS sprint_count`

function toWave(r: WaveRow): Wave {
  return {
    id: r.id,
    accountId: r.account_id,
    accountName: r.account_name,
    name: r.name,
    goal: r.goal,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    sprintCount: Number(r.sprint_count) || 0,
    active: r.deactivated_at == null,
    createdAt: r.created_at,
    createdByName: r.creator_name,
    updatedAt: r.updated_at,
    editedByName: r.editor_name,
  }
}

/** Every wave of the clients this caller may see, live ones first, newest
 * package first inside that.
 *
 * `sprintCount` rides along in the same statement because the screen shows it
 * beside every name and the alternative is a count per row — the N+1 this module
 * would otherwise be born with. */
export async function listWaves(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string | null
): Promise<Wave[]> {
  const fence = accountScopeClause(scope, "w.account_id")
  const where = [fence.sql, accountId ? `w.account_id = ${sqlString(accountId)}` : ""]
    .filter(Boolean)
    .join(" AND ")
  const rows = await d1Query<WaveRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a wave is a package an agency SELLS, so this list grows at
    // the speed of contracts and never with ordinary use. Bounded, not paged.
    `SELECT ${WAVE_COLUMNS}
       FROM waves w
       LEFT JOIN accounts a ON a.id = w.account_id
      ${where ? `WHERE ${where}` : ""}
      ORDER BY (w.deactivated_at IS NOT NULL),
               COALESCE(w.starts_on, w.created_at) DESC,
               w.name
      LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map(toWave)
}

/** R16 — the badge shows the door's exact COUNT(*), never the list's length. */
export async function countWaves(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string | null
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const where = [fence.sql, accountId ? `account_id = ${sqlString(accountId)}` : ""]
    .filter(Boolean)
    .join(" AND ")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM waves ${where ? `WHERE ${where}` : ""}`
  )
  return Number(rows[0]?.n) || 0
}

/** ONE WAVE, with the sprints inside it and any overlap between them.
 *
 * Three answers in one call because they are one screen: the record, the
 * collection it is made of, and the warning that collection carries. Returns
 * null when the id names nothing the caller may see, so the door can answer 404
 * without a second read. */
export async function getWave(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<{ wave: Wave; sprints: WaveSprint[]; overlaps: WaveOverlap[] } | null> {
  const fence = accountScopeClause(scope, "w.account_id")
  const where = [fence.sql, `w.id = ${sqlString(id)}`].filter(Boolean).join(" AND ")
  const rows = await d1Query<WaveRow>(
    cfg,
    guard.databaseId,
    `SELECT ${WAVE_COLUMNS}
       FROM waves w
       LEFT JOIN accounts a ON a.id = w.account_id
      WHERE ${where}
      LIMIT 1`
  )
  if (!rows.length) return null
  // Independent reads of the same wave — one wait, not 2.
  const [sprints, overlaps] = await Promise.all([
    listWaveSprints(cfg, guard, id),
    waveOverlaps(cfg, guard, id),
  ])
  return { wave: toWave(rows[0]), sprints, overlaps }
}

/** The sprints in one wave. Fenced by the WAVE, which the caller has already
 * been proved to be allowed to read — a sprint's own account is the same one. */
async function listWaveSprints(
  cfg: D1Rest,
  guard: MemberGuard,
  waveId: string
): Promise<WaveSprint[]> {
  const rows = await d1Query<{
    id: string
    wave_id: string | null
    account_id: string | null
    name: string
    starts_on: string | null
    ends_on: string | null
    deactivated_at: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a package holds a handful of sprints, never a growing feed.
    `SELECT s.id, s.wave_id, s.account_id, s.name, s.starts_on, s.ends_on, s.deactivated_at
       FROM sprints s
      WHERE s.wave_id = ${sqlString(waveId)}
      ORDER BY (s.deactivated_at IS NOT NULL), COALESCE(s.starts_on, s.created_at), s.name
      LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map((r) => ({
    id: r.id,
    waveId: r.wave_id,
    accountId: r.account_id,
    name: r.name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    active: r.deactivated_at == null,
  }))
}

/** TWO SPRINTS IN ONE WAVE WHOSE DATES CROSS.
 *
 * A WARNING, NEVER A REFUSAL (Aurora's ruling). Each pair is reported once —
 * `b.id > a.id` is what makes it a pair rather than the same clash said twice —
 * and a sprint missing either date cannot clash with anything, because "we have
 * not dated it yet" is not an overlap. */
async function waveOverlaps(
  cfg: D1Rest,
  guard: MemberGuard,
  waveId: string
): Promise<WaveOverlap[]> {
  const rows = await d1Query<{
    first_id: string
    first_name: string
    second_id: string
    second_name: string
  }>(
    cfg,
    guard.databaseId,
    // Bounded like every other read here: a package holds a handful of sprints,
    // so the pairs between them are a handful too.
    `SELECT a.id AS first_id, a.name AS first_name, b.id AS second_id, b.name AS second_name
       FROM sprints a
       JOIN sprints b ON b.wave_id = a.wave_id AND b.id > a.id
      WHERE a.wave_id = ${sqlString(waveId)}
        AND a.deactivated_at IS NULL AND b.deactivated_at IS NULL
        AND a.starts_on IS NOT NULL AND a.ends_on IS NOT NULL
        AND b.starts_on IS NOT NULL AND b.ends_on IS NOT NULL
        AND a.starts_on <= b.ends_on
        AND b.starts_on <= a.ends_on
      ORDER BY a.starts_on, b.starts_on
      LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map((r) => ({
    firstId: r.first_id,
    firstName: r.first_name,
    secondId: r.second_id,
    secondName: r.second_name,
  }))
}

/* ------------------------------- the dates --------------------------------- */

/** THE ONE PLACE A WAVE'S DATES ARE DECIDED — the earliest start and the latest
 * end of the LIVE sprints in it, written onto the row.
 *
 * Called by every write that could move them, which is what makes "derived" and
 * "stored" the same sentence rather than two that drift apart. A wave with no
 * dated sprints gets NULL for both, and that is the point of doing it in one
 * statement: a wave whose last sprint just left must LOSE its dates, and an
 * update that only ever wrote a value would leave the old pair sitting there
 * looking exactly like a real answer.
 *
 * A deactivated sprint is not in the package any more, so it does not date it —
 * the same reading `sprintCount` takes. */
export async function recalcWaveDates(
  cfg: D1Rest,
  guard: MemberGuard,
  waveId: string
): Promise<{ startsOn: string | null; endsOn: string | null }> {
  const rows = await d1Query<{ starts_on: string | null; ends_on: string | null }>(
    cfg,
    guard.databaseId,
    `UPDATE waves
        SET starts_on = (SELECT MIN(s.starts_on) FROM sprints s
                          WHERE s.wave_id = waves.id AND s.deactivated_at IS NULL),
            ends_on   = (SELECT MAX(s.ends_on) FROM sprints s
                          WHERE s.wave_id = waves.id AND s.deactivated_at IS NULL)
      WHERE id = ${sqlString(waveId)}
      RETURNING starts_on, ends_on`
  )
  return { startsOn: rows[0]?.starts_on ?? null, endsOn: rows[0]?.ends_on ?? null }
}

/* ------------------------------- writing them ------------------------------ */

/** SELL A WAVE. It is born with a name, a client and (usually) a sentence saying
 * what the package is for — and with no sprints, which is the ordinary case
 * rather than an incomplete one. */
export async function createWave(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { accountId: string; name: string; goal: string | null }
): Promise<{ id: string }> {
  assertAccountInScope(scope, input.accountId)
  const id = ulid()
  const now = new Date().toISOString()
  // THE UNIQUENESS RIDES THE WRITE (CONCURRENCY.md): a partial unique index over
  // the live rows means a duplicate name is refused by the database rather than
  // by a count-then-insert that two clicks can both pass.
  try {
    await d1Query(
      cfg,
      guard.databaseId,
      `INSERT INTO waves (id, account_id, name, goal, ${AUDIT_CREATE})
       VALUES (${sqlString(id)}, ${sqlString(input.accountId)}, ${sqlString(input.name)},
               ${sqlString(input.goal)}, ${auditCreateValues(actor, now)})`
    )
  } catch (e) {
    throw duplicateOr(e, input.name)
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "created",
    description: `Sold the wave ${input.name}`,
    relatedTable: "waves",
    relatedRowId: id,
  })
  return { id }
}

/** Rename a wave, or re-word what it is for. The DATES are deliberately not
 * writable: they are the sprints' answer, not a field somebody can type over. */
export async function updateWave(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; name: string; goal: string | null }
): Promise<{ accountId: string }> {
  const accountId = await ownerOf(cfg, guard, "waves", input.id)
  if (!accountId) throw new GuardError(404, "not_found", "That's not there anymore.")
  assertAccountInScope(scope, accountId)
  const now = new Date().toISOString()
  try {
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE waves
          SET name = ${sqlString(input.name)},
              goal = ${sqlString(input.goal)},
              ${auditEditSet(actor, now)}
        WHERE id = ${sqlString(input.id)}`
    )
  } catch (e) {
    throw duplicateOr(e, input.name)
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "updated",
    description: `Updated the wave ${input.name}`,
    relatedTable: "waves",
    relatedRowId: input.id,
  })
  return { accountId }
}

/** R17 — the current-status predicate rides the UPDATE, so a second click moves
 * zero rows, writes no activity row and pings nobody.
 *
 * THE FENCE IS CHECKED FIRST, and that ordering is load-bearing: "zero rows
 * moved" answers two completely different questions — "it was already like that"
 * (a 200 no-op) and "that row isn't yours" (a 404) — and collapsing them would
 * tell a caller probing another client's waves "ok". */
export async function setWaveActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; active: boolean }
): Promise<{ moved: boolean; accountId: string }> {
  const accountId = await ownerOf(cfg, guard, "waves", input.id)
  if (!accountId) throw new GuardError(404, "not_found", "That's not there anymore.")
  assertAccountInScope(scope, accountId)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    input.active
      ? `UPDATE waves SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
             deactivator_name = NULL, ${auditEditSet(actor, now)}
          WHERE id = ${sqlString(input.id)} AND deactivated_at IS NOT NULL
          RETURNING id`
      : `UPDATE waves SET deactivated_at = ${sqlString(now)}, deactivator_id = ${sqlString(actor.id)},
             deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)},
             ${auditEditSet(actor, now)}
          WHERE id = ${sqlString(input.id)} AND deactivated_at IS NULL
          RETURNING id`
  )
  if (!changed[0]) return { moved: false, accountId }
  await logActivity(cfg, guard.databaseId, actor, {
    type: input.active ? "reactivated" : "deactivated",
    description: input.active ? "Brought a wave back" : "Switched a wave off",
    relatedTable: "waves",
    relatedRowId: input.id,
  })
  return { moved: true, accountId }
}

/** PUT A SPRINT IN A WAVE, OR TAKE IT OUT — `waveId: null` is the take-out, and
 * it is the same door on purpose, because it is the same decision said the other
 * way round.
 *
 * THREE THINGS HAPPEN HERE AND ALL THREE MATTER:
 *
 *   • A SPRINT FROM ANOTHER CLIENT IS REFUSED. The account fence stops a caller
 *     REACHING another client's rows; it does not stop a staff member — who can
 *     see both — writing one client's sprint into another client's package. That
 *     would put Bergman's work inside something Confia bought, silently, since a
 *     wave's screen only ever shows the sprint's NAME.
 *
 *   • THE DATES OF BOTH WAVES ARE RECALCULATED. Moving a sprint from one package
 *     to another changes what BOTH of them run between, and a recalc of only the
 *     destination would leave the wave it left holding a date no sprint in it
 *     has any more.
 *
 *   • THE OVERLAP IS REPORTED, NOT REFUSED. See the file header and
 *     `waveOverlaps`. The write has already landed by the time this is read. */
export async function setSprintWave(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { sprintId: string; waveId: string | null }
): Promise<{
  moved: boolean
  accountId: string | null
  previousWaveId: string | null
  overlaps: WaveOverlap[]
}> {
  const sprint = await d1Query<{ account_id: string | null; wave_id: string | null; name: string }>(
    cfg,
    guard.databaseId,
    `SELECT account_id, wave_id, name FROM sprints WHERE id = ${sqlString(input.sprintId)}`
  )
  if (!sprint.length) throw new GuardError(404, "not_found", "That sprint isn't there anymore.")
  const sprintAccountId = sprint[0].account_id
  const previousWaveId = sprint[0].wave_id
  // A sprint that belongs to a client is fenced by that client. One sold against
  // no client at all — our own work — belongs in no package, and saying so here
  // is cheaper than a wave with a null account fence nobody can reason about.
  if (sprintAccountId) assertAccountInScope(scope, sprintAccountId)

  if (input.waveId) {
    const waveAccountId = await ownerOf(cfg, guard, "waves", input.waveId)
    if (!waveAccountId) throw new GuardError(404, "not_found", "That wave isn't there anymore.")
    assertAccountInScope(scope, waveAccountId)
    if (waveAccountId !== sprintAccountId)
      throw new GuardError(
        400,
        "wrong_client",
        "That sprint belongs to a different client, so it can't go in this wave."
      )
  }

  const target = input.waveId ? sqlString(input.waveId) : "NULL"
  // R17 — the current-state predicate rides the UPDATE. `IS NOT` rather than
  // `<>` so that both directions are null-safe: putting a loose sprint into a
  // wave, and taking a placed one back out, are the same statement.
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE sprints SET wave_id = ${target}
      WHERE id = ${sqlString(input.sprintId)} AND wave_id IS NOT ${target}
      RETURNING id`
  )
  const moved = Boolean(changed[0])

  // BOTH ENDS, and only the ones that exist. Recalculating on a no-op costs a
  // statement and answers the same as before, so it is skipped with everything
  // else a zero-row move skips.
  if (moved) {
    for (const id of [previousWaveId, input.waveId].filter((x): x is string => Boolean(x)))
      await recalcWaveDates(cfg, guard, id)
    await logActivity(cfg, guard.databaseId, actor, {
      type: "updated",
      description: input.waveId
        ? `Put the sprint ${sprint[0].name} in a wave`
        : `Took the sprint ${sprint[0].name} out of its wave`,
      relatedTable: "sprints",
      relatedRowId: input.sprintId,
    })
  }

  return {
    moved,
    accountId: sprintAccountId,
    previousWaveId,
    overlaps: input.waveId ? await waveOverlaps(cfg, guard, input.waveId) : [],
  }
}
