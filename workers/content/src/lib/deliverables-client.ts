// WHAT WE HANDED OVER, AS THE CLIENT SEES IT — the fenced half of the handover
// shelf, and a FILE of its own rather than two more exports beside the staff
// readers.
//
// WHY A SEPARATE FILE. `PORTAL_VISIBLE_READS` is keyed by file, and the fence
// suite walks it at FUNCTION level precisely because that list once "said a file
// was fenced while one of its readers was not" (RULES.md) — `help.ts` was
// declared fenced while the thread doors one function along carried nothing. A
// file holding both a staff reader that sees every account's rows and a client
// reader that must see one is a file where the next person to add a third reader
// has a fifty-fifty chance. R24 makes the same argument about the two rate cards
// and settles it the same way: two reads of identical shape and opposite
// audiences do not share a file, so that neither can be reached by accident from
// the other's door. Everything exported here takes an `AccountScope` and ANDs it
// in; there is nothing in this file a caller could reach without one.
//
// TWO FENCES, AND BOTH, NEVER EITHER.
//   1. THE ACCOUNT FENCE (SCOPE ch.06) — `account_id` is the copy the write
//      stamped off the app, so the clause rides one column with no join, exactly
//      as it does on `processes`. A client sees their own company's material and
//      nothing else, whatever their role says.
//   2. CLIENT VISIBILITY (the owner, 18 Aug 2026: "only once we mark it as
//      visible") — `visible_to_client_at IS NOT NULL`. Per ROW, not per module.
// A deliverable on the right account that nobody has shared is as invisible as
// one belonging to somebody else. They are ANDed in one clause built in one
// place, so no door can apply half of it.
//
// AND ARCHIVED IS GONE, which is the third clause and the quietest. `archive`
// means "put away" on our own shelf; on the client's side there is no faded card
// and no explaining — the row simply is not in the answer. So a deliverable
// shared by mistake can be withdrawn two different ways, and both work.
//
// NOTHING ABOUT US TRAVELS. The SELECT names no `creator_name`, no
// `editor_name`, no `deactivated_at` — SCOPE ch.06 is that the portal shows the
// work and never which staff member is doing it, and the cheapest way to keep a
// promise about a field is not to read the column.

import { accountScopeClause, type AccountScope } from "@shared/workers/account-scope"
import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import type { MemberGuard } from "@shared/workers/gating"
import type { ClientDeliverable } from "@shared/types"

type ClientRow = {
  id: string
  app_id: string
  app_name: string | null
  title: string
  kind: string | null
  dated_on: string | null
  url: string | null
  image_url: string | null
  visible_to_client_at: string
}

function toClientDeliverable(r: ClientRow): ClientDeliverable {
  return {
    id: r.id,
    appId: r.app_id,
    appName: r.app_name,
    title: r.title,
    kind: r.kind,
    datedOn: r.dated_on,
    url: r.url,
    imageUrl: r.image_url,
    sharedOn: r.visible_to_client_at,
  }
}

/** THE ONE WHERE CLAUSE, written once so the rows and the count can never be two
 * answers to two questions (R16's whole failure mode, and here it would be worse
 * than a wrong badge: a count taken over a laxer clause would tell a client how
 * much material exists that they cannot see).
 *
 * `scope` is the caller's own stamp, resolved by the guard corridor from their
 * session — never from anything on the request. An empty account set renders
 * `0 = 1` inside `accountScopeClause`, so a client login whose access has been
 * withdrawn reads an empty shelf rather than every shelf. */
function clientWhere(scope: AccountScope): { sql: string; params: string[] } {
  const fence = accountScopeClause(scope, "d.account_id")
  const where = [
    // BOTH, ALWAYS. Marked visible…
    "d.visible_to_client_at IS NOT NULL",
    // …and not put away since.
    "d.deactivated_at IS NULL",
  ]
  // Staff get no clause at all (they are meant to see every account); a client
  // login gets the IN list over the world they are standing in.
  if (fence.sql) where.push(fence.sql)
  return { sql: ` WHERE ${where.join(" AND ")}`, params: fence.params }
}

/** Everything shared with the company this client is standing in, newest first.
 *
 * R14 HARD CAP, not paging, and it is the same sentence the staff reader makes
 * one file over: a handover shelf is CURATED — a few pieces of material per
 * system — and does not grow with ordinary use. The client's side is strictly
 * SMALLER than the agency's, because it is the subset somebody has deliberately
 * shared, so a cap that is honest there is generous here. */
export async function listClientDeliverables(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope
): Promise<ClientDeliverable[]> {
  const w = clientWhere(scope)
  const rows = await d1Query<ClientRow>(
    cfg,
    guard.databaseId,
    // The app's NAME, not just its id — a client reads their handover material by
    // the system it belongs to, and an id is not a thing anybody recognises. The
    // join is safe to read unfenced because it can only ever resolve the app a
    // row already inside the fence hangs off.
    `SELECT d.id, d.app_id, a.name AS app_name, d.title, d.kind, d.dated_on, d.url,
            d.image_url, d.visible_to_client_at
       FROM deliverables d LEFT JOIN apps a ON a.id = d.app_id${w.sql}
      ORDER BY d.visible_to_client_at DESC, d.dated_on DESC LIMIT ${LIST_HARD_CAP}`,
    w.params
  )
  return rows.map(toClientDeliverable)
}

/** R16: the exact server COUNT(*) the heading shows, over the SAME clause the
 * rows came from — never `rows.length`, and never a laxer WHERE. */
export async function countClientDeliverables(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope
): Promise<number> {
  const w = clientWhere(scope)
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM deliverables d${w.sql}`,
    w.params
  )
  return rows[0]?.n ?? 0
}
