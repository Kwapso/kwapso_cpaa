// THE BADGE DOOR — how many of each thing hang off ONE record, in one round
// trip, before anybody has clicked a tab.
//
// WHAT IT IS FOR. A record's collection tabs were badged out of a sidecar cache
// key that only the tab PANEL's own list fetch ever primed, so the number
// appeared the moment you opened the tab and not one moment sooner — and
// `formatCount` renders nothing for "none" AND nothing for "not loaded", so an
// unopened tab was indistinguishable from an empty one. This door answers the
// COUNTS eagerly; the ROWS stay lazy, which is the whole shape of the fix.
//
// IT REFUSES A CLIENT LOGIN (R21), first and unconditionally. Everything it
// counts is the agency's own working picture of a customer — how many systems we
// have built them, how much work we have sold, how many requests are open, what
// their rate card holds. A client has their own front door with its own screens;
// this is not one of them, and a door not named on the portal's allow-list is
// still served to that same person at the agency origin.
//
// IT HAS NO SINGLE GATE, AND THAT IS THE DESIGN. R18's sentence is that a
// cross-module read carries the CALLER'S rights, and one record's children cross
// as many modules as it has tabs. Gating the whole door on one of them would
// pick a winner: gate an account's counts on `processes` and somebody who only
// does support loses their to-do badge; gate them on `todos` and a developer
// loses the app one. So each COLLECTION asks for its own module's read right and
// comes back `null` without it — "you may not look" and "there are none" are
// different sentences, and the second would be a confident lie about the first.
//
// AND IT COUNTS NOTHING ITSELF. Every figure is the module's own existing
// `count*` function over the same question its list asks, so the badge and the
// list it reveals are one expression rather than two that happen to agree.
//
// WHICH FIGURES THIS WORKER OWES is read off `shared/record-counts.ts` rather
// than written here: the same registry the screen reads to know which doors to
// ask, and the live layer reads to know which pings move which record's counts.
// Three hand-written copies of one list is how two of them come to disagree.

import { json } from "@shared/workers/http"
import { GuardError, teamContext } from "@shared/workers/gating"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { queryText } from "@shared/workers/validate"
import { answerRecordCounts, type RecordCounter } from "@shared/workers/record-counts"
import { countApps, countAppModules, countProcesses } from "../lib/processes"
import { countAccountRates } from "../lib/rates"
import type { Env } from "../env"

/** One figure, by the sidecar name the badge reads. The registry says WHICH of
 * these a record owes and what each one costs in rights; this says how it is
 * counted, and every line of it is a call into the module that owns the
 * collection. */
const COUNTERS: Record<string, RecordCounter> = {
  "apps-account": (cfg, guard, scope, id) => countApps(cfg, guard, scope, { accountId: id }),
  "account-rates": (cfg, guard, scope, id) => countAccountRates(cfg, guard, scope, id),
  "processes-app": (cfg, guard, scope, id) => countProcesses(cfg, guard, scope, { appId: id }),
  "modules-app": (cfg, guard, scope, id) => countAppModules(cfg, guard, scope, { appId: id }),
}

/** GET /api/tenancy/record-counts?table=&id= — the child totals this worker owes
 * for one record.
 *
 * At most three bounded statements, all in parallel, and fewer than that for a
 * role that cannot read the modules. It is a SEPARATE call from the record's own
 * detail read on purpose: the record is what a person came for, so the counts
 * must not sit in front of first paint. */
export async function getRecordCounts(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const scope = await refusePortalCaller(cfg, guard)
  // R20: both fields sit inside a checker HERE, at the door, where the query
  // census reads them — `answerRecordCounts` then holds the table to the
  // registry's own allow-list, so a record kind nobody counts is a clean 400
  // rather than an empty object that reads like an answer.
  const url = new URL(request.url)
  const table = queryText(url.searchParams.get("table"), "Record type")
  const id = queryText(url.searchParams.get("id"), "Record")
  if (!table) throw new GuardError(400, "invalid_input", "Which kind of record?")
  if (!id) throw new GuardError(400, "invalid_input", "Which record?")
  return json(await answerRecordCounts(cfg, guard, scope, table, id, "tenancy", COUNTERS))
}
