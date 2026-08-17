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
// The check is deliberately narrow. It looks for a date-shaped field being
// INTERPOLATED into a string or handed to a `value:` — the two shapes that put
// text in front of somebody — and refuses one that no formatter touched. It says
// nothing about a date used as data (a comparison, a sort, a body field), which
// is why it can be this blunt without being noisy.

import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"
import { join } from "node:path"

/** Columns that hold a moment. Named rather than pattern-matched on "At"/"On",
 * so a field like `commercialsVisible` or a variable called `on` can never be
 * dragged in by a clever regex. */
const DATE_FIELDS = [
  "startsOn",
  "endsOn",
  // A STORY'S DEADLINE IS ITS SPRINT'S END DATE (17 Aug 2026: the story's own
  // due date went rather than let two dates disagree about one promise), so the
  // field a story screen renders is this one and it is held to the same rule.
  "sprintEndsOn",
  "dueOn",
  "startsAt",
  "endsAt",
  "completedAt",
  "publishedAt",
  "resolvedAt",
]

/** The formatters that make a date readable — all from the one file. */
const FORMATTED = /format(Date|DateTime|Relative|ActivityWhen)\s*\(/

const ROOTS = [
  join(__dirname, "..", "components"),
  join(__dirname, "..", "..", "web-portal", "components"),
]

describe("no screen shows a raw timestamp", () => {
  it("every date put in front of a person goes through shared/web/format", () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of sourceFiles(root, { extensions: [".tsx", ".ts"] })) {
        const lines = file.source.split("\n")
        lines.forEach((line, i) => {
          // Skip the formatter's own call sites and anything commented out.
          const code = line.replace(/\/\/.*$/, "")
          if (FORMATTED.test(code)) return
          for (const field of DATE_FIELDS) {
            // `${thing.dueOn}` — interpolated straight into a sentence.
            const interpolated = new RegExp(`\\$\\{[^}]*\\.${field}[^}]*\\}`).test(code)
            // `value: thing.dueOn` — handed to an overview row or a field.
            const asValue = new RegExp(`value:\\s*[^,]*\\.${field}\\b`).test(code)
            if (interpolated || asValue)
              offenders.push(`${file.rel}:${i + 1} — ${field} rendered raw: ${code.trim().slice(0, 90)}`)
          }
        })
      }
    }
    expect(
      offenders,
      "these put a raw timestamp on screen — wrap them in formatDate (or formatDateTime when the " +
        "time of day matters), from shared/web/format.ts:\n  " + offenders.join("\n  ")
    ).toEqual([])
  })

  it("the formatter it points at is actually the shared one", () => {
    // A check that names a seam is worth nothing if the seam moves. If this
    // fails, the import path above changed and the scan is looking for a
    // function nobody calls any more.
    const shared = sourceFiles(join(__dirname, "..", "..", "shared", "web"), { extensions: [".ts"] })
    const format = shared.find((f) => f.rel.endsWith("format.ts"))
    expect(format, "shared/web/format.ts has moved — this suite is scanning for the wrong name").toBeTruthy()
    for (const fn of ["formatDate", "formatDateTime"])
      expect(format!.source, `${fn} is gone from the shared formatter`).toContain(`export function ${fn}`)
  })
})
