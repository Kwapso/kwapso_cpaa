// ONE REQUEST, ONE NAME — the thread that ties a single click to every worker
// that touched it.
//
// The problem this exists for: a click on the agency app can pass through the
// gateway, tenancy, auth (whoAmI) and realtime before it comes back. When it
// fails, `error_logs` gets a row from whichever worker crashed — and nothing
// says which of the other three was the cause, or even that they were involved.
// Eight components, and the only way to line their rows up was the clock.
//
// The rule, in one sentence: THE DOOR NAMES THE REQUEST, AND EVERY HOP KEEPS
// THE NAME.
//
//   • The two public gateways mint an id and stamp it on what they forward.
//   • A worker continuing that request re-reads the SAME id off the header
//     (never mints a second one) and carries it onto its own internal calls.
//   • Every central catch writes it to `error_logs.request_id`, so one query
//     returns every worker that touched one failing click, in order.
//
// A caller may supply its own `x-request-id` — an outside tool on the MCP
// surface, a smoke script, a load test. We keep it, because the point is to
// join OUR rows to THEIR trace. It is trimmed and capped (it lands in a column
// and in a log line, so it is boundary-validated like any other caller string)
// and it is never trusted for anything but joining rows: nothing authorises,
// gates or fences on this value.

import { ulid } from "./id"

/** The one header name. Chosen over `traceparent` because we are not emitting
 * W3C trace context — there are no spans, no sampling, no collector. A single
 * flat id is what the error store can actually join on. */
const TRACE_HEADER = "x-request-id"

/** Long enough for a ULID (26) or a UUID (36), short enough that it can't be
 * used to smuggle a paragraph into a log line or a column. */
const MAX_ID = 64

/** Only characters that stay safe in a log line, a URL and a SQL string. A value
 * that fails this is not refused — it is simply replaced with one of ours,
 * because a malformed trace id must never turn a working request into a 400. */
const SAFE = /^[A-Za-z0-9_.-]+$/

/**
 * This request's id: the caller's, if they sent a sane one, or a fresh ULID.
 *
 * Deliberately idempotent-by-header rather than by memo: a worker calls this
 * once in its catch and once per internal hop, and both must produce the same
 * answer. The header IS the memo.
 */
export function requestId(request: { headers: { get(name: string): string | null } }): string {
  const raw = request.headers.get(TRACE_HEADER)?.trim() ?? ""
  if (raw && raw.length <= MAX_ID && SAFE.test(raw)) return raw
  return ulid()
}

/**
 * The headers an internal hop adds so the next worker sees the same id. Spread
 * it into an existing header object:
 *
 *     headers: { Cookie: cookie, ...traceHeaders(id) }
 */
export function traceHeaders(id: string): Record<string, string> {
  return { [TRACE_HEADER]: id }
}

/**
 * The same request, stamped, for a gateway that forwards the caller's Request
 * object as-is.
 *
 * `new Request(request, { headers })` rather than mutating `request.headers`,
 * which is immutable on an inbound request in Workers. The body is carried by
 * the constructor, so a POST forwards unchanged.
 */
export function stampTrace(request: Request, id: string): Request {
  const headers = new Headers(request.headers)
  headers.set(TRACE_HEADER, id)
  return new Request(request, { headers })
}
