// GOOGLE BRINGS ITSELF IN — the sweep that runs without anybody pressing
// anything.
//
// THE RULING (owner, 19 Aug 2026): "If this means smoother and faster things
// without human intervention for call transcripts or a change in state for any
// file… then yes. Whatever makes it more seamless is better. Go for it, as long
// as you are sure that the mechanism is robust and we don't have duplications."
//
// WHY THIS IS A LOOP OVER PEOPLE, and could never have been anything else.
// Every Google read in this app uses ONE PERSON'S OWN connection
// (`accessTokenFor` → `google_connections WHERE user_id = ?`), so what it can
// see is exactly what that person can see. There is no team-wide Google
// credential and deliberately never was — the alternative is an agency-wide
// service account that can read every mailbox on the domain, which is a far
// larger thing to hold than anything this product needs. So an automatic sweep
// is a loop over connected people, acting as each in turn.
//
// THE POSTURE THIS CHANGES, said plainly. Before this, the server used somebody's
// Google connection only while they were in the app. Now it uses it on a
// schedule, including while they are asleep. Nothing it can reach is new — the
// token's scopes are the same ones they granted — but WHEN it reaches it is. The
// owner asked for exactly this and it is recorded here rather than in a commit
// message, because it is the sentence somebody will want to find later.
//
// WHY THERE ARE NO DUPLICATES, and it is structural rather than careful:
//
//   • A TRANSCRIPT is claimed by an UPDATE carrying its own precondition —
//     `WHERE id = ? AND transcript_captured_at IS NULL RETURNING id` — so two
//     ticks, or a tick racing the manual button, produce one capture and one
//     "already been read". The second writes nothing, logs nothing and pings
//     nothing (`captureTranscript`).
//   • The KNOWLEDGE BASE upserts on `(origin_table, origin_row_id)` and re-indexes
//     only when the content HASH changes (`sweepKind`), so sweeping the same
//     meeting twice costs a read and writes nothing.
//   • The WORK LOGS a capture writes are guarded by the same claim: they are
//     written inside the branch that won the UPDATE, so they cannot double.
//
// So the honest answer to "are you sure?" is that nothing here is trusted to run
// once. Every write is idempotent at the database, and the test beside this file
// runs the whole sweep twice to prove it.
//
// BOUNDED THREE WAYS, because a cron that can grow is a cron that will:
// people per team per tick, meetings per person per tick, and a HORIZON past
// which a meeting is abandoned. The horizon is the important one — without it a
// meeting whose transcript never appears is retried every fifteen minutes
// forever, and the newest meetings queue behind a backlog that can never drain.

import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import type { Actor } from "@shared/workers/activity"
import type { MemberGuard } from "@shared/workers/gating"
import {
  GOOGLE_SWEEP_PEOPLE_PER_TICK,
  TRANSCRIPT_HORIZON_DAYS,
  TRANSCRIPT_SWEEP_PER_PERSON,
} from "@shared/workers/limits"
import type { Env } from "../env"
import { captureTranscript } from "./meetings"
import { sweepGoogle } from "./knowledge-google"

export type AutopilotResult = {
  /** how many connected people this tick acted as */
  people: number
  /** transcripts newly captured (a try that found nothing is not one) */
  captured: number
  /** every failure, one per person, so a broken connection cannot hide the rest */
  errors: { userId: string; where: string; message: string }[]
}

/** WHO IN THIS TEAM HAS A LIVE GOOGLE CONNECTION, oldest-swept first.
 *
 * `last_used_at ASC NULLS FIRST` is what makes this a ROTATION rather than a
 * queue: with more connected people than a tick can hold, the ones waiting
 * longest go first and everybody comes round. Sorting by id instead would mean
 * the same five people swept forever and the sixth never. */
async function peopleToSweep(cfg: D1Rest, guard: MemberGuard): Promise<string[]> {
  const rows = await d1Query<{ user_id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — GOOGLE_SWEEP_PEOPLE_PER_TICK, and the ordering is what
    // guarantees the ones it skips are reached by a later tick.
    `SELECT user_id, MIN(COALESCE(last_used_at, '')) AS oldest
       FROM google_connections
      WHERE deactivated_at IS NULL AND refresh_token <> ''
      GROUP BY user_id
      ORDER BY oldest ASC, user_id ASC
      LIMIT ${GOOGLE_SWEEP_PEOPLE_PER_TICK}`
  )
  return rows.map((r) => r.user_id)
}

/** THE MEETINGS THIS PERSON'S TICK WILL TRY, newest first.
 *
 * NEWEST first, unlike the people rotation, and for the opposite reason: a
 * transcript appears within minutes of a call ending, so the meeting most likely
 * to have one waiting is the one that just finished. Working forwards from the
 * oldest would put every new call behind the backlog.
 *
 * The horizon is in the WHERE, so an abandoned meeting stops being selected
 * rather than being selected and skipped. */
async function meetingsToTry(cfg: D1Rest, guard: MemberGuard, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - TRANSCRIPT_HORIZON_DAYS * 86_400_000).toISOString()
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — TRANSCRIPT_SWEEP_PER_PERSON.
    `SELECT id FROM meetings
      WHERE google_event_id IS NOT NULL AND google_event_id <> ''
        AND transcript_captured_at IS NULL
        AND starts_at >= ? AND starts_at <= ?
        AND deactivated_at IS NULL
      ORDER BY starts_at DESC
      LIMIT ${TRANSCRIPT_SWEEP_PER_PERSON}`,
    [since, now.toISOString()]
  )
  return rows.map((r) => r.id)
}

/** One team's tick: act as each connected person, bring their Google material in
 * and read any transcript that has appeared since.
 *
 * NOTHING THROWS OUT OF HERE. One person's expired token must not stop the
 * person after them, and one team's broken database must not stop the next team
 * — so every failure is caught, named and returned for the caller to record
 * (R12). The caller decides what to do with them; this decides nothing. */
export async function googleAutopilot(
  env: Env,
  cfg: D1Rest,
  team: { id: string; databaseId: string },
  now: Date
): Promise<AutopilotResult> {
  const base = { teamId: team.id, roleId: "system", databaseId: team.databaseId }
  const errors: AutopilotResult["errors"] = []
  let captured = 0

  let people: string[] = []
  try {
    people = await peopleToSweep(cfg, { ...base, userId: "system:google-autopilot" } as MemberGuard)
  } catch (e) {
    errors.push({ userId: "-", where: "list connections", message: String(e) })
    return { people: 0, captured, errors }
  }

  for (const userId of people) {
    // THE GUARD IS THE PERSON. This is the whole mechanism: from here down, every
    // read is theirs, fenced by their own connection and their own team.
    const guard = { ...base, userId } as MemberGuard
    const actor: Actor = { id: userId, email: "", name: "Automatic sync" }

    try {
      // Their Google material — documents, mail, calendar entries, messages.
      // No `onlyIfStale`: the five-minute floor exists to stop a BROWSER asking
      // twice on one page load, and a tick that already waited fifteen minutes
      // has nothing to be protected from.
      await sweepGoogle(env, cfg, guard)
    } catch (e) {
      errors.push({ userId, where: "google sweep", message: String(e) })
    }

    try {
      for (const meetingId of await meetingsToTry(cfg, guard, now)) {
        try {
          // A try that finds nothing writes nothing and will be tried again next
          // tick, until the horizon passes. That is the same behaviour the manual
          // button has always had.
          const result = await captureTranscript(env, cfg, guard, actor, meetingId)
          if (result.captured) captured += 1
        } catch (e) {
          // ONE MEETING'S FAILURE IS ONE MEETING'S. A calendar entry this person
          // cannot open is the ordinary case, not an incident — they are simply
          // not the one who can fetch it, and somebody else's tick will.
          errors.push({ userId, where: `transcript ${meetingId}`, message: String(e) })
        }
      }
    } catch (e) {
      errors.push({ userId, where: "list meetings", message: String(e) })
    }
  }

  return { people: people.length, captured, errors }
}
