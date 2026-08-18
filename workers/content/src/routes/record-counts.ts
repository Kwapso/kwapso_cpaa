// THE BADGE DOOR, CONTENT'S HALF — how much of the work engine hangs off ONE
// record, in one round trip, before anybody has clicked a tab.
//
// The reasoning is written once, on the tenancy half
// (workers/tenancy/src/routes/record-counts.ts): counts eagerly and rows lazily,
// a refusal for client logins at the door (R21), one module's read right per
// COLLECTION rather than one for the door (R18), and not a single figure counted
// here that the module's own list does not already count the same way (R16).
//
// IT IS TWO DOORS AND NOT ONE, and the reason is the code rather than the data.
// Every team's rows live in one database, but the counting FUNCTIONS live in the
// worker that owns each module, and a domain worker binds only AUTH and REALTIME
// — so for content to count an account's apps, or tenancy to count its sprints,
// one of them would have to write a second expression for a number the other
// already owns. That is exactly the drift R16 exists to prevent, and it would be
// bought with a worker-to-worker hop that costs more than the browser asking
// both doors at once. The screen asks whichever doors a record actually needs
// (`shared/record-counts.ts` says which), in parallel, and merges the answers.

import { json } from "@shared/workers/http"
import { GuardError, teamContext } from "@shared/workers/gating"
import { accountScope, refusePortalCaller } from "@shared/workers/account-scope"
import { queryText } from "@shared/workers/validate"
import { answerRecordCounts, type RecordCounter } from "@shared/workers/record-counts"
import { recordTimeCountKey } from "@shared/record-counts"
import { countTickets } from "../lib/help"
import { countAttachments } from "../lib/help-attachments"
import { countSprints, countStories } from "../lib/stories"
import { countTodos } from "../lib/todos"
import { countMeetings } from "../lib/meetings"
import { countWorkLogs, WORK_LOG_TARGETS } from "../lib/work-logs"
import { countDeliverables } from "../lib/deliverables"
import type { Env } from "../env"

/** One figure, by the sidecar name the badge reads.
 *
 * EVERY LINE ASKS THE PANEL'S OWN QUESTION, filter for filter — `view: "all"`
 * where the panel shows finished work too, `view: "live"` where it shows the
 * everyday list, the default open-only to-dos. R16's requirement is not just
 * "an exact count" but a count of the SAME collection the tab reveals: a badge
 * that counted archived tickets over a list that hides them would be a number
 * the list can never reach, which is the failure in its quietest form. */
const COUNTERS: Record<string, RecordCounter> = {
  // A client's record.
  "sprints-account": (cfg, guard, _s, id) => countSprints(cfg, guard, { accountId: id }),
  "todos-account": (cfg, guard, scope, id) => countTodos(cfg, guard, scope, { accountId: id }),
  "tickets-account": (cfg, guard, scope, id) =>
    countTickets(cfg, guard, scope, { tab: "all", view: "live", accountId: id }).then((r) => r.total),
  "meetings-account": (cfg, guard, _s, id) => countMeetings(cfg, guard, { view: "all", accountId: id }),
  // A system's record.
  "sprints-app": (cfg, guard, _s, id) => countSprints(cfg, guard, { appId: id }),
  "stories-app": (cfg, guard, _s, id) => countStories(cfg, guard, { appId: id, view: "all" }).then((r) => r.total),
  "meetings-app": (cfg, guard, _s, id) => countMeetings(cfg, guard, { view: "all", appId: id }),
  "tickets-app": (cfg, guard, scope, id) =>
    countTickets(cfg, guard, scope, { tab: "all", view: "live", appId: id }).then((r) => r.total),
  // WHAT WE HANDED OVER on it — the whole shelf, archived rows included, because
  // the tab shows those too: a superseded handover doc is still something we sent.
  "deliverables-app": (cfg, guard, _s, id) => countDeliverables(cfg, guard, { appId: id }),
  // A request's record.
  "stories-ticket": (cfg, guard, _s, id) =>
    countStories(cfg, guard, { ticketId: id, view: "all" }).then((r) => r.total),
  "help-attachments": (cfg, guard, scope, id) => countAttachments(cfg, guard, scope, id),
  // A sprint's record.
  "stories-sprint": (cfg, guard, _s, id) =>
    countStories(cfg, guard, { sprintId: id, view: "all" }).then((r) => r.total),
  // A RECORD'S OWN TIME, on all four things time can be logged against. Derived
  // from `WORK_LOG_TARGETS` — the door's own allow-list, and the same object the
  // panel, the write door and the label subselect are all built from — because
  // four hand-written lines here would be a fifth target's badge quietly missing.
  ...(Object.fromEntries(
    Object.keys(WORK_LOG_TARGETS).map((table) => [
      recordTimeCountKey(table),
      // `countWorkLogs` and nothing of its own: the Time tab's list asks the door
      // with exactly this filter, so the badge and the rows it reveals are one
      // question (R16). Discarded rows are out of both, because `logWhere` says so.
      (cfg, guard, _s, id) =>
        countWorkLogs(cfg, guard, { targetTable: table, targetId: id }).then((r) => r.total),
    ])
  ) as Record<string, RecordCounter>),
}

/** GET /api/content/record-counts?table=&id= — the child totals this worker owes
 * for one record. At most five bounded statements, all in parallel, and fewer
 * for a role that cannot read the modules. */
export async function getRecordCounts(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await refusePortalCaller(cfg, guard)
  // The fence is still resolved and still passed to every counter that takes
  // one. Refusing the portal decided WHO may ask; the fence decides WHAT the
  // answer is made of, and a staff scope is not the absence of one.
  const scope = await accountScope(cfg, guard)
  // R20: both fields sit inside a checker HERE, at the door, where the query
  // census reads them.
  const url = new URL(request.url)
  const table = queryText(url.searchParams.get("table"), "Record type")
  const id = queryText(url.searchParams.get("id"), "Record")
  if (!table) throw new GuardError(400, "invalid_input", "Which kind of record?")
  if (!id) throw new GuardError(400, "invalid_input", "Which record?")
  return json(await answerRecordCounts(cfg, guard, scope, table, id, "content", COUNTERS))
}
