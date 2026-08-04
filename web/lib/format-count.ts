// THE ONE seam every collection count badge renders through (R16). The number a
// badge shows is an exact server COUNT(*) — never a loaded list's length (a
// capped list's length is a ceiling, not a total: that is how a 24,011-row
// catalogue once advertised "1000"). This file owns the presentation rules:
//
//   • Abbreviate at EVERY magnitude, with NO ceiling: 1k · 1.3k · 24k · 400k ·
//     1.2m · 2.2b — rounded DOWN, so a badge never over-claims.
//   • Zero and still-loading render NOTHING ("") — never a "0" that reads as
//     an empty collection while the real rows are still on their way.
//   • The ONLY "+" in the whole app is a FILTERED SEARCH total that hit
//     SEARCH_TOTAL_CAP (formatSearchTotal) — a collection count can never
//     produce one, because a collection total is always exact.
//   • A PAGINATED screen still badges the WHOLE collection: 20 rows on screen
//     over 10,000 total reads "10k".

/** A filtered-search total at or beyond this cap renders as "1m+" — counting
 * past it costs more than the number is worth. Collections never hit this path. */
export const SEARCH_TOTAL_CAP = 1_000_000

/** One unit step of the abbreviation ladder, rounded DOWN. <10 units keeps one
 * decimal (1.3k), ≥10 drops it (24k) — both floored so the badge never over-claims. */
function abbrev(n: number, unit: number, suffix: string): string {
  const tenths = Math.floor((n / unit) * 10) / 10
  if (tenths >= 10) return `${Math.floor(n / unit)}${suffix}`
  // Strip a trailing .0 (1.0k → 1k) — floor already guaranteed no over-claim.
  return `${tenths % 1 === 0 ? Math.floor(tenths) : tenths}${suffix}`
}

/** An exact collection total → its badge text. Zero / undefined / null → "" (render
 * nothing). Below 1000 the exact number; above, the floored abbreviation ladder. */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return ""
  const v = Math.floor(n)
  if (v < 1_000) return String(v)
  if (v < 1_000_000) return abbrev(v, 1_000, "k")
  if (v < 1_000_000_000) return abbrev(v, 1_000_000, "m")
  return abbrev(v, 1_000_000_000, "b")
}

/** A FILTERED SEARCH total → its badge text. The one place a "+" may appear: a
 * total that hit SEARCH_TOTAL_CAP renders "1m+" (the true count was not paid for). */
export function formatSearchTotal(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return ""
  if (n >= SEARCH_TOTAL_CAP) return `${formatCount(SEARCH_TOTAL_CAP)}+`
  return formatCount(n)
}
