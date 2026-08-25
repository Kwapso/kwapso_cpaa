// WORK LOGS AND TIMERS — the row of time (.plans/BUILD-1 §5).
//
// The owner named "logging time takes too many clicks" as the single thing most
// likely to make him quietly abandon this and go back to a spreadsheet. One click
// is the acceptance bar, not an aspiration, and the shape of this file is what
// pays for it: A TIMER IS A WORK LOG WITH NO END YET. There is no second table,
// no session object and no state machine — starting is one insert, stopping is
// one update, and the header can ask "what am I running?" with one indexed read.
//
// THE RULES, enforced here rather than at a door, because there is more than one
// way in (the screens, the assistant, the machine surface):
//   • a log attaches to a STORY, a TICKET or a TASK. Nothing else. Never a to-do
//     — that is somebody else's time. Never an account on its own — the owner was
//     explicit, and a figure with no work behind it is one nobody can check;
//   • whole seconds, always, computed from the two timestamps rather than trusted
//     from a caller;
//   • parallel timers on DIFFERENT targets are fine. The same person on the same
//     target twice is refused by a partial unique index, so two clicks in the
//     same instant cannot both win;
//   • billable is a plain switch, ON by default;
//   • a runaway timer is NEVER stopped for you. It is offered three one-tap
//     answers on Monday morning instead (see resolveRunaway).

import { logActivity, type Actor } from "@shared/workers/activity"
import { boundedInner, countCollection, isCapped, reportedTotal } from "@shared/workers/count"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { LIST_HARD_CAP, WORK_LOG_GROUP_CAP } from "@shared/workers/limits"
import { pulseWeekStarts } from "./insights"
import type { RunningTimer, WorkLog, WorkLogSummary } from "@shared/types"

/** WHAT TIME MAY BE LOGGED AGAINST — the whole allow-list, in one place, and the
 * only place. Each entry names the table, the column its human label lives in,
 * and the column carrying the account the work belongs to (so a log inherits its
 * client rather than being told one).
 *
 * A TO-DO IS DELIBERATELY ABSENT and always will be: a to-do is something we are
 * waiting on the CLIENT for, so the time it takes is theirs, not ours. Logging
 * against one would put somebody else's hours into our margin. An ACCOUNT is
 * absent for the owner's own reason: an account-level-only log is a number with
 * no work behind it, which is a number nobody can check afterwards.
 *
 * workers/content/test/work-logs.test.ts derives its cases from THIS object, so
 * adding a target is one line here and the suite holds it to the same rules. */
export const WORK_LOG_TARGETS: Record<string, { label: string; account: string; noun: string }> = {
  // What WE do. The ordinary case, and the one the margin is computed from.
  stories: { label: "title", account: "account_id", noun: "story" },
  // Reading, triaging and resolving a request is real work, and BUILD-1 §5 is
  // explicit that it must be loggable against the request — which is the only
  // reason tickets are in this list at all.
  help: { label: "description", account: "account_id", noun: "ticket" },
  // OUR OWN ADMIN. Forty minutes on the quarterly VAT return is real time and
  // costs us the same as forty minutes of delivery, so it is loggable — and it
  // is the difference between a task and a to-do, which is never.
  tasks: { label: "title", account: "account_id", noun: "task" },
  // A MEETING IS TIME SOMEBODY SPENT (CHECKLIST 9.2). It was left off this list
  // when Meetings shipped, on the reasoning that a meeting is a conversation
  // rather than a piece of work — which is true and is beside the point: an hour
  // in a call is an hour off the day, and until it was loggable the margin
  // counted the delivery and missed the meetings that produced it.
  //
  // Aurora's ruling narrows WHOSE hour, not whether: a log is written for OUR
  // staff only, never for the client's people, because a client's hour is not
  // our cost. That decision lives in the door that writes them, since it is
  // about the participant rather than about the target.
  meetings: { label: "title", account: "account_id", noun: "meeting" },
}

/** THE KIND EVERY MEETING LOG CARRIES (CHECKLIST 9.3) — "those logs are marked
 * as meeting time, and any figure can be shown with or without them".
 *
 * `kind` is free text on purpose (a team names its own kinds of work), so this
 * is a convention rather than an enum — but it is a convention with exactly one
 * writer and one reader, both of which import this constant, which is what makes
 * "with or without meeting time" a filter and not a guess about a string. */
export const MEETING_LOG_KIND = "Meeting"

/** How long a timer may run before Monday morning offers to do something about
 * it. Six of 2,940 real logs ran past eight hours, the longest 22.6 — rare but
 * real, which is worth a prompt and not worth machinery (BUILD-1 §5). */
export const RUNAWAY_HOURS = 8

type LogRow = {
  id: string
  target_table: string
  target_id: string
  target_label: string | null
  target_ref: string | null
  user_id: string
  user_name: string | null
  kind: string | null
  note: string | null
  started_at: string
  ended_at: string | null
  seconds: number
  billable: number
  discarded_at: string | null
  account_id: string | null
}

/** The label subselect, built from the allow-list rather than hand-written, so a
 * new target cannot be added and left showing an id in every list of time. */
const LABEL_SQL = `CASE ${Object.entries(WORK_LOG_TARGETS)
  .map(([table, def]) => `WHEN w.target_table = '${table}' THEN (SELECT t.${def.label} FROM ${table} t WHERE t.id = w.target_id)`)
  .join(" ")} END`

/** THE SHORT REFERENCE beside the label, built the same way and for the same
 * reason. Every one of the four targets carries a `ref` (`lib/refs.ts` mints
 * `BERG-T0412`, `BERG-S0188`, …), it is drawn on all five of their own screens,
 * and the one place it never reached was the running timer — where a person
 * with two clocks going has nothing but two durations to tell them apart.
 *
 * It is NULLABLE and often null on purpose: a ref needs an account with a short
 * code, so the agency's own internal work has none. Callers fall back to the
 * label, which is why this is an extra column rather than a replacement. */
const REF_SQL = `CASE ${Object.keys(WORK_LOG_TARGETS)
  .map((table) => `WHEN w.target_table = '${table}' THEN (SELECT t.ref FROM ${table} t WHERE t.id = w.target_id)`)
  .join(" ")} END`

const LOG_COLS = `w.id, w.target_table, w.target_id, w.user_id, w.user_name, w.kind, w.note,
  w.started_at, w.ended_at, w.seconds, w.billable, w.discarded_at, w.account_id,
  ${LABEL_SQL} AS target_label, ${REF_SQL} AS target_ref`

function toLog(r: LogRow): WorkLog {
  return {
    id: r.id,
    targetTable: r.target_table,
    targetId: r.target_id,
    targetLabel: r.target_label,
    targetRef: r.target_ref,
    userId: r.user_id,
    userName: r.user_name,
    kind: r.kind,
    note: r.note,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    seconds: r.seconds,
    billable: r.billable === 1,
    discarded: r.discarded_at != null,
    accountId: r.account_id,
  }
}

/** Whole seconds between two moments, never negative and never fractional. The
 * caller does not get to say how long something took: an end before a start is a
 * clock skew or a typo, and zero is the honest answer to both. */
export function secondsBetween(startedAt: string, endedAt: string): number {
  const from = Date.parse(startedAt)
  const to = Date.parse(endedAt)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.floor((to - from) / 1000))
}

/** Prove the thing being logged against EXISTS, and inherit the account it hangs
 * off. Both in one read, because they are one question: "is this real, and whose
 * is it?" An unchecked target would mint hours against a row nobody can find,
 * which is time that shows up in a total and nowhere else. */
async function targetOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  table: string,
  id: string
): Promise<{ accountId: string | null }> {
  // hasOwnProperty, not bare bracket access: `?targetTable=__proto__` finds
  // Object.prototype, reads as truthy, and turns a clean 400 into a 500.
  const def = Object.prototype.hasOwnProperty.call(WORK_LOG_TARGETS, table)
    ? WORK_LOG_TARGETS[table]
    : undefined
  if (!def)
    throw new GuardError(
      400,
      "invalid_target",
      `Time is logged against a ${Object.values(WORK_LOG_TARGETS).map((t) => t.noun).join(", a ")}, nothing else.`
    )
  const rows = await d1Query<{ account_id: string | null }>(
    cfg,
    guard.databaseId,
    // The table and column names are code literals from the allow-list above —
    // never request values. The id is bound.
    `SELECT ${def.account} AS account_id FROM ${table} WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows[0]) throw new GuardError(404, "target_not_found", "That piece of work doesn't exist.")
  return { accountId: rows[0].account_id }
}

/** The filters the list door parses (R19's derivation input). */
export type LogFilter = {
  targetTable?: string
  targetId?: string
  userId?: string
  /** "mine" narrows to the caller — the everyday "what have I done today". */
  scope?: "mine" | "all"
  /** WITH OR WITHOUT MEETING TIME (CHECKLIST 9.3). "exclude" drops every log
   * marked as a meeting, "only" keeps nothing else, and absent means all of it.
   * It rides the list AND the two totals beside it, so the hours under a
   * filtered list are the hours OF that list (R16). */
  meetingTime?: "exclude" | "only"
}

function logWhere(guard: MemberGuard, filter: LogFilter): { sql: string; params: string[] } {
  // Discarded rows are never in a list of time. They survive on the table for the
  // audit — who binned a runaway timer, and when — and nothing else reads them.
  const parts = ["w.discarded_at IS NULL"]
  const params: string[] = []
  // 9.3 — the one place the convention is read, matching the one place it is
  // written. A log with no kind at all is not meeting time, which is why the
  // "exclude" arm has to say so: `kind <> 'Meeting'` alone would silently drop
  // every log whose kind is NULL, which is most of them.
  if (filter.meetingTime === "exclude") {
    parts.push("(w.kind IS NULL OR w.kind <> ?)")
    params.push(MEETING_LOG_KIND)
  } else if (filter.meetingTime === "only") {
    parts.push("w.kind = ?")
    params.push(MEETING_LOG_KIND)
  }
  if (filter.scope === "mine") {
    parts.push("w.user_id = ?")
    params.push(guard.userId)
  } else if (filter.userId) {
    parts.push("w.user_id = ?")
    params.push(filter.userId)
  }
  if (filter.targetTable) {
    parts.push("w.target_table = ?")
    params.push(filter.targetTable)
  }
  if (filter.targetId) {
    parts.push("w.target_id = ?")
    params.push(filter.targetId)
  }
  return { sql: parts.join(" AND "), params }
}

/** THE SORT: newest first, which for time is the only order anybody wants. The id
 * breaks ties so the order is TOTAL, which is what the keyset cursor needs. */
const LOG_ORDER = "w.started_at"

/** R14 GROWING collection: work logs are keyset-PAGED. 2,940 arrived from two
 * years of the previous system and the rate only goes up — a ceiling here would
 * eventually be a refusal to show somebody their own week. */
export async function listWorkLogs(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: LogFilter,
  cursor: string | null
): Promise<Page<WorkLog>> {
  const pos = decodeCursor(cursor)
  const after = keysetAfter(pos, LOG_ORDER)
  const where = logWhere(guard, filter)
  const clauses = [where.sql, ...(after.sql ? [after.sql] : [])]
  const rows = await d1Query<LogRow>(
    cfg,
    guard.databaseId,
    // LIMIT is PAGE_SIZE + 1 — the extra row is how hasMore is known (R14).
    `SELECT ${LOG_COLS} FROM work_logs w WHERE ${clauses.join(" AND ")}
      ORDER BY ${LOG_ORDER} DESC, w.id DESC LIMIT ${PAGE_SIZE + 1}`,
    [...where.params, ...after.params]
  )
  const page = toPage(rows, PAGE_SIZE, (r) => [r.started_at, r.id])
  return { ...page, rows: page.rows.map(toLog) }
}

/** The COUNT and the SUM, over the SAME filter the page came from. Both, because
 * a list of time is one of the few collections where the number a person cares
 * about is not how many rows there are.
 *
 * AND THE TWO NUMBERS ARE COUNTED DIFFERENTLY, which is the whole point of this
 * function keeping its own statement instead of using the seam:
 *
 *   • `total` is a BADGE. R16's amendment applies — counted exactly to
 *     TOTAL_COUNT_CAP, then reported as "at least", because past a million rows
 *     the badge renders "1m+" either way.
 *   • `totalSeconds` is BILLABLE TIME, and it stays EXACT. It is not a display
 *     tally; it is the number an invoice is argued about. Wrapping it in the
 *     bounded subquery beside the count would have made it a PARTIAL SUM of hours,
 *     silently, with nothing on screen to say so — a display cap quietly becoming
 *     a billing error. The two numbers happened to share a statement; they never
 *     shared a purpose.
 *
 * Still ONE round trip: two scalar subqueries in one statement, so the split costs
 * nothing but the repeated parameters. */
export async function countWorkLogs(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: LogFilter
): Promise<{ total: number; totalSeconds: number }> {
  const where = logWhere(guard, filter)
  const rows = await d1Query<{ n: number; s: number | null }>(
    cfg,
    guard.databaseId,
    `SELECT (SELECT COUNT(*) FROM ${boundedInner(`SELECT 1 FROM work_logs w WHERE ${where.sql}`)}) AS n,
            (SELECT SUM(w.seconds) FROM work_logs w WHERE ${where.sql}) AS s`,
    [...where.params, ...where.params]
  )
  return {
    total: reportedTotal(rows[0]?.n ?? 0),
    totalSeconds: Math.max(0, Math.round(rows[0]?.s ?? 0)),
  }
}

/** THE NUMBERS ON TOP OF A LIST OF TIME — the same question the list asks, asked
 * in aggregate instead of row by row.
 *
 * WHY A DOOR AND NOT ARITHMETIC IN THE BROWSER. The list under it is a PAGE
 * (R14): a story worked on for a year has more rows of time than any page holds,
 * so summing the loaded fifty would produce "23 hours" on a record with 140 —
 * a number that looks exactly like an answer and is not one. Every figure below
 * is computed in SQL over the WHOLE filter, which is the same filter the page
 * came from, so the total above the list and the rows inside it are one question
 * (R16).
 *
 * FIVE READS, and each is bounded at both ends:
 *   • the count and the exact seconds, through `countWorkLogs` — no second way
 *     to count anything, so the badge and this header can never disagree;
 *   • HOW MANY PEOPLE, through the same bounded seam every other collection count
 *     goes through. Its own read rather than `people.length`, because that array
 *     is the top `WORK_LOG_GROUP_CAP` and its length is a CEILING: a record
 *     worked on by eighty people answered "50" for ever, with nothing saying it
 *     had stopped, which is exactly the failure R16 names first;
 *   • BY PERSON and BY KIND OF WORK: grouped, ordered by size, `WORK_LOG_GROUP_CAP`
 *     rows each (R14). A team has tens of people and a dropdown has tens of
 *     words, so the cap is a ceiling on a pathological row rather than a real
 *     limit — and a cap is what makes that a fact rather than a hope;
 *   • WEEK BY WEEK, over the SAME eight windows Home draws, through the same
 *     `pulseWeekStarts`. Reused rather than restated because "which Monday opens
 *     this week" written twice is two definitions that drift at a year boundary
 *     — the exact trap `weeklySeconds` was written to avoid. One row by
 *     construction: conditional sums with no GROUP BY.
 *
 * NOTHING HERE IS MONEY. A work log's cost is derived, and it is derived in the
 * one file R24 fences (`internal-money.ts`) — this summary counts hours and never
 * reaches into it, so no screen built on it can put an internal rate in front of
 * anybody.
 */
export async function summariseWorkLogs(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: LogFilter,
  now: Date
): Promise<WorkLogSummary> {
  const where = logWhere(guard, filter)
  const starts = pulseWeekStarts(now)
  const weekSums: string[] = []
  const weekParams: string[] = []
  starts.forEach((start, i) => {
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 7)
    weekSums.push(
      `SUM(CASE WHEN w.started_at >= ? AND w.started_at < ? THEN w.seconds ELSE 0 END) AS w${i}`
    )
    weekParams.push(start.toISOString(), end.toISOString())
  })

  const [counts, peopleTotal, people, kinds, weekRows] = await Promise.all([
    countWorkLogs(cfg, guard, filter),
    // HOW MANY PEOPLE, exactly — one row per distinct person, counted through the
    // one bounded seam (R16). The same WHERE as everything else here, so the
    // figure and the bars under it are one question.
    countCollection(
      cfg,
      guard.databaseId,
      `SELECT w.user_id FROM work_logs w WHERE ${where.sql} GROUP BY w.user_id`,
      where.params
    ),
    d1Query<{ user_id: string; user_name: string | null; s: number | null }>(
      cfg,
      guard.databaseId,
      `SELECT w.user_id, MAX(w.user_name) AS user_name, SUM(w.seconds) AS s
         FROM work_logs w WHERE ${where.sql}
        GROUP BY w.user_id ORDER BY s DESC LIMIT ${WORK_LOG_GROUP_CAP}`, // R14 hard cap
      where.params
    ),
    d1Query<{ kind: string | null; s: number | null }>(
      cfg,
      guard.databaseId,
      // A log with no kind is its own bucket rather than a dropped row: most time
      // is logged without one, and a chart that quietly omitted it would be a
      // picture of the minority.
      `SELECT w.kind, SUM(w.seconds) AS s
         FROM work_logs w WHERE ${where.sql}
        GROUP BY w.kind ORDER BY s DESC LIMIT ${WORK_LOG_GROUP_CAP}`, // R14 hard cap
      where.params
    ),
    d1Query<Record<string, number | null>>(
      cfg,
      guard.databaseId,
      // R14: one aggregate row — no GROUP BY, so there is nothing else it could be.
      `SELECT ${weekSums.join(", ")} FROM work_logs w WHERE ${where.sql} LIMIT 1`,
      [...weekParams, ...where.params]
    ),
  ])

  const row = weekRows[0] ?? {}
  return {
    total: counts.total,
    // …and it says whether it stopped early, in the same object. This door
    // answers with `json` rather than `pagedJson`, which is the seam that DERIVES
    // this flag for every paged door — so without the line it would be the one
    // total in the app that hedges nowhere but in the browser's rendering.
    totalCapped: isCapped(counts.total),
    totalSeconds: counts.totalSeconds,
    peopleTotal,
    people: people.map((r) => ({
      userId: r.user_id,
      userName: r.user_name ?? null,
      seconds: Math.max(0, Math.round(r.s ?? 0)),
    })),
    kinds: kinds.map((r) => ({
      kind: r.kind ?? null,
      seconds: Math.max(0, Math.round(r.s ?? 0)),
    })),
    weeks: starts.map((start, i) => ({
      weekStart: start.toISOString().slice(0, 10),
      // SUM over no rows is NULL, not 0 — a record nobody has logged time against
      // gets a flat, honest zero line rather than a series of nulls.
      seconds: Math.max(0, Math.round(Number(row[`w${i}`] ?? 0))),
    })),
  }
}

/** EVERY TIMER THIS PERSON HAS RUNNING — what the header asks on every screen.
 *
 * Bounded (R14) and small by nature: a running timer is one per target and a
 * person is working on a handful of things at once. The elapsed count is computed
 * HERE and handed over once; the browser counts up from `startedAt` rather than
 * asking again every second. */
export async function runningTimers(cfg: D1Rest, guard: MemberGuard): Promise<RunningTimer[]> {
  const rows = await d1Query<LogRow>(
    cfg,
    guard.databaseId,
    `SELECT ${LOG_COLS} FROM work_logs w
      WHERE w.user_id = ? AND w.ended_at IS NULL AND w.discarded_at IS NULL
      ORDER BY w.started_at ASC LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    [guard.userId]
  )
  const now = new Date().toISOString()
  return rows.map((r) => {
    const elapsed = secondsBetween(r.started_at, now)
    return {
      id: r.id,
      targetTable: r.target_table,
      targetId: r.target_id,
      targetLabel: r.target_label,
    targetRef: r.target_ref,
      startedAt: r.started_at,
      elapsedSeconds: elapsed,
      runaway: elapsed > RUNAWAY_HOURS * 3600,
    }
  })
}

/** Is this person's "starting a timer stops my others" switch on? Off unless they
 * have said otherwise — a setting that silently stopped your other work would be
 * discovered by losing an hour. */
async function autoStops(cfg: D1Rest, guard: MemberGuard): Promise<boolean> {
  const rows = await d1Query<{ auto_stop: number }>(
    cfg,
    guard.databaseId,
    `SELECT auto_stop FROM work_prefs WHERE user_id = ? LIMIT 1`,
    [guard.userId]
  )
  return rows[0]?.auto_stop === 1
}

export async function setAutoStop(
  cfg: D1Rest,
  guard: MemberGuard,
  on: boolean
): Promise<void> {
  await d1Query(
    cfg,
    guard.databaseId,
    // One statement, upsert-shaped: a person toggling this twice quickly cannot
    // end up with two rows or with none.
    `INSERT INTO work_prefs (user_id, auto_stop, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET auto_stop = excluded.auto_stop, updated_at = excluded.updated_at`,
    [guard.userId, on ? 1 : 0, new Date().toISOString()]
  )
}

/** START A TIMER — the one click.
 *
 * `startedAt` is the server's clock, not the caller's: a browser with a wrong
 * clock would otherwise write hours that never happened, and every sum in the
 * app is built on this column.
 *
 * The double-start race is the DATABASE's answer, not a check: the partial unique
 * index on (user, target) WHERE ended_at IS NULL means two clicks in the same
 * instant produce one timer and one clean refusal, rather than two timers that
 * both look right. */
export async function startTimer(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: { targetTable: string; targetId: string; note?: string; kind?: string }
): Promise<{
  id: string
  accountId: string | null
  /** The timers this start CLOSED, under the caller's own auto-stop-previous
   * setting — each with the account it belongs to, which is not necessarily the
   * new one's: stopping an hour on Bergman to start one on Aurora is the
   * ordinary case. The door publishes one change per row (R1), and a ping
   * carrying the wrong client would fan out to the wrong side. */
  stopped: { id: string; accountId: string | null }[]
}> {
  const { accountId } = await targetOrThrow(cfg, guard, input.targetTable, input.targetId)
  const now = new Date().toISOString()

  // Their own choice, honoured before the new one starts so the header never
  // shows two timers for a person who asked for one.
  const stopped: { id: string; accountId: string | null }[] = []
  if (await autoStops(cfg, guard)) {
    const running = await runningTimers(cfg, guard)
    for (const t of running) {
      const { moved, accountId: was } = await stopTimer(cfg, guard, actor, t.id, null)
      // R17: a timer somebody else's tab stopped in the same instant moved zero
      // rows here, and a row that did not move is not a change to announce.
      if (moved) stopped.push({ id: t.id, accountId: was })
    }
  }

  const id = ulid()
  try {
    await d1ExecScript(
      cfg,
      guard.databaseId,
      `INSERT INTO work_logs (id, account_id, target_table, target_id, user_id, user_name, kind, note,
         started_at, seconds, billable, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(accountId)}, ${sqlString(input.targetTable)}, ${sqlString(input.targetId)}, ${sqlString(actor.id)}, ${sqlString(actor.name)}, ${sqlString(input.kind ?? null)}, ${sqlString(input.note ?? null)}, ${sqlString(now)}, 0, 1, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
    )
  } catch (e) {
    // The unique index did its job: they already have one running on this exact
    // thing. A clean sentence, not a 500 — and NOT a silent success, because a
    // person who thinks they restarted a timer will not check.
    const message = e instanceof Error ? e.message : ""
    if (/UNIQUE|constraint/i.test(message))
      throw new GuardError(409, "already_running", "You already have a timer running on this.")
    throw e
  }
  return { id, accountId, stopped }
}

/** STOP a running timer. `endedAt` lets a person say when it really finished —
 * the "stop it at 5pm" answer to a runaway — and defaults to now.
 *
 * R17: `ended_at IS NULL` rides the UPDATE, so stopping an already-stopped timer
 * moves zero rows, writes no history and re-computes no duration. Two people (or
 * two tabs) pressing stop is one stop. */
export async function stopTimer(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  endedAt: string | null
): Promise<{ moved: boolean; seconds: number; accountId: string | null }> {
  const rows = await d1Query<LogRow>(
    cfg,
    guard.databaseId,
    `SELECT ${LOG_COLS} FROM work_logs w WHERE w.id = ? LIMIT 1`,
    [id]
  )
  const row = rows[0]
  if (!row) throw new GuardError(404, "log_not_found", "That timer doesn't exist.")
  // A timer is a person's OWN. Stopping somebody else's would put a number on
  // their week that they did not put there.
  if (row.user_id !== guard.userId)
    throw new GuardError(403, "not_yours", "That timer belongs to someone else.")

  const end = endedAt ?? new Date().toISOString()
  const seconds = secondsBetween(row.started_at, end)
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE work_logs SET ended_at = ?, seconds = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ? AND ended_at IS NULL RETURNING id`,
    [end, seconds, end, actor.id, actor.email, actor.name, id]
  )
  if (!changed[0]) return { moved: false, seconds: row.seconds, accountId: row.account_id }
  return { moved: true, seconds, accountId: row.account_id }
}

/** MANUAL ENTRY — always available (BUILD-1 §5), because half of real time is
 * remembered rather than clocked. A start and an end, and the duration is
 * computed from them here rather than accepted from the caller. */
export async function logTime(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: {
    targetTable: string
    targetId: string
    startedAt: string
    endedAt: string
    note?: string
    kind?: string
    billable: boolean
  }
): Promise<{ id: string; seconds: number; accountId: string | null }> {
  const { accountId } = await targetOrThrow(cfg, guard, input.targetTable, input.targetId)
  const seconds = secondsBetween(input.startedAt, input.endedAt)
  if (seconds === 0)
    throw new GuardError(400, "invalid_input", "That's no time at all. Check the start and the finish.")

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO work_logs (id, account_id, target_table, target_id, user_id, user_name, kind, note,
       started_at, ended_at, seconds, billable, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(accountId)}, ${sqlString(input.targetTable)}, ${sqlString(input.targetId)}, ${sqlString(actor.id)}, ${sqlString(actor.name)}, ${sqlString(input.kind ?? null)}, ${sqlString(input.note ?? null)}, ${sqlString(input.startedAt)}, ${sqlString(input.endedAt)}, ${seconds}, ${input.billable ? 1 : 0}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  return { id, seconds, accountId }
}

/** EDIT a log: its note, its kind of work, whether it is billable, and its two
 * moments. "Log edits are permission-based and ALWAYS leave a trail" (BUILD-1
 * §5) — the permission is the door's (work:edit), and this is the trail. It is an
 * activity row rather than a version history because the question anybody ever
 * asks of a corrected timesheet is "who changed it and to what", once. */
export async function editWorkLog(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: { startedAt?: string; endedAt?: string; note?: string; kind?: string; billable?: boolean }
): Promise<{ accountId: string | null }> {
  const rows = await d1Query<LogRow>(
    cfg,
    guard.databaseId,
    `SELECT ${LOG_COLS} FROM work_logs w WHERE w.id = ? LIMIT 1`,
    [id]
  )
  const before = rows[0]
  if (!before) throw new GuardError(404, "log_not_found", "That work log doesn't exist.")

  const startedAt = input.startedAt ?? before.started_at
  const endedAt = input.endedAt ?? before.ended_at
  // A RUNNING timer keeps running through an edit: only a stop ends one, so a
  // note typed mid-task cannot accidentally close it.
  const seconds = endedAt ? secondsBetween(startedAt, endedAt) : before.seconds
  const billable = input.billable === undefined ? before.billable === 1 : input.billable

  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE work_logs SET started_at = ?, ended_at = ?, seconds = ?, note = ?, kind = ?, billable = ?,
       updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ?`,
    [
      startedAt,
      endedAt,
      seconds,
      input.note ?? before.note,
      input.kind ?? before.kind,
      billable ? 1 : 0,
      new Date().toISOString(),
      actor.id,
      actor.email,
      actor.name,
      id,
    ]
  )
  // THE TRAIL. Time is the one record in this app that turns into money, so an
  // edit that left no mark would be the one edit worth making quietly.
  const was = Math.round(before.seconds / 60)
  const is = Math.round(seconds / 60)
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Work log edited",
    description:
      was === is
        ? `${actor.name} edited a work log (${is} min)`
        : `${actor.name} changed a work log from ${was} min to ${is} min`,
    relatedTable: "work_logs",
    relatedRowId: id,
  })
  return { accountId: before.account_id }
}

/** THE MONDAY MORNING ANSWER to a timer left running on Friday (BUILD-1 §5).
 *
 * Never automatic. A timer that stopped itself at some clever moment is a number
 * a person did not choose, and the whole reason time is trusted here is that a
 * person chose every one. So the three answers are offered and one is taken:
 *
 *   • "keep"    — it really did run that long. Stop it now, whole.
 *   • "stopAt"  — it ran until a moment they name (five o'clock on Friday).
 *   • "discard" — nothing happened. The row stays, marked binned, with their name
 *                 on the decision; every sum in the app subtracts it.
 *
 * Deactivate-never-delete, in the shape this record needs: an hour that vanished
 * without trace is exactly what a timesheet must never contain. */
export async function resolveRunaway(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  answer: { kind: "keep" } | { kind: "stopAt"; at: string } | { kind: "discard" }
): Promise<{ moved: boolean; accountId: string | null }> {
  if (answer.kind === "discard") {
    const now = new Date().toISOString()
    const changed = await d1Query<{ id: string; account_id: string | null }>(
      cfg,
      guard.databaseId,
      // R17: `discarded_at IS NULL` rides the UPDATE — binning a binned log is
      // not a second event, and the person who ran it is the only one who may.
      `UPDATE work_logs SET discarded_at = ?, ended_at = COALESCE(ended_at, ?), seconds = 0,
         discarder_id = ?, discarder_email = ?, discarder_name = ?
       WHERE id = ? AND user_id = ? AND discarded_at IS NULL RETURNING id, account_id`,
      [now, now, actor.id, actor.email, actor.name, id, guard.userId]
    )
    if (!changed[0]) return { moved: false, accountId: null }
    await logActivity(cfg, guard.databaseId, actor, {
      type: "Work log binned",
      description: `${actor.name} binned a timer that had been left running`,
      relatedTable: "work_logs",
      relatedRowId: id,
    })
    return { moved: true, accountId: changed[0].account_id }
  }
  const at = answer.kind === "stopAt" ? answer.at : null
  const { moved, accountId } = await stopTimer(cfg, guard, actor, id, at)
  return { moved, accountId }
}

/** The allow-list check, over two ALREADY-VALIDATED strings.
 *
 * It takes strings rather than `unknown` on purpose: the type check and the cap
 * belong at the door, where the boundary actually is and where the R20 scan can
 * see them (a seam one function inside is a seam a reader of the door cannot
 * see). What is left here is the question only this file can answer — is that a
 * thing time may be logged against at all? — and the answer must be settled
 * before either value reaches a statement. */
export function requireTarget(
  targetTable: string,
  targetId: string
): { targetTable: string; targetId: string } {
  if (!Object.prototype.hasOwnProperty.call(WORK_LOG_TARGETS, targetTable))
    throw new GuardError(
      400,
      "invalid_target",
      `Time is logged against a ${Object.values(WORK_LOG_TARGETS).map((t) => t.noun).join(", a ")}, nothing else.`
    )
  return { targetTable, targetId }
}

