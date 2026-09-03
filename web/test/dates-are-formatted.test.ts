// A DATE A PERSON READS GOES THROUGH THE ONE FORMATTER.
//
// `shared/web/format.ts` opens with "ONE source so dates look identical
// everywhere ... No duplication of date logic", and on 13 Aug 2026 seven render
// sites were putting the raw column on screen anyway. The sprint list read
//
//     Enhancement · 196+ · 2026-02-23T00:00:00.000Z → 2026-03-20T00:00:00.000Z
//
// on a screen built for a manager to scan. Nothing was broken and nothing failed;
// it just looked like a database, which is the failure this app is meant not to
// have.
//
// WIDENED 3 Sep 2026. The check used to enumerate nine field names by hand —
// `startsOn`, `endsOn`, `sprintEndsOn`, `dueOn`, `startsAt`, `endsAt`,
// `completedAt`, `publishedAt`, `resolvedAt` — and `createdAt`, carried by
// every activity row, comment and audit entry in the product, was not one of
// them. That omission is exactly the hole "the activity feed showed raw
// sortable dates" bug came through: a field nobody remembered to type. The
// hand-list is gone. What counts as an offence is now DERIVED from the shape
// of the code rather than a name a person had to remember:
//
//   1. `.toLocaleDateString(` / `.toLocaleTimeString(` — Date-only, no other
//      builtin carries either name, so any receiver counts. And
//      `.toLocaleString(` chained straight off a `new Date(...)` literal — the
//      exact shape this app's own bugs took (`new Date(x).toLocaleDateString()`
//      with no locale argument, asking `Intl` for whatever the RUNTIME's
//      ambient locale happens to be). `.toLocaleString(` on its own is NOT
//      enough: Number.prototype has one too, and this app leans on it for
//      money, byte counts and run counts (`shared/web/money.ts`,
//      `knowledge-upload-dialog.tsx`'s own KB chip, `margin-panel.tsx`'s
//      hours) — flagging every one of those would bury the real offenders in
//      noise.
//   2. Any field ending `At` or `On` — this app's own naming convention for a
//      moment or a calendar day (`createdAt`, `dueOn`, the works, derived by
//      SUFFIX rather than nine names someone had to remember to extend)
//      interpolated into a string, or handed to a `value:` or `dateTime:` key
//      — the two shapes that put text, or a screen-reader-spoken attribute, in
//      front of somebody.
//
// Both run over every file under web/, web-portal/ and shared/web/ EXCEPT
// shared/web/format.ts itself, which is the one place a raw `Intl` call
// belongs — widened from the original's two component folders because the
// bug this check exists for lives wherever a screen shapes what a person
// reads, and `web/lib/use-record-activity.ts` / `web/components/deep-link/
// shape.tsx` (both outside `components/`) turned out to hold exactly that
// shape once the net was actually thrown that wide.
//
// GENUINE EXCEPTIONS EXIST, AND ARE NAMED RATHER THAN ASSUMED AWAY. A
// `dateTime:` key feeds the DOM's own `<time dateTime>` attribute —
// machine-readable, never text a person reads — and every kit part that
// consumes one (`shared/ui/components/{chat,agenda,activity-feed,
// calendar-view}`) pairs it with a SEPARATE, formatted `time`/`timestamp`/
// `label` field for the words a person actually sees. And
// `record-calendar.tsx`'s month heading and weekday names call `Intl`
// directly because `shared/web/format.ts` has no "long month name" or
// "weekday name alone" formatter (`formatMonth` is deliberately the
// short-month AXIS shape) — both pass the reader's own `lang`, never
// `undefined`, which is the one thing that made them a bug in the first
// place. `RAW_DATE_EXEMPT` is that list, one entry per offending line, named
// "path:line" so a file that moves or a line that shifts is caught by the rot
// check below rather than silently kept alive.
//
// The check is still deliberately narrow about what it calls an offence: it
// says nothing about a date used as DATA (a comparison, a sort key, a form
// draft value bound to a `datetime-local` input), which is why `value:` and
// `dateTime:` are the only two keys it watches rather than every object key a
// screen writes — that wider net catches nothing but form drafts
// (`work-logs-panel.tsx`'s `startedAt: values.startedAt` and its siblings),
// which is a different question this file has no business asking.

import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"
import { join } from "node:path"

/** The formatters that make a date readable — all from the one file. A line
 * that calls one of these is never an offence, whatever else is on it.
 *
 * `formatTime` is here because an AGENDA row says the clock time alone under a
 * heading that already said the day.
 *
 * `DateSortable` is here for a reason worth reading: it produces "2026-06-13",
 * which is exactly the shape this check exists to catch. The difference is that
 * it is a decision rather than a leak — a table column somebody clicks to sort
 * has to compare correctly, and the library compares the rendered text
 * (shared/web/format.ts says the rest). Its output being a date and not a
 * timestamp is the visible half of that: no clock, no `T`, no `Z`, nothing that
 * looks like a database row. */
const FORMATTED = /format(DateSortable|DateTime|Date|Time|Relative|ActivityWhen)\s*\(/

// `.toLocaleDateString(`/`.toLocaleTimeString(` are Date-only, so any receiver
// counts. `.toLocaleString(` is shared with Number.prototype (money, byte
// counts, run counts), so it counts ONLY chained straight off a `new
// Date(...)` literal — the exact shape this app's own bugs took.
const RAW_TOLOCALE =
  /\.toLocaleDateString\s*\(|\.toLocaleTimeString\s*\(|new Date\([^)]*\)\.toLocaleString\s*\(/

// This app's own naming convention for a moment (`…At`) or a calendar day
// (`…On`), as a property access — `\.` anchors it to "read off a record",
// never a bare local. Not every hit is a date (a boolean `focusOn` would
// match the same shape); that is what RAW_DATE_EXEMPT is for; none has shown
// up in the two tracked contexts below yet, and a wrongly-flagged field name
// is a one-line, reasoned addition there, same as a genuine exception is.
const DATE_FIELD = "[a-zA-Z_][a-zA-Z0-9_]*(?:At|On)"
const INTERP_DATE = new RegExp(`\\$\\{[^}]*\\.${DATE_FIELD}\\b[^}]*\\}`)
const KEY_DATE = new RegExp(`\\b(?:value|dateTime):\\s*[^,}]*\\.${DATE_FIELD}\\b`)

const REPO_ROOT = join(__dirname, "..", "..")
const ROOTS = [
  join(REPO_ROOT, "web", "components"),
  join(REPO_ROOT, "web", "lib"),
  join(REPO_ROOT, "web-portal", "components"),
  join(REPO_ROOT, "web-portal", "lib"),
  join(REPO_ROOT, "shared", "web"),
]

/** Every reasoned exception to the two derivations above, one entry per
 * offending line. Rot-checked BOTH ways below: a line no longer matching the
 * pattern it was pinned for is a stale exemption, exactly as much a failure
 * as an unlisted offender — so the list can only shrink or stay current. */
const RAW_DATE_EXEMPT: Record<string, string> = {
  "web/components/record-calendar.tsx:149":
    "the month heading needs the reader's own LONG month name + year — " +
    "shared/web/format.ts has no formatter for that shape (formatMonth is " +
    "the short-month AXIS one) — so it calls Intl directly, with the real " +
    "`lang` (this line used to pass `undefined`, which is the bug R1 of this " +
    "pass fixed).",
  "web/components/record-calendar.tsx:159":
    "the weekday headings need the reader's own weekday names alone, and no " +
    "formatter in shared/web/format.ts produces that shape either — Intl " +
    "directly, with the real `lang` (also used to pass `undefined`).",
  "web/lib/use-record-activity.ts:139":
    "`dateTime: a.createdAt` feeds the kit's `<time dateTime>` attribute " +
    "(ActivityFeed's own `dateTime` field) — machine-readable, never text a " +
    "person reads. The line right above it, `timestamp: formatRelative(...)`, " +
    "is the one that is.",
  "web/components/deep-link/shape.tsx:68":
    "same shape as use-record-activity.ts:139 — `dateTime: a.createdAt` " +
    "beside its own already-formatted `timestamp: formatRelative(...)`, one " +
    "line up, for the same `<time dateTime>` attribute.",
  "web/components/work-panels.tsx:1178":
    "`dateTime: todo.completedAt ?? undefined` for a to-do's checklist row, " +
    "beside its own already-formatted `when: todo.completedAt ? t(\"done " +
    "{date}\", ...)` one line up — the `<time dateTime>` attribute again, not " +
    "text.",
}

describe("no screen shows a raw timestamp", () => {
  it("every date put in front of a person goes through shared/web/format", () => {
    const offenders: string[] = []
    const exemptUsed = new Set<string>()
    for (const file of sourceFiles(ROOTS, { extensions: [".ts", ".tsx"], skipTests: true, relativeTo: REPO_ROOT })) {
      if (file.rel === "shared/web/format.ts") continue
      const lines = file.source.split("\n")
      lines.forEach((raw, i) => {
        // Skip anything commented out.
        const line = raw.replace(/\/\/.*$/, "")
        const key = `${file.rel}:${i + 1}`
        const isRaw = RAW_TOLOCALE.test(line)
        const isFieldOffence = !FORMATTED.test(line) && (INTERP_DATE.test(line) || KEY_DATE.test(line))
        if (!isRaw && !isFieldOffence) return
        if (key in RAW_DATE_EXEMPT) {
          exemptUsed.add(key)
          return
        }
        offenders.push(`${key} — ${raw.trim().slice(0, 100)}`)
      })
    }
    expect(
      offenders,
      "these put a raw timestamp on screen — wrap them in formatDate (or formatDateTime when the " +
        "time of day matters), from shared/web/format.ts, or add a reasoned RAW_DATE_EXEMPT entry if " +
        "this is a genuine exception:\n  " + offenders.join("\n  ")
    ).toEqual([])

    // ROT CHECK: an exemption whose line no longer offends is stale — the list
    // may only shrink, never carry dead weight nobody re-reads.
    const stale = Object.keys(RAW_DATE_EXEMPT).filter((k) => !exemptUsed.has(k))
    expect(
      stale,
      "RAW_DATE_EXEMPT entries that no longer match anything — the code moved or was fixed; " +
        "delete the entry:\n  " + stale.join("\n  ")
    ).toEqual([])
  })

  it("the formatter it points at is actually the shared one", () => {
    // A check that names a seam is worth nothing if the seam moves. If this
    // fails, the import path above changed and the scan is looking for a
    // function nobody calls any more.
    const shared = sourceFiles(join(__dirname, "..", "..", "shared", "web"), { extensions: [".ts"] })
    const format = shared.find((f) => f.rel.endsWith("format.ts"))
    expect(format, "shared/web/format.ts has moved — this suite is scanning for the wrong name").toBeTruthy()
    for (const fn of ["formatDate", "formatDateTime", "formatTime"])
      expect(format!.source, `${fn} is gone from the shared formatter`).toContain(`export function ${fn}`)
  })
})
