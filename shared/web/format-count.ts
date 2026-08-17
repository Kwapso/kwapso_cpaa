// THE ONE seam every collection count badge renders through (R16). The number a
// badge shows is a server COUNT(*) — never a loaded list's length (a capped
// list's length is a ceiling, not a total: that is how a 24,011-row catalogue
// once advertised "1000"). This file owns the presentation rules:
//
//   • Abbreviate at EVERY magnitude, with NO ceiling: 1k · 1.3k · 24k · 400k ·
//     1.2m · 2.2b — rounded DOWN, so a badge never over-claims.
//   • Zero and still-loading render NOTHING ("") — never a "0" that reads as
//     an empty collection while the real rows are still on their way.
//   • A "+" means "at least": a total that hit TOTAL_COUNT_CAP. Since R16 was
//     amended on 2026-08-14 that is true of a COLLECTION total as well as a
//     filtered SEARCH one, for the same reason and at the same number — counting
//     further costs more than the number is worth.
//   • A PAGINATED screen still badges the WHOLE collection: 20 rows on screen
//     over 10,000 total reads "10k".

import { TOTAL_COUNT_CAP } from "@shared/workers/limits"

/** One unit step of the abbreviation ladder, rounded DOWN. <10 units keeps one
 * decimal (1.3k), ≥10 drops it (24k) — both floored so the badge never over-claims. */
function abbrev(n: number, unit: number, suffix: string): string {
  const tenths = Math.floor((n / unit) * 10) / 10
  if (tenths >= 10) return `${Math.floor(n / unit)}${suffix}`
  // Strip a trailing .0 (1.0k → 1k) — floor already guaranteed no over-claim.
  return `${tenths % 1 === 0 ? Math.floor(tenths) : tenths}${suffix}`
}

/** The abbreviation ladder, with no cap rule in it — so the cap rule can use it
 * without re-entering the function that owns the cap rule. (The first draft of
 * the amendment called `formatCount(CAP)` from inside `formatCount` and recursed
 * for ever; its own test caught it.) */
function ladder(v: number): string {
  if (v < 1_000) return String(v)
  if (v < 1_000_000) return abbrev(v, 1_000, "k")
  if (v < 1_000_000_000) return abbrev(v, 1_000_000, "m")
  return abbrev(v, 1_000_000_000, "b")
}

/** A total → its badge text. Zero / undefined / null → "" (render nothing).
 * Below 1,000 the exact number; above, the floored abbreviation ladder; at or
 * beyond the cap, the cap wearing a "+" ("1m+") because that is where the door
 * stopped counting. */
function formatTotal(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return ""
  if (n >= TOTAL_COUNT_CAP) return `${ladder(TOTAL_COUNT_CAP)}+`
  return ladder(Math.floor(n))
}

/** A COLLECTION total → its badge text ("how many are there").
 *
 * Below the cap this behaves exactly as it always has, byte for byte — which is
 * the whole of what the 2026-08-14 amendment to R16 changed, and why no screen in
 * the product renders differently today: the largest collection that exists is
 * 2,253 rows against a 1,000,000 ceiling. */
export const formatCount = formatTotal

/** A FILTERED SEARCH total → its badge text ("how many match what I typed").
 *
 * THE SAME ARITHMETIC as `formatCount`, and deliberately so: since the amendment
 * both stop counting at `TOTAL_COUNT_CAP`, so one implementation is how they stay
 * agreed. The two NAMES survive because the call sites are answering different
 * questions and a reader should be able to tell which — and because R16 and
 * SEARCH.md each own one of them. Collapsing the names would save a line and cost
 * the distinction the two laws are written about. */
export const formatSearchTotal = formatTotal
