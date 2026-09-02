// Input-boundary validation for worker request handlers. The bare
// `body.field?.trim()` pattern only guards null/undefined — a non-string (number,
// array, object, boolean) makes `.trim` undefined and throws a TypeError, which the
// central catch turns into a 500. SQLite (D1) also rejects embedded NUL bytes
// (U+0000) → another 500. And nothing capped text length, so a multi-MB string
// either bloated a row or 500'd. These helpers type-check, strip NULs, cap length,
// and throw a GuardError the worker already maps to a clean 400 — one validation seam.

import { GuardError } from "./gating"
import { MAX_IMAGE_BYTES } from "./image"

// Sane per-kind caps — generous for prose, tight for short labels.
export const TEXT_LIMITS = {
  // A TYPE MARK — a short word, initial or two-letter code in the slot an icon
  // would take (UI-CONVENTIONS §5). It used to invite a single pictograph
  // (UI-RULEBOOK G2); the client's ruling on 2026-08-31 ("i said no emojis. why
  // are there still emojis? kill them!") retired that, and `shared/app-stages.ts`
  // shows the replacement shape — the same one-mark-per-type idea, spelled in
  // letters instead ("MT", not a pictograph). Eight is still generous: room for
  // "Voucher" and nowhere near a sentence. The length cap is only ever the
  // length half of the rule — `optionalMark` below is what actually refuses the
  // pictograph.
  tiny: 8,
  short: 200, // titles, names, categories, type/value labels
  link: 2_048, // URLs
  long: 20_000, // descriptions, article bodies, replies
  message: 10_000, // agent chat turns
} as const

/** A WHOLE DOCUMENT, in BYTES rather than characters — the one cap in this file
 * that is not a character count, because the thing it is protecting is not one.
 *
 * A source in the knowledge base can be a contract, a transcript, a book. The
 * ceiling on it is D1's: a single row (and any one string in it) may be
 * 2,000,000 bytes. Cap the CHARACTERS at, say, a million and a German document
 * full of umlauts is 1.1 MB while a Chinese one is 3 MB — the same "limit"
 * refusing one person's file and corrupting another's. So the number is bytes,
 * measured as the database will measure them, with 500 KB left over for the rest
 * of the row.
 *
 * 1.5 MB is roughly six hundred pages of prose — twice the three-hundred-page
 * contract this was sized for. Above it the upload is REFUSED, in words, saying
 * how big it was and what to do; nothing is ever silently trimmed. */
export const DOCUMENT_LIMIT_BYTES = 1_500_000

/** THE CAP ON A PICTURE FIELD — in the units of whatever actually arrived,
 * because two different things arrive through the same field.
 *
 * `logoUrl` (and `coverUrl`, and an app's mark) carries EITHER the file a person
 * just picked, as a `data:` URL on its way to R2, OR the `/media/...` path the
 * row already holds and the form handed straight back. One character cap cannot
 * be right for both, and the one that was there — `TEXT_LIMITS.long`, the PROSE
 * cap — was right for neither. 20,000 characters is about 14 KB of image, and
 * the picker's own output is a 512px JPEG at 30–80 KB, so every real logo came
 * back "Logo is too long (max 20000 characters)" and `storeImageDataUrl`, the
 * seam that exists to turn those bytes into an object, was never reached. The
 * comment at the call site said the byte cap downstream was the one that
 * mattered. It was. It never got a turn: the prose cap sat 166× below it.
 *
 * So the cap follows the SHAPE. A data URL is measured against exactly what the
 * store seam will take — `MAX_IMAGE_BYTES`, base64-expanded, DERIVED so the two
 * cannot drift — which leaves the real refusal where it belongs, in bytes, off
 * the encoded text, before anything decodes. Anything else is a path, and a path
 * is a link.
 *
 * One generous cap for both would have been a line shorter and would have put a
 * different hole in: `logo_url` is a COLUMN, read on every row of every list,
 * and a value that is not a data URL passes through the store seam untouched and
 * lands in it. Megabytes of "not a data URL" is the row-bloat-or-500 this whole
 * file was written to stop. */
export const imageFieldLimit = (value: unknown): number =>
  typeof value === "string" && value.startsWith("data:")
    ? Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 // base64 expansion + the `data:image/jpeg;base64,` header
    : TEXT_LIMITS.link

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

/** R20, THE CLIENT'S RULING (2026-08-31, verbatim: "i said no emojis. why are
 * there still emojis? kill them!"): a "mark" field — a dropdown value's type
 * mark, an app section's icon, a client tool's icon — may never store a
 * pictograph again, for any team, going forward. A live example reached
 * staging (a warning sign, U+26A0, saved as the "Issue" ticket kind's mark)
 * because nothing at the write door checked for one; `optionalText` alone
 * type-checks and caps length, it was never asked to refuse a GLYPH.
 *
 * Matched on the Unicode PROPERTY rather than a fixed code-point table, so a
 * future emoji release does not need a registry update here:
 * `Extended_Pictographic` is the pictograph itself (the warning sign above is
 * one), `Regional_Indicator` is a flag's own two-letter pair, and the
 * variation selector / ZWJ / keycap combiner are what stitch a multi-code-point
 * emoji (a skin tone, a flag, a joined sequence) into one glyph — the same
 * multi-code-point shape `TEXT_LIMITS.tiny`'s own comment already accounts for
 * on the length side. */
// The pictograph properties above catch the glyph itself; these three
// combiners (ZERO WIDTH JOINER U+200D, VARIATION SELECTOR-16 U+FE0F, COMBINING
// ENCLOSING KEYCAP U+20E3) are what stitch a multi-code-point emoji — a joined
// sequence, a text glyph forced to its emoji style, a keycap digit — into one.
// Named by codepoint via `fromCharCode` rather than pasted as literal
// invisible characters, the same way UI-RULEBOOK.md names a glyph by its
// Unicode name so none appear in the source as an actual character.
const EMOJI_COMBINERS = String.fromCharCode(0x200d, 0xfe0f, 0x20e3)
const EMOJI_PATTERN = new RegExp(`\\p{Extended_Pictographic}|\\p{Regional_Indicator}|[${EMOJI_COMBINERS}]`, "u")

/** An OPTIONAL "mark" field — `optionalText` plus the one refusal every mark
 * needs now: no emoji. ONE seam, so a dropdown value, an app section and a
 * client tool can never drift back to three different regexes, or to none. */
export function optionalMark(
  value: unknown,
  field: string,
  max: number = TEXT_LIMITS.tiny
): string | undefined {
  const clean = optionalText(value, field, max)
  if (clean !== undefined && EMOJI_PATTERN.test(clean))
    throw new GuardError(400, "invalid_input", `${field} should be a short word or initial, not an emoji.`)
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

/** A DOCUMENT at the boundary — the same type-check and NUL-strip as
 * `optionalText`, but capped in BYTES and sized for whole documents rather than
 * for a paragraph.
 *
 * It is a separate function rather than `optionalText(value, field, 1_500_000)`
 * for two reasons that both bite. The character cap would be the wrong ceiling
 * (see DOCUMENT_LIMIT_BYTES). And a call site asking for a million characters of
 * "text" reads like a typo, so the next person tightens it — and tightening a
 * ceiling silently starts refusing files that used to go in.
 *
 * The refusal SAYS THE TWO NUMBERS. A ceiling nobody can see is indistinguishable
 * from a bug, and this one will be met by a person holding a file they cannot
 * split without being told how much to cut. */
export function optionalDocument(
  value: unknown,
  field: string,
  maxBytes: number = DOCUMENT_LIMIT_BYTES
): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new GuardError(400, "invalid_input", `${field} must be text.`)
  const clean = stripNul(value).trim()
  if (!clean) return undefined
  const bytes = new TextEncoder().encode(clean).length
  if (bytes > maxBytes)
    throw new GuardError(
      400,
      "too_large",
      `${field} is ${mb(bytes)} of text and the most we can take in one piece is ${mb(maxBytes)}. Nothing was saved. Split it and add the parts separately, and every part will be searchable.`
    )
  return clean
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

/** The optional half: absent or blank → undefined; anything present must be a
 * real moment. */
export function optionalMoment(value: unknown, field: string): string | undefined {
  const text = optionalText(value, field, TEXT_LIMITS.short)
  if (text === undefined) return undefined
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) throw new GuardError(400, "invalid_input", `${field} isn't a date and time.`)
  return new Date(ms).toISOString()
}

/** A stored JSON array cell → a string array, or an empty one.
 *
 * The column is written by this app, which is exactly why it is parsed
 * defensively: a half-written cell, a migration, or a hand-edit in the console
 * would otherwise throw inside a read and turn a list into a 500. Anything that
 * is not an array of strings is nothing at all, never a partial answer.
 *
 * `help_threads.tagged_user_ids` is the cell that earned it, and it was parsed by
 * two files a directory apart — the ticket thread and the stakeholder set — with
 * identical bodies and two different comments describing them. */
export function parseStringArray(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}
