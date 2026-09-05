// Activity log (locked rule #10: log everything — edits, activations,
// deactivations, joins, invites, import stages). One reusable writer every
// module calls; rows live in each team's own `activity` table and point at the
// changed row by a generic (related_table, related_row_id) pair.

import { d1ExecScript, sqlString, type D1Rest } from "./d1-rest"
import { logError } from "./error-log"
import { ulid } from "./id"

export type Actor = { id: string; email: string; name: string }

export type ActivityEntry = {
  /** short machine-ish type, e.g. "Member role changed" */
  type: string
  /** human sentence shown in the feed */
  description: string
  /** which table the activity is about (e.g. "team_members") */
  relatedTable?: string
  /** the row id it's about */
  relatedRowId?: string
}

export type FieldDiff = {
  label: string
  from?: string | null
  to?: string | null
  /** long/rich fields (an article body) log "<label> updated" without the values */
  hideValues?: boolean
}

/** Name exactly WHAT changed in an edit, old → new — so the activity feed answers
 * "which fields, from what, to what" instead of just "X edited Y". Unchanged
 * fields are dropped; values are clipped so the feed stays readable. Returns ""
 * when nothing differs (callers keep their plain sentence then). */
export function describeChanges(fields: FieldDiff[]): string {
  const clip = (v: string) => (v.length > 60 ? `${v.slice(0, 57)}…` : v)
  const parts: string[] = []
  for (const f of fields) {
    const from = (f.from ?? "").trim()
    const to = (f.to ?? "").trim()
    if (from === to) continue
    if (f.hideValues) parts.push(`${f.label} updated`)
    else if (!from) parts.push(`${f.label} set to "${clip(to)}"`)
    else if (!to) parts.push(`${f.label} cleared (was "${clip(from)}")`)
    else parts.push(`${f.label}: "${clip(from)}" → "${clip(to)}"`)
  }
  return parts.join("; ")
}

/** The one INSERT both writers below share — THROWS on failure. Not exported:
 * every caller wants one of the two contracts beneath it, never the raw
 * statement, so there is exactly one way to reach this table from outside a
 * migration. */
async function insertActivity(
  cfg: D1Rest,
  databaseId: string,
  actor: Actor,
  entry: ActivityEntry
): Promise<void> {
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    databaseId,
    `INSERT INTO activity
       (id, type, description, related_table, related_row_id,
        created_at, creator_id, creator_email, creator_name)
     VALUES (
        ${sqlString(ulid())}, ${sqlString(entry.type)}, ${sqlString(entry.description)},
        ${sqlString(entry.relatedTable ?? null)}, ${sqlString(entry.relatedRowId ?? null)},
        ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)}
     );`
  )
}

/** Write one activity row into a team's own database. Best-effort by contract:
 * it swallows + logs its own failures so a logging hiccup can NEVER break the
 * action it describes — callers just `await logActivity(...)`, no `.catch` needed.
 * Right for every caller so far: each one logs a SIDE EFFECT of a mutation that
 * already succeeded ("member role changed"), so losing the log line is an
 * acceptable, silent loss. See `writeActivity` below for the caller it is wrong
 * for.
 *
 * SWALLOWED IS NOT THE SAME AS UNRECORDED, and for a year it was. The console
 * line above was the whole of it, which meant a team database having a bad
 * minute left a HOLE in the one table R18's entire audit story rests on, and the
 * only trace expired with the log tail. The action succeeded, the feed is
 * missing a line, and nobody can tell the difference between "nothing happened"
 * and "we failed to write that it did".
 *
 * So the swallow stays — the contract is right and this must never break the
 * action it describes — and the loss is now DURABLE: `logError` cannot throw
 * (error-log.ts's own contract), so recording here costs the caller nothing it
 * was not already paying. `cfg.core` is absent only where nobody wired one, and
 * then this behaves exactly as it did before. */
export async function logActivity(
  cfg: D1Rest,
  databaseId: string,
  actor: Actor,
  entry: ActivityEntry
): Promise<void> {
  try {
    await insertActivity(cfg, databaseId, actor, entry)
  } catch (e) {
    console.error("activity log failed:", e)
    if (cfg.core)
      await logError(cfg.core, {
        source: "activity",
        // The database and the ROW the missing line was about — which is the
        // pair somebody needs to put it back by hand, and the pair the feed
        // itself is keyed on.
        place: `activity/${databaseId} ${entry.relatedTable ?? "?"}/${entry.relatedRowId ?? "?"}`,
        message: `activity row NOT written ("${entry.type}"): ${e instanceof Error ? e.message : String(e)}. The action it describes SUCCEEDED; the record's history is missing this line.`,
        stack: e instanceof Error ? e.stack : undefined,
        userId: actor.id,
      })
  }
}

/** The same insert, but it THROWS — for the one caller where writing the row
 * IS the point of the request, rather than a side-effect of one that already
 * succeeded: a user-authored note (`postActivityNote`, workers/tenancy/src/
 * routes/team.ts). `logActivity`'s swallow-and-log contract is correct for
 * "member role changed" — losing that line costs nothing nobody can recover.
 * It would be silently WRONG here: a note that fails to save must answer with
 * a real error, not a 200 that tells somebody their note is there when it
 * is not. */
export async function writeActivity(
  cfg: D1Rest,
  databaseId: string,
  actor: Actor,
  entry: ActivityEntry
): Promise<void> {
  return insertActivity(cfg, databaseId, actor, entry)
}
