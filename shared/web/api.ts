// THE HTTP TRANSPORT both front doors talk to the workers through — and nothing
// else. One fetch wrapper, one error class, one paged-response shape.
//
// What is deliberately NOT here: the door lists. `web/lib/api.ts` and
// `web-portal/lib/api.ts` each keep their OWN inventory of the endpoints they
// call, because those inventories mean something — the portal's is checked
// against the portal gateway's allow-list, and the agency's is the attack
// surface the closed-door suite fires at the portal. Merging them would erase
// both facts. What was genuinely the same is the plumbing underneath, which used
// to exist twice, byte for byte, owned by nobody.

import type { ApiError } from "../types"

/** A non-2xx answer from a worker, carrying the machine `code` a screen can
 * branch on (never the message — copy changes, codes don't). */
export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

/** Same-origin JSON call. Cookies flow automatically because the screens and the
 * API sit on one origin; a non-2xx becomes an ApiFailure with the worker's own
 * code, or a plain-English fallback when the body isn't JSON at all. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null
    throw new ApiFailure(
      res.status,
      body?.error ?? "unknown",
      body?.message ?? "Something went wrong. Try again."
    )
  }
  return (await res.json()) as T
}

/** R14: what every PAGED door returns — the rows, the server `total`, and the
 * pair that says whether there's another page. `nextCursor` is OPAQUE: hand it
 * straight back, never build or parse one.
 *
 * R16 (amended): `totalCapped` says whether `total` is the exact number or a
 * floor — true means "at least this many". It is on the TYPE rather than left to
 * each caller to remember, for the same reason `pagedJson` derives it rather than
 * taking it: a field that says how much to trust the field beside it is worth
 * nothing if half the readers do not know it is there. */
export type PagedResponse<T> = T & {
  total: number
  totalCapped: boolean
  hasMore: boolean
  nextCursor: string | null
}

/** Two one-liners every caller repeats: a URL-safe id, and a JSON POST. */
export const enc = encodeURIComponent
export const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) })

/** WHAT A PAGED LIST DOOR IS ASKED, as a query string — every key it was given,
 * and nothing enumerated on the way.
 *
 * It exists because the client half of a list read used to spell its door's
 * parameters out one `if` at a time, and a parameter spelled out is a parameter
 * somebody can leave out. That is not hypothetical: `content.knowledge` took the
 * find's whole question and copied three fields of it across, so when sorting
 * arrived and put `sort` in that question, the knowledge base's sort control
 * changed the cache key, refetched the same rows in the same order, and looked
 * like it worked. Nothing was broken by the change — the drop was already there,
 * waiting for a fourth parameter to exist.
 *
 * So nothing here knows the names. A caller hands over the object it was given
 * (`{ ...query, cursor }`) and every non-empty value in it reaches the door,
 * which is the one arrangement where forgetting is not possible. The TYPES on
 * each client method still say what its door takes — that is what documents the
 * contract; this is what carries it. */
export function listQuery(parts: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams()
  for (const [key, value] of Object.entries(parts))
    if (value !== undefined && value !== null && value !== "") p.set(key, String(value))
  const qs = p.toString()
  return qs ? `?${qs}` : ""
}
