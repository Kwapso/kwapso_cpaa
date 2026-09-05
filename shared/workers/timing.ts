// WHAT A DOOR ACTUALLY SPENT — the one thing nobody could see.
//
// THE OWNER'S REPORT, 24 Aug 2026: "the first-time loading of collections and
// details screens is a bit troubling… even today, if I log into the brimba base,
// the speed is not an issue." And a sister app on the SAME base, seeded with
// thousands of rows, is snappy. So "the architecture is slow" was never the
// explanation — something in THIS app's doors is, and nothing in the request
// path could say which.
//
// Measured from outside on the same day, against staging, signed in:
//
//   a 404 (routing only) ....... ~90ms      ← the transport floor
//   /api/auth/me ............... ~280ms     ← + session verification
//   /api/tenancy/my-permissions  ~800ms
//   every real list door ....... 1,400–2,200ms
//
// …while D1 itself reported `sql_duration_ms: 0.95` for the query it ran. A door
// spending a second and a half to do one millisecond of database work is not a
// slow database, and it is not a slow edge. It is COUNT: every `d1Query` is a
// separate HTTPS request to api.cloudflare.com, and the only number that has
// ever mattered is how many of them one door makes, in sequence.
//
// That number was invisible. This makes it visible, and cheap enough to leave on.
//
// WHY IT HANGS OFF THE REQUEST OBJECT. A worker isolate serves many requests at
// once, so a module-level "current request" collector is a race that reports one
// caller's queries under another caller's name. The Request instance is the only
// per-request identity every layer already holds — `teamContext(request, env)`
// receives it and so does the dispatcher — so a WeakMap keyed on it is exact,
// needs no compatibility flag, and collects nothing when nobody asks. Same shape
// as the per-request permission memo in gating.ts, for the same reason.
//
// WHAT IT MAY NOT CARRY. The label is a VERB and a TABLE, derived by regex from
// the statement's own text and nothing else — never the parameters, never an
// inlined literal, never a WHERE clause. This value goes out in a response
// header, and a response header is readable by anything that can read the
// response. A timing seam that leaks a customer's name into a header would be a
// worse defect than the slowness it was built to explain.

import { budgetForKind, MAX_D1_TRIPS_PER_DOOR } from "./limits"

/** THE TAG EVERY `ROUTES` TABLE ALREADY CARRIES. A door's class is read off the
 * routing table rather than guessed here, so there is one place a route's kind
 * is decided and the budget follows it. `auth` has a `switch` rather than a
 * table, so it passes nothing and the method decides — see `classOf`. */
export type RouteKind = "read" | "mutation" | "housekeeping"

/** One trip to the D1 REST door: what kind of statement, how long it took, and
 * how many rows came back. The ROW COUNT is what separates "this door is slow
 * for everybody" from "this door is slow for the one team with 90,000 rows" —
 * without it the two print identically, which is the state this file was in
 * until 5 Sep 2026. It is a COUNT and never a value, so it is subject to the
 * same rule as the label above: nothing a caller supplied may appear here. */
export type D1Stat = { op: string; ms: number; rows?: number }

const perRequest = new WeakMap<Request, D1Stat[]>()

/** WHEN THIS REQUEST STARTED, and WHOSE it is. Two more WeakMaps keyed on the
 * same Request, for the same reason the trip collector is (see the header note):
 * a module-level "current request" is a race that reports one caller's numbers
 * under another caller's name.
 *
 * WHY WALL CLOCK AND NOT JUST D1 TIME. Until 5 Sep 2026 this file could only see
 * the database trips, so a worker that made none — `auth`, which every single
 * request in the product passes through — reported nothing at all, and the
 * 190ms of session work above the transport floor was invisible by construction.
 * A budget is a promise about how long a PERSON waits, so the thing measured
 * against it has to be the whole request. */
const startedAt = new WeakMap<Request, number>()
const tenantOf = new WeakMap<Request, string>()

/** VERB + TABLE, and nothing else — see the header note above.
 *
 * Falls back to the bare verb when the shape is one this does not recognise (a
 * PRAGMA, a multi-statement script, a CTE), because an unlabelled trip still
 * needs to be COUNTED. Returning "?" for the whole statement would hide the very
 * calls most likely to be expensive. */
export function labelFor(sql: string): string {
  const text = sql.trim().replace(/\s+/g, " ")
  const verb = /^[A-Za-z]+/.exec(text)?.[0].toUpperCase() ?? "SQL"
  const table =
    /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(text)?.[1] ??
    /\bINTO\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(text)?.[1] ??
    /\bUPDATE\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(text)?.[1] ??
    null
  return table ? `${verb} ${table}` : verb
}

/** Start collecting for this request, and hand back the array to hang on the
 * D1 config. Idempotent: a handler that opens the team context twice shares one
 * collector rather than starting a second and reporting half the trips. */
export function beginD1Timing(request: Request): D1Stat[] {
  const existing = perRequest.get(request)
  if (existing) return existing
  const stats: D1Stat[] = []
  perRequest.set(request, stats)
  return stats
}

/** Start the wall clock for this request. Idempotent, and cheap enough to call
 * unconditionally at the top of every dispatcher — one `Date.now()` and one
 * WeakMap write. A door that is never marked simply reports no total, exactly as
 * an unmeasured door did before. */
export function beginRequest(request: Request): void {
  if (!startedAt.has(request)) startedAt.set(request, Date.now())
}

/** WHOSE REQUEST THIS IS. Called where the team is first resolved, so the slow
 * line can name the tenant without any handler having to pass it down. A team id
 * is an opaque ulid, not a customer's name — the header rule at the top of this
 * file still holds, which is why this rides the LOG LINE and never the response
 * header. */
export function noteTeam(request: Request, teamId: string): void {
  tenantOf.set(request, teamId)
}

/** The `Server-Timing` value for a finished request — the browser's own network
 * panel understands this format, so the number lands where somebody debugging a
 * slow screen is already looking, with no tooling to install.
 *
 * Two metrics, deliberately:
 *   • `d1;desc="N trips";dur=<total ms>` — the count IS the finding.
 *   • `d1max` — the single slowest trip, which separates "many small trips"
 *     (fix by batching) from "one heavy query" (fix by indexing). Those two
 *     have opposite repairs, and a total alone cannot tell them apart.
 *
 * Empty when nothing was collected, so an ungated or static route pays nothing
 * and says nothing. */
function timingHeaders(request: Request, kind?: RouteKind): Record<string, string> {
  const parts: string[] = []
  const began = startedAt.get(request)
  if (began !== undefined) {
    // THE NUMBER THE BUDGET IS ABOUT. `app` is the whole request; `budget` is
    // what this class of door is allowed to spend (limits.ts). Both go in the
    // header so anybody debugging a slow screen sees the target beside the
    // actual, in the browser's own network panel, with nothing to install —
    // which is the entire answer to "can anyone on the team get this number
    // today without asking you".
    parts.push(`app;desc="total";dur=${Date.now() - began}`)
    parts.push(`budget;desc="${classOf(request, kind)}";dur=${budgetFor(request, kind)}`)
  }
  const stats = perRequest.get(request)
  if (stats?.length) {
    const total = stats.reduce((sum, s) => sum + s.ms, 0)
    const slowest = stats.reduce((worst, s) => (s.ms > worst.ms ? s : worst), stats[0])
    parts.push(`d1;desc="${stats.length} trips";dur=${Math.round(total)}`)
    parts.push(`d1max;desc="${slowest.op}";dur=${Math.round(slowest.ms)}`)
  }
  if (!parts.length) return {}
  return { "Server-Timing": parts.join(", ") }
}

/** Copy a finished response, adding this request's timing. A new Response
 * because a handler's own may be immutable, and because adding a header must
 * never be able to fail the request it is measuring. */
export function withTiming(request: Request, res: Response, kind?: RouteKind): Response {
  const extra = timingHeaders(request, kind)
  if (!extra["Server-Timing"]) return res
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(extra)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/** WHICH BUDGET THIS DOOR ANSWERS TO. The route's own tag when it has one; a
 * GET with no tag is a read, and anything else with no tag is held to the WRITE
 * budget — the stricter of the two it could be, so an untagged door is never
 * quietly handed the minute a bulk job gets. */
function classOf(request: Request, kind?: RouteKind): string {
  if (kind) return kind === "mutation" ? "write" : kind === "housekeeping" ? "bulk" : "read"
  return request.method === "GET" ? "read" : "write"
}

function budgetFor(request: Request, kind?: RouteKind): number {
  return budgetForKind(kind ?? (request.method === "GET" ? "read" : "mutation"))
}

/** THE SLOW-DOOR LOG LINE. A header is only read by somebody already watching
 * one request; this is how a door that is slow for EVERYBODY gets noticed
 * without anybody watching. Above its class's budget it prints the total, the
 * budget it missed, the trip count, the shape of the trips and the rows they
 * carried — which is the whole diagnosis in one line.
 *
 * MEASURED AGAINST ITS OWN CLASS (limits.ts `LATENCY_BUDGET_MS`), not against
 * one number for the whole product. The old threshold was 750ms for every door
 * in the app, so a read that took 700ms passed the same test as a bulk import
 * that took 700ms — which is the same as having no test. The four budgets are
 * the owner's "snappy" tier and every class is now held to its own.
 *
 * IT NAMES THE TENANT. A door that is slow for the one team with ninety thousand
 * work logs used to print identically to a door that is slow for everybody, so
 * the first question anybody asked of this line had no answer in it.
 *
 * Logged, never thrown: a door that is slow still worked, and turning slowness
 * into a failure would be a worse bug than the slowness. */
export function logIfSlow(request: Request, route: string, kind?: RouteKind): void {
  const began = startedAt.get(request)
  const stats = perRequest.get(request) ?? []
  // Nothing marked the request and nothing counted a trip: an unmeasured door,
  // exactly as before. (A door that was marked but made no database trip IS
  // measured — that is the whole reason `auth` can be seen at all now.)
  if (began === undefined && !stats.length) return
  const total = began === undefined ? stats.reduce((sum, s) => sum + s.ms, 0) : Date.now() - began
  const budget = budgetFor(request, kind)
  // TWO BUDGETS, EITHER ONE BREACHED. Time is what a person feels; the TRIP
  // COUNT is what causes it, and the two come apart in both directions — a door
  // can make fourteen statements and still come in under its class's budget on a
  // good day, and that door is one bad day from being the slow one. A count over
  // the ceiling is worth a line whether or not it was slow this time.
  if (total < budget && stats.length <= MAX_D1_TRIPS_PER_DOOR) return
  const byOp = new Map<string, number>()
  for (const s of stats) byOp.set(s.op, (byOp.get(s.op) ?? 0) + 1)
  const shape = [...byOp.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([op, n]) => (n > 1 ? `${op} \u00d7${n}` : op))
    .join(", ")
  const rows = stats.reduce((sum, s) => sum + (s.rows ?? 0), 0)
  const team = tenantOf.get(request)
  const over =
    total >= budget
      ? `${total}ms over a ${budget}ms ${classOf(request, kind)} budget`
      : `${total}ms (within its ${budget}ms ${classOf(request, kind)} budget)`
  const trips =
    stats.length > MAX_D1_TRIPS_PER_DOOR
      ? `${stats.length} D1 trips, over the ${MAX_D1_TRIPS_PER_DOOR} ceiling`
      : `${stats.length} D1 trips`
  console.warn(
    `SLOW DOOR ${route}${team ? ` team=${team}` : ""}: ${over}, ${trips}, ${rows} rows` +
      (shape ? ` \u2014 ${shape}` : "")
  )
}
