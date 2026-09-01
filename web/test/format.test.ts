// THE HYDRATION BUG, LOCKED. `formatDate`, `formatDayMonth`, `formatTime`,
// `formatDateTime` and `formatRelative` used to call `toLocaleDateString` /
// `toLocaleTimeString` / `toLocaleString` with `undefined` as the locale —
// which asks `Intl` to resolve the RUNTIME's ambient default locale. That is
// Node's default during server rendering and the browser's during client
// hydration, and the two are not guaranteed to agree, so the same date could
// render "Mar 12, 2024" on the server and "12 Mar 2024" in the browser: a
// React hydration-mismatch error on a plain date, reproduced live when a
// record's `createdAt` fell into `formatRelative`'s absolute-date fallback.
//
// The fix is a REQUIRED `lang: Language` on every one of these five —
// ruling 07 in the kit (`shared/ui/`): "Dates follow the app language, not
// the browser." So the test that locks it in is not "does this render a
// date" (it always did) but "does the SAME instant render two DIFFERENT,
// exact strings for two different `lang` values, deterministically" — which
// is the one thing `undefined` could never do, because `undefined` reads
// whatever the machine running the code happens to be set to. A test that
// still passed `undefined` here would pass in CI while remaining exactly as
// broken; pinning both languages' literal output is what a regression here
// actually looks like.
//
// TIMEZONE, NOT JUST LOCALE. `formatDate`/`formatDayMonth` read only the
// year/month/day, so the fixture below sits at midday UTC — safely the same
// calendar day in every timezone this suite could plausibly run under
// (the sandbox: Europe/Andorra; CI: UTC) — so the assertions are the fix
// being locked, not a timezone rolling the date over at a boundary.

import { describe, expect, it } from "vitest"

import { formatDate, formatDateTime, formatDayMonth, formatRelative, formatTime } from "@shared/web/format"

const NOON_UTC = "2024-03-12T12:00:00.000Z"

describe("formatDate — locale is explicit, never the runtime's ambient default", () => {
  it("renders the exact, different string each of two languages produces for the same instant", () => {
    expect(formatDate(NOON_UTC, "en")).toBe("Mar 12, 2024")
    expect(formatDate(NOON_UTC, "es")).toBe("12 mar 2024")
  })

  it("empty/invalid input renders nothing, regardless of language", () => {
    expect(formatDate(null, "en")).toBe("")
    expect(formatDate(undefined, "es")).toBe("")
    expect(formatDate("not a date", "en")).toBe("")
  })
})

describe("formatDayMonth — the year dropped, the language kept explicit", () => {
  it("renders the exact, different string each of two languages produces for the same instant", () => {
    expect(formatDayMonth(NOON_UTC, "en")).toBe("Mar 12")
    expect(formatDayMonth(NOON_UTC, "es")).toBe("12 mar")
  })
})

describe("formatTime / formatDateTime — same locale rule, TZ-independent shape check", () => {
  // The clock reading itself depends on the machine's timezone (a separate
  // concern from this bug — the SSR/CSR pair share a wall clock either way,
  // just not necessarily a locale), so these assert the LOCALE-driven shape
  // rather than pin an hour: English always carries an AM/PM mark here,
  // Spanish never does — true at any timezone this suite runs under.
  it("formatTime: English is 12-hour with AM/PM, Spanish is 24-hour without", () => {
    const en = formatTime(NOON_UTC, "en")
    const es = formatTime(NOON_UTC, "es")
    expect(en).toMatch(/[AP]M$/)
    expect(es).not.toMatch(/[AP]M$/)
  })

  it("formatDateTime: carries the same date formatDate does, in each language", () => {
    expect(formatDateTime(NOON_UTC, "en")).toContain(formatDate(NOON_UTC, "en"))
    expect(formatDateTime(NOON_UTC, "es")).toContain(formatDate(NOON_UTC, "es"))
  })
})

describe("formatRelative — required lang threaded to its own formatDate fallback", () => {
  const enT = (s: string) => s
  const deT = (s: string, vars?: Record<string, string | number>) =>
    s === "{count}d ago" ? `vor ${vars?.count} Tagen` : s

  it("stays within the relative vocabulary inside a week, lang unused yet", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelative(twoDaysAgo, deT, "de")).toBe("vor 2 Tagen")
  })

  it("past a week, falls back to formatDate IN THE PASSED LANGUAGE — the exact fix", () => {
    const overAWeekAgo = new Date(Date.parse(NOON_UTC) - 400 * 24 * 60 * 60 * 1000).toISOString()
    // Same instant, both languages, through the same fallback: the language
    // argument is what tells the two apart, not an ambient default.
    expect(formatRelative(overAWeekAgo, enT, "en")).toBe(formatDate(overAWeekAgo, "en"))
    expect(formatRelative(overAWeekAgo, enT, "es")).toBe(formatDate(overAWeekAgo, "es"))
    expect(formatRelative(overAWeekAgo, enT, "en")).not.toBe(formatRelative(overAWeekAgo, enT, "es"))
  })
})
