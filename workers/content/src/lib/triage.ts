// TRIAGE (.plans/BUILD-1 §6) — whose week it is, and what has been sitting.
//
// TWO SENTENCES, and the second one is the whole design:
//   • "One named person is on triage duty, and it is visible whose week it is."
//   • "A ticket sitting in New for three days appears on a needs-triage list and
//     in the morning digest. INTERNAL NUDGE ONLY — nothing client-facing, no SLA
//     promise."
//
// That second clause is why nothing here ever reaches a client. A ticket that has
// been sitting is our failure, not their business, and telling them about it
// would turn an internal prompt into a promise we never made. The digest goes to
// the person on duty; the list is a screen only staff can open.

import { triageGaps, type TriageGap } from "@shared/triage-readiness"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { logActivity, type Actor } from "@shared/workers/activity"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { LIST_HARD_CAP } from "@shared/workers/limits"

/** How long a ticket may sit unread before it is somebody's problem out loud.
 * Three days is the owner's number, and it is deliberately not an SLA: nothing
 * client-facing reads it, and no promise anywhere depends on it. */
export const TRIAGE_AFTER_DAYS = 3

/** THE MONDAY a date falls in, as an ISO date. The rota's key, computed in one
 * place so a duty set on Wednesday and a digest read on Friday agree about which
 * week they are talking about.
 *
 * ISO weeks start on Monday, and so does the working week this rota describes —
 * `getUTCDay()` returns 0 for Sunday, which would otherwise put Sunday in the
 * week that is about to start rather than the one just ending. */
export function weekStart(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  const dayFromMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayFromMonday)
  return d.toISOString().slice(0, 10)
}

export type TriageView = {
  /** whose week it is, or null when nobody has been named yet */
  onDuty: { userId: string; userName: string | null; weekStart: string } | null
  /** the tickets that have been sitting in `new` past the threshold, each
   * carrying WHAT IS STILL MISSING before it may be triaged (shared/triage-
   * readiness.ts). The gaps ride the row rather than being worked out on the
   * screen, because the DOOR refuses by the same function — a queue that drew
   * its own conclusion could offer a button the door would reject. */
  waiting: {
    id: string
    ref: string | null
    description: string
    createdAt: string
    days: number
    missing: TriageGap[]
    /** The four readiness fields themselves, so the queue can open an edit form
     * already filled in rather than fetching the ticket back one row at a time.
     * They are read for `missing` anyway — carrying them costs nothing. */
    helpType: string | null
    accountId: string | null
    appId: string | null
    /** …and the SECTION, which is not a readiness gap (a ticket about no app has
     * no section to name) but is carried for the same reason as the four above:
     * the queue opens a prefilled edit form, and a form that shows "no module"
     * on a ticket that has one is telling somebody something untrue. */
    moduleId: string | null
    raisedByContactId: string | null
  }[]
  /** R16: the exact server count of those, over the same question */
  total: number
  /** IS THIS CALLER THE ONE ON DUTY (CHECKLIST 5.11: "only the person on duty
   * sees what is waiting to be triaged")? Answered by the door rather than
   * computed in the browser from `onDuty.userId`, because it decides whether
   * `waiting` is populated at all — a screen that filtered a list it had already
   * been handed would be a curtain, not a rule. Admins count as on duty, or a
   * week nobody was named for would be a week nobody could triage. */
  yours: boolean
}

/** Who is on triage duty for the week containing `at`. */
export async function dutyFor(
  cfg: D1Rest,
  guard: MemberGuard,
  at: Date
): Promise<TriageView["onDuty"]> {
  const week = weekStart(at)
  const rows = await d1Query<{ user_id: string; user_name: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT user_id, user_name FROM triage_duty WHERE week_start = ? LIMIT 1`, // R14: one row by key
    [week]
  )
  return rows[0] ? { userId: rows[0].user_id, userName: rows[0].user_name, weekStart: week } : null
}

/** THE NEEDS-TRIAGE LIST: tickets nobody has read yet, past the threshold, oldest
 * first — because the oldest is the one that has been ignored longest, which is
 * the only ordering this list can honestly have.
 *
 * NO ACCOUNT FENCE, and there must not be one: every door that reaches this
 * refuses a client login (routes/triage.ts). A client seeing "your request has
 * been sitting untouched for four days" is the SLA promise §6 says we are not
 * making. */
export async function needsTriage(
  cfg: D1Rest,
  guard: MemberGuard,
  at: Date
): Promise<{ waiting: TriageView["waiting"]; total: number }> {
  const cutoff = new Date(at.getTime() - TRIAGE_AFTER_DAYS * 86_400_000).toISOString()
  const rows = await d1Query<{
    id: string
    ref: string | null
    description: string
    created_at: string
    help_type: string | null
    account_id: string | null
    app_id: string | null
    module_id: string | null
    raised_by_contact_id: string | null
  }>(
    cfg,
    guard.databaseId,
    // `archived_at IS NULL`: a ticket somebody deliberately put away is not one
    // nobody has looked at.
    //
    // The four readiness columns come back with the row so the queue can say
    // WHY a ticket cannot move. Four more columns on a capped read, not a
    // second query.
    `SELECT id, ref, description, created_at, help_type, account_id, app_id, module_id, raised_by_contact_id FROM help
      WHERE status = 'new' AND archived_at IS NULL AND created_at < ?
      ORDER BY created_at ASC LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    [cutoff]
  )
  const counted = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM help WHERE status = 'new' AND archived_at IS NULL AND created_at < ?`,
    [cutoff]
  )
  return {
    waiting: rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      description: r.description,
      createdAt: r.created_at,
      days: Math.floor((at.getTime() - Date.parse(r.created_at)) / 86_400_000),
      missing: triageGaps({
        helpType: r.help_type,
        accountId: r.account_id,
        appId: r.app_id,
        raisedByContactId: r.raised_by_contact_id,
      }),
      helpType: r.help_type,
      accountId: r.account_id,
      appId: r.app_id,
      moduleId: r.module_id,
      raisedByContactId: r.raised_by_contact_id,
    })),
    total: counted[0]?.n ?? 0,
  }
}

/** Name the person on duty for a week.
 *
 * ONE STATEMENT, upsert-shaped, because "one named person" is a promise the
 * database keeps rather than a check code makes: two admins naming two people for
 * the same week at the same instant must end with one name, not two rows and a
 * screen that shows whichever it read first. */
export async function setDuty(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  week: string,
  person: { userId: string; userName: string }
): Promise<void> {
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO triage_duty (id, week_start, user_id, user_name, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(ulid())}, ${sqlString(week)}, ${sqlString(person.userId)}, ${sqlString(person.userName)}, ${sqlString(new Date().toISOString())}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)})
ON CONFLICT(week_start) DO UPDATE SET user_id = excluded.user_id, user_name = excluded.user_name,
  updated_at = excluded.created_at, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)};`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Triage duty set",
    description: `${actor.name} put ${person.userName} on triage duty for the week of ${week}`,
    relatedTable: "triage_duty",
    relatedRowId: week,
  })
}

/** An ISO date (a Monday) off a request, or a clean 400. The rota is keyed by
 * week, so a date in the middle of one is snapped to its Monday rather than
 * refused — a person picking Wednesday means that week. */
export function requireWeek(raw: string | undefined): string {
  if (!raw) return weekStart(new Date())
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) throw new GuardError(400, "invalid_input", "That isn't a date.")
  return weekStart(new Date(ms))
}

/** WHO LOGGED NOTHING LAST WEEK — the weekly nudge (.plans/BUILD-1 §5), asked as
 * one question rather than as one email per person.
 *
 * Deliberately a LIST handed to the person on duty rather than a mail to each
 * person who missed. A nudge that arrives in everybody's inbox every Monday
 * whether or not it is deserved is a nudge people filter, and the whole product
 * has exactly two emails it is allowed to send outside the building precisely
 * because that is what happens to the third one. Inside the building the same
 * reasoning applies with less at stake, so: one message, to one person, naming
 * who to go and ask.
 *
 * `members` comes from the CORE database (the team's own membership); this file
 * only knows the team database, so the caller hands it over. */
export async function loggedNothingLastWeek(
  cfg: D1Rest,
  guard: MemberGuard,
  at: Date,
  members: { userId: string; name: string }[]
): Promise<string[]> {
  if (!members.length) return []
  const thisMonday = weekStart(at)
  const from = new Date(Date.parse(thisMonday) - 7 * 86_400_000).toISOString()
  const rows = await d1Query<{ user_id: string }>(
    cfg,
    guard.databaseId,
    // One row per person who logged ANYTHING in the window — the answer is the
    // complement, computed in memory over a member list that is already bounded.
    `SELECT DISTINCT user_id FROM work_logs
      WHERE discarded_at IS NULL AND started_at >= ? AND started_at < ?
      LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    [from, thisMonday]
  )
  const logged = new Set(rows.map((r) => r.user_id))
  return members.filter((m) => !logged.has(m.userId)).map((m) => m.name)
}
