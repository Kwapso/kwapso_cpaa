// The ONE pair of response helpers every worker uses — same JSON shape,
// same error contract (shared/types.ts ApiError), defined exactly once.

import type { ApiError } from "../types"
import { isCapped } from "./count"

export const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

export const fail = (
  status: number,
  error: string,
  message: string
): Response => json({ error, message } satisfies ApiError, status)

/** R14 — the ONE paged response. A growing collection's door answers through
 * this and only this, so it cannot half-implement the contract: the rows under
 * their own key, the server total, hasMore, and the opaque nextCursor the
 * client hands straight back. `extra` carries a door's own additions (help's
 * mineTotal). Drop the seam and the client silently loses page two, so the
 * bounded-lists check asserts every growing door still goes through it.
 *
 * R16 (amended 2026-08-14) — `totalCapped` says whether `total` is the exact
 * number or a floor. It is DERIVED here from the total itself rather than passed
 * in by each door, and that is the whole reason the amendment is safe to make: a
 * door cannot forget to declare it, cannot declare it wrongly, and cannot
 * disagree with the seam that stopped counting. Thirteen call sites needed no
 * edit at all. The same shape as an export's `complete` flag — the fact and the
 * number ride in one object, one decision in one place, exactly as R23 makes
 * `found`/`passages`/`citations` inseparable. */
export const pagedJson = (
  rowsKey: string,
  page: { rows: unknown[]; total: number; hasMore: boolean; nextCursor: string | null },
  extra: Record<string, unknown> = {}
): Response =>
  json({
    [rowsKey]: page.rows,
    total: page.total,
    totalCapped: isCapped(page.total),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    ...extra,
  })

/** Forward a request to a gated door over a service binding, carrying the caller's
 * session cookie so the door re-checks permissions + validates AS them. Returns the
 * raw Response — the caller shapes it (the agent → {ok,status,data}; MCP → {ok,text}).
 * This is the ONE cookie-forward seam both act-as-user executors share. */
export async function forwardToDoor(
  fetcher: { fetch(url: string, init?: RequestInit): Promise<Response> },
  opts: {
    path: string
    method: string
    cookie: string
    query?: string
    body?: unknown
    /** Give up after this long. Optional because a service binding is
     * Cloudflare-bounded (R11 exempts it), but "bounded" is not "never hangs" and
     * a caller with an impatient client of its own — the MCP surface — needs to be
     * able to say when it stops waiting. The caller decides what an abort means. */
    timeoutMs?: number
  }
): Promise<Response> {
  const init: RequestInit = { method: opts.method, headers: { Cookie: opts.cookie } }
  if (opts.method === "POST") {
    ;(init.headers as Record<string, string>)["Content-Type"] = "application/json"
    init.body = JSON.stringify(opts.body ?? {})
  }
  if (opts.timeoutMs) init.signal = AbortSignal.timeout(opts.timeoutMs)
  return fetcher.fetch(`https://internal${opts.path}${opts.query ?? ""}`, init)
}
