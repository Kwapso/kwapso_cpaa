// Account-level activity — the user's OWN identity history (name / photo / email
// changes), in the GLOBAL core DB. NOT team-tied: these events belong to the
// person across every team (a teamless user has no team DB to write to anyway).
// The writer is best-effort, modeled on shared/workers/activity.ts: it swallows
// + logs its own failures so a logging hiccup can never break the change it
// describes. The actor is always the user themselves, so there's no Actor arg.

import type { ActivityItem } from "@shared/types"
import { ulid } from "@shared/workers/id"
import { ACCOUNT_ACTIVITY_PER_HOUR } from "@shared/workers/limits"
import { publishUserChange } from "@shared/workers/realtime"
import type { Env } from "../env"

export type AccountEvent = { type: string; description: string }

/** This person's rows in the last hour, as a clause the INSERT carries. */
const WITHIN_HOURLY_CEILING =
  "(SELECT COUNT(*) FROM account_activity WHERE user_id = ? AND created_at > ?) < ?"

/** Append one account-activity row (best-effort — never throws to the caller).
 * Every account-activity write flows through here, so publishing the live event
 * here means email-change / profile / any future identity event all update the
 * user's own account feed across their devices with no per-call wiring.
 *
 * AND IT IS CAPPED PER PERSON. This is a write into the SHARED core database that
 * an ordinary signed-in session can repeat as fast as it can post: setting your
 * first name to "a", then "b", then "a" again appends a row every time and pings
 * your live channel every time. One tenant filling their own database is their
 * business; this one is everybody's. So the hourly ceiling RIDES THE INSERT
 * (CONCURRENCY.md — a read-then-write ceiling is a suggestion under load: N
 * concurrent renames all read "under the line" and all write).
 *
 * Over the line the row is DROPPED, not the change: the profile edit itself has
 * already happened and must not be undone by its own history note. A dropped row
 * publishes nothing either — a live "something changed" pointing at a row that
 * was never written is a ping the feed can only answer with a hole. */
export async function logAccountActivity(
  env: Env,
  userId: string,
  event: AccountEvent
): Promise<void> {
  const id = ulid()
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  let written: { meta: { changes?: number } }
  try {
    written = await env.DB.prepare(
      `INSERT INTO account_activity (id, user_id, type, description, created_at)
       SELECT ?, ?, ?, ?, ?
        WHERE ${WITHIN_HOURLY_CEILING}`
    )
      .bind(
        id,
        userId,
        event.type,
        event.description,
        now.toISOString(),
        userId,
        hourAgo,
        ACCOUNT_ACTIVITY_PER_HOUR
      )
      .run()
  } catch (e) {
    console.error("account activity log failed:", e)
    return
  }
  if ((written.meta.changes ?? 0) === 0) {
    // Worth a line: an ordinary person never reaches sixty identity edits in an
    // hour, so this is either a stuck client or someone leaning on the door.
    console.warn(`account activity ceiling reached for user ${userId}, row dropped`)
    return
  }
  // Live: the actor's own account feed gains this row (best-effort).
  await publishUserChange(env, userId, "account_activity", id, "add")
}

/** The signed-in person's own account history, newest first (capped at 50). */
export async function listAccountActivity(
  env: Env,
  userId: string
): Promise<ActivityItem[]> {
  const rows = await env.DB.prepare(
    `SELECT id, type, description, created_at FROM account_activity
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  )
    .bind(userId)
    .all<{ id: string; type: string; description: string; created_at: string }>()
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    description: r.description,
    actorName: null, // always you — the feed doesn't show an actor line
    createdAt: r.created_at,
  }))
}
