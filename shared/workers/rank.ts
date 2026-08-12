// DRAG-RANK — the order a person chose, stored so two people dragging at once
// cannot fight over it (SCOPE ch.07: "drag-rank is the only priority signal").
//
// WHY A STRING AND NOT A NUMBER. The obvious shape is an integer position, and it
// is wrong twice: reordering one row rewrites every row below it (an O(n) write
// for a drag), and two people dragging at the same instant renumber the same
// range from two different starting pictures. A SPARSE key fixes both — moving a
// row writes ONE row, and the value written is derived only from its two new
// neighbours, so a concurrent drag somewhere else in the list cannot collide with
// it. A float would do the same job until it runs out of mantissa; a string never
// runs out, it just gets one character longer.
//
// WHY IT COMPOSES WITH THE PAGING SEAM. shared/workers/paging.ts keys a page on a
// TEXT sort value plus the row id. A text rank is that value already — no cast, no
// second cursor shape, and `ORDER BY rank DESC, id DESC` stays a total order, so a
// list can be dragged and paged at the same time without duplicating or dropping a
// row mid-scroll.

/** The rank alphabet, in ASCII order so a string comparison in SQLite and a
 * string comparison here are the same comparison. Deliberately the same shape a
 * ULID uses (uppercase alphanumeric), so an id can stand in as a starting rank. */
const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const BASE = ALPHA.length

/**
 * A rank strictly between `before` and `after` — either may be null, meaning "no
 * bound that side" (the top or the bottom of the list).
 *
 * Callers pass them in ASCENDING order: `before` is the smaller neighbour.
 * `rankBetween(null, null)` is the first rank in an empty list.
 *
 * THE ONE INPUT IT CANNOT SERVE is an `after` made entirely of the alphabet's
 * first character ("0", "00", …) — there is no string below it that this function
 * can spell without an empty result. It cannot arise: every rank this function
 * RETURNS ends in a character strictly above the floor (the midpoint of a range
 * whose top is at least 2 above its bottom is at least 1), and the only other
 * source of a rank is a ULID, which carries a timestamp and so is never all
 * zeros. rank.test.ts holds that invariant so it stays true.
 */
export function rankBetween(before: string | null, after: string | null): string {
  const lo = before ?? ""
  const hi = after ?? ""
  let out = ""
  // Once we have taken a character strictly below `hi`'s, every position after it
  // is free — "0AAA" is below "1" whatever follows. Without this flag the walk
  // would keep honouring an upper bound it has already cleared.
  let clearedHi = false
  for (let i = 0; ; i++) {
    const l = i < lo.length ? Math.max(0, ALPHA.indexOf(lo[i])) : 0
    const h = clearedHi || i >= hi.length ? BASE : Math.max(0, ALPHA.indexOf(hi[i]))
    // Room for a character strictly between the two → that is the answer.
    if (l + 1 < h) return out + ALPHA[Math.floor((l + h) / 2)]
    // No room at this position: keep the low neighbour's character and look one
    // place deeper, where the range has opened up again.
    out += ALPHA[l]
    if (h > l) clearedHi = true
  }
}

/** The rank a BRAND-NEW row takes: above everything already there.
 *
 * `highest` is the largest rank in the list today (null when it is empty). Two
 * rows created in the same instant can read the same `highest` and land on the
 * same rank — deliberately survivable rather than locked: they are both "newest",
 * the id tiebreak in `ORDER BY rank DESC, id DESC` still gives a total order, and
 * the first person to drag either of them separates the pair for good. Paying for
 * a lock here would buy nothing a person could notice. */
export function rankAtTop(highest: string | null): string {
  return rankBetween(highest, null)
}
