// The keyset-paging seam (R14). Small, but every part of it is load-bearing: a
// cursor that round-trips wrong repeats a page forever, a predicate that drops
// the id tiebreak hides rows that share a timestamp, and a decode that fails
// SOFTLY (returning null) turns "page 4, please" into "here's page 1 again" —
// which looks like working software right up until someone counts.

import { describe, expect, it } from "vitest"

import { GuardError } from "../../../shared/workers/gating"
import { decodeCursor, encodeCursor, keysetAfter, PAGE_SIZE, toPage } from "../../../shared/workers/paging"

describe("keyset paging (R14)", () => {
  it("a cursor round-trips through the query string untouched", () => {
    const c = encodeCursor("2026-08-04T10:00:00.000Z", "01J8ZK3M4N5P6Q7R8S9T0V1W2X")
    expect(c, "must be URL-safe — no +, / or = to be re-encoded").not.toMatch(/[+/=]/)
    expect(decodeCursor(c)).toEqual({ k: "2026-08-04T10:00:00.000Z", id: "01J8ZK3M4N5P6Q7R8S9T0V1W2X" })
    expect(decodeCursor(encodeCursor(null, "abc")), "a null sort value is still a position").toEqual({ k: "", id: "abc" })
  })

  it("no cursor means the first page, not an error", () => {
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor(undefined)).toBeNull()
    expect(decodeCursor("")).toBeNull()
    expect(keysetAfter(null, "created_at")).toEqual({ sql: "", params: [] })
  })

  it("a malformed cursor is a clean 400 — never a silent restart", () => {
    for (const bad of ["not-base64!!", btoa("[]"), btoa('{"k":"x"}'), btoa('{"k":1,"id":"a"}')]) {
      let thrown: unknown
      try {
        decodeCursor(bad)
      } catch (e) {
        thrown = e
      }
      expect(thrown, `"${bad}" must be rejected`).toBeInstanceOf(GuardError)
      expect((thrown as GuardError).status).toBe(400)
    }
  })

  it("the predicate is parameterised and keeps the id tiebreak", () => {
    const after = keysetAfter({ k: "2026-01-01", id: "row9" }, "created_at")
    expect(after.sql).toBe("(created_at < ? OR (created_at = ? AND id < ?))")
    expect(after.params).toEqual(["2026-01-01", "2026-01-01", "row9"])
    expect(after.sql, "the cursor's values must never be interpolated").not.toContain("2026-01-01")
  })

  it("the extra row is what reveals hasMore — and never leaks into the page", () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({ id: `r${i}`, at: `t${i}` }))
    const full = toPage(rows, PAGE_SIZE, (r) => [r.at, r.id])
    expect(full.rows).toHaveLength(PAGE_SIZE)
    expect(full.hasMore).toBe(true)
    expect(decodeCursor(full.nextCursor)).toEqual({ k: `t${PAGE_SIZE - 1}`, id: `r${PAGE_SIZE - 1}` })

    const short = toPage(rows.slice(0, 3), PAGE_SIZE, (r) => [r.at, r.id])
    expect(short.rows).toHaveLength(3)
    expect(short.hasMore).toBe(false)
    expect(short.nextCursor, "a last page must not offer a next one").toBeNull()

    const empty = toPage([] as { id: string; at: string }[], PAGE_SIZE, (r) => [r.at, r.id])
    expect(empty).toEqual({ rows: [], hasMore: false, nextCursor: null })
  })
})
