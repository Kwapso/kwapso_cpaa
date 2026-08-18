// The keyset-paging seam (R14). Small, but every part of it is load-bearing: a
// cursor that round-trips wrong repeats a page forever, a predicate that drops
// the id tiebreak hides rows that share a timestamp, and a decode that fails
// SOFTLY (returning null) turns "page 4, please" into "here's page 1 again" —
// which looks like working software right up until someone counts.

import { describe, expect, it } from "vitest"

import { GuardError } from "@shared/workers/gating"
import { decodeCursor, encodeCursor, keysetAfter, PAGE_SIZE, toPage } from "@shared/workers/paging"

describe("keyset paging (R14)", () => {
  it("a cursor round-trips through the query string untouched", () => {
    const c = encodeCursor("2026-08-04T10:00:00.000Z", "01J8ZK3M4N5P6Q7R8S9T0V1W2X")
    expect(c, "must be URL-safe — no +, / or = to be re-encoded").not.toMatch(/[+/=]/)
    expect(decodeCursor(c)).toEqual({ k: "2026-08-04T10:00:00.000Z", id: "01J8ZK3M4N5P6Q7R8S9T0V1W2X", s: "" })
    expect(decodeCursor(encodeCursor(null, "abc")), "a null sort value is still a position").toEqual({
      k: "",
      id: "abc",
      s: "",
    })
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
    const after = keysetAfter({ k: "2026-01-01", id: "row9", s: "" }, "created_at")
    expect(after.sql).toBe("(created_at < ? OR (created_at = ? AND id < ?))")
    expect(after.params).toEqual(["2026-01-01", "2026-01-01", "row9"])
    expect(after.sql, "the cursor's values must never be interpolated").not.toContain("2026-01-01")
  })

  // SORTING AT THE DOOR (shared/workers/sorting.ts) gave the predicate a second
  // direction, and that half hides rows rather than misplacing them: walking an
  // ASCENDING list with a descending predicate asks for the rows BEFORE the
  // cursor, so the list simply appears to end.
  it("ascending walks the other way — and the id tiebreak turns with it", () => {
    const asc = keysetAfter({ k: "Bergman", id: "row9", s: "name:asc" }, "COALESCE(name, '')", "asc")
    expect(asc.sql).toBe("(COALESCE(name, '') > ? OR (COALESCE(name, '') = ? AND id > ?))")
    expect(asc.params).toEqual(["Bergman", "Bergman", "row9"])
    // A joined read's id is aliased; the tiebreak has to follow it there too.
    const aliased = keysetAfter({ k: "x", id: "r", s: "" }, "s.rank", "desc", "s.id")
    expect(aliased.sql).toBe("(s.rank < ? OR (s.rank = ? AND s.id < ?))")
  })

  // A cursor is a position INSIDE ONE ORDER. Handed to another it does not fail —
  // it silently skips an arbitrary slice and hands back a page that reads like an
  // answer, which is why it is refused rather than tolerated.
  it("a cursor minted under one ordering is refused by another", () => {
    const c = encodeCursor("Bergman", "row9", "name:asc")
    expect(decodeCursor(c, "name:asc"), "its own order still walks").toEqual({
      k: "Bergman",
      id: "row9",
      s: "name:asc",
    })
    for (const [cursor, asked] of [
      [c, ""],
      [c, "name:desc"],
      [c, "created:desc"],
      [encodeCursor("x", "row1"), "name:asc"],
    ] as const) {
      let thrown: unknown
      try {
        decodeCursor(cursor, asked)
      } catch (e) {
        thrown = e
      }
      expect(thrown, `a "${asked}" read must refuse that cursor`).toBeInstanceOf(GuardError)
      expect((thrown as GuardError).status).toBe(400)
    }
    // …and a cursor from before ordering existed IS the default order.
    expect(decodeCursor(encodeCursor("x", "row1"))).toEqual({ k: "x", id: "row1", s: "" })
  })

  it("the extra row is what reveals hasMore — and never leaks into the page", () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({ id: `r${i}`, at: `t${i}` }))
    const full = toPage(rows, PAGE_SIZE, (r) => [r.at, r.id])
    expect(full.rows).toHaveLength(PAGE_SIZE)
    expect(full.hasMore).toBe(true)
    expect(decodeCursor(full.nextCursor)).toEqual({ k: `t${PAGE_SIZE - 1}`, id: `r${PAGE_SIZE - 1}`, s: "" })
    // The minted cursor carries the ordering it is a position inside.
    const sorted = toPage(rows, PAGE_SIZE, (r) => [r.at, r.id], "name:asc")
    expect(decodeCursor(sorted.nextCursor, "name:asc")?.s).toBe("name:asc")

    const short = toPage(rows.slice(0, 3), PAGE_SIZE, (r) => [r.at, r.id])
    expect(short.rows).toHaveLength(3)
    expect(short.hasMore).toBe(false)
    expect(short.nextCursor, "a last page must not offer a next one").toBeNull()

    const empty = toPage([] as { id: string; at: string }[], PAGE_SIZE, (r) => [r.at, r.id])
    expect(empty).toEqual({ rows: [], hasMore: false, nextCursor: null })
  })
})
