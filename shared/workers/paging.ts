// KEYSET (cursor) PAGING — the answer a hard cap refuses to give (R14).
//
// A cap is honest but final: at LIST_HARD_CAP the screen simply stops knowing.
// A GROWING collection (one that gets bigger with ordinary use — tickets, the
// activity feed) must PAGE instead, and page by KEY, not by OFFSET: `LIMIT ?
// OFFSET ?` re-scans every skipped row (page 480 of 24,000 costs 24,000 reads)
// and silently duplicates or drops rows when someone writes mid-scroll. A keyset
// cursor says "everything strictly after THIS row" — constant cost per page, and
// stable under concurrent writes.
//
// The contract every paged door returns: the rows, the TRUE total (an exact
// COUNT(*), not the loaded length), `hasMore`, and an OPAQUE `nextCursor` the
// client hands straight back. Opaque is deliberate — the cursor is a position,
// not an API: encode it and clients can never build one by hand and pin the door
// to a shape it can't change.

import { GuardError } from "./gating"

/** Rows per page. Small enough that a first paint is instant, large enough that
 * "load more" is rare on a normal screen. */
export const PAGE_SIZE = 50

/** What a paged read hands back. `nextCursor` is null exactly when `hasMore` is
 * false — the pair is redundant on purpose: a client that forgets one still can't
 * get it wrong. */
export type Page<T> = {
  rows: T[]
  hasMore: boolean
  nextCursor: string | null
}

/** The position a cursor names: the last row's sort value + its id (the tiebreak
 * that makes the order total, so two rows sharing a timestamp can't hide each
 * other). */
type Position = { k: string; id: string }

/** base64url so a cursor survives a query string untouched. */
function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function encodeCursor(sortValue: string | null, id: string): string {
  return b64url(JSON.stringify({ k: sortValue ?? "", id }))
}

/** Decode a client-supplied cursor. Anything malformed is a clean 400, never a
 * 500 and never a silent "start from the top" (a cursor that quietly resets is
 * how a paged list repeats its first page forever). */
export function decodeCursor(raw: string | null | undefined): Position | null {
  if (!raw) return null
  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"))
    const v = JSON.parse(json) as Position
    if (typeof v?.k !== "string" || typeof v?.id !== "string" || !v.id) throw new Error("shape")
    return v
  } catch {
    throw new GuardError(400, "invalid_cursor", "That page link is no longer valid. Reload the list.")
  }
}

/** The keyset predicate for a `ORDER BY <sortExpr> DESC, id DESC` read: every row
 * strictly after the cursor's position. Returns a fragment to AND into the WHERE
 * plus its params — parameterised, never interpolated. */
export function keysetAfter(pos: Position | null, sortExpr: string): { sql: string; params: string[] } {
  if (!pos) return { sql: "", params: [] }
  return {
    sql: `(${sortExpr} < ? OR (${sortExpr} = ? AND id < ?))`,
    params: [pos.k, pos.k, pos.id],
  }
}

/** Turn a LIMIT+1 read into a page: the extra row is how we know there's more
 * without a second query. `key` names each row's (sort value, id). */
export function toPage<T>(rows: T[], limit: number, key: (row: T) => [string | null, string]): Page<T> {
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  return {
    rows: page,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(...key(last)) : null,
  }
}
