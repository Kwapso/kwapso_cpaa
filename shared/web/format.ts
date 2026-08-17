// Shared display formatters — ONE source so dates look identical everywhere
// (members list, activity feed, overview tabs). No duplication of date logic.

/** "13 Jun 2026" — for dates where the time of day doesn't matter. */
export function formatDate(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

/** "13 Jun 2026, 14:05" — for activity rows where the moment matters. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
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

/** "just now" · "5m ago" · "3h ago" · "2d ago", then falls back to a date — for
 * conversation timestamps (ticket replies) where recency matters more than the
 * exact clock time. ONE source, like the other formatters. */
export function formatRelative(iso?: string | null): string {
  if (!iso) return ""
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
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
