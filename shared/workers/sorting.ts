// ORDERING — the third question a collection is asked, and the only one that
// never had a door.
//
// A collection is asked three things: which rows (the filters), which of those
// (the search), and IN WHAT ORDER. SEARCH.md moved the first two to the door the
// day it became clear the browser was answering them over page one. The third
// stayed in the browser, and it is the same defect wearing a different control:
// the library's `selectRows` sorts the array the frame is HOLDING, so sorting a
// paged collection sorts fifty of 254 rows and calls the result sorted. A person
// who sorts a list by name expects the first name in the collection at the top,
// not the first name among the newest fifty — and nothing on the screen says
// which they got.
//
// So: **a sort on a paged collection is a question for the DOOR**, and this is
// the seam that answers it. Three properties, and each is here rather than at
// seven call sites because each was a way to get it subtly wrong:
//
//  1. THE SQL IS OURS. A caller sends a NAME (`sort=name`); the door looks that
//     name up in a menu declared in our own source and uses the expression it
//     finds. No request text ever reaches a statement — the same reason
//     `accountsWhere` escapes a LIKE needle rather than trusting it.
//  2. THE EXPRESSION AND THE ROW KEY ARE ONE DECLARATION. A keyset page is three
//     things that must agree: the ORDER BY, the "everything after this row"
//     predicate, and the value the cursor is minted from. Written separately they
//     drift, and the symptom is page two starting somewhere page one did not
//     stop. Here the SQL and the row-reader sit in one object, so a menu entry
//     cannot half-exist.
//  3. THE CURSOR CARRIES ITS ORDERING. Changing the sort re-keys the client's
//     cache (paged-find.tsx), which is what makes "a new sort starts at page one"
//     structural rather than remembered. This is the belt under that: a cursor
//     minted under one ordering is REFUSED by another, with the 400 the paging
//     seam already has, so even a stale or hand-built cursor cannot produce a
//     page that reads as an answer and is not one.
//
// WHAT THIS IS NOT: a widening. The ordering never touches the WHERE, so it
// cannot show a caller a row the fence excluded (R18/R21). What it CAN do — and
// what a menu must be read for — is make a hidden VALUE inferable from a
// position, so a menu on a door the client portal forwards may only name columns
// that door already hands a client. `sorted-collections` in web/test/rules.test.ts
// holds both halves.

import { GuardError } from "./gating"

/** One thing a collection may be ordered by. The SQL and the row-reader are ONE
 * declaration on purpose (see 2 above): `expr` is what the database orders by and
 * `key` is the same value read back off a row, so the cursor is minted from the
 * column the rows were actually sorted on. */
export type SortOption<Row> = {
  /** The SQL expression to order by — a LITERAL in our own source. Never built
   * from anything a caller sent. */
  expr: string
  /** Where this option LANDS when it is picked. Dates want "desc" (newest
   * first), names want "asc"; landing on oldest-first reads as broken. The
   * caller may still flip it. */
  dir: "asc" | "desc"
  /** The same value `expr` sorts on, read off one row, for the keyset cursor. */
  key: (row: Row) => string | null
}

/** What one door may be ordered by, keyed by the name a caller sends. */
export type SortMenu<Row> = Record<string, SortOption<Row>>

/** A settled ordering: what to put in the statement, how to read a row's key back
 * out, and the signature the cursor carries so a stale one can be spotted. */
export type Ordering<Row> = {
  /** the menu name this resolved to — echoed back so a door can say what it did */
  name: string
  dir: "asc" | "desc"
  /** the NULL-safe expression both the ORDER BY and the keyset predicate use */
  expr: string
  key: (row: Row) => string | null
  /** `<name>:<dir>` — minted into every cursor, checked on every cursor */
  sig: string
}

/** NULL IS A POSITION TOO, and getting that wrong loses rows rather than
 * misplacing them.
 *
 * SQLite compares NULL to everything as NULL — never true — so a keyset
 * predicate over a nullable column silently excludes every row past the first
 * null one: the page simply stops, `hasMore` says there is more, and pressing it
 * returns the same emptiness forever. Coalescing to the empty string makes the
 * order TOTAL, which is the property a cursor needs, and it puts nulls exactly
 * where SQLite already put them (first ascending, last descending) so no visible
 * order changes. The cursor's own `k` is `?? ""` for the same reason and has
 * been since the seam was written — this is the other half of that decision,
 * finally written down beside it. */
const nullSafe = (expr: string): string => `COALESCE(${expr}, '')`

/** Settle what a request asked for against what a door offers.
 *
 * `sort` and `dir` arrive ALREADY through the validation seam (`queryText` at the
 * door, where the boundary is — R20 is positional, and a check one function
 * inside is a check a reader of the door cannot see). What is left is the part
 * that is this seam's own: is that a name this door knows, and is that a
 * direction at all.
 *
 * An unknown name is a 400, not a silent fall back to the default. A filter that
 * quietly answers a different question is the defect the accounts LIKE-escape
 * comment is about, and an ordering is a filter's cousin: a screen asking for
 * "by name" and getting "by newest" without being told is worse than a refusal,
 * because it looks like an answer. */
export function resolveOrdering<Row>(
  menu: SortMenu<Row>,
  fallback: string,
  sort: string | undefined,
  dir: string | undefined
): Ordering<Row> {
  const name = sort && sort !== "" ? sort : fallback
  const option = Object.prototype.hasOwnProperty.call(menu, name) ? menu[name] : undefined
  if (!option)
    throw new GuardError(
      400,
      "invalid_sort",
      `You can't sort by "${name}". Choose one of: ${Object.keys(menu).join(", ")}.`
    )
  if (dir !== undefined && dir !== "" && dir !== "asc" && dir !== "desc")
    throw new GuardError(400, "invalid_sort", 'Sort direction must be "asc" or "desc".')
  const direction = dir === "asc" || dir === "desc" ? dir : option.dir
  return {
    name,
    dir: direction,
    expr: nullSafe(option.expr),
    key: option.key,
    sig: `${name}:${direction}`,
  }
}

/** The whole `ORDER BY`, tiebreak included.
 *
 * The id tiebreak FOLLOWS THE KEY'S DIRECTION — always, and it is the one line
 * here that is easy to write wrong. `ORDER BY name ASC, id DESC` is a perfectly
 * good order and a broken keyset: the predicate that walks it (`name > ? OR
 * (name = ? AND id > ?)`) assumes both columns run the same way, so two rows
 * sharing a name would hide each other across a page boundary. One expression
 * builds both, so they cannot disagree.
 *
 * `idExpr` because half the paged reads join and their id is aliased (`s.id`,
 * `p.id`, `m.id`). */
export function orderBy<Row>(ordering: Ordering<Row>, idExpr = "id"): string {
  const d = ordering.dir === "asc" ? "ASC" : "DESC"
  return `ORDER BY ${ordering.expr} ${d}, ${idExpr} ${d}`
}

