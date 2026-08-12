// Two field rules the four agency-internal modules share, written once.
//
// Both are BOUNDARY rules in the R20 sense — they take `unknown`, decide, and
// either hand back a clean value or throw the GuardError the worker's central
// catch turns into a 400. Neither of them is a cast, and neither of them is a
// truthiness guard.

import { GuardError } from "@shared/workers/gating"

/** A CALENDAR DAY, or nothing, or a refusal.
 *
 * Four of the six internal tables carry a date somebody types: when a post went
 * out, when a certificate was granted, when it lapses. They are DAYS, not
 * instants — nobody publishes at 14:32:07 — so the stored shape is YYYY-MM-DD,
 * and this is the only door into it.
 *
 * IT REFUSES RATHER THAN COERCING, and that is the whole point of writing it
 * down. `new Date("31/12/2026")` is `Invalid Date` in one runtime and a real
 * date in another; `new Date("2026-13-45")` silently rolls over into 2027. A
 * value that is nearly a date is the worst kind of bad data, because it sorts,
 * it renders, and it is wrong — so anything that is not exactly a real calendar
 * day, written the one way, is a clean 400 at the door instead of a row that
 * looks fine until somebody sorts by it.
 *
 * Blank / absent → undefined, so the column stays NULL: "we don't know when"
 * is a real and common answer, and it is not the same as a bad answer.
 */
export function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw new GuardError(400, "invalid_input", `${field} must be a date (YYYY-MM-DD).`)
  const v = value.trim()
  if (!v) return null
  // The shape first — so "2026-6-1" and "1 June 2026" are refused by name rather
  // than being handed to a parser that might like one of them.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) throw new GuardError(400, "invalid_input", `${field} must be a date written as YYYY-MM-DD.`)
  // …then the CALENDAR, because the shape can't tell you 2026-02-31 isn't a day.
  // Round-tripping through UTC is what catches the roll-over: Date turns the 31st
  // of February into the 3rd of March, and the strings then differ.
  const [, y, mo, d] = m
  const parsed = new Date(`${v}T00:00:00Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(y) ||
    parsed.getUTCMonth() + 1 !== Number(mo) ||
    parsed.getUTCDate() !== Number(d)
  )
    throw new GuardError(400, "invalid_input", `${field} isn't a real date.`)
  return v
}

/** Allow only safe link schemes (http / https / mailto).
 *
 * A `javascript:` / `data:` / `vbscript:` URL stored on a record is a
 * stored-XSS payload the moment a reader clicks it. Learning has carried this
 * rule privately since its first commit; the internal modules store links too (a
 * post's permalink, a brand asset's home, a certificate's PDF), so it is here
 * where all of them can reach it. Anything unrecognised is dropped rather than
 * refused — a link is optional, and losing a bad one costs nothing.
 */
export function safeExternalLink(url: unknown): string | null {
  const v = typeof url === "string" ? url.trim() : ""
  if (!v) return null
  try {
    const u = new URL(v, "https://x.invalid")
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? v : null
  } catch {
    return null
  }
}
