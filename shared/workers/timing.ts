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

/** One trip to the D1 REST door: what kind of statement, and how long it took. */
export type D1Stat = { op: string; ms: number }

const perRequest = new WeakMap<Request, D1Stat[]>()

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

/** What this request spent, if anything collected it. */
export function d1TimingFor(request: Request): D1Stat[] | undefined {
  return perRequest.get(request)
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
export function timingHeaders(request: Request): Record<string, string> {
  const stats = perRequest.get(request)
  if (!stats?.length) return {}
  const total = stats.reduce((sum, s) => sum + s.ms, 0)
  const slowest = stats.reduce((worst, s) => (s.ms > worst.ms ? s : worst), stats[0])
  return {
    "Server-Timing": [
      `d1;desc="${stats.length} trips";dur=${Math.round(total)}`,
      `d1max;desc="${slowest.op}";dur=${Math.round(slowest.ms)}`,
    ].join(", "),
  }
}

/** Copy a finished response, adding this request's timing. A new Response
 * because a handler's own may be immutable, and because adding a header must
 * never be able to fail the request it is measuring. */
export function withTiming(request: Request, res: Response): Response {
  const extra = timingHeaders(request)
  if (!extra["Server-Timing"]) return res
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(extra)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/** THE SLOW-DOOR LOG LINE. A header is only read by somebody already watching
 * one request; this is how a door that is slow for EVERYBODY gets noticed
 * without anybody watching. Above the threshold it prints the count, the total,
 * and the shape of the trips — which is the whole diagnosis in one line.
 *
 * Logged, never thrown: a door that is slow still worked, and turning slowness
 * into a failure would be a worse bug than the slowness. */
export function logIfSlow(request: Request, route: string, thresholdMs = 750): void {
  const stats = perRequest.get(request)
  if (!stats?.length) return
  const total = stats.reduce((sum, s) => sum + s.ms, 0)
  if (total < thresholdMs) return
  const byOp = new Map<string, number>()
  for (const s of stats) byOp.set(s.op, (byOp.get(s.op) ?? 0) + 1)
  const shape = [...byOp.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([op, n]) => (n > 1 ? `${op} ×${n}` : op))
    .join(", ")
  console.warn(
    `SLOW DOOR ${route}: ${stats.length} D1 trips, ${Math.round(total)}ms total — ${shape}`
  )
}
