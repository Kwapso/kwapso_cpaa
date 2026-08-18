// HOW A BADGE DOOR ANSWERS — the one seam behind both halves of the
// record-counts door (tenancy's and content's).
//
// It is here rather than written twice for the reason `pagedJson` is one seam
// and `knowledgeAnswer` is one seam: a door that assembles half a contract by
// hand ships half a contract. What this owns is the half that is identical
// whichever worker is asking, and it is the half where a mistake is invisible:
//
//   • THE PER-COLLECTION GATE (R18). A record's children cross as many modules
//     as it has tabs, so one right cannot stand in for all of them — each figure
//     asks for its OWN module's read right and comes back `null` without it.
//     Written once, so neither door can drift into gating at the top.
//
//   • THE THREE STATES, KEPT APART. A number (counted), `null` (nobody counted,
//     the caller may not read that module) and ABSENT (not counted yet, or not
//     this worker's to count). Two of the three render identically, which is why
//     the distinction has to be structural rather than remembered.
//
//   • THE RIGHTS ARE ASKED ONCE PER MODULE, not once per figure. An app badges
//     two collections out of `work`; asking twice is one permission read that
//     buys nothing, on a door that runs every time a record is opened.
//
// WHAT IT DELIBERATELY DOES NOT OWN. The `table` and `id` come in already
// validated, because R20's census reads `searchParams.get` call sites out of
// `workers/*/src` — a door that handed its raw query string to a shared helper
// would drop out of that census entirely and be "validated" by a file nothing
// checks. And the refusal of a client login (R21) stays written on each handler
// for the same shape of reason: that check reads handler source.

import { hasRight, GuardError, type MemberGuard } from "./gating"
import type { AccountScope } from "./account-scope"
import type { D1Rest } from "./d1-rest"
import { childrenFor, COUNTED_RECORD_TABLES, type RecordChild, type RecordCounts } from "../record-counts"

/** How one collection is counted. Every one of these is a call into the module
 * that owns the collection, over the same question its list asks — the door
 * counts nothing of its own, so a badge and the list it reveals cannot become
 * two expressions that happen to agree (R16). */
export type RecordCounter = (
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
) => Promise<number>

/** Answer for one record: every child collection this worker owes, gated one
 * module at a time.
 *
 * `table` and `id` have already been through the boundary. `door` says which
 * worker is asking, and `counters` must hold a function for every key the
 * registry says that worker owes — a missing one is a coding error and is said
 * so, because answering `null` would make it look exactly like a permission. */
export async function answerRecordCounts(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  table: string,
  id: string,
  door: RecordChild["door"],
  counters: Record<string, RecordCounter>
): Promise<RecordCounts> {
  if (!COUNTED_RECORD_TABLES.includes(table))
    throw new GuardError(400, "invalid_input", "That isn't a kind of record with counts on it.")

  const owed = childrenFor(table, door)
  // R18, one read per MODULE — an app badges two collections out of `work`, and
  // asking twice buys nothing on a door that runs on every record open.
  const modules = [...new Set(owed.map((c) => c.module))]
  const allowed = new Map(
    await Promise.all(modules.map(async (m) => [m, await hasRight(cfg, guard, m, "read")] as const))
  )

  const counted = await Promise.all(
    owed.map(async (child) => {
      if (!allowed.get(child.module)) return [child.key, null] as const
      const count = counters[child.key]
      if (!count) throw new GuardError(500, "server_error", "That count isn't wired up.")
      return [child.key, await count(cfg, guard, scope, id)] as const
    })
  )
  return { counts: Object.fromEntries(counted) }
}
