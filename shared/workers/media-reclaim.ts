// IS ANYBODY ELSE STILL POINTING AT THIS OBJECT? — the question that has to be
// asked between "this row stopped pointing at it" and "delete it".
//
// ── THE HOLE THIS CLOSES, AND IT IS ONE THE RECLAIM ITSELF OPENED ───────────
//
// `ownedMediaKey` proves a key belongs to the CALLER — their team, their module,
// one object rather than a folder. That is exactly the right proof for "may this
// caller destroy this?", and it is not the whole question, because within one
// team a module's objects all share one prefix. Every module below stores its
// reference in an ordinary text column that a caller may WRITE:
//
//   1. set account B's logo to the `/media/…` path account A is using,
//   2. change B's logo again.
//
// Step 2 supersedes a URL that passes every ownership test — same team, same
// module, one object — and A's logo is gone. Same tenant, no disclosure, an
// image that 404s and a nightly backup to restore it from; but it is an integrity
// regression the code did not have before anything deleted at all, and it is
// reachable by a machine caller with an ordinary edit right. The same shape
// appears inside a single row: an account whose logo and cover point at one
// object loses the cover when the logo is replaced.
//
// So the delete asks a second question, of the DATABASE rather than of the key:
// does any row still name this object? A yes means the caller has superseded a
// reference to something somebody else is using, which is not a reclaim.
//
// ── WHY IT IS CHEAP ─────────────────────────────────────────────────────────
//
// It runs only where `supersededMedia` found a change AND `ownedMediaKey` proved
// ownership — a person actually replacing a picture, which is rare — and it is
// one indexed-shaped comparison per column. The path that costs nothing is the
// ordinary save, which never gets here.

import { d1Query, type D1Rest } from "./d1-rest"

/** WHERE A REFERENCE COULD STILL LIVE: a table, and the columns on it that hold a
 * `/media/...` path. Every column that can point at this module's objects has to
 * be listed, including the ones on OTHER tables — the staff upload door's answer
 * lands on a profile's photo or a certificate's file and never learns which, so
 * both are named or half the question goes unasked.
 *
 * Table and column names are interpolated into the statement because SQL has no
 * identifier parameters. They are compile-time literals at every call site — never
 * a request value — which is the same rule the mover states at its own boundary. */
export type MediaReferences = { table: string; columns: string[] }[]

/** The subset of `keys` that NOTHING in `references` still names.
 *
 * Nulls pass straight through as nulls: `ownedMediaKey` has already answered "not
 * ours" for those and `reclaimMedia` skips them, so this neither re-asks nor
 * changes the shape the caller is holding.
 *
 * FAILS CLOSED. A database error here answers "still referenced" for every key —
 * an orphan costs storage, and deleting an object somebody is using costs a file.
 * The two are not the same size of mistake, and this is the one place that gets
 * to choose which way to be wrong. */
export async function unreferencedKeys(
  cfg: D1Rest,
  databaseId: string,
  /** The URL prefix these keys are stored under — `/media/` or `/media/internal/`.
   * The stored value is that prefix plus the key, sometimes with a `?v=` cache
   * buster after it, so the comparison has to allow both. */
  base: string,
  keys: (string | null)[],
  references: MediaReferences
): Promise<(string | null)[]> {
  const wanted = keys.filter((k): k is string => Boolean(k))
  if (!wanted.length) return keys

  const held = new Set<string>()
  try {
    for (const key of wanted) {
      const url = `${base}${key}`
      for (const { table, columns } of references) {
        const where = columns.map((c) => `(${c} = ? OR ${c} LIKE ?)`).join(" OR ")
        const params = columns.flatMap(() => [url, `${url}?%`])
        const rows = await d1Query<{ hit: number }>(
          cfg,
          databaseId,
          `SELECT 1 AS hit FROM ${table} WHERE ${where} LIMIT 1`,
          params
        )
        if (rows.length) {
          held.add(key)
          break
        }
      }
    }
  } catch {
    // See the contract above: unable to ask means treat every key as held.
    return keys.map(() => null)
  }
  return keys.map((k) => (k && held.has(k) ? null : k))
}
