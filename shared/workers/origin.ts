// WHICH FRONT DOOR A CHANGE CAME THROUGH — the one thing an activity row could
// not say.
//
// THE PROBLEM. Four surfaces act as the SAME PERSON through the SAME gated
// doors: the agency app, the client portal, a personal access token on the MCP
// surface, and the in-app assistant acting as its caller. That identity is the
// whole security design and it is right — the agent never exceeds the rights of
// the person it acts for — but it means the trail those four leave is
// byte-identical. "Ana archived Bergman" is the same row whether Ana clicked it,
// whether a script holding Ana's token did, or whether Ana asked the assistant
// to. So after a leaked token the first question anybody asks — WHICH of these
// did this? — has no answer in the one table that exists to answer it.
//
// THE SHAPE. The same shape trace.ts already uses, and for the same reason: THE
// DOOR NAMES THE REQUEST, AND EVERY HOP KEEPS THE NAME.
//
//   • The two public gateways STAMP the surface on what they forward — the
//     agency door writes `app`, the client door writes `portal` — overwriting
//     whatever the caller sent, so a browser cannot label its own request.
//   • The two act-as-user executors stamp their own: `forwardToDoor` takes the
//     origin as a REQUIRED argument, so the MCP surface and the assistant each
//     say which they are on every door they call.
//   • A domain worker re-reads the header in `teamContext` and puts it on the
//     data-door config, exactly where `core` and `stats` already ride — so all
//     139 `logActivity` call sites gained it without one of them changing.
//
// WHY THE HEADER CANNOT BE FORGED INTO A LIE. Only the two gateways are public
// (every other worker sets `workers_dev:false` + `preview_urls:false`), and both
// SET rather than merge. Anything a browser puts here is replaced before the
// request reaches a door. Everything else arrives over a service binding from
// one of our own workers, which sets it too. And this is boundary-validated like
// any other caller string (R20): a value outside the closed set below is not a
// 400 and not a stored string — it reads as `unknown`, because a malformed
// header must never turn a working request into an error, and must never put a
// caller's text in a column.
//
// NOTHING GATES ON THIS. It is a label on history, never an authorisation: no
// permission, fence or refusal anywhere reads it. That is deliberate — the
// moment a surface label decides something, forging it becomes worth trying.

/** THE CLOSED SET. A row's origin is one of these seven and nothing else.
 *
 * `unknown` is the honest answer rather than a hole: a row written before this
 * column existed, or by a path that genuinely cannot say. It is in the set so
 * that "we do not know" is a value somebody can COUNT, rather than a NULL that
 * reads as an accident. */
export const ACTIVITY_ORIGINS = [
  /** The agency app (web/), through the agency gateway. */
  "app",
  /** The client portal (web-portal/), through the portal gateway. */
  "portal",
  /** An outside tool holding a personal access token, over the MCP surface. */
  "mcp",
  /** The in-app assistant, acting as the person who asked it. */
  "assistant",
  /** The agentic import, writing act-as-user through each target's own door. */
  "import",
  /** The app acting on its own: a cron sweep, the morning digest, housekeeping. */
  "automation",
  /** Genuinely not knowable at the write, or written before this column was. */
  "unknown",
] as const

export type ActivityOrigin = (typeof ACTIVITY_ORIGINS)[number]

/** The one header name. Prefixed with the product, like nothing else here needs
 * to be, because this one travels through a public gateway and a value a client
 * can set must be visibly OURS at the place we overwrite it. */
export const ORIGIN_HEADER = "x-kwapso-origin"

/** What this request says it is, validated against the closed set.
 *
 * Never throws and never refuses: an unrecognised value is `unknown`, for the
 * same reason trace.ts replaces a malformed id rather than answering 400. The
 * label is not worth failing a person's click over. */
export function readOrigin(request: {
  headers: { get(name: string): string | null }
}): ActivityOrigin {
  const raw = request.headers.get(ORIGIN_HEADER)?.trim() ?? ""
  return (ACTIVITY_ORIGINS as readonly string[]).includes(raw) ? (raw as ActivityOrigin) : "unknown"
}

/** The header an internal hop adds so the next worker sees the same surface.
 * Spread it beside `traceHeaders`, which it deliberately mirrors. */
export function originHeaders(origin: ActivityOrigin): Record<string, string> {
  return { [ORIGIN_HEADER]: origin }
}

/** The same request, STAMPED — for a gateway that forwards the caller's Request
 * object as-is. `set`, not `append`: whatever the caller sent is replaced, which
 * is the whole reason a browser cannot label its own request.
 *
 * `new Request(request, { headers })` rather than mutating `request.headers`,
 * which is immutable on an inbound request in Workers. The body is carried by
 * the constructor, so a POST forwards unchanged — the same construction
 * `stampTrace` makes, and for the same reason. */
export function stampOrigin(request: Request, origin: ActivityOrigin): Request {
  const headers = new Headers(request.headers)
  headers.set(ORIGIN_HEADER, origin)
  return new Request(request, { headers })
}
