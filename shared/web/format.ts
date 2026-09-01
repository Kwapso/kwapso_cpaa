// Shared display formatters — ONE source so dates look identical everywhere
// (members list, activity feed, overview tabs). No duplication of date logic.
//
// LOCALE IS EXPLICIT, NEVER AMBIENT. Every formatter below takes a required
// `lang: Language` and hands it straight to `Intl` as the locale. Passing
// `undefined` instead — the shape this file used to be — asks `Intl` to
// resolve the RUNTIME's ambient default locale, which is Node's default
// during server rendering and the browser's during client hydration. Those
// two are not guaranteed to agree ("Mar 12, 2024" vs "12 Mar 2024" for the
// same instant), and when they disagree React's hydration throws — on a plain
// date, with no network involved and nothing else wrong. Ruling 07 in the kit
// (`shared/ui/`) already says this for every date-shaped component there:
// "Dates follow the app language, not the browser" — formatting is the
// CALLER's job, done with the app's own current language. `Language` codes
// ("en", "de", "es", "ca") are themselves valid BCP-47 tags, so they pass to
// `Intl` directly with no mapping table.
//
// Required rather than optional, for the same reason `formatRelative`'s `t`
// is required (see its own comment, below): an optional `lang` defaulting to
// `undefined` is the ambient-default failure this file exists to close,
// spelled as an API. Required, TypeScript names every call site that forgot.

import type { Language } from "../i18n"

/** "13 Jun 2026" — for dates where the time of day doesn't matter. */
export function formatDate(iso: string | null | undefined, lang: Language): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric" })
}

/** "13 Jun" — a date with the year left off, for an AXIS.
 *
 * Its own formatter rather than a slice of `formatDate`, for the reason this
 * file exists: eight of these sit side by side under a chart, and "13 Jun 2026"
 * eight times over is four repetitions of a fact nobody is reading and a row of
 * labels that overlap on a phone. The year is dropped and nothing else is —
 * still the reader's own locale, still one place. Use it ONLY where the
 * surrounding copy already says which period is on screen ("the last eight
 * weeks"); anywhere a date stands alone, `formatDate` is the one. */
export function formatDayMonth(iso: string | null | undefined, lang: Language): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(lang, { month: "short", day: "numeric" })
}

/** "14:05" — the clock time alone, for a row whose DAY is already said.
 *
 * Its own formatter for the same reason `formatDayMonth` is: an agenda groups
 * its rows under the day, so every row repeating "13 Jun 2026" is a fact nobody
 * is reading four times down one screen — but the TIME is the whole reason a
 * person opens the day at all. Still the reader's own locale, still one place. */
export function formatTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(lang, { timeStyle: "short" })
}

/** "2026-06-13" — a date for a COLUMN SOMEBODY SORTS.
 *
 * IT IS THE SAME DECISION `formatActivityWhen` MAKES ONE FUNCTION DOWN, and for
 * the same reason: the library's collection engine compares a column with
 * `String(a).localeCompare(String(b))` unless BOTH values are already numbers,
 * and the library is lego this repo does not edit (UI-GAPS #22 asks for a typed
 * comparison). So a column showing "14 Apr 2025" sorts alphabetically — April
 * before January, 2019 between 2018 and 2020 only by luck — and it does it
 * silently: the rows move, so the control looks like it worked. The owner's
 * report was "the sort actually doesn't work… I don't see the order changing,
 * even though I can see that there are different values", which is what a wrong
 * comparison looks like from the outside.
 *
 * A value cannot be both `formatDate`'s and sortable, because the thing being
 * compared IS the thing being shown. So the value that has to give is the one
 * whose job is to be compared. Year-month-day, zero-padded, so lexical order is
 * chronological order — unambiguous in every locale this app is translated into,
 * which a locale-formatted date in a sortable column is not.
 *
 * USE IT ONLY IN A TABLE COLUMN. A date standing alone in a sentence, a subtitle
 * or a detail is `formatDate`'s, and stays warm. */
export function formatDateSortable(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "13 Jun 2026, 14:05" — for activity rows where the moment matters. */
export function formatDateTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" })
}

/** "2026-06-30 21:50" — the timestamp for activity-feed rows. The library
 * ActivityFeed both re-sorts by this string (localeCompare) AND shows it raw, so
 * it must be sortable-and-readable: 24-hour, zero-padded, so lexical order equals
 * chronological order. ONE source, like the other formatters. */
export function formatActivityWhen(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** The `t` every screen already holds (`useT()` / `useLanguage()`), structurally.
 * Named here so a formatter can ask for it without importing the whole engine —
 * `shared/i18n.ts` pulls in the 1.4 MB generated catalogue, and a date
 * formatter has no business doing that. */
export type Translate = (english: string, vars?: Record<string, string | number>) => string

/** "just now" · "5m ago" · "3h ago" · "2d ago", then falls back to a date — for
 * conversation timestamps (ticket replies) where recency matters more than the
 * exact clock time. ONE source, like the other formatters.
 *
 * IT TAKES `t` AND THE PARAMETER IS REQUIRED. For a year this function returned
 * four English strings to nine call sites across BOTH front doors — a message
 * bubble's timestamp, an attachment's meta line, the record footer, the ticket
 * list — and none of them was in any catalogue, because this file sits in
 * `shared/web/` and the extractor was a list of six folders that did not name
 * it. So `t("Created by {name} · {when}")` translated its own half of the line
 * into German and rendered "vor" nowhere: *Erstellt von Aurora · 5d ago*.
 *
 * Required rather than optional, and that is the whole design of the parameter.
 * An optional `t` defaulting to English is the failure this is fixing, spelled
 * as an API: it compiles at every call site that forgets, and it is invisible
 * to every check here. Required, TypeScript names the nine.
 *
 * THE HOLES ARE WHERE THEY ARE FOR THE TRANSLATOR, NOT FOR US. `{count}m ago`
 * is one catalogue entry with one hole rather than a number glued to a unit
 * glued to a word: German puts the preposition in front (*vor 5 Min.*) and
 * Japanese puts the whole thing behind the number (*5分前*), and neither is
 * reachable by concatenating fragments a translator cannot reorder.
 *
 * AND IT STAYS TERSE. Seven of the nine call sites are tight — table cells with
 * `tabular-nums`, attachment meta lines, message-bubble timestamps — so the
 * words stay as short as each language can make them. This is the app's ONE
 * relative-time vocabulary; nothing else may grow a second.
 *
 * `lang` RIDES ALONGSIDE `t` FOR THE SAME REASON. The fallback branch below
 * calls `formatDate`, whose own locale argument is required, so this function
 * needs one to hand it — required, not defaulted, for the reasoning above. */
export function formatRelative(iso: string | null | undefined, t: Translate, lang: Language): string {
  if (!iso) return ""
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return t("just now")
  const mins = Math.round(secs / 60)
  if (mins < 60) return t("{count}m ago", { count: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t("{count}h ago", { count: hrs })
  const days = Math.round(hrs / 24)
  if (days < 7) return t("{count}d ago", { count: days })
  // Past a week it is an absolute date, in the reader's own app language. That
  // half is `formatDate`'s and is deliberately untouched: a date is not a
  // sentence. `lang` rides alongside `t` for the same reason `t` is required
  // above — an ambient default here is exactly the bug this file just had.
  return formatDate(iso, lang)
}

// ── the datetime-local pair ───────────────────────────────────────────────────
// `<input type="datetime-local">` speaks LOCAL WALL-CLOCK with no offset on it,
// and the doors store instants. These two are that boundary, in both directions.
//
// They live here rather than beside a form because the reasoning is subtle and
// was already written out twice, in two spellings, under two names: a meeting
// form and a work-log form each carried a `toLocalInput` plus an inverse called
// `toMoment` in one file and `toInstant` in the other. Two implementations of one
// rule is how "10:00" and "09:00" end up on two screens showing the same row.

/** A stored moment (ISO, UTC) → what `<input type="datetime-local">` wants, in
 * the READER'S own timezone. Built from the local parts rather than
 * `toISOString().slice(…)`, which would silently show UTC — the difference
 * between "10:00" and "09:00" for anybody outside it, and a meeting shown an
 * hour out is a meeting somebody misses. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ""
  const at = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** …and back. The browser hands back "2026-08-12T09:00" with no zone, so reading
 * it as LOCAL is exactly right: it is the zone the person was sitting in, which
 * is the zone they meant. The door stores the instant. */
export function toMoment(local: string): string {
  if (!local) return ""
  const ms = Date.parse(local)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ""
}

// ── the date-only pair ────────────────────────────────────────────────────────
// `<input type="date">`'s replacement, the kit's `DatePicker` in `mode="date"`,
// speaks a `Date` at midnight in the READER'S OWN clock; the doors store
// `YYYY-MM-DD`. Built from local parts in both directions, never through
// `toISOString()`: a local midnight read back out through UTC lands on the day
// before it everywhere east of Greenwich, and a stored day parsed with
// `new Date("2026-06-13")` (which reads a date-only string as UTC, not local)
// lands on the day before THAT everywhere west of it. Same shape of bug as the
// datetime-local pair above, one field narrower.

/** A stored day (`YYYY-MM-DD`) → a `Date` at local midnight, for `DatePicker`'s
 * `value`. `null` when nothing is stored, which `DatePicker` reads as unset. */
export function dateFromYMD(ymd: string | null | undefined): Date | null {
  if (!ymd) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** …and back. `DatePicker` hands back local midnight; the local calendar date IS
 * the day meant, so it is read off local parts and never off `toISOString()`. */
export function ymdFromDate(date: Date | null): string {
  if (!date) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** THE POSTAL ADDRESS AS ONE LINE, from the four fields it is stored in.
 *
 * It lives here for the reason `hoursText` lives beside the savings arithmetic:
 * both front doors render this, and two copies of a formatter are the drift the
 * money seam had to be written to stop. A formatter knows no table, no door and
 * no audience, so it is safe on both sides of the fence.
 *
 * The address is FOUR fields in the database on purpose — a country typed free
 * is a country spelled five ways, and "which of our clients are in Berlin?" is a
 * question one text column cannot answer. It is one LINE on a screen just as
 * often, and this is that line. Empty parts drop out, so a record with only a
 * city reads "Madrid" rather than ", , Madrid, ". */
export function postalAddress(parts: {
  street?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
}): string {
  return [parts.street, [parts.postalCode, parts.city].filter(Boolean).join(" "), parts.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ")
}
