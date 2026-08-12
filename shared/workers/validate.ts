// Input-boundary validation for worker request handlers. The bare
// `body.field?.trim()` pattern only guards null/undefined — a non-string (number,
// array, object, boolean) makes `.trim` undefined and throws a TypeError, which the
// central catch turns into a 500. SQLite (D1) also rejects embedded NUL bytes
// (U+0000) → another 500. And nothing capped text length, so a multi-MB string
// either bloated a row or 500'd. These helpers type-check, strip NULs, cap length,
// and throw a GuardError the worker already maps to a clean 400 — one validation seam.

import { GuardError } from "./gating"

// Sane per-kind caps — generous for prose, tight for short labels.
export const TEXT_LIMITS = {
  short: 200, // titles, names, categories, type/value labels
  link: 2_048, // URLs
  long: 20_000, // descriptions, article bodies, replies
  message: 10_000, // agent chat turns
} as const

const NUL = String.fromCharCode(0)
const stripNul = (s: string) => s.split(NUL).join("")

/** A REQUIRED text field: must be a non-empty string after NUL-strip + trim, within
 * `max` chars. Throws a clean 400 GuardError on a non-string, blank, or over-long value. */
export function requireText(value: unknown, field: string, max: number = TEXT_LIMITS.long): string {
  if (typeof value !== "string") throw new GuardError(400, "invalid_input", `${field} must be text.`)
  const clean = stripNul(value).trim()
  if (!clean) throw new GuardError(400, "invalid_input", `${field} is required.`)
  if (clean.length > max)
    throw new GuardError(400, "invalid_input", `${field} is too long (max ${max} characters).`)
  return clean
}

/** An OPTIONAL text field: null/undefined/blank → undefined; otherwise must be a
 * string within `max` chars (NULs stripped, trimmed). Throws a clean 400 GuardError
 * on a non-string or over-long value. */
export function optionalText(
  value: unknown,
  field: string,
  max: number = TEXT_LIMITS.long
): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new GuardError(400, "invalid_input", `${field} must be text.`)
  const clean = stripNul(value).trim()
  if (!clean) return undefined
  if (clean.length > max)
    throw new GuardError(400, "invalid_input", `${field} is too long (max ${max} characters).`)
  return clean
}

/** A QUERY-STRING parameter — the OTHER half of the request boundary. Bodies have
 * gone through requireText/optionalText since day one, but `url.searchParams.get()`
 * handed its raw string straight on: a multi-megabyte `?id=` became a multi-megabyte
 * SQL statement (or a multi-megabyte atob + JSON.parse in the cursor decoder) — a 500
 * and a stalled worker where a clean 400 belonged. Same treatment, ONE seam, so the
 * query half of the boundary can never drift from the body half.
 *
 * The cap DEFAULTS to `short`, because that is what a query parameter is here: an id,
 * an opaque cursor, a facet value, a search phrase. One that genuinely carries prose
 * passes its own max. */
export function queryText(
  value: string | null,
  field: string,
  max: number = TEXT_LIMITS.short
): string | undefined {
  return optionalText(value, field, max)
}

/** A MOMENT IN TIME at the boundary — required.
 *
 * It lives here rather than beside the work logs that needed it first because it
 * is the same kind of thing as the three above: a type check, a cap, and a clean
 * 400 instead of a 500. `Date.parse` accepts a great deal of nonsense and returns
 * NaN for the rest, and NaN reaching a duration is an hour that never happened
 * sitting in a total nobody can explain.
 *
 * NORMALISED on the way out, deliberately: whatever spelling arrived, what gets
 * written is an ISO string in UTC. Two rows that mean the same instant must not
 * sort differently because one of them said "+02:00". */
export function requireMoment(value: unknown, field: string): string {
  const text = requireText(value, field, TEXT_LIMITS.short)
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) throw new GuardError(400, "invalid_input", `${field} isn't a date and time.`)
  return new Date(ms).toISOString()
}

/** The optional half: absent or blank → undefined; anything present must be a
 * real moment. */
export function optionalMoment(value: unknown, field: string): string | undefined {
  const text = optionalText(value, field, TEXT_LIMITS.short)
  if (text === undefined) return undefined
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) throw new GuardError(400, "invalid_input", `${field} isn't a date and time.`)
  return new Date(ms).toISOString()
}
